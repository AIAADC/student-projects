import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { productCatalogSchema, type ProductKind } from '../../shared/contracts/productCatalog.js'
import type { ProductReleaseMetadata } from './productAdapters.js'
import { digestText } from './productFiles.js'
import { sealStagedProductRelease } from './productLifecycle.js'
import {
  activateCatalog,
  createProductCatalog,
  readActiveCatalog,
  recoverCatalog,
  rollbackCatalog,
} from './catalogTransaction.js'
import { catalogSha256 } from './catalogValidation.js'
import { sealedProductSet } from './catalogTestSupport.js'
import { inspectDataProducts } from './dataDoctor.js'

const createdAt = '2026-07-13T00:00:00.000Z'

test('persists sealed references and emits one complete candidate catalog after four products', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chatfiles-product-lifecycle-'))
  t.after(() => fs.rmSync(root, { recursive: true,force: true }))
  const dataRoot = path.join(root, 'data')
  fs.mkdirSync(dataRoot)
  const transactionId = 'lifecycle-a'
  const kinds: ProductKind[] = ['wechat','assets','library','insights']
  const metadata = (kind: ProductKind, wechat?: Parameters<typeof sealStagedProductRelease>[0]['wechatManifest']): ProductReleaseMetadata => ({
    runId: `${kind}-run`,domainSchemaVersion: kind === 'wechat' || kind === 'assets' ? 2 : 1,
    createdAt,domainReceiptSha256: digestText(`${kind}-receipt`),
    entrypoints: { primary: `${kind}.bin` },
    dependencies: kind === 'assets' || kind === 'insights'
      ? { wechat: {
        bundleSha256: wechat!.bundleSha256,entrypoint: wechat!.entrypoints.primary!,
        entrypointSha256: wechat!.files.find((file) => file.relativePath === wechat!.entrypoints.primary)!.sha256,
        runId: wechat!.runId,domainSchemaVersion: wechat!.domainSchemaVersion,
        domainReceiptSha256: wechat!.domainReceiptSha256,
      } } : {},
    counts: { items: 1 },
  })
  for (const kind of kinds) {
    const staging = path.join(dataRoot, 'product-staging', transactionId, kind)
    fs.mkdirSync(staging, { recursive: true })
    fs.writeFileSync(path.join(staging, `${kind}.bin`), kind, 'utf8')
    sealStagedProductRelease({
      projectRoot: root,dataRoot,transactionId,kind,
      metadata: ({ wechatManifest }) => metadata(kind, wechatManifest),
    })
  }
  const candidate = productCatalogSchema.parse(JSON.parse(
    fs.readFileSync(path.join(dataRoot, 'catalog.next.json'), 'utf8'),
  ))
  assert.equal(candidate.transactionId, transactionId)
  assert.equal(candidate.products.assets.bundleSha256.startsWith('sha256:'), true)
})

test('keeps four real sealed products coherent through activate, status, rollback, and recovery', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chatfiles-product-integration-'))
  const first = sealedProductSet(t, root, 'integration-first')
  const firstCatalog = createProductCatalog({
    transactionId: 'integration-first',committedAt: '2026-07-13T00:00:00.000Z',
    products: first.references,
  })
  activateCatalog({ dataRoot: first.dataRoot,catalog: firstCatalog })
  assert.equal(inspectDataProducts(first.dataRoot).state, 'ready')

  const second = sealedProductSet(t, root, 'integration-second')
  const secondCatalog = createProductCatalog({
    transactionId: 'integration-second',committedAt: '2026-07-13T00:01:00.000Z',
    parentCatalogSha256: catalogSha256(firstCatalog),products: second.references,
  })
  activateCatalog({ dataRoot: first.dataRoot,catalog: secondCatalog })
  assert.equal(inspectDataProducts(first.dataRoot).state, 'ready')
  rollbackCatalog({
    dataRoot: first.dataRoot,transactionId: 'integration-rollback',
    committedAt: '2026-07-13T00:02:00.000Z',
  })
  const rolledBack = readActiveCatalog(first.dataRoot).catalog!
  assert.deepEqual(rolledBack.products, firstCatalog.products)

  const third = sealedProductSet(t, root, 'integration-third')
  const interrupted = createProductCatalog({
    transactionId: 'integration-interrupted',committedAt: '2026-07-13T00:03:00.000Z',
    parentCatalogSha256: catalogSha256(rolledBack),products: third.references,
  })
  assert.throws(() => activateCatalog({
    dataRoot: first.dataRoot,catalog: interrupted,
    fault: (point) => { if (point === 'after_previous') throw new Error('INTEGRATION_CRASH') },
  }), /INTEGRATION_CRASH/u)
  assert.equal(inspectDataProducts(first.dataRoot).state, 'recovery_required')
  assert.equal(recoverCatalog(first.dataRoot).status, 'rolled_back')
  assert.deepEqual(readActiveCatalog(first.dataRoot).catalog?.products, rolledBack.products)
  assert.equal(inspectDataProducts(first.dataRoot).state, 'ready')
})
