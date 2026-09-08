import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { ScannerRunError, type DeliveredScannerKey } from './keyScanner.js'
import { CipherSnapshotError, snapshotCipherDatabase } from './readOnlyCipherSnapshot.js'
import { ScannerProtocolError } from './scannerProtocol.js'
import { SqlcipherSnapshotHelperError } from './sqlcipherSnapshotHelper.js'
import { WalStateError } from './walState.js'

const LIVE_SNAPSHOT_ERROR_CODES = [
  'RUN_ID_INVALID', 'ROOTS_OVERLAP', 'DUPLICATE_DATABASE', 'SCANNER_COUNT_MISMATCH',
  'RUN_IO_FAILED', 'SNAPSHOT_FAILED', 'KEY_LENGTH_INVALID', 'DATABASE_READ_FAILED',
  'DESTINATION_RESERVE_FAILED', 'BACKUP_FAILED', 'VALIDATION_OPEN_FAILED',
  'INTEGRITY_CHECK_FAILED', 'SCHEMA_MISMATCH', 'WAL_GENERATION_CHANGED',
  'SCANNER_SPAWN_FAILED', 'SCANNER_STREAM_FAILED', 'SCANNER_EXIT_NONZERO',
  'KEY_CONSUMER_FAILED', 'MAGIC_INVALID', 'VERSION_UNSUPPORTED', 'PATH_LENGTH_INVALID',
  'PATH_UTF8_INVALID', 'PATH_OUTSIDE_ROOT', 'PATH_NOT_DATABASE', 'TRAILING_DATA',
  'PROTOCOL_TRUNCATED', 'HELPER_KEY_LENGTH_INVALID', 'HELPER_SPAWN_FAILED',
  'HELPER_STREAM_FAILED', 'HELPER_EXIT_NONZERO', 'HELPER_PROTOCOL_FAILED',
  'HELPER_NATIVE_E_USAGE', 'HELPER_NATIVE_E_KEY_PIPE', 'HELPER_NATIVE_E_PATH',
  'HELPER_NATIVE_E_OPEN_SOURCE', 'HELPER_NATIVE_E_CIPHER', 'HELPER_NATIVE_E_BEGIN',
  'HELPER_NATIVE_E_READ_SOURCE', 'HELPER_NATIVE_E_DESTINATION_EXISTS',
  'HELPER_NATIVE_E_RESERVE_DESTINATION', 'HELPER_NATIVE_E_OPEN_DESTINATION',
  'HELPER_NATIVE_E_CIPHER_DESTINATION', 'HELPER_NATIVE_E_BACKUP_READONLY',
  'HELPER_NATIVE_E_BACKUP_BUSY', 'HELPER_NATIVE_E_BACKUP_LOCKED',
  'HELPER_NATIVE_E_BACKUP_FINISH', 'HELPER_NATIVE_E_BACKUP',
  'HELPER_NATIVE_E_DECRYPT_DESTINATION', 'HELPER_NATIVE_E_INTEGRITY',
  'HELPER_NATIVE_E_SCHEMA', 'HELPER_NATIVE_E_SCHEMA_ROWS', 'HELPER_NATIVE_E_SCHEMA_TYPE',
  'HELPER_NATIVE_E_SCHEMA_NAME', 'HELPER_NATIVE_E_SCHEMA_TABLE',
  'HELPER_NATIVE_E_SCHEMA_ROOTPAGE', 'HELPER_NATIVE_E_SCHEMA_SQL', 'HELPER_NATIVE_E_PIPE',
  'SHM_TOO_SHORT', 'SHM_HEADER_TORN', 'SHM_UNINITIALIZED', 'SHM_VERSION_UNSUPPORTED',
  'SHM_CHECKSUM_INVALID', 'SHM_PAGE_SIZE_INVALID', 'SHM_UNSTABLE', 'WAL_MISSING',
  'WAL_HEADER_SHORT', 'WAL_MAGIC_INVALID', 'WAL_VERSION_UNSUPPORTED',
  'WAL_PAGE_SIZE_INVALID', 'WAL_HEADER_CHECKSUM_INVALID', 'WAL_CHECKSUM_ENDIAN_MISMATCH',
  'WAL_PAGE_SIZE_MISMATCH', 'WAL_SALT_MISMATCH', 'WAL_FRAME_SHORT',
  'WAL_FRAME_SALT_MISMATCH', 'WAL_FRAME_CHECKSUM_MISMATCH', 'WAL_NOT_FULLY_BACKFILLED',
] as const

