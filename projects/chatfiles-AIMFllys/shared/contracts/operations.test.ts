import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

import {
  AGENT_OPERATION_NAMES,
  OPERATION_NAMES,
  operationCatalog,
} from './operations.js'

const expectedDependencies = {
  status: [],
  list_conversations: ['chat'],
  search_messages: ['chat'],
  search_artifacts: ['chat', 'assets'],
  read_document: ['assets', 'documents'],
  get_message_context: ['chat'],
  get_timeline_slice: ['chat'],
  get_link_preview: ['assets', 'link'],
} as const

test('publishes one environment-neutral catalog with all canonical operations', () => {
  assert.deepEqual(OPERATION_NAMES, Object.keys(expectedDependencies))
  assert.equal(new Set(OPERATION_NAMES).size, OPERATION_NAMES.length)
  assert.deepEqual([...AGENT_OPERATION_NAMES].sort(), OPERATION_NAMES.filter((name) => name !== 'status').sort())
  for (const name of OPERATION_NAMES) {
    const operation = operationCatalog[name]
    assert.equal(operation.name, name)
    assert.equal(operation.readOnly, true)
    assert.ok(operation.description.length > 0)
    assert.deepEqual(operation.dependencies, expectedDependencies[name])
    assert.ok(Array.isArray(operation.limits))
    assert.equal(operation.inputSchema.safeParse({ unexpected: true }).success, false)
  }
})

test('shared operation catalog has no runtime or UI dependencies', () => {
  const source = fs.readFileSync(path.resolve(process.cwd(), 'shared/contracts/operations.ts'), 'utf8')
  assert.doesNotMatch(source, /node:|express|sqlite|filesystem|react|document\.|window\./iu)
})

const invalidIntegers = [-1, 0, Number.NaN, Number.POSITIVE_INFINITY, 1.5, 101]

test('strictly rejects every invalid positive operation limit without clamping', () => {
  const cases = [
    ['list_conversations', { query: '会话' }, 'limit', invalidIntegers],
    ['search_messages', { query: '目标' }, 'limit', invalidIntegers],
    ['search_artifacts', {}, 'limit', invalidIntegers],
    ['get_timeline_slice', { conversationId: 'conv-a' }, 'limit', invalidIntegers],
    ['read_document', { assetId: 'a'.repeat(64) }, 'maxCharacters', [
      -1, 0, Number.NaN, Number.POSITIVE_INFINITY, 1.5, 50_001,
    ]],
  ] as const
  for (const [name, base, field, values] of cases) {
    for (const value of values) {
      assert.equal(operationCatalog[name].inputSchema.safeParse({ ...base, [field]: value }).success, false,
        `${name}.${field} accepted ${String(value)}`)
    }
  }
})

test('keeps bounded defaults and permits the documented zero context radius', () => {
  assert.equal(operationCatalog.list_conversations.inputSchema.parse({}).limit, 20)
  assert.equal(operationCatalog.search_messages.inputSchema.parse({ query: '目标' }).limit, 20)
  assert.equal(operationCatalog.search_artifacts.inputSchema.parse({}).limit, 20)
  assert.equal(operationCatalog.read_document.inputSchema.parse({ assetId: 'a'.repeat(64) }).maxCharacters, 12_000)
  assert.equal(operationCatalog.get_message_context.inputSchema.parse({ messageUid: 'm-1' }).radius, 8)
  assert.equal(operationCatalog.get_timeline_slice.inputSchema.parse({ conversationId: 'conv-a' }).limit, 40)
  assert.equal(operationCatalog.get_message_context.inputSchema.safeParse({ messageUid: 'm-1', radius: 0 }).success, true)
  for (const value of [-1, Number.NaN, Number.POSITIVE_INFINITY, 1.5, 21]) {
    assert.equal(operationCatalog.get_message_context.inputSchema.safeParse({ messageUid: 'm-1', radius: value }).success, false)
  }
})

test('counts Chinese and emoji limits by Unicode code point', () => {
  assert.equal(operationCatalog.search_messages.inputSchema.safeParse({ query: '🙂'.repeat(500) }).success, true)
  assert.equal(operationCatalog.search_messages.inputSchema.safeParse({ query: '🙂'.repeat(501) }).success, false)
  assert.equal(operationCatalog.list_conversations.inputSchema.safeParse({ query: '中'.repeat(120) }).success, true)
  const assetId = 'a'.repeat(64)
  assert.equal(operationCatalog.read_document.outputSchema.safeParse({
    assetId, title: '说明.md', text: '🙂'.repeat(50_000), truncated: false,
    citation: `[文件:${assetId}]`,
  }).success, true)
})
