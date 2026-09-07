import assert from 'node:assert/strict'
import test from 'node:test'
import {
  orderConversationsPinnedFirst,
  parsePinnedConversationIds,
  serializePinnedConversationIds,
  togglePinnedConversation,
} from './pins.js'

test('restores unique pins in saved order and prunes missing conversations', () => {
  const saved = JSON.stringify({ version: 1, ids: ['conv-b', 'conv-a', 'conv-b', 'missing'] })
  assert.deepEqual(parsePinnedConversationIds(saved, new Set(['conv-a', 'conv-b'])), ['conv-b', 'conv-a'])
})

test('rejects malformed and unsupported pin payloads', () => {
  const validIds = new Set(['conv-a'])
  assert.deepEqual(parsePinnedConversationIds('{broken', validIds), [])
  assert.deepEqual(parsePinnedConversationIds(JSON.stringify({ version: 2, ids: ['conv-a'] }), validIds), [])
  assert.deepEqual(parsePinnedConversationIds(JSON.stringify({ version: 1, ids: 'conv-a' }), validIds), [])
})

test('toggles pins without changing the order of other conversations', () => {
  assert.deepEqual(togglePinnedConversation(['conv-a', 'conv-b'], 'conv-c'), ['conv-a', 'conv-b', 'conv-c'])
  assert.deepEqual(togglePinnedConversation(['conv-a', 'conv-b', 'conv-c'], 'conv-b'), ['conv-a', 'conv-c'])
})

test('serializes a versioned payload', () => {
  assert.equal(serializePinnedConversationIds(['conv-a']), '{"version":1,"ids":["conv-a"]}')
})

test('orders pinned conversations first without duplicating or disturbing recency', () => {
  const conversations = [
    { id: 'newest', last_time: 300 },
    { id: 'pinned-old', last_time: 100 },
    { id: 'middle', last_time: 200 },
    { id: 'pinned-new', last_time: 250 },
  ]

  assert.deepEqual(
    orderConversationsPinnedFirst(conversations, ['pinned-old', 'pinned-new']).map((item) => item.id),
    ['pinned-new', 'pinned-old', 'newest', 'middle'],
  )
})
