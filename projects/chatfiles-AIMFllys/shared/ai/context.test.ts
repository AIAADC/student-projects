import assert from 'node:assert/strict'
import test from 'node:test'
import { planContextBudget, takeWholeMessages } from './context.js'

test('reserves thirty percent and caps raw context at exactly seventy percent', () => {
  const budget = planContextBudget({ contextWindow: 128_000, strategy: 'recent' })
  assert.equal(budget.rawContextMax, 89_600)
  assert.equal(budget.reserved, 38_400)
  assert.ok(budget.outputReserve >= 19_200)
  assert.equal(budget.summaryMax, 0)
  assert.equal(budget.recentMax + budget.retrievalMax, budget.rawContextMax)
})

test('allocates bounded summary, retrieval, and recent evidence without exceeding the raw cap', () => {
  const budget = planContextBudget({ contextWindow: 128_000, strategy: 'summary' })
  assert.ok(budget.summaryMax > 0)
  assert.ok(budget.retrievalMax > 0)
  assert.ok(budget.recentMax >= 128_000 * 0.2)
  assert.equal(budget.summaryMax + budget.retrievalMax + budget.recentMax, budget.rawContextMax)
})

test('takes one contiguous recent suffix and never cuts a Chinese message or emoji', () => {
  const input = [
    { id: 'old', content: '很早以前' },
    { id: 'middle', content: '中文🙂保持完整' },
    { id: 'latest', content: '最后一条' },
  ]
  const selected = takeWholeMessages(input, 14, (message) => [...message.content].length)
  assert.deepEqual(selected.messages.map((message) => message.id), ['middle', 'latest'])
  assert.equal(selected.usedTokens, 12)
  assert.equal(selected.omitted, 1)
})

test('omits an oversized newest message instead of injecting a partial record', () => {
  const selected = takeWholeMessages([{ content: '完整但过长的消息' }], 2, (message) => [...message.content].length)
  assert.deepEqual(selected.messages, [])
  assert.equal(selected.omitted, 1)
})
