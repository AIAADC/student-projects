import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import Database from 'better-sqlite3-multiple-ciphers'
import {
  CipherSnapshotError,
  type CipherDatabase,
  type CipherSnapshotAdapter,
  type SnapshotFileIo,
} from './cipherSnapshotTypes.js'
import { WalStateError, readStableWalState, type SafeWalState } from './walState.js'
import {
  SqlcipherSnapshotHelperError,
  runSqlcipherSnapshotHelper,
} from './sqlcipherSnapshotHelper.js'

export { CipherSnapshotError } from './cipherSnapshotTypes.js'
export type {
  CipherDatabase,
  CipherSnapshotAdapter,
  CipherSnapshotErrorCode,
  CipherStatement,
  SnapshotFileIo,
} from './cipherSnapshotTypes.js'

const schemaQuery = `
  SELECT type, name, tbl_name, rootpage, sql
  FROM sqlite_schema
  ORDER BY type, name, tbl_name, rootpage
`

function schemaSnapshot(database: CipherDatabase) {
  const rows = database.prepare(schemaQuery).all()
  const serialized = JSON.stringify(rows, (_key, value: unknown) => (
    typeof value === 'bigint' ? value.toString() : value
  ))
  return {
    count: rows.length,
    fingerprint: crypto.createHash('sha256').update(serialized, 'utf8').digest('base64url'),
  }
}

function integrityIsOk(result: unknown) {
  if (!Array.isArray(result) || result.length === 0) return false
  return result.every((row) => (
    row !== null
    && typeof row === 'object'
    && Object.values(row as Record<string, unknown>).every((value) => value === 'ok')
  ))
}

function isReadonlyCantInit(error: unknown) {
  if (!error || typeof error !== 'object') return false
  const sqliteError = error as { code?: unknown; errno?: unknown }
  return sqliteError.code === 'SQLITE_READONLY_CANTINIT' || sqliteError.errno === 1288
}

export const nodeSnapshotFileIo: SnapshotFileIo = {
  async reserveNewFile(filePath) {
    const handle = await fs.open(filePath, 'wx')
    await handle.close()
  },
}

export const betterSqliteSnapshotAdapter: CipherSnapshotAdapter = {
  open(filename, options) {
    return new Database(filename, options) as unknown as CipherDatabase
  },
}

function encryptedFileUri(sourcePath: string) {
  const uri = pathToFileURL(sourcePath)
  uri.searchParams.set('readonly_shm', '1')
  return uri.href
}

