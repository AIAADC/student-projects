import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import type { LibraryFile, LibraryManifest } from '../../../shared/contracts/files.js'
import { createArchiveFileProvider } from './archiveFileProvider.js'

test('describes manifest evidence before opening one verified archive file', async (t) => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'chatfiles-archive-provider-'))
  const target = path.join(projectRoot, 'archive', 'AI', '中文.txt')
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, '中文正文', 'utf8')
  const stat = fs.statSync(target)
  const item: LibraryFile = {
    id: 'b'.repeat(20), name: '中文.txt', ext: '.txt', mime: 'text/plain', size: stat.size,
    modified: stat.mtime.toISOString(), category: 'AI', subcategory: [],
    archivePath: 'archive/AI/中文.txt', sourcePath: '', sourceApp: '微信', preview: 'text',
    sha256: crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex'),
  }
  const manifest: LibraryManifest = {
    generatedAt: new Date().toISOString(), roots: [], files: [item],
    stats: { discovered: 1, archived: 1, duplicatesSkipped: 0, bytes: stat.size },
  }
  t.after(() => fs.rmSync(projectRoot, { recursive: true, force: true }))
  const provider = createArchiveFileProvider(projectRoot, manifest)

  assert.equal((await provider.describe(item.id))?.ref.scope, 'archive')
  assert.equal((await provider.open(item.id, 'content')).status, 'available')
  fs.appendFileSync(target, '变化', 'utf8')
  assert.equal((await provider.open(item.id, 'content')).status, 'unavailable')
})
