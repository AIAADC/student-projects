import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { Readable } from 'node:stream'
import test from 'node:test'
import {
  SCANNER_PROTOCOL_MAGIC,
  SCANNER_PROTOCOL_VERSION,
  ScannerProtocolParser,
} from './scannerProtocol.js'
import {
  ScannerRunError,
  runKeyScanner,
  type ScannerChild,
  type ScannerSpawn,
} from './keyScanner.js'

function wireMany(records: Array<{ relativePath: string; key: Buffer }>) {
  const encoded = records.map(({ relativePath, key }) => ({
    pathBytes: Buffer.from(relativePath, 'utf8'),
    key,
  }))
  const bytes = Buffer.alloc(
    SCANNER_PROTOCOL_MAGIC.length
    + 4
    + encoded.reduce((sum, record) => sum + 4 + record.pathBytes.length + 32, 0)
    + 4,
  )
  let offset = 0
  SCANNER_PROTOCOL_MAGIC.copy(bytes, offset)
  offset += SCANNER_PROTOCOL_MAGIC.length
  bytes.writeUInt32LE(SCANNER_PROTOCOL_VERSION, offset)
  offset += 4
  for (const { pathBytes, key } of encoded) {
    bytes.writeUInt32LE(pathBytes.length, offset)
    offset += 4
    pathBytes.copy(bytes, offset)
    offset += pathBytes.length
    key.copy(bytes, offset)
    offset += 32
  }
  bytes.writeUInt32LE(0, offset)
  return bytes
}

function wire(relativePath: string, key: Buffer) {
  return wireMany([{ relativePath, key }])
}

class FakeChild extends EventEmitter implements ScannerChild {
  stdout: Readable
  stderr: Readable
  killed = false

  constructor(stdoutChunks: Buffer[], stderrChunks: Buffer[], exitCode = 0) {
    super()
    this.stdout = Readable.from(stdoutChunks)
    this.stderr = Readable.from(stderrChunks)
    queueMicrotask(() => this.emit('close', exitCode, null))
  }

  kill() {
    this.killed = true
    return true
  }
}

test('spawns with pipes, consumes Chinese records one at a time, and zeroes keys and pipe chunks', async () => {
  const key = Buffer.alloc(32, 0x5a)
  const encoded = wire('db_storage\\message\\中文消息.db', key)
  const stdoutChunks = [Buffer.from(encoded.subarray(0, 11)), Buffer.from(encoded.subarray(11))]
  const stderrChunks = [Buffer.from('OK 1', 'utf8')]
  let spawnArgs: readonly string[] = []
  let spawnOptions: Record<string, unknown> = {}
  const spawn: ScannerSpawn = (_command, args, options) => {
    spawnArgs = args
    spawnOptions = options as unknown as Record<string, unknown>
    return new FakeChild(stdoutChunks, stderrChunks)
  }
  let keyReference: Buffer | undefined

  const count = await runKeyScanner({
    executablePath: 'C:\\fixture\\scanner.exe',
    pid: 4321,
    accountRoot: 'C:\\微信数据\\wxid_fixture',
    spawn,
    async onKey(record) {
      assert.equal(record.relativePath, 'db_storage\\message\\中文消息.db')
      assert.equal(record.databasePath, 'C:\\微信数据\\wxid_fixture\\db_storage\\message\\中文消息.db')
      assert.deepEqual(record.key, key)
      keyReference = record.key
    },
  })

  assert.equal(count, 1)
  assert.deepEqual(spawnArgs, ['4321', 'C:\\微信数据\\wxid_fixture'])
  assert.deepEqual(spawnOptions.stdio, ['ignore', 'pipe', 'pipe'])
  assert.equal(spawnOptions.shell, false)
  assert.equal(spawnOptions.windowsHide, true)
  assert.deepEqual(keyReference, Buffer.alloc(32))
  for (const chunk of [...stdoutChunks, ...stderrChunks]) assert.deepEqual(chunk, Buffer.alloc(chunk.length))
})

