import assert from 'node:assert/strict'
import test from 'node:test'
import { toJSONSchema } from 'zod/v4'

import { AGENT_OPERATION_NAMES, operationCatalog } from '../../../shared/contracts/operations.js'
import { AGENT_TOOL_SCHEMAS } from './toolSchemas.js'

test('derives every agent parameter schema from the canonical Zod catalog', () => {
  assert.deepEqual(AGENT_TOOL_SCHEMAS.map((tool) => tool.function.name), AGENT_OPERATION_NAMES)
  for (const tool of AGENT_TOOL_SCHEMAS) {
    const expected = toJSONSchema(
      operationCatalog[tool.function.name].inputSchema,
      { target: 'draft-07', io: 'input' },
    )
    delete expected.$schema
    assert.deepEqual(tool.function.parameters, expected)
    assert.equal(tool.function.description, operationCatalog[tool.function.name].description)
  }
})

test('keeps catalog defaults optional in the model-facing input schema', () => {
  const byName = Object.fromEntries(AGENT_TOOL_SCHEMAS.map((tool) => [tool.function.name, tool.function.parameters]))
  assert.deepEqual(byName.list_conversations?.required ?? [], [])
  assert.deepEqual(byName.read_document?.required, ['assetId'])
  assert.deepEqual(byName.get_message_context?.required, ['messageUid'])
})
