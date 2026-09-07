import assert from 'node:assert/strict'
import test from 'node:test'
import { createContextSummary } from './contextSummary.js'
import { historySourceMessages, prepareHistoryContext } from './historySummary.js'

const emptySections = () => ({
  facts: [], people: [], dates: [], quotes: [], decisions: [], disputes: [], openItems: [],
})

test('builds and injects a citation-closed summary for history outside the recent budget', async () => {
  const history = [
    { role: 'user' as const, content: `请研究${'甲'.repeat(2_200)}` },
    { role: 'assistant' as const, content: `证据结论 [消息:m-1]${'乙'.repeat(2_200)}` },
    { role: 'user' as const, content: '继续核对后续问题' },
  ]
  const sources = historySourceMessages(history.slice(0, 2))
  let calls = 0
  const result = await prepareHistoryContext({
    requested: 'summary', history, contextWindow: 8_000,
    upstream: async () => {
      calls += 1
      return { content: JSON.stringify({
        ...emptySections(),
        facts: [{ text: '此前围绕甲完成了证据核对 [消息:m-1]', sourceUids: [sources[1].messageUid] }],
      }), toolCalls: [] }
    },
  })

  assert.equal(result.strategy, 'summary')
  assert.equal(calls, 1)
  assert.equal(result.summary?.sourceRange.count, 2)
  assert.deepEqual(result.history, [history[2]])
})

test('reuses a valid persisted prefix summary without another model call', async () => {
  const history = [
    { role: 'user' as const, content: '旧问题'.repeat(1_100) },
    { role: 'assistant' as const, content: '旧回答'.repeat(1_100) },
    { role: 'user' as const, content: '新问题' },
  ]
  const sources = historySourceMessages(history.slice(0, 2))
  const summary = createContextSummary(sources, {
    ...emptySections(), facts: [{ text: '旧研究结论', sourceUids: [sources[1].messageUid] }],
  })
  const result = await prepareHistoryContext({
    requested: 'summary', history, summary, contextWindow: 8_000,
    upstream: async () => { throw new Error('must not rebuild') },
  })

  assert.equal(result.strategy, 'summary')
  assert.equal(result.summary, summary)
  assert.deepEqual(result.history, [history[2]])
})

test('falls back to the larger recent window when summary generation is invalid', async () => {
  const history = [
    { role: 'user' as const, content: '旧内容'.repeat(600) },
    { role: 'assistant' as const, content: '旧回答'.repeat(600) },
    { role: 'user' as const, content: '最近问题' },
  ]
  const result = await prepareHistoryContext({
    requested: 'summary', history, contextWindow: 8_000,
    upstream: async () => ({ content: '{"facts":[{"text":"无来源","sourceUids":[]}]}', toolCalls: [] }),
  })

  assert.equal(result.strategy, 'recent')
  assert.equal(result.reason, 'summary_invalid')
  assert.ok(result.history.length > 0)
})

test('does not publish an empty summary that would erase omitted history', async () => {
  const history = [
    { role: 'user' as const, content: '重要背景'.repeat(600) },
    { role: 'assistant' as const, content: '重要结论'.repeat(600) },
    { role: 'user' as const, content: '继续' },
  ]
  const result = await prepareHistoryContext({
    requested: 'summary', history, contextWindow: 8_000,
    upstream: async () => ({ content: JSON.stringify(emptySections()), toolCalls: [] }),
  })

  assert.equal(result.strategy, 'recent')
  assert.equal(result.reason, 'summary_invalid')
  assert.equal(result.summary, undefined)
})
