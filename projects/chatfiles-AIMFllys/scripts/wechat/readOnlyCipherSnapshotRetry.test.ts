import assert from 'node:assert/strict'
import test from 'node:test'
import {
  CipherSnapshotError,
  snapshotCipherDatabase,
  type CipherSnapshotAdapter,
} from './readOnlyCipherSnapshot.js'
import { SqlcipherSnapshotHelperError } from './sqlcipherSnapshotHelper.js'
import { FakeDatabase, fakeIo, safeWal } from './readOnlyCipherSnapshotTestFixtures.js'

test('retries a pre-destination native source race without reusing a zeroed key', async () => {
  const events: string[] = []
  const deliveredKeys: Buffer[] = []
  let helperCalls = 0
  let waits = 0
  const key = Buffer.alloc(32, 0x52)

  const result = await snapshotCipherDatabase({
    sourcePath: 'C:\\微信数据\\消息.db',
    destinationPath: 'D:\\staging\\消息.db',
    key,
    helperPath: 'D:\\tools\\snapshot-helper.exe',
    runHelper: async (options) => {
      helperCalls += 1
      deliveredKeys.push(Buffer.from(options.key))
      options.key.fill(0)
      if (helperCalls === 1) throw new SqlcipherSnapshotHelperError('HELPER_NATIVE_E_READ_SOURCE')
      return { schemaObjects: 1 }
    },
    adapter: { open: () => new FakeDatabase({ events }) },
    fileIo: fakeIo(events),
    readWalState: async () => safeWal,
    maxWalSafetyRetries: 1,
    waitForWalSafety: async () => {
      waits += 1
    },
  })

  assert.equal(result.schemaObjects, 1)
  assert.equal(helperCalls, 2)
  assert.equal(waits, 1)
  assert.equal(events.some((event) => event.startsWith('reserve:')), false)
  assert.deepEqual(key, Buffer.alloc(32))
  assert.deepEqual(deliveredKeys, [Buffer.alloc(32, 0x52), Buffer.alloc(32, 0x52)])
})

test('retries only SQLITE_READONLY_CANTINIT before reserving an output', async () => {
  const events: string[] = []
  const cantInit = Object.assign(new Error('private source path'), { code: 'SQLITE_READONLY_CANTINIT' })
  const databases = [
    new FakeDatabase({ events, beginError: cantInit }),
    new FakeDatabase({ events }),
    new FakeDatabase({ events }),
  ]
  let walReads = 0
  const adapter: CipherSnapshotAdapter = {
    open() {
      const next = databases.shift()
      assert.ok(next)
      return next
    },
  }
  const key = Buffer.alloc(32, 7)

  await snapshotCipherDatabase({
    sourcePath: 'C:\\source\\message.db',
    destinationPath: 'D:\\staging\\message.db',
    key,
    adapter,
    fileIo: fakeIo(events),
    readWalState: async () => {
      walReads += 1
      return safeWal
    },
    maxCantInitRetries: 1,
  })

  assert.equal(walReads, 2)
  assert.equal(events.filter((event) => event.startsWith('reserve:')).length, 1)
})

test('does not retry other SQLite errors or reserve a destination after snapshot setup fails', async () => {
  const events: string[] = []
  const busy = Object.assign(new Error('contains sensitive path'), { code: 'SQLITE_BUSY' })
  let opens = 0
  const adapter: CipherSnapshotAdapter = {
    open() {
      opens += 1
      return new FakeDatabase({ events, beginError: busy })
    },
  }
  await assert.rejects(
    snapshotCipherDatabase({
      sourcePath: 'C:\\source\\message.db',
      destinationPath: 'D:\\staging\\message.db',
      key: Buffer.alloc(32, 8),
      adapter,
      fileIo: fakeIo(events),
      readWalState: async () => safeWal,
      maxCantInitRetries: 5,
    }),
    (error: unknown) => error instanceof CipherSnapshotError && error.code === 'DATABASE_READ_FAILED',
  )
  assert.equal(opens, 1)
  assert.equal(events.some((event) => event.startsWith('reserve:')), false)
})

test('rejects failed integrity and schema equality checks without retrying', async () => {
  const events: string[] = []
  const databases = [
    new FakeDatabase({ events }),
    new FakeDatabase({ events, integrity: [{ integrity_check: 'row 2 missing' }] }),
  ]
  const adapter: CipherSnapshotAdapter = {
    open() {
      const next = databases.shift()
      assert.ok(next)
      return next
    },
  }
  await assert.rejects(
    snapshotCipherDatabase({
      sourcePath: 'C:\\source\\message.db',
      destinationPath: 'D:\\staging\\message.db',
      key: Buffer.alloc(32, 9),
      adapter,
      fileIo: fakeIo(events),
      readWalState: async () => safeWal,
    }),
    (error: unknown) => error instanceof CipherSnapshotError && error.code === 'INTEGRITY_CHECK_FAILED',
  )
  assert.equal(events.filter((event) => event.startsWith('reserve:')).length, 1)
})
