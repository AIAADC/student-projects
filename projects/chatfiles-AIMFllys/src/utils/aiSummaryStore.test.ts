import assert from 'node:assert/strict'
import test from 'node:test'
import type { AgentContextSummary } from '../types/aiAgent.js'
import { clearAgentSummary, loadAgentSummary, saveAgentSummary } from './aiSummaryStore.js'

function storage() {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) },
    removeItem: (key: string) => { values.delete(key) },
  }
}

const summary: AgentContextSummary = {
  version: 1,
  sourceHash: 'a'.repeat(64),
  sourceRange: { firstUid: 'turn:1', lastUid: 'turn:2', count: 2 },
  sections: {
    facts: [{ text: '中文结论', sourceUids: ['turn:2'] }],
    people: [], dates: [], quotes: [], decisions: [], disputes: [], openItems: [],
  },
}

test('persists and clears only the per-conversation structured summary', () => {
  const target = storage()
  saveAgentSummary('会话一', summary, target)
  assert.deepEqual(loadAgentSummary('会话一', target), summary)
  clearAgentSummary('会话一', target)
  assert.equal(loadAgentSummary('会话一', target), undefined)
})

test('ignores malformed or oversized summary storage', () => {
  const target = storage()
  target.setItem('chatfiles.ai.summary.bad', '{not-json')
  assert.equal(loadAgentSummary('bad', target), undefined)
  target.setItem('chatfiles.ai.summary.huge', '甲'.repeat(260_000))
  assert.equal(loadAgentSummary('huge', target), undefined)
})
