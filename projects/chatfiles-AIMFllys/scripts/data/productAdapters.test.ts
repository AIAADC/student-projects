import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'
import { createFixtureRoot, runParser } from '../wechat/parseWeChatTestFixtures.js'
import { createAssetRunReceipt, createMaterializationEvidenceDigest } from '../wechat/assetRunReceipt.js'
import { fingerprintDirectory } from '../wechat/assetBundleBinding.js'
import {
  completeAssetRun,
  createOutputSchema,
  startAssetRun,
} from '../wechat/conversationAssetBuilderSchema.js'
import {
  emptyConversationAssetMetrics,
  type ConversationAssetCounts,
} from '../wechat/conversationAssetBuilderSupport.js'
import {
  distillInsightRefresh,
  prepareInsightRefresh,
  rebuildInsightBoards,
} from '../insights/insightRefreshRunner.js'
import { fixture as insightFixture } from '../insights/insightRefreshRunnerTestFixture.js'
import { digestFile } from './productFiles.js'
import {
  assertAssetWechatDependency,
  assertInsightWechatDependency,
  validateAssetProductBundle,
  validateInsightProductBundle,
  validateLibraryProductBundle,
  validateWechatProductBundle,
  wechatProductDependency,
} from './productAdapters.js'

const sha = (character: string) => `sha256:${character.repeat(64)}`

function wechatManifest(databaseSha256 = sha('a')) {
  return {
    schemaVersion: 1 as const,kind: 'wechat' as const,runId: 'wechat-run',
    domainSchemaVersion: 2,
    createdAt: '2026-07-13T00:00:00.000Z',bundleSha256: sha('b'),
    domainReceiptSha256: sha('c'),entrypoints: { database: 'wechat.db' },
    files: [{ relativePath: 'wechat.db',size: 10,sha256: databaseSha256 }],
    dependencies: {},counts: {},
  }
}

test('binds assets and insights to the exact canonical WeChat run and database digest', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chatfiles-product-binding-'))
  t.after(() => fs.rmSync(root, { recursive: true,force: true }))
  const databasePath = path.join(root, 'wechat.db')
  const database = new DatabaseSync(databasePath)
  database.exec("CREATE TABLE parse_runs(run_id TEXT); INSERT INTO parse_runs VALUES('wechat-run')")
  database.close()
  const digest = digestFile(databasePath)
  const manifest = wechatManifest(digest)
  assert.doesNotThrow(() => assertAssetWechatDependency({
    canonical_run_id: 'wechat-run',canonical_database_sha256: digest,
  }, manifest))
  assert.throws(() => assertAssetWechatDependency({
    canonical_run_id: 'other-run',canonical_database_sha256: digest,
  }, manifest), /ASSET_PRODUCT_WECHAT_DEPENDENCY_MISMATCH/u)
  assert.doesNotThrow(() => assertInsightWechatDependency(databasePath, manifest))
  assert.throws(() => assertInsightWechatDependency(databasePath, wechatManifest(sha('d'))),
    /INSIGHT_PRODUCT_WECHAT_DEPENDENCY_MISMATCH/u)
})

test('derives a WeChat release receipt from a closed canonical database and matching index', (t) => {
  const root = createFixtureRoot()
  t.after(() => fs.rmSync(root, { recursive: true,force: true }))
  const bundleDir = path.join(root, 'data', 'wechat.next')
  const parsed = runParser(root)
  assert.equal(parsed.status, 0, parsed.stderr)
  const metadata = validateWechatProductBundle(bundleDir)
  assert.equal(metadata.runId, 'fixture-run')
  assert.equal(Number(metadata.counts.messages) > 0, true)
  assert.equal(wechatProductDependency({
    ...metadata,
    bundleSha256: `sha256:${'a'.repeat(64)}`,
    files: [{ relativePath: 'wechat.db',size: fs.statSync(path.join(bundleDir, 'wechat.db')).size,
      sha256: digestFile(path.join(bundleDir, 'wechat.db')) }],
  }).entrypoint, 'wechat.db')
})

