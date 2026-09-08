import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { DatabaseSync } from 'node:sqlite'
import { initialJournal, journalWithStatus } from './catalogJournal.js'
import { writeCatalogRole, writeJournal } from './catalogStore.js'
import { activateCatalog, createProductCatalog } from './catalogTransaction.js'
import { catalogSha256 } from './catalogValidation.js'
import { inspectDataProducts } from './dataDoctor.js'
import { sealedProductSet } from './catalogTestSupport.js'
import { productKinds } from '../../shared/contracts/productCatalogCanonical.js'
import { digestText, inventoryProductTree } from './productFiles.js'

test('reports path-free ready, split-brain, and recovery-required product health', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chatfiles-data-doctor-'))
  const owned = sealedProductSet(t, root, 'doctor')
  activateCatalog({ dataRoot: owned.dataRoot,catalog: createProductCatalog({
    transactionId: 'doctor-current',committedAt: '2026-07-13T00:00:00.000Z',
    products: owned.references,
  }) })
  const ready = inspectDataProducts(owned.dataRoot)
  assert.equal(ready.state, 'ready')
  assert.equal(JSON.stringify(ready).includes(root), false)

  fs.writeFileSync(path.join(owned.dataRoot, 'library.json'), '{}')
  const degraded = inspectDataProducts(owned.dataRoot)
  assert.equal(degraded.state, 'degraded')
  assert.ok(degraded.issues.includes('legacy_layout_split_brain'))

  fs.writeFileSync(path.join(owned.dataRoot, '.catalog.lock'), 'doctor-current\n')
  assert.equal(inspectDataProducts(owned.dataRoot).state, 'recovery_required')
})

test('distinguishes a missing catalog from real empty product counts', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chatfiles-data-missing-'))
  t.after(() => fs.rmSync(root, { recursive: true,force: true }))
  const dataRoot = path.join(root, 'data')
  fs.mkdirSync(dataRoot)
  const result = inspectDataProducts(dataRoot)
  assert.equal(result.state, 'missing')
  assert.deepEqual(Object.keys(result.products).sort(), [...productKinds].sort())
  for (const kind of productKinds) assert.equal(result.products[kind].state, 'missing')
  assert.equal(result.derived.search.state, 'missing')
})

test('reports product failures independently and preserves trusted manifest evidence', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chatfiles-data-product-health-'))
  const owned = sealedProductSet(t, root, 'doctor-product-health')
  const catalog = createProductCatalog({
    transactionId: 'doctor-product-health',committedAt: '2026-07-13T00:00:00.000Z',
    products: owned.references,
  })
  activateCatalog({ dataRoot: owned.dataRoot,catalog })
  const assetDatabase = path.join(
    owned.dataRoot,'products','assets',owned.references.assets.bundleSha256.slice(7),'artifacts.db',
  )
  fs.appendFileSync(assetDatabase, 'tampered', 'utf8')
  const status = inspectDataProducts(owned.dataRoot)
  assert.equal(status.state, 'degraded')
  assert.equal(status.products.assets.state, 'invalid')
  assert.equal(status.products.assets.runId, 'assets-doctor-product-health')
  assert.equal(status.products.assets.schemaVersion, 2)
  assert.equal(status.products.assets.fingerprint, owned.references.assets.bundleSha256)
  assert.equal(status.products.wechat.state, 'ready')
  assert.equal(status.products.library.state, 'ready')
  assert.equal(status.products.insights.state, 'ready')
})

