import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type {
  CurrentInsightConversation,
  InsightConversation,
  InsightMessage,
  InsightState,
} from './insightRefresh.js'
import { readJson, safeInsightId, type DeltaEntry } from './insightRefreshContext.js'
import { DEFAULT_ARCHIVE_TIME_ZONE, resolveArchiveTimeZone } from '../../shared/time/archiveTime.js'

export function currentConversations(db: DatabaseSync) {
  const rows = db.prepare(`
    SELECT id, display, is_group, text_count, first_time, last_time
    FROM conversations
    WHERE text_count >= 20
    ORDER BY id
  `).all() as Array<{
    id: string
    display: string
    is_group: number
    text_count: number
    first_time: number
    last_time: number
  }>
  return rows.map((row): CurrentInsightConversation => ({
    id: row.id,
    display: row.display,
    isGroup: row.is_group === 1,
    textCount: Number(row.text_count),
    firstTime: Number(row.first_time),
    lastTime: Number(row.last_time),
  }))
}

export function insightFilename(convId: string) {
  return `${safeInsightId(convId)}.json`
}

export function loadInsightConversations(directory: string) {
  const filenames = fs.readdirSync(directory).filter((file) => file.endsWith('.json')).sort()
  return filenames.map((file) => readJson<InsightConversation>(path.join(directory, file)))
}

export function queryMessages(db: DatabaseSync, entry: DeltaEntry) {
  const columns = new Set(
    (db.prepare('PRAGMA table_info(messages)').all() as Array<{ name: string }>).map((row) => row.name),
  )
  const canonical = columns.has('canonical_seq') && columns.has('occurred_at_epoch_s')
  if (canonical) {
    let sinceSequence = Number.isSafeInteger(entry.sinceSequence) ? Number(entry.sinceSequence) : null
    if (sinceSequence === null && entry.sinceMessageUid) {
      const anchor = db.prepare('SELECT canonical_seq FROM messages WHERE conv_id=? AND message_uid=?')
        .get(entry.conversation.id, entry.sinceMessageUid) as { canonical_seq: number } | undefined
      if (anchor) sinceSequence = Number(anchor.canonical_seq)
    }
    const cursor = sinceSequence !== null
      ? 'AND canonical_seq > ?'
      : entry.since > 0
        ? 'AND occurred_at_epoch_s > ?'
        : ''
    const values = cursor
      ? [entry.conversation.id, sinceSequence ?? entry.since]
      : [entry.conversation.id]
    const rows = db.prepare(`SELECT message_uid,canonical_seq,occurred_at_epoch_s AS time,sender_name,text
      FROM messages WHERE conv_id=? AND type=1 AND length(text)>0 ${cursor}
      ORDER BY canonical_seq`).all(...values)
    return rows.map((row): InsightMessage => {
      const value = row as {
        message_uid: string
        canonical_seq: number
        time: number
        sender_name: string | null
        text: string
      }
      return {
        messageUid: value.message_uid,
        canonicalSequence: Number(value.canonical_seq),
        time: Number(value.time),
        senderName: value.sender_name ?? '某人',
        text: value.text,
      }
    })
  }
  const cursor = entry.sinceMessageUid
    ? 'AND (time > ? OR (time = ? AND message_uid > ?))'
    : 'AND time > ?'
  const statement = db.prepare(`
    SELECT message_uid, time, sender_name, text
    FROM messages
    WHERE conv_id = ? AND type = 1 AND length(text) > 0 ${cursor}
    ORDER BY time, message_uid, rowid
  `)
  const rows = entry.sinceMessageUid
    ? statement.all(entry.conversation.id, entry.since, entry.since, entry.sinceMessageUid)
    : statement.all(entry.conversation.id, entry.since)
  return rows.map((row): InsightMessage => {
    const value = row as { message_uid: string; time: number; sender_name: string | null; text: string }
    return {
      messageUid: value.message_uid,
      time: Number(value.time),
      senderName: value.sender_name ?? '某人',
      text: value.text,
    }
  })
}

