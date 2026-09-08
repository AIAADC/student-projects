import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync, type DatabaseSync as Database } from 'node:sqlite'
import type { AgentRequestConfig } from '../../../shared/contracts/aiAgent.js'
import { hybridSearch, type HybridSearchResult } from './hybridSearch.js'
import { keywordSearch } from './keywordSearch.js'
import { liveMessageSearch } from './liveMessageSearch.js'
import { readSearchMetadata, validateSearchMetadata } from './searchSchema.js'

type SearchInput = {
  query: string
  conversationId?: string
  sender?: string
  after?: number
  before?: number
  limit: number
}
type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>

function openIndex(projectRoot: string, sourceFingerprint: string) {
  const target = path.join(projectRoot, 'data', 'ai-index.current.db')
  let db: Database | null = null
  try {
    const stat = fs.lstatSync(target)
    if (!stat.isFile() || stat.isSymbolicLink()) return null
    db = new DatabaseSync(target, { readOnly: true, allowExtension: true })
    if (!validateSearchMetadata(db, { sourceFingerprint }).ok) {
      db.close()
      return null
    }
    return db
  } catch {
    try { db?.close() } catch { /* ignore rejected derived index */ }
    return null
  }
}

async function queryEmbedding(config: AgentRequestConfig, query: string, fetchImpl: FetchLike, signal?: AbortSignal) {
  const key = config.embedding.apiKey || config.apiKey
  try {
    const response = await fetchImpl(`${config.embedding.baseURL.replace(/\/+$/u, '')}/embeddings`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(key ? { authorization: `Bearer ${key}` } : {}) },
      body: JSON.stringify({ model: config.embedding.model, input: [query], dimensions: config.embedding.dimensions }),
      signal,
    })
    if (!response.ok) return null
    const body = await response.json() as { data?: Array<{ embedding?: unknown }> }
    const value = body.data?.[0]?.embedding
    if (!Array.isArray(value) || value.length !== config.embedding.dimensions) return null
    const vector = value.map(Number)
    return vector.every(Number.isFinite) && vector.some((part) => part !== 0) ? vector : null
  } catch {
    return null
  }
}

export function createRuntimeSearch(options: {
  wechatDb: Database
  projectRoot: string
  sourceFingerprint: string
  config: AgentRequestConfig
  fetchImpl?: FetchLike
  signal?: AbortSignal
}) {
  const indexDb = openIndex(options.projectRoot, options.sourceFingerprint)
  const fetchImpl = options.fetchImpl ?? fetch
  return {
    async search(input: SearchInput): Promise<HybridSearchResult> {
      if (!indexDb) return liveMessageSearch(options.wechatDb, input)
      const filters = {
        ...(input.conversationId ? { conversationId: input.conversationId } : {}),
        ...(input.sender ? { sender: input.sender } : {}),
        ...(input.after !== undefined ? { after: input.after } : {}),
        ...(input.before !== undefined ? { before: input.before } : {}),
      }
      const metadata = readSearchMetadata(indexDb)
      const vectorConfigured = options.config.embedding.enabled
        && metadata?.embeddingModel === options.config.embedding.model
        && metadata.embeddingDimensions === options.config.embedding.dimensions
      const queryVector = vectorConfigured
        ? await queryEmbedding(options.config, input.query, fetchImpl, options.signal)
        : undefined
      if (!queryVector) {
        return {
          mode: 'keyword-only',
          reason: vectorConfigured ? 'vector_unavailable' : 'not_configured',
          hits: keywordSearch(indexDb, { query: input.query, filters, limit: input.limit }),
        }
      }
      return hybridSearch(indexDb, {
        query: input.query, queryVector, filters, limit: input.limit,
        embeddingModel: options.config.embedding.model,
        embeddingDimensions: options.config.embedding.dimensions,
      })
    },
    close() { indexDb?.close() },
  }
}
