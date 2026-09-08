import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'
import { MINIMAL_JPEG_HEX } from '../../shared/media/mediaMagicFixtures.js'
import { exportDailyConversationMedia } from './dailyConversationExport.js'

const VIDEO_SIZE = 4 * 1024 * 1024

function digestFile(filename: string) {
  const hash = crypto.createHash('sha256')
  const buffer = Buffer.allocUnsafe(64 * 1024)
  const handle = fs.openSync(filename, 'r')
  try {
    let bytesRead = 0
    do {
      bytesRead = fs.readSync(handle, buffer, 0, buffer.length, null)
      if (bytesRead > 0) hash.update(buffer.subarray(0, bytesRead))
    } while (bytesRead > 0)
  } finally {
    fs.closeSync(handle)
  }
  return `sha256:${hash.digest('hex')}`
}

function mediaFixture(
  t: { after(callback: () => void): void },
  input: {
    id: string
    name: string
    preview: 'image' | 'video'
    write(filename: string): { size: number; digest: string }
  },
) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chatfiles-daily-bounded-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const bundleRoot = path.join(root, 'bundle')
  const mediaDir = path.join(bundleRoot, 'media')
  const outputRoot = path.join(root, 'output')
  const stagingRoot = path.join(root, `.output.${process.pid}.staging`)
  fs.mkdirSync(mediaDir, { recursive: true })
  const sourcePath = path.join(mediaDir, input.id)
  const evidence = input.write(sourcePath)
  const canonical = new DatabaseSync(':memory:')
  const assets = new DatabaseSync(':memory:')
  t.after(() => { canonical.close(); assets.close() })
  canonical.exec(`
    CREATE TABLE bundle_metadata(key TEXT,value TEXT);
    INSERT INTO bundle_metadata VALUES('time_zone','Asia/Shanghai');
    CREATE TABLE messages(
      conv_id TEXT,message_uid TEXT,canonical_seq INTEGER,occurred_at_epoch_s INTEGER,
      archive_day TEXT,sender_name TEXT,text TEXT
    );
    INSERT INTO messages VALUES('conv-a','uid-a',0,0,'1970-01-01','成员','媒体');
  `)
  assets.exec(`CREATE TABLE artifacts(
    asset_id TEXT,message_uid TEXT,conv_id TEXT,name TEXT,preview TEXT,materialization TEXT,
    preview_status TEXT,association_status TEXT,confirmation_status TEXT,
    materialized_relative_path TEXT,materialized_size INTEGER,materialized_content_sha256 TEXT,
    media_format TEXT,source_relative_path TEXT,source_size INTEGER,source_content_sha256 TEXT
  );`)
  assets.prepare('INSERT INTO artifacts VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(
    input.id,'uid-a','conv-a',input.name,input.preview,'ready','ready','exact','confirmed',
    `media/${input.id}`,evidence.size,evidence.digest,input.preview,null,null,null,
  )
  return { canonical,assets,bundleRoot,outputRoot,sourcePath,stagingRoot }
}

test('rejects an oversized image without leaving a partial export', (t) => {
  const jpeg = Buffer.from(MINIMAL_JPEG_HEX, 'hex')
  const fixture = mediaFixture(t, {
    id: '5'.repeat(64),name: 'photo.jpg',preview: 'image',
    write(filename) {
      fs.writeFileSync(filename, jpeg)
      return {
        size: jpeg.length,
        digest: `sha256:${crypto.createHash('sha256').update(jpeg).digest('hex')}`,
      }
    },
  })
  assert.throws(() => exportDailyConversationMedia({
    canonicalDb: fixture.canonical,assetDb: fixture.assets,
    bundleRoot: fixture.bundleRoot,conversationId: 'conv-a',outputRoot: fixture.outputRoot,
    limits: { maxImageBytes: jpeg.length - 1 },
  }), /DAILY_MEDIA_IMAGE_LIMIT_EXCEEDED/u)
  assert.equal(fs.existsSync(fixture.outputRoot), false)
  assert.equal(fs.existsSync(fixture.stagingRoot), false)
})

test('streams a large video above the image budget and copies it exclusively', (t) => {
  const fixture = mediaFixture(t, {
    id: '6'.repeat(64),name: 'large.mp4',preview: 'video',
    write(filename) {
      const handle = fs.openSync(filename, 'wx')
      try {
        fs.writeSync(handle, Buffer.from([0,0,0,12,0x66,0x74,0x79,0x70,0x69,0x73,0x6f,0x6d]))
        fs.ftruncateSync(handle, VIDEO_SIZE)
      } finally {
        fs.closeSync(handle)
      }
      return { size: VIDEO_SIZE,digest: digestFile(filename) }
    },
  })
  const mutableFs = fs as unknown as Record<string, (...args: unknown[]) => unknown>
  const originalRead = mutableFs.readFileSync!
  const originalCopy = mutableFs.copyFileSync!
  let copyMode: unknown
  mutableFs.readFileSync = (...args) => {
    if (path.resolve(String(args[0])) === fixture.sourcePath) {
      throw new Error('WHOLE_VIDEO_READ_FORBIDDEN')
    }
    return Reflect.apply(originalRead, fs, args)
  }
  mutableFs.copyFileSync = (...args) => {
    copyMode = args[2]
    return Reflect.apply(originalCopy, fs, args)
  }
  let result: ReturnType<typeof exportDailyConversationMedia>
  try {
    result = exportDailyConversationMedia({
      canonicalDb: fixture.canonical,assetDb: fixture.assets,bundleRoot: fixture.bundleRoot,
      conversationId: 'conv-a',outputRoot: fixture.outputRoot,limits: { maxImageBytes: 1024 },
    })
  } finally {
    mutableFs.readFileSync = originalRead
    mutableFs.copyFileSync = originalCopy
  }
  assert.deepEqual(result, { days: 1,messages: 1,photos: 0,videos: 1 })
  assert.equal(copyMode, fs.constants.COPYFILE_EXCL)
  assert.equal(fs.statSync(path.join(
    fixture.outputRoot,'1970-01-01','videos',`${'6'.repeat(64)}.mp4`,
  )).size, VIDEO_SIZE)
})

test('rejects a copied media file changed before post-copy verification', (t) => {
  const jpeg = Buffer.from(MINIMAL_JPEG_HEX, 'hex')
  const fixture = mediaFixture(t, {
    id: '7'.repeat(64),name: 'photo.jpg',preview: 'image',
    write(filename) {
      fs.writeFileSync(filename, jpeg)
      return {
        size: jpeg.length,
        digest: `sha256:${crypto.createHash('sha256').update(jpeg).digest('hex')}`,
      }
    },
  })
  const mutableFs = fs as unknown as Record<string, (...args: unknown[]) => unknown>
  const originalCopy = mutableFs.copyFileSync!
  mutableFs.copyFileSync = (...args) => {
    assert.equal(args[2], fs.constants.COPYFILE_EXCL)
    const result = Reflect.apply(originalCopy, fs, args)
    fs.appendFileSync(String(args[1]), Buffer.from([0]))
    return result
  }
  try {
    assert.throws(() => exportDailyConversationMedia({
      canonicalDb: fixture.canonical,assetDb: fixture.assets,bundleRoot: fixture.bundleRoot,
      conversationId: 'conv-a',outputRoot: fixture.outputRoot,
    }), /DAILY_MEDIA_CONTENT_CHANGED/u)
  } finally {
    mutableFs.copyFileSync = originalCopy
  }
  assert.equal(fs.existsSync(fixture.outputRoot), false)
  assert.equal(fs.existsSync(fixture.stagingRoot), false)
})
