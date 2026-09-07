import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

test('does not publish the retired offset-based message page contract', () => {
  const root = path.resolve(process.cwd(), 'shared', 'contracts')
  for (const filename of ['chatLibrary.ts', 'chat.ts', 'index.ts']) {
    assert.doesNotMatch(fs.readFileSync(path.join(root, filename), 'utf8'), /WechatMessagePage/u, filename)
  }
})
