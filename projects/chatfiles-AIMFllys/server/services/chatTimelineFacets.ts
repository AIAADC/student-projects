import type { DatabaseSync } from 'node:sqlite'

import type {
  TimelineDay,
  TimelineDayPage,
  TimelineParticipant,
  TimelineParticipantPage,
} from '../../shared/contracts/chatTimeline.js'
import {
  archiveDay,
  DEFAULT_ARCHIVE_TIME_ZONE,
  resolveArchiveTimeZone,
} from '../../shared/time/archiveTime.js'
import { inspectMessageStorage } from '../wechat/legacyMessageIdentity.js'
import { legacyBucketRows } from './chatTimelineLegacy.js'

type FacetInput = { conversationId: string; query?: string }
export type TimelineDayQueryInput = FacetInput & {
  limit: number
  before?: string
  sender?: string
}

function metadata(database: DatabaseSync) {
  const storage = inspectMessageStorage(database)
  const columns = new Set((database.prepare('PRAGMA table_info(parse_runs)').all() as Array<{ name: string }>)
    .map((row) => row.name))
  let runId = 'legacy'
  let timeZone = DEFAULT_ARCHIVE_TIME_ZONE
  if (columns.has('run_id')) {
    const projection = columns.has('time_zone') ? 'run_id,time_zone' : 'run_id,NULL AS time_zone'
    const row = database.prepare(`SELECT ${projection} FROM parse_runs LIMIT 1`).get() as
      { run_id?: unknown; time_zone?: unknown } | undefined
    runId = String(row?.run_id ?? runId)
    const configured = String(row?.time_zone ?? '').trim()
    if (configured) timeZone = resolveArchiveTimeZone(configured)
  }
  return { storage, canonical: storage.canonical, runId, timeZone }
}

function escapedLike(value: string) {
  return `%${value.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_')}%`
}

function scope(input: FacetInput & { sender?: string }) {
  const clauses = ['conv_id=?']
  const params: Array<string | number> = [input.conversationId]
  if (input.sender) {
    clauses.push("COALESCE(NULLIF(sender,''),NULLIF(sender_name,''),'?')=?")
    params.push(input.sender)
  }
  const query = input.query?.trim()
  if (query) {
    clauses.push("(text LIKE ? ESCAPE '\\' OR sender_name LIKE ? ESCAPE '\\')")
    const pattern = escapedLike(query)
    params.push(pattern, pattern)
  }
  return { sql: clauses.join(' AND '), params }
}

export function queryTimelineParticipants(
  database: DatabaseSync,
  input: FacetInput,
): TimelineParticipantPage {
  const info = metadata(database)
  const scoped = scope(input)
  const personProjection = info.canonical
    ? 'CASE WHEN count(DISTINCT person_id)=1 THEN max(person_id) ELSE NULL END'
    : 'NULL'
  const rows = database.prepare(`
    SELECT COALESCE(NULLIF(sender,''),NULLIF(sender_name,''),'?') AS sender_key,
           ${personProjection} AS person_id,
           COALESCE(NULLIF(max(sender_name),''),NULLIF(max(sender),''),'未知人物') AS name,
           count(*) AS message_count,max(time) AS last_time,
           max(CASE WHEN sender IS NOT NULL AND sender<>'' THEN 1 ELSE 0 END) AS has_sender,
           max(CASE WHEN sender_name IS NOT NULL AND sender_name<>'' THEN 1 ELSE 0 END) AS has_name
    FROM messages WHERE ${scoped.sql}
    GROUP BY sender_key ORDER BY message_count DESC,name ASC
  `).all(...scoped.params) as Array<Record<string, unknown>>
  const participants: TimelineParticipant[] = rows.map((row) => ({
    senderKey: String(row.sender_key),
    personId: row.person_id === null ? null : String(row.person_id),
    name: String(row.name),
    identitySource: row.person_id !== null
      ? 'person_id'
      : Number(row.has_sender)
        ? 'sender'
        : Number(row.has_name)
          ? 'name_snapshot'
          : 'unknown',
    messageCount: Number(row.message_count),
    lastTime: Number(row.last_time),
  }))
  return {
    conversationId: input.conversationId,
    runId: info.runId,
    timeZone: info.timeZone,
    participants,
  }
}

function canonicalDays(database: DatabaseSync, input: TimelineDayQueryInput) {
  const scoped = scope(input)
  const beforeClause = input.before ? ' AND archive_day<?' : ''
  const params = input.before ? [...scoped.params, input.before] : scoped.params
  return database.prepare(`
    WITH ranked AS (
      SELECT archive_day AS date,message_uid,canonical_seq,
             row_number() OVER (PARTITION BY archive_day ORDER BY canonical_seq) AS day_rank,
             count(*) OVER (PARTITION BY archive_day) AS message_count
      FROM messages WHERE ${scoped.sql}${beforeClause}
    )
    SELECT date,message_uid,canonical_seq,message_count FROM ranked
    WHERE day_rank=1 ORDER BY date DESC LIMIT ?
  `).all(...params, input.limit + 1) as Array<Record<string, unknown>>
}

function legacyDays(database: DatabaseSync, input: TimelineDayQueryInput, timeZone: string) {
  const rows = legacyBucketRows(database, scope(input), inspectMessageStorage(database))
  const byDay = new Map<string, TimelineDay>()
  for (const row of rows) {
    const date = archiveDay(Number(row.time), timeZone)
    if (input.before && date >= input.before) continue
    const existing = byDay.get(date)
    if (existing) existing.messageCount += 1
    else byDay.set(date, {
      date,
      firstMessageUid: row.message_uid,
      firstSequence: Number(row.canonical_seq ?? row.seq),
      messageCount: 1,
    })
  }
  return [...byDay.values()].sort((left, right) => right.date.localeCompare(left.date)).slice(0, input.limit + 1)
}

export function queryTimelineDays(database: DatabaseSync, input: TimelineDayQueryInput): TimelineDayPage {
  const info = metadata(database)
  const rows = info.canonical
    ? canonicalDays(database, input).map((row) => ({
        date: String(row.date), firstMessageUid: String(row.message_uid),
        firstSequence: Number(row.canonical_seq), messageCount: Number(row.message_count),
      }))
    : legacyDays(database, input, info.timeZone)
  const hasMore = rows.length > input.limit
  const days = rows.slice(0, input.limit)
  return {
    conversationId: input.conversationId,
    runId: info.runId,
    timeZone: info.timeZone,
    limit: input.limit,
    days,
    pageInfo: { nextCursor: hasMore ? days.at(-1)?.date ?? null : null, hasMore },
  }
}
