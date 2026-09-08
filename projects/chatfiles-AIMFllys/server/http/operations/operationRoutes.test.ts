import assert from 'node:assert/strict'
import test from 'node:test'

import { createOperationExecutor } from '../../application/operationExecutor.js'
import { withServer } from '../../routes/wechatRouteTestFixtures.js'
import { createOperationRoutes } from './operationRoutes.js'

function executor() {
  return createOperationExecutor({
    openResources: async () => ({ resources: {}, close() {} }),
    async executeOperation(name) {
      if (name === 'status') return { name: '午夜书斋', wechat: 'ready', artifacts: 'unavailable' }
      if (name === 'list_conversations') return {
        conversations: [{
          id: 'conv-a', display: '中文会话', isGroup: true, messageCount: 3, textCount: 3,
          firstTime: 1, lastTime: 2,
        }],
      }
      throw new Error('fixture operation not implemented')
    },
  })
}

test('executes canonical input and returns the same domain result over HTTP', async () => {
  await withServer(createOperationRoutes({ executor: executor() }), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/operations/list_conversations`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ limit: 20 }),
    })
    assert.equal(response.status, 200)
    assert.match(JSON.stringify(await response.json()), /中文会话/u)
    const status = await fetch(`${baseUrl}/api/v1/status`)
    assert.equal(status.status, 200)
    assert.match(JSON.stringify(await status.json()), /午夜书斋/u)
  })
})

test('maps invalid and unknown canonical operations to stable JSON errors', async () => {
  await withServer(createOperationRoutes({ executor: executor() }), async (baseUrl) => {
    const invalid = await fetch(`${baseUrl}/api/v1/operations/list_conversations`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ limit: -1 }),
    })
    assert.equal(invalid.status, 400)
    assert.deepEqual(await invalid.json(), { error: 'Request failed', code: 'invalid_input' })
    const unknown = await fetch(`${baseUrl}/api/v1/operations/private_dump`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
    })
    assert.equal(unknown.status, 404)
    assert.deepEqual(await unknown.json(), { error: 'Request failed', code: 'not_found' })
  })
})
