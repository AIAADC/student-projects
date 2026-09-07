import assert from 'node:assert/strict'
import test from 'node:test'
import {
  WAL_FORMAT_VERSION,
  WAL_INDEX_VERSION,
  WalStateError,
  parseWalIndexShm,
  readStableWalState,
  validateWalGeneration,
  type WalReadWindow,
  type WalStateIo,
} from './walState.js'

function checksumWords(bytes: Buffer, littleEndian: boolean, seed: readonly [number, number] = [0, 0]) {
  let s1 = seed[0] >>> 0
  let s2 = seed[1] >>> 0
  for (let offset = 0; offset < bytes.length; offset += 8) {
    const first = littleEndian ? bytes.readUInt32LE(offset) : bytes.readUInt32BE(offset)
    const second = littleEndian ? bytes.readUInt32LE(offset + 4) : bytes.readUInt32BE(offset + 4)
    s1 = (s1 + first + s2) >>> 0
    s2 = (s2 + second + s1) >>> 0
  }
  return [s1, s2] as const
}

type ShmOptions = {
  mxFrame?: number
  pageSize?: number
  salt?: Buffer
  frameChecksum?: readonly [number, number]
  nBackfill?: number
  nBackfillAttempted?: number
  lockByte?: number
}

function makeShm(options: ShmOptions = {}) {
  const pageSize = options.pageSize ?? 4096
  const header = Buffer.alloc(48)
  header.writeUInt32LE(WAL_INDEX_VERSION, 0)
  header.writeUInt32LE(7, 8)
  header[12] = 1
  header[13] = 0
  header.writeUInt16LE(pageSize === 65536 ? 1 : pageSize, 14)
  header.writeUInt32LE(options.mxFrame ?? 1, 16)
  header.writeUInt32LE(23, 20)
  header.writeUInt32LE(options.frameChecksum?.[0] ?? 0, 24)
  header.writeUInt32LE(options.frameChecksum?.[1] ?? 0, 28)
  ;(options.salt ?? Buffer.from('0011223344556677', 'hex')).copy(header, 32)
  const checksum = checksumWords(header.subarray(0, 40), true)
  header.writeUInt32LE(checksum[0], 40)
  header.writeUInt32LE(checksum[1], 44)

  const shm = Buffer.alloc(136)
  header.copy(shm, 0)
  header.copy(shm, 48)
  shm.writeUInt32LE(options.nBackfill ?? (options.mxFrame ?? 1), 96)
  shm.writeUInt32LE(2, 100)
  shm.writeUInt32LE(options.nBackfillAttempted ?? (options.mxFrame ?? 1), 128)
  shm[120] = options.lockByte ?? 0
  return shm
}

type WalFixture = {
  window: WalReadWindow
  frameChecksum: readonly [number, number]
}

function makeWal(options: { pageSize?: number; frames?: number; salt?: Buffer; magic?: number } = {}): WalFixture {
  const pageSize = options.pageSize ?? 4096
  const frames = options.frames ?? 1
  const magic = options.magic ?? 0x377f0682
  const salt = options.salt ?? Buffer.from('0011223344556677', 'hex')
  const header = Buffer.alloc(32)
  header.writeUInt32BE(magic, 0)
  header.writeUInt32BE(WAL_FORMAT_VERSION, 4)
  header.writeUInt32BE(pageSize, 8)
  header.writeUInt32BE(9, 12)
  salt.copy(header, 16)
  const littleEndianWords = (magic & 1) === 0
  let checksum = checksumWords(header.subarray(0, 24), littleEndianWords)
  header.writeUInt32BE(checksum[0], 24)
  header.writeUInt32BE(checksum[1], 28)

  let lastFrameHeader: Buffer | null = null
  for (let frame = 1; frame <= frames; frame += 1) {
    const frameHeader = Buffer.alloc(24)
    frameHeader.writeUInt32BE(frame, 0)
    frameHeader.writeUInt32BE(frame === frames ? 23 : 0, 4)
    salt.copy(frameHeader, 8)
    const page = Buffer.alloc(pageSize, frame)
    checksum = checksumWords(frameHeader.subarray(0, 8), littleEndianWords, checksum)
    checksum = checksumWords(page, littleEndianWords, checksum)
    frameHeader.writeUInt32BE(checksum[0], 16)
    frameHeader.writeUInt32BE(checksum[1], 20)
    lastFrameHeader = frameHeader
  }

  return {
    window: {
      exists: true,
      size: 32 + frames * (24 + pageSize),
      header,
      lastFrameHeader,
    },
    frameChecksum: checksum,
  }
}

