import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

test('keeps one canonical architecture source and labels every replication supplement', async () => {
  const modulePath = path.resolve(process.cwd(), 'tools/documentation/policy.ts')
  assert.equal(fs.existsSync(modulePath), true, 'tools/documentation/policy.ts must exist')
  if (!fs.existsSync(modulePath)) return
  const { inspectDocumentation } = await import('./policy.js')
  assert.deepEqual(inspectDocumentation(process.cwd()), [])
})

test('rejects a retired production claim in any replication supplement', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chatfiles-doc-policy-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  fs.cpSync(path.resolve(process.cwd(), 'replication'), path.join(root, 'replication'), { recursive: true })
  fs.mkdirSync(path.join(root, 'docs'), { recursive: true })
  fs.copyFileSync(path.resolve(process.cwd(), 'docs', 'README.md'), path.join(root, 'docs', 'README.md'))
  fs.copyFileSync(path.resolve(process.cwd(), 'README.md'), path.join(root, 'README.md'))
  fs.appendFileSync(
    path.join(root, 'replication', 'docs', 'RUNBOOK.md'),
    '\nGET /api/wechat/conversation/:id/transcript\n',
    'utf8',
  )
  const { inspectDocumentation } = await import('./policy.js')
  assert.ok(inspectDocumentation(root).some((issue) => issue.message.includes('retired claim')))
})
