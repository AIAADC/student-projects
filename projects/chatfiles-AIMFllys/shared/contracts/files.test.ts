import assert from 'node:assert/strict'
import test from 'node:test'
import { libraryManifestSchema } from './files.js'

const digest = 'a'.repeat(64)

function manifest(archivePath = 'archive/AI/中文资料.txt') {
  return {
    generatedAt: '2026-07-13T00:00:00.000Z',roots: [],files: [{
      id: 'file-1',name: '中文资料.txt',ext: '.txt',mime: 'text/plain',size: 3,
      modified: '2026-07-13T00:00:00.000Z',category: 'AI',subcategory: [],
      archivePath,sourcePath: 'private',sourceApp: '微信',preview: 'text',sha256: digest,
    }],stats: { discovered: 1,archived: 1,duplicatesSkipped: 0,bytes: 3 },
  }
}

test('accepts a closed library manifest and rejects archive traversal', () => {
  assert.equal(libraryManifestSchema.parse(manifest()).files[0]?.name, '中文资料.txt')
  assert.throws(() => libraryManifestSchema.parse(manifest('archive/../archive-secret/secret.txt')))
  assert.throws(() => libraryManifestSchema.parse(manifest('D:\\private\\secret.txt')))
})
