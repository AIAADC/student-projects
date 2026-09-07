import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { DatabaseSync } from 'node:sqlite'

function timelineFixture() {
  const db = new DatabaseSync(':memory:')
  db.exec(`
    CREATE TABLE conversations(
      id TEXT PRIMARY KEY, display TEXT, is_group INTEGER, msg_count INTEGER,
      text_count INTEGER, first_time INTEGER, last_time INTEGER
    );
    CREATE TABLE messages(
      conv_id TEXT, message_uid TEXT PRIMARY KEY, seq INTEGER, canonical_seq INTEGER,
      occurred_at_epoch_s INTEGER, time_precision TEXT, archive_day TEXT, time INTEGER,
      sender TEXT, person_id TEXT, sender_name TEXT, type INTEGER, type_label TEXT, text TEXT
    );
    INSERT INTO conversations VALUES ('conv-a','测试会话',1,5,5,100,172800);
    INSERT INTO messages VALUES
      ('conv-a','m-2',0,0,100,'second','1970-01-01',100,'u-2','p-2','李四',1,'文本','进度 100%_完成\\路径'),
      ('conv-a','m-1',1,1,100,'second','1970-01-01',100,'u-1','p-1','张三',1,'文本','中文🙂'),
      ('conv-a','m-3',2,2,86400,'second','1970-01-02',86400,'u-1','p-1','张三',1,'文本','第三条'),
      ('conv-a','m-5',3,3,172800,'second','1970-01-03',172800,'u-1','p-1','张三',1,'文本','第五条'),
      ('conv-a','m-4',4,4,172800,'second','1970-01-03',172800,'u-2','p-2','李四',1,'文本','第四条');
    CREATE TABLE parse_runs(run_id TEXT,time_zone TEXT);
    INSERT INTO parse_runs VALUES ('run-fixture','Asia/Shanghai');
  `)
  return db
}

function minimalLegacyTimelineFixture() {
  const db = new DatabaseSync(':memory:')
  db.exec(`
    CREATE TABLE conversations(
      id TEXT PRIMARY KEY, display TEXT, is_group INTEGER, msg_count INTEGER,
      text_count INTEGER, first_time INTEGER, last_time INTEGER
    );
    CREATE TABLE messages(
      conv_id TEXT, seq INTEGER, time INTEGER, sender TEXT, sender_name TEXT,
      type INTEGER, type_label TEXT, text TEXT
    );
    INSERT INTO conversations VALUES ('legacy-conv','旧会话',0,3,3,100,100);
    INSERT INTO messages VALUES
      ('legacy-conv',0,100,'u-1','张三',1,'文本','旧消息一'),
      ('legacy-conv',1,100,'u-2','李四',1,'文本','旧消息二'),
      ('legacy-conv',2,100,'u-1','张三',1,'文本','旧消息三');
  `)
  return db
}

function nullableLegacyTimelineFixture() {
  const db = new DatabaseSync(':memory:')
  db.exec(`
    CREATE TABLE messages(
      conv_id TEXT, message_uid TEXT, seq INTEGER, time INTEGER, sender TEXT, sender_name TEXT,
      type INTEGER, type_label TEXT, text TEXT
    );
    INSERT INTO messages VALUES
      ('legacy-conv',NULL,0,100,'u-1','张三',1,'文本','旧消息一'),
      ('legacy-conv',NULL,1,100,'u-2','李四',1,'文本','旧消息二'),
      ('legacy-conv',NULL,2,100,'u-1','张三',1,'文本','旧消息三');
  `)
  return db
}

async function timelineModule() {
  const modulePath = path.resolve(process.cwd(), 'server/services/chatTimeline.ts')
  assert.equal(fs.existsSync(modulePath), true)
  return import('./chatTimeline.js')
}

test('pages a timeline with run-bound canonical sequence cursors', async () => {
  const timeline = await timelineModule()
  const db = timelineFixture()
  try {
    const before = timeline.queryTimeline(db, {
      conversationId: 'conv-a',
      limit: 2,
      before: timeline.encodeTimelineCursor({
        version: 2, runId: 'run-fixture', sequence: 2, messageUid: 'm-3',
      }),
    })
    assert.deepEqual(before.messages.map((message) => message.message_uid), ['m-2', 'm-1'])
    assert.equal(before.messages[1]?.text, '中文🙂')
    assert.equal(before.runId, 'run-fixture')
    assert.equal(before.timeZone, 'Asia/Shanghai')

    const after = timeline.queryTimeline(db, {
      conversationId: 'conv-a',
      limit: 2,
      after: timeline.encodeTimelineCursor({
        version: 2, runId: 'run-fixture', sequence: 1, messageUid: 'm-1',
      }),
    })
    assert.deepEqual(after.messages.map((message) => message.message_uid), ['m-3', 'm-5'])

    const latest = timeline.queryTimeline(db, { conversationId: 'conv-a', limit: 2 })
    assert.deepEqual(latest.messages.map((message) => message.message_uid), ['m-5', 'm-4'])
    assert.ok(latest.pageInfo.olderCursor)
    assert.equal(latest.pageInfo.hasOlder, true)
    assert.equal(latest.pageInfo.hasNewer, false)
  } finally {
    db.close()
  }
})

