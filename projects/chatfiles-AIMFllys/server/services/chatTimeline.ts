import type { DatabaseSync } from 'node:sqlite'
import type {
  TimelineMessage,
  TimelinePage,
} from '../../shared/contracts/chat.js'
import { DEFAULT_ARCHIVE_TIME_ZONE, resolveArchiveTimeZone } from '../../shared/time/archiveTime.js'
import {
  decodeTimelineCursor,
  encodeTimelineCursor,
  type DecodedTimelineCursor,
} from './chatTimelineCursor.js'
import {
  legacyDirectional,
  legacyEncodeAnchor,
  legacyMiddle,
} from './chatTimelineLegacy.js'
import {
  inspectMessageStorage,
  type MessageStorageShape,
} from '../wechat/legacyMessageIdentity.js'

export { decodeTimelineCursor, encodeTimelineCursor } from './chatTimelineCursor.js'
export { queryTimelineDays, queryTimelineParticipants } from './chatTimelineFacets.js'

export type TimelineQueryInput = {
  conversationId: string
  limit: number
  before?: string
  after?: string
  around?: string
  sender?: string
  query?: string
}

type TimelineRow = TimelineMessage & { canonical_seq?: number; occurred_at_epoch_s?: number }
type TimelineMetadata = {
  canonical: boolean
  runId: string
  storage: MessageStorageShape
  timeZone: string
}

function tableColumns(db: DatabaseSync, table: string) {
  return new Set((db.prepare(`PRAGMA table_info("${table}")`).all() as Array<{ name: string }>).map((row) => row.name))
}

function timelineMetadata(db: DatabaseSync): TimelineMetadata {
  const storage = inspectMessageStorage(db)
  const canonical = storage.canonical
  const runColumns = tableColumns(db, 'parse_runs')
  let runId = 'legacy'
  let timeZone = DEFAULT_ARCHIVE_TIME_ZONE
  if (runColumns.has('run_id')) {
    const projection = runColumns.has('time_zone') ? 'run_id,time_zone' : "run_id,NULL AS time_zone"
    const run = db.prepare(`SELECT ${projection} FROM parse_runs LIMIT 1`).get() as Record<string, unknown> | undefined
    runId = String(run?.run_id ?? runId)
    const configured = String(run?.time_zone ?? '').trim()
    if (configured) timeZone = resolveArchiveTimeZone(configured)
  }
  return { canonical, runId, storage, timeZone }
}

function escapedLike(value: string) {
  return `%${value.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_')}%`
}

function scopedWhere(input: TimelineQueryInput, includeFilters = true) {
  const clauses = ['conv_id=?']
  const params: Array<string | number> = [input.conversationId]
  if (includeFilters && input.sender) {
    clauses.push("COALESCE(NULLIF(sender,''),NULLIF(sender_name,''),'?')=?")
    params.push(input.sender)
  }
  const query = input.query?.trim()
  if (includeFilters && query) {
    clauses.push("(text LIKE ? ESCAPE '\\' OR sender_name LIKE ? ESCAPE '\\')")
    const pattern = escapedLike(query)
    params.push(pattern, pattern)
  }
  return { sql: clauses.join(' AND '), params }
}

function projection(canonical: boolean) {
  const base = 'message_uid,seq,time,sender,sender_name,type,type_label,text'
  return canonical
    ? `${base},canonical_seq,occurred_at_epoch_s,time_precision,archive_day,person_id`
    : base
}

function canonicalAnchor(
  db: DatabaseSync,
  conversationId: string,
  cursor: DecodedTimelineCursor,
  metadata: TimelineMetadata,
) {
  if ('legacy' in cursor) {
    return db.prepare(`SELECT canonical_seq AS sequence,message_uid FROM messages
      WHERE conv_id=? AND time=? AND message_uid=?`).get(conversationId, cursor.time, cursor.messageUid) as
      { sequence: number; message_uid: string } | undefined
  }
  if (cursor.runId !== metadata.runId) return undefined
  return db.prepare(`SELECT canonical_seq AS sequence,message_uid FROM messages
    WHERE conv_id=? AND canonical_seq=? AND message_uid=?`).get(
    conversationId, cursor.sequence, cursor.messageUid,
  ) as { sequence: number; message_uid: string } | undefined
}

