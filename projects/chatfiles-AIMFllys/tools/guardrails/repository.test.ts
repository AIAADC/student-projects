import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test, { type TestContext } from 'node:test'

import {
  EMPTY_REPOSITORY_BASELINE,
  inspectPrivacyPaths,
  inspectSourceSizes,
  inspectUtf8Files,
  listGitCandidateFiles,
  type RepositoryBaseline,
} from './repository.js'

const repositoryRoot = path.resolve(import.meta.dirname, '..', '..')

function createFixture(t: TestContext) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chatfiles-repository-'))
  t.after(() => fs.rmSync(root, { force: true, recursive: true }))
  return root
}

function writeFixture(root: string, relativePath: string, content: string | Buffer) {
  const target = path.join(root, relativePath)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, content)
}

function lines(count: number) {
  return `${Array.from({ length: count }, (_, index) => `export const line${index} = ${index}`).join('\n')}\n`
}

test('allows 300 lines and rejects a new 301-line source file', (t) => {
  const root = createFixture(t)
  writeFixture(root, 'src/exact.ts', lines(300))
  writeFixture(root, 'src/oversized.ts', lines(301))

  const issues = inspectSourceSizes(
    root,
    ['src/exact.ts', 'src/oversized.ts'],
    EMPTY_REPOSITORY_BASELINE,
  )

  assert.equal(issues.length, 1)
  assert.match(issues[0]?.message ?? '', /src\/oversized\.ts.*301/u)
})

test('applies the source-size boundary to pipeline modules', (t) => {
  const root = createFixture(t)
  writeFixture(root, 'pipeline/oversized.ts', lines(301))
  const issues = inspectSourceSizes(root, ['pipeline/oversized.ts'], EMPTY_REPOSITORY_BASELINE)
  assert.equal(issues.length, 1)
  assert.equal(issues[0]?.path, 'pipeline/oversized.ts')
})

test('applies the source-size boundary to Python, SQL, and extensionless scripts', (t) => {
  const root = createFixture(t)
  const candidates = ['pipeline/query.sql', 'scripts/tool.py', 'tools/run']
  writeFixture(root, candidates[0]!, lines(301))
  writeFixture(root, candidates[1]!, lines(301))
  writeFixture(root, candidates[2]!, `#!/usr/bin/env node\n${lines(300)}`)

  const issues = inspectSourceSizes(root, candidates, EMPTY_REPOSITORY_BASELINE)

  assert.deepEqual(issues.map((issue) => issue.path), candidates)
})

test('an oversized baseline is a per-file ceiling and never a blanket exemption', (t) => {
  const root = createFixture(t)
  writeFixture(root, 'tools/legacy.c', lines(333))
  const baseline: RepositoryBaseline = {
    allowedReplacementSignatures: [],
    oversizedLineCaps: { 'tools/legacy.c': 333 },
  }

  assert.deepEqual(inspectSourceSizes(root, ['tools/legacy.c'], baseline), [])

  writeFixture(root, 'tools/legacy.c', lines(334))
  const issues = inspectSourceSizes(root, ['tools/legacy.c'], baseline)
  assert.equal(issues.length, 1)
  assert.match(issues[0]?.message ?? '', /baseline ceiling 333/u)
})

test('requires an oversized baseline cap to ratchet down with the current file', (t) => {
  const root = createFixture(t)
  writeFixture(root, 'tools/legacy.c', lines(332))
  const baseline: RepositoryBaseline = {
    allowedReplacementSignatures: [],
    oversizedLineCaps: { 'tools/legacy.c': 333 },
  }

  const issues = inspectSourceSizes(root, ['tools/legacy.c'], baseline)

  assert.equal(issues.length, 1)
  assert.equal(issues[0]?.kind, 'baseline-stale')
})

test('rejects an oversized baseline entry for a compliant 300-line file', (t) => {
  const root = createFixture(t)
  writeFixture(root, 'tools/compliant.c', lines(300))
  const baseline: RepositoryBaseline = {
    allowedReplacementSignatures: [],
    oversizedLineCaps: { 'tools/compliant.c': 300 },
  }

  const issues = inspectSourceSizes(root, ['tools/compliant.c'], baseline)

  assert.equal(issues.length, 1)
  assert.equal(issues[0]?.kind, 'baseline-stale')
})

