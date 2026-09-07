import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { MINIMAL_JPEG_HEX } from '../../shared/media/mediaMagicFixtures.js'
import { materializeWechatDat } from './datMaterializer.js'

const KEY = Buffer.from('0123456789abcdef', 'ascii')

function encodeV2(content: Buffer, aesSize = Math.min(content.length, 17), xorSize = 3, xorKey = 0x88) {
  const prefix = content.subarray(0, aesSize)
  const paddingSize = 16 - (prefix.length % 16)
  const padded = Buffer.concat([prefix, Buffer.alloc(paddingSize, paddingSize)])
  const cipher = crypto.createCipheriv('aes-128-ecb', KEY, null)
  cipher.setAutoPadding(false)
  const encrypted = Buffer.concat([cipher.update(padded), cipher.final()])
  const header = Buffer.alloc(15)
  Buffer.from([0x07, 0x08, 0x56, 0x32, 0x08, 0x07]).copy(header)
  header.writeUInt32LE(aesSize, 6)
  header.writeUInt32LE(xorSize, 10)
  const middle = content.subarray(aesSize, content.length - xorSize)
  const tail = Buffer.from(content.subarray(content.length - xorSize).map((value) => value ^ xorKey))
  return Buffer.concat([header, encrypted, middle, tail])
}

test('materializes a verified V2 image and zeroes the supplied process key', async (t) => {
  const stagingDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chatfiles-dat-'))
  t.after(() => fs.rmSync(stagingDir, { recursive: true, force: true }))
  const jpeg = Buffer.from(MINIMAL_JPEG_HEX, 'hex')
  const supplied = Buffer.from(KEY)
  const assetId = 'c'.repeat(64)
  const result = await materializeWechatDat({
    assetId,
    encoded: encodeV2(jpeg, 17, 3, 0xa5),
    stagingDir,
    xorKey: 0xa5,
    keyProvider: { provide: async () => supplied },
  })
  assert.equal(result.status, 'ready')
  if (result.status !== 'ready') throw new Error('Expected image materialization')
  assert.equal(result.relativePath, `media/${assetId}.jpg`)
  assert.deepEqual(fs.readFileSync(path.join(stagingDir, ...result.relativePath.split('/'))), jpeg)
  assert.deepEqual(supplied, Buffer.alloc(16))
})

test('keeps unavailable and incorrect keys as explicit states', async (t) => {
  const stagingDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chatfiles-dat-key-'))
  t.after(() => fs.rmSync(stagingDir, { recursive: true, force: true }))
  const jpeg = Buffer.from(MINIMAL_JPEG_HEX, 'hex')
  const encoded = encodeV2(jpeg)
  assert.deepEqual(await materializeWechatDat({
    assetId: 'd'.repeat(64), encoded, stagingDir,
    keyProvider: { provide: async () => null },
  }), { status: 'key_unavailable' })
  assert.deepEqual(await materializeWechatDat({
    assetId: 'e'.repeat(64), encoded, stagingDir,
    keyProvider: { provide: async () => Buffer.from('fedcba9876543210', 'ascii') },
  }), { status: 'decrypt_failed', reason: 'invalid_padding' })
})

test('routes decoded wxgf bytes through the verified HEVC materializer', async (t) => {
  const stagingDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chatfiles-dat-wxgf-'))
  t.after(() => fs.rmSync(stagingDir, { recursive: true, force: true }))
  const wxgf = Buffer.concat([
    Buffer.from('wxgf-header', 'ascii'),
    Buffer.from([0x00, 0x00, 0x00, 0x01, 0x40, 0x01, 0xaa]),
    Buffer.alloc(20, 0x42),
  ])
  const result = await materializeWechatDat({
    assetId: 'f'.repeat(64),
    encoded: encodeV2(wxgf),
    stagingDir,
    keyProvider: { provide: async () => Buffer.from(KEY) },
    runFfmpeg: async (invocation) => {
      fs.writeFileSync(
        invocation.args.at(-1)!,
        Buffer.from(MINIMAL_JPEG_HEX, 'hex'),
      )
      return { code: 0 }
    },
  })
  assert.equal(result.status, 'ready')
  if (result.status === 'ready') assert.equal(result.format, 'jpeg')
})
