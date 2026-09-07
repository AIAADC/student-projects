import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import {
  LiveSnapshotError,
  runLiveSnapshot,
  type LiveSnapshotIo,
  type SnapshotKeyScanner,
  type Snapshotter,
} from './liveSnapshotCoordinator.js'
import { CipherSnapshotError } from './readOnlyCipherSnapshot.js'
import { ScannerRunError } from './keyScanner.js'
import { WalStateError } from './walState.js'

function fakeIo(events: string[], manifests: unknown[]): LiveSnapshotIo {
  return {
    async canonicalizeExisting(target) {
      events.push(`canonical-existing:${target}`)
      return path.resolve(target)
    },
    async canonicalizeProspective(target) {
      events.push(`canonical-prospective:${target}`)
      return path.resolve(target)
    },
    async ensureOutputRoot(root) {
      events.push(`root:${root}`)
    },
    async assertMissing(target) {
      events.push(`missing:${target}`)
    },
    async createStaging(target) {
      events.push(`staging:${target}`)
    },
    async ensureParent(target) {
      events.push(`parent:${target}`)
    },
    async appendManifest(target, event) {
      events.push(`manifest:${path.basename(target)}:${(event as { status: string }).status}`)
      manifests.push(event)
    },
    async publish(staging, final) {
      events.push(`publish:${staging}->${final}`)
    },
  }
}

function scannerFor(records: Array<{ relativePath: string; key: Buffer }>): SnapshotKeyScanner {
  return async (options) => {
    for (const record of records) {
      try {
        await options.onKey({
          relativePath: record.relativePath,
          databasePath: 'C:\\attacker-controlled\\ignored.db',
          key: record.key,
        })
      } finally {
        record.key.fill(0)
      }
    }
    return records.length
  }
}

test('publishes a versioned snapshot only after every Chinese-path database validates', async () => {
  const events: string[] = []
  const manifests: unknown[] = []
  const firstKey = Buffer.alloc(32, 0x11)
  const secondKey = Buffer.alloc(32, 0x22)
  const records = [
    { relativePath: 'db_storage\\message\\消息_0.db', key: firstKey },
    { relativePath: 'db_storage\\contact\\联系人.db', key: secondKey },
  ]
  const sourcePaths: string[] = []
  const destinationPaths: string[] = []
  const snapshotter: Snapshotter = async (options) => {
    sourcePaths.push(options.sourcePath)
    destinationPaths.push(options.destinationPath)
    assert.equal(options.key.equals(Buffer.alloc(32)), false)
    assert.equal(options.helperPath, 'D:\\tools\\snapshot-helper.exe')
    options.key.fill(0)
    return {
      schemaObjects: 3,
      schemaFingerprint: 'not-recorded',
      wal: {
        kind: 'active' as const,
        safeForReadonlyShm: true as const,
        mxFrame: 4,
        nBackfill: 4,
        nBackfillAttempted: 4,
        pageSize: 4096,
        physicalFrameSlots: 4,
        generationFingerprint: 'fixture-active',
      },
    }
  }

  const result = await runLiveSnapshot({
    pid: 4321,
    accountRoot: 'C:\\微信数据\\wxid_secret',
    outputRoot: 'D:\\snapshots',
    scannerPath: 'D:\\tools\\scanner.exe',
    snapshotHelperPath: 'D:\\tools\\snapshot-helper.exe',
    runId: '20260712T120000Z-fixture',
    scanKeys: scannerFor(records),
    snapshotDatabase: snapshotter,
    io: fakeIo(events, manifests),
    now: () => new Date('2026-07-12T12:00:00.000Z'),
  })

  assert.deepEqual(result, { runId: '20260712T120000Z-fixture', databaseCount: 2 })
  assert.deepEqual(sourcePaths, [
    'C:\\微信数据\\wxid_secret\\db_storage\\message\\消息_0.db',
    'C:\\微信数据\\wxid_secret\\db_storage\\contact\\联系人.db',
  ])
  assert.equal(destinationPaths[0]?.includes('.incoming-20260712T120000Z-fixture'), true)
  assert.equal(events.at(-2)?.startsWith('publish:'), true)
  assert.equal(events.at(-1), 'manifest:snapshot-runs.jsonl:complete')
  assert.deepEqual(firstKey, Buffer.alloc(32))
  assert.deepEqual(secondKey, Buffer.alloc(32))

  const manifestText = JSON.stringify(manifests)
  assert.equal(manifestText.includes('wxid_secret'), false)
  assert.equal(manifestText.includes('微信数据'), false)
  assert.equal(manifestText.includes('11111111'), false)
  assert.equal(manifestText.includes('22222222'), false)
  assert.equal(manifestText.includes('not-recorded'), false)
  assert.equal(manifestText.includes('消息_0.db'), true)
})

