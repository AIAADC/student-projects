import assert from 'node:assert/strict'
import test from 'node:test'

import { apiEndpoints } from './endpoints.js'

test('builds encoded v1 timeline and facet URLs from one catalog', () => {
  assert.equal(
    apiEndpoints.timeline('群/中文', { limit: 120, query: '100% 完成', sender: 'name:张三', aroundUid: '消息/一' }),
    '/api/v1/chat/conversations/%E7%BE%A4%2F%E4%B8%AD%E6%96%87/timeline?limit=120&q=100%25+%E5%AE%8C%E6%88%90&sender=name%3A%E5%BC%A0%E4%B8%89&aroundUid=%E6%B6%88%E6%81%AF%2F%E4%B8%80',
  )
  assert.equal(
    apiEndpoints.timelineDays('conv-a', { limit: 90, before: '2026-07-13' }),
    '/api/v1/chat/conversations/conv-a/timeline/days?limit=90&before=2026-07-13',
  )
  assert.equal(
    apiEndpoints.timelineParticipants('conv-a', '中文'),
    '/api/v1/chat/conversations/conv-a/timeline/participants?q=%E4%B8%AD%E6%96%87',
  )
})

test('builds versioned artifact and evidence URLs without component string assembly', () => {
  assert.equal(apiEndpoints.artifacts({
    conversationId: '群/中文',tab: 'document',query: '资料',offset: 0,limit: 60,
  }), '/api/v1/chat/conversations/%E7%BE%A4%2F%E4%B8%AD%E6%96%87/artifacts?tab=document&q=%E8%B5%84%E6%96%99&offset=0&limit=60')
  assert.equal(apiEndpoints.artifactMetadata('a/b'), '/api/v1/chat/artifacts/a%2Fb/metadata')
  assert.equal(apiEndpoints.artifactThumbnail('a/b', 360), '/api/v1/chat/artifacts/a%2Fb/thumbnail?w=360')
  assert.equal(apiEndpoints.artifactLinkPreview('a/b'), '/api/v1/chat/artifacts/a%2Fb/link-preview')
})

test('builds every file capability URL from one scoped v1 endpoint', () => {
  assert.equal(
    apiEndpoints.fileCapability('artifact', 'a/b', 'inspect'),
    '/api/v1/files/artifact/a%2Fb/inspect',
  )
  assert.equal(
    apiEndpoints.fileThumbnail('source', '中文 文件', 480),
    '/api/v1/files/source/%E4%B8%AD%E6%96%87%20%E6%96%87%E4%BB%B6/thumb?w=480',
  )
  assert.equal(
    apiEndpoints.fileContent('archive', 'file-1'),
    '/api/v1/files/archive/file-1/content',
  )
})
