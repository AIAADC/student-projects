import assert from 'node:assert/strict'
import test from 'node:test'
import { DatabaseSync } from 'node:sqlite'
import { wechatSourceFingerprint } from './sourceFingerprint.js'

test('fingerprints legacy message tables that only expose seq identities', () => {
  const db = new DatabaseSync(':memory:')
  test.after(() => db.close())
  db.exec(`
    CREATE TABLE messages(
      conv_id TEXT, seq INTEGER, time INTEGER, sender TEXT, sender_name TEXT, text TEXT
    );
    INSERT INTO messages VALUES('会话一', 7, 123, 'user-1', '张三', '中文🙂');
  `)

  const first = wechatSourceFingerprint(db)
  const second = wechatSourceFingerprint(db)

  assert.match(first, /^[a-f0-9]{64}$/u)
  assert.equal(second, first)
})

function canonicalFingerprint(sequenceByUid: readonly [string, number][]) {
  const db = new DatabaseSync(':memory:')
  db.exec(`CREATE TABLE messages(
    conv_id TEXT,message_uid TEXT,canonical_seq INTEGER,occurred_at_epoch_s INTEGER,
    time INTEGER,sender TEXT,sender_name TEXT,text TEXT
  )`)
  const insert = db.prepare('INSERT INTO messages VALUES(?,?,?,?,?,?,?,?)')
  for (const [uid, sequence] of sequenceByUid) {
    insert.run('会话一', uid, sequence, 123, 123, 'user-1', '张三', `消息 ${uid}`)
  }
  const fingerprint = wechatSourceFingerprint(db)
  db.close()
  return fingerprint
}

test('binds canonical sequence into fingerprints instead of relying on same-second UIDs', () => {
  const first = canonicalFingerprint([['uid-z', 0], ['uid-a', 1]])
  const reordered = canonicalFingerprint([['uid-z', 1], ['uid-a', 0]])

  assert.notEqual(first, reordered)
})
