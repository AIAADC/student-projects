import crypto from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'

export type MessageStorageShape = {
  canonical: boolean
  hasMessageUid: boolean
  messageUidGuaranteed: boolean
}

export type LegacyMessageAnchor = {
  conv_id: string
  sequence: number
  time: number
  legacy_rowid: number
  message_uid?: string | null
}

export type ResolvedMessageAnchor = LegacyMessageAnchor & {
  message_uid: string
}

export function inspectMessageStorage(db: DatabaseSync): MessageStorageShape {
  const rows = db.prepare('PRAGMA table_info(messages)').all() as Array<{
    name: string
    notnull: number
    pk: number
  }>
  const columns = new Set(rows.map((row) => row.name))
  const messageUidColumn = rows.find((row) => row.name === 'message_uid')
  const hasMessageUid = Boolean(messageUidColumn)
  return {
    canonical: hasMessageUid && columns.has('canonical_seq') && columns.has('occurred_at_epoch_s'),
    hasMessageUid,
    messageUidGuaranteed: Boolean(messageUidColumn && (messageUidColumn.notnull === 1 || messageUidColumn.pk > 0)),
  }
}

export function stableMessageUid(row: LegacyMessageAnchor, hasMessageUid: boolean) {
  if (hasMessageUid && row.message_uid) return row.message_uid
  if (!Number.isSafeInteger(row.legacy_rowid)) throw new Error('Legacy message row id is unsafe')
  const evidence = [row.conv_id, row.sequence, row.time, row.legacy_rowid].join('\0')
  const digest = crypto.createHash('sha256').update(evidence, 'utf8').digest('hex')
  return `legacy:${row.legacy_rowid}:${digest}`
}

export function legacyRowIdFromMessageUid(messageUid: string) {
  const match = /^legacy:(-?(?:0|[1-9]\d*)):[0-9a-f]{64}$/u.exec(messageUid)
  if (!match) return null
  const rowId = Number(match[1])
  return Number.isSafeInteger(rowId) && String(rowId) === match[1] ? rowId : null
}

export function resolveMessageAnchor(
  db: DatabaseSync,
  messageUid: string,
  storage = inspectMessageStorage(db),
  conversationId?: string,
): ResolvedMessageAnchor | null {
  const sequence = storage.canonical ? 'canonical_seq' : 'seq'
  const time = storage.canonical ? 'occurred_at_epoch_s' : 'time'
  const messageUidProjection = storage.hasMessageUid ? 'message_uid' : 'NULL AS message_uid'
  const syntheticRowId = legacyRowIdFromMessageUid(messageUid)
  const useRowId = syntheticRowId !== null
  if (!useRowId && !storage.hasMessageUid) return null
  const locator = useRowId ? 'rowid=?' : 'message_uid=?'
  const locatorValue = useRowId ? syntheticRowId : messageUid
  const conversation = conversationId === undefined ? '' : ' AND conv_id=?'
  const values = conversationId === undefined ? [locatorValue] : [locatorValue, conversationId]
  const row = db.prepare(`SELECT conv_id,${sequence} AS sequence,${time} AS time,
    rowid AS legacy_rowid,${messageUidProjection} FROM messages
    WHERE ${locator}${conversation}`).get(...values) as LegacyMessageAnchor | undefined
  if (!row || stableMessageUid(row, storage.hasMessageUid) !== messageUid) return null
  return { ...row, message_uid: messageUid }
}
