import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'
import { MINIMAL_JPEG_HEX } from '../../shared/media/mediaMagicFixtures.js'
import { materializeConversationDatAssets } from './conversationDatBundle.js'

const KEY = Buffer.from('0123456789abcdef', 'ascii')

function sha256(bytes: Uint8Array) {
  return `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`
}

function encodeV2(content: Buffer) {
  const aesSize = Math.min(content.length, 17)
  const xorSize = 3
  const prefix = content.subarray(0, aesSize)
  const padding = Math.ceil(prefix.length / 16) * 16 - prefix.length
  const padded = padding ? Buffer.concat([prefix, Buffer.alloc(padding, padding)]) : prefix
  const cipher = crypto.createCipheriv('aes-128-ecb', KEY, null)
  cipher.setAutoPadding(false)
  const header = Buffer.alloc(15)
  Buffer.from([0x07, 0x08, 0x56, 0x32, 0x08, 0x07]).copy(header)
  header.writeUInt32LE(aesSize, 6)
  header.writeUInt32LE(xorSize, 10)
  return Buffer.concat([
    header,
    cipher.update(padded), cipher.final(),
    content.subarray(aesSize, content.length - xorSize),
    Buffer.from(content.subarray(content.length - xorSize).map((value) => value ^ 0x88)),
  ])
}

function fixtureDatabase() {
  const database = new DatabaseSync(':memory:')
  database.exec(`
    CREATE TABLE asset_sources(
      source_id TEXT PRIMARY KEY,source_kind TEXT,source_relative_path TEXT,source_size INTEGER,
      source_content_sha256 TEXT,presence TEXT
    );
    CREATE TABLE asset_associations(
      association_id TEXT PRIMARY KEY,source_id TEXT,association_status TEXT,
      confirmation_status TEXT,quarantined INTEGER
    );
    CREATE TABLE assets(asset_id TEXT PRIMARY KEY,association_id TEXT,preview TEXT);
    CREATE TABLE asset_materializations(
      source_id TEXT PRIMARY KEY,asset_id TEXT,status TEXT,preview_status TEXT,failure_reason TEXT,
      materialized_relative_path TEXT,materialized_size INTEGER,
      materialized_content_sha256 TEXT,media_format TEXT
    );
  `)
  return database
}

function insertAsset(database: DatabaseSync, input: {
  id: string
  relativePath: string | null
  bytes?: Uint8Array
  sourceSize?: number
  sourceContentSha256?: string
  confirmed?: boolean
  preview?: string
}) {
  const sourceId = `source-${input.id[0]}`
  const associationId = `association-${input.id[0]}`
  const bytes = input.bytes ?? null
  const sourceSize = bytes?.length ?? input.sourceSize ?? null
  const sourceDigest = bytes ? sha256(bytes) : input.sourceContentSha256 ?? null
  database.prepare('INSERT INTO asset_sources VALUES(?,?,?,?,?,?)').run(
    sourceId,'resource',input.relativePath,sourceSize,sourceDigest,
    sourceSize === null ? 'missing' : 'present',
  )
  database.prepare('INSERT INTO asset_associations VALUES(?,?,?,?,?)').run(
    associationId,sourceId,'exact',input.confirmed === false ? 'unconfirmed' : 'confirmed',
    input.confirmed === false ? 1 : 0,
  )
  database.prepare('INSERT INTO assets VALUES(?,?,?)').run(input.id, associationId, input.preview ?? 'image')
  database.prepare('INSERT INTO asset_materializations VALUES(?,?,?,?,?,?,?,?,?)').run(
    sourceId,input.id,'not_attempted','unavailable','encrypted_wechat_dat_requires_materialization',
    null,null,null,null,
  )
}

test('materializes only confirmed dat assets and records verified output evidence', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chatfiles-dat-bundle-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const accountRoot = path.join(root, 'account')
  const bundleDir = path.join(root, 'chat-assets.next')
  fs.mkdirSync(path.join(accountRoot, 'attach'), { recursive: true })
  fs.mkdirSync(bundleDir)
  const jpeg = Buffer.from(MINIMAL_JPEG_HEX, 'hex')
  const encoded = encodeV2(jpeg)
  fs.writeFileSync(path.join(accountRoot, 'attach', 'image.dat'), encoded)
  fs.writeFileSync(path.join(accountRoot, 'attach', 'quarantine.dat'), encoded)
  const database = fixtureDatabase()
  t.after(() => database.close())
  insertAsset(database, { id: 'a'.repeat(64), relativePath: 'attach/image.dat', bytes: encoded })
  insertAsset(database, {
    id: 'b'.repeat(64), relativePath: 'attach/quarantine.dat', bytes: encoded, confirmed: false,
  })
  const supplied = Buffer.from(KEY)

  const summary = await materializeConversationDatAssets({
    assetDb: database,
    accountRoot,
    bundleDir,
    keyProvider: { provide: async () => supplied },
    concurrency: 2,
  })

  assert.deepEqual(summary, { attempted: 1, ready: 1, failed: 0 })
  assert.deepEqual(supplied, Buffer.alloc(16))
  const row = database.prepare(`
    SELECT status,preview_status,failure_reason,materialized_relative_path,
           materialized_size,materialized_content_sha256,media_format
    FROM asset_materializations WHERE asset_id=?
  `).get('a'.repeat(64))
  assert.deepEqual({ ...row }, {
    status: 'ready', preview_status: 'ready', failure_reason: null,
    materialized_relative_path: `media/${'a'.repeat(64)}.jpg`,
    materialized_size: jpeg.length, materialized_content_sha256: sha256(jpeg), media_format: 'jpeg',
  })
  assert.equal(database.prepare(
    'SELECT status FROM asset_materializations WHERE asset_id=?',
  ).get('b'.repeat(64))?.status, 'not_attempted')

  const materializedPath = path.join(bundleDir, 'media', `${'a'.repeat(64)}.jpg`)
  fs.writeFileSync(materializedPath, Buffer.alloc(jpeg.length, 0x41))
  const repairKey = Buffer.from(KEY)
  assert.deepEqual(await materializeConversationDatAssets({
    assetDb: database,accountRoot,bundleDir,
    keyProvider: { provide: async () => repairKey },concurrency: 1,
  }), { attempted: 1,ready: 1,failed: 0 })
  assert.deepEqual(fs.readFileSync(materializedPath), jpeg)
  assert.deepEqual(repairKey, Buffer.alloc(16))

  const replaced = Buffer.from(encoded)
  replaced[replaced.length - 1] ^= 0x01
  fs.writeFileSync(path.join(accountRoot, 'attach', 'image.dat'), replaced)
  assert.deepEqual(await materializeConversationDatAssets({
    assetDb: database,accountRoot,bundleDir,
    keyProvider: { provide: async () => null },concurrency: 1,
  }), { attempted: 1,ready: 0,failed: 1 })
  assert.deepEqual({ ...database.prepare(`
    SELECT m.status,s.presence FROM asset_materializations m
    JOIN asset_sources s ON s.source_id=m.source_id WHERE m.asset_id=?
  `).get('a'.repeat(64)) }, { status: 'not_attempted',presence: 'content_mismatch' })
})

