import assert from 'node:assert/strict'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

import { auditSourceIdentity } from './sourceIdentityAudit.js'
import { createOutputDatabase, createSourceShard, fixture } from './sourceIdentityAuditTestFixtures.js'
test('keeps identical Name2Id rowids isolated between source message shards', () => {
  const item = fixture()
  try {
    const rawType = 9_223_372_032_559_808_513n
    item.track(createSourceShard(item.sourceRoot, 'message_0.db', [[7, 'wxid_owner']], [{
      localId: 12,
      serverId: 9_007_199_254_740_999n,
      rawType,
      sortSeq: 90,
      realSenderId: 7,
      time: 1_700_000_000,
      content: '我发送的中文',
    }]))
    item.track(createSourceShard(item.sourceRoot, 'message_1.db', [[7, 'wxid_peer']], [{
      localId: 12,
      serverId: 9_007_199_254_741_001n,
      rawType,
      sortSeq: 91,
      realSenderId: 7,
      time: 1_700_000_001,
      content: '对方发送的中文',
    }]))
    const outputDb = item.track(createOutputDatabase(item.dir, { rows: [
      {
        uid: 'uid-left', sourceDb: 'message_0.db', localId: 12,
        serverId: 9_007_199_254_740_999n, rawType, sortSeq: 90,
        time: 1_700_000_000, sender: 'wxid_owner', senderName: '机主',
        text: '我发送的中文',
      },
      {
        uid: 'uid-right', sourceDb: 'message_1.db', localId: 12,
        serverId: 9_007_199_254_741_001n, rawType, sortSeq: 91,
        time: 1_700_000_001, sender: 'wxid_peer', senderName: '陈同学',
        text: '对方发送的中文',
      },
    ] }))

    const result = auditSourceIdentity(outputDb, item.sourceRoot)

    assert.equal(result.ok, true)
    assert.deepEqual(result.issues, [])
    assert.equal(result.metrics.outputMessages, 2)
    assert.equal(result.metrics.matchedMessages, 2)
    assert.equal(result.metrics.sourceShards, 2)
  } finally {
    item.cleanup()
  }
})

test('rejects a private conversation whose peer message is spoofed as the owner', () => {
  const item = fixture()
  try {
    const rawType = 1n
    item.track(createSourceShard(item.sourceRoot, 'message_0.db', [
      [7, 'wxid_owner'],
      [8, 'wxid_peer'],
    ], [
      {
        localId: 1, serverId: 101n, rawType, sortSeq: 1, realSenderId: 7,
        time: 1_700_000_000, content: '本人消息',
      },
      {
        localId: 2, serverId: 102n, rawType, sortSeq: 2, realSenderId: 8,
        time: 1_700_000_001, content: '对方消息',
      },
    ]))
    const outputDb = item.track(createOutputDatabase(item.dir, { rows: [
      {
        uid: 'uid-owner', sourceDb: 'message_0.db', localId: 1,
        serverId: 101n, rawType, sortSeq: 1, time: 1_700_000_000,
        sender: 'wxid_owner', senderName: '机主', text: '本人消息',
      },
      {
        uid: 'uid-spoofed-peer', sourceDb: 'message_0.db', localId: 2,
        serverId: 102n, rawType, sortSeq: 2, time: 1_700_000_001,
        sender: 'wxid_owner', senderName: '机主', text: '对方消息',
      },
    ] }))

    const result = auditSourceIdentity(outputDb, item.sourceRoot)

    assert.equal(result.ok, false)
    assert.equal(result.issues.find((issue) => issue.code === 'source-sender-mismatch')?.count, 1)
  } finally {
    item.cleanup()
  }
})

test('strict CLI exits non-zero when source identity alignment fails', () => {
  const item = fixture()
  try {
    item.track(createSourceShard(item.sourceRoot, 'message_0.db', [
      [7, 'wxid_owner'],
      [8, 'wxid_peer'],
    ], [
      {
        localId: 1, serverId: 101n, rawType: 1n, sortSeq: 1, realSenderId: 7,
        time: 1_700_000_000, content: '本人消息',
      },
      {
        localId: 2, serverId: 102n, rawType: 1n, sortSeq: 2, realSenderId: 8,
        time: 1_700_000_001, content: '对方消息',
      },
    ]))
    const outputDb = item.track(createOutputDatabase(item.dir, { rows: [
      {
        uid: 'uid-owner', sourceDb: 'message_0.db', localId: 1,
        serverId: 101n, rawType: 1n, sortSeq: 1, time: 1_700_000_000,
        sender: 'wxid_owner', senderName: '机主', text: '本人消息',
      },
      {
        uid: 'uid-spoofed-peer', sourceDb: 'message_0.db', localId: 2,
        serverId: 102n, rawType: 1n, sortSeq: 2, time: 1_700_000_001,
        sender: 'wxid_owner', senderName: '机主', text: '对方消息',
      },
    ] }))

    const cli = spawnSync(process.execPath, [
      '--import',
      'tsx',
      path.resolve(process.cwd(), 'scripts', 'auditChatIdentity.ts'),
      '--db',
      outputDb,
      '--source',
      item.sourceRoot,
      '--strict',
    ], {
      cwd: process.cwd(),
      encoding: 'utf8',
    })

    assert.equal(cli.status, 1, cli.stderr || cli.stdout)
    const payload = JSON.parse(cli.stdout) as {
      issues: unknown[]
      sourceIdentity: { issues: Array<{ code: string }> }
    }
    assert.deepEqual(payload.issues, [])
    assert.equal(
      payload.sourceIdentity.issues.some((issue) => issue.code === 'source-sender-mismatch'),
      true,
    )
  } finally {
    item.cleanup()
  }
})

test('reports missing source rows and every immutable source-field conflict', () => {
  const item = fixture()
  try {
    item.track(createSourceShard(item.sourceRoot, 'message_0.db', [[7, 'wxid_member']], [{
      localId: 1,
      serverId: 201n,
      rawType: 49n,
      sortSeq: 11,
      realSenderId: 7,
      time: 1_700_000_100,
      content: 'wxid_member:\n群聊中文正文',
    }], 'room@chatroom'))
    const outputDb = item.track(createOutputDatabase(item.dir, {
      owner: 'wxid_owner',
      peer: 'room@chatroom',
      isGroup: true,
      rows: [
        {
          uid: 'uid-conflict', sourceDb: 'message_0.db', localId: 1,
          serverId: 999n, rawType: 3n, sortSeq: 99, time: 1_700_000_999,
          sender: 'wxid_member', senderName: '群成员甲', senderPrefix: 'wxid_wrong_prefix',
          text: '[链接/应用消息]',
        },
        {
          uid: 'uid-missing', sourceDb: 'message_0.db', localId: 404,
          serverId: 404n, rawType: 1n, sortSeq: 404, time: 1_700_000_404,
          sender: 'wxid_member',
        },
      ],
    }))

    const result = auditSourceIdentity(outputDb, item.sourceRoot)
    const codes = new Set(result.issues.map((issue) => issue.code))

    assert.equal(result.ok, false)
    assert.equal(codes.has('source-row-missing'), true)
    assert.equal(codes.has('source-server-id-mismatch'), true)
    assert.equal(codes.has('source-raw-type-mismatch'), true)
    assert.equal(codes.has('source-time-mismatch'), true)
    assert.equal(codes.has('source-sort-seq-mismatch'), true)
    assert.equal(codes.has('source-group-prefix-mismatch'), true)
  } finally {
    item.cleanup()
  }
})