test('marks only a mismatched dependency and keeps its trusted release identity', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chatfiles-data-dependency-health-'))
  const current = sealedProductSet(t, root, 'doctor-dependency-current')
  const other = sealedProductSet(t, root, 'doctor-dependency-other')
  const products = { ...current.references,assets: other.references.assets }
  const catalog = createProductCatalog({
    transactionId: 'doctor-dependency-mismatch',committedAt: '2026-07-13T00:00:00.000Z',products,
  })
  writeCatalogRole(current.dataRoot, 'current', catalog, catalog.transactionId)
  const status = inspectDataProducts(current.dataRoot)
  assert.equal(status.state, 'degraded')
  assert.equal(status.products.assets.state, 'dependency_mismatch')
  assert.equal(status.products.assets.runId, 'assets-doctor-dependency-other')
  assert.equal(status.products.assets.fingerprint, products.assets.bundleSha256)
  assert.equal(status.products.wechat.state, 'ready')
})

test('deeply validates previous releases and exposes recovery state for every product', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chatfiles-data-previous-health-'))
  const first = sealedProductSet(t, root, 'doctor-previous-first')
  const before = createProductCatalog({
    transactionId: 'doctor-previous-first',committedAt: '2026-07-13T00:00:00.000Z',
    products: first.references,
  })
  activateCatalog({ dataRoot: first.dataRoot,catalog: before })
  const second = sealedProductSet(t, root, 'doctor-previous-second')
  const after = createProductCatalog({
    transactionId: 'doctor-previous-second',committedAt: '2026-07-13T00:01:00.000Z',
    parentCatalogSha256: catalogSha256(before),products: second.references,
  })
  activateCatalog({ dataRoot: first.dataRoot,catalog: after })
  const previousDatabase = path.join(
    first.dataRoot,'products','wechat',first.references.wechat.bundleSha256.slice(7),'wechat.db',
  )
  fs.appendFileSync(previousDatabase, 'tampered', 'utf8')
  const degraded = inspectDataProducts(first.dataRoot)
  assert.equal(degraded.catalog.previous, 'invalid')
  assert.equal(degraded.state, 'degraded')
  assert.equal(degraded.products.wechat.state, 'ready')

  fs.writeFileSync(path.join(first.dataRoot, '.catalog.lock'), 'doctor-recovery\n', 'utf8')
  const recovery = inspectDataProducts(first.dataRoot)
  assert.equal(recovery.state, 'recovery_required')
  for (const kind of productKinds) assert.equal(recovery.products[kind].state, 'invalid')
})

test('treats every nonterminal journal without its matching lock as recovery required', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chatfiles-data-journal-health-'))
  const owned = sealedProductSet(t, root, 'doctor-journal')
  const catalog = createProductCatalog({
    transactionId: 'doctor-journal-current',committedAt: '2026-07-13T00:00:00.000Z',
    products: owned.references,
  })
  activateCatalog({ dataRoot: owned.dataRoot,catalog })
  const pending = initialJournal({
    transactionId: 'doctor-journal-pending',beforeCatalog: catalog,
    beforeSha256: catalogSha256(catalog),afterCatalog: catalog,
    afterSha256: catalogSha256(catalog),updatedAt: '2026-07-13T00:01:00.000Z',
  })
  writeJournal(owned.dataRoot, journalWithStatus(
    pending,'rollback_failed','2026-07-13T00:02:00.000Z',
  ))
  const status = inspectDataProducts(owned.dataRoot)
  assert.equal(status.state, 'recovery_required')
  assert.ok(status.issues.includes('transaction_journal_pending_without_lock'))
})

