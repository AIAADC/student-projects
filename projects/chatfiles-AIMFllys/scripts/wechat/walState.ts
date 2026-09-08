import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import {
  WalStateError,
  type SafeWalState,
  type WalIndexState,
  type WalReadWindow,
  type WalStateIo,
} from './walStateTypes.js'

export { WalStateError } from './walStateTypes.js'
export type {
  SafeWalState,
  WalIndexState,
  WalReadExpectation,
  WalReadWindow,
  WalStateErrorCode,
  WalStateIo,
} from './walStateTypes.js'

export const WAL_INDEX_VERSION = 3_007_000
export const WAL_FORMAT_VERSION = 3_007_000

const SHM_HEADER_BYTES = 48
const SHM_REQUIRED_BYTES = 136
const WAL_HEADER_BYTES = 32
const WAL_FRAME_HEADER_BYTES = 24
const WAL_MAGIC = 0x377f0682

function generationFingerprint(shm: WalIndexState) {
  return crypto.createHash('sha256').update(shm.stableBytes).digest('base64url')
}

function checksumWords(
  bytes: Buffer,
  nativeLittleEndian: boolean,
  seed: readonly [number, number] = [0, 0],
) {
  let s1 = seed[0] >>> 0
  let s2 = seed[1] >>> 0
  for (let offset = 0; offset < bytes.length; offset += 8) {
    const first = nativeLittleEndian ? bytes.readUInt32LE(offset) : bytes.readUInt32BE(offset)
    const second = nativeLittleEndian ? bytes.readUInt32LE(offset + 4) : bytes.readUInt32BE(offset + 4)
    s1 = (s1 + first + s2) >>> 0
    s2 = (s2 + second + s1) >>> 0
  }
  return [s1, s2] as const
}

function decodeShmPageSize(encoded: number) {
  return (encoded & 0xfe00) + ((encoded & 1) << 16)
}

function isWalPageSize(pageSize: number) {
  return pageSize >= 512 && pageSize <= 65_536 && (pageSize & (pageSize - 1)) === 0
}

export function parseWalIndexShm(bytes: Buffer): WalIndexState {
  if (bytes.length < SHM_REQUIRED_BYTES) throw new WalStateError('SHM_TOO_SHORT')
  const first = bytes.subarray(0, SHM_HEADER_BYTES)
  const second = bytes.subarray(SHM_HEADER_BYTES, SHM_HEADER_BYTES * 2)
  if (!first.equals(second)) throw new WalStateError('SHM_HEADER_TORN')

  const iVersion = first.readUInt32LE(0)
  if (iVersion !== WAL_INDEX_VERSION) throw new WalStateError('SHM_VERSION_UNSUPPORTED')
  if (first[12] !== 1) throw new WalStateError('SHM_UNINITIALIZED')

  const expectedChecksum = checksumWords(first.subarray(0, 40), true)
  if (
    first.readUInt32LE(40) !== expectedChecksum[0]
    || first.readUInt32LE(44) !== expectedChecksum[1]
  ) {
    throw new WalStateError('SHM_CHECKSUM_INVALID')
  }

  const mxFrame = first.readUInt32LE(16)
  const pageSize = decodeShmPageSize(first.readUInt16LE(14))
  if ((mxFrame !== 0 || pageSize !== 0) && !isWalPageSize(pageSize)) {
    throw new WalStateError('SHM_PAGE_SIZE_INVALID')
  }

  const stableBytes = Buffer.concat([
    first,
    bytes.subarray(96, 120),
    bytes.subarray(128, 136),
  ])
  return {
    iVersion,
    isInit: 1,
    checksumUsesBigEndianWords: first[13] === 1,
    pageSize,
    mxFrame,
    databasePageCount: first.readUInt32LE(20),
    frameChecksum: [first.readUInt32LE(24), first.readUInt32LE(28)],
    salt: Buffer.from(first.subarray(32, 40)),
    nBackfill: bytes.readUInt32LE(96),
    readMarks: [0, 1, 2, 3, 4].map((index) => bytes.readUInt32LE(100 + index * 4)),
    nBackfillAttempted: bytes.readUInt32LE(128),
    stableBytes,
  }
}

type ParsedWalHeader = {
  checksumUsesBigEndianWords: boolean
  pageSize: number
  salt: Buffer
}

function parseWalHeader(header: Buffer | null): ParsedWalHeader {
  if (!header || header.length < WAL_HEADER_BYTES) throw new WalStateError('WAL_HEADER_SHORT')
  const magic = header.readUInt32BE(0)
  if ((magic & 0xfffffffe) !== WAL_MAGIC) throw new WalStateError('WAL_MAGIC_INVALID')
  if (header.readUInt32BE(4) !== WAL_FORMAT_VERSION) {
    throw new WalStateError('WAL_VERSION_UNSUPPORTED')
  }
  const pageSize = header.readUInt32BE(8)
  if (!isWalPageSize(pageSize)) throw new WalStateError('WAL_PAGE_SIZE_INVALID')

  const checksumUsesBigEndianWords = (magic & 1) === 1
  const checksum = checksumWords(header.subarray(0, 24), !checksumUsesBigEndianWords)
  if (header.readUInt32BE(24) !== checksum[0] || header.readUInt32BE(28) !== checksum[1]) {
    throw new WalStateError('WAL_HEADER_CHECKSUM_INVALID')
  }
  return {
    checksumUsesBigEndianWords,
    pageSize,
    salt: Buffer.from(header.subarray(16, 24)),
  }
}

