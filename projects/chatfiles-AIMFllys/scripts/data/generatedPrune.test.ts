import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { initialJournal, journalWithStatus } from './catalogJournal.js'
import { createCatalogLock, writeJournal } from './catalogStore.js'
import { activateCatalog, createProductCatalog } from './catalogTransaction.js'
import { catalogSha256 } from './catalogValidation.js'
import { planGeneratedPrune } from './generatedPrune.js'
import { sealedProductSet } from './catalogTestSupport.js'

test('plans only unreferenced generated bundles and never deletes them', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chatfiles-prune-'))
  const current = sealedProductSet(t, root, 'current')
  activateCatalog({ dataRoot: current.dataRoot,catalog: createProductCatalog({
    transactionId: 'prune-current',committedAt: '2026-07-13T00:00:00.000Z',
    products: current.references,
  }) })
  const orphan = sealedProductSet(t, root, 'orphan')
  const plan = planGeneratedPrune(current.dataRoot)
  const activeHashes = new Set(Object.values(current.references).map((ref) => ref.bundleSha256.slice(7)))
  assert.ok(plan.candidates.some((candidate) => candidate.startsWith('products/wechat/')))
  assert.equal(plan.candidates.some((candidate) => (
    [...activeHashes].some((hash) => candidate.endsWith(hash))
  )), false)
  assert.equal(plan.dryRun, true)
  for (const reference of Object.values(orphan.references)) {
    assert.equal(fs.existsSync(path.join(
      orphan.dataRoot,'products','wechat',reference.bundleSha256.slice(7),
    )) || fs.existsSync(path.join(
      orphan.dataRoot,'products','assets',reference.bundleSha256.slice(7),
    )) || fs.existsSync(path.join(
      orphan.dataRoot,'products','library',reference.bundleSha256.slice(7),
    )) || fs.existsSync(path.join(
      orphan.dataRoot,'products','insights',reference.bundleSha256.slice(7),
    )), true)
  }
})

test('fails closed when current or previous catalog state cannot be trusted', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chatfiles-prune-invalid-'))
  t.after(() => fs.rmSync(root, { recursive: true,force: true }))
  const dataRoot = path.join(root, 'data')
  fs.mkdirSync(dataRoot)
  fs.writeFileSync(path.join(dataRoot, 'catalog.current.json'), '{broken')
  assert.throws(() => planGeneratedPrune(dataRoot), /PRUNE_CATALOG_INVALID/u)
})

function pendingFixture(t: test.TestContext, suffix: string) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `chatfiles-prune-${suffix}-`))
  const current = sealedProductSet(t, root, `${suffix}-current`)
  const before = createProductCatalog({
    transactionId: `${suffix}-before`,committedAt: '2026-07-13T00:00:00.000Z',
    products: current.references,
  })
  activateCatalog({ dataRoot: current.dataRoot,catalog: before })
  const next = sealedProductSet(t, root, `${suffix}-next`)
  const after = createProductCatalog({
    transactionId: `${suffix}-pending`,committedAt: '2026-07-13T00:01:00.000Z',
    parentCatalogSha256: catalogSha256(before),products: next.references,
  })
  const journal = initialJournal({
    transactionId: after.transactionId,beforeCatalog: before,beforeSha256: catalogSha256(before),
    afterCatalog: after,afterSha256: catalogSha256(after),updatedAt: '2026-07-13T00:01:00.000Z',
  })
  return { root,dataRoot: current.dataRoot,before,after,journal,next }
}

test('refuses to plan while a catalog lock has no matching pending journal', (t) => {
  const missing = pendingFixture(t, 'lock-missing')
  createCatalogLock(missing.dataRoot, missing.after.transactionId)
  assert.throws(() => planGeneratedPrune(missing.dataRoot), /PRUNE_RECOVERY_REQUIRED/u)

  const terminal = pendingFixture(t, 'lock-terminal')
  writeJournal(terminal.dataRoot, journalWithStatus(
    terminal.journal,'activated','2026-07-13T00:02:00.000Z',
  ))
  createCatalogLock(terminal.dataRoot, terminal.after.transactionId)
  assert.throws(() => planGeneratedPrune(terminal.dataRoot), /PRUNE_RECOVERY_REQUIRED/u)

  const mismatched = pendingFixture(t, 'lock-mismatch')
  writeJournal(mismatched.dataRoot, mismatched.journal)
  createCatalogLock(mismatched.dataRoot, 'different-transaction')
  assert.throws(() => planGeneratedPrune(mismatched.dataRoot), /PRUNE_RECOVERY_REQUIRED/u)
})

test('retains matching pending products and staging while listing only other generated orphans', (t) => {
  const owned = pendingFixture(t, 'pending-retained')
  writeJournal(owned.dataRoot, owned.journal)
  createCatalogLock(owned.dataRoot, owned.after.transactionId)
  const pendingStaging = path.join(owned.dataRoot, 'product-staging', owned.after.transactionId)
  fs.mkdirSync(pendingStaging, { recursive: true })
  fs.writeFileSync(path.join(pendingStaging, 'pending.txt'), '保留', 'utf8')
  const orphan = sealedProductSet(t, owned.root, 'pending-orphan')
  fs.mkdirSync(path.join(owned.dataRoot, 'raw'))
  fs.mkdirSync(path.join(owned.dataRoot, 'archive'))
  fs.mkdirSync(path.join(owned.dataRoot, 'wechat.current'))

  const plan = planGeneratedPrune(owned.dataRoot)
  const pendingHashes = new Set(Object.values(owned.next.references).map(
    (reference) => reference.bundleSha256.slice(7),
  ))
  const orphanHashes = new Set(Object.values(orphan.references).map(
    (reference) => reference.bundleSha256.slice(7),
  ))
  assert.equal(plan.candidates.some((candidate) => (
    [...pendingHashes].some((digest) => candidate.endsWith(digest))
  )), false)
  assert.equal(plan.candidates.includes(`product-staging/${owned.after.transactionId}`), false)
  assert.equal(plan.candidates.some((candidate) => (
    [...orphanHashes].some((digest) => candidate.endsWith(digest))
  )), true)
  assert.equal(plan.candidates.some((candidate) => /^(?:raw|archive|wechat\.current)\//u.test(candidate)), false)
})

test('deeply validates the previous catalog before producing candidates', (t) => {
  const owned = pendingFixture(t, 'previous-invalid')
  activateCatalog({
    dataRoot: owned.dataRoot,catalog: owned.after,
    expectedCurrentSha256: catalogSha256(owned.before),
  })
  const previousWechat = path.join(
    owned.dataRoot,'products','wechat',owned.before.products.wechat.bundleSha256.slice(7),'wechat.db',
  )
  fs.appendFileSync(previousWechat, 'tampered', 'utf8')
  assert.throws(() => planGeneratedPrune(owned.dataRoot), /PRODUCT_FILE_.*_MISMATCH/u)
})