test('accepts strict UTF-8 Chinese and rejects malformed byte sequences without leaking content', (t) => {
  const root = createFixture(t)
  writeFixture(root, 'docs/中文.md', '# 中文与 emoji 😀\n')
  writeFixture(root, 'src/broken.ts', Buffer.from([0x65, 0x78, 0x70, 0x6f, 0x72, 0x74, 0xff]))

  const issues = inspectUtf8Files(
    root,
    ['docs/中文.md', 'src/broken.ts'],
    EMPTY_REPOSITORY_BASELINE,
  )

  assert.equal(issues.length, 1)
  assert.equal(issues[0]?.kind, 'invalid-utf8')
  assert.match(issues[0]?.message ?? '', /src\/broken\.ts/u)
  assert.doesNotMatch(issues[0]?.message ?? '', /export/u)
})

test('checks CSV and unknown text extensions while skipping declared binary formats', (t) => {
  const root = createFixture(t)
  writeFixture(root, 'docs/table.csv', Buffer.from([0x61, 0xff]))
  writeFixture(root, 'docs/notes.custom', Buffer.from([0x62, 0xff]))
  writeFixture(root, 'public/pixel.png', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0xff]))

  const issues = inspectUtf8Files(
    root,
    ['docs/notes.custom', 'docs/table.csv', 'public/pixel.png'],
    EMPTY_REPOSITORY_BASELINE,
  )

  assert.deepEqual(issues.map((issue) => issue.path), ['docs/notes.custom', 'docs/table.csv'])
})

test('rejects UTF-16LE and UTF-16BE text with or without a BOM', (t) => {
  const root = createFixture(t)
  const text = 'export const value = 1\n'
  const littleEndian = Buffer.from(text, 'utf16le')
  const bigEndian = Buffer.from(littleEndian)
  for (let index = 0; index < bigEndian.length; index += 2) {
    const first = bigEndian[index]!
    bigEndian[index] = bigEndian[index + 1]!
    bigEndian[index + 1] = first
  }
  const fixtures = {
    'src/le-no-bom.ts': littleEndian,
    'src/le-bom.ts': Buffer.concat([Buffer.from([0xff, 0xfe]), littleEndian]),
    'src/be-no-bom.ts': bigEndian,
    'src/be-bom.ts': Buffer.concat([Buffer.from([0xfe, 0xff]), bigEndian]),
  }
  for (const [relativePath, content] of Object.entries(fixtures)) writeFixture(root, relativePath, content)

  const issues = inspectUtf8Files(root, Object.keys(fixtures), EMPTY_REPOSITORY_BASELINE)

  assert.deepEqual(issues.map((issue) => issue.path), Object.keys(fixtures).sort())
  assert.equal(issues.every((issue) => issue.kind === 'invalid-utf8'), true)
})

test('replacement-character baseline is occurrence-exact and does not hide a new occurrence', (t) => {
  const root = createFixture(t)
  const replacement = String.fromCodePoint(0xfffd)
  writeFixture(root, 'scripts/audit.test.ts', `export const fixture = '损坏${replacement}'\n`)

  const first = inspectUtf8Files(root, ['scripts/audit.test.ts'], EMPTY_REPOSITORY_BASELINE)
  assert.equal(first.length, 1)
  assert.equal(first[0]?.kind, 'replacement-character')

  const baseline: RepositoryBaseline = {
    allowedReplacementSignatures: [first[0]!.signature],
    oversizedLineCaps: {},
  }
  assert.deepEqual(inspectUtf8Files(root, ['scripts/audit.test.ts'], baseline), [])

  writeFixture(
    root,
    'scripts/audit.test.ts',
    `export const fixture = '损坏${replacement}'\nexport const added = '新增${replacement}'\n`,
  )
  const second = inspectUtf8Files(root, ['scripts/audit.test.ts'], baseline)
  assert.equal(second.length, 1)
  assert.match(second[0]?.signature ?? '', /:2:/u)
})

