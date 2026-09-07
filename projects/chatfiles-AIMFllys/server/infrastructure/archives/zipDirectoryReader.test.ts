import assert from 'node:assert/strict'
import test from 'node:test'

import JSZip from 'jszip'

import {
  readZipDirectory,
  type RandomAccessByteSource,
  type ZipDirectoryLimits,
} from './zipDirectoryReader.js'

const limits: ZipDirectoryLimits = {
  maxArchiveBytes: 8 * 1024 * 1024,
  maxEntries: 600,
  maxDirectoryReadMs: 15_000,
  maxExpandedBytes: 2 * 1024 * 1024 * 1024,
  maxCentralDirectoryBytes: 16 * 1024 * 1024,
}

async function zipBuffer(files: Array<{ name: string; bytes: Uint8Array }>) {
  const zip = new JSZip()
  for (const file of files) zip.file(file.name, file.bytes, { createFolders: false })
  return await zip.generateAsync({ type: 'nodebuffer', compression: 'STORE' })
}

function source(buffer: Buffer) {
  const reads: Array<{ offset: number; length: number }> = []
  const bytes: RandomAccessByteSource = {
    size: buffer.length,
    async read(offset, length) {
      reads.push({ offset, length })
      return buffer.subarray(offset, offset + length)
    },
  }
  return { bytes, reads }
}

test('reads only the ZIP tail and central directory while preserving UTF-8 names', async () => {
  const payload = Buffer.alloc(2 * 1024 * 1024, 7)
  const archive = await zipBuffer([
    { name: '中文目录/说明🙂.txt', bytes: payload },
    { name: '空目录/', bytes: new Uint8Array() },
  ])
  const tracked = source(archive)

  const result = await readZipDirectory(tracked.bytes, limits)

  assert.equal(result.readable, true)
  assert.deepEqual(result.entries.map((entry) => entry.name), ['中文目录/说明🙂.txt', '空目录/'])
  assert.deepEqual(result.entries.map((entry) => entry.directory), [false, true])
  assert.equal(result.entries[0]?.size, payload.length)
  const totalRead = tracked.reads.reduce((sum, read) => sum + read.length, 0)
  assert.ok(totalRead < 200_000, `unexpectedly read ${totalRead} bytes`)
  assert.equal(tracked.reads.some((read) => read.offset === 0 && read.length >= payload.length), false)
})

test('blocks archive size, entry count, and declared expanded bytes with stable reasons', async () => {
  const archive = await zipBuffer([
    { name: '一.txt', bytes: Buffer.alloc(32) },
    { name: '二.txt', bytes: Buffer.alloc(32) },
  ])

  for (const [override, blockedReason, expectNoRead] of [
    [{ maxArchiveBytes: archive.length - 1 }, 'archive_file_too_large', true],
    [{ maxEntries: 1 }, 'archive_entry_limit_exceeded', false],
    [{ maxExpandedBytes: 63 }, 'archive_expanded_size_limit_exceeded', false],
  ] as const) {
    const tracked = source(archive)
    const result = await readZipDirectory(tracked.bytes, { ...limits, ...override })
    assert.deepEqual(result, { readable: false, entries: [], blockedReason })
    if (expectNoRead) assert.equal(tracked.reads.length, 0)
  }
})

test('fails closed when the injected directory deadline expires', async () => {
  const archive = await zipBuffer([{ name: '说明.txt', bytes: Buffer.from('正文', 'utf8') }])
  const tracked = source(archive)
  let tick = 0
  const result = await readZipDirectory(
    tracked.bytes,
    { ...limits, maxDirectoryReadMs: 5 },
    { now: () => (tick++ === 0 ? 0 : 10) },
  )
  assert.deepEqual(result, {
    readable: false,
    entries: [],
    blockedReason: 'archive_directory_timeout',
  })
})

test('returns a stable path-free error when random-access reading fails', async () => {
  const result = await readZipDirectory({
    size: 128,
    async read() {
      throw new Error('cannot read C:\\private\\聊天资料.zip')
    },
  }, limits)

  assert.deepEqual(result, {
    readable: false,
    entries: [],
    error: 'zip_directory_failed',
  })
})

test('rejects unsafe ZIP entry names even though previews never extract them', async () => {
  for (const name of ['../私密.txt', '/absolute.txt', 'C:/absolute.txt']) {
    const archive = await zipBuffer([{ name, bytes: Buffer.from('x') }])
    const result = await readZipDirectory(source(archive).bytes, limits)
    assert.deepEqual(result, {
      readable: false,
      entries: [],
      error: 'invalid_zip_entry_name',
    }, name)
  }
})
