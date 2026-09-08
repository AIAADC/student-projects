import express, { Router } from 'express'
import { z } from 'zod/v4'

import { streamOpenAIChat } from '../services/agent/openAIUpstream.js'

type StreamConfig = { baseURL: string; apiKey: string; model: string; temperature: number }
type StreamChat = (
  config: StreamConfig,
  messages: readonly { role: 'system' | 'user' | 'assistant'; content: string }[],
  signal?: AbortSignal,
) => Promise<ReadableStream<Uint8Array>>
type AiRouterOptions = { streamChat?: StreamChat }

const boundedText = (maximum: number) => z.string().refine((value) => [...value].length <= maximum)
const requestSchema = z.object({
  baseURL: z.string().trim().min(1).max(2_048),
  apiKey: z.string().max(8_192).default(''),
  model: boundedText(256).refine((value) => Boolean(value.trim())),
  temperature: z.number().min(0).max(2).default(0.6),
  messages: z.array(z.object({
    role: z.enum(['system', 'user', 'assistant']),
    content: boundedText(20_000),
  }).strict()).max(100),
}).strict()

function baseUrl(value: string) {
  try {
    const parsed = new URL(value)
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) return null
    return value.replace(/\/+$/u, '')
  } catch {
    return null
  }
}

const defaultStream: StreamChat = async (config, messages, signal) => (
  await streamOpenAIChat(config, messages, signal)
)

export function createAiRouter(options: AiRouterOptions = {}) {
  const router = Router()
  router.use('/api/ai/chat', express.json({ limit: '2mb' }))
  router.post('/api/ai/chat', async (request, response) => {
    const parsed = requestSchema.safeParse(request.body)
    const normalized = parsed.success ? baseUrl(parsed.data.baseURL) : null
    if (!parsed.success || !normalized) {
      return response.status(400).json({ error: 'Request failed', code: 'invalid_ai_request' })
    }
    const controller = new AbortController()
    response.on('close', () => { if (!response.writableEnded) controller.abort() })
    try {
      const stream = await (options.streamChat ?? defaultStream)(
        { ...parsed.data, baseURL: normalized }, parsed.data.messages, controller.signal,
      )
      response.status(200)
      response.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
      response.setHeader('Cache-Control', 'no-cache, no-store')
      const reader = stream.getReader()
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        response.write(Buffer.from(value))
      }
      return response.end()
    } catch {
      if (!response.headersSent) {
        return response.status(502).json({ error: 'Request failed', code: 'upstream_failed' })
      }
      if (!response.writableEnded) response.end()
      return undefined
    }
  })
  return router
}

export default createAiRouter()
