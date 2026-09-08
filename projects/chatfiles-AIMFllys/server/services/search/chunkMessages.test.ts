import assert from 'node:assert/strict'
import test from 'node:test'
import { chunkMessages, chineseNgrams } from './chunkMessages.js'

test('builds stable 500-800 token chunks with an eighty-token overlap and UID bounds', () => {
  const messages = Array.from({ length: 14 }, (_, index) => ({
    conversationId: 'conv-a',
    messageUid: `m-${String(index + 1).padStart(2, '0')}`,
    sequence: index,
    time: 1_700_000_000 + index,
    sender: index % 2 ? 'u-b' : 'u-a',
    senderName: index % 2 ? '李四' : '张三',
    text: '中文检索'.repeat(25),
  }))
  const chunks = chunkMessages(messages)
  assert.ok(chunks.length >= 2)
  assert.ok(chunks.every((chunk) => chunk.tokenCount >= 500 && chunk.tokenCount <= 800))
  assert.equal(chunks[0]?.firstMessageUid, 'm-01')
  assert.equal(chunks[0]?.lastMessageUid, chunks[1]?.firstMessageUid)
  assert.equal(chunks[0]?.firstSequence, 0)
  assert.equal(chunks[0]?.lastSequence, chunks[1]?.firstSequence)
  assert.match(chunks[0]?.ngrams ?? '', /中文/u)
  assert.equal(new Set(chunks.map((chunk) => chunk.chunkId)).size, chunks.length)
})

test('splits an oversized message at Unicode code-point boundaries', () => {
  const chunks = chunkMessages([{
    conversationId: 'conv-long', messageUid: 'm-long', time: 1,
    sequence: 7,
    sender: 'u', senderName: '名字', text: `${'汉'.repeat(900)}🙂`,
  }])
  assert.ok(chunks.length >= 2)
  assert.ok(chunks.every((chunk) => chunk.tokenCount <= 800))
  assert.ok(chunks.every((chunk) => !chunk.text.includes('\ufffd')))
  assert.ok(chunks.every((chunk) => chunk.firstMessageUid === 'm-long' && chunk.lastMessageUid === 'm-long'))
  assert.ok(chunks.every((chunk) => chunk.firstSequence === 7 && chunk.lastSequence === 7))
})

test('creates deterministic Chinese bigrams and trigrams without damaging Latin identifiers', () => {
  const terms = chineseNgrams('午夜书斋 ChatFiles message_uid')
  assert.match(terms, /午夜 夜书 书斋 午夜书 夜书斋/u)
  assert.match(terms, /chatfiles message_uid/u)
})
