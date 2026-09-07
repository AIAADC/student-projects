import assert from 'node:assert/strict'
import test from 'node:test'
import { DatabaseSync } from 'node:sqlite'
import { chineseNgrams } from './chunkMessages.js'
import { keywordSearch } from './keywordSearch.js'
import { createSearchSchema, insertSearchChunks } from './searchSchema.js'
import type { SearchChunk } from './searchTypes.js'

function chunk(input: Partial<SearchChunk> & Pick<SearchChunk, 'chunkId' | 'text'>): SearchChunk {
  return {
    conversationId: 'conv-a', firstMessageUid: 'm-start', lastMessageUid: 'm-end',
    firstSequence: 0, lastSequence: 1,
    startTime: 100, endTime: 120, senderIds: ['u-a'], tokenCount: 20,
    ngrams: chineseNgrams(input.text), ...input,
  }
}

test('combines exact and FTS Chinese matches while treating wildcard characters literally', () => {
  const db = new DatabaseSync(':memory:')
  createSearchSchema(db, { sourceFingerprint: 'fp' })
  insertSearchChunks(db, [
    chunk({ chunkId: 'exact', text: '季度_计划% 已确认，详情见 example.com' }),
    chunk({ chunkId: 'related', text: '季度计划仍需讨论' }),
    chunk({ chunkId: 'other', text: '完全无关的内容' }),
  ])
  const literal = keywordSearch(db, { query: '季度_计划%', limit: 10 })
  assert.equal(literal[0]?.chunkId, 'exact')
  assert.equal(literal[0]?.source, 'exact')
  assert.equal(literal.some((hit) => hit.chunkId === 'other'), false)
  const chinese = keywordSearch(db, { query: '季度计划', limit: 10 })
  assert.deepEqual(chinese.map((hit) => hit.chunkId).sort(), ['exact', 'related'])
  db.close()
})

test('matches stable identifiers and applies conversation, sender, and date filters', () => {
  const db = new DatabaseSync(':memory:')
  createSearchSchema(db, { sourceFingerprint: 'fp' })
  insertSearchChunks(db, [
    chunk({ chunkId: 'a', text: '第一条证据', lastMessageUid: 'message-anchor', senderIds: ['u-a'] }),
    chunk({ chunkId: 'b', text: '第二条证据', conversationId: 'conv-b', startTime: 300, endTime: 320, senderIds: ['u-b'] }),
  ])
  assert.equal(keywordSearch(db, { query: 'message-anchor', limit: 5 })[0]?.chunkId, 'a')
  assert.deepEqual(keywordSearch(db, {
    query: '证据', filters: { conversationId: 'conv-b', sender: 'u-b', after: 250, before: 350 }, limit: 5,
  }).map((hit) => hit.chunkId), ['b'])
  assert.deepEqual(keywordSearch(db, {
    query: '证据', filters: { conversationId: 'conv-b', sender: 'u-a' }, limit: 5,
  }), [])
  db.close()
})

test('uses chunk_id before the candidate limit when sequence and relevance are tied', () => {
  const db = new DatabaseSync(':memory:')
  createSearchSchema(db, { sourceFingerprint: 'fp' })
  insertSearchChunks(db, ['z', 'y', 'x', 'w', 'a'].map((chunkId) => chunk({
    chunkId,
    text: '共同命中词',
    firstSequence: 5,
    lastSequence: 5,
    startTime: 100,
    endTime: 100,
  })))

  assert.equal(keywordSearch(db, { query: '共同命中词', limit: 1 })[0]?.chunkId, 'a')
  db.close()
})
