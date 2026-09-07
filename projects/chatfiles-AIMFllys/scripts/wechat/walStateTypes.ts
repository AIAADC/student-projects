export type WalStateErrorCode =
  | 'SHM_TOO_SHORT'
  | 'SHM_HEADER_TORN'
  | 'SHM_UNINITIALIZED'
  | 'SHM_VERSION_UNSUPPORTED'
  | 'SHM_CHECKSUM_INVALID'
  | 'SHM_PAGE_SIZE_INVALID'
  | 'SHM_UNSTABLE'
  | 'WAL_MISSING'
  | 'WAL_HEADER_SHORT'
  | 'WAL_MAGIC_INVALID'
  | 'WAL_VERSION_UNSUPPORTED'
  | 'WAL_PAGE_SIZE_INVALID'
  | 'WAL_HEADER_CHECKSUM_INVALID'
  | 'WAL_CHECKSUM_ENDIAN_MISMATCH'
  | 'WAL_PAGE_SIZE_MISMATCH'
  | 'WAL_SALT_MISMATCH'
  | 'WAL_FRAME_SHORT'
  | 'WAL_FRAME_SALT_MISMATCH'
  | 'WAL_FRAME_CHECKSUM_MISMATCH'
  | 'WAL_NOT_FULLY_BACKFILLED'

export class WalStateError extends Error {
  readonly code: WalStateErrorCode

  constructor(code: WalStateErrorCode) {
    super(code)
    this.name = 'WalStateError'
    this.code = code
  }
}

export type WalIndexState = {
  iVersion: number
  isInit: 1
  checksumUsesBigEndianWords: boolean
  pageSize: number
  mxFrame: number
  databasePageCount: number
  frameChecksum: readonly [number, number]
  salt: Buffer
  nBackfill: number
  readMarks: readonly number[]
  nBackfillAttempted: number
  stableBytes: Buffer
}

export type WalReadExpectation = {
  mxFrame: number
  pageSize: number
}

export type WalReadWindow = {
  exists: boolean
  size: number
  header: Buffer | null
  lastFrameHeader: Buffer | null
}

export interface WalStateIo {
  readShm(filePath: string): Promise<Buffer>
  readWal(filePath: string, expectation: WalReadExpectation): Promise<WalReadWindow>
}

export type SafeWalState = {
  kind: 'active' | 'reset'
  safeForReadonlyShm: true
  mxFrame: number
  nBackfill: number
  nBackfillAttempted: number
  pageSize: number
  physicalFrameSlots: number
  generationFingerprint: string
}
