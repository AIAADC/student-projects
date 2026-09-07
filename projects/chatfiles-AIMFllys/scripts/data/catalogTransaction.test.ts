import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  activateCatalog,
  createProductCatalog,
  readActiveCatalog,
  recoverCatalog,
  rollbackCatalog,
  type CatalogFaultPoint,
} from './catalogTransaction.js'
import { catalogSha256 } from './catalogValidation.js'
import { journalPath, readJournal, writeCatalogRole } from './catalogStore.js'
import { sealedProductSet } from './catalogTestSupport.js'
import { digestText } from './productFiles.js'
import { sealProduct } from './productSealer.js'

function root() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'chatfiles-catalog-'))
}

test('activates one catalog pointer and rolls back without moving immutable products', (t) => {
  const owned = sealedProductSet(t, root(), 'one')
  const first = createProductCatalog({
    transactionId: 'activate-one',committedAt: '2026-07-13T00:00:00.000Z',
    products: owned.references,
  })
  activateCatalog({ dataRoot: owned.dataRoot,catalog: first })
  const secondProducts = sealedProductSet(t, path.dirname(owned.dataRoot), 'two').references
  const second = createProductCatalog({
    transactionId: 'activate-two',committedAt: '2026-07-13T00:01:00.000Z',
    parentCatalogSha256: catalogSha256(first),products: secondProducts,
  })
  activateCatalog({
    dataRoot: owned.dataRoot,catalog: second,expectedCurrentSha256: catalogSha256(first),
  })
  assert.equal(readActiveCatalog(owned.dataRoot).catalog?.transactionId, 'activate-two')
  assert.equal(rollbackCatalog({
    dataRoot: owned.dataRoot,transactionId: 'rollback-two',
    committedAt: '2026-07-13T00:02:00.000Z',
  }).status, 'activated')
  const rolledBack = readActiveCatalog(owned.dataRoot).catalog
  assert.equal(rolledBack?.transactionId, 'rollback-two')
  assert.deepEqual(rolledBack?.products, first.products)
})

for (const point of [
  'after_validated','after_previous','after_current','before_activated',
] as const satisfies readonly CatalogFaultPoint[]) {
  test(`recovers a catalog interruption at ${point} from actual file hashes`, (t) => {
    const owned = sealedProductSet(t, root(), `base-${point}`)
    const first = createProductCatalog({
      transactionId: `initial-${point}`,committedAt: '2026-07-13T00:00:00.000Z',
      products: owned.references,
    })
    activateCatalog({ dataRoot: owned.dataRoot,catalog: first })
    const nextProducts = sealedProductSet(t, path.dirname(owned.dataRoot), `next-${point}`).references
    const next = createProductCatalog({
      transactionId: `next-${point}`,committedAt: '2026-07-13T00:01:00.000Z',
      parentCatalogSha256: catalogSha256(first),products: nextProducts,
    })
    assert.throws(() => activateCatalog({
      dataRoot: owned.dataRoot,catalog: next,
      fault: (candidate) => { if (candidate === point) throw new Error('INJECTED_CRASH') },
    }), /INJECTED_CRASH/u)
    const recovered = recoverCatalog(owned.dataRoot)
    const expected = point === 'after_current' || point === 'before_activated'
      ? next.transactionId
      : first.transactionId
    assert.equal(readActiveCatalog(owned.dataRoot).catalog?.transactionId, expected)
    assert.equal(recovered.status, expected === next.transactionId ? 'activated' : 'rolled_back')
  })
}

test('fails closed for an invalid current catalog and mismatched dependencies', (t) => {
  const owned = sealedProductSet(t, root(), 'closed')
  const current = createProductCatalog({
    transactionId: 'closed-current',committedAt: '2026-07-13T00:00:00.000Z',
    products: owned.references,
  })
  activateCatalog({ dataRoot: owned.dataRoot,catalog: current })
  fs.writeFileSync(path.join(owned.dataRoot, 'catalog.current.json'), '{broken', 'utf8')
  assert.equal(readActiveCatalog(owned.dataRoot).state, 'invalid')
  assert.throws(() => activateCatalog({ dataRoot: owned.dataRoot,catalog: current }), /CATALOG_CURRENT_INVALID/u)

  fs.writeFileSync(
    path.join(owned.dataRoot, 'catalog.current.json'),
    `${JSON.stringify(current, null, 2)}\n`,
    'utf8',
  )
  const other = sealedProductSet(t, path.dirname(owned.dataRoot), 'other').references
  const mismatched = createProductCatalog({
    transactionId: 'dependency-mismatch',committedAt: '2026-07-13T00:01:00.000Z',
    products: { ...other,wechat: owned.references.wechat },
  })
  assert.throws(() => activateCatalog({
    dataRoot: owned.dataRoot,catalog: mismatched,
  }), /(?:PRODUCT_DEPENDENCY|ASSET_PRODUCT_WECHAT_DEPENDENCY)_MISMATCH/u)
})

