import assert from 'node:assert/strict'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { DatabaseSync } from 'node:sqlite'

import { auditWechatDatabase } from './chatAudit.js'
import { auditSourceIdentity } from './sourceIdentityAudit.js'
import { createOutputDatabase, createSourceShard, fixture } from './sourceIdentityAuditTestFixtures.js'
test('rejects mutated output text and sender display name despite exact source provenance', () => {
  const item = fixture()
  try {
    item.track(createSourceShard(item.sourceRoot, 'message_0.db', [[8, 'wxid_peer']], [{
      localId: 9,
      serverId: 309n,
      rawType: 1n,
      sortSeq: 19,
      realSenderId: 8,
      time: 1_700_000_309,
      content: '源中文正文',
    }]))
    const outputDb = item.track(createOutputDatabase(item.dir, { rows: [{
      uid: 'uid-mutated',
      sourceDb: 'message_0.db',
      localId: 9,
      serverId: 309n,
      rawType: 1n,
      sortSeq: 19,
      time: 1_700_000_309,
      sender: 'wxid_peer',
      senderName: '伪造人物',
      text: '被篡改的中文正文',
    }] }))

    const result = auditSourceIdentity(outputDb, item.sourceRoot)
    const codes = new Set(result.issues.map((issue) => issue.code))

    assert.equal(result.ok, false)
    assert.equal(codes.has('source-text-mismatch'), true)
    assert.equal(codes.has('source-sender-name-mismatch'), true)
  } finally {
    item.cleanup()
  }
})

test('accepts source-origin replacement characters only with exact text and display provenance', () => {
  const item = fixture()
  try {
    const replacement = String.fromCodePoint(0xfffd)
    const sourceDisplay = `陈${replacement}同学`
    const sourceText = `源${replacement}正文`
    const contactDb = new DatabaseSync(item.contactPath)
    try {
      contactDb.prepare('UPDATE contact SET nick_name=? WHERE username=?').run(sourceDisplay, 'wxid_peer')
    } finally {
      contactDb.close()
    }
    item.track(createSourceShard(item.sourceRoot, 'message_0.db', [[8, 'wxid_peer']], [{
      localId: 10,
      serverId: 410n,
      rawType: 1n,
      sortSeq: 20,
      realSenderId: 8,
      time: 1_700_000_410,
      content: sourceText,
    }]))
    const outputDb = item.track(createOutputDatabase(item.dir, {
      display: sourceDisplay,
      rows: [{
        uid: 'uid-source-replacement',
        sourceDb: 'message_0.db',
        localId: 10,
        serverId: 410n,
        rawType: 1n,
        sortSeq: 20,
        time: 1_700_000_410,
        sender: 'wxid_peer',
        senderName: sourceDisplay,
        text: sourceText,
      }],
    }))

    const standalone = auditWechatDatabase(outputDb)
    assert.equal(standalone.ok, false)
    assert.equal(standalone.issues.some((issue) => issue.code === 'replacement-character'), true)

    const sourceAudit = auditSourceIdentity(outputDb, item.sourceRoot)
    assert.equal(sourceAudit.ok, true)
    assert.equal(sourceAudit.metrics.outputReplacementCharacters, 3)
    assert.equal(sourceAudit.metrics.sourceVerifiedReplacementCharacters, 3)
    assert.equal(sourceAudit.metrics.matchedConversationDisplays, 1)

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
    assert.equal(cli.status, 0, cli.stderr || cli.stdout)
    const payload = JSON.parse(cli.stdout) as {
      ok: boolean
      issues: Array<{ code: string }>
      replacementCharacterReconciliation: {
        databaseRows: number
        outputCharacters: number
        sourceVerifiedCharacters: number
        reconciled: boolean
      }
    }
    assert.equal(payload.ok, true)
    assert.equal(payload.issues.some((issue) => issue.code === 'replacement-character'), true)
    assert.deepEqual(payload.replacementCharacterReconciliation, {
      databaseRows: 1,
      outputCharacters: 3,
      sourceVerifiedCharacters: 3,
      reconciled: true,
    })
  } finally {
    item.cleanup()
  }
})

test('rejects an output replacement character not present in the exact source text', () => {
  const item = fixture()
  try {
    const replacement = String.fromCodePoint(0xfffd)
    item.track(createSourceShard(item.sourceRoot, 'message_0.db', [[8, 'wxid_peer']], [{
      localId: 11,
      serverId: 411n,
      rawType: 1n,
      sortSeq: 21,
      realSenderId: 8,
      time: 1_700_000_411,
      content: '未经修改的源正文',
    }]))
    const outputDb = item.track(createOutputDatabase(item.dir, { rows: [{
      uid: 'uid-injected-replacement',
      sourceDb: 'message_0.db',
      localId: 11,
      serverId: 411n,
      rawType: 1n,
      sortSeq: 21,
      time: 1_700_000_411,
      sender: 'wxid_peer',
      senderName: '陈同学',
      text: `被注入${replacement}的正文`,
    }] }))

    const sourceAudit = auditSourceIdentity(outputDb, item.sourceRoot)
    assert.equal(sourceAudit.ok, false)
    assert.equal(sourceAudit.issues.some((issue) => issue.code === 'source-text-mismatch'), true)
    assert.equal(sourceAudit.metrics.outputReplacementCharacters, 1)
    assert.equal(sourceAudit.metrics.sourceVerifiedReplacementCharacters, 0)

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
      replacementCharacterReconciliation: { reconciled: boolean }
    }
    assert.equal(payload.replacementCharacterReconciliation.reconciled, false)
  } finally {
    item.cleanup()
  }
})
