const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

execFileSync('cmd.exe', ['/c', 'npm run build --silent'], { stdio: 'pipe' });

const ENV_KEYS = ['AI_BASE_URL', 'AI_API_KEY', 'AI_MODELS', 'AI_MODEL', 'DEEPSEEK_API_KEY', 'ZHIPU_API_KEY'];

async function withEnv(values, fn) {
  const previous = {};
  for (const key of ENV_KEYS) previous[key] = process.env[key];
  for (const key of ENV_KEYS) delete process.env[key];
  Object.assign(process.env, values);

  try {
    return await fn();
  } finally {
    for (const key of ENV_KEYS) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
}

test('AI env parser supports multiple model ids and active model', () => {
  const { parseAiEnv } = require('../dist/chat/config');

  const parsed = parseAiEnv({
    AI_BASE_URL: 'https://api.example.com/v1',
    AI_API_KEY: 'key-123',
    AI_MODELS: 'model-a, model-b,model-c',
    AI_MODEL: 'model-b',
  });

  assert.equal(parsed.baseUrl, 'https://api.example.com/v1');
  assert.equal(parsed.apiKey, 'key-123');
  assert.deepEqual(parsed.modelIds, ['model-a', 'model-b', 'model-c']);
  assert.equal(parsed.activeModelId, 'model-b');
});

test('writeAiSettings preserves UTF-8 and unrelated env keys', () => {
  const { writeAiSettings } = require('../dist/chat/config');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hi-ai-env-'));
  const envPath = path.join(dir, '.env');
  fs.writeFileSync(envPath, 'EXISTING=保留中文\nAI_MODEL=old\n', 'utf8');

  writeAiSettings(envPath, {
    baseUrl: 'https://api.example.com/v1',
    apiKey: 'secret',
    modelIds: ['alpha', 'beta'],
    activeModelId: 'alpha',
  });

  const env = fs.readFileSync(envPath, 'utf8');
  assert.match(env, /EXISTING=保留中文/);
  assert.match(env, /AI_BASE_URL=https:\/\/api\.example\.com\/v1/);
  assert.match(env, /AI_API_KEY=secret/);
  assert.match(env, /AI_MODELS=alpha,beta/);
  assert.match(env, /AI_MODEL=alpha/);
});

test('configured model registry exposes env models for switching', () => {
  const { getAvailableModels } = require('../dist/chat/models');

  const models = getAvailableModels({
    AI_BASE_URL: 'https://api.example.com/v1',
    AI_MODELS: 'alpha,beta',
    AI_MODEL: 'beta',
  });

  assert.ok(models.some((model) => model.id === 'alpha'));
  assert.ok(models.some((model) => model.id === 'beta'));
  assert.equal(models.find((model) => model.id === 'beta').provider, 'custom');
});

test('provider uses active model from AI_MODEL and supports custom URL ports', () => {
  return withEnv({
    AI_BASE_URL: 'https://example.com:8443/v1/',
    AI_API_KEY: 'test-key',
    AI_MODELS: 'alpha,beta',
    AI_MODEL: 'beta',
  }, () => {
    delete require.cache[require.resolve('../dist/chat/provider')];
    const { getProviderConfig } = require('../dist/chat/provider');
    const provider = getProviderConfig({ id: 'alpha', provider: 'custom' });

    assert.equal(provider.hostname, 'example.com');
    assert.equal(provider.port, '8443');
    assert.equal(provider.path, '/v1/chat/completions');
    assert.equal(provider.key, 'test-key');
    assert.equal(provider.modelId, 'beta');
  });
});

test('AI_MODELS alone does not override built-in providers', () => {
  return withEnv({
    AI_MODELS: 'alpha,beta',
    DEEPSEEK_API_KEY: 'deepseek-key',
  }, () => {
    delete require.cache[require.resolve('../dist/chat/provider')];
    const { getProviderConfig } = require('../dist/chat/provider');
    const provider = getProviderConfig({ id: 'deepseek-v4-flash', provider: 'deepseek' });

    assert.equal(provider.name, 'deepseek');
    assert.equal(provider.key, 'deepseek-key');
    assert.equal(provider.modelId, 'deepseek-v4-flash');
  });
});

test('chatComplete supports local http providers and preserves query strings', async () => {
  let requestedUrl = '';
  const server = http.createServer((req, res) => {
    requestedUrl = req.url;
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { content: 'local-ok' } }] }));
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;

  try {
    await withEnv({
      AI_BASE_URL: `http://127.0.0.1:${port}/v1?source=hi`,
      AI_API_KEY: 'local-key',
      AI_MODEL: 'local-model',
    }, async () => {
      delete require.cache[require.resolve('../dist/chat/provider')];
      const { chatComplete } = require('../dist/chat/provider');
      const result = await chatComplete([{ role: 'user', content: 'ping' }], { id: 'ignored', provider: 'custom' });

      assert.equal(result, 'local-ok');
      assert.equal(requestedUrl, '/v1/chat/completions?source=hi');
    });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('chatCompleteMessage returns tool calls and sends tools to custom providers', async () => {
  let requestBody = {};
  const server = http.createServer((req, res) => {
    req.on('data', (chunk) => {
      requestBody = JSON.parse(String(chunk));
    });
    req.on('end', () => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        choices: [{
          message: {
            role: 'assistant',
            content: '',
            tool_calls: [{
              id: 'call-read',
              type: 'function',
              function: { name: 'read_file', arguments: '{"path":"README.md"}' },
            }],
          },
        }],
      }));
    });
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;

  try {
    await withEnv({
      AI_BASE_URL: `http://127.0.0.1:${port}/v1`,
      AI_API_KEY: 'local-key',
      AI_MODEL: 'local-model',
    }, async () => {
      delete require.cache[require.resolve('../dist/chat/provider')];
      const { chatCompleteMessage } = require('../dist/chat/provider');
      const message = await chatCompleteMessage(
        [{ role: 'user', content: 'read' }],
        { id: 'ignored', provider: 'custom' },
        [{ type: 'function', function: { name: 'read_file', description: 'Read a file', parameters: { type: 'object' } } }]
      );

      assert.equal(requestBody.stream, false);
      assert.equal(requestBody.tools.length, 1);
      assert.equal(message.role, 'assistant');
      assert.equal(message.tool_calls[0].function.name, 'read_file');
    });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('slash command helpers support direct model commands', () => {
  const { parseSlashCommand, resolveModelCommand } = require('../dist/chat/commands');

  assert.deepEqual(parseSlashCommand('/model info'), { command: '/model', args: 'info' });
  assert.deepEqual(resolveModelCommand('info'), { kind: 'info' });
  assert.deepEqual(resolveModelCommand('alpha'), { kind: 'select', modelId: 'alpha' });
});

test('maskApiKey hides secrets while keeping edge hints', () => {
  const { maskApiKey } = require('../dist/chat/config');

  assert.equal(maskApiKey(''), '空');
  assert.equal(maskApiKey('short'), '*****');
  assert.match(maskApiKey('sk-test-key-12345678'), /^sk-t\*+5678$/);
  assert.doesNotMatch(maskApiKey('sk-test-key-12345678'), /test-key/);
});

test('getSelectableModels exposes comma-separated configured ids only', () => {
  const { getSelectableModels } = require('../dist/chat/models');

  const models = getSelectableModels({
    AI_MODELS: 'alpha,beta,custom-one',
    AI_MODEL: 'beta',
  });

  assert.deepEqual(models.map((model) => model.id), ['alpha', 'beta', 'custom-one']);
  assert.equal(models.find((model) => model.id === 'deepseek-v4-flash'), undefined);
  assert.equal(models.find((model) => model.id === 'custom-one').source, 'custom');
});

test('getSelectableModels falls back to built-in catalog when unset', () => {
  const { getSelectableModels, MODELS } = require('../dist/chat/models');

  const models = getSelectableModels({});
  assert.equal(models.length, MODELS.length);
  assert.equal(models[0].source, 'builtin');
});

test('formatModelInfo reports context, tools, multimodal, provider, and source', () => {
  const { formatModelInfo } = require('../dist/chat/commands');
  const { resolveModelInfo } = require('../dist/chat/models');

  const builtin = resolveModelInfo('deepseek-v4-flash');
  const custom = resolveModelInfo('my-model');

  const builtinInfo = formatModelInfo(builtin);
  assert.match(builtinInfo, /上下文/);
  assert.match(builtinInfo, /工具调用/);
  assert.match(builtinInfo, /多模态/);
  assert.match(builtinInfo, /来源: 内置/);
  assert.match(builtinInfo, /OpenAI 兼容: 是/);

  const customInfo = formatModelInfo(custom);
  assert.match(customInfo, /来源: 自定义/);
  assert.match(customInfo, /工具调用: 支持/);
});

test('formatModelOptions lists configured model choices', () => {
  const { formatModelOptions } = require('../dist/chat/commands');
  const { getSelectableModels } = require('../dist/chat/models');

  const models = getSelectableModels({ AI_MODELS: 'alpha,beta', AI_MODEL: 'beta' });
  const options = formatModelOptions(models, 'beta');

  assert.deepEqual(options, ['alpha', 'beta (current)']);
});

test('applyModelSelection rejects unknown configured model ids', () => {
  const { applyModelSelection } = require('../dist/chat/commands');

  assert.throws(
    () => applyModelSelection('missing', {
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'secret',
      modelIds: ['alpha', 'beta'],
      activeModelId: 'alpha',
    }),
    /Unknown model/
  );
});
