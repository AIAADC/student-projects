import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { DatabaseSync } from 'node:sqlite'
import { createCanonicalSchema } from '../../pipeline/wechat/canonicalSchema.js'
import { canonicalPersonId } from '../../pipeline/wechat/personIdentity.js'
import { auditWechatDatabase } from './chatAudit.js'

function fixture(mutator?: (db: DatabaseSync) => void) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chatfiles-audit-'))
  const dbPath = path.join(dir, 'wechat.db')
  const db = new DatabaseSync(dbPath)
  createCanonicalSchema(db)
  const ownerPersonId = canonicalPersonId('owner-1', 'owner-1')
  const peerPersonId = canonicalPersonId('owner-1', 'peer-1')
  const insertPerson = db.prepare('INSERT INTO people VALUES (?,?,?,?,?,?)')
  insertPerson.run(ownerPersonId, 'owner-1', 'owner-1', '我', 'fixture', '{}')
  insertPerson.run(peerPersonId, 'owner-1', 'peer-1', '对方', 'fixture', '{}')
  db.prepare('INSERT INTO conversations VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)').run(
    'wx:owner-1:peer-1',
    'owner-1',
    'owner-1',
    ownerPersonId,
    peerPersonId,
    'peer-1',
    '测试会话',
    0,
    2,
    2,
    1_700_000_000,
    1_700_000_001,
    '',
  )
  const insert = db.prepare(`INSERT INTO messages VALUES (
    ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?
  )`)
  insert.run(
    'wx:owner-1:peer-1', 'uid-1', 0, 0, 1_700_000_000, 'second', '2023-11-15',
    'regular', 'snapshot-new', 'message_0.db', 'Msg_fixture', 1, '9007199254740999',
    10, 10, 1_700_000_000, 'owner-1', ownerPersonId, '我', '我', '', 1,
    'message-name2id', '', 1, 1, 'text', 'text', '{}', '中文完整',
  )
  insert.run(
    'wx:owner-1:peer-1', 'uid-2', 1, 1, 1_700_000_001, 'second', '2023-11-15',
    'regular', 'snapshot-new', 'message_0.db', 'Msg_fixture', 2, '9007199254741000',
    11, 11, 1_700_000_001, 'peer-1', peerPersonId, '对方', '对方', '', 0,
    'message-name2id', '', 1, 1, 'text', 'text', '{}', '第二条',
  )
  db.prepare('INSERT INTO source_inventory VALUES (?,?,?,?,?,?,?,?,?)').run(
    'snapshot-new', 'regular', 'message_0.db', 'Msg_fixture', 2, 2, 0, 0, null,
  )
  db.prepare('INSERT INTO parse_runs VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(
    'fixture-run', 'complete', '2026-07-12T00:00:00.000Z', 2, 'Asia/Shanghai',
    1, 1, 1, 1, 2, 0, 1, 2, 2, 0,
  )
  db.exec(`
    INSERT INTO bundle_metadata VALUES ('run_id','fixture-run');
    INSERT INTO bundle_metadata VALUES ('schema_version','2');
    INSERT INTO bundle_metadata VALUES ('time_zone','Asia/Shanghai');
  `)
  mutator?.(db)
  db.close()
  return {
    dbPath,
    cleanup() {
      fs.rmSync(dir, { force: true, recursive: true })
    },
  }
}

test('accepts a provenance-complete UTF-8 database', () => {
  const item = fixture()
  try {
    const result = auditWechatDatabase(item.dbPath)
    assert.equal(result.ok, true)
    assert.equal(result.metrics.conversations, 1)
    assert.equal(result.metrics.messages, 2)
    assert.deepEqual(result.issues, [])
  } finally {
    item.cleanup()
  }
})

