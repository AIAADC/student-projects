import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { MINIMAL_JPEG_HEX } from '../../shared/media/mediaMagicFixtures.js'
import {
  extractWxgfHevcPayload,
  materializeWxgf,
  type FfmpegInvocation,
} from './wxgfMaterializer.js'

const ASSET_ID = 'a'.repeat(64)
const JPEG = Buffer.from(MINIMAL_JPEG_HEX, 'hex')

function wxgfFixture() {
  return Buffer.concat([
    Buffer.from('wxgf', 'ascii'),
    Buffer.from([0x09, 0x08, 0x07]),
    Buffer.from([0x00, 0x00, 0x00, 0x01, 0x40, 0x01, 0xaa, 0xbb]),
  ])
}

test('extracts wxgf only from a real four-byte HEVC start code', () => {
  assert.deepEqual(
    extractWxgfHevcPayload(wxgfFixture()),
    Buffer.from([0x00, 0x00, 0x00, 0x01, 0x40, 0x01, 0xaa, 0xbb]),
  )
  assert.equal(extractWxgfHevcPayload(Buffer.from('wxgf-no-start-code', 'ascii')), null)
  assert.equal(extractWxgfHevcPayload(Buffer.from([0, 0, 0, 1, 0x40, 1])), null)

  const invalidThenValid = Buffer.concat([
    Buffer.from('wxgf', 'ascii'),Buffer.from([0,0,0,1,0x80,0x00,0xaa]),
    Buffer.from([0,0,0,1,0x40,0x01,0xbb]),
  ])
  assert.deepEqual(
    extractWxgfHevcPayload(invalidThenValid),
    Buffer.from([0,0,0,1,0x40,0x01,0xbb]),
  )
})

test('materializes HEVC through an argument-array runner and verifies JPEG magic', async (t) => {
  const stagingDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chatfiles-wxgf-'))
  t.after(() => fs.rmSync(stagingDir, { recursive: true, force: true }))
  let invocation: FfmpegInvocation | null = null

  const result = await materializeWxgf({
    assetId: ASSET_ID,
    bytes: wxgfFixture(),
    stagingDir,
    runFfmpeg: async (input) => {
      invocation = input
      assert.equal(fs.readFileSync(input.args[input.args.indexOf('-i') + 1]!).subarray(0, 4).toString('hex'), '00000001')
      fs.writeFileSync(input.args.at(-1)!, JPEG)
      return { code: 0 }
    },
  })

  assert.equal(result.status, 'ready')
  if (result.status !== 'ready') throw new Error('Expected a JPEG output')
  assert.equal(result.relativePath, `media/${ASSET_ID}.jpg`)
  assert.match(result.contentSha256, /^sha256:[a-f0-9]{64}$/u)
  assert.deepEqual(fs.readFileSync(path.join(stagingDir, ...result.relativePath.split('/'))), JPEG)
  const captured = invocation as FfmpegInvocation | null
  assert.ok(captured)
  assert.equal(captured.executable, 'ffmpeg')
  assert.deepEqual(captured.args.slice(0, 6), ['-y', '-v', 'error', '-f', 'hevc', '-i'])
  assert.equal(captured.shell, false)
  assert.equal(fs.existsSync(path.join(stagingDir, 'media', `${ASSET_ID}.h265`)), false)
})

test('distinguishes missing HEVC framing, unavailable FFmpeg, and invalid output', async (t) => {
  const stagingDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chatfiles-wxgf-fail-'))
  t.after(() => fs.rmSync(stagingDir, { recursive: true, force: true }))

  assert.deepEqual(await materializeWxgf({
    assetId: ASSET_ID,
    bytes: Buffer.from('wxgf-without-hevc', 'ascii'),
    stagingDir,
    runFfmpeg: async () => ({ code: 0 }),
  }), { status: 'unsupported_codec', reason: 'hevc_start_code_missing' })

  assert.deepEqual(await materializeWxgf({
    assetId: ASSET_ID,
    bytes: wxgfFixture(),
    stagingDir,
    runFfmpeg: async () => {
      const error = new Error('private executable detail') as NodeJS.ErrnoException
      error.code = 'ENOENT'
      throw error
    },
  }), { status: 'unsupported_codec', reason: 'ffmpeg_unavailable' })

  assert.deepEqual(await materializeWxgf({
    assetId: ASSET_ID,
    bytes: wxgfFixture(),
    stagingDir,
    runFfmpeg: async (input) => {
      fs.writeFileSync(input.args.at(-1)!, Buffer.from('not-an-image', 'ascii'))
      return { code: 0 }
    },
  }), { status: 'decrypt_failed', reason: 'invalid_output_magic' })
})
