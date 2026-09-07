import assert from 'node:assert/strict'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

import { auditWechatDatabase } from './chatAudit.js'
import { auditSourceIdentity } from './sourceIdentityAudit.js'
import {
  createOutputDatabase,
  createSourceShard,
  fixture,
  messageTable,
} from './sourceIdentityAuditTestFixtures.js'
test('rejects a conversation display that differs from the snapshot contact display', () => {
  const item = fixture()
  try {
    item.track(createSourceShard(item.sourceRoot, 'message_0.db', [[8, 'wxid_peer']], [{
      localId: 12,
      serverId: 412n,
      rawType: 1n,
      sortSeq: 22,
      realSenderId: 8,
      time: 1_700_000_412,
      content: '源正文',
    }]))
    const outputDb = item.track(createOutputDatabase(item.dir, {
      display: '伪造的会话名',
      rows: [{
        uid: 'uid-mutated-conversation-display',
        sourceDb: 'message_0.db',
        localId: 12,
        serverId: 412n,
        rawType: 1n,
        sortSeq: 22,
        time: 1_700_000_412,
        sender: 'wxid_peer',
        senderName: '陈同学',
        text: '源正文',
      }],
    }))

    const result = auditSourceIdentity(outputDb, item.sourceRoot)

    assert.equal(result.ok, false)
    assert.equal(
      result.issues.some((issue) => issue.code === 'source-conversation-display-mismatch'),
      true,
    )
  } finally {
    item.cleanup()
  }
})

test('rejects a valid-contact substitution whose conversation id and source table belong to another peer', () => {
  const item = fixture()
  try {
    const replacement = String.fromCodePoint(0xfffd)
    const sourceText = `源${replacement}正文`
    item.track(createSourceShard(item.sourceRoot, 'message_0.db', [[7, 'wxid_owner']], [{
      localId: 13,
      serverId: 413n,
      rawType: 1n,
      sortSeq: 23,
      realSenderId: 7,
      time: 1_700_000_413,
      content: sourceText,
    }], 'wxid_peer'))
    const outputDb = item.track(createOutputDatabase(item.dir, {
      id: 'wx:wxid_owner:wxid_peer',
      peer: 'wxid_alternate',
      display: '另一个联系人',
      rows: [{
        uid: 'uid-contact-substitution',
        sourceDb: 'message_0.db',
        sourceTable: messageTable('wxid_peer'),
        localId: 13,
        serverId: 413n,
        rawType: 1n,
        sortSeq: 23,
        time: 1_700_000_413,
        sender: 'wxid_owner',
        senderName: '机主',
        text: sourceText,
      }],
    }))

    const standalone = auditWechatDatabase(outputDb)
    assert.deepEqual(standalone.issues.map((issue) => issue.code), ['replacement-character'])

    const sourceAudit = auditSourceIdentity(outputDb, item.sourceRoot)
    assert.equal(sourceAudit.ok, false)
    assert.deepEqual(sourceAudit.issues, [
      {
        code: 'source-conversation-id-mismatch',
        count: 1,
        detail: 'The output conversation id is not the canonical owner/username identity.',
        samples: [],
      },
      {
        code: 'source-message-table-mismatch',
        count: 1,
        detail: 'The output message table is not the UTF-8 username-derived source table.',
        samples: [],
      },
    ])

    const cli = spawnSync(process.execPath, [
      '--import',
      'tsx',
      path.resolve(process.cwd(), 'scripts', 'auditChatIdentity.ts'),
      '--db',
      outputDb,
      '--source',
      item.sourceRoot,
      '--strict',
    ], { cwd: process.cwd(), encoding: 'utf8' })
    assert.equal(cli.status, 1, cli.stderr || cli.stdout)
    const payload = JSON.parse(cli.stdout) as {
      ok: boolean
      replacementCharacterReconciliation: { reconciled: boolean }
      sourceIdentity: { issues: Array<{ code: string }> }
    }
    assert.equal(payload.ok, false)
    assert.equal(payload.replacementCharacterReconciliation.reconciled, true)
    assert.equal(
      payload.sourceIdentity.issues.some(
        (issue) => issue.code === 'source-conversation-id-mismatch',
      ),
      true,
    )
    assert.equal(
      payload.sourceIdentity.issues.some(
        (issue) => issue.code === 'source-message-table-mismatch',
      ),
      true,
    )
  } finally {
    item.cleanup()
  }
})
