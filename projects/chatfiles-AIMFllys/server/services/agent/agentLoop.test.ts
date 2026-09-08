import assert from 'node:assert/strict'
import test from 'node:test'
import { AgentLoopError, AgentUpstreamError, runAgent, type AgentCompletionRequest } from './agentLoop.js'
import { ToolExecutionError } from './toolRegistry.js'

const schemas = [{ type: 'function' as const, function: {
  name: 'search_messages', description: 'search',
  parameters: { type: 'object' as const, properties: {}, additionalProperties: false as const },
} }]

function toolResponse(id: string, name: string, args: unknown) {
  return { content: '', toolCalls: [{ id, name, arguments: JSON.stringify(args) }] }
}

test('runs search then context tools before returning a citation-constrained answer', async () => {
  const requests: AgentCompletionRequest[] = []
  const replies = [
    toolResponse('call-1', 'search_messages', { query: '目标' }),
    toolResponse('call-2', 'get_message_context', { messageUid: 'm-2' }),
    { content: '结论来自原文 [消息:m-2]', toolCalls: [] },
  ]
  const events: unknown[] = []
  const calls: string[] = []
  const result = await runAgent({
    question: '请找到目标', conversationId: 'conv-a', strategy: 'recent', history: [],
    registry: {
      schemas,
      execute: async (name) => {
        calls.push(name)
        return name === 'search_messages'
          ? { hits: [{ citation: '[消息:m-2]' }], citations: ['[消息:m-2]'], mode: 'keyword-only' }
          : { messages: [{ citation: '[消息:m-2]', text: '原文' }], citations: ['[消息:m-2]'] }
      },
    },
    upstream: async (request) => { requests.push(request); return replies.shift()! },
    emit: (event) => events.push(event),
  })
  assert.deepEqual(calls, ['search_messages', 'get_message_context'])
  assert.equal(requests.length, 3)
  assert.equal(result.answer, '结论来自原文 [消息:m-2]')
  assert.equal(result.evidenceCount, 1)
  assert.ok(events.some((event) => (event as { type: string }).type === 'citation'))
  assert.ok(events.some((event) => (event as { type: string }).type === 'done'))
})

test('suppresses duplicate calls, rejects invalid calls, and never exceeds six calls in one step', async () => {
  let executions = 0
  const replies = [
    toolResponse('a', 'search_messages', { query: '相同' }),
    toolResponse('b', 'search_messages', { query: '相同' }),
    { content: '完成', toolCalls: [] },
  ]
  const events: Array<{ type: string; status?: string }> = []
  const result = await runAgent({
    question: '测试', strategy: 'recent', history: [],
    registry: { schemas, execute: async () => { executions += 1; return { citations: [] } } },
    upstream: async () => replies.shift()!, emit: (event) => events.push(event),
  })
  assert.equal(result.answer, '完成')
  assert.equal(executions, 1)
  assert.ok(events.some((event) => event.status === 'duplicate'))

  await assert.rejects(runAgent({
    question: '超限', strategy: 'recent', history: [], registry: { schemas, execute: async () => ({}) },
    upstream: async () => ({ content: '', toolCalls: Array.from({ length: 7 }, (_, index) => ({ id: String(index), name: 'search_messages', arguments: '{}' })) }),
    emit() {},
  }), (error: unknown) => error instanceof AgentLoopError && error.code === 'tool_call_limit')

  const invalidEvents: Array<{ type: string; status?: string }> = []
  const invalidReplies = [toolResponse('x', 'search_messages', { bad: true }), { content: '已修正', toolCalls: [] }]
  await runAgent({
    question: '错误参数', strategy: 'recent', history: [],
    registry: { schemas, execute: async () => { throw new ToolExecutionError('invalid_arguments') } },
    upstream: async () => invalidReplies.shift()!, emit: (event) => invalidEvents.push(event),
  })
  assert.ok(invalidEvents.some((event) => event.status === 'rejected'))
})

test('reports an unavailable capability explicitly so the model can continue with chat tools', async () => {
  const requests: AgentCompletionRequest[] = []
  const replies = [
    toolResponse('asset-call', 'search_artifacts', {}),
    { content: '素材不可用，改用聊天证据。', toolCalls: [] },
  ]
  await runAgent({
    question: '查找资料', strategy: 'recent', history: [],
    registry: { schemas, execute: async () => { throw new ToolExecutionError('unavailable') } },
    upstream: async (request) => { requests.push(request); return replies.shift()! },
    emit() {},
  })
  const toolMessage = requests[1]?.messages.find((message) => message.role === 'tool')
  assert.equal(toolMessage?.content, '{"error":"unavailable"}')
})

test('stops at eight steps and propagates cancellation with stable errors', async () => {
  let calls = 0
  await assert.rejects(runAgent({
    question: '循环', strategy: 'recent', history: [], registry: { schemas, execute: async () => ({}) },
    upstream: async () => { calls += 1; return toolResponse(String(calls), 'search_messages', { query: String(calls) }) },
    emit() {},
  }), (error: unknown) => error instanceof AgentLoopError && error.code === 'step_limit')
  assert.equal(calls, 8)
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(runAgent({
    question: '取消', strategy: 'recent', history: [], signal: controller.signal,
    registry: { schemas, execute: async () => ({}) }, upstream: async () => ({ content: '不应到达', toolCalls: [] }), emit() {},
  }), (error: unknown) => error instanceof AgentLoopError && error.code === 'cancelled')
})

test('falls back to one retrieval-assisted generation when tools are unsupported', async () => {
  let upstreamCalls = 0
  const events: unknown[] = []
  const result = await runAgent({
    question: '回退问题', conversationId: 'conv-a', strategy: 'summary', history: [],
    registry: {
      schemas,
      execute: async (name) => {
        assert.equal(name, 'search_messages')
        return { hits: [{ text: '证据', citation: '[消息:m-fallback]' }], citations: ['[消息:m-fallback]'], mode: 'keyword-only' }
      },
    },
    upstream: async () => {
      upstreamCalls += 1
      if (upstreamCalls === 1) throw new AgentUpstreamError('tools_unsupported')
      return { content: '回退结论', toolCalls: [] }
    },
    emit: (event) => events.push(event),
  })
  assert.equal(result.mode, 'fallback')
  assert.match(result.answer, /回退结论[\s\S]*\[消息:m-fallback\]/u)
  assert.doesNotMatch(JSON.stringify(events), /fake-private-key/u)
})
