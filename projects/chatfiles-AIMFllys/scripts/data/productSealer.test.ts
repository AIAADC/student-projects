import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { sealProduct, validateSealedProduct } from './productSealer.js'

const digest = `sha256:${'c'.repeat(64)}`

function fixture(t: test.TestContext) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chatfiles-product-seal-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const dataRoot = path.join(root, 'data')
  const stagingDir = path.join(dataRoot, 'product-staging', 'txn-a', 'wechat')
  fs.mkdirSync(path.join(stagingDir, '记录'), { recursive: true })
  fs.writeFileSync(path.join(stagingDir, 'wechat.db'), 'database fixture', 'utf8')
  fs.writeFileSync(path.join(stagingDir, '记录', '索引.json'), '{"中文":"未损坏"}\n', 'utf8')
  return { root,dataRoot,stagingDir }
}

function request(stagingDir: string) {
  return {
    dataRoot: path.dirname(path.dirname(path.dirname(stagingDir))),
    stagingDir,
    kind: 'wechat' as const,
    runId: '运行-a',
    domainSchemaVersion: 2,
    createdAt: '2026-07-13T00:00:00.000Z',
    domainReceiptSha256: digest,
    entrypoints: { database: 'wechat.db', index: '记录/索引.json' },
    dependencies: {},
    counts: { messages: 1 },
  }
}

test('seals a UTF-8 product into a content-addressed immutable bundle', (t) => {
  const owned = fixture(t)
  const sealed = sealProduct(request(owned.stagingDir))
  assert.match(sealed.productDir, /[\\/]data[\\/]products[\\/]wechat[\\/][0-9a-f]{64}$/u)
  assert.equal(sealed.manifest.entrypoints.release, 'release.json')
  const receipt = JSON.parse(fs.readFileSync(path.join(sealed.productDir, 'release.json'), 'utf8'))
  assert.equal(receipt.evidenceSha256, digest)
  assert.equal(receipt.domainSchemaVersion, 2)
  assert.equal(fs.readFileSync(path.join(owned.stagingDir, '记录', '索引.json'), 'utf8'), '{"中文":"未损坏"}\n')
  assert.equal(validateSealedProduct({ dataRoot: owned.dataRoot,reference: sealed.reference,kind: 'wechat' }).runId, '运行-a')
  assert.deepEqual(sealProduct(request(owned.stagingDir)).reference, sealed.reference)
})

test('detects same-size tampering and refuses linked source entries', (t) => {
  const owned = fixture(t)
  const sealed = sealProduct(request(owned.stagingDir))
  fs.writeFileSync(path.join(sealed.productDir, 'release.json'), '{}\n', 'utf8')
  assert.throws(() => validateSealedProduct({
    dataRoot: owned.dataRoot,reference: sealed.reference,kind: 'wechat',
  }), /PRODUCT_RECEIPT_INVALID/u)
  fs.writeFileSync(path.join(sealed.productDir, 'release.json'), `${JSON.stringify({
    version: 1,kind: 'wechat',runId: '运行-a',domainSchemaVersion: 2,
    validatedAt: '2026-07-13T00:00:00.000Z',evidenceSha256: digest,counts: { messages: 1 },
  }, null, 2)}\n`, 'utf8')
  fs.writeFileSync(path.join(sealed.productDir, 'wechat.db'), 'DATABASE fixture', 'utf8')
  assert.throws(() => validateSealedProduct({
    dataRoot: owned.dataRoot,reference: sealed.reference,kind: 'wechat',
  }), /PRODUCT_FILE_DIGEST_MISMATCH/u)

  const second = fixture(t)
  const outside = path.join(second.root, 'outside')
  fs.mkdirSync(outside)
  try {
    fs.symlinkSync(outside, path.join(second.stagingDir, 'escape'), 'junction')
  } catch {
    t.skip('This Windows host does not allow creating directory links')
    return
  }
  assert.throws(() => sealProduct(request(second.stagingDir)), /PRODUCT_LINK_UNSAFE/u)
})

test('rejects injected references and staging outside the generated data role', (t) => {
  const owned = fixture(t)
  assert.throws(() => validateSealedProduct({
    dataRoot: owned.dataRoot,
    kind: 'wechat',
    reference: { bundleSha256: 'sha256:../../outside',manifestSha256: digest },
  } as never), /PRODUCT_REFERENCE_INVALID/u)

  const outside = path.join(owned.root, 'outside-staging')
  fs.mkdirSync(outside)
  fs.writeFileSync(path.join(outside, 'wechat.db'), 'private source', 'utf8')
  assert.throws(() => sealProduct({ ...request(owned.stagingDir),stagingDir: outside }), (
    error: unknown,
  ) => error instanceof Error && error.message === 'PRODUCT_STAGING_ROLE_INVALID')
  assert.equal(fs.existsSync(path.join(owned.dataRoot, 'products')), false)
})

test('refuses a products role junction before writing any sealed output', (t) => {
  const owned = fixture(t)
  const outside = path.join(owned.root, 'outside-products')
  fs.mkdirSync(outside)
  fs.mkdirSync(owned.dataRoot, { recursive: true })
  try {
    fs.symlinkSync(outside, path.join(owned.dataRoot, 'products'), 'junction')
  } catch {
    t.skip('This Windows host does not allow creating directory links')
    return
  }
  assert.throws(() => sealProduct(request(owned.stagingDir)), /PRODUCT_OUTPUT_ROLE_INVALID/u)
  assert.deepEqual(fs.readdirSync(outside), [])
})
