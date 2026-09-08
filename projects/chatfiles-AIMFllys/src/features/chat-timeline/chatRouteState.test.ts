import assert from 'node:assert/strict'
import test from 'node:test'

import * as chatRouteState from './chatRouteState.js'

const { parseChatRouteState, serializeChatRouteState } = chatRouteState

test('round-trips sender, day, query, and message UID through stable URL state', () => {
  const state = parseChatRouteState(new URLSearchParams(
    'sender=name%3A%E5%BC%A0%E4%B8%89&day=2026-07-13&q=%E4%B8%AD%E6%96%87&messageUid=%E6%B6%88%E6%81%AF-1',
  ))
  assert.deepEqual(state, {
    sender: 'name:张三', day: '2026-07-13', query: '中文', messageUid: '消息-1',
  })
  assert.equal(
    serializeChatRouteState(state).toString(),
    'q=%E4%B8%AD%E6%96%87&sender=name%3A%E5%BC%A0%E4%B8%89&day=2026-07-13&messageUid=%E6%B6%88%E6%81%AF-1',
  )
})

test('drops malformed or oversized chat route values instead of guessing', () => {
  const state = parseChatRouteState(new URLSearchParams({
    sender: 'x'.repeat(513), day: '2026-02-30', q: '问'.repeat(201), messageUid: 'bad\u0000uid',
  }))
  assert.deepEqual(state, { sender: '', day: '', query: '', messageUid: '' })
})

test('clears stale anchors when a sender or query filter changes', () => {
  const current = {
    conversationId: 'conv-a',
    state: { sender: 'sender-a', day: '2026-07-13', query: '旧查询', messageUid: 'message-a' },
  }
  assert.deepEqual(chatRouteState.patchChatRouteLocation(current, { sender: 'sender-b' }), {
    conversationId: 'conv-a',
    state: { sender: 'sender-b', day: '', query: '旧查询', messageUid: '' },
  })
  assert.deepEqual(chatRouteState.patchChatRouteLocation(current, { query: '新查询' }), {
    conversationId: 'conv-a',
    state: { sender: 'sender-a', day: '', query: '新查询', messageUid: '' },
  })
  assert.deepEqual(chatRouteState.patchChatRouteLocation(current, {
    sender: 'sender-b', day: '2026-07-14', messageUid: 'message-b',
  }), {
    conversationId: 'conv-a',
    state: { sender: 'sender-b', day: '2026-07-14', query: '旧查询', messageUid: 'message-b' },
  })
})

test('moves a citation to its conversation and message UID as one encoded URL', () => {
  type Location = {
    conversationId?: string
    state: ReturnType<typeof parseChatRouteState>
  }
  const api = chatRouteState as typeof chatRouteState & {
    emptyChatRouteState?: () => ReturnType<typeof parseChatRouteState>
    selectChatConversation?: (conversationId?: string) => Location
    patchChatRouteLocation?: (location: Location, patch: Partial<Location['state']>) => Location
    chatRouteUrl?: (location: Location) => string
  }
  assert.equal(typeof api.selectChatConversation, 'function')
  assert.equal(typeof api.patchChatRouteLocation, 'function')
  assert.equal(typeof api.chatRouteUrl, 'function')
  if (!api.selectChatConversation || !api.patchChatRouteLocation || !api.chatRouteUrl) return

  const selected = api.selectChatConversation('群/中文 空格')
  const cited = api.patchChatRouteLocation(selected, { messageUid: '消息/一' })
  assert.equal(
    api.chatRouteUrl(cited),
    '/chat/%E7%BE%A4%2F%E4%B8%AD%E6%96%87%20%E7%A9%BA%E6%A0%BC?messageUid=%E6%B6%88%E6%81%AF%2F%E4%B8%80',
  )
})
