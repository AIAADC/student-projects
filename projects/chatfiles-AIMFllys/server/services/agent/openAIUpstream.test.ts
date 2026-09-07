import assert from 'node:assert/strict'
import test from 'node:test'
import { AgentUpstreamError } from './agentLoop.js'
import { createOpenAIUpstream, streamOpenAIChat } from './openAIUpstream.js'

test('parses OpenAI-compatible tool calls without returning request credentials', async () => {
  let requestBody = ''
  const upstream = createOpenAIUpstream({
    baseURL: 'https://example.test/v1', apiKey: 'fake-private-key', model: 'fixture', temperature: 0.2,
  }, async (_url, init) => {
    requestBody = String(init?.body)
    return Response.json({ choices: [{ message: {
      content: null,
      tool_calls: [{ id: 'call-1', type: 'function', function: { name: 'search_messages', arguments: '{"query":"中文"}' } }],
    } }] })
  })
  const result = await upstream({ messages: [{ role: 'user', content: '中文问题' }], tools: [] })
  assert.equal(result.toolCalls[0]?.name, 'search_messages')
  assert.match(requestBody, /fixture/u)
  assert.doesNotMatch(JSON.stringify(result), /fake-private-key/u)
})

test('distinguishes unsupported tools from stable upstream failures', async () => {
  const unsupported = createOpenAIUpstream({
    baseURL: 'https://example.test/v1', apiKey: '', model: 'fixture', temperature: 0,
  }, async () => new Response('function tools are not supported', { status: 400 }))
  await assert.rejects(unsupported({ messages: [], tools: [] }), (error: unknown) => (
    error instanceof AgentUpstreamError && error.code === 'tools_unsupported'
  ))
  const failed = createOpenAIUpstream({
    baseURL: 'https://example.test/v1', apiKey: 'fake-private-key', model: 'fixture', temperature: 0,
  }, async () => new Response('private upstream details', { status: 500 }))
  await assert.rejects(failed({ messages: [], tools: [] }), (error: unknown) => (
    error instanceof AgentUpstreamError && error.code === 'upstream_failed' && !error.message.includes('private')
  ))
})

test('shares one normalized endpoint and credential policy for Agent and streaming chat', async () => {
  const requests: Array<{ url: string; authorization: string; body: string }> = []
  const fetchImpl = async (input: string | URL | Request, init?: RequestInit) => {
    requests.push({
      url: String(input),
      authorization: new Headers(init?.headers).get('authorization') ?? '',
      body: String(init?.body),
    })
    const body = JSON.parse(String(init?.body)) as { stream?: boolean }
    return body.stream
      ? new Response('data: {"choices":[]}\n\n', { status: 200 })
      : Response.json({ choices: [{ message: { content: '完成', tool_calls: [] } }] })
  }
  const config = { baseURL: 'https://example.test/v1///', apiKey: 'request-only-key', model: 'fixture', temperature: 0.3 }
  await createOpenAIUpstream(config, fetchImpl)({ messages: [{ role: 'user', content: '问题' }] })
  const stream = await streamOpenAIChat(config, [{ role: 'user', content: '问题' }], undefined, fetchImpl)
  assert.ok(stream)
  assert.deepEqual(requests.map((request) => request.url), [
    'https://example.test/v1/chat/completions',
    'https://example.test/v1/chat/completions',
  ])
  assert.ok(requests.every((request) => request.authorization === 'Bearer request-only-key'))
  assert.deepEqual(requests.map((request) => JSON.parse(request.body).stream), [false, true])
  assert.doesNotMatch(JSON.stringify(stream), /request-only-key/u)
})
