import {
  MAX_CONTEXT_WINDOW,
  MIN_CONTEXT_WINDOW,
} from '../../shared/ai/context'
import type { AIContextStrategy } from '../../shared/ai/context'

export { MAX_CONTEXT_WINDOW, MIN_CONTEXT_WINDOW, estimateTokens } from '../../shared/ai/context'
export type { AIContextStrategy } from '../../shared/ai/context'

export interface EmbeddingConfig {
  enabled: boolean
  baseURL: string
  apiKey: string
  model: string
  dimensions: number
  batchSize: number
}

export interface AIConfig {
  baseURL: string
  apiKey: string
  model: string
  contextWindow: number
  contextStrategy: AIContextStrategy
  embedding: EmbeddingConfig
  /** Transitional raw-context cap for the legacy dock. */
  threshold: number
  temperature: number
}

export interface ChatTurn {
  role: 'system' | 'user' | 'assistant'
  content: string
}

const KEY = 'chatfiles.ai.config'

export const MIN_THRESHOLD = Math.floor(MIN_CONTEXT_WINDOW * 0.7)
export const MAX_THRESHOLD = Math.floor(MAX_CONTEXT_WINDOW * 0.7)

export const DEFAULT_AI_CONFIG: AIConfig = {
  baseURL: 'https://api.openai.com/v1',
  apiKey: '',
  model: 'gpt-4o-mini',
  contextWindow: 128_000,
  contextStrategy: 'recent',
  embedding: {
    enabled: false,
    baseURL: 'https://api.openai.com/v1',
    apiKey: '',
    model: 'text-embedding-3-small',
    dimensions: 1_536,
    batchSize: 64,
  },
  threshold: 89_600,
  temperature: 0.6,
}

function clampNumber(value: unknown, fallback: number, minimum: number, maximum: number) {
  const number = typeof value === 'number' && Number.isFinite(value) ? value : fallback
  return Math.min(maximum, Math.max(minimum, number))
}

function text(value: unknown, fallback: string) {
  return typeof value === 'string' ? value.trim() : fallback
}

function baseUrl(value: unknown, fallback: string) {
  return text(value, fallback).replace(/\/+$/u, '')
}

export function normalizeAIConfig(value: unknown): AIConfig {
  const candidate = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  const legacyWindow = typeof candidate.threshold === 'number' ? candidate.threshold : DEFAULT_AI_CONFIG.contextWindow
  const contextWindow = Math.round(clampNumber(
    candidate.contextWindow,
    legacyWindow,
    MIN_CONTEXT_WINDOW,
    MAX_CONTEXT_WINDOW,
  ))
  const rawEmbedding = candidate.embedding && typeof candidate.embedding === 'object'
    ? candidate.embedding as Record<string, unknown>
    : {}
  const embedding: EmbeddingConfig = {
    enabled: rawEmbedding.enabled === true,
    baseURL: baseUrl(rawEmbedding.baseURL, DEFAULT_AI_CONFIG.embedding.baseURL),
    apiKey: text(rawEmbedding.apiKey, DEFAULT_AI_CONFIG.embedding.apiKey),
    model: text(rawEmbedding.model, DEFAULT_AI_CONFIG.embedding.model),
    dimensions: Math.round(clampNumber(rawEmbedding.dimensions, DEFAULT_AI_CONFIG.embedding.dimensions, 1, 8_192)),
    batchSize: Math.round(clampNumber(rawEmbedding.batchSize, DEFAULT_AI_CONFIG.embedding.batchSize, 1, 256)),
  }
  return {
    baseURL: baseUrl(candidate.baseURL, DEFAULT_AI_CONFIG.baseURL),
    apiKey: text(candidate.apiKey, DEFAULT_AI_CONFIG.apiKey),
    model: text(candidate.model, DEFAULT_AI_CONFIG.model),
    contextWindow,
    contextStrategy: candidate.contextStrategy === 'summary' ? 'summary' : 'recent',
    embedding,
    threshold: Math.floor(contextWindow * 0.7),
    temperature: clampNumber(candidate.temperature, DEFAULT_AI_CONFIG.temperature, 0, 2),
  }
}

export function loadAIConfig(): AIConfig {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return normalizeAIConfig(DEFAULT_AI_CONFIG)
    return normalizeAIConfig(JSON.parse(raw))
  } catch {
    return normalizeAIConfig(DEFAULT_AI_CONFIG)
  }
}

export function saveAIConfig(cfg: AIConfig): void {
  localStorage.setItem(KEY, JSON.stringify(normalizeAIConfig(cfg)))
}

export function isConfigured(cfg: AIConfig): boolean {
  return Boolean(cfg.baseURL.trim() && cfg.model.trim())
}

/* ---- per-conversation chat history (localStorage) ----------------------- */
const HISTORY_KEY = (convId: string) => `chatfiles.ai.history.${convId}`
const MAX_HISTORY = 60

export function loadHistory(convId: string): ChatTurn[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY(convId))
    const arr = raw ? JSON.parse(raw) : []
    return Array.isArray(arr) ? (arr as ChatTurn[]) : []
  } catch {
    return []
  }
}

export function saveHistory(convId: string, turns: ChatTurn[]): void {
  try {
    const kept = turns.filter((t) => t.content.trim()).slice(-MAX_HISTORY)
    if (kept.length) localStorage.setItem(HISTORY_KEY(convId), JSON.stringify(kept))
    else localStorage.removeItem(HISTORY_KEY(convId))
  } catch {
    /* quota — ignore */
  }
}

export function clearHistory(convId: string): void {
  try {
    localStorage.removeItem(HISTORY_KEY(convId))
  } catch {
    /* ignore */
  }
}

/* ---- floating dock size (localStorage) ---------------------------------- */
export interface DockSize {
  w: number
  h: number
}

export function loadDockSize(): DockSize {
  try {
    const raw = localStorage.getItem('chatfiles.ai.docksize')
    const s = raw ? JSON.parse(raw) : null
    if (s && typeof s.w === 'number' && typeof s.h === 'number') return s as DockSize
  } catch {
    /* ignore */
  }
  return { w: 420, h: 560 }
}

export function saveDockSize(size: DockSize): void {
  try {
    localStorage.setItem('chatfiles.ai.docksize', JSON.stringify(size))
  } catch {
    /* ignore */
  }
}

/**
 * Stream a completion through the local proxy (`/api/ai/chat`). The proxy
 * forwards the key upstream without persisting it. `onDelta` receives token
 * chunks as they arrive.
 */
export async function streamChat(
  cfg: AIConfig,
  messages: ChatTurn[],
  onDelta: (chunk: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch('/api/ai/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      baseURL: cfg.baseURL,
      apiKey: cfg.apiKey,
      model: cfg.model,
      temperature: cfg.temperature,
      messages,
    }),
    signal,
  })
  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => '')
    throw new Error(`AI 请求失败 (${res.status})${detail ? ' · ' + detail.slice(0, 280) : ''}`)
  }
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    const parts = buf.split('\n')
    buf = parts.pop() ?? ''
    for (const raw of parts) {
      const line = raw.trim()
      if (!line.startsWith('data:')) continue
      const data = line.slice(5).trim()
      if (data === '[DONE]') return
      try {
        const json = JSON.parse(data)
        const delta = json?.choices?.[0]?.delta?.content
        if (delta) onDelta(delta)
      } catch {
        /* keep-alive / split frame — ignore */
      }
    }
  }
}
