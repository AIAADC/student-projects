import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import JSZip from 'jszip'

import { inspectArchive } from './inspect.js'

async function writeZip(target: string) {
  const zip = new JSZip()
  zip.file('中文/说明🙂.txt', Buffer.from('正文', 'utf8'), { createFolders: false })
  await fs.promises.writeFile(target, await zip.generateAsync({ type: 'nodebuffer', compression: 'STORE' }))
}

test('previews ZIP metadata without changing the original archive', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'chatfiles-zip-preview-'))
  const target = path.join(directory, '资料.zip')
  await writeZip(target)
  const before = fs.statSync(target)
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))

  const result = await inspectArchive(target)

  assert.equal(result.readable, true)
  assert.equal(result.entries[0]?.name, '中文/说明🙂.txt')
  assert.equal(result.entries[0]?.size, Buffer.byteLength('正文'))
  const after = fs.statSync(target)
  assert.equal(after.size, before.size)
  assert.equal(after.mtimeMs, before.mtimeMs)
})

test('blocks only ZIP preview when the archive exceeds its configured file budget', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'chatfiles-zip-budget-'))
  const target = path.join(directory, '资料.zip')
  await writeZip(target)
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  const bytes = fs.readFileSync(target)

  const result = await inspectArchive(target, { maxArchiveBytes: bytes.length - 1 })

  assert.equal(result.readable, false)
  assert.equal(result.blockedReason, 'archive_file_too_large')
  assert.deepEqual(fs.readFileSync(target), bytes)
})

test('blocks a non-ZIP archive before listing when it exceeds the file budget', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'chatfiles-tar-budget-'))
  const target = path.join(directory, '资料.tar')
  const bytes = Buffer.from('not a tar archive', 'utf8')
  fs.writeFileSync(target, bytes)
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))

  const result = await inspectArchive(target, { maxArchiveBytes: bytes.length - 1 })

  assert.equal(result.readable, false)
  assert.equal(result.blockedReason, 'archive_file_too_large')
  assert.deepEqual(fs.readFileSync(target), bytes)
})

test('returns a stable path-free error when a non-ZIP directory cannot be listed', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'chatfiles-tar-invalid-'))
  const target = path.join(directory, '隐私路径.tar')
  fs.writeFileSync(target, 'not a tar archive', 'utf8')
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))

  const result = await inspectArchive(target)

  assert.equal(result.readable, false)
  assert.equal(result.error, 'archive_listing_failed')
  assert.equal(JSON.stringify(result).includes(target), false)
})
