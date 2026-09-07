import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test, { type TestContext } from 'node:test'

import {
  EMPTY_ARCHITECTURE_BASELINE,
  inspectArchitecture,
  type ArchitectureBaseline,
} from './architecture.js'

function createFixture(t: TestContext, files: Record<string, string>) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chatfiles-architecture-'))
  t.after(() => fs.rmSync(root, { force: true, recursive: true }))

  for (const [relativePath, content] of Object.entries(files)) {
    const target = path.join(root, relativePath)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, content, 'utf8')
  }

  return root
}

test('rejects frontend imports from server while allowing shared contracts', (t) => {
  const root = createFixture(t, {
    'shared/message.ts': 'export interface Message { text: string }\n',
    'server/read.ts': "import type { Message } from '../shared/message.js'\nexport const read = (): Message => ({ text: '好' })\n",
    'src/view.ts': "import { read } from '../server/read.js'\nimport type { Message } from '../shared/message.js'\nexport const view = (message: Message) => read().text + message.text\n",
  })

  const report = inspectArchitecture(root, EMPTY_ARCHITECTURE_BASELINE)
  const dependencyIssues = report.issues.filter((issue) => issue.kind === 'dependency-direction')

  assert.equal(dependencyIssues.length, 1)
  assert.match(dependencyIssues[0]?.message ?? '', /src\/view\.ts/u)
  assert.match(dependencyIssues[0]?.message ?? '', /server\/read\.ts/u)
})

test('resolves layer aliases before enforcing dependency direction', (t) => {
  const root = createFixture(t, {
    'server/read.ts': 'export const read = () => 1\n',
    'src/view.ts': "import { read } from '@server/read.js'\nexport const view = read()\n",
  })

  const issues = inspectArchitecture(root, EMPTY_ARCHITECTURE_BASELINE).issues

  assert.equal(issues.length, 1)
  assert.match(issues[0]?.message ?? '', /src\/view\.ts.*server\/read\.ts/u)
})

test('rejects application imports from server adapter layers', (t) => {
  const root = createFixture(t, {
    'server/application/run.ts': "import { agent } from '../services/agent/registry.js'\nexport const run = agent\n",
    'server/services/agent/registry.ts': "export const agent = 'adapter'\n",
  })

  const issues = inspectArchitecture(root, EMPTY_ARCHITECTURE_BASELINE).issues

  assert.equal(issues.length, 1)
  assert.equal(issues[0]?.kind, 'dependency-direction')
  assert.match(issues[0]?.message ?? '', /server\/application\/run\.ts.*server\/services\/agent\/registry\.ts/u)
})

test('rejects a cross-layer TypeScript reference directive', (t) => {
  const root = createFixture(t, {
    'server/read.ts': 'export interface ReadResult { value: number }\n',
    'src/view.ts': '/// <reference path="../server/read.ts" />\nexport const view = 1\n',
  })

  const issues = inspectArchitecture(root, EMPTY_ARCHITECTURE_BASELINE).issues

  assert.equal(issues.length, 1)
  assert.equal(issues[0]?.kind, 'dependency-direction')
  assert.match(issues[0]?.message ?? '', /src\/view\.ts.*server\/read\.ts/u)
})

test('detects every import edge participating in a cycle', (t) => {
  const root = createFixture(t, {
    'server/a.ts': "import './b.js'\nexport const a = '甲'\n",
    'server/b.ts': "export { c } from './c.js'\nexport const b = '乙'\n",
    'server/c.ts': "import { a } from './a.js'\nexport const c = a\n",
  })

  const report = inspectArchitecture(root, EMPTY_ARCHITECTURE_BASELINE)
  const cycleIssues = report.issues.filter((issue) => issue.kind === 'cycle-edge')

  assert.equal(cycleIssues.length, 3)
  assert.deepEqual(
    cycleIssues.map((issue) => issue.signature),
    [...cycleIssues.map((issue) => issue.signature)].sort(),
  )
})

