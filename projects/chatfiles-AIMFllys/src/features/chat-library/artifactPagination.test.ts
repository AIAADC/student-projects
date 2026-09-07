import assert from 'node:assert/strict'
import test from 'node:test'
import {
  canLoadMoreArtifacts,
  isArtifactPageRequestCurrent,
} from './artifactPagination.js'

test('rejects a load-more page after the active request scope changes', () => {
  const requestScope = '/api/wechat/conversation/旧会话/artifacts?tab=work&q=关键词&offset=0&limit=120'
  const changedScopes = [
    '/api/wechat/conversation/新会话/artifacts?tab=work&q=关键词&offset=0&limit=120',
    '/api/wechat/conversation/旧会话/artifacts?tab=document&q=关键词&offset=0&limit=120',
    '/api/wechat/conversation/旧会话/artifacts?tab=work&q=新查询&offset=0&limit=120',
  ]

  for (const activeScope of changedScopes) {
    assert.equal(isArtifactPageRequestCurrent(requestScope, activeScope), false)
  }
  assert.equal(isArtifactPageRequestCurrent(requestScope, requestScope), true)
})

test('keeps pagination retryable after a transient load-more failure', () => {
  assert.equal(canLoadMoreArtifacts({
    loading: false,
    loadingMore: false,
    loadMoreError: '无法继续载入素材',
    itemCount: 120,
    matchingTotal: 240,
  }), true)
})
