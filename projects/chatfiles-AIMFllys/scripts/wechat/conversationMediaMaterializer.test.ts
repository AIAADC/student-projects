import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'
import { hasMaterializedMediaMagic } from '../../shared/media/mediaMagic.js'
import { MINIMAL_JPEG_HEX } from '../../shared/media/mediaMagicFixtures.js'
import { digestFileContent } from './assetContentDigest.js'
import { fingerprintDirectory, type AssetBundleBinding } from './assetBundleBinding.js'
import { createAssetRunReceipt, createMaterializationEvidenceDigest } from './assetRunReceipt.js'
import { auditConversationAssetV2Bundle } from './conversationAssetV2Audit.js'
import { materializeConversationMediaBundle } from './conversationMediaMaterializer.js'
import { createResourceArtifact, type AssetCanonicalMessage } from './conversationAssetModel.js'
import { persistConversationAsset } from './conversationAssetMetrics.js'
import {
  artifactInserter,
  completeAssetRun,
  createOutputSchema,
  startAssetRun,
} from './conversationAssetBuilderSchema.js'
import { emptyConversationAssetMetrics } from './conversationAssetBuilderSupport.js'

const KEY = Buffer.from('0123456789abcdef', 'ascii')
const HASH = '1'.repeat(32)

function encodeV2(content: Buffer) {
  const aesSize = 17
  const xorSize = 3
  const prefix = content.subarray(0, aesSize)
  const padding = 16 - (aesSize % 16)
  const cipher = crypto.createCipheriv('aes-128-ecb', KEY, null)
  cipher.setAutoPadding(false)
  const header = Buffer.alloc(15)
  Buffer.from([0x07, 0x08, 0x56, 0x32, 0x08, 0x07]).copy(header)
  header.writeUInt32LE(aesSize, 6)
  header.writeUInt32LE(xorSize, 10)
  return Buffer.concat([
    header,cipher.update(Buffer.concat([prefix, Buffer.alloc(padding, padding)])),cipher.final(),
    content.subarray(aesSize, content.length - xorSize),
    Buffer.from(content.subarray(content.length - xorSize).map((value) => value ^ 0x88)),
  ])
}

function message(): AssetCanonicalMessage {
  return {
    conv_id: 'conv-a',canonical_seq: 0,occurred_at_epoch_s: 1_700_000_000,
    source_snapshot: 'snapshot-a',source_adapter: 'regular',conversation_username: 'room@chatroom',
    sender_name: '成员甲',structured_content_json: '{}',text: '[图片]',message_uid: 'uid-a',source_db: 'message_0.db',
    chat_table: 'room@chatroom',message_table: 'Msg_fixture',local_id: 7,normalized_type: 3,
    raw_type: '3',create_time: 1_700_000_000,server_id: '9001',message_origin_source: 0,
  }
}

