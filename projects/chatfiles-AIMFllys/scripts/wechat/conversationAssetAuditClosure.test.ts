import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'
import { createAssetRunReceipt, createMaterializationEvidenceDigest } from './assetRunReceipt.js'
import { fingerprintDirectory } from './assetBundleBinding.js'
import { auditConversationAssetBundle } from './conversationAssetAudit.js'
import {
  completeAssetRun,
  createOutputSchema,
  startAssetRun,
} from './conversationAssetBuilderSchema.js'
import { emptyConversationAssetMetrics, type ConversationAssetCounts } from './conversationAssetBuilderSupport.js'

const digest = `sha256:${'a'.repeat(64)}`

test('closes audit receipt over the persisted run identity, timestamp, and counters', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chatfiles-asset-receipt-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const bundleDir = path.join(root, 'bundle')
  const accountRoot = path.join(root, 'account')
  fs.mkdirSync(bundleDir)
  fs.mkdirSync(accountRoot)
  const binding = {
    owner: 'owner',
    sourceSnapshotId: 'snapshot',
    sourceSnapshotRootFingerprint: digest,
    accountRootFingerprint: fingerprintDirectory(accountRoot),
    canonicalRunId: 'canonical-run',
    canonicalSchemaVersion: 2,
    canonicalDatabaseSha256: digest,
    sourceManifestSha256: digest,
    resourceDatabaseSha256: digest,
  }
  const counts: ConversationAssetCounts = { all: 0,work: 0,document: 0,skill: 0,link: 0,chatText: 0 }
  const metrics = emptyConversationAssetMetrics()
  const completedAt = '2026-07-12T12:00:00.000Z'
  const databasePath = path.join(bundleDir, 'artifacts.db')
  const database = new DatabaseSync(databasePath)
  createOutputSchema(database)
  startAssetRun(database, 'run', binding)
  const materializationEvidenceSha256 = createMaterializationEvidenceDigest(database)
  const receipt = createAssetRunReceipt({
    runId: 'run',completedAt,binding,counts,metrics,materializationEvidenceSha256,
  })
  assert.notEqual(receipt, createAssetRunReceipt({
    runId: 'run',
    completedAt: '2026-07-12T12:00:01.000Z',
    binding,
    counts,
    metrics,
    materializationEvidenceSha256,
  }))
  completeAssetRun(database, 'run', completedAt, metrics, receipt)
  database.close()
  fs.writeFileSync(path.join(bundleDir, 'index.json'), `${JSON.stringify({
    version: 2,runId: 'run',completedAt,binding,counts,metrics,
    materializationEvidenceSha256,receipt,
  })}\n`, 'utf8')
  assert.equal(auditConversationAssetBundle({ bundleDir, accountRoot }).ok, true)

  const tamper = new DatabaseSync(databasePath)
  tamper.exec('UPDATE asset_runs SET source_count=1')
  tamper.close()
  assert.equal(
    auditConversationAssetBundle({ bundleDir, accountRoot }).issues
      .some((issue) => issue.code === 'run-count-mismatch:source_count'),
    true,
  )

  const identityTamper = new DatabaseSync(databasePath)
  identityTamper.exec(`UPDATE asset_runs SET source_count=0,run_id='changed',completed_at='changed'`)
  identityTamper.close()
  const identityIssues = auditConversationAssetBundle({ bundleDir, accountRoot }).issues
  assert.equal(identityIssues.some((issue) => issue.code === 'run-id-mismatch'), true)
  assert.equal(identityIssues.some((issue) => issue.code === 'run-completed-at-mismatch'), true)
})
