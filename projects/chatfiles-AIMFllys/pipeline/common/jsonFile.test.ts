import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

test('shares one UTF-8 JSON fallback reader across offline pipelines', async (t) => {
  const modulePath = path.resolve(process.cwd(), 'pipeline/common/jsonFile.ts')
  assert.equal(fs.existsSync(modulePath), true, 'pipeline/common/jsonFile.ts must exist')
  if (!fs.existsSync(modulePath)) return
  const { readJsonFile } = await import('./jsonFile.js')
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chatfiles-json-reader-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const valid = path.join(root, '中文.json')
  const invalid = path.join(root, 'invalid.json')
  fs.writeFileSync(valid, JSON.stringify({ text: '中文🙂' }), 'utf8')
  fs.writeFileSync(invalid, '{', 'utf8')
  assert.deepEqual(readJsonFile(valid, { text: '' }), { text: '中文🙂' })
  assert.throws(() => readJsonFile(invalid, { text: 'fallback' }))
  assert.deepEqual(readJsonFile(path.join(root, 'missing.json'), { ok: false }), { ok: false })
})