test('keeps partial staging unpublished and appends a sanitized failure status', async () => {
  const events: string[] = []
  const manifests: unknown[] = []
  let calls = 0
  const snapshotter: Snapshotter = async (options) => {
    calls += 1
    options.key.fill(0)
    if (calls === 2) throw new CipherSnapshotError('BACKUP_FAILED')
    return {
      schemaObjects: 1,
      schemaFingerprint: 'private',
      wal: {
        kind: 'reset' as const,
        safeForReadonlyShm: true as const,
        mxFrame: 0,
        nBackfill: 0,
        nBackfillAttempted: 0,
        pageSize: 0,
        physicalFrameSlots: 0,
        generationFingerprint: 'fixture-reset',
      },
    }
  }
  await assert.rejects(
    runLiveSnapshot({
      pid: 1,
      accountRoot: 'C:\\private\\account',
      outputRoot: 'D:\\snapshots',
      scannerPath: 'scanner.exe',
      snapshotHelperPath: 'snapshot-helper.exe',
      runId: 'failed-fixture',
      scanKeys: scannerFor([
        { relativePath: 'db_storage\\a.db', key: Buffer.alloc(32, 1) },
        { relativePath: 'db_storage\\b.db', key: Buffer.alloc(32, 2) },
      ]),
      snapshotDatabase: snapshotter,
      io: fakeIo(events, manifests),
    }),
    (error: unknown) => error instanceof LiveSnapshotError && error.code === 'BACKUP_FAILED',
  )

  assert.equal(events.some((event) => event.startsWith('publish:')), false)
  const failed = manifests.filter((event) => (event as { status: string }).status === 'failed')
  assert.equal(failed.length, 2)
  assert.equal(JSON.stringify(failed).includes('private'), false)
})

test('preserves only a typed snapshot error code through the scanner consumer boundary', async () => {
  const events: string[] = []
  const manifests: unknown[] = []
  const scannerFailure = new ScannerRunError(
    'KEY_CONSUMER_FAILED',
    new WalStateError('WAL_NOT_FULLY_BACKFILLED').code,
  )

  await assert.rejects(
    runLiveSnapshot({
      pid: 1,
      accountRoot: 'C:\\private\\account',
      outputRoot: 'D:\\snapshots',
      scannerPath: 'scanner.exe',
      snapshotHelperPath: 'snapshot-helper.exe',
      runId: 'typed-consumer-failure',
      scanKeys: async () => {
        throw scannerFailure
      },
      io: fakeIo(events, manifests),
    }),
    (error: unknown) => error instanceof LiveSnapshotError && error.code === 'WAL_NOT_FULLY_BACKFILLED',
  )

  const serialized = JSON.stringify(manifests)
  assert.equal(serialized.includes('WAL_NOT_FULLY_BACKFILLED'), true)
  assert.equal(serialized.includes('private'), false)
})

test('rejects traversal and duplicate records before publication', async () => {
  for (const relativePaths of [
    ['..\\outside.db'],
    ['db_storage\\same.db', 'db_storage\\SAME.db'],
  ]) {
    const events: string[] = []
    await assert.rejects(
      runLiveSnapshot({
        pid: 1,
        accountRoot: 'C:\\account',
        outputRoot: 'D:\\snapshots',
        scannerPath: 'scanner.exe',
        snapshotHelperPath: 'snapshot-helper.exe',
        runId: `invalid-${relativePaths.length}`,
        scanKeys: scannerFor(relativePaths.map((relativePath) => ({
          relativePath,
          key: Buffer.alloc(32, 3),
        }))),
        snapshotDatabase: async (options) => {
          options.key.fill(0)
          return {
            schemaObjects: 0,
            schemaFingerprint: '',
            wal: {
              kind: 'reset' as const,
              safeForReadonlyShm: true as const,
              mxFrame: 0,
              nBackfill: 0,
              nBackfillAttempted: 0,
              pageSize: 0,
              physicalFrameSlots: 0,
              generationFingerprint: 'fixture-reset',
            },
          }
        },
        io: fakeIo(events, []),
      }),
      LiveSnapshotError,
    )
    assert.equal(events.some((event) => event.startsWith('publish:')), false)
  }
})

test('rejects canonical or symlink-equivalent source and output roots before any write', async () => {
  const events: string[] = []
  const manifests: unknown[] = []
  const io = fakeIo(events, manifests)
  io.canonicalizeExisting = async () => 'C:\\real\\wechat-account'
  io.canonicalizeProspective = async () => 'C:\\real\\wechat-account\\snapshots'

  await assert.rejects(
    runLiveSnapshot({
      pid: 1,
      accountRoot: 'C:\\symlinked-account',
      outputRoot: 'D:\\apparently-separate',
      scannerPath: 'scanner.exe',
      snapshotHelperPath: 'snapshot-helper.exe',
      runId: 'overlap-fixture',
      scanKeys: scannerFor([]),
      io,
    }),
    (error: unknown) => error instanceof LiveSnapshotError && error.code === 'ROOTS_OVERLAP',
  )

  assert.equal(events.some((event) => /^(root|staging|manifest|publish):/u.test(event)), false)
  assert.equal(manifests.length, 0)
})

test('downgrades an unknown typed error code before writing it to manifests', async () => {
  const events: string[] = []
  const manifests: unknown[] = []

  await assert.rejects(
    runLiveSnapshot({
      pid: 1,
      accountRoot: 'C:\\account',
      outputRoot: 'D:\\snapshots',
      scannerPath: 'scanner.exe',
      snapshotHelperPath: 'snapshot-helper.exe',
      runId: 'unknown-error-fixture',
      scanKeys: async () => {
        throw new LiveSnapshotError('PRIVATE_PATH_TOKEN' as never)
      },
      io: fakeIo(events, manifests),
    }),
    (error: unknown) => error instanceof LiveSnapshotError && error.code === 'SNAPSHOT_FAILED',
  )

  const serialized = JSON.stringify(manifests)
  assert.equal(serialized.includes('PRIVATE_PATH_TOKEN'), false)
  assert.equal(serialized.includes('SNAPSHOT_FAILED'), true)
})
