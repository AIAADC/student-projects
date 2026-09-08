import assert from 'node:assert/strict'
import test from 'node:test'
import { DatabaseSync } from 'node:sqlite'
import { createSearchSchema, insertSearchChunks } from './searchSchema.js'
import type { SearchChunk } from './searchTypes.js'
import { insertSearchVectors, vectorSearch } from './vectorSearch.js'

function chunk(id: string, conversationId: string, sender: string, time: number): SearchChunk {
  return {
    chunkId: id, conversationId, firstMessageUid: `${id}-first`, lastMessageUid: `${id}-last`,
    firstSequence: time, lastSequence: time + 1,
    startTime: time, endTime: time + 5, senderIds: [sender], text: `向量证据 ${id}`,
    ngrams: '向量 证据', tokenCount: 20,
  }
}

test('orders deterministic cosine vectors and applies scope filters', () => {
  const db = new DatabaseSync(':memory:', { allowExtension: true })
  createSearchSchema(db, { sourceFingerprint: 'fp', embeddingModel: 'fixture', embeddingDimensions: 3 })
  insertSearchChunks(db, [chunk('a', 'conv-a', 'u-a', 100), chunk('b', 'conv-a', 'u-b', 200), chunk('c', 'conv-b', 'u-a', 300)])
  insertSearchVectors(db, { model: 'fixture', dimensions: 3, entries: [
    { chunkId: 'a', vector: [1, 0, 0] }, { chunkId: 'b', vector: [0.8, 0.2, 0] },
    { chunkId: 'c', vector: [-1, 0, 0] },
  ] })
  const all = vectorSearch(db, [1, 0, 0], { limit: 3 })
  assert.equal(all.available, true)
  assert.deepEqual(all.hits.map((hit) => hit.chunkId), ['a', 'b', 'c'])
  const filtered = vectorSearch(db, [1, 0, 0], {
    limit: 3, filters: { conversationId: 'conv-a', sender: 'u-b', after: 150, before: 250 },
  })
  assert.deepEqual(filtered.hits.map((hit) => hit.chunkId), ['b'])
  db.close()
})

test('rejects vector dimension mismatches and reports extension failure explicitly', () => {
  const db = new DatabaseSync(':memory:', { allowExtension: true })
  createSearchSchema(db, { sourceFingerprint: 'fp', embeddingModel: 'fixture', embeddingDimensions: 3 })
  assert.throws(() => insertSearchVectors(db, {
    model: 'fixture', dimensions: 2, entries: [],
  }), /embedding_mismatch/u)
  const unavailable = vectorSearch(db, [1, 0, 0], { limit: 3 }, () => { throw new Error('missing') })
  assert.deepEqual(unavailable, { available: false, hits: [], reason: 'vector_unavailable' })
  db.close()
})