function expectWalError(code: string, action: () => unknown) {
  assert.throws(action, (error: unknown) => error instanceof WalStateError && error.code === code)
}

test('parses byte-identical x64 Windows wal-index headers with native checksums', () => {
  const salt = Buffer.from('89abcdef01234567', 'hex')
  const shm = parseWalIndexShm(makeShm({ pageSize: 65536, salt, nBackfillAttempted: 3 }))
  assert.equal(shm.iVersion, WAL_INDEX_VERSION)
  assert.equal(shm.isInit, 1)
  assert.equal(shm.pageSize, 65536)
  assert.equal(shm.mxFrame, 1)
  assert.deepEqual(shm.salt, salt)
  assert.equal(shm.nBackfill, 1)
  assert.equal(shm.nBackfillAttempted, 3)
})

test('rejects torn dual headers and invalid native header checksums', () => {
  const torn = makeShm()
  torn[48 + 20] ^= 1
  expectWalError('SHM_HEADER_TORN', () => parseWalIndexShm(torn))

  const badChecksum = makeShm()
  badChecksum.writeUInt32LE((badChecksum.readUInt32LE(40) + 1) >>> 0, 40)
  badChecksum.copy(badChecksum, 48, 0, 48)
  expectWalError('SHM_CHECKSUM_INVALID', () => parseWalIndexShm(badChecksum))
})

test('validates an active WAL generation using big-endian metadata and raw salts', () => {
  const wal = makeWal({ frames: 2 })
  const shm = parseWalIndexShm(makeShm({
    mxFrame: 2,
    frameChecksum: wal.frameChecksum,
    nBackfill: 2,
  }))
  const state = validateWalGeneration(shm, wal.window)
  assert.equal(state.kind, 'active')
  assert.equal(state.physicalFrameSlots, 2)
  assert.equal(state.safeForReadonlyShm, true)
  assert.match(state.generationFingerprint, /^[A-Za-z0-9_-]{43}$/u)
})

test('binds the safe WAL state to a fingerprint of the observed generation', () => {
  const leftWal = makeWal({ salt: Buffer.from('0011223344556677', 'hex') })
  const rightWal = makeWal({ salt: Buffer.from('8899aabbccddeeff', 'hex') })
  const left = validateWalGeneration(parseWalIndexShm(makeShm({
    salt: Buffer.from('0011223344556677', 'hex'),
    frameChecksum: leftWal.frameChecksum,
  })), leftWal.window)
  const right = validateWalGeneration(parseWalIndexShm(makeShm({
    salt: Buffer.from('8899aabbccddeeff', 'hex'),
    frameChecksum: rightWal.frameChecksum,
  })), rightWal.window)

  assert.notEqual(left.generationFingerprint, right.generationFingerprint)
})

test('rejects active generations with stale salts, short WALs, or wrong frame checksums', () => {
  const wal = makeWal({ frames: 2 })
  const staleSaltShm = parseWalIndexShm(makeShm({
    mxFrame: 2,
    salt: Buffer.from('8877665544332211', 'hex'),
    frameChecksum: wal.frameChecksum,
    nBackfill: 2,
  }))
  expectWalError('WAL_SALT_MISMATCH', () => validateWalGeneration(staleSaltShm, wal.window))

  const shortShm = parseWalIndexShm(makeShm({ mxFrame: 3, frameChecksum: wal.frameChecksum, nBackfill: 3 }))
  expectWalError('WAL_FRAME_SHORT', () => validateWalGeneration(shortShm, wal.window))

  const wrongChecksumShm = parseWalIndexShm(makeShm({ mxFrame: 2, frameChecksum: [1, 2], nBackfill: 2 }))
  expectWalError('WAL_FRAME_CHECKSUM_MISMATCH', () => validateWalGeneration(wrongChecksumShm, wal.window))
})

