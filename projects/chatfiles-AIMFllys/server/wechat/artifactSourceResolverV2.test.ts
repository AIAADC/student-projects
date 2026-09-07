import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'
import { MINIMAL_JPEG_HEX } from '../../shared/media/mediaMagicFixtures.js'
import { createArtifactSourceResolver } from './artifactSourceResolver.js'

function digest(bytes: Uint8Array) {
  return `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`
}

test('preserves normalized unavailable materialization reasons in metadata resolution', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chatfiles-v2-source-state-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const accountRoot = path.join(root, 'account')
  fs.mkdirSync(accountRoot)
  const database = new DatabaseSync(':memory:')
  t.after(() => database.close())
  database.exec(`
    CREATE TABLE artifacts(
      asset_id TEXT PRIMARY KEY,conv_id TEXT,category TEXT,kind TEXT,name TEXT,preview TEXT,
      url TEXT,source_relative_path TEXT,source_size INTEGER,created_at INTEGER,sender_name TEXT,
      materialization TEXT,preview_status TEXT,link_status TEXT,association_status TEXT,
      confirmation_status TEXT,association_evidence TEXT,source_presence TEXT,source_content_sha256 TEXT
    );
    INSERT INTO artifacts VALUES
      ('${'b'.repeat(64)}','conv','document','resource','解密失败.dat','image',NULL,NULL,NULL,1,
       '成员','decrypt_failed','unavailable','confirmed','exact','confirmed','lookup_evidence','present',NULL),
      ('${'c'.repeat(64)}','conv','document','resource','来源冲突.pdf','pdf',NULL,NULL,NULL,1,
       '成员','not_attempted','unavailable','confirmed','exact','confirmed','lookup_evidence','ambiguous',NULL),
      ('${'d'.repeat(64)}','conv','document','resource','编码不支持.bin','download',NULL,NULL,NULL,1,
       '成员','unsupported_codec','unavailable','confirmed','exact','confirmed','lookup_evidence','present',NULL),
      ('${'e'.repeat(64)}','conv','document','resource','部分关联.pdf','pdf',NULL,NULL,NULL,1,
       '成员','ready','ready','confirmed','partial','confirmed','lookup_evidence','present',NULL),
      ('${'f'.repeat(64)}','conv','document','resource','缺少摘要.pdf','pdf',NULL,'ready.pdf',4,1,
       '成员','ready','ready','confirmed','exact','confirmed','lookup_evidence','present',NULL),
      ('${'1'.repeat(64)}','conv','document','resource','伪旧状态.pdf','pdf',NULL,'ready.pdf',4,1,
       '成员','exported','ready','confirmed','exact','confirmed','lookup_evidence','present',NULL),
      ('${'2'.repeat(64)}','conv','document','resource','缺摘要缩略图.jpg','image',NULL,'ready.pdf',4,1,
       '成员','thumbnail_only','thumbnail_only','confirmed','exact','confirmed','lookup_evidence','present',NULL);
  `)
  fs.writeFileSync(path.join(accountRoot, 'ready.pdf'), 'AAAA', 'utf8')
  const resolver = createArtifactSourceResolver({ assetDb: database, accountRoot })

  assert.equal(resolver.resolve('b'.repeat(64), 'content').state, 'decrypt_failed')
  assert.equal(resolver.resolve('c'.repeat(64), 'content').state, 'not_attempted')
  assert.equal(resolver.resolve('d'.repeat(64), 'content').state, 'unsupported_codec')
  assert.equal(resolver.resolve('e'.repeat(64), 'content').status, 'unknown')
  assert.equal(resolver.resolve('f'.repeat(64), 'content').status, 'unavailable')
  assert.equal(resolver.resolve('1'.repeat(64), 'content').status, 'unavailable')
  assert.equal(resolver.resolve('2'.repeat(64), 'thumbnail').status, 'unavailable')
})

