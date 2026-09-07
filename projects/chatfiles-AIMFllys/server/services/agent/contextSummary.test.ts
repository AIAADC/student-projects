import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createContextSummary,
  mergeSummarySections,
  resolveSummaryStrategy,
  summarySourceHash,
} from './contextSummary.js'

const messages = [
  { messageUid: 'm-1', time: 100, text: '张三在 2026-07-01 说“采用方案A”' },
  { messageUid: 'm-2', time: 101, text: '李四不同意，预算仍未决定' },
]

test('preserves every structured category and closes each item over source UIDs', () => {
  const sections = mergeSummarySections([
    { facts: [{ text: '采用方案A', sourceUids: ['m-1'] }], people: [{ text: '张三', sourceUids: ['m-1'] }], dates: [{ text: '2026-07-01', sourceUids: ['m-1'] }], quotes: [{ text: '“采用方案A”', sourceUids: ['m-1'] }], decisions: [], disputes: [], openItems: [] },
    { facts: [], people: [{ text: '李四', sourceUids: ['m-2'] }], dates: [], quotes: [], decisions: [], disputes: [{ text: '李四不同意', sourceUids: ['m-2'] }], openItems: [{ text: '预算未决定', sourceUids: ['m-2'] }] },
  ])
  const summary = createContextSummary(messages, sections)
  assert.equal(summary.version, 1)
  assert.equal(summary.sourceHash, summarySourceHash(messages))
  assert.deepEqual(summary.sourceRange, { firstUid: 'm-1', lastUid: 'm-2', count: 2 })
  assert.equal(summary.sections.people.length, 2)
  assert.equal(summary.sections.quotes.length, 1)
  assert.equal(summary.sections.disputes.length, 1)
  assert.equal(summary.sections.openItems.length, 1)
  assert.equal(resolveSummaryStrategy('summary', summary, messages).strategy, 'summary')
})

test('rejects unclosed facts and falls back to recent when source content changes', () => {
  assert.throws(() => createContextSummary(messages, {
    facts: [{ text: '无来源事实', sourceUids: [] }], people: [], dates: [], quotes: [], decisions: [], disputes: [], openItems: [],
  }), /summary_citation_open/u)
  const summary = createContextSummary(messages, {
    facts: [{ text: '有来源事实', sourceUids: ['m-1'] }], people: [], dates: [], quotes: [], decisions: [], disputes: [], openItems: [],
  })
  const changed = [{ ...messages[0], text: '内容已变化' }, messages[1]]
  assert.deepEqual(resolveSummaryStrategy('summary', summary, changed), { strategy: 'recent', reason: 'summary_stale' })
  assert.deepEqual(resolveSummaryStrategy('summary', undefined, messages), { strategy: 'recent', reason: 'summary_missing' })
})
