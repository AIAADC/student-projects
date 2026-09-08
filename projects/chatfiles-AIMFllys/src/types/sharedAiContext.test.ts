import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

async function contextModule() {
  const target = path.resolve(process.cwd(), 'shared', 'ai', 'context.ts')
  assert.equal(fs.existsSync(target), true, 'shared/ai/context.ts must exist')
  if (!fs.existsSync(target)) return null
  return import('../../shared/ai/context.js')
}

test('keeps token estimation UTF-8 safe in the shared pure module', async () => {
  const context = await contextModule()
  if (!context) return
  assert.equal(context.estimateTokens('中文🙂'), 3)
  assert.equal(context.estimateTokens('abcdefg'), 2)
})

test('keeps the bounded context policy independent from browser state', async () => {
  const context = await contextModule()
  if (!context) return
  const budget = context.planContextBudget({ contextWindow: 128_000, strategy: 'summary' })
  assert.equal(budget.rawContextMax, 89_600)
  assert.equal(budget.rawContextMax + budget.reserved, budget.contextWindow)
})
