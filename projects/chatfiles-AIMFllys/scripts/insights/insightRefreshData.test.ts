import assert from 'node:assert/strict'
import test from 'node:test'
import { DatabaseSync } from 'node:sqlite'

import * as insightData from './insightRefreshData.js'

test('queries a canonical insight delta strictly after sequence without same-second UID ordering', (t) => {
  const db = new DatabaseSync(':memory:')
  t.after(() => db.close())
  db.exec(`CREATE TABLE messages(
    conv_id TEXT,message_uid TEXT,canonical_seq INTEGER,occurred_at_epoch_s INTEGER,
    time INTEGER,type INTEGER,sender_name TEXT,text TEXT
  ); INSERT INTO messages VALUES
    ('conv','uid-z',0,100,100,1,'甲','起点消息足够长用于提炼'),
    ('conv','uid-a',1,100,100,1,'乙','同秒后续消息必须保留'),
    ('conv','uid-m',2,101,101,1,'丙','下一秒消息继续保留');`)
  const messages = insightData.queryMessages(db, {
    conversation: {
      id: 'conv', display: '会话', isGroup: false, textCount: 3, firstTime: 100, lastTime: 101,
    },
    kind: 'grown',
    since: 100,
    sinceMessageUid: 'uid-z',
    sinceSequence: 0,
    previousTextCount: 1,
  })

  assert.deepEqual(messages.map((message) => message.messageUid), ['uid-a', 'uid-m'])
  assert.deepEqual(messages.map((message) => message.canonicalSequence), [1, 2])
})

test('migrates legacy insight state cursors onto exact canonical sequences', (t) => {
  const db = new DatabaseSync(':memory:')
  t.after(() => db.close())
  db.exec(`CREATE TABLE messages(
    conv_id TEXT,message_uid TEXT,canonical_seq INTEGER,occurred_at_epoch_s INTEGER,
    time INTEGER,type INTEGER,sender_name TEXT,text TEXT
  ); INSERT INTO messages VALUES
    ('conv','uid-z',0,100,100,1,'甲','第一条文本消息足够长'),
    ('conv','uid-a',2,100,100,3,'乙','[图片]'),
    ('conv','uid-m',3,101,101,1,'丙','第二条文本消息足够长');`)
  const bind = (insightData as typeof insightData & {
    bindInsightStateSequences: (
      database: DatabaseSync,
      states: Array<Record<string, unknown>>,
    ) => Array<Record<string, unknown>>
  }).bindInsightStateSequences

  const states = bind(db, [{
    convId: 'conv', analyzedTextCount: 2, analyzedLastTime: 101, analyzedAt: 'legacy',
  }])

  assert.equal(states[0]?.analyzedLastMessageUid, 'uid-m')
  assert.equal(states[0]?.analyzedLastSequence, 3)
})

test('reconstructs a UID-less legacy state using legacy same-second order before binding sequence', (t) => {
  const db = new DatabaseSync(':memory:')
  t.after(() => db.close())
  db.exec(`CREATE TABLE messages(
    conv_id TEXT,message_uid TEXT,canonical_seq INTEGER,occurred_at_epoch_s INTEGER,
    time INTEGER,type INTEGER,sender_name TEXT,text TEXT
  ); INSERT INTO messages VALUES
    ('conv','uid-z',0,100,100,1,'甲','规范顺序第一但旧排序第二'),
    ('conv','uid-a',1,100,100,1,'乙','规范顺序第二但旧排序第一'),
    ('conv','uid-m',2,101,101,1,'丙','下一秒文本消息');`)

  const states = insightData.bindInsightStateSequences(db, [{
    convId: 'conv', analyzedTextCount: 1, analyzedLastTime: 100, analyzedAt: 'legacy',
  }])

  assert.equal(states[0]?.analyzedLastMessageUid, 'uid-a')
  assert.equal(states[0]?.analyzedLastSequence, 1)
})

test('fails closed when a legacy state anchor cannot map to one canonical message', (t) => {
  const db = new DatabaseSync(':memory:')
  t.after(() => db.close())
  db.exec(`CREATE TABLE messages(
    conv_id TEXT,message_uid TEXT,canonical_seq INTEGER,occurred_at_epoch_s INTEGER,
    time INTEGER,type INTEGER,sender_name TEXT,text TEXT
  ); INSERT INTO messages VALUES
    ('conv','duplicate',0,100,100,1,'甲','第一条重复锚点'),
    ('conv','duplicate',1,100,100,1,'乙','第二条重复锚点');`)

  assert.throws(() => insightData.bindInsightStateSequences(db, [{
    convId: 'conv', analyzedTextCount: 1, analyzedLastTime: 100, analyzedAt: 'legacy',
  }]), /does not resolve onto canonical sequence/u)
})