test('requires every indexed frame to be backfilled before readonly_shm lock zero is safe', () => {
  const wal = makeWal({ frames: 2 })
  const shm = parseWalIndexShm(makeShm({
    mxFrame: 2,
    frameChecksum: wal.frameChecksum,
    nBackfill: 1,
  }))
  expectWalError('WAL_NOT_FULLY_BACKFILLED', () => validateWalGeneration(shm, wal.window))
})

test('accepts a restarted empty generation even if SHM salt precedes WAL header rewrite', () => {
  const oldWal = makeWal({ salt: Buffer.from('0011223344556677', 'hex') })
  const restarted = parseWalIndexShm(makeShm({
    mxFrame: 0,
    pageSize: 0,
    salt: Buffer.from('fedcba9876543210', 'hex'),
    frameChecksum: [0, 0],
    nBackfill: 0,
  }))
  const state = validateWalGeneration(restarted, oldWal.window)
  assert.equal(state.kind, 'reset')
  assert.equal(state.safeForReadonlyShm, true)
})

test('stabilizes SHM A, WAL, SHM B while ignoring only lock-byte churn', async () => {
  const wal = makeWal()
  const a = makeShm({ frameChecksum: wal.frameChecksum, lockByte: 1 })
  const b = makeShm({ frameChecksum: wal.frameChecksum, lockByte: 255 })
  const calls: string[] = []
  const io: WalStateIo = {
    async readShm(filePath) {
      calls.push(`shm:${filePath}`)
      return calls.length === 1 ? a : b
    },
    async readWal(filePath) {
      calls.push(`wal:${filePath}`)
      return wal.window
    },
  }
  const result = await readStableWalState('C:\\微信数据\\消息.db', { io, maxAttempts: 1 })
  assert.equal(result.safeForReadonlyShm, true)
  assert.deepEqual(calls, [
    'shm:C:\\微信数据\\消息.db-shm',
    'wal:C:\\微信数据\\消息.db-wal',
    'shm:C:\\微信数据\\消息.db-shm',
  ])
})

test('retries a torn or changed SHM observation but does not accept a mixed generation', async () => {
  const wal = makeWal()
  const torn = makeShm({ frameChecksum: wal.frameChecksum })
  torn[48] ^= 1
  const changed = makeShm({ frameChecksum: wal.frameChecksum, nBackfillAttempted: 2 })
  const stable = makeShm({ frameChecksum: wal.frameChecksum, nBackfillAttempted: 1 })
  const reads = [torn, stable, changed, stable, stable]
  let shmRead = 0
  const io: WalStateIo = {
    async readShm() {
      return reads[shmRead++] ?? stable
    },
    async readWal() {
      return wal.window
    },
  }

  const state = await readStableWalState('fixture.db', { io, maxAttempts: 3 })
  assert.equal(state.safeForReadonlyShm, true)
  assert.equal(shmRead, 5)
})

test('rejects invalid WAL header checksums and page size zero in active state', () => {
  const wal = makeWal()
  const corruptHeader = Buffer.from(wal.window.header!)
  corruptHeader[24] ^= 1
  const shm = parseWalIndexShm(makeShm({ frameChecksum: wal.frameChecksum }))
  expectWalError('WAL_HEADER_CHECKSUM_INVALID', () => validateWalGeneration(shm, {
    ...wal.window,
    header: corruptHeader,
  }))

  expectWalError('SHM_PAGE_SIZE_INVALID', () => parseWalIndexShm(makeShm({ mxFrame: 1, pageSize: 0 })))
})
