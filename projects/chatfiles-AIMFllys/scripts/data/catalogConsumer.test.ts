import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { activateCatalog, createProductCatalog } from './catalogTransaction.js'
import { readCurrentLibraryManifest, resolveCurrentProductEntrypoint } from './catalogConsumer.js'
import { sealedProductSet } from './catalogTestSupport.js'

test('resolves only a deeply validated current catalog product entrypoint', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chatfiles-catalog-consumer-'))
  const owned = sealedProductSet(t, root, 'consumer')
  const catalog = createProductCatalog({
    transactionId: 'consumer-current',committedAt: '2026-07-13T00:00:00.000Z',
    products: owned.references,
  })
  activateCatalog({ dataRoot: owned.dataRoot,catalog })
  assert.equal(
    resolveCurrentProductEntrypoint(owned.dataRoot, 'wechat', 'database').endsWith('wechat.db'),
    true,
  )
  assert.equal(readCurrentLibraryManifest(root).generatedAt, '2026-07-13T00:00:00.000Z')
})

test('does not use a legacy file when the catalog is missing', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chatfiles-catalog-missing-'))
  t.after(() => fs.rmSync(root, { recursive: true,force: true }))
  const dataRoot = path.join(root, 'data')
  fs.mkdirSync(dataRoot)
  fs.writeFileSync(path.join(dataRoot, 'wechat.db'), 'legacy')
  assert.throws(() => resolveCurrentProductEntrypoint(
    dataRoot,'wechat','database',
  ), /CATALOG_CURRENT_MISSING/u)
})

test('offline library producers do not bypass the active product catalog', () => {
  for (const relativePath of [
    'scripts/buildCompletionAudit.ts','scripts/buildKnowledge.ts',
    'scripts/buildValueCandidates.ts','scripts/promoteValueCandidates.ts',
    'scripts/summary/aggregate.ts',
  ]) {
    const source = fs.readFileSync(path.resolve(process.cwd(), relativePath), 'utf8')
    assert.doesNotMatch(source, /dataDir,\s*['"]library\.json['"]/u, relativePath)
    assert.match(source, /readCurrentLibraryManifest/u, relativePath)
  }
  const promotion = fs.readFileSync(
    path.resolve(process.cwd(), 'scripts/promoteValueCandidates.ts'),'utf8',
  )
  assert.doesNotMatch(promotion, /writeJson\(manifestPath/u)
  assert.match(promotion, /promoted-library-candidate\.json/u)
})
