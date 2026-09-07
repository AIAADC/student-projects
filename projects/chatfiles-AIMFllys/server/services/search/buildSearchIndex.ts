import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { load as loadSqliteVec } from 'sqlite-vec'
import { createMessageChunker } from './chunkMessages.js'
import {
  activateSearchIndex,
  createSearchSchema,
  insertSearchChunks,
  readSearchMetadata,
} from './searchSchema.js'
import type { SearchChunk, SearchMessage } from './searchTypes.js'
import { insertSearchVectors, type VectorExtensionLoader } from './vectorSearch.js'
import { inspectMessageStorage, stableMessageUid } from '../../wechat/legacyMessageIdentity.js'

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>
type EmbeddingBuildConfig = {
  baseURL: string
  apiKey: string
  model: string
  dimensions: number
  batchSize: number
}
type SourceRow = {
  conv_id: string
  message_uid: string | null
  sequence: number
  time: number
  legacy_rowid: number
  sender: string
  sender_name: string
  text: string
}

function safePaths(stagingPath: string, currentPath: string) {
  const staging = path.resolve(stagingPath)
  const current = path.resolve(currentPath)
  if (staging === current || path.dirname(staging) !== path.dirname(current)) throw new Error('invalid_index_paths')
  fs.mkdirSync(path.dirname(current), { recursive: true })
  if (fs.existsSync(staging)) {
    if (!fs.statSync(staging).isFile()) throw new Error('invalid_staging_path')
    fs.rmSync(staging)
  }
  return { staging, current }
}

function sourceMessage(row: SourceRow, hasMessageUid: boolean): SearchMessage {
  return {
    conversationId: row.conv_id,
    messageUid: stableMessageUid(row, hasMessageUid),
    sequence: Number(row.sequence),
    time: Number(row.time),
    sender: row.sender ?? '',
    senderName: row.sender_name ?? '',
    text: row.text ?? '',
  }
}

function insertSourceChunks(sourceDb: DatabaseSync, indexDb: DatabaseSync) {
  const storage = inspectMessageStorage(sourceDb)
  const canonical = storage.canonical
  const sequence = canonical ? 'canonical_seq AS sequence' : 'seq AS sequence'
  const time = canonical ? 'occurred_at_epoch_s AS time' : 'time'
  const messageUid = storage.hasMessageUid ? 'message_uid' : 'NULL AS message_uid'
  const order = canonical
    ? 'conv_id,canonical_seq'
    : storage.messageUidGuaranteed
      ? 'conv_id,time,message_uid,rowid'
      : 'conv_id,time,seq,rowid'
  const statement = sourceDb.prepare(`SELECT conv_id,${messageUid},${sequence},${time},
    rowid AS legacy_rowid,sender,sender_name,text
    FROM messages WHERE text IS NOT NULL AND trim(text)<>'' ORDER BY ${order}`)
  let conversation = ''
  let chunker = createMessageChunker()
  let buffered: SearchChunk[] = []
  let messageCount = 0
  const flush = () => {
    if (!buffered.length) return
    insertSearchChunks(indexDb, buffered)
    buffered = []
  }
  for (const raw of statement.iterate() as Iterable<SourceRow>) {
    if (conversation && raw.conv_id !== conversation) {
      buffered.push(...chunker.finish())
      chunker = createMessageChunker()
    }
    conversation = raw.conv_id
    buffered.push(...chunker.push(sourceMessage(raw, storage.hasMessageUid)))
    messageCount += 1
    if (buffered.length >= 200) flush()
  }
  buffered.push(...chunker.finish())
  flush()
  return messageCount
}

function validEmbeddingData(value: unknown, count: number, dimensions: number) {
  if (!value || typeof value !== 'object') return null
  const data = (value as { data?: unknown }).data
  if (!Array.isArray(data) || data.length !== count) return null
  const ordered = [...data].sort((left, right) => (
    Number((left as { index?: unknown }).index) - Number((right as { index?: unknown }).index)
  ))
  const vectors: number[][] = []
  for (let index = 0; index < ordered.length; index += 1) {
    const item = ordered[index] as { index?: unknown; embedding?: unknown }
    if (item.index !== index || !Array.isArray(item.embedding) || item.embedding.length !== dimensions) return null
    const vector = item.embedding.map(Number)
    if (!vector.every(Number.isFinite) || !vector.some((part) => part !== 0)) return null
    vectors.push(vector)
  }
  return vectors
}