test('serves verified dat and voice materializations from the bound bundle root', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chatfiles-v2-materialized-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const accountRoot = path.join(root, 'account')
  const bundleRoot = path.join(root, 'chat-assets.current')
  fs.mkdirSync(accountRoot)
  fs.mkdirSync(path.join(bundleRoot, 'media'), { recursive: true })
  const imageId = '3'.repeat(64)
  const voiceId = '4'.repeat(64)
  const rawDatId = '5'.repeat(64)
  const missingFormatId = '6'.repeat(64)
  const materializedDatId = '7'.repeat(64)
  const jpeg = Buffer.from(MINIMAL_JPEG_HEX, 'hex')
  const silk = Buffer.from('#!SILK_V3fixture', 'ascii')
  const encryptedDat = Buffer.from([0x07, 0x08, 0x56, 0x32, 0x08, 0x07, 0, 0])
  fs.writeFileSync(path.join(bundleRoot, 'media', `${imageId}.jpg`), jpeg)
  fs.writeFileSync(path.join(bundleRoot, 'media', `${voiceId}.silk`), silk)
  fs.writeFileSync(path.join(bundleRoot, 'media', `${materializedDatId}.dat`), jpeg)
  fs.writeFileSync(path.join(accountRoot, 'still-encrypted.dat'), encryptedDat)
  const database = new DatabaseSync(':memory:')
  t.after(() => database.close())
  database.exec(`
    CREATE TABLE artifacts(
      asset_id TEXT PRIMARY KEY,conv_id TEXT,category TEXT,kind TEXT,name TEXT,preview TEXT,
      url TEXT,source_relative_path TEXT,source_size INTEGER,created_at INTEGER,sender_name TEXT,
      materialization TEXT,preview_status TEXT,link_status TEXT,association_status TEXT,
      confirmation_status TEXT,association_evidence TEXT,source_presence TEXT,source_content_sha256 TEXT,
      materialized_relative_path TEXT,materialized_size INTEGER,
      materialized_content_sha256 TEXT,media_format TEXT
    );
  `)
  const insert = database.prepare('INSERT INTO artifacts VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
  insert.run(
    imageId,'conv','work','resource','图片.dat','image',null,'attach/image.dat',100,1,'成员',
    'ready','ready','confirmed','exact','confirmed','lookup_evidence','present',digest(Buffer.alloc(100)),
    `media/${imageId}.jpg`,jpeg.length,digest(jpeg),'jpeg',
  )
  insert.run(
    voiceId,'conv','work','voice','语音消息','voice',null,null,silk.length,1,'成员',
    'ready','unavailable','confirmed','exact','confirmed','voice_info_unique','present',digest(silk),
    `media/${voiceId}.silk`,silk.length,digest(silk),'silk',
  )
  insert.run(
    missingFormatId,'conv','work','resource','缺少格式.dat','image',null,'attach/image.dat',100,1,'成员',
    'ready','ready','confirmed','exact','confirmed','lookup_evidence','present',digest(Buffer.alloc(100)),
    `media/${imageId}.jpg`,jpeg.length,digest(jpeg),null,
  )
  insert.run(
    materializedDatId,'conv','work','resource','伪物化.dat','image',null,'attach/image.dat',100,1,'成员',
    'ready','ready','confirmed','exact','confirmed','lookup_evidence','present',digest(Buffer.alloc(100)),
    `media/${materializedDatId}.dat`,jpeg.length,digest(jpeg),'jpeg',
  )
  insert.run(
    rawDatId,'conv','work','resource','未物化图片.dat','image',null,'still-encrypted.dat',
    encryptedDat.length,1,'成员','ready','ready','confirmed','exact','confirmed',
    'lookup_evidence','present',digest(encryptedDat),null,null,null,null,
  )

  const resolver = createArtifactSourceResolver({ assetDb: database, accountRoot, bundleRoot })
  const image = resolver.resolve(imageId, 'content')
  assert.equal(image.status, 'available')
  if (image.status === 'available') assert.equal(image.target, path.join(bundleRoot, 'media', `${imageId}.jpg`))
  const voice = resolver.resolve(voiceId, 'content')
  assert.equal(voice.status, 'available')
  if (voice.status === 'available') assert.equal(voice.target, path.join(bundleRoot, 'media', `${voiceId}.silk`))
  assert.equal(resolver.resolve(voiceId, 'thumbnail').status, 'unsupported')
  assert.equal(resolver.resolve(rawDatId, 'content').status, 'unavailable')
  assert.equal(resolver.resolve(missingFormatId, 'content').status, 'unavailable')
  assert.equal(resolver.resolve(materializedDatId, 'content').status, 'unavailable')

  fs.writeFileSync(path.join(bundleRoot, 'media', `${imageId}.jpg`), Buffer.alloc(jpeg.length, 0x41))
  database.prepare('UPDATE artifacts SET materialized_content_sha256=? WHERE asset_id=?')
    .run(digest(Buffer.alloc(jpeg.length, 0x41)), imageId)
  assert.equal(resolver.resolve(imageId, 'content').status, 'unavailable')
})
