import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test, { type TestContext } from 'node:test'
import type { LibraryFile, LibraryManifest } from '../shared/contracts/index.js'
import { activateCatalog, createProductCatalog } from './data/catalogTransaction.js'
import { sealedProductSet } from './data/catalogTestSupport.js'
import {
  publishLibraryNextBundle,
  readLibraryManifestForArchive,
  type LibraryBundleReceiptInput,
} from './libraryBundle.js'

function libraryFile(name = '人物统一资料.pdf'): LibraryFile {
  const sha256 = crypto.createHash('sha256').update(name, 'utf8').digest('hex')
  return {
    id: sha256.slice(0, 20),
    name,
    ext: '.pdf',
    mime: 'application/pdf',
    size: 18,
    modified: '2026-07-12T10:00:00.000Z',
    category: '学业',
    subcategory: ['文档', 'PDF'],
    archivePath: `archive/学业/文档/PDF/${name}`,
    sourcePath: `D:/聊天迁移/${name}`,
    sourceApp: '微信',
    preview: 'pdf',
    sha256,
  }
}

function manifest(files = [libraryFile()]): LibraryManifest {
  return {
    generatedAt: '2026-07-12T12:00:00.000Z',
    roots: ['D:/聊天迁移/xwechat_files/wxid_用户甲/msg'],
    files,
    stats: {
      discovered: files.length,
      archived: files.length,
      duplicatesSkipped: 0,
      bytes: files.reduce((sum, file) => sum + file.size, 0),
    },
  }
}

function receipt(): LibraryBundleReceiptInput {
  return {
    generatedAt: '2026-07-12T12:00:00.000Z',
    previousSource: 'legacy',
    plannedCopies: 0,
    completedCopies: 0,
    reusedHashes: 1,
    reusedCopies: 0,
    sourceIssues: [],
    integrityIssues: [],
  }
}

function fixture(t: TestContext) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chatfiles-library-'))
  const dataDirectory = path.join(root, 'data')
  fs.mkdirSync(dataDirectory)
  const files: string[] = []
  const directories = [dataDirectory, root]
  t.after(() => {
    for (const file of files.reverse()) {
      if (fs.existsSync(file)) fs.unlinkSync(file)
    }
    for (const directory of directories) {
      if (fs.existsSync(directory)) fs.rmdirSync(directory)
    }
  })
  return {
    dataDirectory,
    trackFile(file: string) {
      files.push(file)
      return file
    },
    trackDirectory(directory: string) {
      directories.unshift(directory)
      return directory
    },
  }
}

test('publishes one UTF-8 library.next bundle and preserves every manifest entry', async (t) => {
  const owned = fixture(t)
  const finalDirectory = owned.trackDirectory(path.join(owned.dataDirectory, 'library.next'))
  owned.trackFile(path.join(finalDirectory, 'manifest.json'))
  owned.trackFile(path.join(finalDirectory, 'receipt.json'))
  const previous = manifest([libraryFile('旧人物资料.pdf'), libraryFile('中文附件.pdf')])

  const result = await publishLibraryNextBundle({
    dataDirectory: owned.dataDirectory,
    runId: '20260712T120000Z-fixture',
    manifest: previous,
    receipt: receipt(),
  })

  assert.equal(result.finalDirectory, finalDirectory)
  assert.deepEqual(fs.readdirSync(finalDirectory).sort(), ['manifest.json', 'receipt.json'])
  const bytes = fs.readFileSync(path.join(finalDirectory, 'manifest.json'))
  const decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  assert.deepEqual(JSON.parse(decoded), previous)
  assert.equal(decoded.includes('中文附件.pdf'), true)
  assert.equal(decoded.includes('\uFFFD'), false)
})

test('keeps a failed staging build unpublished', async (t) => {
  const owned = fixture(t)
  const staging = owned.trackDirectory(path.join(owned.dataDirectory, '.library.next.failed-fixture.staging'))
  owned.trackFile(path.join(staging, 'manifest.json'))
  owned.trackFile(path.join(staging, 'receipt.json'))

  await assert.rejects(
    publishLibraryNextBundle(
      {
        dataDirectory: owned.dataDirectory,
        runId: 'failed-fixture',
        manifest: manifest(),
        receipt: receipt(),
      },
      async () => {
        throw new Error('fixture validation failure')
      },
    ),
    /fixture validation failure/,
  )

  assert.equal(fs.existsSync(path.join(owned.dataDirectory, 'library.next')), false)
  assert.equal(fs.existsSync(staging), true)
})

test('refuses an existing final bundle without changing its contents', async (t) => {
  const owned = fixture(t)
  const finalDirectory = owned.trackDirectory(path.join(owned.dataDirectory, 'library.next'))
  fs.mkdirSync(finalDirectory)
  const sentinel = owned.trackFile(path.join(finalDirectory, '保留.txt'))
  fs.writeFileSync(sentinel, '不得覆盖', { encoding: 'utf8', flag: 'wx' })

  await assert.rejects(
    publishLibraryNextBundle({
      dataDirectory: owned.dataDirectory,
      runId: 'existing-fixture',
      manifest: manifest(),
      receipt: receipt(),
    }),
    /already exists/i,
  )

  assert.equal(fs.readFileSync(sentinel, 'utf8'), '不得覆盖')
  assert.deepEqual(fs.readdirSync(finalDirectory), ['保留.txt'])
  assert.equal(fs.existsSync(path.join(owned.dataDirectory, '.library.next.existing-fixture.staging')), false)
})

test('reads only the active catalog library and never falls back to library.json', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chatfiles-library-catalog-'))
  t.after(() => fs.rmSync(root, { recursive: true,force: true }))
  const dataDirectory = path.join(root, 'data')
  fs.mkdirSync(dataDirectory)
  fs.writeFileSync(path.join(dataDirectory, 'library.json'), `${JSON.stringify(manifest())}\n`, 'utf8')
  assert.throws(() => readLibraryManifestForArchive(dataDirectory), /CATALOG_CURRENT_MISSING/u)

  fs.rmSync(path.join(dataDirectory, 'library.json'))
  const products = sealedProductSet(t, root, 'library-current')
  activateCatalog({ dataRoot: products.dataRoot,catalog: createProductCatalog({
    transactionId: 'library-current',committedAt: '2026-07-13T00:00:00.000Z',
    products: products.references,
  }) })
  const current = readLibraryManifestForArchive(dataDirectory)
  assert.equal(current.source, 'current')
  assert.deepEqual(current.manifest?.files, [])
})
