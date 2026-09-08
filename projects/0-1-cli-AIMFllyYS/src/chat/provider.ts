import * as http from 'http';
import * as https from 'https';
import { StringDecoder } from 'string_decoder';
import { ChatMessage, ModelInfo } from '../types';
import { parseAiEnv } from './config';

// Shared agent with keep-alive for connection reuse, limited sockets
const sharedHttpsAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 3,
  maxFreeSockets: 1,
  timeout: 30000,
});

const sharedHttpAgent = new http.Agent({
  keepAlive: true,
  maxSockets: 3,
  maxFreeSockets: 1,
  timeout: 30000,
});

interface StreamCallbacks {
  onToken: (token: string) => void;
  onDone: (full: string) => void;
  onError: (err: Error) => void;
  onReasoning?: (token: string) => void;
}

export interface StreamHandle {
  abort: () => void;
}

interface ProviderSpec {
  name: string;
  protocol?: 'http:' | 'https:';
  hostname: string;
  port?: string;
  path: string;
  key: string;
  modelId: string;
}

export function getProviderConfig(model: Pick<ModelInfo, 'id' | 'provider'>): ProviderSpec {
  const settings = parseAiEnv(process.env);
  const customBaseUrl = settings.baseUrl;
  const customKey = settings.apiKey;
  const customModel = settings.activeModelId;
  const hasCustomOverride = Boolean(process.env.AI_BASE_URL || process.env.AI_API_KEY || process.env.AI_MODEL || model.provider === 'custom');
  const deepseekKey = process.env.DEEPSEEK_API_KEY || '';
  const zhipuKey = process.env.ZHIPU_API_KEY || '';

  if (hasCustomOverride) {
    const parsed = new URL(customBaseUrl || 'https://api.openai.com/v1');
    let apiPath = parsed.pathname.replace(/\/$/, '');
    if (!apiPath.endsWith('/chat/completions')) {
      apiPath += '/chat/completions';
    }
    return {
      name: 'custom',
      protocol: parsed.protocol as 'http:' | 'https:',
      hostname: parsed.hostname,
      port: parsed.port,
      path: apiPath + parsed.search,
      key: customKey,
      modelId: customModel || model.id,
    };
  }

  if (model.provider === 'zhipu') {
    return {
      name: 'zhipu',
      protocol: 'https:',
      hostname: 'open.bigmodel.cn',
      path: '/api/paas/v4/chat/completions',
      key: zhipuKey,
      modelId: model.id,
    };
  }
  return {
    name: 'deepseek',
    protocol: 'https:',
    hostname: 'api.deepseek.com',
    path: '/chat/completions',
    key: deepseekKey,
    modelId: model.id,
  };
}

function requestForProvider(provider: ProviderSpec) {
  const requestModule = provider.protocol === 'http:' ? http : https;
  const agent = provider.protocol === 'http:' ? sharedHttpAgent : sharedHttpsAgent;
  return { request: requestModule.request, agent };
}

export function shouldAttachProviderTools(
  model: Pick<ModelInfo, 'provider'>,
  provider: Pick<ProviderSpec, 'name'>,
  tools?: unknown[],
): boolean {
  return Boolean(
    tools &&
    tools.length > 0 &&
    (provider.name === 'custom' || model.provider === 'zhipu'),
  );
}

/**
 * Streaming chat completion - works for both DeepSeek and ZhiPu
 */
