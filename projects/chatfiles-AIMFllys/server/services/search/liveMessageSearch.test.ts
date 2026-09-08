import assert from 'node:assert/strict'
import test from 'node:test'
import { DatabaseSync } from 'node:sqlite'
import { liveMessageSearch } from './liveMessageSearch.js'

test('provides a bounded literal keyword fallback directly from canonical messages', () => {
  const db = new DatabaseSync(':memory:')
  db.exec(`CREATE TABLE messages(
    conv_id TEXT,message_uid TEXT PRIMARY KEY,canonical_seq INTEGER,
    occurred_at_epoch_s INTEGER,time INTEGER,sender TEXT,sender_name TEXT,text TEXT
  ); INSERT INTO messages VALUES
    ('conv-a','m-a',0,100,100,'u-a','张三','季度_计划% 已确认'),
    ('conv-a','m-z',1,100,100,'u-b','李四','季度计划待讨论'),
    ('conv-b','m-3',0,102,102,'u-a','张三','其他会话');`)
  const literal = liveMessageSearch(db, { query: '季度_计划%', conversationId: 'conv-a', limit: 10 })
  assert.deepEqual(literal.hits.map((hit) => hit.firstMessageUid), ['m-a'])
  assert.equal(literal.mode, 'keyword-only')
  const filtered = liveMessageSearch(db, { query: '季度', sender: 'u-b', after: 100, before: 101, limit: 10 })
  assert.deepEqual(filtered.hits.map((hit) => hit.firstMessageUid), ['m-z'])
  const ordered = liveMessageSearch(db, { query: '季度', conversationId: 'conv-a', limit: 10 })
  assert.deepEqual(ordered.hits.map((hit) => hit.firstMessageUid), ['m-z', 'm-a'])
  assert.deepEqual(ordered.hits.map((hit) => hit.firstSequence), [1, 0])
  db.close()
})

test('searches an exact validated legacy message schema without requiring message_uid', () => {
  const db = new DatabaseSync(':memory:')
  db.exec(`CREATE TABLE messages(
    conv_id TEXT,seq INTEGER,time INTEGER,sender TEXT,sender_name TEXT,
    type INTEGER,type_label TEXT,text TEXT
  ); INSERT INTO messages VALUES
    ('legacy-conv',8,100,'member','成员','1','text','旧版实时检索');`)

  const first = liveMessageSearch(db, { query: '实时', limit: 10 })
  const repeated = liveMessageSearch(db, { query: '实时', limit: 10 })

  assert.match(first.hits[0]?.firstMessageUid ?? '', /^legacy:/u)
  assert.equal(first.hits[0]?.firstSequence, 8)
  assert.equal(repeated.hits[0]?.firstMessageUid, first.hits[0]?.firstMessageUid)
  db.close()
})

test('uses legacy sequence order when message_uid exists but is nullable', () => {
  const db = new DatabaseSync(':memory:')
  try {
    db.exec(`CREATE TABLE messages(
      conv_id TEXT,message_uid TEXT,seq INTEGER,time INTEGER,sender TEXT,sender_name TEXT,
      type INTEGER,type_label TEXT,text TEXT
    ); INSERT INTO messages VALUES
      ('legacy-conv',NULL,0,100,'u-a','张三',1,'text','旧版检索'),
      ('legacy-conv',NULL,1,100,'u-b','李四',1,'text','旧版检索'),
      ('legacy-conv',NULL,2,100,'u-a','张三',1,'text','旧版检索');`)
    const result = liveMessageSearch(db, { query: '旧版', limit: 10 })
    assert.deepEqual(result.hits.map((hit) => hit.firstSequence), [2, 1, 0])
    assert.equal(result.hits.every((hit) => hit.firstMessageUid.startsWith('legacy:')), true)
  } finally {
    db.close()
  }
})
