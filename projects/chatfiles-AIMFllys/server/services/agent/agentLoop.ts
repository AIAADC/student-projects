import type {
  AgentCitation,
  AgentClientTurn,
  AgentContextSummary,
  AgentStreamEvent,
} from '../../../shared/contracts/aiAgent.js'
import type { AgentToolName } from './toolSchemas.js'
import { ToolExecutionError } from './toolRegistry.js'

export type AgentToolCall = { id: string; name: string; arguments: string }
export type AgentCompletion = { content: string; toolCalls: AgentToolCall[] }
export type AgentModelMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  tool_call_id?: string
  tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>
}
export type AgentCompletionRequest = {
  messages: AgentModelMessage[]
  tools?: readonly unknown[]
  signal?: AbortSignal
}
export type AgentUpstream = (request: AgentCompletionRequest) => Promise<AgentCompletion>
export type AgentRegistry = {
  schemas: readonly unknown[]
  execute: (name: AgentToolName | string, args: unknown) => Promise<unknown>
}

export class AgentUpstreamError extends Error {
  constructor(public readonly code: 'tools_unsupported' | 'upstream_failed') { super(code) }
}

export class AgentLoopError extends Error {
  constructor(public readonly code: 'cancelled' | 'tool_call_limit' | 'step_limit' | 'upstream_failed' | 'empty_response') {
    super(code)
    this.name = 'AgentLoopError'
  }
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, stableValue(item)]))
  }
  return value
}

function boundedJson(value: unknown, maximum = 16_000) {
  const serialized = JSON.stringify(value)
  const points = [...serialized]
  return points.length <= maximum
    ? serialized
    : JSON.stringify({ truncated: true, preview: points.slice(0, maximum).join('') })
}

type FoundCitation = AgentCitation

function parsedCitation(value: string) {
  const match = value.match(/^\[(消息|文件):([^\]\s]{1,512})\]$/u)
  return match ? { citation: match[0], kind: match[1] === '消息' ? 'message' as const : 'file' as const, id: match[2] } : null
}

function citations(value: unknown) {
  const found: FoundCitation[] = []
  const seen = new Set<string>()
  const visit = (item: unknown, depth: number) => {
    if (depth > 5 || !item || typeof item !== 'object') return
    if (Array.isArray(item)) {
      for (const child of item) visit(child, depth + 1)
      return
    }
    const record = item as Record<string, unknown>
    if (typeof record.citation === 'string') {
      const parsed = parsedCitation(record.citation)
      if (parsed && !seen.has(parsed.citation)) {
        seen.add(parsed.citation)
        found.push({
          ...parsed,
          ...(typeof record.conversationId === 'string' ? { conversationId: record.conversationId } : {}),
          ...(typeof record.time === 'number' ? { time: record.time } : {}),
          ...(typeof record.title === 'string' ? { title: record.title } : {}),
        })
      }
    }
    for (const child of Object.values(record)) visit(child, depth + 1)
  }
  visit(value, 0)
  const serialized = typeof value === 'string' ? value : JSON.stringify(value)
  for (const match of serialized.matchAll(/\[(消息|文件):([^\]\s]{1,512})\]/gu)) {
    if (!seen.has(match[0])) {
      seen.add(match[0])
      found.push({ citation: match[0], kind: match[1] === '消息' ? 'message' : 'file', id: match[2] })
    }
  }
  return found
}

function checkAbort(signal?: AbortSignal) {
  if (signal?.aborted) throw new AgentLoopError('cancelled')
}

function systemPrompt(input: RunAgentInput) {
  return `你是午夜书斋的只读研究智能体。${input.conversationId ? `当前会话：${input.conversationName || input.conversationId}（ID：${input.conversationId}）。` : ''}
${input.anchorMessageUid ? `当前页面锚点消息：${input.anchorMessageUid}。` : ''}
先用工具检索，再按需取得消息上下文或文档正文。不得编造；结论必须引用工具返回的 [消息:uid] 或 [文件:id]。
当前上下文策略：${input.strategy === 'summary' ? '结构化摘要' : '最近窗口'}。不要输出本地路径、密钥或内部错误。`
}

function initialMessages(input: RunAgentInput): AgentModelMessage[] {
  return [
    { role: 'system', content: systemPrompt(input) },
    ...(input.summary ? [{
      role: 'system' as const,
      content: `较早 AI 研究对话的结构化摘要（仅作导航，事实回答仍须重新调用工具取证）：\n${boundedJson(input.summary)}`,
    }] : []),
    ...input.history.map((turn) => ({ role: turn.role, content: turn.content })),
    { role: 'user', content: input.question },
  ]
}

function finalAnswer(content: string, evidence: Map<string, FoundCitation>) {
  const validInAnswer = citations(content).filter((item) => evidence.has(item.citation))
  if (evidence.size && validInAnswer.length === 0) {
    return `${content.trim()}\n\n来源：${[...evidence.keys()].join(' ')}`
  }
  return content.trim()
}

