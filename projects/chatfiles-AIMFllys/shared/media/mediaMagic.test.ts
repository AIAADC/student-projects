import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { hasMaterializedMediaMagic, hasWxgfHevcPayload } from './mediaMagic.js'
import {
  MINIMAL_GIF_HEX,
  MINIMAL_JPEG_HEX,
  MINIMAL_PNG_HEX,
  MINIMAL_WEBP_HEX,
} from './mediaMagicFixtures.js'

const structuralJpeg = Buffer.from(MINIMAL_JPEG_HEX, 'hex')
const structuralPng = Buffer.from(MINIMAL_PNG_HEX, 'hex')
const structuralGif = Buffer.from(MINIMAL_GIF_HEX, 'hex')
const structuralWebp = Buffer.from(MINIMAL_WEBP_HEX, 'hex')

test('requires minimally coherent image containers rather than boundary magic', () => {
  assert.equal(hasMaterializedMediaMagic(structuralJpeg, 'jpeg'), true)
  assert.equal(hasMaterializedMediaMagic(Buffer.from([0xff,0xd8,0xff,0xe0,0,2,0xff,0xd9]), 'jpeg'), false)
  assert.equal(hasMaterializedMediaMagic(structuralPng, 'png'), true)
  assert.equal(hasMaterializedMediaMagic(Buffer.concat([
    structuralPng.subarray(0, 8),structuralPng.subarray(-12),
  ]), 'png'), false)
  assert.equal(hasMaterializedMediaMagic(structuralGif, 'gif'), true)
  assert.equal(hasMaterializedMediaMagic(Buffer.from('GIF89a;', 'ascii'), 'gif'), false)
  assert.equal(hasMaterializedMediaMagic(structuralWebp, 'webp'), true)
  assert.equal(hasMaterializedMediaMagic(Buffer.from('RIFF\u0008\u0000\u0000\u0000WEBPVP8 ', 'binary'), 'webp'), false)
})

test('rejects structurally corrupted payloads inside otherwise valid containers', () => {
  const jpeg = Buffer.from(structuralJpeg)
  const scan = jpeg.indexOf(Buffer.from([0xff,0xda]))
  const scanSize = jpeg.readUInt16BE(scan + 2)
  jpeg.fill(0, scan + 2 + scanSize, jpeg.length - 2)
  jpeg.set([0xff,0xc0], scan + 2 + scanSize)
  assert.equal(hasMaterializedMediaMagic(jpeg, 'jpeg'), false)

  const png = Buffer.from(structuralPng)
  const pngData = png.indexOf(Buffer.from('IDAT', 'ascii')) + 4
  png[pngData] ^= 0x01
  assert.equal(hasMaterializedMediaMagic(png, 'png'), false)

  const gif = Buffer.from(structuralGif)
  const descriptor = gif.indexOf(0x2c)
  gif[descriptor + 10] = 0xff
  assert.equal(hasMaterializedMediaMagic(gif, 'gif'), false)

  const webp = Buffer.from(structuralWebp)
  webp.fill(0, 20)
  assert.equal(hasMaterializedMediaMagic(webp, 'webp'), false)

  const emptyAnimationFrame = Buffer.concat([
    Buffer.from('RIFF', 'ascii'),Buffer.from([36,0,0,0]),Buffer.from('WEBP', 'ascii'),
    Buffer.from('ANMF', 'ascii'),Buffer.from([24,0,0,0]),Buffer.alloc(24),
  ])
  assert.equal(hasMaterializedMediaMagic(emptyAnimationFrame, 'webp'), false)
})

test('accepts legal empty PNG data chunks and GIF comment extensions', () => {
  const idat = structuralPng.indexOf(Buffer.from('IDAT', 'ascii')) - 4
  const emptyIdat = Buffer.from('000000004944415435af061e', 'hex')
  const png = Buffer.concat([structuralPng.subarray(0, idat),emptyIdat,structuralPng.subarray(idat)])
  assert.equal(hasMaterializedMediaMagic(png, 'png'), true)

  const descriptor = structuralGif.indexOf(0x2c)
  const gif = Buffer.concat([
    structuralGif.subarray(0, descriptor),Buffer.from([0x21,0xfe,0x00]),
    structuralGif.subarray(descriptor),
  ])
  assert.equal(hasMaterializedMediaMagic(gif, 'gif'), true)
})

test('requires a complete HEVC NAL header after the wxgf start code', () => {
  assert.equal(hasWxgfHevcPayload(Buffer.concat([
    Buffer.from('wxgf', 'ascii'),Buffer.from([0,0,0,1]),
  ])), false)
  assert.equal(hasWxgfHevcPayload(Buffer.concat([
    Buffer.from('wxgf', 'ascii'),Buffer.from([0,0,0,1,0x40,0x01,0xaa]),
  ])), true)
})

test('shared positive fixtures decode with ffprobe when it is installed', (t) => {
  const available = spawnSync('ffprobe', ['-version'], { stdio: 'ignore', windowsHide: true })
  if (available.error && (available.error as NodeJS.ErrnoException).code === 'ENOENT') {
    t.skip('ffprobe is not installed')
    return
  }
  assert.equal(available.status, 0)
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chatfiles-media-fixtures-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const fixtures = [
    ['jpg', structuralJpeg],['png', structuralPng],['gif', structuralGif],['webp', structuralWebp],
  ] as const
  for (const [extension, bytes] of fixtures) {
    const filename = path.join(root, `fixture.${extension}`)
    fs.writeFileSync(filename, bytes, { flag: 'wx' })
    const result = spawnSync('ffprobe', [
      '-v','error','-select_streams','v:0','-show_entries','stream=codec_name,width,height',
      '-of','json',filename,
    ], { encoding: 'utf8', windowsHide: true })
    assert.equal(result.status, 0, extension)
    const parsed = JSON.parse(result.stdout) as { streams?: Array<{ width?: number; height?: number }> }
    assert.equal((parsed.streams?.[0]?.width ?? 0) > 0, true, extension)
    assert.equal((parsed.streams?.[0]?.height ?? 0) > 0, true, extension)
  }
})
