import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { createChatFilesMcpServer } from './mcp.js'
import type { LocalAccessService } from './services/localAccess.js'

function service(): LocalAccessService {
  return {
    status: async () => ({ name: '午夜书斋本地只读接口', wechat: 'ready', artifacts: 'ready' }),
    conversations: async () => ({ conversations: [{ id: 'conv-a', display: '中文会话' }] }),
    search: async () => ({ mode: 'keyword-only', hits: [] }),
    artifacts: async () => ({ artifacts: [] }),
    readDocument: async () => ({ assetId: 'a'.repeat(64), title: '中文说明.md', text: '正文', truncated: false }),
    messageContext: async () => ({ messages: [] }),
  }
}

test('lists six namespaced read-only tools and returns structured Chinese content', async (t) => {
  const server = createChatFilesMcpServer(service())
  const client = new Client({ name: 'chatfiles-test-client', version: '1.0.0' })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  t.after(async () => { await client.close(); await server.close() })
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])

  const listed = await client.listTools()
  assert.deepEqual(listed.tools.map((tool) => tool.name), [
    'chatfiles_status', 'chatfiles_list_conversations', 'chatfiles_search_messages',
    'chatfiles_search_artifacts', 'chatfiles_read_document', 'chatfiles_get_message_context',
  ])
  assert.ok(listed.tools.every((tool) => (
    tool.annotations?.readOnlyHint === true
    && tool.annotations.destructiveHint === false
    && tool.annotations.idempotentHint === true
    && tool.annotations.openWorldHint === false
    && tool.inputSchema.additionalProperties === false
  )))
  const result = await client.callTool({ name: 'chatfiles_list_conversations', arguments: { query: '中文', response_format: 'json' } })
  assert.equal(result.isError, undefined)
  assert.match(JSON.stringify(result.structuredContent), /中文会话/u)
  assert.doesNotMatch(JSON.stringify(result), /sourcePath|databasePath|apiKey/u)
  const document = await client.callTool({
    name: 'chatfiles_read_document',
    arguments: { asset_id: 'a'.repeat(64), max_characters: 12_000, response_format: 'json' },
  })
  assert.match(JSON.stringify(document.structuredContent), /中文说明\.md[\s\S]*正文/u)
})

test('uses canonical Unicode limits while preserving public snake_case arguments', async (t) => {
  let received = ''
  const local = service()
  local.search = async (input) => { received = input.query; return { mode: 'keyword-only', hits: [] } }
  const server = createChatFilesMcpServer(local)
  const client = new Client({ name: 'chatfiles-unicode-client', version: '1.0.0' })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  t.after(async () => { await client.close(); await server.close() })
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])
  const query = '🙂'.repeat(500)
  const result = await client.callTool({
    name: 'chatfiles_search_messages', arguments: { query, conversation_id: 'conv-a', response_format: 'json' },
  })
  assert.equal(result.isError, undefined)
  assert.equal(received, query)
})

test('completes initialize, list, and call over the real stdio subprocess without log pollution', async (t) => {
  const environment = Object.fromEntries(Object.entries(process.env)
    .filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.resolve('node_modules/tsx/dist/cli.mjs'), path.resolve('server/mcp.ts')],
    cwd: process.cwd(), env: environment, stderr: 'pipe',
  })
  let stderr = ''
  transport.stderr?.on('data', (chunk) => { stderr += String(chunk) })
  const client = new Client({ name: 'chatfiles-stdio-test', version: '1.0.0' })
  t.after(async () => client.close())
  await client.connect(transport)
  const listed = await client.listTools()
  assert.equal(listed.tools.length, 6)
  const result = await client.callTool({ name: 'chatfiles_status', arguments: { response_format: 'json' } })
  assert.match(JSON.stringify(result.structuredContent), /午夜书斋/u)
  assert.equal(stderr, '')
})