export function bindInsightStateSequences(db: DatabaseSync, states: readonly InsightState[]) {
  const columns = new Set(
    (db.prepare('PRAGMA table_info(messages)').all() as Array<{ name: string }>).map((row) => row.name),
  )
  if (!columns.has('canonical_seq') || !columns.has('occurred_at_epoch_s')) {
    return states.map((state) => ({ ...state }))
  }
  type CursorRow = { message_uid: string; canonical_seq: number; occurred_at_epoch_s: number }
  const bySequence = db.prepare(`SELECT message_uid,canonical_seq,occurred_at_epoch_s FROM messages
    WHERE conv_id=? AND canonical_seq=? AND type=1 AND length(text)>0`)
  const byUid = db.prepare(`SELECT message_uid,canonical_seq,occurred_at_epoch_s FROM messages
    WHERE conv_id=? AND message_uid=? AND type=1 AND length(text)>0`)
  const legacyAnchorByOffset = db.prepare(`SELECT message_uid,time FROM messages
    WHERE conv_id=? AND type=1 AND length(text)>0 ORDER BY time,message_uid,rowid LIMIT 1 OFFSET ?`)
  const uniqueUidCursor = (convId: string, messageUid: string) => {
    const rows = byUid.all(convId, messageUid) as CursorRow[]
    return rows.length === 1 ? rows[0] : undefined
  }
  return states.map((state): InsightState => {
    if (state.analyzedTextCount <= 0) return { ...state }
    const cursor = Number.isSafeInteger(state.analyzedLastSequence)
      ? bySequence.get(state.convId, state.analyzedLastSequence!) as CursorRow | undefined
      : state.analyzedLastMessageUid
        ? uniqueUidCursor(state.convId, state.analyzedLastMessageUid)
        : (() => {
            const legacyAnchor = legacyAnchorByOffset.get(
              state.convId,
              state.analyzedTextCount - 1,
            ) as { message_uid: string; time: number } | undefined
            if (!legacyAnchor || Number(legacyAnchor.time) !== state.analyzedLastTime) return undefined
            return uniqueUidCursor(state.convId, legacyAnchor.message_uid)
          })()
    if (
      !cursor
      || (state.analyzedLastMessageUid && cursor.message_uid !== state.analyzedLastMessageUid)
      || Number(cursor.occurred_at_epoch_s) !== state.analyzedLastTime
    ) throw new Error(`Insight state cursor does not resolve onto canonical sequence: ${state.convId}`)
    return {
      ...state,
      analyzedLastMessageUid: cursor.message_uid,
      analyzedLastSequence: Number(cursor.canonical_seq),
      analyzedLastTime: Number(cursor.occurred_at_epoch_s),
    }
  })
}

export function insightArchiveTimeZone(db: DatabaseSync) {
  const columns = new Set(
    (db.prepare('PRAGMA table_info(parse_runs)').all() as Array<{ name: string }>).map((row) => row.name),
  )
  if (!columns.has('time_zone')) return DEFAULT_ARCHIVE_TIME_ZONE
  const run = db.prepare('SELECT time_zone FROM parse_runs LIMIT 1').get() as { time_zone?: string } | undefined
  return resolveArchiveTimeZone(run?.time_zone)
}

export function copyBoards(sourceDir: string, targetDir: string) {
  fs.mkdirSync(targetDir)
  const sourceBoards = path.join(sourceDir, 'boards')
  if (!fs.existsSync(sourceBoards)) return 0
  const files = fs.readdirSync(sourceBoards).filter((file) => file.endsWith('.md')).sort()
  for (const file of files) {
    fs.copyFileSync(path.join(sourceBoards, file), path.join(targetDir, file), fs.constants.COPYFILE_EXCL)
  }
  return files.length
}

export function copyDirectoryExclusive(source: string, target: string) {
  const sourceStats = fs.lstatSync(source)
  if (sourceStats.isSymbolicLink()) throw new Error(`Refusing to copy a symlinked directory: ${source}`)
  if (!sourceStats.isDirectory()) throw new Error(`Expected a directory: ${source}`)
  fs.mkdirSync(target, { recursive: false })
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const sourcePath = path.join(source, entry.name)
    const targetPath = path.join(target, entry.name)
    if (entry.isSymbolicLink()) throw new Error(`Refusing to copy a symlinked insight entry: ${sourcePath}`)
    if (entry.isDirectory()) copyDirectoryExclusive(sourcePath, targetPath)
    else if (entry.isFile()) fs.copyFileSync(sourcePath, targetPath, fs.constants.COPYFILE_EXCL)
    else throw new Error(`Unsupported insight entry type: ${sourcePath}`)
  }
}
