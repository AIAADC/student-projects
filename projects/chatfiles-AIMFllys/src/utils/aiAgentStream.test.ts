import assert from 'node:assert/strict'
import test from 'node:test'
import type { AgentStreamEvent } from '../types'
import { AgentStreamError, parseAgentEventStream } from './aiAgentStream.js'

async function* chunks(value: string, sizes: number[]) {
  const bytes = new TextEncoder().encode(value)
  let offset = 0
  for (const size of sizes) {
    if (offset >= bytes.length) break
    yield bytes.slice(offset, offset + size)
    offset += size
  }
  if (offset < bytes.length) yield bytes.slice(offset)
}

test('parses arbitrarily split SSE frames without damaging Chinese and stops on done', async () => {
  const stream = [
    'event: step\ndata: {"type":"step","step":1,"label":"检索中文"}\n\n',
    'event: delta\ndata: {"type":"delta","content":"回答🙂"}\n\n',
    'event: done\ndata: {"type":"done","mode":"agent","strategy":"recent","evidenceCount":1,"steps":1}\n\n',
    'event: delta\ndata: {"type":"delta","content":"不应读取"}\n\n',
  ].join('')
  const events: AgentStreamEvent[] = []
  await parseAgentEventStream(chunks(stream, [1, 2, 5, 3, 8, 13, 21]), (event) => events.push(event))
  assert.deepEqual(events.map((event) => event.type), ['step', 'delta', 'done'])
  assert.equal(events[1]?.type === 'delta' ? events[1].content : '', '回答🙂')
})

test('surfaces only the stable error code from an error event', async () => {
  const stream = 'event: error\ndata: {"type":"error","code":"agent_timeout","detail":"private"}\n\n'
  await assert.rejects(
    parseAgentEventStream(chunks(stream, [7, 4, 2]), () => {}),
    (error: unknown) => error instanceof AgentStreamError && error.code === 'agent_timeout' && !error.message.includes('private'),
  )
})