test('replacement baseline cannot be reused by different content at the same coordinate', (t) => {
  const root = createFixture(t)
  const replacement = String.fromCodePoint(0xfffd)
  writeFixture(root, 'scripts/audit.test.ts', `export const fixture = '旧${replacement}'\n`)
  const original = inspectUtf8Files(root, ['scripts/audit.test.ts'], EMPTY_REPOSITORY_BASELINE)
  const baseline: RepositoryBaseline = {
    allowedReplacementSignatures: [original[0]!.signature],
    oversizedLineCaps: {},
  }

  writeFixture(root, 'scripts/audit.test.ts', `export const fixture = '新${replacement}'\n`)
  const issues = inspectUtf8Files(root, ['scripts/audit.test.ts'], baseline)

  assert.equal(issues.some((issue) => issue.kind === 'replacement-character'), true)
  assert.equal(issues.some((issue) => issue.kind === 'baseline-stale'), true)
})

test('privacy guard rejects tracked private paths while allowing public templates', () => {
  const issues = inspectPrivacyPaths([
    '.env.example',
    'docs/database-boundaries.md',
    'src/安全说明.ts',
    '.env.local',
    'data/wechat.db',
    'keys/private.pem',
    'logs/chat.log',
    'machine.local',
    'scripts/_test_contact.png',
    'scripts/aggregateInsightsByCategory.ts',
    'scripts/find_image_key.py',
    'scripts/tmp/chat.json',
    'tools/debug.exe',
  ])

  assert.deepEqual(
    issues.map((issue) => issue.path),
    [
      '.env.local',
      'data/wechat.db',
      'keys/private.pem',
      'logs/chat.log',
      'machine.local',
      'scripts/_test_contact.png',
      'scripts/aggregateInsightsByCategory.ts',
      'scripts/find_image_key.py',
      'scripts/tmp/chat.json',
      'tools/debug.exe',
    ],
  )
})

test('privacy guard catches representative ignored paths even when force-added', (t) => {
  const root = createFixture(t)
  execFileSync('git', ['init', '--quiet'], { cwd: root })
  writeFixture(root, '.gitignore', 'logs/\nscripts/tmp/\nscripts/_test_*.png\n')
  const privateFiles = ['logs/chat.log', 'scripts/_test_contact.png', 'scripts/tmp/chat.json']
  for (const privateFile of privateFiles) writeFixture(root, privateFile, 'private')
  execFileSync('git', ['add', '-f', ...privateFiles], { cwd: root })

  const issues = inspectPrivacyPaths(listGitCandidateFiles(root))

  assert.deepEqual(issues.map((issue) => issue.path), privateFiles)
})

test('git candidate discovery includes tracked private files and untracked non-ignored files', (t) => {
  const root = createFixture(t)
  execFileSync('git', ['init', '--quiet'], { cwd: root })
  writeFixture(root, '.gitignore', 'data/\n')
  writeFixture(root, 'data/聊天.db', 'private')
  writeFixture(root, 'src/新增.ts', 'export const value = 1\n')
  execFileSync('git', ['add', '-f', 'data/聊天.db'], { cwd: root })

  assert.deepEqual(listGitCandidateFiles(root), ['.gitignore', 'data/聊天.db', 'src/新增.ts'])
})

test('git ignores only the root private data role, not source directories named data', () => {
  const isIgnored = (relativePath: string) => spawnSync(
    'git',
    ['check-ignore', '--quiet', '--no-index', '--', relativePath],
    { cwd: repositoryRoot },
  ).status === 0

  assert.equal(isIgnored('data/guardrail-private.db'), true)
  assert.equal(isIgnored('scripts/data/guardrail-source.ts'), false)
  assert.equal(isIgnored('server/data/guardrail-source.ts'), false)
})

test('content checks skip a candidate deleted from the working tree', (t) => {
  const root = createFixture(t)
  const deleted = ['src/deleted.ts']

  assert.deepEqual(inspectSourceSizes(root, deleted, EMPTY_REPOSITORY_BASELINE), [])
  assert.deepEqual(inspectUtf8Files(root, deleted, EMPTY_REPOSITORY_BASELINE), [])
})
