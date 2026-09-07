import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test, { type TestContext } from 'node:test'

import { EMPTY_ARCHITECTURE_BASELINE } from './architecture.js'
import { GUARDRAIL_BASELINE } from './baseline.js'
import { EMPTY_REPOSITORY_BASELINE } from './repository.js'
import { runGuardrailCheck, type GuardrailBaseline } from './runner.js'

const EMPTY_BASELINE: GuardrailBaseline = {
  architecture: EMPTY_ARCHITECTURE_BASELINE,
  repository: EMPTY_REPOSITORY_BASELINE,
}

function createFixture(t: TestContext, files: Record<string, string>) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chatfiles-guardrail-runner-'))
  t.after(() => fs.rmSync(root, { force: true, recursive: true }))
  for (const [relativePath, content] of Object.entries(files)) {
    const target = path.join(root, relativePath)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, content, 'utf8')
  }
  return root
}

test('architecture runner returns failure with relative diagnostics only', (t) => {
  const root = createFixture(t, {
    'server/read.ts': 'export const read = () => 1\n',
    'src/view.ts': "import { read } from '../server/read.js'\nexport const view = read()\n",
  })
  const messages: string[] = []

  const exitCode = runGuardrailCheck('architecture', {
    baseline: EMPTY_BASELINE,
    candidateFiles: ['server/read.ts', 'src/view.ts'],
    root,
    write: (message) => messages.push(message),
  })

  assert.equal(exitCode, 1)
  assert.match(messages.join('\n'), /src\/view\.ts/u)
  assert.doesNotMatch(messages.join('\n'), new RegExp(root.replaceAll('\\', '\\\\'), 'u'))
})

test('all runner checks return success for a clean UTF-8 fixture', (t) => {
  const root = createFixture(t, {
    'AGENTS.md': '# 中文规则\n',
    'shared/message.ts': "export const message = '你好'\n",
    'src/view.ts': "import { message } from '../shared/message.js'\nexport const view = message\n",
  })
  const messages: string[] = []

  const exitCode = runGuardrailCheck('all', {
    baseline: EMPTY_BASELINE,
    candidateFiles: ['AGENTS.md', 'shared/message.ts', 'src/view.ts'],
    root,
    write: (message) => messages.push(message),
  })

  assert.equal(exitCode, 0)
  assert.match(messages.join('\n'), /guardrails:all.*ok/u)
})

test('checked-in exact baseline accepts the current repository', () => {
  const root = path.resolve(import.meta.dirname, '..', '..')
  const messages: string[] = []
  const signatures = GUARDRAIL_BASELINE.architecture.allowedIssueSignatures

  assert.equal(new Set(signatures).size, signatures.length)
  assert.equal(runGuardrailCheck('all', {
    baseline: GUARDRAIL_BASELINE,
    root,
    write: (message) => messages.push(message),
  }), 0)
  assert.deepEqual(messages, ['[guardrails:all] ok'])
})
