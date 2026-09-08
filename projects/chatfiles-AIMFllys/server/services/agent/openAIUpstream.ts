import { AgentUpstreamError, type AgentCompletion, type AgentUpstream } from './agentLoop.js'

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>
type UpstreamConfig = { baseURL: string; apiKey: string; model: string; temperature: number }

async function requestOpenAI(
  config: UpstreamConfig,
  payload: Record<string, unknown>,
  signal: AbortSignal | undefined,
  fetchImpl: FetchLike,
) {
  let response: Response
  try {
    response = await fetchImpl(`${config.baseURL.replace(/\/+$/u, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(config.apiKey ? { authorization: `Bearer ${config.apiKey}` } : {}),
      },
      body: JSON.stringify({ model: config.model, temperature: config.temperature, ...payload }),
      ...(signal ? { signal } : {}),
    })
  } catch {
    throw new AgentUpstreamError('upstream_failed')
  }
  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    if (response.status === 400 && /(?:tool|function)/iu.test(detail)
      && /(?:unsupported|not supported|unknown)/iu.test(detail)) {
      throw new AgentUpstreamError('tools_unsupported')
    }
    throw new AgentUpstreamError('upstream_failed')
  }
  return response
}

function parseCompletion(value: unknown): AgentCompletion | null {
  if (!value || typeof value !== 'object') return null
  const choices = (value as { choices?: unknown }).choices
  if (!Array.isArray(choices) || !choices[0] || typeof choices[0] !== 'object') return null
  const message = (choices[0] as { message?: unknown }).message
  if (!message || typeof message !== 'object') return null
  const raw = message as { content?: unknown; tool_calls?: unknown }
  const content = raw.content === null || raw.content === undefined ? '' : raw.content
  if (typeof content !== 'string') return null
  if (raw.tool_calls !== undefined && !Array.isArray(raw.tool_calls)) return null
  const toolCalls = []
  for (const item of raw.tool_calls ?? []) {
    if (!item || typeof item !== 'object') return null
    const call = item as { id?: unknown; function?: unknown }
    if (typeof call.id !== 'string' || call.id.length > 512 || !call.function || typeof call.function !== 'object') return null
    const fn = call.function as { name?: unknown; arguments?: unknown }
    if (typeof fn.name !== 'string' || !fn.name || fn.name.length > 128 || typeof fn.arguments !== 'string') return null
    if (fn.arguments.length > 32_000) return null
    toolCalls.push({ id: call.id, name: fn.name, arguments: fn.arguments })
  }
  return { content, toolCalls }
}

export function createOpenAIUpstream(config: UpstreamConfig, fetchImpl: FetchLike = fetch): AgentUpstream {
  return async (request) => {
    const response = await requestOpenAI(config, {
      messages: request.messages,
      stream: false,
      ...(request.tools !== undefined ? { tools: request.tools, tool_choice: 'auto' } : {}),
    }, request.signal, fetchImpl)
    let body: unknown
    try { body = await response.json() } catch { throw new AgentUpstreamError('upstream_failed') }
    const completion = parseCompletion(body)
    if (!completion) throw new AgentUpstreamError('upstream_failed')
    return completion
  }
}

export async function streamOpenAIChat(
  config: UpstreamConfig,
  messages: readonly unknown[],
  signal?: AbortSignal,
  fetchImpl: FetchLike = fetch,
) {
  const response = await requestOpenAI(config, { messages, stream: true }, signal, fetchImpl)
  if (!response.body) throw new AgentUpstreamError('upstream_failed')
  return response.body
}