test('validates a library receipt and every external archive object by content digest', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chatfiles-library-product-'))
  t.after(() => fs.rmSync(root, { recursive: true,force: true }))
  const bundleDir = path.join(root, 'data', 'library.next')
  const archiveFile = path.join(root, 'archive', 'AI', '资料.txt')
  fs.mkdirSync(bundleDir, { recursive: true })
  fs.mkdirSync(path.dirname(archiveFile), { recursive: true })
  fs.writeFileSync(archiveFile, '中文资料', 'utf8')
  const fileDigest = digestFile(archiveFile).slice('sha256:'.length)
  const manifest = {
    generatedAt: '2026-07-13T00:00:00.000Z',roots: [],
    files: [{
      id: 'file-1',name: '资料.txt',ext: '.txt',mime: 'text/plain',size: fs.statSync(archiveFile).size,
      modified: '2026-07-13T00:00:00.000Z',category: 'AI',subcategory: [],sourceApp: '微信',
      archivePath: 'archive/AI/资料.txt',sourcePath: 'private',sha256: fileDigest,preview: 'text',
    }],
    stats: { discovered: 1,archived: 1,duplicatesSkipped: 0,bytes: fs.statSync(archiveFile).size },
  }
  fs.writeFileSync(path.join(bundleDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  fs.writeFileSync(path.join(bundleDir, 'receipt.json'), `${JSON.stringify({
    formatVersion: 1,bundle: 'library.next',runId: 'library-run',manifestFile: 'manifest.json',
    manifestSha256: digestFile(path.join(bundleDir, 'manifest.json')).slice('sha256:'.length),
    generatedAt: manifest.generatedAt,plannedCopies: 1,completedCopies: 1,
  })}\n`, 'utf8')
  assert.equal(validateLibraryProductBundle(bundleDir, root).runId, 'library-run')
  fs.writeFileSync(archiveFile, '中文资坏', 'utf8')
  assert.throws(() => validateLibraryProductBundle(bundleDir, root), /LIBRARY_ARCHIVE_DIGEST_MISMATCH/u)
})

test('validates an asset release against the exact canonical dependency', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chatfiles-asset-product-'))
  t.after(() => fs.rmSync(root, { recursive: true,force: true }))
  const bundleDir = path.join(root, 'bundle')
  const accountRoot = path.join(root, 'account')
  fs.mkdirSync(bundleDir)
  fs.mkdirSync(accountRoot)
  const manifest = wechatManifest()
  const binding = {
    owner: 'owner',sourceSnapshotId: 'snapshot',sourceSnapshotRootFingerprint: sha('d'),
    accountRootFingerprint: fingerprintDirectory(accountRoot),canonicalRunId: manifest.runId,
    canonicalSchemaVersion: 2,canonicalDatabaseSha256: manifest.files[0]!.sha256,
    sourceManifestSha256: sha('e'),resourceDatabaseSha256: sha('f'),
  }
  const counts: ConversationAssetCounts = {
    all: 0,work: 0,document: 0,skill: 0,link: 0,chatText: 0,
  }
  const metrics = emptyConversationAssetMetrics()
  const completedAt = '2026-07-13T00:00:00.000Z'
  const database = new DatabaseSync(path.join(bundleDir, 'artifacts.db'))
  createOutputSchema(database)
  startAssetRun(database, 'asset-release', binding)
  const materializationEvidenceSha256 = createMaterializationEvidenceDigest(database)
  const receipt = createAssetRunReceipt({
    runId: 'asset-release',completedAt,binding,counts,metrics,materializationEvidenceSha256,
  })
  completeAssetRun(database, 'asset-release', completedAt, metrics, receipt)
  database.close()
  fs.writeFileSync(path.join(bundleDir, 'index.json'), `${JSON.stringify({
    version: 2,runId: 'asset-release',completedAt,binding,counts,metrics,
    materializationEvidenceSha256,receipt,
  })}\n`, 'utf8')
  const metadata = validateAssetProductBundle({ bundleDir,accountRoot,wechatManifest: manifest })
  assert.equal(metadata.runId, 'asset-release')
  assert.equal(metadata.dependencies.wechat?.runId, manifest.runId)
  assert.equal(metadata.dependencies.wechat?.entrypointSha256, manifest.files[0]!.sha256)

  const tampered = new DatabaseSync(path.join(bundleDir, 'artifacts.db'))
  tampered.prepare("UPDATE asset_runs SET canonical_run_id='other-run'").run()
  tampered.close()
  assert.throws(() => validateAssetProductBundle({ bundleDir,accountRoot,wechatManifest: manifest }),
    /ASSET_PRODUCT_AUDIT_FAILED|ASSET_PRODUCT_WECHAT_DEPENDENCY_MISMATCH/u)
})

test('validates an insight release against its audited sealed WeChat database', (t) => {
  const owned = insightFixture(t)
  const prepared = prepareInsightRefresh({
    root: owned.root,runId: 'product-insight',aliasMapPath: owned.aliasMapPath,
  })
  distillInsightRefresh({ root: owned.root,runId: 'product-insight' })
  rebuildInsightBoards({ root: owned.root,runId: 'product-insight' })
  const manifest = {
    ...wechatManifest(digestFile(owned.dbPath)),runId: 'fixture-run',
  }
  const metadata = validateInsightProductBundle({
    root: owned.root,bundleDir: prepared.bundleDir,wechatDatabasePath: owned.dbPath,
    wechatManifest: manifest,
  })
  assert.equal(metadata.runId, 'product-insight')
  assert.equal(metadata.dependencies.wechat?.runId, 'fixture-run')
  assert.throws(() => validateInsightProductBundle({
    root: owned.root,bundleDir: prepared.bundleDir,wechatDatabasePath: owned.dbPath,
    wechatManifest: { ...manifest,runId: 'stale-run' },
  }), /INSIGHT_PRODUCT_WECHAT_DEPENDENCY_MISMATCH/u)
})
