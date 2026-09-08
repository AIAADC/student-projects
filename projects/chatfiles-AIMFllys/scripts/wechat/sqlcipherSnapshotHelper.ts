import { spawn as nodeSpawn, type SpawnOptions } from 'node:child_process'
import type { Readable, Writable } from 'node:stream'

export const SNAPSHOT_HELPER_MAGIC = Buffer.from('CFSSNAP1', 'ascii')
const SUCCESS_FRAME_BYTES = SNAPSHOT_HELPER_MAGIC.length + 4

const NATIVE_ERROR_CODES = [
  'E_USAGE',
  'E_KEY_PIPE',
  'E_PATH',
  'E_OPEN_SOURCE',
  'E_CIPHER',
  'E_BEGIN',
  'E_READ_SOURCE',
  'E_DESTINATION_EXISTS',
  'E_RESERVE_DESTINATION',
  'E_OPEN_DESTINATION',
  'E_CIPHER_DESTINATION',
  'E_BACKUP_READONLY',
  'E_BACKUP_BUSY',
  'E_BACKUP_LOCKED',
  'E_BACKUP_FINISH',
  'E_BACKUP',
  'E_DECRYPT_DESTINATION',
  'E_INTEGRITY',
  'E_SCHEMA',
  'E_SCHEMA_ROWS',
  'E_SCHEMA_TYPE',
  'E_SCHEMA_NAME',
  'E_SCHEMA_TABLE',
  'E_SCHEMA_ROOTPAGE',
  'E_SCHEMA_SQL',
  'E_PIPE',
] as const
type NativeErrorCode = typeof NATIVE_ERROR_CODES[number]
const NATIVE_ERROR_CODE_SET: ReadonlySet<string> = new Set(NATIVE_ERROR_CODES)

export type SqlcipherSnapshotHelperErrorCode =
  | 'HELPER_KEY_LENGTH_INVALID'
  | 'HELPER_SPAWN_FAILED'
  | 'HELPER_STREAM_FAILED'
  | 'HELPER_EXIT_NONZERO'
  | 'HELPER_PROTOCOL_FAILED'
  | `HELPER_NATIVE_${NativeErrorCode}`

export class SqlcipherSnapshotHelperError extends Error {
  readonly code: SqlcipherSnapshotHelperErrorCode

  constructor(code: SqlcipherSnapshotHelperErrorCode) {
    super(code)
    this.name = 'SqlcipherSnapshotHelperError'
    this.code = code
  }
}

export interface SnapshotHelperChild {
  stdin: Writable
  stdout: Readable
  stderr: Readable
  once(event: 'close', listener: (code: number | null, signal: NodeJS.Signals | null) => void): this
  once(event: 'error', listener: (error: Error) => void): this
  kill(): boolean
}

export type SnapshotHelperSpawn = (
  command: string,
  args: readonly string[],
  options: SpawnOptions,
) => SnapshotHelperChild

const defaultSpawn: SnapshotHelperSpawn = (command, args, options) => (
  nodeSpawn(command, [...args], options) as SnapshotHelperChild
)

function helperEnvironment() {
  const environment: NodeJS.ProcessEnv = {}
  for (const name of ['SystemRoot', 'WINDIR', 'TEMP', 'TMP'] as const) {
    if (process.env[name]) environment[name] = process.env[name]
  }
  return environment
}

function waitForClose(child: SnapshotHelperChild) {
  return new Promise<number>((resolve, reject) => {
    child.once('error', () => reject(new SqlcipherSnapshotHelperError('HELPER_SPAWN_FAILED')))
    child.once('close', (code) => resolve(code ?? -1))
  })
}

async function readNativeErrorCode(stream: Readable) {
  const retained = Buffer.alloc(96)
  let offset = 0
  let overflow = false
  try {
    for await (const value of stream) {
      if (!Buffer.isBuffer(value) && !(value instanceof Uint8Array)) continue
      const chunk = Buffer.isBuffer(value)
        ? value
        : Buffer.from(value.buffer, value.byteOffset, value.byteLength)
      const copied = Math.min(retained.length - offset, chunk.length)
      if (copied > 0) chunk.copy(retained, offset, 0, copied)
      offset += copied
      if (copied < chunk.length) overflow = true
      chunk.fill(0)
    }
    if (overflow || offset === 0) return null
    const text = retained.subarray(0, offset).toString('ascii').replace(/\r?\n$/u, '')
    return NATIVE_ERROR_CODE_SET.has(text) ? text as NativeErrorCode : null
  } finally {
    retained.fill(0)
  }
}