test('rejects a content-addressed product whose domain database schema is invalid', (t) => {
  const rootDir = root()
  const owned = sealedProductSet(t, rootDir, 'domain-valid')
  const stagingDir = path.join(owned.dataRoot, 'product-staging', 'domain-invalid', 'wechat')
  fs.mkdirSync(stagingDir, { recursive: true })
  fs.writeFileSync(path.join(stagingDir, 'wechat.db'), 'not sqlite', 'utf8')
  fs.writeFileSync(path.join(stagingDir, 'index.json'), '{}\n', 'utf8')
  const invalid = sealProduct({
    dataRoot: owned.dataRoot,stagingDir,kind: 'wechat',runId: 'invalid-wechat',
    domainSchemaVersion: 2,createdAt: '2026-07-13T00:00:00.000Z',
    domainReceiptSha256: digestText('invalid'),entrypoints: {
      database: 'wechat.db',index: 'index.json',
    },dependencies: {},counts: { messages: 0 },
  })
  const catalog = createProductCatalog({
    transactionId: 'invalid-domain',committedAt: '2026-07-13T00:00:00.000Z',
    products: { ...owned.references,wechat: invalid.reference },
  })
  assert.throws(() => activateCatalog({ dataRoot: owned.dataRoot,catalog }),
    /WECHAT_PRODUCT_DOMAIN_INVALID/u)
})

test('refuses a catalog transaction journal junction and releases its lock', (t) => {
  const rootDir = root()
  const owned = sealedProductSet(t, rootDir, 'journal-link')
  const outside = path.join(rootDir, 'outside-journals')
  fs.mkdirSync(outside)
  try {
    fs.symlinkSync(outside, path.join(owned.dataRoot, 'catalog-transactions'), 'junction')
  } catch {
    t.skip('This Windows host does not allow creating directory links')
    return
  }
  const catalog = createProductCatalog({
    transactionId: 'journal-link',committedAt: '2026-07-13T00:00:00.000Z',
    products: owned.references,
  })
  assert.throws(() => activateCatalog({ dataRoot: owned.dataRoot,catalog }),
    /CATALOG_JOURNAL_ROLE_INVALID/u)
  assert.equal(fs.existsSync(path.join(owned.dataRoot, '.catalog.lock')), false)
  assert.deepEqual(fs.readdirSync(outside), [])
})

test('rolls back an ordinary catalog publication failure and records the terminal state', (t) => {
  const rootDir = root()
  const owned = sealedProductSet(t, rootDir, 'rollback-base')
  const first = createProductCatalog({
    transactionId: 'rollback-base',committedAt: '2026-07-13T00:00:00.000Z',
    products: owned.references,
  })
  activateCatalog({ dataRoot: owned.dataRoot,catalog: first })
  const nextProducts = sealedProductSet(t, rootDir, 'rollback-next').references
  const next = createProductCatalog({
    transactionId: 'rollback-failure',committedAt: '2026-07-13T00:01:00.000Z',
    parentCatalogSha256: catalogSha256(first),products: nextProducts,
  })
  let currentWrites = 0
  assert.throws(() => activateCatalog({
    dataRoot: owned.dataRoot,catalog: next,
    io: { writeCatalogRole: (dataRoot, role, catalog, transactionId) => {
      if (role === 'current' && ++currentWrites === 1) throw new Error('PUBLICATION_FAILED')
      writeCatalogRole(dataRoot, role, catalog, transactionId)
    } },
  }), /PUBLICATION_FAILED/u)
  assert.equal(readActiveCatalog(owned.dataRoot).catalog?.transactionId, first.transactionId)
  assert.equal(readJournal(owned.dataRoot, next.transactionId).status, 'rolled_back')
  assert.equal(fs.existsSync(path.join(owned.dataRoot, '.catalog.lock')), false)
})