test('refreshes run receipt and passes audit only after verified dat materialization', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chatfiles-media-run-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const accountRoot = path.join(root, 'account')
  const bundleDir = path.join(root, 'chat-assets.next')
  const sourceRoot = path.join(root, 'snapshot')
  fs.mkdirSync(path.join(accountRoot, 'attach'), { recursive: true })
  fs.mkdirSync(bundleDir)
  fs.mkdirSync(sourceRoot)
  const jpeg = Buffer.from(MINIMAL_JPEG_HEX, 'hex')
  const encoded = encodeV2(jpeg)
  const datPath = path.join(accountRoot, 'attach', `${HASH}.dat`)
  fs.writeFileSync(datPath, encoded)
  const databasePath = path.join(bundleDir, 'artifacts.db')
  const database = new DatabaseSync(databasePath)
  createOutputSchema(database)
  const zeroDigest = `sha256:${'0'.repeat(64)}`
  const binding: AssetBundleBinding = {
    owner: 'owner-a',sourceSnapshotId: 'snapshot-a',
    sourceSnapshotRootFingerprint: fingerprintDirectory(sourceRoot),
    accountRootFingerprint: fingerprintDirectory(accountRoot),canonicalRunId: 'canonical-run',
    canonicalSchemaVersion: 2,canonicalDatabaseSha256: zeroDigest,
    sourceManifestSha256: zeroDigest,resourceDatabaseSha256: zeroDigest,
  }
  const runId = 'media-fixture'
  startAssetRun(database, runId, binding)
  const record = createResourceArtifact({
    message: message(),
    alignment: {
      status: 'exact',resource_message_id: 'resource-message',message_uid: 'uid-a',candidate_message_uids: ['uid-a'],
      matched_fields: ['local_id','server_id'],missing_fields: [],conflicting_fields: [],
    },
    resourceChatScope: 'room@chatroom',resourceMessageId: 'resource-message',resourceId: '1',
    resourceType: 'image',dataIndex: '0',expectedSize: encoded.length,detailStatus: 0,
    lookupEvidence: [HASH],filenames: [`${HASH}.dat`],packedInfoPayloadSha256: zeroDigest,
    packedInfoValid: true,detailPackedInfoValid: true,sourceContentSha256: digestFileContent(datPath),
    fileMatch: {
      status: 'lookup_exact',candidate: {
        absolutePath: datPath,relativePath: `attach/${HASH}.dat`,name: `${HASH}.dat`,size: encoded.length,
      },candidates: [],
    },
  })
  const metrics = emptyConversationAssetMetrics()
  persistConversationAsset(artifactInserter(database, runId), metrics, record)
  metrics.resources++
  metrics.exactAlignments++
  const counts = { all: 1,work: 1,document: 0,skill: 0,link: 0,chatText: 0 }
  const completedAt = '2026-07-13T00:00:00.000Z'
  const materializationEvidenceSha256 = createMaterializationEvidenceDigest(database)
  const receipt = createAssetRunReceipt({
    runId,completedAt,binding,counts,metrics,materializationEvidenceSha256,
  })
  completeAssetRun(database, runId, completedAt, metrics, receipt)
  database.exec('PRAGMA journal_mode=DELETE')
  database.close()
  fs.writeFileSync(path.join(bundleDir, 'index.json'), `${JSON.stringify({
    version: 2,runId,completedAt,binding,counts,metrics,materializationEvidenceSha256,receipt,
  }, null, 2)}\n`, 'utf8')
  const supplied = Buffer.from(KEY)

  await assert.rejects(materializeConversationMediaBundle({
    bundleDir,accountRoot,keyProvider: { provide: async () => supplied },concurrency: 1,
    publishIndex: () => { throw new Error('FIXTURE_INDEX_INTERRUPTED') },
  }), /FIXTURE_INDEX_INTERRUPTED/u)
  assert.equal(fs.existsSync(path.join(bundleDir, '.media-materialization.json')), true)
  assert.equal(auditConversationAssetV2Bundle({ bundleDir,accountRoot }).issues.some((issue) => (
    issue.code === 'materialization-journal-present'
  )), true)
  const indexPath = path.join(bundleDir, 'index.json')
  const interruptedPrevious = `${indexPath}.previous`
  fs.renameSync(indexPath, interruptedPrevious)
  const result = await materializeConversationMediaBundle({
    bundleDir,accountRoot,keyProvider: { provide: async () => null },concurrency: 1,
  })

  assert.deepEqual(result, { attempted: 0,ready: 0,failed: 0 })
  assert.equal(fs.existsSync(interruptedPrevious), false)
  assert.equal(fs.existsSync(path.join(bundleDir, '.media-materialization.json')), false)
  assert.deepEqual(supplied, Buffer.alloc(16))
  const updated = new DatabaseSync(databasePath, { readOnly: true })
  const run = updated.prepare(`
    SELECT ready_count,not_attempted_count,unavailable_count,audit_receipt_sha256 FROM asset_runs
  `).get() as Record<string, unknown>
  updated.close()
  const index = JSON.parse(fs.readFileSync(path.join(bundleDir, 'index.json'), 'utf8'))
  assert.deepEqual(
    { ready: run.ready_count,notAttempted: run.not_attempted_count,unavailable: run.unavailable_count },
    { ready: 1,notAttempted: 0,unavailable: 0 },
  )
  assert.equal(index.receipt, run.audit_receipt_sha256)
  const audit = auditConversationAssetV2Bundle({ bundleDir,accountRoot })
  assert.deepEqual(audit.issues, [])
  assert.equal(audit.ok, true)

  const brokenLink = new DatabaseSync(databasePath)
  brokenLink.prepare('UPDATE asset_materializations SET asset_id=NULL WHERE asset_id=?')
    .run(record.asset_id)
  brokenLink.close()
  assert.equal(auditConversationAssetV2Bundle({ bundleDir,accountRoot }).issues.some((issue) => (
    issue.code === 'materialization-asset-link-mismatch'
  )), true)
  const restoreLink = new DatabaseSync(databasePath)
  restoreLink.prepare(`UPDATE asset_materializations SET asset_id=? WHERE source_id=(
    SELECT source_id FROM asset_associations WHERE message_uid=?
  )`).run(record.asset_id, 'uid-a')
  restoreLink.close()

  const changedJpeg = Buffer.from(jpeg)
  const comment = changedJpeg.indexOf(Buffer.from('Lavc', 'ascii'))
  assert.notEqual(comment, -1)
  changedJpeg[comment] = 'M'.charCodeAt(0)
  assert.equal(hasMaterializedMediaMagic(changedJpeg, 'jpeg'), true)
  const materializedPath = path.join(bundleDir, 'media', `${record.asset_id}.jpg`)
  fs.writeFileSync(materializedPath, changedJpeg)
  const changed = new DatabaseSync(databasePath)
  changed.prepare(`
    UPDATE asset_materializations SET materialized_content_sha256=? WHERE asset_id=?
  `).run(digestFileContent(materializedPath), record.asset_id)
  changed.close()
  const changedAudit = auditConversationAssetV2Bundle({ bundleDir,accountRoot })
  assert.equal(changedAudit.ok, false)
  assert.equal(changedAudit.issues.some((issue) => (
    issue.code === 'run-receipt-mismatch' || issue.code === 'index-receipt-mismatch'
  )), true)
})

