import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'
import { MINIMAL_JPEG_HEX } from '../../shared/media/mediaMagicFixtures.js'
import { exportDailyConversationMedia } from './dailyConversationExport.js'

function digest(bytes: Uint8Array) {
  return `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`
}

test('exports canonical messages by day with second timestamps and verified relative media links', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chatfiles-daily-media-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const bundleRoot = path.join(root, 'chat-assets.current')
  const accountRoot = path.join(root, 'account')
  const outputRoot = path.join(root, 'IP训练营')
  fs.mkdirSync(path.join(bundleRoot, 'media'), { recursive: true })
  fs.mkdirSync(path.join(accountRoot, 'attach'), { recursive: true })
  const photoId = '1'.repeat(64)
  const posterId = '2'.repeat(64)
  const pendingId = '4'.repeat(64)
  const jpeg = Buffer.from(MINIMAL_JPEG_HEX, 'hex')
  fs.writeFileSync(path.join(bundleRoot, 'media', `${photoId}.jpg`), jpeg)
  fs.writeFileSync(path.join(bundleRoot, 'media', `${posterId}.jpg`), jpeg)
  const encrypted = Buffer.from([0x07,0x08,0x56,0x32,0x08,0x07])
  fs.writeFileSync(path.join(accountRoot, 'attach', 'pending.dat'), encrypted)

  const canonical = new DatabaseSync(':memory:')
  const assets = new DatabaseSync(':memory:')
  t.after(() => { canonical.close(); assets.close() })
  canonical.exec(`
    CREATE TABLE bundle_metadata(key TEXT PRIMARY KEY,value TEXT);
    INSERT INTO bundle_metadata VALUES('time_zone','Asia/Shanghai');
    CREATE TABLE messages(
      conv_id TEXT,message_uid TEXT,canonical_seq INTEGER,occurred_at_epoch_s INTEGER,
      archive_day TEXT,sender_name TEXT,text TEXT
    );
    INSERT INTO messages VALUES
      ('conv-a','uid-a',0,0,'1970-01-01','成员甲','第一条图片'),
      ('conv-a','uid-b',1,57600,'1970-01-02','成员乙','第二条视频缩略图');
  `)
  assets.exec(`
    CREATE TABLE artifacts(
      asset_id TEXT,message_uid TEXT,conv_id TEXT,name TEXT,preview TEXT,materialization TEXT,
      preview_status TEXT,association_status TEXT,confirmation_status TEXT,
      materialized_relative_path TEXT,materialized_size INTEGER,
      materialized_content_sha256 TEXT,media_format TEXT,
      source_relative_path TEXT,source_size INTEGER,source_content_sha256 TEXT
    );
  `)
  const insert = assets.prepare('INSERT INTO artifacts VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
  insert.run(
    photoId,'uid-a','conv-a','原图.dat','image','ready','ready','exact','confirmed',
    `media/${photoId}.jpg`,jpeg.length,digest(jpeg),'jpeg',null,null,null,
  )
  insert.run(
    posterId,'uid-b','conv-a','视频.dat','video','thumbnail_only','thumbnail_only','exact','confirmed',
    `media/${posterId}.jpg`,jpeg.length,digest(jpeg),'jpeg',null,null,null,
  )
  insert.run(
    pendingId,'uid-a','conv-a','未物化.dat','image','not_attempted','unavailable','exact','confirmed',
    null,null,null,null,'attach/pending.dat',encrypted.length,digest(encrypted),
  )

  const result = exportDailyConversationMedia({
    canonicalDb: canonical,assetDb: assets,bundleRoot,accountRoot,conversationId: 'conv-a',outputRoot,
  })

  assert.deepEqual(result, { days: 2,messages: 2,photos: 1,videos: 1 })
  const dayOne = fs.readFileSync(path.join(outputRoot, '1970-01-01', 'chat.md'), 'utf8')
  assert.match(dayOne, /1970-01-01 08:00:00 \+08:00/u)
  assert.match(dayOne, new RegExp(`photos/${photoId}\\.jpg`, 'u'))
  const dayTwo = fs.readFileSync(path.join(outputRoot, '1970-01-02', 'chat.md'), 'utf8')
  assert.match(dayTwo, /1970-01-02 00:00:00 \+08:00/u)
  assert.match(dayTwo, new RegExp(`videos/${posterId}-thumbnail\\.jpg`, 'u'))
  assert.deepEqual(
    fs.readFileSync(path.join(outputRoot, '1970-01-01', 'photos', `${photoId}.jpg`)),
    jpeg,
  )
  assert.deepEqual(
    fs.readFileSync(path.join(outputRoot, '1970-01-02', 'videos', `${posterId}-thumbnail.jpg`)),
    jpeg,
  )
})

