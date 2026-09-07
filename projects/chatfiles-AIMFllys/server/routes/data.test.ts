import assert from 'node:assert/strict'
import test from 'node:test'

import { createDataRouter } from './data.js'
import { withServer } from './wechatRouteTestFixtures.js'

test('keeps static data routes as thin query-service adapters', async () => {
  const calls: string[] = []
  const methods = [
    'library', 'sourceLibrary', 'knowledge', 'summary', 'chatClues',
    'chatSynthesis', 'databaseAnalysis', 'valueCandidates',
  ] as const
  const service = Object.fromEntries(methods.map((name) => [name, () => {
    calls.push(name)
    return { marker: name }
  }]))
  const paths = [
    'library', 'source-library', 'knowledge', 'summary', 'chat-clues',
    'chat-synthesis', 'database-analysis', 'value-candidates',
  ]

  await withServer(createDataRouter('C:\\fixture', service), async (baseUrl) => {
    for (const [index, path] of paths.entries()) {
      assert.deepEqual(await (await fetch(`${baseUrl}/api/${path}`)).json(), { marker: methods[index] })
      assert.deepEqual(await (await fetch(`${baseUrl}/api/v1/data/${path}`)).json(), { marker: methods[index] })
    }
  })
  assert.deepEqual(calls, methods.flatMap((method) => [method, method]))
})
