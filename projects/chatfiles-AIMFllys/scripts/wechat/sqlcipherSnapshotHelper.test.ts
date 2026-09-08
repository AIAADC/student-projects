import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { Readable, Writable } from 'node:stream'
import test from 'node:test'
import {
  SNAPSHOT_HELPER_MAGIC,
  SqlcipherSnapshotHelperError,
  runSqlcipherSnapshotHelper,
  type SnapshotHelperChild,
  type SnapshotHelperSpawn,
} from './sqlcipherSnapshotHelper.js'

function successFrame(schemaObjects: number) {
  const frame = Buffer.alloc(SNAPSHOT_HELPER_MAGIC.length + 4)
  SNAPSHOT_HELPER_MAGIC.copy(frame)
  frame.writeUInt32LE(schemaObjects, SNAPSHOT_HELPER_MAGIC.length)
  return frame
}

class FakeHelperChild extends EventEmitter implements SnapshotHelperChild {
  stdin: Writable
  stdout: Readable
  stderr: Readable
  received: Buffer[] = []
  killed = false

  constructor(stdout: Buffer[], stderr: Buffer[], private readonly exitCode = 0) {
    super()
    this.stdin = new Writable({
      write: (chunk: Buffer, _encoding, callback) => {
        this.received.push(Buffer.from(chunk))
        callback()
      },
    })
    this.stdout = Readable.from(stdout)
    this.stderr = Readable.from(stderr)
    this.stdin.once('finish', () => queueMicrotask(() => this.emit('close', this.exitCode, null)))
  }

  kill() {
    this.killed = true
    return true
  }
}

test('passes a raw key only through stdin and accepts the fixed binary success frame', async () => {
  const key = Buffer.from(Array.from({ length: 32 }, (_, index) => index + 1))
  const expectedKey = Buffer.from(key)
  const stdout = [successFrame(17)]
  const stderr = [Buffer.from('ignored helper status', 'utf8')]
  const child = new FakeHelperChild(stdout, stderr)
  let args: readonly string[] = []
  let spawnOptions: Record<string, unknown> = {}
  const spawn: SnapshotHelperSpawn = (_command, receivedArgs, options) => {
    args = receivedArgs
    spawnOptions = options as unknown as Record<string, unknown>
    return child
  }

  const result = await runSqlcipherSnapshotHelper({
    executablePath: 'D:\\tools\\snapshot-helper.exe',
    sourcePath: 'D:\\微信数据\\消息.db',
    destinationPath: 'D:\\staging\\消息.db',
    key,
    spawn,
  })

  assert.deepEqual(result, { schemaObjects: 17 })
  assert.deepEqual(args, ['D:\\微信数据\\消息.db', 'D:\\staging\\消息.db'])
  assert.deepEqual(spawnOptions.stdio, ['pipe', 'pipe', 'pipe'])
  assert.equal(spawnOptions.shell, false)
  assert.equal(spawnOptions.windowsHide, true)
  assert.deepEqual(Buffer.concat(child.received), expectedKey)
  assert.deepEqual(key, Buffer.alloc(32))
  for (const chunk of [...stdout, ...stderr]) assert.deepEqual(chunk, Buffer.alloc(chunk.length))
})

test('rejects malformed helper output without retaining key or attacker bytes', async () => {
  const key = Buffer.alloc(32, 0xa5)
  const malformed = Buffer.concat([successFrame(1), Buffer.from('trailing private path')])
  const child = new FakeHelperChild([malformed], [])

  await assert.rejects(
    runSqlcipherSnapshotHelper({
      executablePath: 'snapshot-helper.exe',
      sourcePath: 'C:\\private\\source.db',
      destinationPath: 'D:\\private\\destination.db',
      key,
      spawn: () => child,
    }),
    (error: unknown) => {
      assert.equal(
        error instanceof SqlcipherSnapshotHelperError && error.code === 'HELPER_PROTOCOL_FAILED',
        true,
      )
      assert.equal(String((error as Error).message).includes('private'), false)
      return true
    },
  )

  assert.deepEqual(key, Buffer.alloc(32))
  assert.equal(child.killed, true)
  assert.deepEqual(malformed, Buffer.alloc(malformed.length))
})

test('discards helper stderr and exposes only a stable nonzero-exit code', async () => {
  const secret = Buffer.from('C:\\private ' + 'ab'.repeat(32), 'utf8')
  const key = Buffer.alloc(32, 0xab)
  const child = new FakeHelperChild([successFrame(1)], [secret], 2)

  await assert.rejects(
    runSqlcipherSnapshotHelper({
      executablePath: 'snapshot-helper.exe',
      sourcePath: 'source.db',
      destinationPath: 'destination.db',
      key,
      spawn: () => child,
    }),
    (error: unknown) => {
      assert.equal(
        error instanceof SqlcipherSnapshotHelperError && error.code === 'HELPER_EXIT_NONZERO',
        true,
      )
      assert.equal(String((error as Error).message).includes('private'), false)
      assert.equal(String((error as Error).message).includes('abab'), false)
      return true
    },
  )
  assert.deepEqual(key, Buffer.alloc(32))
  assert.deepEqual(secret, Buffer.alloc(secret.length))
})

test('prioritizes a nonzero helper exit over its intentionally empty success frame', async () => {
  const key = Buffer.alloc(32, 0x3c)
  const child = new FakeHelperChild([], [Buffer.from('E_BACKUP', 'ascii')], 4)

  await assert.rejects(
    runSqlcipherSnapshotHelper({
      executablePath: 'snapshot-helper.exe',
      sourcePath: 'source.db',
      destinationPath: 'destination.db',
      key,
      spawn: () => child,
    }),
    (error: unknown) => (
      error instanceof SqlcipherSnapshotHelperError && error.code === 'HELPER_NATIVE_E_BACKUP'
    ),
  )
  assert.deepEqual(key, Buffer.alloc(32))
})

test('surfaces only whitelisted schema mismatch categories from the native helper', async () => {
  const key = Buffer.alloc(32, 0x4d)
  const child = new FakeHelperChild([], [Buffer.from('E_SCHEMA_ROOTPAGE\n', 'ascii')], 4)

  await assert.rejects(
    runSqlcipherSnapshotHelper({
      executablePath: 'snapshot-helper.exe',
      sourcePath: 'source.db',
      destinationPath: 'destination.db',
      key,
      spawn: () => child,
    }),
    (error: unknown) => (
      error instanceof SqlcipherSnapshotHelperError
      && error.code === 'HELPER_NATIVE_E_SCHEMA_ROOTPAGE'
    ),
  )
  assert.deepEqual(key, Buffer.alloc(32))
})
