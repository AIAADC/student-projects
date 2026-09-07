import express, { Router } from 'express'
import {
  parseAgentContextSummary,
  type AgentClientTurn,
  type AgentRequestConfig,
  type AgentStreamEvent,
  type AgentStreamRequest,
} from '../../shared/contracts/aiAgent.js'
import { AgentLoopError } from '../services/agent/agentLoop.js'

type AgentExecutor = (
  request: AgentStreamRequest,
  emit: (event: AgentStreamEvent) => void,
  signal: AbortSignal,
) => Promise<unknown>

type IndexRebuilder = (config: AgentRequestConfig, signal: AbortSignal) => Promise<unknown>
type AgentRouterOptions = { execute?: AgentExecutor; rebuild?: IndexRebuilder; timeoutMs?: number }
const eventTypes = new Set(['step', 'tool', 'citation', 'delta', 'done', 'error'])

function text(value: unknown, maximum: number, required = false) {
  if (value === undefined && !required) return undefined
  if (typeof value !== 'string' || value.length > maximum || (required && !value.trim())) return null
  return value.trim()
}

function number(value: unknown, minimum: number, maximum: number) {
  return typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum
    ? value
    : null
}

function baseUrl(value: unknown) {
  const normalized = text(value, 2_048, true)
  if (!normalized) return null
  try {
    const url = new URL(normalized)
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password
      ? normalized.replace(/\/+$/u, '')
      : null
  } catch {
    return null
  }
}

function history(value: unknown): AgentClientTurn[] | null {
  if (!Array.isArray(value) || value.length > 60) return null
  const turns: AgentClientTurn[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') return null
    const turn = item as Record<string, unknown>
    if ((turn.role !== 'user' && turn.role !== 'assistant') || typeof turn.content !== 'string') return null
    if (!turn.content.trim() || [...turn.content].length > 20_000) return null
    turns.push({ role: turn.role, content: turn.content })
  }
  return turns
}

export function parseAgentRequest(value: unknown): AgentStreamRequest | null {
  if (!value || typeof value !== 'object') return null
  const input = value as Record<string, unknown>
  const rawConfig = input.config
  if (!rawConfig || typeof rawConfig !== 'object') return null
  const config = rawConfig as Record<string, unknown>
  const embeddingValue = config.embedding
  if (!embeddingValue || typeof embeddingValue !== 'object') return null
  const embedding = embeddingValue as Record<string, unknown>
  const question = text(input.question, 4_000, true)
  const conversationId = text(input.conversationId, 512)
  const conversationName = text(input.conversationName, 512)
  const anchorMessageUid = text(input.anchorMessageUid, 512)
  const turns = history(input.history)
  const contextWindow = number(config.contextWindow, 8_000, 2_000_000)
  const temperature = number(config.temperature, 0, 2)
  const dimensions = number(embedding.dimensions, 1, 8_192)
  const batchSize = number(embedding.batchSize, 1, 256)
  const strategy = config.contextStrategy === 'summary' ? 'summary' : config.contextStrategy === 'recent' ? 'recent' : null
  const model = text(config.model, 256, true)
  const apiKey = text(config.apiKey, 8_192) ?? ''
  const chatBaseURL = baseUrl(config.baseURL)
  const embeddingBaseURL = baseUrl(embedding.baseURL)
  const embeddingModel = text(embedding.model, 256, true)
  const summary = input.summary === undefined ? undefined : parseAgentContextSummary(input.summary)
  if (!question || turns === null || contextWindow === null || temperature === null || dimensions === null || batchSize === null) return null
  if (input.summary !== undefined && !summary) return null
  if (!strategy || !model || !chatBaseURL || !embeddingBaseURL || !embeddingModel || typeof embedding.enabled !== 'boolean') return null
  return {
    question,
    ...(conversationId ? { conversationId } : {}),
    ...(conversationName ? { conversationName } : {}),
    ...(anchorMessageUid ? { anchorMessageUid } : {}),
    history: turns,
    ...(summary ? { summary } : {}),
    config: {
      baseURL: chatBaseURL,
      apiKey,
      model,
      temperature,
      contextWindow,
      contextStrategy: strategy,
      embedding: {
        enabled: embedding.enabled,
        baseURL: embeddingBaseURL,
        apiKey: text(embedding.apiKey, 8_192) ?? '',
        model: embeddingModel,
        dimensions: Math.round(dimensions),
        batchSize: Math.round(batchSize),
      },
    },
  }
}

async function defaultExecutor(
  request: AgentStreamRequest,
  emit: (event: AgentStreamEvent) => void,
  signal: AbortSignal,
) {
  const { executeAgentRuntime } = await import('../services/agent/agentRuntime.js')
  return executeAgentRuntime(request, emit, signal)
}

async function defaultRebuilder(config: AgentRequestConfig, signal: AbortSignal) {
  const { rebuildSearchIndexRuntime } = await import('../services/agent/agentRuntime.js')
  return rebuildSearchIndexRuntime(config, signal)
}

export function createAiAgentRouter(options: AgentRouterOptions = {}) {
  const router = Router()
  router.use(express.json({ limit: '2mb' }))
  router.post('/api/ai/index/rebuild', async (request, response) => {
    const config = parseAgentRequest({ question: 'rebuild', history: [], config: request.body?.config })?.config
    if (!config) return response.status(400).json({ error: 'Request failed', code: 'invalid_index_request' })
    const controller = new AbortController()
    response.on('close', () => { if (!response.writableEnded) controller.abort() })
    try {
      return response.json(await (options.rebuild ?? defaultRebuilder)(config, controller.signal))
    } catch {
      return response.status(503).json({ error: 'Request failed', code: 'index_rebuild_failed' })
    }
  })
  router.post('/api/ai/agent', async (request, response) => {
    const parsed = parseAgentRequest(request.body)
    if (!parsed) return response.status(400).json({ error: 'Request failed', code: 'invalid_agent_request' })
    response.status(200)
    response.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
    response.setHeader('Cache-Control', 'no-cache, no-store')
    response.setHeader('Connection', 'keep-alive')
    response.setHeader('X-Accel-Buffering', 'no')
    response.flushHeaders()
    const controller = new AbortController()
    let timedOut = false
    let terminal = false
    const timeout = setTimeout(() => { timedOut = true; controller.abort() }, options.timeoutMs ?? 90_000)
    response.on('close', () => { if (!response.writableEnded) controller.abort() })
    const emit = (event: AgentStreamEvent) => {
      if (terminal || response.writableEnded || !eventTypes.has(event.type)) return
      response.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
      if (event.type === 'done' || event.type === 'error') terminal = true
    }
    try {
      await (options.execute ?? defaultExecutor)(parsed, emit, controller.signal)
    } catch (error) {
      const code = timedOut
        ? 'agent_timeout'
        : error instanceof AgentLoopError
          ? error.code
          : controller.signal.aborted ? 'cancelled' : 'agent_failed'
      emit({ type: 'error', code })
    } finally {
      clearTimeout(timeout)
      if (!response.writableEnded) response.end()
    }
  })
  return router
}

export default createAiAgentRouter()
