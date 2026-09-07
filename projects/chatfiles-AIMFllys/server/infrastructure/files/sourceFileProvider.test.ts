import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import type { SourceFileManifest, SourceIndexedFile } from '../../../shared/contracts/files.js'
import { createSourceFileProvider } from './sourceFileProvider.js'

function fixture(t: test.TestContext) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'chatfiles-source-provider-'))
  const root = path.join(directory, '原始资料')
  const target = path.join(root, '中文目录', '说明🙂.txt')
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, '中文正文', 'utf8')
  const stat = fs.statSync(target)
  const item: SourceIndexedFile = {
    id: 'a'.repeat(20), name: '说明🙂.txt', ext: '.txt', mime: 'text/plain', size: stat.size,
    modified: stat.mtime.toISOString(), root, relativePath: '中文目录/说明🙂.txt', sourcePath: target,
    sourceApp: '微信', preview: 'text',
  }
  const manifest: SourceFileManifest = {
    generatedAt: new Date().toISOString(), roots: [root], files: [item],
    stats: { files: 1, bytes: stat.size, databaseCandidates: 0, mediaCandidates: 0, textCandidates: 1 },
  }
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  return { directory, root, target, item, manifest }
}

test('resolves one indexed regular file with its explicit source scope and evidence', (t) => {
  const { target, manifest } = fixture(t)
  const provider = createSourceFileProvider(manifest)
  const resolved = provider.resolve('a'.repeat(20))
  assert.equal(resolved?.target, fs.realpathSync(target))
  assert.deepEqual(resolved?.descriptor.ref, { scope: 'source', id: 'a'.repeat(20) })
  assert.equal(resolved?.descriptor.name, '说明🙂.txt')
  assert.equal(provider.describe('a'.repeat(20))?.ref.scope, 'source')
  assert.equal(provider.open('a'.repeat(20), 'content').status, 'available')
})

test('rejects sibling-prefix escapes and same-path files whose indexed evidence changed', (t) => {
  const { directory, target, item, manifest } = fixture(t)
  const sibling = path.join(directory, '原始资料-伪造', '说明.txt')
  fs.mkdirSync(path.dirname(sibling), { recursive: true })
  fs.writeFileSync(sibling, '伪造', 'utf8')
  const escaped = { ...item, sourcePath: sibling, root: manifest.roots[0]! }
  assert.equal(createSourceFileProvider({ ...manifest, files: [escaped] }).resolve(item.id), null)

  fs.appendFileSync(target, '变化', 'utf8')
  assert.equal(createSourceFileProvider(manifest).resolve(item.id), null)
})

test('rejects a leaf symbolic link instead of following it', (t) => {
  const { root, target, item, manifest } = fixture(t)
  const link = path.join(root, '链接.txt')
  try {
    fs.symlinkSync(target, link, 'file')
  } catch (error) {
    t.skip(`当前 Windows 权限不允许文件符号链接：${String(error)}`)
    return
  }
  const linked = { ...item, sourcePath: link, relativePath: '链接.txt' }
  assert.equal(createSourceFileProvider({ ...manifest, files: [linked] }).resolve(item.id), null)
})
