import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const dock = fs.readFileSync(path.resolve(process.cwd(), 'src/components/ai/AIChatDock.tsx'), 'utf8')

test('uses the multi-step SSE agent instead of loading a full transcript', () => {
  assert.match(dock, /streamAgent/u)
  assert.match(dock, /<AgentProgress/u)
  assert.match(dock, /<AgentCitation/u)
  assert.doesNotMatch(dock, /\/transcript/u)
})

test('sends context strategy and routes evidence clicks through a callback', () => {
  assert.match(dock, /contextStrategy/u)
  assert.match(dock, /onCitation/u)
  assert.match(dock, /evidenceCount/u)
})

test('loads, publishes, and clears the per-conversation structured summary', () => {
  assert.match(dock, /loadAgentSummary/u)
  assert.match(dock, /saveAgentSummary/u)
  assert.match(dock, /clearAgentSummary/u)
})
