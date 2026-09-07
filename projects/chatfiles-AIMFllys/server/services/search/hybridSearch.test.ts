import assert from 'node:assert/strict'
import test from 'node:test'
import { DatabaseSync } from 'node:sqlite'
import { chineseNgrams } from './chunkMessages.js'
import { hybridSearch } from './hybridSearch.js'
import { createSearchSchema, insertSearchChunks } from './searchSchema.js'
import type { SearchChunk } from './searchTypes.js'
import { insertSearchVectors } from './vectorSearch.js'

function chunk(id: string, text: string): SearchChunk {
  return {
    chunkId: id, conversationId: 'conv', firstMessageUid: `${id}-first`, lastMessageUid: `${id}-last`,
    firstSequence: 0, lastSequence: 1,
    startTime: 1, endTime: 2, senderIds: ['u'], text, ngrams: chineseNgrams(text), tokenCount: 10,
  }
}

test('fuses keyword and vector results but falls back without suppressing FTS', () => {
  const db = new DatabaseSync(':memory:', { allowExtension: true })
  createSearchSchema(db, { sourceFingerprint: 'fp', embeddingModel: 'fixture', embeddingDimensions: 3 })
  insertSearchChunks(db, [chunk('keyword', '项目计划已经确认'), chunk('semantic', '另一个相关内容')])
  insertSearchVectors(db, { model: 'fixture', dimensions: 3, entries: [
    { chunkId: 'keyword', vector: [0.7, 0.3, 0] }, { chunkId: 'semantic', vector: [1, 0, 0] },
  ] })
  const hybrid = hybridSearch(db, {
    query: '项目计划', queryVector: [1, 0, 0], embeddingModel: 'fixture', embeddingDimensions: 3, limit: 10,
  })
  assert.equal(hybrid.mode, 'hybrid')
  assert.deepEqual(hybrid.hits.map((hit) => hit.chunkId).sort(), ['keyword', 'semantic'])
  const fallback = hybridSearch(db, {
    query: '项目计划', queryVector: [1, 0, 0], embeddingModel: 'fixture', embeddingDimensions: 3, limit: 10,
  }, () => { throw new Error('extension missing') })
  assert.equal(fallback.mode, 'keyword-only')
  assert.equal(fallback.reason, 'vector_unavailable')
  assert.deepEqual(fallback.hits.map((hit) => hit.chunkId), ['keyword'])
  const mismatch = hybridSearch(db, {
    query: '项目计划', queryVector: [1, 0, 0], embeddingModel: 'other', embeddingDimensions: 3, limit: 10,
  })
  assert.equal(mismatch.mode, 'keyword-only')
  assert.equal(mismatch.reason, 'embedding_mismatch')
  db.close()
})
