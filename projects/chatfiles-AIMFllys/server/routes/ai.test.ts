import assert from 'node:assert/strict'
import test from 'node:test'

import { withServer } from './wechatRouteTestFixtures.js'
import { createAiRouter } from './ai.js'

test('streams through the injected shared OpenAI upstream without a transcript route', async () => {
  let received: unknown
  const router = createAiRouter({
    async streamChat(config, messages) {
      received = { config, messages }
      return new Response('data: 中文\n\n').body!
    },
  })
  await withServer(router, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/ai/chat`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        baseURL: 'https://example.test/v1/', apiKey: 'request-key', model: 'fixture',
        messages: [{ role: 'user', content: '中文问题' }], temperature: 0.4,
      }),
    })
    assert.equal(response.status, 200)
    assert.equal(await response.text(), 'data: 中文\n\n')
    assert.match(JSON.stringify(received), /中文问题/u)
    assert.doesNotMatch(JSON.stringify(received), /chat\/completions/u)
    assert.equal((await fetch(`${baseUrl}/api/wechat/conversation/conv/transcript`)).status, 404)
  })
})

test('rejects invalid proxy bodies and sanitizes upstream failures', async () => {
  const router = createAiRouter({ streamChat: async () => { throw new Error('C:\\private\\secret') } })
  await withServer(router, async (baseUrl) => {
    for (const body of [
      {},
      { baseURL: 'file:///private', apiKey: '', model: 'x', messages: [] },
      { baseURL: 'https://user:pass@example.test', apiKey: '', model: 'x', messages: [] },
      { baseURL: 'https://example.test', apiKey: '', model: '', messages: [] },
    ]) {
      const response = await fetch(`${baseUrl}/api/ai/chat`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
      })
      assert.equal(response.status, 400)
      assert.deepEqual(await response.json(), { error: 'Request failed', code: 'invalid_ai_request' })
    }
    const failed = await fetch(`${baseUrl}/api/ai/chat`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ baseURL: 'https://example.test', apiKey: '', model: 'x', messages: [] }),
    })
    assert.equal(failed.status, 502)
    const text = await failed.text()
    assert.match(text, /upstream_failed/u)
    assert.doesNotMatch(text, /private|secret/u)
  })
})
