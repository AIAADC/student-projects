import fs from 'node:fs'
import path from 'node:path'
import type { TestContext } from 'node:test'
import { DatabaseSync } from 'node:sqlite'
import type { ProductKind, ProductReference } from '../../shared/contracts/productCatalog.js'
import { digestFile, digestText } from './productFiles.js'
import { sealProduct } from './productSealer.js'

const createdAt = '2026-07-13T00:00:00.000Z'

function stage(dataRoot: string, version: string, kind: ProductKind) {
  const directory = path.join(dataRoot, 'product-staging', `txn-${version}`, kind)
  fs.mkdirSync(directory, { recursive: true })
  return directory
}

function wechatProduct(dataRoot: string, version: string, receipt: string, databaseSource?: string) {
  const stagingDir = stage(dataRoot, version, 'wechat')
  const databasePath = path.join(stagingDir, 'wechat.db')
  if (databaseSource) fs.copyFileSync(databaseSource, databasePath, fs.constants.COPYFILE_EXCL)
  else {
    const database = new DatabaseSync(databasePath)
    database.exec(`CREATE TABLE parse_runs(
      run_id TEXT,status TEXT,completed_at TEXT,schema_version INTEGER
    ); CREATE TABLE messages(message_uid TEXT,canonical_seq INTEGER,occurred_at_epoch_s INTEGER);
    INSERT INTO parse_runs VALUES('wechat-${version}','complete','${createdAt}',2);`)
    database.close()
  }
  const database = new DatabaseSync(databasePath, { readOnly: true })
  const run = database.prepare('SELECT run_id,schema_version FROM parse_runs LIMIT 1').get() as {
    run_id: string;schema_version: number
  }
  database.close()
  fs.writeFileSync(path.join(stagingDir, 'index.json'), `${JSON.stringify({
    runId: run.run_id,schemaVersion: Number(run.schema_version),
  })}\n`, 'utf8')
  return sealProduct({
    dataRoot,stagingDir,kind: 'wechat',runId: run.run_id,
    domainSchemaVersion: Number(run.schema_version),createdAt,domainReceiptSha256: receipt,
    entrypoints: { database: 'wechat.db',index: 'index.json' },dependencies: {},
    counts: { messages: 0 },
  })
}

function assetProduct(
  dataRoot: string,version: string,receipt: string,
  dependency: ReturnType<typeof wechatProduct>['manifest']['dependencies']['wechat'],
) {
  if (!dependency) throw new Error('TEST_WECHAT_DEPENDENCY_MISSING')
  const stagingDir = stage(dataRoot, version, 'assets')
  const database = new DatabaseSync(path.join(stagingDir, 'artifacts.db'))
  database.exec(`CREATE TABLE asset_runs(
    run_id TEXT,status TEXT,completed_at TEXT,schema_version INTEGER,
    canonical_run_id TEXT,canonical_database_sha256 TEXT
  ); CREATE TABLE asset_sources(id TEXT); CREATE TABLE asset_associations(id TEXT);
  CREATE TABLE asset_candidates(id TEXT); CREATE TABLE assets(id TEXT);
  CREATE TABLE asset_materializations(id TEXT);
  INSERT INTO asset_runs VALUES(
    'assets-${version}','complete','${createdAt}',2,
    '${dependency.runId}','${dependency.entrypointSha256}'
  );`)
  database.close()
  fs.writeFileSync(path.join(stagingDir, 'index.json'), `${JSON.stringify({
    runId: `assets-${version}`,schemaVersion: 2,
  })}\n`, 'utf8')
  return sealProduct({
    dataRoot,stagingDir,kind: 'assets',runId: `assets-${version}`,
    domainSchemaVersion: 2,createdAt,domainReceiptSha256: receipt,
    entrypoints: { database: 'artifacts.db',index: 'index.json' },
    dependencies: { wechat: dependency },counts: { assets: 0 },
  })
}

