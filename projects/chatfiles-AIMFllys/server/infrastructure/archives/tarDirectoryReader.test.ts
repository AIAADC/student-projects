import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import test from 'node:test'

import {
  readTarDirectory,
  type TarDirectoryLimits,
  type TarProcess,
} from './tarDirectoryReader.js'

const limits: TarDirectoryLimits = {
  maxEntries: 2,
  maxDirectoryBytes: 128,
  maxDirectoryReadMs: 50,
  killGraceMs: 5,
}

function fakeProcess() {
  const process = new EventEmitter() as TarProcess & EventEmitter
  const stdout = new EventEmitter()
  const signals: Array<NodeJS.Signals | undefined> = []
  process.stdout = stdout
  process.kill = (signal) => {
    signals.push(signal)
    return true
  }
  return { process, stdout, signals }
}

test('streams UTF-8 TAR names without loading the archive body', async () => {
  const fake = fakeProcess()
  const completion = readTarDirectory('C:\\fixture\\资料.tar', limits, () => fake.process)
  fake.stdout.emit('data', Buffer.from('中文/说明'))
  fake.stdout.emit('data', Buffer.from('🙂.txt\r\n目录/\n'))
  fake.process.emit('close', 0)

  assert.deepEqual(await completion, {
    readable: true,
    entries: [
      { name: '中文/说明🙂.txt', directory: false },
      { name: '目录/', directory: true },
    ],
  })
  assert.deepEqual(fake.signals, [])
})

test('stops listing when the entry budget is exceeded', async () => {
  const fake = fakeProcess()
  const killed = new Promise<void>((resolve) => {
    fake.process.kill = (signal) => {
      fake.signals.push(signal)
      if (signal === undefined) resolve()
      return true
    }
  })
  const completion = readTarDirectory('C:\\fixture\\资料.tar', limits, () => fake.process)
  fake.stdout.emit('data', Buffer.from('一\n二\n三\n'))
  await killed
  fake.process.emit('close', null)

  assert.deepEqual(await completion, {
    readable: false,
    entries: [],
    blockedReason: 'archive_entry_limit_exceeded',
  })
  assert.deepEqual(fake.signals, [undefined])
})

test('bounds streamed directory bytes and returns no partial names', async () => {
  const fake = fakeProcess()
  const completion = readTarDirectory(
    'C:\\fixture\\资料.tar',
    { ...limits, maxDirectoryBytes: 4 },
    () => fake.process,
  )
  fake.stdout.emit('data', Buffer.from('12345'))
  fake.process.emit('close', null)

  assert.deepEqual(await completion, {
    readable: false,
    entries: [],
    blockedReason: 'archive_directory_too_large',
  })
})

test('terminates a TAR listing when its directory deadline expires', async () => {
  const fake = fakeProcess()
  const killed = new Promise<void>((resolve) => {
    fake.process.kill = (signal) => {
      fake.signals.push(signal)
      if (signal === undefined) resolve()
      return true
    }
  })
  const completion = readTarDirectory(
    'C:\\fixture\\资料.tar',
    { ...limits, maxDirectoryReadMs: 1 },
    () => fake.process,
  )
  await killed
  fake.process.emit('close', null)

  assert.deepEqual(await completion, {
    readable: false,
    entries: [],
    blockedReason: 'archive_directory_timeout',
  })
})

test('returns a stable error for a failed TAR process', async () => {
  const fake = fakeProcess()
  const completion = readTarDirectory('C:\\private\\隐私.tar', limits, () => fake.process)
  fake.process.emit('close', 2)

  const result = await completion
  assert.deepEqual(result, { readable: false, entries: [], error: 'archive_listing_failed' })
  assert.equal(JSON.stringify(result).includes('private'), false)
})

test('rejects absolute, traversal, and control-character TAR entry names', async () => {
  for (const name of ['../私密.txt', '/absolute.txt', 'C:\\absolute.txt', 'bad\u0001name.txt']) {
    const fake = fakeProcess()
    const completion = readTarDirectory('C:\\fixture\\资料.tar', limits, () => fake.process)
    fake.stdout.emit('data', Buffer.from(`${name}\n`, 'utf8'))
    fake.process.emit('close', 0)
    assert.deepEqual(await completion, {
      readable: false,
      entries: [],
      error: 'archive_listing_failed',
    }, name)
  }
})
