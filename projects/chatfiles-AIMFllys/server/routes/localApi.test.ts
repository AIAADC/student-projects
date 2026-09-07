import assert from 'node:assert/strict'
import test from 'node:test'
import { withServer } from './wechatRouteTestFixtures.js'
import { createLocalApiRouter } from './localApi.js'
import { LocalAccessError, type LocalAccessService } from '../services/localAccess.js'

function service(): LocalAccessService {
  return {
    status: async () => ({ name: '午夜书斋本地只读接口', wechat: 'ready', artifacts: 'ready' }),
    conversations: async (input) => ({ conversations: [{ id: 'conv-a', display: `中文-${input.limit}` }] }),
    search: async () => ({ mode: 'keyword-only', hits: [] }),
    artifacts: async () => ({ artifacts: [] }),
    readDocument: async () => ({ assetId: 'a'.repeat(64), title: '说明.md', text: '正文', truncated: false }),
    messageContext: async () => ({ messages: [] }),
  }
}

test('protects all local routes with an optional constant-time bearer token', async () => {
  const router = createLocalApiRouter({ service: service(), token: 'local-secret' })
  await withServer(router, async (baseUrl) => {
    assert.equal((await fetch(`${baseUrl}/api/local/v1/status`)).status, 401)
    assert.equal((await fetch(`${baseUrl}/api/local/v1/status`, { headers: { authorization: 'Bearer wrong' } })).status, 401)
    const response = await fetch(`${baseUrl}/api/local/v1/status`, { headers: { authorization: 'Bearer local-secret' } })
    assert.equal(response.status, 200)
    const text = await response.text()
    assert.match(text, /午夜书斋/u)
    assert.doesNotMatch(text, /local-secret/u)
  })
})

test('serves bounded UTF-8 collections and rejects unknown parameters', async () => {
  const router = createLocalApiRouter({ service: service(), token: '' })
  await withServer(router, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/local/v1/conversations?query=${encodeURIComponent('中文')}&limit=100`)
    assert.equal(response.status, 200)
    assert.match(await response.text(), /中文-100/u)
    const invalid = await fetch(`${baseUrl}/api/local/v1/search?q=目标&rawPath=private`)
    assert.equal(invalid.status, 400)
    assert.deepEqual(await invalid.json(), { error: 'Request failed', code: 'invalid_local_request' })
  })
})

test('rejects invalid and out-of-range numeric query limits instead of clamping them', async () => {
  await withServer(createLocalApiRouter({ service: service() }), async (baseUrl) => {
    for (const value of ['-1', '0', '101', 'NaN', 'Infinity', '1.5']) {
      const response = await fetch(`${baseUrl}/api/local/v1/conversations?limit=${encodeURIComponent(value)}`)
      assert.equal(response.status, 400, value)
      assert.deepEqual(await response.json(), { error: 'Request failed', code: 'invalid_local_request' })
    }
  })
})

test('maps stable service errors without leaking internal details', async () => {
  const failing = service()
  failing.search = async () => { throw new LocalAccessError('database_unavailable') }
  await withServer(createLocalApiRouter({ service: failing }), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/local/v1/search?q=中文`)
    assert.equal(response.status, 503)
    assert.deepEqual(await response.json(), { error: 'Request failed', code: 'database_unavailable' })
  })
})

test('exposes artifacts, bounded document text, and message context through stable ID routes', async () => {
  await withServer(createLocalApiRouter({ service: service() }), async (baseUrl) => {
    const artifacts = await fetch(`${baseUrl}/api/local/v1/artifacts?q=说明&category=document&limit=20`)
    const document = await fetch(`${baseUrl}/api/local/v1/documents/${'a'.repeat(64)}?maxChars=50000`)
    const context = await fetch(`${baseUrl}/api/local/v1/messages/${encodeURIComponent('消息-一')}/context?radius=20`)
    assert.equal(artifacts.status, 200)
    assert.match(await document.text(), /说明\.md[\s\S]*正文/u)
    assert.equal(context.status, 200)
  })
})
