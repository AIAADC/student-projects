import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { DatabaseSync } from 'node:sqlite'

import { createRuntimeSearch } from './searchRuntime.js'

test('rejects a same-fingerprint v1 index and falls back to canonical live search', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chatfiles-search-runtime-'))
  t.after(() => fs.rmSync(root, { force: true, recursive: true }))
  const indexPath = path.join(root, 'data', 'ai-index.current.db')
  fs.mkdirSync(path.dirname(indexPath), { recursive: true })
  const oldIndex = new DatabaseSync(indexPath)
  oldIndex.exec(`
    CREATE TABLE search_metadata(
      singleton INTEGER,schema_version INTEGER,source_fingerprint TEXT,chunk_count INTEGER,
      embedding_model TEXT,embedding_dimensions INTEGER
    );
    CREATE TABLE search_chunks(
      id INTEGER,chunk_id TEXT,conversation_id TEXT,first_message_uid TEXT,last_message_uid TEXT,
      start_time INTEGER,end_time INTEGER,sender_ids TEXT,text TEXT,ngrams TEXT,token_count INTEGER
    );
    INSERT INTO search_metadata VALUES(1,1,'same-fingerprint',0,NULL,NULL);
  `)
  oldIndex.close()
  const wechat = new DatabaseSync(':memory:')
  t.after(() => wechat.close())
  wechat.exec(`CREATE TABLE messages(
    conv_id TEXT,message_uid TEXT,canonical_seq INTEGER,occurred_at_epoch_s INTEGER,
    time INTEGER,sender TEXT,sender_name TEXT,text TEXT
  ); INSERT INTO messages VALUES('conv','uid-live',0,100,100,'u','成员','实时证据');`)
  const search = createRuntimeSearch({
    wechatDb: wechat,
    projectRoot: root,
    sourceFingerprint: 'same-fingerprint',
    config: {
      baseURL: 'https://example.test/v1', apiKey: '', model: 'fixture', temperature: 0,
      contextWindow: 128_000, contextStrategy: 'recent',
      embedding: {
        enabled: false, baseURL: 'https://example.test/v1', apiKey: '', model: 'fixture',
        dimensions: 3, batchSize: 4,
      },
    },
  })
  t.after(() => search.close())

  const result = await search.search({ query: '实时', limit: 10 })

  assert.deepEqual(result.hits.map((hit) => hit.firstMessageUid), ['uid-live'])
  assert.equal(result.reason, 'not_configured')
})