function canonicalDirectional(
  db: DatabaseSync,
  input: TimelineQueryInput,
  direction: 'before' | 'after',
  cursor: DecodedTimelineCursor | null,
  metadata: TimelineMetadata,
  limit: number,
) {
  const scoped = scopedWhere(input)
  const anchor = cursor ? canonicalAnchor(db, input.conversationId, cursor, metadata) : undefined
  if (cursor && !anchor) return []
  const operator = direction === 'before' ? '<' : '>'
  const clause = anchor ? ` AND canonical_seq${operator}?` : ''
  const order = direction === 'before' ? 'DESC' : 'ASC'
  const params = anchor ? [...scoped.params, Number(anchor.sequence)] : scoped.params
  const rows = db.prepare(`SELECT ${projection(true)} FROM messages WHERE ${scoped.sql}${clause}
    ORDER BY canonical_seq ${order} LIMIT ?`).all(...params, limit) as TimelineRow[]
  return direction === 'before' ? rows.reverse() : rows
}

function directional(
  db: DatabaseSync,
  input: TimelineQueryInput,
  direction: 'before' | 'after',
  cursor: DecodedTimelineCursor | null,
  metadata: TimelineMetadata,
  limit: number,
) {
  return metadata.canonical
    ? canonicalDirectional(db, input, direction, cursor, metadata, limit)
    : legacyDirectional(
        db,
        scopedWhere(input),
        input.conversationId,
        direction,
        cursor,
        metadata.storage,
        limit,
      )
}

function readMessages(db: DatabaseSync, input: TimelineQueryInput, metadata: TimelineMetadata, limit: number) {
  if (input.before) return directional(db, input, 'before', decodeTimelineCursor(input.before), metadata, limit)
  if (input.after) return directional(db, input, 'after', decodeTimelineCursor(input.after), metadata, limit)
  if (!input.around) return directional(db, input, 'before', null, metadata, limit)
  const decoded = decodeTimelineCursor(input.around)
  if (!decoded) return []
  const earlierCount = Math.floor((limit - 1) / 2)
  const earlier = directional(db, input, 'before', decoded, metadata, earlierCount)
  const anchorRows = directional(db, input, 'after', decoded, metadata, limit - earlier.length - 1)
  const anchor = metadata.canonical
    ? canonicalAnchor(db, input.conversationId, decoded, metadata)
    : undefined
  const scoped = scopedWhere(input)
  const middle = metadata.canonical && anchor
    ? db.prepare(`SELECT ${projection(true)} FROM messages WHERE ${scoped.sql} AND canonical_seq=? LIMIT 1`)
        .all(...scoped.params, anchor.sequence) as TimelineRow[]
    : !metadata.canonical
      ? legacyMiddle(db, scoped, input.conversationId, decoded, metadata.storage)
      : []
  return [...earlier, ...middle, ...anchorRows]
}

function pageCursor(row: TimelineRow | undefined, metadata: TimelineMetadata) {
  if (!row) return null
  return encodeTimelineCursor({
    version: 2,
    runId: metadata.runId,
    sequence: Number(row.canonical_seq ?? row.seq),
    messageUid: row.message_uid,
  })
}

export function encodeTimelineAnchor(db: DatabaseSync, conversationId: string, messageUid: string) {
  const metadata = timelineMetadata(db)
  const row = metadata.canonical
    ? db.prepare(`SELECT canonical_seq AS sequence,message_uid FROM messages
        WHERE conv_id=? AND message_uid=?`).get(conversationId, messageUid) as
        { sequence: number; message_uid: string } | undefined
    : legacyEncodeAnchor(db, conversationId, messageUid, metadata.storage)
  return row ? encodeTimelineCursor({
    version: 2,
    runId: metadata.runId,
    sequence: Number(row.sequence),
    messageUid: row.message_uid,
  }) : null
}

function hasBeyond(
  db: DatabaseSync,
  input: TimelineQueryInput,
  direction: 'before' | 'after',
  row: TimelineRow,
  metadata: TimelineMetadata,
) {
  const cursor = decodeTimelineCursor(pageCursor(row, metadata)!)!
  return directional(db, input, direction, cursor, metadata, 1).length > 0
}

export function queryTimeline(db: DatabaseSync, input: TimelineQueryInput): TimelinePage {
  const metadata = timelineMetadata(db)
  const limit = Math.min(240, Math.max(1, Number.isSafeInteger(input.limit) ? input.limit : 120))
  const messages = readMessages(db, input, metadata, limit).map((row) => ({ ...row }))
  const first = messages[0]
  const last = messages.at(-1)
  return {
    conversationId: input.conversationId,
    runId: metadata.runId,
    timeZone: metadata.timeZone,
    limit,
    messages,
    pageInfo: {
      olderCursor: pageCursor(first, metadata),
      newerCursor: pageCursor(last, metadata),
      hasOlder: first ? hasBeyond(db, input, 'before', first, metadata) : false,
      hasNewer: last ? hasBeyond(db, input, 'after', last, metadata) : false,
    },
  }
}