export function streamChat(
  messages: ChatMessage[],
  model: ModelInfo,
  callbacks: StreamCallbacks,
  tools?: any[]
): StreamHandle {
  const provider = getProviderConfig(model);

  if (!provider.key) {
    const name = provider.name === 'custom' ? 'AI_API_KEY' : model.provider === 'zhipu' ? 'ZHIPU_API_KEY' : 'DEEPSEEK_API_KEY';
    callbacks.onError(new Error(`${name} 未配置，请检查 .env 文件`));
    return { abort: () => undefined };
  }

  const body: any = {
    model: provider.modelId,
    messages,
    stream: true,
    max_tokens: 4096,
  };

  if (shouldAttachProviderTools(model, provider, tools)) {
    body.tools = tools;
  }

  const data = JSON.stringify(body);

  const transport = requestForProvider(provider);
  const req = transport.request({
    hostname: provider.hostname,
    port: provider.port,
    path: provider.path,
    method: 'POST',
    agent: transport.agent,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + provider.key,
      'Content-Length': Buffer.byteLength(data),
      'Accept': 'text/event-stream',
    },
  }, (res) => {
    let full = '';
    let buffer = '';
    let done = false;
    const decoder = new StringDecoder('utf8');

    if (res.statusCode && res.statusCode >= 400) {
      const errDecoder = new StringDecoder('utf8');
      let errBody = '';
      res.on('data', (c: Buffer) => { errBody += errDecoder.write(c); });
      res.on('end', () => {
        errBody += errDecoder.end();
        try {
          const parsed = JSON.parse(errBody);
          const msg = parsed.error?.message || `API ${res.statusCode}`;
          if (res.statusCode === 401) {
            callbacks.onError(new Error('API Key 无效或已过期，请检查 .env 文件'));
          } else {
            callbacks.onError(new Error(msg));
          }
        } catch {
          callbacks.onError(new Error(`API 错误 ${res.statusCode}`));
        }
      });
      return;
    }

    res.on('data', (chunk: Buffer) => {
      buffer += decoder.write(chunk);
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (done) return;
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        const payload = trimmed.slice(6);
        if (payload === '[DONE]') {
          done = true;
          callbacks.onDone(full);
          return;
        }
        try {
          const parsed = JSON.parse(payload);
          const delta = parsed.choices?.[0]?.delta;
          if (!delta) continue;

          if (delta.reasoning_content && callbacks.onReasoning) {
            callbacks.onReasoning(delta.reasoning_content);
          }

          if (delta.content) {
            full += delta.content;
            callbacks.onToken(delta.content);
          }
        } catch { /* skip malformed chunks */ }
      }
    });

    res.on('end', () => {
      buffer += decoder.end();
      if (done) return;
      if (buffer.trim()) {
        const trimmed = buffer.trim();
        if (trimmed.startsWith('data: ') && trimmed.slice(6) !== '[DONE]') {
          try {
            const parsed = JSON.parse(trimmed.slice(6));
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              full += content;
              callbacks.onToken(content);
            }
          } catch { /* ignore */ }
        }
      }
      callbacks.onDone(full);
    });
  });

  req.on('error', (e) => callbacks.onError(e));
  req.setTimeout(30000, () => {
    req.destroy();
    callbacks.onError(new Error('请求超时 (30s)'));
  });
  req.write(data);
  req.end();

  return {
    abort: () => req.destroy(new Error('Request cancelled')),
  };
}

/**
 * Non-streaming chat (for simple calls)
 */
export function chatComplete(messages: ChatMessage[], model: ModelInfo, tools?: any[]): Promise<string> {
  return chatCompleteMessage(messages, model, tools).then((message) => message.content || '');
}

export function chatCompleteMessage(messages: ChatMessage[], model: ModelInfo, tools?: any[]): Promise<ChatMessage> {
  return new Promise((resolve, reject) => {
    const provider = getProviderConfig(model);

    if (!provider.key) {
      const name = provider.name === 'custom' ? 'AI_API_KEY' : model.provider === 'zhipu' ? 'ZHIPU_API_KEY' : 'DEEPSEEK_API_KEY';
      reject(new Error(`${name} 未配置，请检查 .env 文件`));
      return;
    }

    const body: any = { model: provider.modelId, messages, stream: false, max_tokens: 4096 };
    if (shouldAttachProviderTools(model, provider, tools)) {
      body.tools = tools;
    }
    const data = JSON.stringify(body);

    const transport = requestForProvider(provider);
    const req = transport.request({
      hostname: provider.hostname,
      port: provider.port,
      path: provider.path,
      method: 'POST',
      agent: transport.agent,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + provider.key,
        'Content-Length': Buffer.byteLength(data),
      },
    }, (res) => {
      const resDecoder = new StringDecoder('utf8');
      let responseData = '';
      res.on('data', (c: Buffer) => { responseData += resDecoder.write(c); });
      res.on('end', () => {
        responseData += resDecoder.end();
        try {
          const parsed = JSON.parse(responseData);
          if (parsed.error) {
            reject(new Error(parsed.error.message || 'API Error'));
            return;
          }
          const message = parsed.choices?.[0]?.message || {};
          resolve({
            role: 'assistant',
            content: typeof message.content === 'string' ? message.content : '',
            tool_calls: Array.isArray(message.tool_calls) ? message.tool_calls : undefined,
          });
        } catch {
          reject(new Error('响应解析失败'));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error('请求超时 (30s)'));
    });
    req.write(data);
    req.end();
  });
}