async function readSuccessFrame(stream: Readable) {
  const frame = Buffer.alloc(SUCCESS_FRAME_BYTES)
  let offset = 0
  let overflow = false
  try {
    for await (const value of stream) {
      if (!Buffer.isBuffer(value) && !(value instanceof Uint8Array)) {
        throw new SqlcipherSnapshotHelperError('HELPER_STREAM_FAILED')
      }
      const chunk = Buffer.isBuffer(value)
        ? value
        : Buffer.from(value.buffer, value.byteOffset, value.byteLength)
      const remaining = frame.length - offset
      const copied = Math.min(remaining, chunk.length)
      if (copied > 0) chunk.copy(frame, offset, 0, copied)
      offset += copied
      if (chunk.length > copied) overflow = true
      chunk.fill(0)
    }
    if (overflow || offset !== frame.length || !frame.subarray(0, SNAPSHOT_HELPER_MAGIC.length).equals(SNAPSHOT_HELPER_MAGIC)) {
      throw new SqlcipherSnapshotHelperError('HELPER_PROTOCOL_FAILED')
    }
    return frame.readUInt32LE(SNAPSHOT_HELPER_MAGIC.length)
  } finally {
    frame.fill(0)
  }
}

function writeKey(child: SnapshotHelperChild, key: Buffer) {
  const pipeKey = Buffer.from(key)
  key.fill(0)
  return new Promise<void>((resolve, reject) => {
    const fail = () => reject(new SqlcipherSnapshotHelperError('HELPER_STREAM_FAILED'))
    child.stdin.once('error', fail)
    child.stdin.end(pipeKey, () => {
      child.stdin.removeListener('error', fail)
      pipeKey.fill(0)
      resolve()
    })
  }).finally(() => pipeKey.fill(0))
}

export async function runSqlcipherSnapshotHelper(options: {
  executablePath: string
  sourcePath: string
  destinationPath: string
  key: Buffer
  spawn?: SnapshotHelperSpawn
}) {
  if (options.key.length !== 32) {
    options.key.fill(0)
    throw new SqlcipherSnapshotHelperError('HELPER_KEY_LENGTH_INVALID')
  }

  const spawn = options.spawn ?? defaultSpawn
  let child: SnapshotHelperChild
  try {
    child = spawn(
      options.executablePath,
      [options.sourcePath, options.destinationPath],
      {
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: false,
        windowsHide: true,
        env: helperEnvironment(),
      },
    )
  } catch {
    options.key.fill(0)
    throw new SqlcipherSnapshotHelperError('HELPER_SPAWN_FAILED')
  }

  const close = waitForClose(child)
  const input = writeKey(child, options.key)
  const output = readSuccessFrame(child.stdout)
  const stderr = readNativeErrorCode(child.stderr)
  try {
    const [closeResult, outputResult, inputResult, stderrResult] = await Promise.allSettled([
      close,
      output,
      input,
      stderr,
    ])
    if (closeResult.status === 'rejected') throw closeResult.reason
    if (closeResult.value !== 0) {
      const nativeCode = stderrResult.status === 'fulfilled' ? stderrResult.value : null
      throw new SqlcipherSnapshotHelperError(
        nativeCode ? `HELPER_NATIVE_${nativeCode}` : 'HELPER_EXIT_NONZERO',
      )
    }
    if (inputResult.status === 'rejected' || stderrResult.status === 'rejected') {
      throw new SqlcipherSnapshotHelperError('HELPER_STREAM_FAILED')
    }
    if (outputResult.status === 'rejected') throw outputResult.reason
    return { schemaObjects: outputResult.value }
  } catch (error) {
    child.kill()
    await Promise.allSettled([close, input, output, stderr])
    if (error instanceof SqlcipherSnapshotHelperError) throw error
    throw new SqlcipherSnapshotHelperError('HELPER_STREAM_FAILED')
  } finally {
    options.key.fill(0)
  }
}
