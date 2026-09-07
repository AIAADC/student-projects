import assert from 'node:assert/strict'
import test from 'node:test'
import { DatabaseSync } from 'node:sqlite'

import {
  inspectMessageStorage,
  legacyRowIdFromMessageUid,
  resolveMessageAnchor,
  stableMessageUid,
} from './legacyMessageIdentity.js'

test('keeps a verifiable row locator inside synthetic legacy message identities', () => {
  const uid = stableMessageUid({
    conv_id: '旧会话',
    sequence: 7,
    time: 1_783_800_000,
    legacy_rowid: 42,
  }, false)

  assert.match(uid, /^legacy:42:[0-9a-f]{64}$/u)
  assert.equal(legacyRowIdFromMessageUid(uid), 42)
  assert.equal(legacyRowIdFromMessageUid(uid.replace('legacy:42:', 'legacy:0042:')), null)
  assert.equal(legacyRowIdFromMessageUid('legacy:42:not-a-digest'), null)
})

test('resolves a synthetic identity when a legacy message_uid column is nullable', () => {
  const db = new DatabaseSync(':memory:')
  try {
    db.exec(`
      CREATE TABLE messages(conv_id TEXT,message_uid TEXT,seq INTEGER,time INTEGER);
      INSERT INTO messages VALUES('legacy-conv',NULL,3,100);
    `)
    const storage = inspectMessageStorage(db)
    assert.equal(storage.hasMessageUid, true)
    assert.equal(storage.messageUidGuaranteed, false)
    const uid = stableMessageUid({
      conv_id: 'legacy-conv', message_uid: null, sequence: 3, time: 100, legacy_rowid: 1,
    }, true)
    assert.equal(resolveMessageAnchor(db, uid, storage)?.legacy_rowid, 1)
  } finally {
    db.close()
  }
})