test('keeps a decoded image for a video message as thumbnail-only', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chatfiles-dat-video-thumb-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const accountRoot = path.join(root, 'account')
  const bundleDir = path.join(root, 'chat-assets.next')
  fs.mkdirSync(path.join(accountRoot, 'attach'), { recursive: true })
  fs.mkdirSync(bundleDir)
  const poster = Buffer.from(MINIMAL_JPEG_HEX, 'hex')
  const encoded = encodeV2(poster)
  fs.writeFileSync(path.join(accountRoot, 'attach', 'video.dat'), encoded)
  const database = fixtureDatabase()
  t.after(() => database.close())
  insertAsset(database, {
    id: 'e'.repeat(64),relativePath: 'attach/video.dat',bytes: encoded,preview: 'video',
  })

  const options = {
    assetDb: database,accountRoot,bundleDir,
    keyProvider: { provide: async () => Buffer.from(KEY) },concurrency: 1,
  }
  await materializeConversationDatAssets(options)
  assert.deepEqual({ ...database.prepare(`
    SELECT status,preview_status,media_format FROM asset_materializations
  `).get() }, { status: 'thumbnail_only',preview_status: 'thumbnail_only',media_format: 'jpeg' })
  assert.deepEqual(await materializeConversationDatAssets(options), { attempted: 0,ready: 0,failed: 0 })
})

test('distinguishes missing and same-size changed sources without reading outside the account root', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chatfiles-dat-source-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const accountRoot = path.join(root, 'account')
  const bundleDir = path.join(root, 'chat-assets.next')
  fs.mkdirSync(path.join(accountRoot, 'attach'), { recursive: true })
  fs.mkdirSync(bundleDir)
  const original = Buffer.from('same-size-original')
  const changed = Buffer.from('same-size-replaced')
  assert.equal(original.length, changed.length)
  fs.writeFileSync(path.join(accountRoot, 'attach', 'changed.dat'), changed)
  const database = fixtureDatabase()
  t.after(() => database.close())
  insertAsset(database, { id: 'c'.repeat(64), relativePath: 'attach/missing.dat' })
  insertAsset(database, { id: 'd'.repeat(64), relativePath: 'attach/changed.dat', bytes: original })

  const summary = await materializeConversationDatAssets({
    assetDb: database,accountRoot,bundleDir,keyProvider: { provide: async () => KEY },concurrency: 1,
  })
  assert.deepEqual(summary, { attempted: 2, ready: 0, failed: 2 })
  const rows = database.prepare(`
    SELECT m.asset_id,m.status,s.presence FROM asset_materializations m
    JOIN asset_sources s ON s.source_id=m.source_id ORDER BY m.asset_id
  `).all().map((row) => ({ ...row }))
  assert.deepEqual(rows, [
    { asset_id: 'c'.repeat(64), status: 'source_missing',presence: 'missing' },
    { asset_id: 'd'.repeat(64), status: 'not_attempted',presence: 'content_mismatch' },
  ])
})

test('rejects an oversized dat before reading it into memory', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chatfiles-dat-limit-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const accountRoot = path.join(root, 'account')
  const bundleDir = path.join(root, 'chat-assets.next')
  fs.mkdirSync(path.join(accountRoot, 'attach'), { recursive: true })
  fs.mkdirSync(bundleDir)
  const filename = path.join(accountRoot, 'attach', 'oversized.dat')
  fs.writeFileSync(filename, Buffer.alloc(2_048))
  const database = fixtureDatabase()
  t.after(() => database.close())
  insertAsset(database, {
    id: 'f'.repeat(64),relativePath: 'attach/oversized.dat',sourceSize: 2_048,
    sourceContentSha256: `sha256:${'0'.repeat(64)}`,
  })

  assert.deepEqual(await materializeConversationDatAssets({
    assetDb: database,accountRoot,bundleDir,keyProvider: { provide: async () => KEY },
    concurrency: 1,maxSourceBytes: 1_024,
  }), { attempted: 1,ready: 0,failed: 1 })
  assert.deepEqual({ ...database.prepare(`
    SELECT m.status,m.failure_reason,s.presence FROM asset_materializations m
    JOIN asset_sources s ON s.source_id=m.source_id
  `).get() }, {
    status: 'not_attempted',failure_reason: 'source_size_limit_exceeded',presence: 'oversized',
  })
})
