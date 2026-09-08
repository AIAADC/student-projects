import assert from 'node:assert/strict'
import test from 'node:test'
import {
  productCatalogSchema,
  productManifestSchema,
} from './productCatalog.js'

const digest = `sha256:${'a'.repeat(64)}`

function productManifest() {
  return {
    schemaVersion: 1,
    kind: 'wechat',
    runId: '运行-2026.07.13',
    domainSchemaVersion: 2,
    createdAt: '2026-07-13T00:00:00.000Z',
    bundleSha256: digest,
    domainReceiptSha256: digest,
    entrypoints: { database: 'wechat.db', index: 'index.json' },
    files: [
      { relativePath: 'index.json', size: 12, sha256: digest },
      { relativePath: 'wechat.db', size: 42, sha256: digest },
    ],
    dependencies: {},
    counts: { messages: 1, conversations: 1 },
  }
}

function catalog() {
  const reference = { bundleSha256: digest, manifestSha256: digest }
  return {
    schemaVersion: 1,
    transactionId: 'txn-2026.07.13',
    committedAt: '2026-07-13T00:00:00.000Z',
    products: {
      wechat: reference,
      assets: reference,
      library: reference,
      insights: reference,
    },
    bundleSetSha256: digest,
  }
}

test('round-trips strict UTF-8 product manifests with sorted bounded file evidence', () => {
  const parsed = productManifestSchema.parse(productManifest())
  assert.equal(parsed.runId, '运行-2026.07.13')
  assert.deepEqual(parsed.files.map((file) => file.relativePath), ['index.json', 'wechat.db'])
  assert.throws(() => productManifestSchema.parse({
    ...productManifest(),
    files: [...productManifest().files].reverse(),
  }), /files/u)
  assert.throws(() => productManifestSchema.parse({ ...productManifest(), privatePath: 'D:\\秘密' }))
})

test('requires every product reference and rejects malformed hashes or extra catalog fields', () => {
  assert.equal(productCatalogSchema.parse(catalog()).products.wechat.bundleSha256, digest)
  const missing = catalog()
  delete (missing.products as Partial<typeof missing.products>).insights
  assert.throws(() => productCatalogSchema.parse(missing))
  assert.throws(() => productCatalogSchema.parse({
    ...catalog(),bundleSetSha256: 'sha256:not-a-digest',
  }))
  assert.throws(() => productCatalogSchema.parse({ ...catalog(), absolutePath: 'D:\\private' }))
  assert.throws(() => productCatalogSchema.parse({ ...catalog(),transactionId: '../escape' }))
})

test('binds product dependencies to one named entrypoint digest', () => {
  const valid = productManifest()
  valid.dependencies = {
    wechat: {
      bundleSha256: digest,entrypoint: 'wechat.db',entrypointSha256: digest,
      runId: '运行-2026.07.13',domainSchemaVersion: 2,domainReceiptSha256: digest,
    },
  }
  assert.equal(productManifestSchema.parse(valid).dependencies.wechat?.entrypoint, 'wechat.db')
  assert.throws(() => productManifestSchema.parse({
    ...valid,
    dependencies: { wechat: { bundleSha256: digest,entrypointSha256: digest } },
  }))
  assert.throws(() => productManifestSchema.parse({
    ...valid,
    dependencies: { wechat: {
      bundleSha256: digest,entrypoint: 'wechat.db',entrypointSha256: digest,
      runId: 'other-run',domainSchemaVersion: 2,
    } },
  }))
})
