import type { DatabaseSync } from 'node:sqlite'

import type { TimelineMessage } from '../../shared/contracts/chat.js'
import {
  resolveMessageAnchor,
  stableMessageUid,
  type MessageStorageShape,
  type ResolvedMessageAnchor,
} from '../wechat/legacyMessageIdentity.js'
import type { DecodedTimelineCursor } from './chatTimelineCursor.js'

type QueryScope = { sql: string; params: Array<string | number> }

type StoredLegacyTimelineRow = Omit<TimelineMessage, 'message_uid'> & {
  conv_id: string
  legacy_rowid: number
  message_uid: string | null
  sequence: number
}

function projection(storage: MessageStorageShape) {
  const messageUid = storage.hasMessageUid ? 'message_uid' : 'NULL AS message_uid'
  return `conv_id,${messageUid},seq,seq AS sequence,time,sender,sender_name,
    type,type_label,text,rowid AS legacy_rowid`
}

function publicRow(row: StoredLegacyTimelineRow, storage: MessageStorageShape): TimelineMessage {
  const { conv_id, legacy_rowid, message_uid, sequence, ...message } = row
  return {
    ...message,
    message_uid: stableMessageUid({
      conv_id,
      legacy_rowid: Number(legacy_rowid),
      message_uid,
      sequence: Number(sequence),
      time: Number(row.time),
    }, storage.hasMessageUid),
  }
}

function resolveAnchor(
  db: DatabaseSync,
  conversationId: string,
  cursor: DecodedTimelineCursor,
  storage: MessageStorageShape,
) {
  const row = resolveMessageAnchor(db, cursor.messageUid, storage, conversationId)
  if (!row) return null
  const matches = 'legacy' in cursor
    ? Number(row.time) === cursor.time
    : Number(row.sequence) === cursor.sequence
  return matches ? row : null
}

function anchorComparison(
  anchor: ResolvedMessageAnchor,
  storage: MessageStorageShape,
  operator: '<' | '>',
) {
  if (storage.messageUidGuaranteed) {
    return {
      sql: ` AND (time${operator}? OR (time=? AND
        (message_uid${operator}? OR (message_uid=? AND rowid${operator}?))))`,
      params: [anchor.time, anchor.time, anchor.message_uid, anchor.message_uid, anchor.legacy_rowid],
    }
  }
  return {
    sql: ` AND (time${operator}? OR (time=? AND
      (seq${operator}? OR (seq=? AND rowid${operator}?))))`,
    params: [anchor.time, anchor.time, anchor.sequence, anchor.sequence, anchor.legacy_rowid],
  }
}

export function legacyDirectional(
  db: DatabaseSync,
  scope: QueryScope,
  conversationId: string,
  direction: 'before' | 'after',
  cursor: DecodedTimelineCursor | null,
  storage: MessageStorageShape,
  limit: number,
) {
  const anchor = cursor ? resolveAnchor(db, conversationId, cursor, storage) : null
  if (cursor && !anchor) return []
  const operator = direction === 'before' ? '<' : '>'
  const comparison = anchor
    ? anchorComparison(anchor, storage, operator)
    : { sql: '', params: [] }
  const order = direction === 'before' ? 'DESC' : 'ASC'
  const identityOrder = storage.messageUidGuaranteed ? 'message_uid' : 'seq'
  const rows = db.prepare(`SELECT ${projection(storage)} FROM messages
    WHERE ${scope.sql}${comparison.sql}
    ORDER BY time ${order},${identityOrder} ${order},rowid ${order} LIMIT ?`)
    .all(...scope.params, ...comparison.params, limit) as StoredLegacyTimelineRow[]
  const messages = rows.map((row) => publicRow(row, storage))
  return direction === 'before' ? messages.reverse() : messages
}

export function legacyMiddle(
  db: DatabaseSync,
  scope: QueryScope,
  conversationId: string,
  cursor: DecodedTimelineCursor,
  storage: MessageStorageShape,
) {
  const anchor = resolveAnchor(db, conversationId, cursor, storage)
  if (!anchor) return []
  const rows = db.prepare(`SELECT ${projection(storage)} FROM messages
    WHERE ${scope.sql} AND rowid=? LIMIT 1`)
    .all(...scope.params, anchor.legacy_rowid) as StoredLegacyTimelineRow[]
  return rows.map((row) => publicRow(row, storage))
}

export function legacyBucketRows(db: DatabaseSync, scope: QueryScope, storage: MessageStorageShape) {
  const identityOrder = storage.messageUidGuaranteed ? 'message_uid' : 'seq'
  const rows = db.prepare(`SELECT ${projection(storage)} FROM messages
    WHERE ${scope.sql} ORDER BY time,${identityOrder},rowid`)
    .all(...scope.params) as StoredLegacyTimelineRow[]
  return rows.map((row) => publicRow(row, storage))
}

export function legacyEncodeAnchor(
  db: DatabaseSync,
  conversationId: string,
  messageUid: string,
  storage: MessageStorageShape,
) {
  const row = resolveMessageAnchor(db, messageUid, storage, conversationId)
  return row ? { sequence: Number(row.sequence), message_uid: row.message_uid } : null
}
