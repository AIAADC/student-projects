import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import test from 'node:test'
import {
  decryptWechatDat,
  useWechatMediaKey,
  type WechatDatVersion,
} from './wechatDat.js'
import { MINIMAL_JPEG_HEX, MINIMAL_PNG_HEX } from '../../shared/media/mediaMagicFixtures.js'

const TEST_KEY = Buffer.from('0123456789abcdef', 'ascii')
const XOR_TAIL_KEY = 0x88

function encryptFixture(
  version: WechatDatVersion,
  content: Buffer,
  aesSize: number,
  xorSize: number,
  xorKey = XOR_TAIL_KEY,
) {
  const prefix = content.subarray(0, aesSize)
  const paddingSize = 16 - (prefix.length % 16)
  const padded = Buffer.concat([prefix, Buffer.alloc(paddingSize, paddingSize)])
  const cipher = crypto.createCipheriv('aes-128-ecb', TEST_KEY, null)
  cipher.setAutoPadding(false)
  const encrypted = Buffer.concat([cipher.update(padded), cipher.final()])
  const tail = content.subarray(content.length - xorSize)
  const middle = content.subarray(aesSize, content.length - xorSize)
  const encodedTail = Buffer.from(tail.map((value) => value ^ xorKey))
  const header = Buffer.alloc(15)
  Buffer.from([0x07, 0x08, 0x56, version === 'v1' ? 0x31 : 0x32, 0x08, 0x07]).copy(header)
  header.writeUInt32LE(aesSize, 6)
  header.writeUInt32LE(xorSize, 10)
  return Buffer.concat([header, encrypted, middle, encodedTail])
}

test('decrypts independent V1 and V2 golden vectors with full-block PKCS7 padding', () => {
  const jpeg = Buffer.from(
    MINIMAL_JPEG_HEX,
    'hex',
  )
  const vectors = [
    {
      version: 'v1' as const,
      encoded: '07085631080710000000020000000031feb96481458ef881d8911b471d64c7a4bd516ab4a5f4dae57b06e5e2ab770000010000fffe00104c61766336322e32382e31303100ffdb0043000804040404040505050505050606060606060606060606060607070708080807070706060707080808080909090808080809090a0a0a0c0c0b0b0e0e0e111114ffc4004c0001010000000000000000000000000000000601010100000000000000000000000000000607100100000000000000000000000000000000110100000000000000000000000000000000ffc00011080002000203012200021100031100ffda000c03010002110311003f008b004d7f7f5a7c',
    },
    {
      version: 'v2' as const,
      encoded: '07085632080710000000020000000092b9e55c8176e5c6d663cefe28c4aece377222e061a924c591cd9c27ea163ed400010000fffe00104c61766336322e32382e31303100ffdb0043000804040404040505050505050606060606060606060606060607070708080807070706060707080808080909090808080809090a0a0a0c0c0b0b0e0e0e111114ffc4004c0001010000000000000000000000000000000601010100000000000000000000000000000607100100000000000000000000000000000000110100000000000000000000000000000000ffc00011080002000203012200021100031100ffda000c03010002110311003f008b004d7f7f5a7c',
    },
  ]
  for (const { version, encoded } of vectors) {
    const result = decryptWechatDat(Buffer.from(encoded, 'hex'), { v2: TEST_KEY, xorKey: 0xa5 })
    assert.equal(result.status, 'ready')
    if (result.status !== 'ready') throw new Error('Expected decoded media')
    assert.equal(result.version, version)
    assert.equal(result.format, 'jpeg')
    assert.deepEqual(result.bytes, jpeg)
  }
})

