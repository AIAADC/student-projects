import { spawn as nodeSpawn, type SpawnOptions } from 'node:child_process'
import type { Readable } from 'node:stream'
import {
  ScannerProtocolParser,
  resolveContainedDatabasePath,
  type ScannerKeyRecord,
} from './scannerProtocol.js'

export type ScannerRunErrorCode =
  | 'SCANNER_SPAWN_FAILED'
  | 'SCANNER_STREAM_FAILED'
  | 'SCANNER_EXIT_NONZERO'
  | 'KEY_CONSUMER_FAILED'

export class ScannerRunError extends Error {
  readonly code: ScannerRunErrorCode
  readonly consumerCode?: string

  constructor(code: ScannerRunErrorCode, consumerCode?: string) {
    super(code)
    this.name = 'ScannerRunError'
    this.code = code
    this.consumerCode = consumerCode
  }
}

export interface ScannerChild {
  stdout: Readable
  stderr: Readable
  once(event: 'close', listener: (code: number | null, signal: NodeJS.Signals | null) => void): this
  once(event: 'error', listener: (error: Error) => void): this
  kill(): boolean
}

export type ScannerSpawn = (
  command: string,
  args: readonly string[],
  options: SpawnOptions,
) => ScannerChild

export type DeliveredScannerKey = ScannerKeyRecord & {
  databasePath: string
}

function scannerEnvironment() {
  const env: NodeJS.ProcessEnv = {}
  for (const name of ['SystemRoot', 'WINDIR', 'TEMP', 'TMP'] as const) {
    if (process.env[name]) env[name] = process.env[name]
  }
  return env
}

const defaultSpawn: ScannerSpawn = (command, args, options) => nodeSpawn(command, [...args], options) as ScannerChild

function waitForClose(child: ScannerChild) {
  return new Promise<number>((resolve, reject) => {
    child.once('error', () => reject(new ScannerRunError('SCANNER_SPAWN_FAILED')))
    child.once('close', (code) => resolve(code ?? -1))
  })
}

async function discardAndZero(stream: Readable) {
  for await (const value of stream) {
    if (Buffer.isBuffer(value)) {
      value.fill(0)
    } else if (value instanceof Uint8Array) {
      value.fill(0)
    }
  }
}

function pipeChunk(value: unknown) {
  if (Buffer.isBuffer(value)) return value
  if (value instanceof Uint8Array) return Buffer.from(value.buffer, value.byteOffset, value.byteLength)
  throw new ScannerRunError('SCANNER_STREAM_FAILED')
}

export async function runKeyScanner(options: {
  executablePath: string
  pid: number
  accountRoot: string
  onKey(record: DeliveredScannerKey): Promise<void>
  allowedConsumerErrorCodes?: ReadonlySet<string>
  spawn?: ScannerSpawn
}) {
  if (!Number.isSafeInteger(options.pid) || options.pid <= 0) throw new RangeError('pid')
  const spawn = options.spawn ?? defaultSpawn
  let child: ScannerChild
  try {
    child = spawn(
      options.executablePath,
      [String(options.pid), options.accountRoot],
      {
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: false,
        windowsHide: true,
        env: scannerEnvironment(),
      },
    )
  } catch {
    throw new ScannerRunError('SCANNER_SPAWN_FAILED')
  }

  const close = waitForClose(child)
  const stderr = discardAndZero(child.stderr)
  const parser = new ScannerProtocolParser()
  let count = 0
  try {
    for await (const value of child.stdout) {
      const records = parser.push(pipeChunk(value))
      try {
        for (const record of records) {
          try {
            const databasePath = resolveContainedDatabasePath(options.accountRoot, record.relativePath)
            try {
              await options.onKey({ ...record, databasePath })
            } catch (error) {
              const candidate = error !== null && typeof error === 'object'
                ? (error as { code?: unknown }).code
                : undefined
              const consumerCode = typeof candidate === 'string'
                && options.allowedConsumerErrorCodes?.has(candidate)
                ? candidate
                : undefined
              throw new ScannerRunError('KEY_CONSUMER_FAILED', consumerCode)
            }
            count += 1
          } finally {
            record.key.fill(0)
          }
        }
      } finally {
        for (const record of records) record.key.fill(0)
      }
    }
    parser.finish()
    const exitCode = await close
    await stderr
    if (exitCode !== 0) throw new ScannerRunError('SCANNER_EXIT_NONZERO')
    return count
  } catch (error) {
    child.kill()
    await Promise.allSettled([close, stderr])
    if (error instanceof ScannerRunError || error instanceof RangeError) throw error
    if (error instanceof Error && error.name === 'ScannerProtocolError') throw error
    throw new ScannerRunError('SCANNER_STREAM_FAILED')
  } finally {
    parser.dispose()
  }
}
