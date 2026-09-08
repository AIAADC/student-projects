import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import type { ProductManifest } from '../../shared/contracts/productCatalog.js'
import type { ActiveProductSet } from './catalogReader.js'
import { runtimeDigestFile } from './catalogRuntimeFiles.js'
import { readCatalogInsights, readCatalogLibrary } from './productReaders.js'

function fixture(t: test.TestContext, archivePath?: string) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chatfiles-product-reader-'))
  t.after(() => fs.rmSync(root, { recursive: true,force: true }))
  const productRoot = path.join(root, 'product')
  fs.mkdirSync(path.join(productRoot, 'conv'), { recursive: true })
  fs.mkdirSync(path.join(productRoot, 'boards'))
  const files = archivePath ? [{
    id: 'evil',name: 'secret.txt',ext: '.txt',mime: 'text/plain',size: 1,
    modified: '2026-07-13T00:00:00.000Z',category: 'AI',subcategory: [],archivePath,
    sourcePath: 'private',sourceApp: '微信',preview: 'text',sha256: 'a'.repeat(64),
  }] : []
  fs.writeFileSync(path.join(productRoot, 'manifest.json'), JSON.stringify({
    generatedAt: '2026-07-13T00:00:00.000Z',roots: [],files,
    stats: { discovered: files.length,archived: files.length,duplicatesSkipped: 0,bytes: files.length },
  }))
  fs.writeFileSync(path.join(productRoot, 'conv', 'one.json'), '{"convId":"一","nuggets":[]}')
  fs.writeFileSync(path.join(productRoot, 'boards', 'AI.md'), '# AI\n')
  const evidence = ['manifest.json', 'conv/one.json', 'boards/AI.md'].map((relativePath) => {
    const filename = path.join(productRoot, ...relativePath.split('/'))
    return { relativePath,size: fs.statSync(filename).size,sha256: runtimeDigestFile(filename) }
  })
  const manifest = (kind: 'library' | 'insights'): ProductManifest => ({
    schemaVersion: 1,kind,runId: `${kind}-run`,createdAt: '2026-07-13T00:00:00.000Z',
    domainSchemaVersion: 1,
    bundleSha256: `sha256:${'a'.repeat(64)}`,domainReceiptSha256: `sha256:${'b'.repeat(64)}`,
    entrypoints: kind === 'library' ? { manifest: 'manifest.json' } : {},
    files: evidence,dependencies: {},counts: {},
  })
  const active = (kind: 'library' | 'insights'): ActiveProductSet => ({
    state: 'ready',catalog: null,status: {} as never,
    products: { [kind]: { root: productRoot,manifest: manifest(kind) } },
  })
  return { root,productRoot,active }
}

test('reads a library only from its verified catalog entrypoint', (t) => {
  const owned = fixture(t)
  assert.equal(readCatalogLibrary(owned.active('library')).generatedAt, '2026-07-13T00:00:00.000Z')
})

test('rejects an unsafe archive path even when the product file digest is valid', (t) => {
  const owned = fixture(t, 'archive/../archive-secret/secret.txt')
  assert.throws(() => readCatalogLibrary(owned.active('library')), /DATA_PRODUCT_FILE_INVALID/u)
})

test('rejects one malformed insight instead of serving a partial collection', (t) => {
  const owned = fixture(t)
  assert.deepEqual(readCatalogInsights(owned.active('insights')).boards, { AI: '# AI\n' })
  fs.writeFileSync(path.join(owned.productRoot, 'conv', 'one.json'), '{broken')
  assert.throws(() => readCatalogInsights(owned.active('insights')), /DATA_PRODUCT_FILE_INVALID/u)
})