test('retains a rollback-failed journal and lock when the previous catalog cannot be restored', (t) => {
  const rootDir = root()
  const owned = sealedProductSet(t, rootDir, 'rollback-failed-base')
  const first = createProductCatalog({
    transactionId: 'rollback-failed-base',committedAt: '2026-07-13T00:00:00.000Z',
    products: owned.references,
  })
  activateCatalog({ dataRoot: owned.dataRoot,catalog: first })
  const nextProducts = sealedProductSet(t, rootDir, 'rollback-failed-next').references
  const next = createProductCatalog({
    transactionId: 'rollback-failed',committedAt: '2026-07-13T00:01:00.000Z',
    parentCatalogSha256: catalogSha256(first),products: nextProducts,
  })
  let currentWrites = 0
  assert.throws(() => activateCatalog({
    dataRoot: owned.dataRoot,catalog: next,
    io: { writeCatalogRole: (dataRoot, role, catalog, transactionId) => {
      if (role !== 'current') return writeCatalogRole(dataRoot, role, catalog, transactionId)
      currentWrites++
      if (currentWrites === 1) {
        writeCatalogRole(dataRoot, role, catalog, transactionId)
        fs.writeFileSync(path.join(dataRoot, 'catalog.current.json'), '{broken', 'utf8')
        return
      }
      throw new Error('RESTORE_FAILED')
    } },
  }), /CATALOG_ACTIVATION_ROLLBACK_FAILED/u)
  assert.equal(readJournal(owned.dataRoot, next.transactionId).status, 'rollback_failed')
  assert.equal(fs.existsSync(path.join(owned.dataRoot, '.catalog.lock')), true)
})

test('recovers a lock created before its journal without changing the active catalog', (t) => {
  const rootDir = root()
  const owned = sealedProductSet(t, rootDir, 'orphan-lock')
  const current = createProductCatalog({
    transactionId: 'orphan-lock-base',committedAt: '2026-07-13T00:00:00.000Z',
    products: owned.references,
  })
  activateCatalog({ dataRoot: owned.dataRoot,catalog: current })
  fs.writeFileSync(path.join(owned.dataRoot, '.catalog.lock'), 'orphan-lock\n', 'utf8')
  assert.equal(recoverCatalog(owned.dataRoot).status, 'rolled_back')
  assert.equal(readActiveCatalog(owned.dataRoot).catalog?.transactionId, current.transactionId)
  assert.equal(fs.existsSync(path.join(owned.dataRoot, '.catalog.lock')), false)
})

test('restores an invalid current catalog from journal evidence and resumes a valid temp journal', (t) => {
  const rootDir = root()
  const owned = sealedProductSet(t, rootDir, 'recover-invalid-base')
  const current = createProductCatalog({
    transactionId: 'recover-invalid-base',committedAt: '2026-07-13T00:00:00.000Z',
    products: owned.references,
  })
  activateCatalog({ dataRoot: owned.dataRoot,catalog: current })
  const nextProducts = sealedProductSet(t, rootDir, 'recover-invalid-next').references
  const next = createProductCatalog({
    transactionId: 'recover-invalid',committedAt: '2026-07-13T00:01:00.000Z',
    parentCatalogSha256: catalogSha256(current),products: nextProducts,
  })
  assert.throws(() => activateCatalog({
    dataRoot: owned.dataRoot,catalog: next,
    fault: (point) => { if (point === 'after_previous') throw new Error('CRASH') },
  }), /CRASH/u)
  fs.writeFileSync(path.join(owned.dataRoot, 'catalog.current.json'), '{broken', 'utf8')
  const journal = journalPath(owned.dataRoot, next.transactionId)
  fs.renameSync(journal, `${journal}.${next.transactionId}.tmp`)
  assert.equal(recoverCatalog(owned.dataRoot).status, 'rolled_back')
  assert.equal(readActiveCatalog(owned.dataRoot).catalog?.transactionId, current.transactionId)
})
