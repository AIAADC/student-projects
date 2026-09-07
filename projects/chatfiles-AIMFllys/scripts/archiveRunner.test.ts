import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import type { LibraryFile, LibraryManifest } from '../shared/contracts/index.js'
import { runArchiveRefresh } from './archiveRunner.js'
import { activateCatalog, createProductCatalog } from './data/catalogTransaction.js'
import { sealedProductSet } from './data/catalogTestSupport.js'
import { digestFile, digestText } from './data/productFiles.js'
import { sealProduct } from './data/productSealer.js'

function hash(value: string) {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex')
}

test('refreshes a fixture append-only and publishes only data/library.next', async (t) => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'chatfiles-refresh-'))
  const dataDirectory = path.join(projectRoot, 'data')
  const archiveDirectory = path.join(projectRoot, 'archive')
  const pdfDirectory = path.join(archiveDirectory, '学业', '文档', 'PDF')
  const sourceRoot = path.join(projectRoot, 'fixture-source')
  fs.mkdirSync(dataDirectory)
  fs.mkdirSync(pdfDirectory, { recursive: true })
  fs.mkdirSync(sourceRoot)

  const oldContents = '旧文件保持原样'
  const oldHash = hash(oldContents)
  const oldArchivePath = path.join(pdfDirectory, '旧资料.pdf')
  fs.writeFileSync(oldArchivePath, oldContents, { encoding: 'utf8', flag: 'wx' })
  const oldFile: LibraryFile = {
    id: oldHash.slice(0, 20),
    name: '旧资料.pdf',
    ext: '.pdf',
    mime: 'application/pdf',
    size: Buffer.byteLength(oldContents),
    modified: '2026-01-01T00:00:00.000Z',
    category: '学业',
    subcategory: ['文档', 'PDF'],
    archivePath: 'archive/学业/文档/PDF/旧资料.pdf',
    sourcePath: 'D:/历史来源/旧资料.pdf',
    sourceApp: '微信',
    preview: 'pdf',
    sha256: oldHash,
  }
  const legacy: LibraryManifest = {
    generatedAt: '2026-01-01T00:00:00.000Z',
    roots: ['D:/历史来源'],
    files: [oldFile],
    stats: { discovered: 1, archived: 1, duplicatesSkipped: 0, bytes: oldFile.size },
  }
  const legacyPath = path.join(dataDirectory, 'library.json')
  const legacyBytes = `${JSON.stringify(legacy, null, 2)}\n`
  fs.writeFileSync(legacyPath, legacyBytes, { encoding: 'utf8', flag: 'wx' })

  const products = sealedProductSet(t, projectRoot, 'archive-current')
  const staging = path.join(dataDirectory, 'product-staging', 'archive-current-library', 'library')
  fs.mkdirSync(staging, { recursive: true })
  const currentManifestPath = path.join(staging, 'manifest.json')
  fs.writeFileSync(currentManifestPath, legacyBytes, 'utf8')
  fs.writeFileSync(path.join(staging, 'receipt.json'), `${JSON.stringify({
    formatVersion: 1,bundle: 'library.next',runId: 'archive-current-library',
    manifestFile: 'manifest.json',manifestSha256: digestFile(currentManifestPath).slice(7),
    generatedAt: legacy.generatedAt,plannedCopies: 0,completedCopies: 0,
  })}\n`, 'utf8')
  const currentLibrary = sealProduct({
    dataRoot: dataDirectory,stagingDir: staging,kind: 'library',runId: 'archive-current-library',
    domainSchemaVersion: 1,createdAt: legacy.generatedAt,
    domainReceiptSha256: digestText('archive-current-library'),
    entrypoints: { manifest: 'manifest.json',receipt: 'receipt.json' },
    dependencies: {},counts: { files: 1,bytes: oldFile.size },
  })
  activateCatalog({ dataRoot: dataDirectory,catalog: createProductCatalog({
    transactionId: 'archive-current',committedAt: '2026-07-12T11:00:00.000Z',
    products: { ...products.references,library: currentLibrary.reference },
  }) })

  const newContents = '人物ID与对话内容统一'
  const sourcePath = path.join(sourceRoot, '中文附件.pdf')
  fs.writeFileSync(sourcePath, newContents, { encoding: 'utf8', flag: 'wx' })

  const expectedNewArchivePath = path.join(pdfDirectory, '中文附件.pdf')
  const bundleDirectory = path.join(dataDirectory, 'library.next')
  const manifestPath = path.join(bundleDirectory, 'manifest.json')
  const receiptPath = path.join(bundleDirectory, 'receipt.json')
  t.after(() => fs.rmSync(projectRoot, { recursive: true,force: true }))

  const result = await runArchiveRefresh({
    projectRoot,
    sourceRoots: [sourceRoot],
    sourceIssues: [],
    runId: 'fixture-refresh',
    generatedAt: '2026-07-12T12:00:00.000Z',
  })

  assert.equal(result.bundle.finalDirectory, bundleDirectory)
  assert.deepEqual(result.plan.copyOperations.map((operation) => operation.archivePath), [
    'archive/学业/文档/PDF/中文附件.pdf',
  ])
  assert.equal(fs.readFileSync(legacyPath, 'utf8'), legacyBytes)
  assert.equal(fs.readFileSync(oldArchivePath, 'utf8'), oldContents)
  assert.equal(fs.readFileSync(expectedNewArchivePath, 'utf8'), newContents)
  const nextManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as LibraryManifest
  assert.deepEqual(
    nextManifest.files.map((file) => file.name).sort((left, right) => left.localeCompare(right, 'zh-CN')),
    ['旧资料.pdf', '中文附件.pdf'].sort((left, right) => left.localeCompare(right, 'zh-CN')),
  )
  const nextReceipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8')) as Record<string, unknown>
  assert.equal(nextReceipt.previousSource, 'current')
  assert.equal(nextReceipt.plannedCopies, 1)
  assert.equal(nextReceipt.completedCopies, 1)
  assert.deepEqual(nextReceipt.integrityIssues, [])
})