async function requestEmbeddings(
  fetchImpl: FetchLike,
  config: EmbeddingBuildConfig,
  input: string[],
  signal?: AbortSignal,
) {
  const response = await fetchImpl(`${config.baseURL.replace(/\/+$/u, '')}/embeddings`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(config.apiKey ? { authorization: `Bearer ${config.apiKey}` } : {}),
    },
    body: JSON.stringify({ model: config.model, input, dimensions: config.dimensions }),
    signal,
  })
  if (!response.ok) throw new Error('embedding_request_failed')
  const vectors = validEmbeddingData(await response.json(), input.length, config.dimensions)
  if (!vectors) throw new Error('embedding_response_invalid')
  return vectors
}

async function embedChunks(
  db: DatabaseSync,
  config: EmbeddingBuildConfig,
  fetchImpl: FetchLike,
  loader: VectorExtensionLoader,
  signal?: AbortSignal,
) {
  const rows = db.prepare('SELECT chunk_id,text FROM search_chunks ORDER BY id').iterate() as Iterable<{ chunk_id: string; text: string }>
  let batch: Array<{ chunkId: string; text: string }> = []
  const flush = async () => {
    if (!batch.length) return
    const vectors = await requestEmbeddings(fetchImpl, config, batch.map((item) => item.text), signal)
    try {
      insertSearchVectors(db, {
        model: config.model,
        dimensions: config.dimensions,
        entries: batch.map((item, index) => ({ chunkId: item.chunkId, vector: vectors[index] })),
      }, loader)
    } finally {
      for (const vector of vectors) vector.fill(0)
      batch = []
    }
  }
  for (const row of rows) {
    batch.push({ chunkId: row.chunk_id, text: row.text })
    if (batch.length >= config.batchSize) await flush()
  }
  await flush()
}

function validateBuiltIndex(db: DatabaseSync, expectVectors: boolean) {
  const metadata = readSearchMetadata(db)
  const chunkCount = Number((db.prepare('SELECT count(*) AS count FROM search_chunks').get() as { count: number }).count)
  const vectorCount = Number((db.prepare('SELECT count(*) AS count FROM search_vectors').get() as { count: number }).count)
  const integrity = db.prepare('PRAGMA integrity_check').get() as { integrity_check?: string }
  if (!metadata || metadata.chunkCount !== chunkCount || integrity.integrity_check !== 'ok') throw new Error('index_validation_failed')
  if (expectVectors && vectorCount !== chunkCount) throw new Error('vector_count_mismatch')
  return chunkCount
}

export async function buildSearchIndex(options: {
  sourceDb: DatabaseSync
  sourceFingerprint: string
  stagingPath: string
  currentPath: string
  embedding?: EmbeddingBuildConfig
  fetchImpl?: FetchLike
  loadVectorExtension?: VectorExtensionLoader
  signal?: AbortSignal
}) {
  if (!options.sourceFingerprint) throw new Error('source_fingerprint_required')
  const paths = safePaths(options.stagingPath, options.currentPath)
  const loader = options.loadVectorExtension ?? loadSqliteVec
  const indexDb = new DatabaseSync(paths.staging, { allowExtension: true })
  let mode: 'hybrid' | 'keyword-only' = 'keyword-only'
  try {
    createSearchSchema(indexDb, {
      sourceFingerprint: options.sourceFingerprint,
      embeddingModel: options.embedding?.model ?? null,
      embeddingDimensions: options.embedding?.dimensions ?? null,
    })
    const sourceMessageCount = insertSourceChunks(options.sourceDb, indexDb)
    let vectorReady = Boolean(options.embedding)
    if (vectorReady) {
      try { loader(indexDb) } catch { vectorReady = false }
    }
    if (options.embedding && vectorReady) {
      await embedChunks(indexDb, options.embedding, options.fetchImpl ?? fetch, loader, options.signal)
      mode = 'hybrid'
    } else if (options.embedding) {
      indexDb.prepare('UPDATE search_metadata SET embedding_model=NULL,embedding_dimensions=NULL WHERE singleton=1').run()
    }
    const chunkCount = validateBuiltIndex(indexDb, mode === 'hybrid')
    indexDb.exec('PRAGMA optimize')
    indexDb.close()
    activateSearchIndex(paths.staging, paths.current)
    return { mode, sourceMessageCount, chunkCount }
  } catch (error) {
    try { indexDb.close() } catch { /* already closed */ }
    if (fs.existsSync(paths.staging) && fs.statSync(paths.staging).isFile()) fs.rmSync(paths.staging)
    throw error
  }
}
