import assert from 'node:assert/strict'
import test from 'node:test'
import { reciprocalRankFusion } from './rankFusion.js'
import type { RankedSearchHit } from './searchTypes.js'

function hit(chunkId: string, rank: number, source: 'keyword' | 'vector'): RankedSearchHit {
  return {
    chunkId, rank, source, score: 1, conversationId: 'conv', firstMessageUid: `${chunkId}-a`,
    lastMessageUid: `${chunkId}-b`, firstSequence: 0, lastSequence: 1,
    startTime: 1, endTime: 2, senderIds: [], text: chunkId,
    ngrams: chunkId, tokenCount: 1,
  }
}

test('fuses duplicate ranks deterministically and uses chunk ID as the final tie-breaker', () => {
  const fused = reciprocalRankFusion([
    [hit('shared', 1, 'keyword'), hit('only-keyword', 2, 'keyword')],
    [hit('shared', 2, 'vector'), hit('only-vector', 1, 'vector')],
  ], { k: 60, limit: 10 })
  assert.deepEqual(fused.map((item) => item.chunkId), ['shared', 'only-vector', 'only-keyword'])
  assert.equal(fused[0]?.source, 'hybrid')
  assert.equal(new Set(fused.map((item) => item.chunkId)).size, 3)
  const tie = reciprocalRankFusion([[hit('z', 1, 'keyword')], [hit('a', 1, 'vector')]], { k: 60, limit: 10 })
  assert.deepEqual(tie.map((item) => item.chunkId), ['a', 'z'])
})