test('rejects a wrong V2 key, truncated ciphertext, and forged weak magic', () => {
  const jpeg = Buffer.from(MINIMAL_JPEG_HEX, 'hex')
  const encoded = encryptFixture('v2', jpeg, 21, 4)
  const wrong = decryptWechatDat(encoded, { v2: Buffer.from('fedcba9876543210', 'ascii') })
  assert.deepEqual(wrong, { status: 'decrypt_failed', reason: 'invalid_padding', version: 'v2' })

  const truncated = decryptWechatDat(encoded.subarray(0, 20), { v2: TEST_KEY })
  assert.deepEqual(truncated, { status: 'decrypt_failed', reason: 'truncated_payload', version: 'v2' })

  const weakJpeg = Buffer.from([0xff, 0xd8, 0x00, 0x00, 0x00])
  const xorKey = weakJpeg[0]! ^ 0xff
  const forged = Buffer.from(weakJpeg.map((value) => value ^ xorKey))
  assert.deepEqual(decryptWechatDat(forged, {}), {
    status: 'decrypt_failed', reason: 'invalid_media_magic', version: 'legacy_xor',
  })
})

test('rejects invalid PKCS7 padding and an incorrect tail XOR key', () => {
  const jpeg = Buffer.from(MINIMAL_JPEG_HEX, 'hex')
  const encoded = encryptFixture('v2', jpeg, 16, 2, 0xa5)
  const wrongXor = decryptWechatDat(encoded, { v2: TEST_KEY, xorKey: 0x88 })
  assert.deepEqual(wrongXor, {
    status: 'decrypt_failed', reason: 'invalid_media_magic', version: 'v2',
  })
  const damagedPadding = Buffer.from(encoded)
  damagedPadding[15 + 31] ^= 0x01
  const damaged = decryptWechatDat(damagedPadding, { v2: TEST_KEY, xorKey: 0xa5 })
  assert.deepEqual(damaged, {
    status: 'decrypt_failed', reason: 'invalid_padding', version: 'v2',
  })
})

test('rejects truncated GIF, inconsistent WebP, and wxgf without HEVC framing', () => {
  const invalidPayloads = [
    Buffer.from('GIF89a-truncated', 'ascii'),
    Buffer.concat([Buffer.from('RIFF', 'ascii'),Buffer.from([0,0,0,0]),Buffer.from('WEBPVP8 ', 'ascii')]),
    Buffer.from('wxgf-no-hevc-start-code', 'ascii'),
  ]
  for (const payload of invalidPayloads) {
    const encoded = encryptFixture('v2', payload, Math.min(8, payload.length), 1)
    assert.deepEqual(decryptWechatDat(encoded, { v2: TEST_KEY }), {
      status: 'decrypt_failed',reason: 'invalid_media_magic',version: 'v2',
    })
  }
})

test('decodes the legacy XOR format only after strict PNG validation', () => {
  const png = Buffer.from(MINIMAL_PNG_HEX, 'hex')
  const xorKey = 0xa5
  const encoded = Buffer.from(png.map((value) => value ^ xorKey))
  const result = decryptWechatDat(encoded, {})
  assert.equal(result.status, 'ready')
  if (result.status !== 'ready') throw new Error('Expected decoded legacy media')
  assert.equal(result.version, 'legacy_xor')
  assert.equal(result.format, 'png')
  assert.deepEqual(result.bytes, png)

  const headerOnly = Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])
  const forged = Buffer.from(headerOnly.map((value) => value ^ xorKey))
  assert.deepEqual(decryptWechatDat(forged, {}), {
    status: 'decrypt_failed',reason: 'invalid_media_magic',version: 'legacy_xor',
  })
})

test('reports a missing versioned key without attempting decryption', () => {
  const encoded = Buffer.concat([
    Buffer.from([0x07, 0x08, 0x56, 0x32, 0x08, 0x07]),
    Buffer.alloc(25),
  ])
  assert.deepEqual(decryptWechatDat(encoded, {}), { status: 'key_unavailable', version: 'v2' })
})

test('uses a short-lived provider key and clears both provider and consumer buffers', async () => {
  const provided = Buffer.from(TEST_KEY)
  let delivered: Uint8Array | null = null
  const result = await useWechatMediaKey(
    { provide: async (version) => version === 'v2' ? provided : null },
    'v2',
    async (key) => {
      delivered = key
      assert.notEqual(key, provided)
      assert.deepEqual(Buffer.from(key), TEST_KEY)
      return 'used'
    },
  )
  assert.equal(result, 'used')
  assert.deepEqual(provided, Buffer.alloc(16))
  assert.deepEqual(Buffer.from(delivered ?? []), Buffer.alloc(16))
})