test('detects a cycle formed by an import and a TypeScript reference', (t) => {
  const root = createFixture(t, {
    'server/a.ts': "import './b.js'\nexport const a = 1\n",
    'server/b.ts': '/// <reference path="./a.ts" />\nexport const b = 2\n',
  })

  const cycleIssues = inspectArchitecture(root, EMPTY_ARCHITECTURE_BASELINE).issues
    .filter((issue) => issue.kind === 'cycle-edge')

  assert.equal(cycleIssues.length, 2)
})

test('does not reinterpret a stylesheet import as a same-stem TypeScript module', (t) => {
  const root = createFixture(t, {
    'src/App.css': '.app { display: block; }\n',
    'src/App.tsx': "import './App.css'\nexport const App = () => null\n",
  })

  const report = inspectArchitecture(root, EMPTY_ARCHITECTURE_BASELINE)

  assert.deepEqual(report.issues, [])
})

test('an exact baseline suppresses only the matching historical violation', (t) => {
  const root = createFixture(t, {
    'server/legacy.ts': "import { localEnv } from '../scripts/localEnv.js'\nexport const value = localEnv\n",
    'scripts/localEnv.ts': "export const localEnv = '历史债'\n",
  })

  const firstReport = inspectArchitecture(root, EMPTY_ARCHITECTURE_BASELINE)
  const historical = firstReport.issues.find((issue) => issue.kind === 'dependency-direction')
  assert.ok(historical)

  const baseline: ArchitectureBaseline = { allowedIssueSignatures: [historical.signature] }
  assert.deepEqual(inspectArchitecture(root, baseline).issues, [])

  const newImporter = path.join(root, 'src', 'newView.ts')
  fs.mkdirSync(path.dirname(newImporter), { recursive: true })
  fs.writeFileSync(
    newImporter,
    "import { localEnv } from '../scripts/localEnv.js'\nexport const exposed = localEnv\n",
    'utf8',
  )

  const secondReport = inspectArchitecture(root, baseline)
  assert.equal(secondReport.issues.length, 1)
  assert.notEqual(secondReport.issues[0]?.signature, historical.signature)
  assert.match(secondReport.issues[0]?.message ?? '', /src\/newView\.ts/u)
})

test('rejects an architecture baseline entry after its historical issue is removed', (t) => {
  const root = createFixture(t, {
    'src/view.ts': 'export const view = 1\n',
  })
  const baseline: ArchitectureBaseline = {
    allowedIssueSignatures: [
      'dependency-direction:src->server:src/view.ts->server/read.ts',
    ],
  }

  const issues = inspectArchitecture(root, baseline).issues

  assert.equal(issues.length, 1)
  assert.equal(issues[0]?.kind, 'baseline-stale')
})

test('allows thin scripts to call pipeline code but rejects pipeline imports from scripts', (t) => {
  const root = createFixture(t, {
    'pipeline/chat.ts': "import { cliOnly } from '../scripts/cliOnly.js'\nexport const chat = cliOnly\n",
    'scripts/cli.ts': "import { chat } from '../pipeline/chat.js'\nexport const result = chat\n",
    'scripts/cliOnly.ts': 'export const cliOnly = 1\n',
  })

  const issues = inspectArchitecture(root, EMPTY_ARCHITECTURE_BASELINE).issues
  assert.equal(issues.length, 1)
  assert.match(issues[0]?.signature ?? '', /pipeline->scripts/u)
})

test('checks only explicit Git candidate modules when a candidate list is provided', (t) => {
  const root = createFixture(t, {
    'scripts/tmp/local.ts': "import { read } from '../../server/read.js'\nexport const local = read()\n",
    'server/read.ts': 'export const read = () => 1\n',
    'src/view.ts': 'export const view = 1\n',
  })

  const report = inspectArchitecture(
    root,
    EMPTY_ARCHITECTURE_BASELINE,
    ['server/read.ts', 'src/view.ts'],
  )

  assert.deepEqual(report.issues, [])
})