function frameSlots(size: number, pageSize: number) {
  if (size < WAL_HEADER_BYTES || !isWalPageSize(pageSize)) return 0
  return Math.floor((size - WAL_HEADER_BYTES) / (WAL_FRAME_HEADER_BYTES + pageSize))
}

export function validateWalGeneration(shm: WalIndexState, wal: WalReadWindow): SafeWalState {
  if (shm.nBackfill !== shm.mxFrame) throw new WalStateError('WAL_NOT_FULLY_BACKFILLED')

  if (shm.mxFrame === 0) {
    return {
      kind: 'reset',
      safeForReadonlyShm: true,
      mxFrame: 0,
      nBackfill: 0,
      nBackfillAttempted: shm.nBackfillAttempted,
      pageSize: shm.pageSize,
      physicalFrameSlots: wal.exists && shm.pageSize ? frameSlots(wal.size, shm.pageSize) : 0,
      generationFingerprint: generationFingerprint(shm),
    }
  }

  if (!wal.exists) throw new WalStateError('WAL_MISSING')
  const header = parseWalHeader(wal.header)
  if (header.checksumUsesBigEndianWords !== shm.checksumUsesBigEndianWords) {
    throw new WalStateError('WAL_CHECKSUM_ENDIAN_MISMATCH')
  }
  if (header.pageSize !== shm.pageSize) throw new WalStateError('WAL_PAGE_SIZE_MISMATCH')
  if (!header.salt.equals(shm.salt)) throw new WalStateError('WAL_SALT_MISMATCH')

  const physicalFrameSlots = frameSlots(wal.size, header.pageSize)
  if (physicalFrameSlots < shm.mxFrame) throw new WalStateError('WAL_FRAME_SHORT')
  const frame = wal.lastFrameHeader
  if (!frame || frame.length < WAL_FRAME_HEADER_BYTES) throw new WalStateError('WAL_FRAME_SHORT')
  if (!frame.subarray(8, 16).equals(shm.salt)) throw new WalStateError('WAL_FRAME_SALT_MISMATCH')
  if (
    frame.readUInt32BE(16) !== shm.frameChecksum[0]
    || frame.readUInt32BE(20) !== shm.frameChecksum[1]
  ) {
    throw new WalStateError('WAL_FRAME_CHECKSUM_MISMATCH')
  }

  return {
    kind: 'active',
    safeForReadonlyShm: true,
    mxFrame: shm.mxFrame,
    nBackfill: shm.nBackfill,
    nBackfillAttempted: shm.nBackfillAttempted,
    pageSize: shm.pageSize,
    physicalFrameSlots,
    generationFingerprint: generationFingerprint(shm),
  }
}

async function readExactly(fileHandle: fs.FileHandle, length: number, position: number) {
  const buffer = Buffer.alloc(length)
  const { bytesRead } = await fileHandle.read(buffer, 0, length, position)
  return bytesRead === length ? buffer : buffer.subarray(0, bytesRead)
}

export const nodeWalStateIo: WalStateIo = {
  async readShm(filePath) {
    const handle = await fs.open(filePath, 'r')
    try {
      return await readExactly(handle, SHM_REQUIRED_BYTES, 0)
    } finally {
      await handle.close()
    }
  },
  async readWal(filePath, expectation) {
    let handle: fs.FileHandle
    try {
      handle = await fs.open(filePath, 'r')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return { exists: false, size: 0, header: null, lastFrameHeader: null }
      }
      throw error
    }
    try {
      const stat = await handle.stat()
      const header = await readExactly(handle, WAL_HEADER_BYTES, 0)
      let lastFrameHeader: Buffer | null = null
      if (expectation.mxFrame > 0 && expectation.pageSize > 0) {
        const offset = WAL_HEADER_BYTES
          + (expectation.mxFrame - 1) * (WAL_FRAME_HEADER_BYTES + expectation.pageSize)
        lastFrameHeader = await readExactly(handle, WAL_FRAME_HEADER_BYTES, offset)
      }
      return { exists: true, size: stat.size, header, lastFrameHeader }
    } finally {
      await handle.close()
    }
  },
}

export async function readStableWalState(
  databasePath: string,
  options: { io?: WalStateIo; maxAttempts?: number } = {},
) {
  const io = options.io ?? nodeWalStateIo
  const maxAttempts = options.maxAttempts ?? 4
  if (!Number.isSafeInteger(maxAttempts) || maxAttempts < 1) throw new RangeError('maxAttempts')
  let lastError: unknown

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const first = parseWalIndexShm(await io.readShm(`${databasePath}-shm`))
      const wal = await io.readWal(`${databasePath}-wal`, {
        mxFrame: first.mxFrame,
        pageSize: first.pageSize,
      })
      const second = parseWalIndexShm(await io.readShm(`${databasePath}-shm`))
      if (!first.stableBytes.equals(second.stableBytes)) throw new WalStateError('SHM_UNSTABLE')
      return validateWalGeneration(second, wal)
    } catch (error) {
      lastError = error
      if (error instanceof WalStateError && error.code === 'WAL_NOT_FULLY_BACKFILLED') throw error
    }
  }
  throw lastError
}