function emitAnswer(
  answer: string,
  mode: 'agent' | 'fallback',
  strategy: 'recent' | 'summary',
  steps: number,
  evidence: Map<string, FoundCitation>,
  emit: (event: AgentStreamEvent) => void,
  summary?: AgentContextSummary,
  summaryReason?: RunAgentInput['summaryReason'],
) {
  const points = [...answer]
  for (let index = 0; index < points.length; index += 512) {
    emit({ type: 'delta', content: points.slice(index, index + 512).join('') })
  }
  emit({
    type: 'done', mode, strategy, evidenceCount: evidence.size, steps,
    ...(summary ? { summary } : {}),
    ...(summaryReason ? { summaryReason } : {}),
  })
  return { answer, mode, strategy, evidenceCount: evidence.size, steps }
}

function addEvidence(
  value: unknown,
  evidence: Map<string, FoundCitation>,
  emit: (event: AgentStreamEvent) => void,
) {
  for (const item of citations(value)) {
    if (evidence.has(item.citation)) continue
    evidence.set(item.citation, item)
    emit({ type: 'citation', ...item })
  }
}

async function fallback(
  input: RunAgentInput,
  messages: AgentModelMessage[],
  evidence: Map<string, FoundCitation>,
) {
  input.emit({ type: 'step', step: 1, label: '关键词检索降级' })
  input.emit({ type: 'tool', step: 1, name: 'search_messages', status: 'running' })
  const result = await input.registry.execute('search_messages', {
    query: input.question,
    ...(input.conversationId ? { conversationId: input.conversationId } : {}),
    limit: 8,
  })
  addEvidence(result, evidence, input.emit)
  input.emit({ type: 'tool', step: 1, name: 'search_messages', status: 'complete' })
  const response = await input.upstream({
    messages: [
      ...messages.slice(0, -1),
      { role: 'user', content: `${input.question}\n\n以下是本地检索证据，只能据此回答并引用：\n${boundedJson(result)}` },
    ],
    signal: input.signal,
  })
  if (!response.content.trim()) throw new AgentLoopError('empty_response')
  const answer = finalAnswer(response.content, evidence)
  return emitAnswer(answer, 'fallback', input.strategy, 1, evidence, input.emit, input.summary, input.summaryReason)
}

export type RunAgentInput = {
  question: string
  conversationId?: string
  conversationName?: string
  anchorMessageUid?: string
  strategy: 'recent' | 'summary'
  history: readonly AgentClientTurn[]
  summary?: AgentContextSummary
  summaryReason?: 'not_needed' | 'summary_invalid' | 'summary_failed'
  registry: AgentRegistry
  upstream: AgentUpstream
  emit: (event: AgentStreamEvent) => void
  signal?: AbortSignal
}

export async function runAgent(input: RunAgentInput) {
  const messages = initialMessages(input)
  const seenCalls = new Set<string>()
  const evidence = new Map<string, FoundCitation>()
  for (let step = 1; step <= 8; step += 1) {
    checkAbort(input.signal)
    input.emit({ type: 'step', step, label: step === 1 ? '理解问题' : '继续核对证据' })
    let response: AgentCompletion
    try {
      response = await input.upstream({ messages, tools: input.registry.schemas, signal: input.signal })
    } catch (error) {
      if (error instanceof AgentUpstreamError && error.code === 'tools_unsupported' && step === 1) {
        return fallback(input, messages, evidence)
      }
      if (input.signal?.aborted) throw new AgentLoopError('cancelled')
      throw new AgentLoopError('upstream_failed')
    }
    if (response.toolCalls.length > 6) throw new AgentLoopError('tool_call_limit')
    if (!response.toolCalls.length) {
      if (!response.content.trim()) throw new AgentLoopError('empty_response')
      const answer = finalAnswer(response.content, evidence)
      return emitAnswer(answer, 'agent', input.strategy, step, evidence, input.emit, input.summary, input.summaryReason)
    }
    messages.push({
      role: 'assistant',
      content: response.content,
      tool_calls: response.toolCalls.map((call) => ({
        id: call.id, type: 'function', function: { name: call.name, arguments: call.arguments },
      })),
    })
    for (const call of response.toolCalls) {
      checkAbort(input.signal)
      let args: unknown
      try { args = JSON.parse(call.arguments) } catch { args = null }
      const signature = `${call.name}:${JSON.stringify(stableValue(args))}`
      if (seenCalls.has(signature)) {
        input.emit({ type: 'tool', step, name: call.name, status: 'duplicate' })
        messages.push({ role: 'tool', tool_call_id: call.id, content: '{"error":"duplicate_tool_call"}' })
        continue
      }
      seenCalls.add(signature)
      input.emit({ type: 'tool', step, name: call.name, status: 'running' })
      try {
        const result = await input.registry.execute(call.name, args)
        addEvidence(result, evidence, input.emit)
        messages.push({ role: 'tool', tool_call_id: call.id, content: boundedJson(result) })
        input.emit({ type: 'tool', step, name: call.name, status: 'complete' })
      } catch (error) {
        const failure = error instanceof ToolExecutionError && error.code === 'unavailable'
          ? 'unavailable'
          : 'invalid_or_failed_tool_call'
        messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify({ error: failure }) })
        input.emit({ type: 'tool', step, name: call.name, status: 'rejected' })
      }
    }
  }
  throw new AgentLoopError('step_limit')
}