test('filters senders and treats wildcard search characters literally', async () => {
  const timeline = await timelineModule()
  const db = timelineFixture()
  try {
    const sender = timeline.queryTimeline(db, { conversationId: 'conv-a', limit: 120, sender: 'u-1' })
    assert.deepEqual(sender.messages.map((message) => message.sender), ['u-1', 'u-1', 'u-1'])

    const searched = timeline.queryTimeline(db, { conversationId: 'conv-a', limit: 120, query: '%_完成\\' })
    assert.deepEqual(searched.messages.map((message) => message.message_uid), ['m-2'])
    assert.equal(searched.messages[0]?.text, '进度 100%_完成\\路径')
  } finally {
    db.close()
  }
})

test('loads around canonical anchors and decodes legacy cursors only for compatibility', async () => {
  const timeline = await timelineModule()
  const db = timelineFixture()
  try {
    assert.equal(timeline.decodeTimelineCursor('not-a-cursor'), null)
    const legacy = Buffer.from(JSON.stringify([200, 'm-3']), 'utf8').toString('base64url')
    assert.deepEqual(timeline.decodeTimelineCursor(legacy), { legacy: true, time: 200, messageUid: 'm-3' })
    const around = timeline.queryTimeline(db, {
      conversationId: 'conv-a',
      limit: 3,
      around: timeline.encodeTimelineCursor({
        version: 2, runId: 'run-fixture', sequence: 2, messageUid: 'm-3',
      }),
    })
    assert.deepEqual(around.messages.map((message) => message.message_uid), ['m-1', 'm-3', 'm-5'])
    assert.equal(timeline.queryTimeline(db, { conversationId: 'conv-a', limit: 1000 }).limit, 240)
  } finally {
    db.close()
  }
})

test('queries participant and daily facets independently from message pages', async () => {
  const timeline = await timelineModule()
  const db = timelineFixture()
  try {
    const participants = timeline.queryTimelineParticipants(db, { conversationId: 'conv-a' })
    assert.deepEqual(participants.participants[0], {
      senderKey: 'u-1', personId: 'p-1', name: '张三', identitySource: 'person_id',
      messageCount: 3, lastTime: 172800,
    })

    const first = timeline.queryTimelineDays(db, { conversationId: 'conv-a', limit: 2 })
    assert.deepEqual(first.days, [
      { date: '1970-01-03', firstMessageUid: 'm-5', firstSequence: 3, messageCount: 2 },
      { date: '1970-01-02', firstMessageUid: 'm-3', firstSequence: 2, messageCount: 1 },
    ])
    assert.deepEqual(first.pageInfo, { nextCursor: '1970-01-02', hasMore: true })

    const next = timeline.queryTimelineDays(db, {
      conversationId: 'conv-a', limit: 2, before: first.pageInfo.nextCursor!,
    })
    assert.deepEqual(next.days.map((day) => day.date), ['1970-01-01'])
    assert.deepEqual(next.pageInfo, { nextCursor: null, hasMore: false })
  } finally {
    db.close()
  }
})

test('pages the validated minimal legacy schema without requiring message_uid', async () => {
  const timeline = await timelineModule()
  const db = minimalLegacyTimelineFixture()
  try {
    const latest = timeline.queryTimeline(db, { conversationId: 'legacy-conv', limit: 2 })
    assert.deepEqual(latest.messages.map((message) => message.seq), [1, 2])
    assert.equal(latest.messages.every((message) => message.message_uid.startsWith('legacy:')), true)
    assert.equal(latest.pageInfo.hasOlder, true)
    assert.ok(latest.pageInfo.olderCursor)
  } finally {
    db.close()
  }
})

test('uses sequence evidence when a legacy message_uid column is nullable', async () => {
  const timeline = await timelineModule()
  const db = nullableLegacyTimelineFixture()
  try {
    const latest = timeline.queryTimeline(db, { conversationId: 'legacy-conv', limit: 2 })
    assert.deepEqual(latest.messages.map((message) => message.seq), [1, 2])
    assert.equal(latest.pageInfo.hasOlder, true)
  } finally {
    db.close()
  }
})
