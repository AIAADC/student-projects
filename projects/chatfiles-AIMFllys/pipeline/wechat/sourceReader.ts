import { DatabaseSync } from 'node:sqlite'

export type SourceMessage = {
  localId: number
  serverId: string
  rawType: string
  sortSeq: number
  realSenderId: number
  createTime: number
  messageContent: unknown
  compressedContent: unknown
}

export type SourceMessageMetadata = Omit<SourceMessage, 'messageContent' | 'compressedContent'>

export function quoteIdentifier(value: string) {
  return `"${value.replaceAll('"', '""')}"`
}

export function listMessageTables(db: DatabaseSync) {
  const rows = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'Msg_%' ORDER BY name")
    .all() as Array<{ name: string }>
  return new Set(rows.map((row) => row.name))
}

export function loadMessageName2Id(db: DatabaseSync) {
  const map = new Map<number, string>()
  const rows = db.prepare('SELECT rowid AS id, user_name FROM Name2Id').all() as Array<{
    id: number
    user_name: string | null
  }>
  for (const row of rows) {
    const username = String(row.user_name ?? '').trim()
    if (username) map.set(Number(row.id), username)
  }
  return map
}

export function tableColumns(db: DatabaseSync, table: string) {
  return new Set(
    (db.prepare(`PRAGMA table_info(${quoteIdentifier(table)})`).all() as Array<{ name: string }>).map((row) => row.name),
  )
}

function assertMessageTable(db: DatabaseSync, table: string, knownTables?: ReadonlySet<string>) {
  if (!(knownTables ?? listMessageTables(db)).has(table)) throw new Error(`Message table not found: ${table}`)
}

export function readSourceMessageMetadata(
  db: DatabaseSync,
  table: string,
  knownTables?: ReadonlySet<string>,
): SourceMessageMetadata[] {
  assertMessageTable(db, table, knownTables)
  const rows = db.prepare(`
    SELECT local_id, CAST(server_id AS TEXT) AS server_id, CAST(local_type AS TEXT) AS raw_type, sort_seq,
      real_sender_id, create_time
    FROM ${quoteIdentifier(table)}
    ORDER BY sort_seq, local_id
  `).all() as Array<Record<string, unknown>>

  return rows.map((row) => ({
    localId: Number(row.local_id ?? 0),
    serverId: String(row.server_id ?? '0'),
    rawType: String(row.raw_type ?? '0'),
    sortSeq: Number(row.sort_seq ?? 0),
    realSenderId: Number(row.real_sender_id ?? 0),
    createTime: Number(row.create_time ?? 0),
  }))
}

export function readSourceMessages(
  db: DatabaseSync,
  table: string,
  knownTables?: ReadonlySet<string>,
): SourceMessage[] {
  assertMessageTable(db, table, knownTables)
  const columns = tableColumns(db, table)
  const compressed = columns.has('compress_content') ? 'compress_content' : 'NULL AS compress_content'
  const rows = db.prepare(`
    SELECT local_id, CAST(server_id AS TEXT) AS server_id, CAST(local_type AS TEXT) AS raw_type, sort_seq,
      real_sender_id, create_time, message_content, ${compressed}
    FROM ${quoteIdentifier(table)}
    ORDER BY sort_seq, local_id
  `).all() as Array<Record<string, unknown>>

  return rows.map((row) => ({
    localId: Number(row.local_id ?? 0),
    serverId: String(row.server_id ?? '0'),
    rawType: String(row.raw_type ?? '0'),
    sortSeq: Number(row.sort_seq ?? 0),
    realSenderId: Number(row.real_sender_id ?? 0),
    createTime: Number(row.create_time ?? 0),
    messageContent: row.message_content,
    compressedContent: row.compress_content,
  }))
}
