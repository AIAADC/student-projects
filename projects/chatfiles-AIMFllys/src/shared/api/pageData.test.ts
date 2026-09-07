import assert from 'node:assert/strict'
import test from 'node:test'
import { z } from 'zod/v4'

import { initialPageData, loadPageData } from './pageData.js'

const schema = z.object({ value: z.string(), state: z.enum(['ready', 'stale']).optional() })
const fallback = { value: 'fallback' }

function response(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}

test('starts in loading and distinguishes ready and stale responses', async () => {
  assert.deepEqual(initialPageData(fallback), { status: 'loading', data: fallback })
  const ready = await loadPageData('/api/value', schema, fallback, {
    fetchImpl: async () => response({ value: '中文' }),
  })
  assert.deepEqual(ready, { status: 'ready', data: { value: '中文' } })
  const stale = await loadPageData('/api/value', schema, fallback, {
    fetchImpl: async () => response({ value: '旧数据', state: 'stale' }),
  })
  assert.deepEqual(stale, { status: 'stale', data: { value: '旧数据', state: 'stale' } })
})

test('distinguishes unavailable and invalid responses from real empty data', async () => {
  const unavailable = await loadPageData('/api/value', schema, fallback, {
    fetchImpl: async () => response({ error: 'Request failed', code: 'data_product_unavailable' }, 503),
  })
  assert.deepEqual(unavailable, {
    status: 'unavailable', data: fallback, code: 'data_product_unavailable',
  })
  const invalid = await loadPageData('/api/value', schema, fallback, {
    fetchImpl: async () => response({ value: 42 }),
  })
  assert.deepEqual(invalid, { status: 'unavailable', data: fallback, code: 'invalid_response' })
})
