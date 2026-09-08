import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { type DatabaseSync, DatabaseSync as SqliteDatabase } from 'node:sqlite'

import { contactDisplayName } from './messageParsing.js'
import type { OutputConversation, OutputMessageWithRawType } from './sourceIdentityAuditTypes.js'

export const requiredConversationColumns = ['id', 'account', 'owner', 'username', 'display', 'is_group']
export const requiredMessageColumns = [
  'conv_id',
  'message_uid',
  'source_snapshot',
  'source_db',
  'source_table',
  'local_id',
  'server_id',
  'sort_seq',
  'time',
  'sender',
  'sender_name',
  'sender_prefix',
  'text',
  'raw_type',
]

function quoteIdentifier(value: string) {
  return `"${value.replaceAll('"', '""')}"`
}

export function columnNames(db: DatabaseSync, table: string) {
  return new Set(
    (db.prepare(`PRAGMA table_info(${quoteIdentifier(table)})`).all() as Array<{ name: string }>).map(
      (row) => row.name,
    ),
  )
}

export function isSinglePathSegment(value: string) {
  return value !== '' && value !== '.' && value !== '..' && path.basename(value) === value
}

export function sourceMessageTable(username: string) {
  const digest = crypto.createHash('md5').update(username, 'utf8').digest('hex')
  return `Msg_${digest}`
}

export function loadSnapshotDisplayNames(snapshotDir: string) {
  const contactPath = path.join(snapshotDir, 'db_storage', 'contact', 'contact.db')
  if (!fs.existsSync(contactPath)) throw new Error(`Contact database not found: ${contactPath}`)
  const db = new SqliteDatabase(contactPath, { readOnly: true })
  try {
    const displayNames = new Map<string, string>()
    const rows = db.prepare('SELECT username, nick_name, remark, alias FROM contact').all() as Array<
      Record<string, unknown>
    >
    for (const row of rows) {
      const username = String(row.username ?? '').trim()
      if (!username) continue
      displayNames.set(username, contactDisplayName(
        username,
        String(row.nick_name ?? ''),
        String(row.remark ?? ''),
        String(row.alias ?? ''),
      ))
    }
    return displayNames
  } finally {
    db.close()
  }
}

export function outputConversations(db: DatabaseSync): Iterable<OutputConversation> {
  const rows = db.prepare(`
    SELECT id, COALESCE(account, '') AS account, COALESCE(owner, '') AS owner,
      COALESCE(username, '') AS username, COALESCE(display, '') AS display
    FROM conversations
    ORDER BY id
  `).iterate() as Iterable<Record<string, unknown>>
  return {
    *[Symbol.iterator]() {
      for (const row of rows) {
        yield {
          id: String(row.id ?? ''),
          sourceSnapshot: String(row.account ?? ''),
          owner: String(row.owner ?? ''),
          username: String(row.username ?? ''),
          display: String(row.display ?? ''),
        }
      }
    },
  }
}

export function outputMessages(db: DatabaseSync): Iterable<OutputMessageWithRawType> {
  const statement = db.prepare(`
    SELECT
      m.conv_id AS conv_id,
      COALESCE(m.message_uid, '') AS message_uid,
      COALESCE(m.source_snapshot, '') AS source_snapshot,
      COALESCE(m.source_db, '') AS source_db,
      COALESCE(m.source_table, '') AS source_table,
      m.local_id AS local_id,
      CAST(m.server_id AS TEXT) AS server_id,
      m.sort_seq AS sort_seq,
      m.time AS time,
      COALESCE(m.sender, '') AS sender,
      COALESCE(m.sender_name, '') AS sender_name,
      COALESCE(m.sender_prefix, '') AS sender_prefix,
      COALESCE(m.text, '') AS text,
      CAST(m.raw_type AS TEXT) AS raw_type,
      COALESCE(c.account, '') AS conversation_snapshot,
      COALESCE(c.owner, '') AS owner,
      COALESCE(c.username, '') AS peer,
      c.is_group AS is_group
    FROM messages m
    LEFT JOIN conversations c ON c.id=m.conv_id
    ORDER BY m.source_snapshot, m.source_db, m.source_table, m.local_id, m.message_uid
  `)

  const rows = statement.iterate() as Iterable<Record<string, unknown>>
  return {
    *[Symbol.iterator]() {
      for (const row of rows) {
        yield {
          convId: String(row.conv_id ?? ''),
          messageUid: String(row.message_uid ?? ''),
          sourceSnapshot: String(row.source_snapshot ?? ''),
          sourceDb: String(row.source_db ?? ''),
          sourceTable: String(row.source_table ?? ''),
          localId: Number(row.local_id),
          serverId: String(row.server_id ?? ''),
          sortSeq: Number(row.sort_seq),
          time: Number(row.time),
          sender: String(row.sender ?? '').trim(),
          senderName: String(row.sender_name ?? ''),
          senderPrefix: String(row.sender_prefix ?? '').trim(),
          text: String(row.text ?? ''),
          conversationSnapshot: String(row.conversation_snapshot ?? ''),
          owner: String(row.owner ?? ''),
          peer: String(row.peer ?? ''),
          isGroup: Number(row.is_group) === 1,
          rawType: String(row.raw_type ?? ''),
        }
      }
    },
  }
}