test('accepts a signed negative raw type when its unsigned low 32 bits match type', () => {
  const item = fixture((db) => {
    db.prepare('UPDATE messages SET raw_type=? WHERE message_uid=?').run(
      -9_223_372_036_854_775_807n,
      'uid-1',
    )
  })
  try {
    const result = auditWechatDatabase(item.dbPath)
    assert.equal(result.ok, true)
    assert.equal(result.issues.some((issue) => issue.code === 'message-type-not-normalized'), false)
  } finally {
    item.cleanup()
  }
})

test('rejects a same-second canonical sequence that reverses source sort evidence', () => {
  const item = fixture((db) => {
    db.prepare(`UPDATE messages SET occurred_at_epoch_s=?,time=?,archive_day=?,sort_seq=?,source_sort_seq=?
      WHERE message_uid=?`).run(1_700_000_000, 1_700_000_000, '2023-11-15', 5, 5, 'uid-2')
  })
  try {
    const result = auditWechatDatabase(item.dbPath)
    assert.equal(result.ok, false)
    assert.equal(result.issues.some((issue) => issue.code === 'same-second-source-order-mismatch'), true)
  } finally {
    item.cleanup()
  }
})

test('reports identity, evidence, type, count and UTF-8 violations', () => {
  const item = fixture((db) => {
    db.exec('DROP INDEX idx_msg_uid; DROP INDEX idx_msg_evidence; DROP INDEX idx_msg_server;')
    db.prepare('UPDATE conversations SET msg_count=4, text_count=4').run()
    db.prepare(`
      INSERT INTO messages VALUES (
        'wx:owner-1:peer-1', 'uid-2', 2, 2, 1700000002, 'second', '2023-11-15',
        'regular', 'snapshot-new', 'message_0.db', 'Msg_fixture', 2, '9007199254741000',
        12, 12, 1700000002, 'third-person', NULL, '错配', '错配', 'spoofed-prefix', 0,
        'message-name2id', 'group-prefix-mismatch', 244813135921, 244813135921,
        'type_244813135921', 'unknown', '{}', '内容'
      )
    `).run()
    const damaged = `错配${String.fromCodePoint(0xfffd)}`
    db.prepare('UPDATE messages SET sender_name=?,sender_name_snapshot=? WHERE canonical_seq=2')
      .run(damaged, damaged)
  })
  try {
    const result = auditWechatDatabase(item.dbPath)
    assert.equal(result.ok, false)
    const codes = new Set(result.issues.map((issue) => issue.code))
    assert.equal(codes.has('duplicate-message-uid'), true)
    assert.equal(codes.has('duplicate-evidence-key'), true)
    assert.equal(codes.has('duplicate-server-id'), true)
    assert.equal(codes.has('private-sender-outside-participants'), true)
    assert.equal(codes.has('group-prefix-sender-mismatch'), true)
    assert.equal(codes.has('message-type-not-normalized'), true)
    assert.equal(codes.has('replacement-character'), true)
    assert.equal(codes.has('conversation-count-mismatch'), true)
    assert.equal(codes.has('parse-run-database-count-mismatch'), true)
  } finally {
    item.cleanup()
  }
})

test('rejects missing, incomplete, or empty parse run completion state', () => {
  const missing = fixture((db) => db.exec('DELETE FROM parse_runs'))
  try {
    const result = auditWechatDatabase(missing.dbPath)
    assert.equal(result.ok, false)
    assert.equal(result.issues.some((issue) => issue.code === 'parse-run-record-count'), true)
  } finally {
    missing.cleanup()
  }

  const empty = fixture((db) => {
    db.exec('DELETE FROM messages; DELETE FROM conversations;')
    db.exec(`
      UPDATE parse_runs SET status='building', source_conversation_count=0, source_message_count=0,
        output_conversation_count=0, output_message_count=0, output_text_count=0,
        deduplicated_message_count=0
    `)
  })
  try {
    const result = auditWechatDatabase(empty.dbPath)
    const codes = new Set(result.issues.map((issue) => issue.code))
    assert.equal(codes.has('parse-run-not-complete'), true)
    assert.equal(codes.has('empty-output'), true)
  } finally {
    empty.cleanup()
  }
})