export type LiveSnapshotErrorCode = typeof LIVE_SNAPSHOT_ERROR_CODES[number]
export const LIVE_SNAPSHOT_ERROR_CODE_SET: ReadonlySet<string> = new Set(LIVE_SNAPSHOT_ERROR_CODES)

export class LiveSnapshotError extends Error {
  readonly code: LiveSnapshotErrorCode

  constructor(code: LiveSnapshotErrorCode) {
    super(code)
    this.name = 'LiveSnapshotError'
    this.code = code
  }
}

export type SnapshotKeyScanner = (options: {
  executablePath: string
  pid: number
  accountRoot: string
  allowedConsumerErrorCodes: ReadonlySet<string>
  onKey(record: DeliveredScannerKey): Promise<void>
}) => Promise<number>

export type Snapshotter = typeof snapshotCipherDatabase

export type ManifestEvent = {
  version: 1
  runId: string
  timestamp: string
  status: 'started' | 'database-complete' | 'validated' | 'complete' | 'failed'
  relativePath?: string
  databaseCount?: number
  schemaObjects?: number
  wal?: {
    kind: 'active' | 'reset'
    mxFrame: number
    nBackfill: number
    nBackfillAttempted: number
    pageSize: number
  }
  errorCode?: string
}

export interface LiveSnapshotIo {
  canonicalizeExisting(target: string): Promise<string>
  canonicalizeProspective(target: string): Promise<string>
  ensureOutputRoot(target: string): Promise<void>
  assertMissing(target: string): Promise<void>
  createStaging(target: string): Promise<void>
  ensureParent(target: string): Promise<void>
  appendManifest(target: string, event: ManifestEvent): Promise<void>
  publish(staging: string, final: string): Promise<void>
}

export const nodeLiveSnapshotIo: LiveSnapshotIo = {
  async canonicalizeExisting(target) {
    return fs.realpath(path.resolve(target))
  },
  async canonicalizeProspective(target) {
    let existing = path.resolve(target)
    const missing: string[] = []
    for (;;) {
      try {
        const canonical = await fs.realpath(existing)
        return path.resolve(canonical, ...missing)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
        const parent = path.dirname(existing)
        if (parent === existing) throw error
        missing.unshift(path.basename(existing))
        existing = parent
      }
    }
  },
  async ensureOutputRoot(target) {
    await fs.mkdir(target, { recursive: true })
  },
  async assertMissing(target) {
    try {
      await fs.access(target)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
      throw error
    }
    throw new Error('target exists')
  },
  async createStaging(target) {
    await fs.mkdir(target, { recursive: false })
  },
  async ensureParent(target) {
    await fs.mkdir(target, { recursive: true })
  },
  async appendManifest(target, event) {
    await fs.appendFile(target, `${JSON.stringify(event)}\n`, { encoding: 'utf8', flag: 'a' })
  },
  async publish(staging, final) {
    await fs.rename(staging, final)
  },
}

export function generatedRunId(now: Date) {
  const timestamp = now.toISOString().replaceAll(/[-:.]/gu, '')
  return `${timestamp}-${crypto.randomBytes(6).toString('hex')}`
}

export function validateRunId(runId: string) {
  if (!/^[A-Za-z0-9_-]{1,80}$/u.test(runId)) throw new LiveSnapshotError('RUN_ID_INVALID')
}

function typedErrorCode(error: unknown): LiveSnapshotErrorCode | undefined {
  if (
    error instanceof ScannerRunError
    && error.code === 'KEY_CONSUMER_FAILED'
    && error.consumerCode !== undefined
    && LIVE_SNAPSHOT_ERROR_CODE_SET.has(error.consumerCode)
  ) {
    return error.consumerCode as LiveSnapshotErrorCode
  }
  if (
    error instanceof LiveSnapshotError
    || error instanceof CipherSnapshotError
    || error instanceof ScannerRunError
    || error instanceof ScannerProtocolError
    || error instanceof SqlcipherSnapshotHelperError
    || error instanceof WalStateError
  ) {
    return LIVE_SNAPSHOT_ERROR_CODE_SET.has(error.code)
      ? error.code as LiveSnapshotErrorCode
      : undefined
  }
  return undefined
}

export function sanitizedErrorCode(error: unknown) {
  return typedErrorCode(error) ?? 'SNAPSHOT_FAILED'
}

export function pathContains(parent: string, candidate: string) {
  const relative = path.relative(parent, candidate)
  return relative === '' || (
    relative !== '..'
    && !relative.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relative)
  )
}

export async function appendFailure(
  io: LiveSnapshotIo,
  targets: string[],
  event: ManifestEvent,
) {
  await Promise.allSettled(targets.map((target) => io.appendManifest(target, event)))
}