test('discards stderr content and exposes only a stable code for scanner failure', async () => {
  const secret = 'C:\\私人目录\\wxid_secret ' + 'ab'.repeat(32)
  const spawn: ScannerSpawn = () => new FakeChild(
    [wire('db_storage\\message\\message.db', Buffer.alloc(32, 0xab))],
    [Buffer.from(secret, 'utf8')],
    2,
  )
  await assert.rejects(
    runKeyScanner({
      executablePath: 'scanner.exe',
      pid: 1,
      accountRoot: 'C:\\fixture',
      spawn,
      async onKey() {},
    }),
    (error: unknown) => {
      assert.equal(error instanceof ScannerRunError && error.code === 'SCANNER_EXIT_NONZERO', true)
      assert.equal(String((error as Error).message).includes('私人目录'), false)
      assert.equal(String((error as Error).message).includes('abab'), false)
      return true
    },
  )
})

test('sanitizes consumer failures and zeroes the delivered key', async () => {
  const key = Buffer.alloc(32, 0xcd)
  const consumerFailure = new Error('C:\\private ' + 'cd'.repeat(32))
  let delivered: Buffer | undefined
  const child = new FakeChild([wire('db_storage\\message\\message.db', key)], [])
  const spawn: ScannerSpawn = () => child
  await assert.rejects(
    runKeyScanner({
      executablePath: 'scanner.exe',
      pid: 1,
      accountRoot: 'C:\\fixture',
      spawn,
      async onKey(record) {
        delivered = record.key
        throw consumerFailure
      },
    }),
    (error: unknown) => {
      assert.equal(error instanceof ScannerRunError && error.code === 'KEY_CONSUMER_FAILED', true)
      assert.equal((error as Error & { cause?: unknown }).cause, undefined)
      assert.equal((error as ScannerRunError).consumerCode, undefined)
      assert.equal(String((error as Error).message).includes('private'), false)
      assert.equal(String((error as Error).message).includes('cdcd'), false)
      return true
    },
  )
  assert.deepEqual(delivered, Buffer.alloc(32))
  assert.equal(child.killed, true)
})

test('zeroes every parsed sibling key when the first consumer call fails', async () => {
  const encoded = wireMany([
    { relativePath: 'db_storage\\message\\first.db', key: Buffer.alloc(32, 0x11) },
    { relativePath: 'db_storage\\message\\second.db', key: Buffer.alloc(32, 0x22) },
  ])
  const captured: Buffer[] = []
  const originalPush = ScannerProtocolParser.prototype.push
  ScannerProtocolParser.prototype.push = function captureKeys(chunk: Buffer) {
    const records = originalPush.call(this, chunk)
    captured.push(...records.map((record) => record.key))
    return records
  }
  try {
    await assert.rejects(runKeyScanner({
      executablePath: 'scanner.exe',
      pid: 1,
      accountRoot: 'C:\\fixture',
      spawn: () => new FakeChild([encoded], []),
      async onKey() {
        throw new Error('consumer failed')
      },
    }), (error: unknown) => error instanceof ScannerRunError && error.code === 'KEY_CONSUMER_FAILED')
  } finally {
    ScannerProtocolParser.prototype.push = originalPush
  }

  assert.equal(captured.length, 2)
  for (const key of captured) assert.deepEqual(key, Buffer.alloc(32))
})

test('retains only an explicitly allowlisted consumer error code', async () => {
  const failure = Object.assign(new Error('private details'), { code: 'SAFE_FIXTURE_FAILURE' })
  await assert.rejects(
    runKeyScanner({
      executablePath: 'scanner.exe',
      pid: 1,
      accountRoot: 'C:\\fixture',
      spawn: () => new FakeChild([
        wire('db_storage\\message\\message.db', Buffer.alloc(32, 0x33)),
      ], []),
      allowedConsumerErrorCodes: new Set(['SAFE_FIXTURE_FAILURE']),
      async onKey() {
        throw failure
      },
    }),
    (error: unknown) => (
      error instanceof ScannerRunError
      && error.code === 'KEY_CONSUMER_FAILED'
      && error.consumerCode === 'SAFE_FIXTURE_FAILURE'
      && error.cause === undefined
    ),
  )
})
