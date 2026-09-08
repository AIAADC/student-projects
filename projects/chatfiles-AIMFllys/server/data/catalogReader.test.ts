import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { DatabaseSync } from 'node:sqlite'
import type { ProductKind, ProductManifest, ProductReference } from '../../shared/contracts/productCatalog.js'
import {
  productBundleSetCanonicalText,
  productCatalogCanonicalText,
  productManifestCanonicalText,
} from '../../shared/contracts/productCatalogCanonical.js'
import {
  readActiveProductSet,
  resolveActiveEntrypoint,
} from './catalogReader.js'

const sha = (value: string | Buffer) => `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`

function product(
  dataRoot: string,
  kind: ProductKind,
  content: string,
  dependencies: ProductManifest['dependencies'],
  invalidDomain = false,
) {
  const filename = kind === 'wechat' ? 'wechat.db'
    : kind === 'assets' ? 'artifacts.db' : kind === 'library' ? 'manifest.json' : 'receipt.json'
  const staging = path.join(dataRoot, `.fixture-${kind}-${content}`)
  fs.mkdirSync(staging)
  if (kind === 'wechat' || kind === 'assets') {
    if (invalidDomain) fs.writeFileSync(path.join(staging, filename), 'not sqlite', 'utf8')
    else {
      const database = new DatabaseSync(path.join(staging, filename))
      if (kind === 'wechat') database.exec(`CREATE TABLE parse_runs(
        run_id TEXT,status TEXT,schema_version INTEGER
      ); CREATE TABLE messages(message_uid TEXT,canonical_seq INTEGER,occurred_at_epoch_s INTEGER);
      INSERT INTO parse_runs VALUES('wechat-run','complete',2);`)
      else database.exec(`CREATE TABLE asset_runs(
        run_id TEXT,status TEXT,schema_version INTEGER,canonical_run_id TEXT,
        canonical_database_sha256 TEXT
      ); CREATE TABLE asset_sources(id TEXT); CREATE TABLE asset_associations(id TEXT);
      CREATE TABLE asset_candidates(id TEXT); CREATE TABLE assets(id TEXT);
      CREATE TABLE asset_materializations(id TEXT);
      INSERT INTO asset_runs VALUES('assets-run','complete',2,
        '${dependencies.wechat?.runId}','${dependencies.wechat?.entrypointSha256}');`)
      database.close()
    }
  } else if (kind === 'library') fs.writeFileSync(path.join(staging, filename), JSON.stringify({
    generatedAt: '2026-07-13T00:00:00.000Z',roots: [],files: [],
    stats: { discovered: 0,archived: 0,duplicatesSkipped: 0,bytes: 0 },
  }))
  else {
    fs.writeFileSync(path.join(staging, filename), JSON.stringify({
      version: 1,runId: 'insights-run',status: 'complete',
    }))
    fs.writeFileSync(path.join(staging, '_manifest.json'), '[]')
    fs.writeFileSync(path.join(staging, '_state.json'), '[]')
  }
  const domainSchemaVersion = kind === 'wechat' || kind === 'assets' ? 2 : 1
  const runId = `${kind}-run`
  const release = `${JSON.stringify({
    version: 1,kind,runId,domainSchemaVersion,validatedAt: '2026-07-13T00:00:00.000Z',
    evidenceSha256: sha(`receipt-${kind}`),counts: { items: 1 },
  }, null, 2)}\n`
  fs.writeFileSync(path.join(staging, 'release.json'), release)
  const entrypoints = kind === 'wechat' || kind === 'assets'
    ? { database: filename,release: 'release.json' }
    : kind === 'library' ? { manifest: filename,release: 'release.json' }
      : { receipt: filename,manifest: '_manifest.json',state: '_state.json',release: 'release.json' }
  const files = fs.readdirSync(staging).sort().map((relativePath) => {
    const target = path.join(staging, relativePath)
    return { relativePath,size: fs.statSync(target).size,sha256: sha(fs.readFileSync(target)) }
  })
  const partial = {
    schemaVersion: 1 as const,kind,runId,createdAt: '2026-07-13T00:00:00.000Z',
    domainSchemaVersion,domainReceiptSha256: sha(release),entrypoints,
    files,
    dependencies,counts: { items: 1 },
  }
  const manifest: ProductManifest = {
    ...partial,bundleSha256: sha(productManifestCanonicalText(partial)),
  }
  const manifestText = `${JSON.stringify(manifest, null, 2)}\n`
  const reference = { bundleSha256: manifest.bundleSha256,manifestSha256: sha(manifestText) }
  const productRoot = path.join(dataRoot, 'products', kind, manifest.bundleSha256.slice(7))
  fs.mkdirSync(path.dirname(productRoot), { recursive: true })
  fs.renameSync(staging, productRoot)
  fs.writeFileSync(path.join(productRoot, 'product.json'), manifestText, 'utf8')
  return { manifest,reference,filename }
}

