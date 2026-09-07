import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { DatabaseSync } from 'node:sqlite'
import { buildSearchIndex } from './buildSearchIndex.js'
import { readSearchMetadata } from './searchSchema.js'

function sourceDatabase() {
  const db = new DatabaseSync(':memory:')
  db.exec(`CREATE TABLE messages(
    conv_id TEXT, message_uid TEXT PRIMARY KEY, canonical_seq INTEGER,
    occurred_at_epoch_s INTEGER, time INTEGER, sender TEXT, sender_name TEXT, text TEXT
  )`)
  const insert = db.prepare('INSERT INTO messages VALUES(?,?,?,?,?,?,?,?)')
  for (let index = 0; index < 15; index += 1) {
    insert.run(
      'conv-a', `m-${String(14 - index).padStart(2, '0')}`, index, 100, 100,
      index % 2 ? 'u-b' : 'u-a', index % 2 ? '李四' : '张三', `顺序${index} `.repeat(40),
    )
  }
  return db
}

test('streams source messages into a validated keyword staging index and activates it', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chatfiles-search-build-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const sourceDb = sourceDatabase()
  t.after(() => sourceDb.close())
  const currentPath = path.join(root, 'ai-index.current.db')
  const stagingPath = path.join(root, 'ai-index.staging.db')
  fs.writeFileSync(currentPath, 'old-derived-index', 'utf8')
  const result = await buildSearchIndex({
    sourceDb, sourceFingerprint: 'source-fingerprint', currentPath, stagingPath,
  })
  assert.equal(result.mode, 'keyword-only')
  assert.ok(result.chunkCount >= 2)
  assert.equal(fs.existsSync(stagingPath), false)
  const opened = new DatabaseSync(currentPath, { readOnly: true })
  assert.equal(readSearchMetadata(opened)?.sourceFingerprint, 'source-fingerprint')
  assert.equal(readSearchMetadata(opened)?.chunkCount, result.chunkCount)
  const firstChunk = opened.prepare('SELECT first_message_uid,text FROM search_chunks ORDER BY id LIMIT 1')
    .get() as { first_message_uid: string; text: string }
  assert.equal(firstChunk.first_message_uid, 'm-14')
  assert.ok(firstChunk.text.indexOf('顺序0') < firstChunk.text.indexOf('顺序1'))
  opened.close()
})

test('validates embedding dimensions, leaves current untouched on failure, and never stores the key', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chatfiles-search-build-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const sourceDb = sourceDatabase()
  t.after(() => sourceDb.close())
  const currentPath = path.join(root, 'ai-index.current.db')
  const stagingPath = path.join(root, 'ai-index.staging.db')
  fs.writeFileSync(currentPath, 'known-current', 'utf8')
  await assert.rejects(buildSearchIndex({
    sourceDb, sourceFingerprint: 'fp', currentPath, stagingPath,
    embedding: { baseURL: 'https://example.test/v1', apiKey: 'fake-private-key', model: 'fixture', dimensions: 3, batchSize: 4 },
    fetchImpl: async () => Response.json({ data: [{ index: 0, embedding: [1, 0] }] }),
  }), /embedding_response_invalid/u)
  assert.equal(fs.readFileSync(currentPath, 'utf8'), 'known-current')
  assert.equal(fs.existsSync(stagingPath), false)

  const result = await buildSearchIndex({
    sourceDb, sourceFingerprint: 'fp', currentPath, stagingPath,
    embedding: { baseURL: 'https://example.test/v1', apiKey: 'fake-private-key', model: 'fixture', dimensions: 3, batchSize: 4 },
    fetchImpl: async (_url, init) => {
      const body = JSON.parse(String(init?.body)) as { input: string[] }
      return Response.json({ data: body.input.map((_, index) => ({ index, embedding: [1, index + 1, 0] })) })
    },
  })
  assert.equal(result.mode, 'hybrid')
  assert.doesNotMatch(JSON.stringify(result), /fake-private-key/u)
  assert.equal(fs.readFileSync(currentPath).includes(Buffer.from('fake-private-key')), false)
})

test('builds a stable legacy index when the validated legacy schema has no message_uid', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chatfiles-search-legacy-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const sourceDb = new DatabaseSync(':memory:')
  t.after(() => sourceDb.close())
  sourceDb.exec(`CREATE TABLE messages(
    conv_id TEXT,seq INTEGER,time INTEGER,sender TEXT,sender_name TEXT,
    type INTEGER,type_label TEXT,text TEXT
  ); INSERT INTO messages VALUES
    ('legacy-conv',7,100,'member','成员','1','text','旧版索引消息');`)
  const currentPath = path.join(root, 'ai-index.current.db')

  await buildSearchIndex({
    sourceDb,
    sourceFingerprint: 'legacy-source',
    currentPath,
    stagingPath: path.join(root, 'ai-index.staging.db'),
  })

  const index = new DatabaseSync(currentPath, { readOnly: true })
  try {
    const row = index.prepare('SELECT first_message_uid,first_sequence FROM search_chunks').get() as {
      first_message_uid: string
      first_sequence: number
    }
    assert.match(row.first_message_uid, /^legacy:/u)
    assert.equal(row.first_sequence, 7)
  } finally {
    index.close()
  }
})

test('chunks nullable legacy message identities in sequence order', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chatfiles-search-nullable-legacy-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const sourceDb = new DatabaseSync(':memory:')
  t.after(() => sourceDb.close())
  sourceDb.exec(`CREATE TABLE messages(
    conv_id TEXT,message_uid TEXT,seq INTEGER,time INTEGER,sender TEXT,sender_name TEXT,
    type INTEGER,type_label TEXT,text TEXT
  ); INSERT INTO messages VALUES
    ('legacy-conv',NULL,2,100,'member','成员',1,'text','第三条'),
    ('legacy-conv',NULL,0,100,'member','成员',1,'text','第一条'),
    ('legacy-conv',NULL,1,100,'member','成员',1,'text','第二条');`)
  const currentPath = path.join(root, 'ai-index.current.db')

  await buildSearchIndex({
    sourceDb,
    sourceFingerprint: 'nullable-legacy-source',
    currentPath,
    stagingPath: path.join(root, 'ai-index.staging.db'),
  })

  const index = new DatabaseSync(currentPath, { readOnly: true })
  try {
    const row = index.prepare('SELECT first_sequence,last_sequence FROM search_chunks').get() as {
      first_sequence: number
      last_sequence: number
    }
    assert.equal(row.first_sequence, 0)
    assert.equal(row.last_sequence, 2)
  } finally {
    index.close()
  }
})