function jsonProduct(dataRoot: string, version: string, kind: 'library' | 'insights', receipt: string) {
  const stagingDir = stage(dataRoot, version, kind)
  if (kind === 'library') {
    const manifestPath = path.join(stagingDir, 'manifest.json')
    fs.writeFileSync(manifestPath, `${JSON.stringify({
      generatedAt: createdAt,roots: [],files: [],
      stats: { discovered: 0,archived: 0,duplicatesSkipped: 0,bytes: 0 },
    })}\n`, 'utf8')
    fs.writeFileSync(path.join(stagingDir, 'receipt.json'), `${JSON.stringify({
      formatVersion: 1,bundle: 'library.next',runId: `library-${version}`,
      manifestFile: 'manifest.json',manifestSha256: digestFile(manifestPath).slice(7),
      generatedAt: createdAt,plannedCopies: 0,completedCopies: 0,
    })}\n`, 'utf8')
  } else {
    fs.writeFileSync(path.join(stagingDir, 'receipt.json'), `${JSON.stringify({
      version: 1,runId: `insights-${version}`,status: 'complete',completedAt: createdAt,
    })}\n`, 'utf8')
    fs.writeFileSync(path.join(stagingDir, '_manifest.json'), '[]\n', 'utf8')
    fs.writeFileSync(path.join(stagingDir, '_state.json'), '[]\n', 'utf8')
  }
  return sealProduct({
    dataRoot,stagingDir,kind,runId: `${kind}-${version}`,domainSchemaVersion: 1,
    createdAt,domainReceiptSha256: receipt,
    entrypoints: kind === 'library'
      ? { manifest: 'manifest.json',receipt: 'receipt.json' }
      : { receipt: 'receipt.json',manifest: '_manifest.json',state: '_state.json' },
    dependencies: {},counts: { items: 0 },
  })
}

export function sealedProductSet(
  t: TestContext,
  root: string,
  version: string,
  options: { wechatDatabasePath?: string } = {},
) {
  const dataRoot = path.join(root, 'data')
  fs.mkdirSync(dataRoot, { recursive: true })
  const receipt = digestText(`receipt-${version}`)
  const wechat = wechatProduct(dataRoot, version, receipt, options.wechatDatabasePath)
  const database = wechat.manifest.files.find((file) => file.relativePath === 'wechat.db')!
  const dependency = {
    bundleSha256: wechat.manifest.bundleSha256,entrypoint: database.relativePath,
    entrypointSha256: database.sha256,runId: wechat.manifest.runId,
    domainSchemaVersion: wechat.manifest.domainSchemaVersion,
    domainReceiptSha256: wechat.manifest.domainReceiptSha256,
  }
  const assets = assetProduct(dataRoot, version, receipt, dependency)
  const library = jsonProduct(dataRoot, version, 'library', receipt)
  const insightsBase = jsonProduct(dataRoot, version, 'insights', receipt)
  const insightsStage = stage(dataRoot, `${version}-bound`, 'insights')
  fs.cpSync(insightsBase.productDir, insightsStage, { recursive: true })
  fs.rmSync(path.join(insightsStage, 'product.json'))
  fs.rmSync(path.join(insightsStage, 'release.json'))
  const insights = sealProduct({
    dataRoot,stagingDir: insightsStage,kind: 'insights',runId: `insights-${version}`,
    domainSchemaVersion: 1,createdAt,domainReceiptSha256: receipt,
    entrypoints: { receipt: 'receipt.json',manifest: '_manifest.json',state: '_state.json' },
    dependencies: { wechat: dependency },counts: { items: 0 },
  })
  const references = { wechat: wechat.reference,assets: assets.reference,
    library: library.reference,insights: insights.reference } satisfies Record<ProductKind, ProductReference>
  t.after(() => fs.rmSync(root, { recursive: true,force: true }))
  return { dataRoot,references }
}