function fixture(t: test.TestContext, invalidWechat = false) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chatfiles-runtime-catalog-'))
  t.after(() => fs.rmSync(root, { recursive: true,force: true }))
  const dataRoot = path.join(root, 'data')
  fs.mkdirSync(dataRoot)
  const wechat = product(dataRoot, 'wechat', 'wechat-content', {}, invalidWechat)
  const dependency = {
    bundleSha256: wechat.reference.bundleSha256,
    entrypoint: wechat.filename,
    entrypointSha256: wechat.manifest.files.find((file) => file.relativePath === wechat.filename)!.sha256,
    runId: wechat.manifest.runId,
    domainSchemaVersion: wechat.manifest.domainSchemaVersion,
    domainReceiptSha256: wechat.manifest.domainReceiptSha256,
  }
  const products = {
    wechat: wechat.reference,
    assets: product(dataRoot, 'assets', 'asset-content', { wechat: dependency }).reference,
    library: product(dataRoot, 'library', 'library-content', {}).reference,
    insights: product(dataRoot, 'insights', 'insight-content', { wechat: dependency }).reference,
  } satisfies Record<ProductKind, ProductReference>
  const partial = {
    schemaVersion: 1 as const,transactionId: 'runtime-fixture',
    committedAt: '2026-07-13T00:00:00.000Z',products,
  }
  const catalog = { ...partial,bundleSetSha256: sha(productBundleSetCanonicalText(products)) }
  fs.writeFileSync(path.join(dataRoot, 'catalog.current.json'), `${JSON.stringify(catalog, null, 2)}\n`)
  return { root,dataRoot,catalog }
}

test('leases all products from one validated path-free catalog snapshot', (t) => {
  const owned = fixture(t)
  const active = readActiveProductSet(owned.root)
  assert.equal(active.state, 'ready')
  assert.equal(active.status.catalog.state, 'ready')
  assert.equal(active.status.products.wechat.runId, 'wechat-run')
  assert.equal(resolveActiveEntrypoint(active, 'wechat', 'database').endsWith('wechat.db'), true)
  assert.equal(JSON.stringify(active.status).includes(owned.root), false)
  assert.equal(sha(productCatalogCanonicalText(active.catalog!)).startsWith('sha256:'), true)
})

test('fails closed for corrupt current, dependency mismatch, and pending recovery', (t) => {
  const owned = fixture(t)
  fs.writeFileSync(path.join(owned.dataRoot, 'wechat.db'), 'legacy-valid-looking')
  fs.writeFileSync(path.join(owned.dataRoot, 'catalog.current.json'), '{broken')
  assert.equal(readActiveProductSet(owned.root).state, 'invalid')

  fs.writeFileSync(
    path.join(owned.dataRoot, 'catalog.current.json'),
    `${JSON.stringify(owned.catalog, null, 2)}\n`,
  )
  fs.writeFileSync(path.join(owned.dataRoot, '.catalog.lock'), 'runtime-fixture\n')
  assert.equal(readActiveProductSet(owned.root).state, 'recovery_required')
})

test('keeps an independent chat product usable when only assets are invalid', (t) => {
  const owned = fixture(t)
  const assetRoot = path.join(
    owned.dataRoot,'products','assets',owned.catalog.products.assets.bundleSha256.slice(7),
  )
  fs.writeFileSync(path.join(assetRoot, 'product.json'), '{broken')
  const active = readActiveProductSet(owned.root)
  assert.equal(active.state, 'ready')
  assert.equal(active.status.products.wechat.state, 'ready')
  assert.equal(active.status.products.assets.state, 'invalid')
  assert.equal(resolveActiveEntrypoint(active, 'wechat', 'database').endsWith('wechat.db'), true)
  assert.throws(() => resolveActiveEntrypoint(active, 'assets', 'primary'), /DATA_PRODUCT_UNAVAILABLE/u)
})

test('marks a content-addressed product invalid when its domain schema is not usable', (t) => {
  const owned = fixture(t, true)
  const active = readActiveProductSet(owned.root)
  assert.equal(active.state, 'ready')
  assert.equal(active.status.products.wechat.state, 'invalid')
  assert.equal(active.status.products.wechat.runId, 'wechat-run')
  assert.equal(active.status.products.wechat.schemaVersion, 2)
  assert.equal(active.status.products.wechat.fingerprint, owned.catalog.products.wechat.bundleSha256)
  assert.deepEqual(active.status.products.wechat.counts, { items: 1 })
  assert.equal(active.status.products.assets.state, 'dependency_mismatch')
  assert.equal(active.status.products.assets.runId, 'assets-run')
  assert.equal(active.status.products.assets.schemaVersion, 2)
  assert.equal(active.status.products.assets.fingerprint, owned.catalog.products.assets.bundleSha256)
  assert.deepEqual(active.status.products.assets.counts, { items: 1 })
})

test('deeply validates previous products without degrading a healthy current catalog', (t) => {
  const owned = fixture(t)
  const previousProducts = {
    ...owned.catalog.products,
    wechat: { bundleSha256: sha('missing-product'),manifestSha256: sha('missing-manifest') },
  }
  const previous = {
    schemaVersion: 1 as const,transactionId: 'previous-missing-product',
    committedAt: '2026-07-13T00:00:00.000Z',products: previousProducts,
    bundleSetSha256: sha(productBundleSetCanonicalText(previousProducts)),
  }
  fs.writeFileSync(
    path.join(owned.dataRoot, 'catalog.previous.json'),`${JSON.stringify(previous, null, 2)}\n`,'utf8',
  )
  const active = readActiveProductSet(owned.root)
  assert.equal(active.state, 'ready')
  assert.equal(active.status.catalog.state, 'ready')
  assert.equal(active.status.catalog.previous, 'invalid')
  assert.equal(active.status.products.wechat.state, 'ready')
})
