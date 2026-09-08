import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { sha256File } from './shared.js'

test('streaming SHA-256 matches the digest of the same UTF-8 bytes across many chunks', async (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chatfiles-hash-'))
  const filePath = path.join(tempDir, '中文附件.txt')
  const payload = Buffer.from('人物ID与对话内容必须统一。\n'.repeat(4096), 'utf8')
  fs.writeFileSync(filePath, payload, { flag: 'wx' })
  t.after(() => {
    fs.unlinkSync(filePath)
    fs.rmdirSync(tempDir)
  })

  const expected = crypto.createHash('sha256').update(payload).digest('hex')
  const actual = await sha256File(filePath, { highWaterMark: 97 })

  assert.equal(actual, expected)
})