test('refuses current and unclassified directories before opening a database', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chatfiles-media-role-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const accountRoot = path.join(root, 'account')
  const current = path.join(root, 'chat-assets.current')
  const arbitrary = path.join(root, 'arbitrary-output')
  fs.mkdirSync(accountRoot)
  fs.mkdirSync(current)
  fs.mkdirSync(arbitrary)
  const options = {
    accountRoot,keyProvider: { provide: async () => null },concurrency: 1,
  }
  await assert.rejects(
    materializeConversationMediaBundle({ ...options,bundleDir: current }),
    /MEDIA_CURRENT_BUNDLE_READ_ONLY/u,
  )
  await assert.rejects(
    materializeConversationMediaBundle({ ...options,bundleDir: arbitrary }),
    /MEDIA_BUNDLE_ROLE_INVALID/u,
  )
})

test('rejects a malformed journal base index before recovering index staging files', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chatfiles-media-journal-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const accountRoot = path.join(root, 'account')
  const bundleDir = path.join(root, 'chat-assets.next')
  fs.mkdirSync(accountRoot)
  fs.mkdirSync(bundleDir)
  fs.writeFileSync(path.join(bundleDir, 'artifacts.db'), '')
  const indexPath = path.join(bundleDir, 'index.json')
  const temporaryPath = `${indexPath}.tmp`
  const previousPath = `${indexPath}.previous`
  fs.writeFileSync(temporaryPath, 'temporary sentinel', 'utf8')
  fs.writeFileSync(previousPath, 'previous sentinel', 'utf8')
  const digest = `sha256:${'0'.repeat(64)}`
  fs.writeFileSync(path.join(bundleDir, '.media-materialization.json'), JSON.stringify({
    version: 1,
    runId: 'journal-run',
    status: 'started',
    baseIndex: {
      version: 2,
      runId: 'journal-run',
      completedAt: '2026-07-13T00:00:00.000Z',
      binding: {
        owner: 'owner-a',sourceSnapshotId: 'snapshot-a',
        sourceSnapshotRootFingerprint: digest,accountRootFingerprint: digest,
        canonicalRunId: 'canonical-run',canonicalSchemaVersion: 2,
        canonicalDatabaseSha256: digest,sourceManifestSha256: digest,
      },
      counts: { all: 0,work: 0,document: 0,skill: 0,link: 0,chatText: 0 },
      metrics: emptyConversationAssetMetrics(),
      materializationEvidenceSha256: digest,
      receipt: digest,
    },
  }), 'utf8')

  await assert.rejects(materializeConversationMediaBundle({
    bundleDir,accountRoot,keyProvider: { provide: async () => null },concurrency: 1,
  }), /MEDIA_JOURNAL_INVALID/u)
  assert.equal(fs.existsSync(indexPath), false)
  assert.equal(fs.readFileSync(temporaryPath, 'utf8'), 'temporary sentinel')
  assert.equal(fs.readFileSync(previousPath, 'utf8'), 'previous sentinel')
})
