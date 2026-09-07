import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { TestContext } from 'node:test'
import { DatabaseSync } from 'node:sqlite'

export type ParseRunOverrides = {
  status?: string
  completedAt?: string
  schemaVersion?: number
  timeZone?: string
  sourceMessages?: number
  outputMessages?: number
  deduplicatedMessages?: number | null
}

export type CurrentDatabaseOptions = {
  missingMessageUid?: boolean
  missingCanonicalSequence?: boolean
  parseRuns?: number
  canonicalSequences?: readonly number[]
  metadataTimeZone?: string
  run?: ParseRunOverrides
}

export function fixtureRoot(t: TestContext) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chatfiles-wechat-opener-'))
  t.after(() => fs.rmSync(root, { force: true, recursive: true }))
  return root
}

export function createLegacyDatabase(root: string) {
  const databasePath = path.join(root, 'data', 'wechat.db')
  fs.mkdirSync(path.dirname(databasePath), { recursive: true })
  const db = new DatabaseSync(databasePath)
  db.exec(`
    CREATE TABLE conversations(
      id TEXT, account TEXT, username TEXT, display TEXT, is_group INTEGER,
      msg_count INTEGER, text_count INTEGER, first_time INTEGER, last_time INTEGER, summary TEXT
    );
    CREATE TABLE messages(
      conv_id TEXT, seq INTEGER, time INTEGER, sender TEXT, sender_name TEXT,
      type INTEGER, type_label TEXT, text TEXT
    );
    INSERT INTO conversations VALUES (
      'fixture-conversation', 'legacy', 'fixture-user', '回退会话', 0, 1, 1, 1, 1, ''
    );
  `)
  db.close()
  return databasePath
}

export function createCurrentDatabase(root: string, options: CurrentDatabaseOptions = {}) {
  const databasePath = path.join(root, 'data', 'wechat.current', 'wechat.db')
  fs.mkdirSync(path.dirname(databasePath), { recursive: true })
  const db = new DatabaseSync(databasePath)
  const messageUidColumn = options.missingMessageUid ? '' : 'message_uid TEXT,'
  const canonicalSequenceColumn = options.missingCanonicalSequence ? '' : 'canonical_seq INTEGER,'
  db.exec(`
    CREATE TABLE people(
      person_id TEXT, owner TEXT, username TEXT, display_name TEXT,
      display_name_source TEXT, evidence_json TEXT
    );
    CREATE TABLE contacts(
      account TEXT, owner TEXT, username TEXT, display TEXT, nick TEXT, remark TEXT, alias TEXT, is_group INTEGER
    );
    CREATE TABLE conversations(
      id TEXT, account TEXT, owner TEXT, owner_person_id TEXT, peer_person_id TEXT,
      username TEXT, display TEXT, is_group INTEGER, msg_count INTEGER, text_count INTEGER,
      first_time INTEGER, last_time INTEGER, summary TEXT
    );
    CREATE TABLE messages(
      conv_id TEXT, ${messageUidColumn} seq INTEGER, ${canonicalSequenceColumn}
      occurred_at_epoch_s INTEGER, time_precision TEXT, archive_day TEXT, source_adapter TEXT,
      source_snapshot TEXT, source_db TEXT, source_table TEXT, local_id INTEGER, server_id TEXT,
      sort_seq INTEGER, source_sort_seq INTEGER, time INTEGER, sender TEXT, person_id TEXT,
      sender_name TEXT, sender_name_snapshot TEXT, sender_prefix TEXT, is_own INTEGER,
      sender_source TEXT, sender_audit TEXT, raw_type INTEGER, type INTEGER, type_label TEXT,
      content_kind TEXT, structured_content_json TEXT, text TEXT
    );
    CREATE TABLE source_inventory(
      source_snapshot TEXT, domain TEXT, source_db TEXT, source_table TEXT,
      discovered_rows INTEGER, parsed_rows INTEGER, deduplicated_rows INTEGER,
      excluded_rows INTEGER, exclusion_reason TEXT
    );
    CREATE TABLE parse_runs(
      run_id TEXT, status TEXT, completed_at TEXT, schema_version INTEGER, time_zone TEXT,
      selected_snapshot_count INTEGER, selected_source_count INTEGER, source_unit_count INTEGER,
      source_conversation_count INTEGER, source_message_count INTEGER, excluded_source_row_count INTEGER,
      output_conversation_count INTEGER, output_message_count INTEGER, output_text_count INTEGER,
      deduplicated_message_count INTEGER
    );
    CREATE TABLE bundle_metadata(key TEXT, value TEXT);
    INSERT INTO people VALUES('wxp:owner','wxid_owner','wxid_owner','机主','owner','{}');
    INSERT INTO conversations VALUES(
      'fixture-conversation','snapshot','wxid_owner','wxp:owner',NULL,
      'fixture-user','规范会话',0,2,1,100,100,''
    );
  `)

  const run = options.run ?? {}
  const outputMessages = run.outputMessages ?? 2
  const sourceMessages = run.sourceMessages ?? 2
  const deduplicated = run.deduplicatedMessages === undefined ? 0 : run.deduplicatedMessages
  db.prepare('INSERT INTO source_inventory VALUES(?,?,?,?,?,?,?,?,?)').run(
    'snapshot', 'regular', 'message_0.db', 'Msg_fixture',
    outputMessages + Number(deduplicated ?? 0), outputMessages, deduplicated ?? 0, 0, null,
  )
  const insertRun = db.prepare(`INSERT INTO parse_runs VALUES (${Array.from({ length: 15 }, () => '?').join(',')})`)
  for (let index = 0; index < (options.parseRuns ?? 1); index += 1) {
    insertRun.run(
      `run-${index}`, run.status ?? 'complete', run.completedAt ?? '2026-07-12T12:00:00.000Z',
      run.schemaVersion ?? 2, run.timeZone ?? 'Asia/Shanghai', 1, 1, 1, 1,
      sourceMessages, 0, 1, outputMessages, 1, deduplicated,
    )
  }
  db.prepare('INSERT INTO bundle_metadata VALUES(?,?)').run('run_id', 'run-0')
  db.prepare('INSERT INTO bundle_metadata VALUES(?,?)').run('schema_version', String(run.schemaVersion ?? 2))
  db.prepare('INSERT INTO bundle_metadata VALUES(?,?)').run(
    'time_zone', options.metadataTimeZone ?? run.timeZone ?? 'Asia/Shanghai',
  )

  if (!options.missingMessageUid && !options.missingCanonicalSequence) {
    const sequences = options.canonicalSequences ?? [0, 1]
    const insertMessage = db.prepare(`INSERT INTO messages VALUES (${Array.from({ length: 30 }, () => '?').join(',')})`)
    for (let index = 0; index < sequences.length; index += 1) {
      const sequence = sequences[index]
      insertMessage.run(
        'fixture-conversation', `message-${index}`, sequence, sequence, 100, 'second', '1970-01-01',
        'regular', 'snapshot', 'message_0.db', 'Msg_fixture', index + 1, String(index + 1),
        sequence, sequence, 100, 'wxid_owner', 'wxp:owner', '机主', '机主', '', 1,
        'owner', '', 1, index === 0 ? 1 : 3, index === 0 ? 'text' : 'image',
        index === 0 ? 'text' : 'media', '{}', index === 0 ? '中文消息' : '[图片]',
      )
    }
  }
  db.close()
  return databasePath
}
