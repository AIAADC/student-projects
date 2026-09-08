import assert from 'node:assert/strict'
import test from 'node:test'

import {
  chooseAccountSnapshots,
  createMessageCoverageKey,
  createMessageSemanticFingerprint,
  normalizeMessageType,
  resolveSenderIdentity,
  type AccountSnapshot,
} from './messageModel.js'

test('binds snapshot coverage and duplicate semantics to identity-relevant message content', () => {
  const base = {
    sourceDb: 'message_0.db',
    sourceTable: 'Msg_fixture',
    localId: 1,
    serverId: '1001',
    rawType: '1',
    time: 1_700_000_000,
    realSender: 'wxid_sender',
    contentHash: 'hash-a',
  }

  assert.notEqual(
    createMessageCoverageKey(base),
    createMessageCoverageKey({ ...base, contentHash: 'hash-b' }),
  )
  assert.notEqual(
    createMessageCoverageKey(base),
    createMessageCoverageKey({ ...base, realSender: 'wxid_other' }),
  )

  const semantic = { time: base.time, rawType: base.rawType, sender: base.realSender, text: '中文正文' }
  assert.equal(
    createMessageSemanticFingerprint(semantic),
    createMessageSemanticFingerprint({ ...semantic }),
  )
  assert.notEqual(
    createMessageSemanticFingerprint(semantic),
    createMessageSemanticFingerprint({ ...semantic, text: '被篡改的正文' }),
  )
})

test('normalizes the low 32 bits of a 64-bit raw message type', () => {
  const rawType = (0x1234_5678n << 32n) | 49n

  assert.equal(normalizeMessageType(rawType), 49)
  assert.equal(normalizeMessageType(rawType.toString()), 49)
})

test('prefers the message database Name2Id sender over a conflicting group prefix', () => {
  const identity = resolveSenderIdentity({
    isGroup: true,
    conversationUsername: 'project@chatroom',
    messageName2IdSender: 'wxid_authoritative',
    groupPrefixSender: 'wxid_stale_prefix',
    displayNames: {
      wxid_authoritative: '孔德羽',
      wxid_stale_prefix: '错误人物',
    },
  })

  assert.deepEqual(identity, {
    sender: 'wxid_authoritative',
    senderName: '孔德羽',
    source: 'message-name2id',
    auditReason: 'group-prefix-mismatch',
  })
})

test('accepts a matching group prefix without reporting an identity mismatch', () => {
  const identity = resolveSenderIdentity({
    isGroup: true,
    conversationUsername: 'project@chatroom',
    messageName2IdSender: 'wxid_member',
    groupPrefixSender: 'wxid_member',
  })

  assert.deepEqual(identity, {
    sender: 'wxid_member',
    senderName: 'wxid_member',
    source: 'message-name2id',
    auditReason: null,
  })
})

test('falls back to the group prefix only when Name2Id has no sender', () => {
  const identity = resolveSenderIdentity({
    isGroup: true,
    conversationUsername: 'project@chatroom',
    groupPrefixSender: 'wxid_prefix_only',
  })

  assert.deepEqual(identity, {
    sender: 'wxid_prefix_only',
    senderName: 'wxid_prefix_only',
    source: 'group-prefix',
    auditReason: 'message-name2id-missing',
  })
})

test('resolves private messages as self, peer, or an explicit unknown', () => {
  const shared = {
    isGroup: false,
    conversationUsername: 'wxid_peer',
    ownerUsername: 'wxid_owner',
    displayNames: {
      wxid_owner: '我',
      wxid_peer: '陈同学',
    },
  } as const

  assert.deepEqual(resolveSenderIdentity({ ...shared, privateDirection: 'self' }), {
    sender: 'wxid_owner',
    senderName: '我',
    source: 'private-self',
    auditReason: 'message-name2id-missing',
  })
  assert.deepEqual(resolveSenderIdentity({ ...shared, privateDirection: 'peer' }), {
    sender: 'wxid_peer',
    senderName: '陈同学',
    source: 'private-peer',
    auditReason: 'message-name2id-missing',
  })
  assert.deepEqual(resolveSenderIdentity({ ...shared, privateDirection: 'unknown' }), {
    sender: '',
    senderName: '未知发送人',
    source: 'unknown',
    auditReason: 'private-direction-unknown',
  })
})

test('preserves UTF-8 Chinese display names exactly', () => {
  const senderName = '华中科技大学项目组·张三'
  const identity = resolveSenderIdentity({
    isGroup: true,
    conversationUsername: 'project@chatroom',
    messageName2IdSender: 'wxid_zhangsan',
    displayNames: { wxid_zhangsan: senderName },
  })

  assert.equal(identity.senderName, senderName)
  assert.equal(Buffer.from(identity.senderName, 'utf8').toString('utf8'), senderName)
})

test('drops an older snapshot only when a newer snapshot is a strict message superset', () => {
  const oldSnapshot: AccountSnapshot = {
    snapshotId: 'owner-old',
    ownerIdentity: 'wxid_owner',
    updatedAt: 100,
    conversations: [
      {
        conversationId: 'project@chatroom',
        firstMessageTime: 10,
        messageKeys: ['project:1', 'project:2'],
      },
    ],
  }
  const newSnapshot: AccountSnapshot = {
    snapshotId: 'owner-new',
    ownerIdentity: 'wxid_owner',
    updatedAt: 200,
    conversations: [
      {
        conversationId: 'project@chatroom',
        firstMessageTime: 10,
        messageKeys: ['project:1', 'project:2', 'project:3'],
      },
      {
        conversationId: 'wxid_peer',
        firstMessageTime: 20,
        messageKeys: ['peer:1'],
      },
    ],
  }

  const result = chooseAccountSnapshots([oldSnapshot, newSnapshot])

  assert.deepEqual(result.selected.map((item) => item.snapshotId), ['owner-new'])
  assert.deepEqual(result.excluded, [
    {
      snapshotId: 'owner-old',
      supersededBy: 'owner-new',
      reason: 'strict-subset',
    },
  ])
  assert.deepEqual(result.warnings, [])
})

test('keeps ambiguous same-owner snapshots and snapshots from another owner', () => {
  const snapshots: AccountSnapshot[] = [
    {
      snapshotId: 'owner-left',
      ownerIdentity: 'wxid_owner',
      updatedAt: 100,
      conversations: [
        {
          conversationId: 'project@chatroom',
          firstMessageTime: 10,
          messageKeys: ['project:1', 'project:2'],
        },
      ],
    },
    {
      snapshotId: 'owner-right',
      ownerIdentity: 'wxid_owner',
      updatedAt: 200,
      conversations: [
        {
          conversationId: 'project@chatroom',
          firstMessageTime: 11,
          messageKeys: ['project:2', 'project:3'],
        },
      ],
    },
    {
      snapshotId: 'other-owner-copy',
      ownerIdentity: 'wxid_other',
      updatedAt: 300,
      conversations: [
        {
          conversationId: 'project@chatroom',
          firstMessageTime: 10,
          messageKeys: ['project:1', 'project:2', 'project:3'],
        },
      ],
    },
  ]

  const result = chooseAccountSnapshots(snapshots)

  assert.deepEqual(
    result.selected.map((item) => item.snapshotId),
    ['owner-left', 'owner-right', 'other-owner-copy'],
  )
  assert.deepEqual(result.excluded, [])
  assert.deepEqual(result.warnings, [
    {
      ownerIdentity: 'wxid_owner',
      snapshotIds: ['owner-left', 'owner-right'],
      reason: 'coverage-not-strict',
    },
  ])
})