export async function snapshotCipherDatabase(options: {
  sourcePath: string
  destinationPath: string
  key: Buffer
  adapter?: CipherSnapshotAdapter
  fileIo?: SnapshotFileIo
  readWalState?: (databasePath: string) => Promise<SafeWalState>
  helperPath?: string
  runHelper?: typeof runSqlcipherSnapshotHelper
  maxCantInitRetries?: number
  maxWalSafetyRetries?: number
  waitForWalSafety?: () => Promise<void>
}) {
  const adapter = options.adapter ?? betterSqliteSnapshotAdapter
  const fileIo = options.fileIo ?? nodeSnapshotFileIo
  const inspectWal = options.readWalState ?? readStableWalState
  const runHelper = options.runHelper ?? runSqlcipherSnapshotHelper
  const maxCantInitRetries = options.maxCantInitRetries ?? 2
  const maxWalSafetyRetries = options.maxWalSafetyRetries ?? 120
  const waitForWalSafety = options.waitForWalSafety ?? (() => new Promise<void>((resolve) => {
    setTimeout(resolve, 1_000)
  }))
  if (
    !Number.isSafeInteger(maxCantInitRetries)
    || maxCantInitRetries < 0
    || !Number.isSafeInteger(maxWalSafetyRetries)
    || maxWalSafetyRetries < 0
  ) {
    options.key.fill(0)
    throw new RangeError('snapshot retry options')
  }
  if (options.key.length !== 32) {
    options.key.fill(0)
    throw new CipherSnapshotError('KEY_LENGTH_INVALID')
  }

  const readFullyBackfilledWal = async () => {
    for (let attempt = 0; attempt <= maxWalSafetyRetries; attempt += 1) {
      try {
        return await inspectWal(options.sourcePath)
      } catch (error) {
        if (
          !(error instanceof WalStateError)
          || error.code !== 'WAL_NOT_FULLY_BACKFILLED'
          || attempt >= maxWalSafetyRetries
        ) {
          throw error
        }
        await waitForWalSafety()
      }
    }
    throw new WalStateError('WAL_NOT_FULLY_BACKFILLED')
  }

  let destinationReserved = false
  try {
    if (options.helperPath) {
      const nativeKey = Buffer.from(options.key)
      options.key.fill(0)
      try {
        for (let attempt = 0; attempt <= maxWalSafetyRetries; attempt += 1) {
          const wal = await readFullyBackfilledWal()
          const attemptKey = Buffer.from(nativeKey)
          let result: Awaited<ReturnType<typeof runSqlcipherSnapshotHelper>>
          try {
            result = await runHelper({
              executablePath: options.helperPath,
              sourcePath: options.sourcePath,
              destinationPath: options.destinationPath,
              key: attemptKey,
            })
          } catch (error) {
            if (
              error instanceof SqlcipherSnapshotHelperError
              && (
                error.code === 'HELPER_NATIVE_E_OPEN_SOURCE'
                || error.code === 'HELPER_NATIVE_E_BEGIN'
                || error.code === 'HELPER_NATIVE_E_READ_SOURCE'
              )
              && attempt < maxWalSafetyRetries
            ) {
              await waitForWalSafety()
              continue
            }
            throw error
          } finally {
            attemptKey.fill(0)
          }
          const walAfter = await inspectWal(options.sourcePath)
          if (
            !wal.generationFingerprint
            || wal.generationFingerprint !== walAfter.generationFingerprint
          ) {
            throw new CipherSnapshotError('WAL_GENERATION_CHANGED')
          }
          let plain: CipherDatabase
          try {
            plain = adapter.open(options.destinationPath, { readonly: true, fileMustExist: true })
          } catch {
            throw new CipherSnapshotError('VALIDATION_OPEN_FAILED')
          }
          let destinationSchema: ReturnType<typeof schemaSnapshot>
          try {
            if (!integrityIsOk(plain.pragma('integrity_check'))) {
              throw new CipherSnapshotError('INTEGRITY_CHECK_FAILED')
            }
            destinationSchema = schemaSnapshot(plain)
            if (destinationSchema.count !== result.schemaObjects) {
              throw new CipherSnapshotError('SCHEMA_MISMATCH')
            }
          } finally {
            plain.close()
          }
          return {
            schemaObjects: result.schemaObjects,
            schemaFingerprint: destinationSchema.fingerprint,
            wal,
          }
        }
        throw new CipherSnapshotError('DATABASE_READ_FAILED')
      } finally {
        nativeKey.fill(0)
      }
    }

    for (let attempt = 0; attempt <= maxCantInitRetries; attempt += 1) {
      const wal = await inspectWal(options.sourcePath)
      let source: CipherDatabase | undefined
      let transactionStarted = false
      const rawKey = Buffer.alloc(36)
      rawKey.write('raw:', 0, 'ascii')
      options.key.copy(rawKey, 4)
      try {
        source = adapter.open(encryptedFileUri(options.sourcePath), {
          readonly: true,
          fileMustExist: true,
        })
        source.pragma("cipher='sqlcipher'")
        source.pragma('legacy=4')
        if (!source.key) throw new CipherSnapshotError('DATABASE_READ_FAILED')
        source.key(rawKey)
        rawKey.fill(0)
        source.exec('BEGIN')
        transactionStarted = true
        const sourceSchema = schemaSnapshot(source)

        try {
          await fileIo.reserveNewFile(options.destinationPath)
          destinationReserved = true
        } catch {
          throw new CipherSnapshotError('DESTINATION_RESERVE_FAILED')
        }
        try {
          if (!source.backup) throw new Error('backup unavailable')
          await source.backup(options.destinationPath)
        } catch {
          throw new CipherSnapshotError('BACKUP_FAILED')
        }

        let plain: CipherDatabase
        try {
          plain = adapter.open(options.destinationPath, { readonly: true, fileMustExist: true })
        } catch {
          throw new CipherSnapshotError('VALIDATION_OPEN_FAILED')
        }
        try {
          if (!integrityIsOk(plain.pragma('integrity_check'))) {
            throw new CipherSnapshotError('INTEGRITY_CHECK_FAILED')
          }
          const destinationSchema = schemaSnapshot(plain)
          if (destinationSchema.fingerprint !== sourceSchema.fingerprint) {
            throw new CipherSnapshotError('SCHEMA_MISMATCH')
          }
        } finally {
          plain.close()
        }
        return {
          schemaObjects: sourceSchema.count,
          schemaFingerprint: sourceSchema.fingerprint,
          wal,
        }
      } catch (error) {
        if (!destinationReserved && isReadonlyCantInit(error) && attempt < maxCantInitRetries) {
          continue
        }
        if (error instanceof CipherSnapshotError) throw error
        throw new CipherSnapshotError('DATABASE_READ_FAILED')
      } finally {
        rawKey.fill(0)
        if (source) {
          if (transactionStarted) {
            try {
              source.exec('ROLLBACK')
            } catch {
              // The read handle is closed immediately below.
            }
          }
          source.close()
        }
      }
    }
    throw new CipherSnapshotError('DATABASE_READ_FAILED')
  } finally {
    options.key.fill(0)
  }
}
