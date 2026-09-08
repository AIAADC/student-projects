import type { DatabaseSync } from 'node:sqlite'
import { load as loadSqliteVec } from 'sqlite-vec'
import { readSearchMetadata } from './searchSchema.js'
import type { RankedSearchHit, SearchChunk, SearchFilters } from './searchTypes.js'

export type VectorExtensionLoader = (db: DatabaseSync) => void
type VectorEntry = { chunkId: string; vector: number[] }
type VectorRow = { chunk_id: string; distance: number }
type StoredVectorRow = { chunk_id: string; vector: Uint8Array }

function validVector(vector: readonly number[], dimensions: number) {
  return vector.length === dimensions && vector.every(Number.isFinite) && vector.some((value) => value !== 0)
}

function floatBytes(vector: readonly number[]) {
  const values = Float32Array.from(vector)
  return Buffer.from(values.buffer, values.byteOffset, values.byteLength)
}

function floatValues(bytes: Uint8Array) {
  const copy = Uint8Array.from(bytes)
  return new Float32Array(copy.buffer)
}

function loadExtension(db: DatabaseSync, loader: VectorExtensionLoader) {
  loader(db)
}

function ensureVectorTable(db: DatabaseSync, dimensions: number) {
  const existed = Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='search_vec'").get())
  db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS search_vec USING vec0(
    chunk_id TEXT PRIMARY KEY, embedding float[${dimensions}] distance_metric=cosine
  )`)
  if (existed) return
  const insert = db.prepare('INSERT INTO search_vec(chunk_id,embedding) VALUES(?,?)')
  const stored = db.prepare('SELECT chunk_id,vector FROM search_vectors ORDER BY chunk_id').all() as StoredVectorRow[]
  for (const row of stored) insert.run(row.chunk_id, floatValues(row.vector))
}

export function insertSearchVectors(
  db: DatabaseSync,
  input: { model: string; dimensions: number; entries: readonly VectorEntry[] },
  loader: VectorExtensionLoader = loadSqliteVec,
) {
  const metadata = readSearchMetadata(db)
  if (
    !metadata
    || metadata.embeddingModel !== input.model
    || metadata.embeddingDimensions !== input.dimensions
  ) throw new Error('embedding_mismatch')
  if (input.entries.some((entry) => !validVector(entry.vector, input.dimensions))) {
    throw new Error('invalid_embedding_vector')
  }
  loadExtension(db, loader)
  ensureVectorTable(db, input.dimensions)
  const stored = db.prepare('INSERT INTO search_vectors(chunk_id,model,dimensions,vector) VALUES(?,?,?,?)')
  const indexed = db.prepare('INSERT INTO search_vec(chunk_id,embedding) VALUES(?,?)')
  db.exec('BEGIN IMMEDIATE')
  try {
    for (const entry of input.entries) {
      stored.run(entry.chunkId, input.model, input.dimensions, floatBytes(entry.vector))
      indexed.run(entry.chunkId, Float32Array.from(entry.vector))
    }
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

function parseSenders(value: string) {
  try {
    const parsed: unknown = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []
  } catch {
    return []
  }
}

function hydrate(db: DatabaseSync, chunkId: string): SearchChunk | null {
  const row = db.prepare('SELECT * FROM search_chunks WHERE chunk_id=?').get(chunkId) as Record<string, unknown> | undefined
  if (!row) return null
  return {
    chunkId: String(row.chunk_id), conversationId: String(row.conversation_id),
    firstMessageUid: String(row.first_message_uid), lastMessageUid: String(row.last_message_uid),
    firstSequence: Number(row.first_sequence), lastSequence: Number(row.last_sequence),
    startTime: Number(row.start_time), endTime: Number(row.end_time),
    senderIds: parseSenders(String(row.sender_ids)), text: String(row.text),
    ngrams: String(row.ngrams), tokenCount: Number(row.token_count),
  }
}

function matchesFilters(chunk: SearchChunk, filters: SearchFilters) {
  return (!filters.conversationId || chunk.conversationId === filters.conversationId)
    && (!filters.sender || chunk.senderIds.includes(filters.sender))
    && (filters.after === undefined || chunk.endTime >= filters.after)
    && (filters.before === undefined || chunk.startTime <= filters.before)
}

export function vectorSearch(
  db: DatabaseSync,
  queryVector: readonly number[],
  input: { filters?: SearchFilters; limit?: number },
  loader: VectorExtensionLoader = loadSqliteVec,
): { available: boolean; hits: RankedSearchHit[]; reason?: 'vector_unavailable' } {
  const metadata = readSearchMetadata(db)
  const dimensions = metadata?.embeddingDimensions
  if (!dimensions || !validVector(queryVector, dimensions)) throw new Error('embedding_mismatch')
  try {
    loadExtension(db, loader)
    ensureVectorTable(db, dimensions)
  } catch {
    return { available: false, hits: [], reason: 'vector_unavailable' }
  }
  const limit = Math.max(1, Math.min(input.limit ?? input.filters?.limit ?? 20, 100))
  const candidates = Math.min(Math.max(limit * 8, 20), 200)
  let rows: VectorRow[]
  try {
    rows = db.prepare(`
      SELECT chunk_id,distance FROM search_vec
      WHERE embedding MATCH ? AND k=? ORDER BY distance
    `).all(Float32Array.from(queryVector), candidates) as VectorRow[]
  } catch {
    return { available: false, hits: [], reason: 'vector_unavailable' }
  }
  const hits: RankedSearchHit[] = []
  for (const row of rows.sort((left, right) => left.distance - right.distance || left.chunk_id.localeCompare(right.chunk_id))) {
    const chunk = hydrate(db, row.chunk_id)
    if (!chunk || !matchesFilters(chunk, input.filters ?? {})) continue
    hits.push({ ...chunk, rank: hits.length + 1, score: 1 - row.distance, source: 'vector' })
    if (hits.length === limit) break
  }
  return { available: true, hits }
}