test('rejects a same-size materialized replacement instead of exporting it', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chatfiles-daily-changed-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const bundleRoot = path.join(root, 'bundle')
  fs.mkdirSync(path.join(bundleRoot, 'media'), { recursive: true })
  const id = '3'.repeat(64)
  const expected = Buffer.from(MINIMAL_JPEG_HEX, 'hex')
  fs.writeFileSync(path.join(bundleRoot, 'media', `${id}.jpg`), Buffer.alloc(expected.length, 0x41))
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
    INSERT INTO messages VALUES('conv-a','uid-a',0,0,'1970-01-01','成员','图片');
  `)
  assets.exec(`CREATE TABLE artifacts(
    asset_id TEXT,message_uid TEXT,conv_id TEXT,name TEXT,preview TEXT,materialization TEXT,
    preview_status TEXT,association_status TEXT,confirmation_status TEXT,
    materialized_relative_path TEXT,materialized_size INTEGER,materialized_content_sha256 TEXT,
    media_format TEXT,source_relative_path TEXT,source_size INTEGER,source_content_sha256 TEXT
  );`)
  assets.prepare('INSERT INTO artifacts VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(
    id,'uid-a','conv-a','图.dat','image','ready','ready','exact','confirmed',
    `media/${id}.jpg`,expected.length,digest(expected),'jpeg',null,null,null,
  )
  const outputRoot = path.join(root, 'output')
  assert.throws(() => exportDailyConversationMedia({
    canonicalDb: canonical,assetDb: assets,bundleRoot,conversationId: 'conv-a',
    outputRoot,
  }), /DAILY_MEDIA_CONTENT_CHANGED/u)
  assert.equal(fs.existsSync(outputRoot), false)
  fs.writeFileSync(path.join(bundleRoot, 'media', `${id}.jpg`), expected)
  assert.deepEqual(exportDailyConversationMedia({
    canonicalDb: canonical,assetDb: assets,bundleRoot,conversationId: 'conv-a',outputRoot,
  }), { days: 1,messages: 1,photos: 1,videos: 0 })
})

test('rejects output inside protected source or bundle roots before creating it', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chatfiles-daily-protected-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const accountRoot = path.join(root, 'account')
  const bundleRoot = path.join(root, 'chat-assets.current')
  fs.mkdirSync(accountRoot)
  fs.mkdirSync(bundleRoot)
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
  `)
  assets.exec(`CREATE TABLE artifacts(
    asset_id TEXT,message_uid TEXT,conv_id TEXT,name TEXT,preview TEXT,materialization TEXT,
    preview_status TEXT,association_status TEXT,confirmation_status TEXT,
    materialized_relative_path TEXT,materialized_size INTEGER,materialized_content_sha256 TEXT,
    media_format TEXT,source_relative_path TEXT,source_size INTEGER,source_content_sha256 TEXT
  );`)

  for (const protectedRoot of [accountRoot,bundleRoot]) {
    const outputRoot = path.join(protectedRoot, 'unsafe-export')
    assert.throws(() => exportDailyConversationMedia({
      canonicalDb: canonical,assetDb: assets,bundleRoot,accountRoot,
      conversationId: 'conv-a',outputRoot,
    }), /DAILY_MEDIA_OUTPUT_PROTECTED/u)
    assert.equal(fs.existsSync(outputRoot), false)
  }
})
