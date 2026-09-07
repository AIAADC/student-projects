import type { DatabaseSync } from 'node:sqlite'
import type { HybridSearchResult } from './hybridSearch.js'
import { inspectMessageStorage, stableMessageUid } from '../../wechat/legacyMessageIdentity.js'

type Input = {
  query: string
  conversationId?: string
  sender?: string
  after?: number
  before?: number
  limit: number
}
type Row = {
  conv_id: string
  message_uid: string | null
  sequence: number
  time: number
  legacy_rowid: number
  sender: string
  sender_name: string
  text: string
}

function escapedLike(value: string) {
  return `%${value.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_')}%`
}

export function liveMessageSearch(db: DatabaseSync, input: Input): HybridSearchResult {
  const query = input.query.trim()
  if (!query) return { mode: 'keyword-only', reason: 'not_configured', hits: [] }
  const clauses = ["(text LIKE ? ESCAPE '\\' OR sender_name LIKE ? ESCAPE '\\')"]
  const storage = inspectMessageStorage(db)
  const canonical = storage.canonical
  const timeColumn = canonical ? 'occurred_at_epoch_s' : 'time'
  const pattern = escapedLike(query)
  const values: Array<string | number> = [pattern, pattern]
  if (input.conversationId) { clauses.push('conv_id=?'); values.push(input.conversationId) }
  if (input.sender) { clauses.push('sender=?'); values.push(input.sender) }
  if (input.after !== undefined) { clauses.push(`${timeColumn}>=?`); values.push(input.after) }
  if (input.before !== undefined) { clauses.push(`${timeColumn}<=?`); values.push(input.before) }
  const limit = Math.max(1, Math.min(input.limit, 100))
  const timeProjection = canonical ? 'occurred_at_epoch_s AS time' : 'time'
  const sequenceProjection = canonical ? 'canonical_seq AS sequence' : 'seq AS sequence'
  const messageUidProjection = storage.hasMessageUid ? 'message_uid' : 'NULL AS message_uid'
  const order = canonical
    ? 'occurred_at_epoch_s DESC,conv_id,canonical_seq DESC'
    : storage.messageUidGuaranteed
      ? 'time DESC,message_uid,rowid'
      : 'time DESC,seq DESC,rowid DESC'
  const rows = db.prepare(`SELECT conv_id,${messageUidProjection},${sequenceProjection},${timeProjection},
    rowid AS legacy_rowid,sender,sender_name,text
    FROM messages WHERE ${clauses.join(' AND ')} ORDER BY ${order} LIMIT ?`).all(...values, limit) as Row[]
  return {
    mode: 'keyword-only',
    reason: 'not_configured',
    hits: rows.map((row, index) => {
      const messageUid = stableMessageUid(row, storage.hasMessageUid)
      return {
        chunkId: `live:${messageUid}`, conversationId: row.conv_id,
        firstMessageUid: messageUid, lastMessageUid: messageUid,
        firstSequence: Number(row.sequence), lastSequence: Number(row.sequence),
        startTime: Number(row.time), endTime: Number(row.time), senderIds: [row.sender].filter(Boolean),
        text: `${row.sender_name || row.sender}: ${row.text}`, ngrams: '', tokenCount: 0,
        rank: index + 1, score: 1, source: 'exact',
      }
    }),
  }
}
