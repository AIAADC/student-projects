import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { readBoundedUtf8Text } from './boundedTextReader.js'

test('preserves valid UTF-8 Chinese and emoji within the byte budget', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'chatfiles-text-reader-'))
  const target = path.join(directory, '说明.txt')
  const text = '中文正文🙂\n第二行'
  fs.writeFileSync(target, text, 'utf8')
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  assert.equal(await readBoundedUtf8Text(target, Buffer.byteLength(text)), text)
  await assert.rejects(readBoundedUtf8Text(target, Buffer.byteLength(text) - 1), /text_preview_too_large/u)
})

test('rejects malformed UTF-8 instead of returning replacement characters', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'chatfiles-text-invalid-'))
  const target = path.join(directory, '损坏.txt')
  fs.writeFileSync(target, Buffer.from([0xe4, 0xb8]))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  await assert.rejects(readBoundedUtf8Text(target, 10), /invalid_utf8_text/u)
})
