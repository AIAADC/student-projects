import path from 'node:path'
import { TextDecoder } from 'node:util'

export const SCANNER_PROTOCOL_MAGIC = Buffer.from('CFWKSCAN', 'ascii')
export const SCANNER_PROTOCOL_VERSION = 1

const PROTOCOL_HEADER_BYTES = SCANNER_PROTOCOL_MAGIC.length + 4
const KEY_BYTES = 32
const MAX_PATH_BYTES = 32 * 1024

export type ScannerProtocolErrorCode =
  | 'MAGIC_INVALID'
  | 'VERSION_UNSUPPORTED'
  | 'PATH_LENGTH_INVALID'
  | 'PATH_UTF8_INVALID'
  | 'PATH_OUTSIDE_ROOT'
  | 'PATH_NOT_DATABASE'
  | 'TRAILING_DATA'
  | 'PROTOCOL_TRUNCATED'

export class ScannerProtocolError extends Error {
  readonly code: ScannerProtocolErrorCode

  constructor(code: ScannerProtocolErrorCode) {
    super(code)
    this.name = 'ScannerProtocolError'
    this.code = code
  }
}

export type ScannerKeyRecord = {
  relativePath: string
  key: Buffer
}

function relativeSegments(relativePath: string) {
  if (
    !relativePath
    || relativePath.includes('\0')
    || path.win32.isAbsolute(relativePath)
    || path.posix.isAbsolute(relativePath)
  ) {
    throw new ScannerProtocolError('PATH_OUTSIDE_ROOT')
  }
  const segments = relativePath.split(/[\\/]+/u)
  if (
    segments.some((segment) => !segment || segment === '.' || segment === '..' || segment.includes(':'))
  ) {
    throw new ScannerProtocolError('PATH_OUTSIDE_ROOT')
  }
  return segments
}

export function resolveContainedDatabasePath(accountRoot: string, relativePath: string) {
  const segments = relativeSegments(relativePath)
  if (segments[0]?.toLowerCase() !== 'db_storage' || !segments.at(-1)?.toLowerCase().endsWith('.db')) {
    throw new ScannerProtocolError('PATH_NOT_DATABASE')
  }
  const absoluteRoot = path.resolve(accountRoot)
  const candidate = path.resolve(absoluteRoot, ...segments)
  const relative = path.relative(absoluteRoot, candidate)
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new ScannerProtocolError('PATH_OUTSIDE_ROOT')
  }
  return candidate
}

export class ScannerProtocolParser {
  private pending = Buffer.alloc(0)
  private headerParsed = false
  private terminated = false

  push(chunk: Buffer): ScannerKeyRecord[] {
    if (this.terminated && chunk.length > 0) {
      chunk.fill(0)
      throw new ScannerProtocolError('TRAILING_DATA')
    }

    const combined = Buffer.alloc(this.pending.length + chunk.length)
    this.pending.copy(combined)
    chunk.copy(combined, this.pending.length)
    this.pending.fill(0)
    this.pending = Buffer.alloc(0)
    chunk.fill(0)

    const records: ScannerKeyRecord[] = []
    let offset = 0
    try {
      if (!this.headerParsed) {
        if (combined.length < PROTOCOL_HEADER_BYTES) {
          this.pending = Buffer.from(combined)
          return records
        }
        if (!combined.subarray(0, SCANNER_PROTOCOL_MAGIC.length).equals(SCANNER_PROTOCOL_MAGIC)) {
          throw new ScannerProtocolError('MAGIC_INVALID')
        }
        if (combined.readUInt32LE(SCANNER_PROTOCOL_MAGIC.length) !== SCANNER_PROTOCOL_VERSION) {
          throw new ScannerProtocolError('VERSION_UNSUPPORTED')
        }
        this.headerParsed = true
        offset = PROTOCOL_HEADER_BYTES
      }

      while (combined.length - offset >= 4) {
        const pathLength = combined.readUInt32LE(offset)
        if (pathLength === 0) {
          offset += 4
          this.terminated = true
          if (offset !== combined.length) throw new ScannerProtocolError('TRAILING_DATA')
          break
        }
        if (pathLength > MAX_PATH_BYTES) throw new ScannerProtocolError('PATH_LENGTH_INVALID')
        const frameLength = 4 + pathLength + KEY_BYTES
        if (combined.length - offset < frameLength) break

        const pathBytes = combined.subarray(offset + 4, offset + 4 + pathLength)
        let relativePath: string
        try {
          relativePath = new TextDecoder('utf-8', { fatal: true }).decode(pathBytes)
        } catch {
          throw new ScannerProtocolError('PATH_UTF8_INVALID')
        }
        relativeSegments(relativePath)
        const key = Buffer.alloc(KEY_BYTES)
        combined.copy(key, 0, offset + 4 + pathLength, offset + frameLength)
        records.push({ relativePath, key })
        offset += frameLength
      }

      if (!this.terminated && offset < combined.length) {
        this.pending = Buffer.from(combined.subarray(offset))
      }
      return records
    } catch (error) {
      for (const record of records) record.key.fill(0)
      this.pending.fill(0)
      this.pending = Buffer.alloc(0)
      throw error
    } finally {
      combined.fill(0)
    }
  }

  finish() {
    const complete = this.headerParsed && this.terminated && this.pending.length === 0
    this.pending.fill(0)
    this.pending = Buffer.alloc(0)
    if (!complete) throw new ScannerProtocolError('PROTOCOL_TRUNCATED')
  }

  dispose() {
    this.pending.fill(0)
    this.pending = Buffer.alloc(0)
    this.headerParsed = false
    this.terminated = false
  }
}
