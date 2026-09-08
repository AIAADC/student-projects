import assert from 'node:assert/strict'
import test from 'node:test'

import type { OperationName, OperationDependency } from '../../shared/contracts/operations.js'
import { createOperationExecutor, OperationExecutionError } from './operationExecutor.js'

function outputFor(name: OperationName) {
  if (name === 'status') {
    return { name: '午夜书斋本地只读接口', version: 2, wechat: 'ready', artifacts: 'unavailable' }
  }
  if (name === 'list_conversations') return { conversations: [] }
  if (name === 'search_artifacts') return { artifacts: [], citations: [] }
  throw new Error(`unexpected test operation: ${name}`)
}

test('dispatches parsed defaults with exactly the catalog dependencies', async () => {
  const opens: Array<{ name: OperationName; dependencies: readonly OperationDependency[] }> = []
  const executor = createOperationExecutor({
    async openResources(name, dependencies) {
      opens.push({ name, dependencies })
      return { resources: { marker: name }, close: async () => undefined }
    },
    async executeOperation(name, input, resources) {
      assert.deepEqual(resources, { marker: name })
      if (name === 'list_conversations') assert.deepEqual(input, { limit: 20 })
      return outputFor(name)
    },
  })

  await executor.execute('status', {})
  await executor.execute('list_conversations', {})
  assert.deepEqual(opens, [
    { name: 'status', dependencies: [] },
    { name: 'list_conversations', dependencies: ['chat'] },
  ])
})

test('rejects invalid input before opening resources', async () => {
  let opened = false
  const executor = createOperationExecutor({
    async openResources() { opened = true; return { resources: {}, close: async () => undefined } },
    async executeOperation(name) { return outputFor(name) },
  })
  await assert.rejects(
    executor.execute('list_conversations', { limit: 0 }),
    (error: unknown) => error instanceof OperationExecutionError && error.code === 'invalid_input',
  )
  assert.equal(opened, false)
})

test('keeps chat-only operations available when an assets dependency is unavailable', async () => {
  const executor = createOperationExecutor({
    async openResources(name, dependencies) {
      if (dependencies.includes('assets')) throw new OperationExecutionError('unavailable', name, 'assets')
      return { resources: {}, close: async () => undefined }
    },
    async executeOperation(name) { return outputFor(name) },
  })
  await assert.rejects(
    executor.execute('search_artifacts', {}),
    (error: unknown) => error instanceof OperationExecutionError
      && error.code === 'unavailable' && error.dependency === 'assets',
  )
  assert.deepEqual(await executor.execute('list_conversations', {}), { conversations: [] })
})
