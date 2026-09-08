import path from 'node:path'
import { runKeyScanner } from './keyScanner.js'
import { snapshotCipherDatabase } from './readOnlyCipherSnapshot.js'
import { resolveContainedDatabasePath } from './scannerProtocol.js'
import {
  LIVE_SNAPSHOT_ERROR_CODE_SET,
  LiveSnapshotError,
  appendFailure,
  generatedRunId,
  nodeLiveSnapshotIo,
  pathContains,
  sanitizedErrorCode,
  validateRunId,
  type LiveSnapshotIo,
  type ManifestEvent,
  type SnapshotKeyScanner,
  type Snapshotter,
} from './liveSnapshotSupport.js'

export async function runLiveSnapshot(options: {
  pid: number
  accountRoot: string
  outputRoot: string
  scannerPath: string
  snapshotHelperPath: string
  runId?: string
  scanKeys?: SnapshotKeyScanner
  snapshotDatabase?: Snapshotter
  io?: LiveSnapshotIo
  now?: () => Date
}) {
  const now = options.now ?? (() => new Date())
  const runId = options.runId ?? generatedRunId(now())
  validateRunId(runId)
  const io = options.io ?? nodeLiveSnapshotIo
  let accountRoot: string
  let outputRoot: string
  try {
    accountRoot = await io.canonicalizeExisting(options.accountRoot)
    outputRoot = await io.canonicalizeProspective(options.outputRoot)
  } catch {
    throw new LiveSnapshotError('RUN_IO_FAILED')
  }
  if (pathContains(accountRoot, outputRoot) || pathContains(outputRoot, accountRoot)) {
    throw new LiveSnapshotError('ROOTS_OVERLAP')
  }
  const scanKeys = options.scanKeys ?? runKeyScanner
  const snapshotDatabase = options.snapshotDatabase ?? snapshotCipherDatabase
  const staging = path.join(outputRoot, `.incoming-${runId}`)
  const final = path.join(outputRoot, runId)
  const globalManifest = path.join(outputRoot, 'snapshot-runs.jsonl')
  const stagingManifest = path.join(staging, 'snapshot-manifest.jsonl')
  const manifestTargets: string[] = [globalManifest]
  let databaseCount = 0

  try {
    await io.ensureOutputRoot(outputRoot)
    await io.assertMissing(final)
    await io.assertMissing(staging)
    await io.createStaging(staging)
    manifestTargets.push(stagingManifest)
    const started: ManifestEvent = {
      version: 1,
      runId,
      timestamp: now().toISOString(),
      status: 'started',
    }
    await io.appendManifest(globalManifest, started)
    await io.appendManifest(stagingManifest, started)

    const seen = new Set<string>()
    const scanned = await scanKeys({
      executablePath: options.scannerPath,
      pid: options.pid,
      accountRoot,
      allowedConsumerErrorCodes: LIVE_SNAPSHOT_ERROR_CODE_SET,
      async onKey(record) {
        try {
          const sourcePath = resolveContainedDatabasePath(accountRoot, record.relativePath)
          const destinationPath = resolveContainedDatabasePath(staging, record.relativePath)
          const identity = path.relative(staging, destinationPath).replaceAll('/', '\\').toLowerCase()
          if (seen.has(identity)) throw new LiveSnapshotError('DUPLICATE_DATABASE')
          seen.add(identity)
          await io.ensureParent(path.dirname(destinationPath))
          const result = await snapshotDatabase({
            sourcePath,
            destinationPath,
            key: record.key,
            helperPath: options.snapshotHelperPath,
          })
          databaseCount += 1
          await io.appendManifest(stagingManifest, {
            version: 1,
            runId,
            timestamp: now().toISOString(),
            status: 'database-complete',
            relativePath: record.relativePath,
            schemaObjects: result.schemaObjects,
            wal: {
              kind: result.wal.kind,
              mxFrame: result.wal.mxFrame,
              nBackfill: result.wal.nBackfill,
              nBackfillAttempted: result.wal.nBackfillAttempted,
              pageSize: result.wal.pageSize,
            },
          })
        } finally {
          record.key.fill(0)
        }
      },
    })
    if (scanned !== databaseCount) throw new LiveSnapshotError('SCANNER_COUNT_MISMATCH')

    await io.appendManifest(stagingManifest, {
      version: 1,
      runId,
      timestamp: now().toISOString(),
      status: 'validated',
      databaseCount,
    })
    await io.publish(staging, final)
    await io.appendManifest(globalManifest, {
      version: 1,
      runId,
      timestamp: now().toISOString(),
      status: 'complete',
      databaseCount,
    })
    return { runId, databaseCount }
  } catch (error) {
    const errorCode = sanitizedErrorCode(error)
    await appendFailure(io, manifestTargets, {
      version: 1,
      runId,
      timestamp: now().toISOString(),
      status: 'failed',
      databaseCount,
      errorCode,
    })
    throw new LiveSnapshotError(errorCode)
  }
}
