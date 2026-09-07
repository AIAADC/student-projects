import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

test('detects a same-size source replacement from an incremental content digest', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chatfiles-content-digest-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const source = path.join(root, '同大小素材.dat')
  const support = await import('./assetContentDigest.js')
    .catch(() => null) as Record<string, unknown> | null

  assert.equal(typeof support?.digestFileContent, 'function')
  const digest = support?.digestFileContent as (filename: string, chunkSize?: number) => string
  fs.writeFileSync(source, Buffer.from('AAAA'))
  const first = digest(source, 2)
  fs.writeFileSync(source, Buffer.from('BBBB'))
  const second = digest(source, 2)

  assert.match(first, /^sha256:[a-f0-9]{64}$/u)
  assert.notEqual(first, second)
  assert.equal(fs.statSync(source).size, 4)
})
