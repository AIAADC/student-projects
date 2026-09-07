import assert from 'node:assert/strict'
import test from 'node:test'

import * as navigation from './navigation.js'

const {
  chatConversationPath,
  pathForTab,
  tabForPath,
} = navigation

test('maps every legacy destination onto one stable URL', () => {
  assert.deepEqual({
    overview: pathForTab('overview'),
    files: pathForTab('files'),
    insights: pathForTab('insights'),
    academics: pathForTab('academics'),
    media: pathForTab('media'),
    knowledge: pathForTab('knowledge'),
    summary: pathForTab('summary'),
    clues: pathForTab('clues'),
    synthesis: pathForTab('synthesis'),
    databases: pathForTab('databases'),
    candidates: pathForTab('candidates'),
    ai: pathForTab('ai'),
  }, {
    overview: '/',
    files: '/files',
    insights: '/insights',
    academics: '/academics',
    media: '/media',
    knowledge: '/knowledge',
    summary: '/settings/summary',
    clues: '/settings/clues',
    synthesis: '/settings/synthesis',
    databases: '/settings/databases',
    candidates: '/settings/candidates',
    ai: '/settings/ai',
  })
  assert.equal(pathForTab('chat'), '/chat')
})

test('encodes conversation IDs and resolves active navigation from deep links', () => {
  assert.equal(chatConversationPath('群/中文 空格'), '/chat/%E7%BE%A4%2F%E4%B8%AD%E6%96%87%20%E7%A9%BA%E6%A0%BC')
  assert.equal(tabForPath('/chat/conv-a'), 'chat')
  assert.equal(tabForPath('/settings/databases'), 'databases')
  assert.equal(tabForPath('/unknown'), 'overview')
})

test('keeps the shell navigation aligned when a browser preserves a trailing slash', () => {
  assert.equal(tabForPath('/files/'), 'files')
  assert.equal(tabForPath('/settings/ai/'), 'ai')
  assert.equal(tabForPath('/chat/'), 'chat')
})

test('matches the case-insensitive path behavior used by React Router', () => {
  assert.equal(tabForPath('/FILES'), 'files')
  assert.equal(tabForPath('/Settings/AI'), 'ai')
  assert.equal(tabForPath('/CHAT/conv-a'), 'chat')
})

test('declares every browser route once for the Router/Outlet composition', () => {
  const routes = (navigation as typeof navigation & {
    APP_ROUTES?: ReadonlyArray<{ page: string; path: string }>
  }).APP_ROUTES
  assert.ok(routes, 'APP_ROUTES must be exported')
  assert.deepEqual(routes, [
    { page: 'overview', path: '/' },
    { page: 'chat', path: '/chat' },
    { page: 'chat', path: '/chat/:conversationId' },
    { page: 'files', path: '/files' },
    { page: 'insights', path: '/insights' },
    { page: 'academics', path: '/academics' },
    { page: 'media', path: '/media' },
    { page: 'knowledge', path: '/knowledge' },
    { page: 'summary', path: '/settings/summary' },
    { page: 'clues', path: '/settings/clues' },
    { page: 'synthesis', path: '/settings/synthesis' },
    { page: 'databases', path: '/settings/databases' },
    { page: 'candidates', path: '/settings/candidates' },
    { page: 'ai', path: '/settings/ai' },
  ])
})
