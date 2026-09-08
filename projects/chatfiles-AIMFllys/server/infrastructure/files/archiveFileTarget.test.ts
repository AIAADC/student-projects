import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import type { LibraryFile } from '../../../shared/contracts/files.js'
import { resolveArchiveTarget } from './archiveFileTarget.js'

function file(archivePath: string, content: string): LibraryFile {
  return {
    id: 'file-1',name: '资料.txt',ext: '.txt',mime: 'text/plain',size: Buffer.byteLength(content),
    modified: '2026-07-13T00:00:00.000Z',category: 'AI',subcategory: [],archivePath,
    sourcePath: 'private',sourceApp: '微信',preview: 'text',
    sha256: crypto.createHash('sha256').update(content).digest('hex'),
  }
}

test('resolves only a digest-matching regular file inside the real archive role', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chatfiles-archive-target-'))
  t.after(() => fs.rmSync(root, { recursive: true,force: true }))
  fs.mkdirSync(path.join(root, 'archive', 'AI'), { recursive: true })
  fs.mkdirSync(path.join(root, 'archive-secret'))
  fs.writeFileSync(path.join(root, 'archive', 'AI', '资料.txt'), 'safe', 'utf8')
  fs.writeFileSync(path.join(root, 'archive-secret', 'secret.txt'), 'evil', 'utf8')
  assert.equal(resolveArchiveTarget(root, file('archive/AI/资料.txt', 'safe')),
    path.join(root, 'archive', 'AI', '资料.txt'))
  assert.equal(resolveArchiveTarget(root, file('archive/../archive-secret/secret.txt', 'evil')), null)
  fs.writeFileSync(path.join(root, 'archive', 'AI', '资料.txt'), 'tamp', 'utf8')
  assert.equal(resolveArchiveTarget(root, file('archive/AI/资料.txt', 'safe')), null)
})
