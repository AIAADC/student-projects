import assert from 'node:assert/strict'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

const root = path.resolve(import.meta.dirname, '..', '..')
const tsxCli = path.join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs')
const guardrailCli = path.join(root, 'tools', 'guardrails', 'check.ts')

function runCli(check: string, cwd = root) {
  return spawnSync(process.execPath, [tsxCli, guardrailCli, check], {
    cwd,
    encoding: 'utf8',
  })
}

test('guardrail CLI exits zero for the checked-in architecture baseline', () => {
  const result = runCli('architecture')

  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /\[guardrails:architecture\] ok/u)
})

test('guardrail CLI rejects an unknown check name', () => {
  const result = runCli('unknown')

  assert.equal(result.status, 2)
  assert.match(result.stderr, /unknown guardrail check/u)
})

test('guardrail CLI resolves the repository root from a nested working directory', () => {
  const result = runCli('architecture', path.join(root, 'tools'))

  assert.equal(result.status, 0, result.stdout + result.stderr)
  assert.match(result.stdout, /\[guardrails:architecture\] ok/u)
})
