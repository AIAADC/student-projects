import type { AgentStreamEvent, AgentStreamRequest } from '../types'

const allowed = new Set(['step', 'tool', 'citation', 'delta', 'done', 'error'])

export class AgentStreamError extends Error {
  readonly code: string

  constructor(code: string) {
    super(code)
    this.code = code
    this.name = 'AgentStreamError'
  }
}

function parseFrame(frame: string): AgentStreamEvent | null {
  const data = frame.split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trimStart())
    .join('\n')
  if (!data) return null
  let value: unknown
  try { value = JSON.parse(data) } catch { throw new AgentStreamError('invalid_agent_stream') }
  if (!value || typeof value !== 'object') throw new AgentStreamError('invalid_agent_stream')
  const event = value as { type?: unknown; code?: unknown }
  if (typeof event.type !== 'string' || !allowed.has(event.type)) throw new AgentStreamError('invalid_agent_stream')
  if (event.type === 'error') {
    const code = typeof event.code === 'string' && event.code.length <= 128 ? event.code : 'agent_failed'
    throw new AgentStreamError(code)
  }
  return value as AgentStreamEvent
}

export async function parseAgentEventStream(
  chunks: AsyncIterable<Uint8Array>,
  onEvent: (event: AgentStreamEvent) => void,
) {
  const decoder = new TextDecoder()
  let buffer = ''
  const consume = () => {
    buffer = buffer.replaceAll('\r\n', '\n')
    let boundary = buffer.indexOf('\n\n')
    while (boundary >= 0) {
      const frame = buffer.slice(0, boundary)
      buffer = buffer.slice(boundary + 2)
      const event = parseFrame(frame)
      if (event) {
        onEvent(event)
        if (event.type === 'done') return true
      }
      boundary = buffer.indexOf('\n\n')
    }
    return false
  }
  for await (const chunk of chunks) {
    buffer += decoder.decode(chunk, { stream: true })
    if (consume()) return
  }
  buffer += decoder.decode()
  if (buffer.trim()) buffer += '\n\n'
  consume()
}

async function* responseChunks(body: ReadableStream<Uint8Array>) {
  const reader = body.getReader()
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) return
      yield value
    }
  } finally {
    reader.releaseLock()
  }
}

export async function streamAgent(
  request: AgentStreamRequest,
  onEvent: (event: AgentStreamEvent) => void,
  signal?: AbortSignal,
) {
  const response = await fetch('/api/ai/agent', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(request),
    signal,
  })
  if (!response.ok || !response.body) throw new AgentStreamError('agent_unavailable')
  await parseAgentEventStream(responseChunks(response.body), onEvent)
}