test('recognizes an audited migration receipt while detecting later legacy source drift', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chatfiles-data-migration-health-'))
  const owned = sealedProductSet(t, root, 'doctor-migration')
  const catalog = createProductCatalog({
    transactionId: 'doctor-migration',committedAt: '2026-07-13T00:00:00.000Z',
    products: owned.references,
  })
  activateCatalog({ dataRoot: owned.dataRoot,catalog })
  const roles = {
    wechat: 'wechat.current',assets: 'chat-assets.current',
    library: 'library.current',insights: 'insights',
  } as const
  const sources = productKinds.map((kind) => {
    const role = roles[kind]
    const directory = path.join(owned.dataRoot, role)
    fs.mkdirSync(directory)
    fs.writeFileSync(path.join(directory, `${kind}.txt`), `保留-${kind}`, 'utf8')
    const files = inventoryProductTree(directory)
    return {
      kind,role,fingerprint: digestText(JSON.stringify(files)),files: files.length,
      bytes: files.reduce((sum, file) => sum + file.size, 0),
    }
  })
  const receipts = path.join(owned.dataRoot, 'migration-receipts')
  fs.mkdirSync(receipts)
  fs.writeFileSync(path.join(receipts, `${catalog.transactionId}.json`), `${JSON.stringify({
    version: 1,transactionId: catalog.transactionId,status: 'activated',
    completedAt: '2026-07-13T00:01:00.000Z',catalogSha256: catalogSha256(catalog),sources,
  }, null, 2)}\n`, 'utf8')

  const ready = inspectDataProducts(owned.dataRoot)
  assert.equal(ready.state, 'ready')
  assert.ok(ready.issues.includes('legacy_layout_preserved'))
  fs.appendFileSync(path.join(owned.dataRoot, roles.wechat, 'wechat.txt'), 'drift', 'utf8')
  const drifted = inspectDataProducts(owned.dataRoot)
  assert.equal(drifted.state, 'degraded')
  assert.ok(drifted.issues.includes('legacy_layout_split_brain'))

  fs.writeFileSync(path.join(owned.dataRoot, roles.wechat, 'wechat.txt'), '保留-wechat', 'utf8')
  const receiptName = `${catalog.transactionId}.json`
  const receiptText = fs.readFileSync(path.join(receipts, receiptName), 'utf8')
  fs.rmSync(receipts, { recursive: true })
  const outsideReceipts = path.join(root, 'outside-migration-receipts')
  fs.mkdirSync(outsideReceipts)
  fs.writeFileSync(path.join(outsideReceipts, receiptName), receiptText, 'utf8')
  try { fs.symlinkSync(outsideReceipts, receipts, 'junction') }
  catch { return }
  const linked = inspectDataProducts(owned.dataRoot)
  assert.equal(linked.state, 'degraded')
  assert.ok(linked.issues.includes('legacy_layout_split_brain'))
})

test('validates search closure and binds its status to the active WeChat product', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chatfiles-data-search-health-'))
  const owned = sealedProductSet(t, root, 'doctor-search')
  const catalog = createProductCatalog({
    transactionId: 'doctor-search',committedAt: '2026-07-13T00:00:00.000Z',
    products: owned.references,
  })
  activateCatalog({ dataRoot: owned.dataRoot,catalog })
  const indexPath = path.join(owned.dataRoot, 'ai-index.current.db')
  const index = new DatabaseSync(indexPath)
  index.exec(`CREATE TABLE search_metadata(
    singleton INTEGER PRIMARY KEY,schema_version INTEGER,source_fingerprint TEXT,
    chunk_count INTEGER,embedding_model TEXT,embedding_dimensions INTEGER
  ); CREATE TABLE search_chunks(id INTEGER); CREATE TABLE search_vectors(chunk_id TEXT);
  INSERT INTO search_metadata VALUES(
    1,2,'${catalog.products.wechat.bundleSha256}',0,NULL,NULL
  );`)
  index.close()
  assert.deepEqual(inspectDataProducts(owned.dataRoot).derived.search, {
    state: 'ready',mode: 'keyword-only',issues: [],
  })
  const stale = new DatabaseSync(indexPath)
  stale.prepare("UPDATE search_metadata SET source_fingerprint='old-product'").run()
  stale.close()
  assert.equal(inspectDataProducts(owned.dataRoot).derived.search.state, 'stale')
  const inconsistent = new DatabaseSync(indexPath)
  inconsistent.prepare('UPDATE search_metadata SET chunk_count=1').run()
  inconsistent.close()
  assert.equal(inspectDataProducts(owned.dataRoot).derived.search.state, 'invalid')
})
