import assert from 'node:assert/strict'
import test from 'node:test'

import { createAgentOperationRegistry } from './agentOperationRegistry.js'
import { ToolExecutionError } from './toolRegistry.js'

test('executes only operations published in the Agent tool schemas', async () => {
  const calls: string[] = []
  const registry = createAgentOperationRegistry({
    async execute(name) { calls.push(name); return { conversations: [] } },
  })
  assert.deepEqual(await registry.execute('list_conversations', {}), { conversations: [] })
  await assert.rejects(
    registry.execute('status', {}),
    (error: unknown) => error instanceof ToolExecutionError && error.code === 'unknown_tool',
  )
  assert.deepEqual(calls, ['list_conversations'])
})
