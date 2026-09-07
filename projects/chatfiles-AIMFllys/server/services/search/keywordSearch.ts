import type { DatabaseSync } from 'node:sqlite'
import { chineseNgrams } from './chunkMessages.js'
import type { RankedSearchHit, SearchChunk, SearchFilters } from './searchTypes.js'

type ChunkRow = {
  chunk_id: string
  conversation_id: string
  first_message_uid: string
  last_message_uid: string
  first_sequence: number
  last_sequence: number
  start_time: number
  end_time: number
  sender_ids: string
  text: string
  ngrams: string
  token_count: number
  relevance?: number
}

function chunkFromRow(row: ChunkRow): SearchChunk {
  let senderIds: string[] = []
  try {
    const parsed: unknown = JSON.parse(row.sender_ids)
    if (Array.isArray(parsed)) senderIds = parsed.filter((value): value is string => typeof value === 'string')
  } catch {
    senderIds = []
  }
  return {
    chunkId: row.chunk_id,
    conversationId: row.conversation_id,
    firstMessageUid: row.first_message_uid,
    lastMessageUid: row.last_message_uid,
    firstSequence: Number(row.first_sequence),
    lastSequence: Number(row.last_sequence),
    startTime: row.start_time,
    endTime: row.end_time,
    senderIds,
    text: row.text,
    ngrams: row.ngrams,
    tokenCount: row.token_count,
  }
}

function scope(filters: SearchFilters, alias: string) {
  const sql: string[] = []
  const values: Array<string | number> = []
  if (filters.conversationId) {
    sql.push(`${alias}.conversation_id=?`)
    values.push(filters.conversationId)
  }
  if (filters.sender) {
    sql.push(`EXISTS(SELECT 1 FROM json_each(${alias}.sender_ids) WHERE value=?)`)
    values.push(filters.sender)
  }
  if (filters.after !== undefined) {
    sql.push(`${alias}.end_time>=?`)
    values.push(filters.after)
  }
  if (filters.before !== undefined) {
    sql.push(`${alias}.start_time<=?`)
    values.push(filters.before)
  }
  return { sql, values }
}

function ftsExpression(query: string) {
  const terms = chineseNgrams(query).split(/\s+/u).filter(Boolean)
  return terms.map((term) => `"${term.replaceAll('"', '""')}"`).join(' OR ')
}

export function keywordSearch(
  db: DatabaseSync,
  input: { query: string; filters?: SearchFilters; limit?: number },
): RankedSearchHit[] {
  const query = input.query.trim()
  if (!query || query.length > 500) return []
  const filters = input.filters ?? {}
  const limit = Math.max(1, Math.min(input.limit ?? filters.limit ?? 20, 100))
  const candidates = Math.min(limit * 4, 200)
  const exactScope = scope(filters, 'c')
  const exactWhere = [
    `(instr(lower(c.text),lower(?))>0 OR c.chunk_id=? OR c.conversation_id=?
      OR c.first_message_uid=? OR c.last_message_uid=?
      OR EXISTS(SELECT 1 FROM json_each(c.sender_ids) WHERE value=?))`,
    ...exactScope.sql,
  ]
  const exact = db.prepare(`
    SELECT c.* FROM search_chunks c WHERE ${exactWhere.join(' AND ')}
    ORDER BY c.end_time DESC,c.conversation_id,c.last_sequence DESC,c.chunk_id LIMIT ?
  `).all(query, query, query, query, query, query, ...exactScope.values, candidates) as ChunkRow[]

  const merged = new Map<string, RankedSearchHit>()
  for (const row of exact) {
    const chunk = chunkFromRow(row)
    merged.set(chunk.chunkId, { ...chunk, rank: 0, score: 2, source: 'exact' })
  }
  const expression = ftsExpression(query)
  if (expression) {
    const ftsScope = scope(filters, 'c')
    const fts = db.prepare(`
      SELECT c.*,bm25(search_chunks_fts,1.0,0.45) AS relevance
      FROM search_chunks_fts JOIN search_chunks c ON c.id=search_chunks_fts.rowid
      WHERE search_chunks_fts MATCH ?${ftsScope.sql.length ? ` AND ${ftsScope.sql.join(' AND ')}` : ''}
      ORDER BY relevance,c.conversation_id,c.last_sequence DESC,c.chunk_id LIMIT ?
    `).all(expression, ...ftsScope.values, candidates) as ChunkRow[]
    for (const row of fts) {
      if (merged.has(row.chunk_id)) continue
      const chunk = chunkFromRow(row)
      const score = 1 / (1 + Math.max(0, row.relevance ?? 0))
      merged.set(chunk.chunkId, { ...chunk, rank: 0, score, source: 'keyword' })
    }
  }
  return [...merged.values()]
    .sort((left, right) => right.score - left.score || left.chunkId.localeCompare(right.chunkId))
    .slice(0, limit)
    .map((hit, index) => ({ ...hit, rank: index + 1 }))
}
