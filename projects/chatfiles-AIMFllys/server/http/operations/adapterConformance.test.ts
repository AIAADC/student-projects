import assert from 'node:assert/strict'
import test from 'node:test'

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { Router } from 'express'

import { createOperationExecutor } from '../../application/operationExecutor.js'
import { runCli } from '../../cli.js'
import { createChatFilesMcpServer } from '../../mcp.js'
import { createLocalApiRouter } from '../../routes/localApi.js'
import { withServer } from '../../routes/wechatRouteTestFixtures.js'
import { createAgentOperationRegistry } from '../../services/agent/agentOperationRegistry.js'
import { createLocalAccessService } from '../../services/localAccess.js'
import { createOperationRoutes } from './operationRoutes.js'

const expected = {
  conversations: [{
    id: 'conv-a', display: '中文会话', isGroup: true, messageCount: 3, textCount: 3,
    firstTime: 1, lastTime: 2,
  }],
}

test('HTTP, CLI, MCP, and Agent adapters return one canonical domain result', async (t) => {
  const operations = createOperationExecutor({
    openResources: async () => ({ resources: {}, close() {} }),
    async executeOperation(name) {
      if (name === 'list_conversations') return expected
      if (name === 'status') return { name: '午夜书斋', wechat: 'ready', artifacts: 'ready' }
      throw new Error('fixture operation not implemented')
    },
  })
  const local = createLocalAccessService({
    status: async () => await operations.execute('status', {}) as Awaited<ReturnType<ReturnType<typeof createLocalAccessService>['status']>>,
    execute: async (name, input) => await operations.execute(name, input),
  })
  const router = Router()
  router.use(createOperationRoutes({ executor: operations }))
  router.use(createLocalApiRouter({ service: local }))

  const mcp = createChatFilesMcpServer(local)
  const client = new Client({ name: 'adapter-conformance', version: '1.0.0' })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  t.after(async () => { await client.close(); await mcp.close() })
  await Promise.all([mcp.connect(serverTransport), client.connect(clientTransport)])

  await withServer(router, async (baseUrl) => {
    const http = await fetch(`${baseUrl}/api/v1/operations/list_conversations`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: '中文', limit: 20 }),
    }).then((response) => response.json())
    const agent = await createAgentOperationRegistry(operations).execute('list_conversations', {
      query: '中文', limit: 20,
    })
    const mcpResult = await client.callTool({
      name: 'chatfiles_list_conversations',
      arguments: { query: '中文', limit: 20, response_format: 'json' },
    })
    let cliText = ''
    const cliCode = await runCli(['conversations', '--query', '中文', '--limit', '20', '--json'], {
      baseURL: baseUrl, stdout: (value) => { cliText += value }, stderr: () => {},
    })
    assert.equal(cliCode, 0)
    assert.deepEqual(http, expected)
    assert.deepEqual(agent, expected)
    assert.deepEqual((mcpResult.structuredContent as { result: unknown }).result, expected)
    assert.deepEqual(JSON.parse(cliText), expected)
  })
})
