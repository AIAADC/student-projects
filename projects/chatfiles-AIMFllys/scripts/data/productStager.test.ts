import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { stageProductCandidate } from './productStager.js'

test('copies a fixed next role into generated staging without modifying the candidate', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chatfiles-product-stage-'))
  t.after(() => fs.rmSync(root, { recursive: true,force: true }))
  const dataRoot = path.join(root, 'data')
  const candidate = path.join(dataRoot, 'wechat.next')
  fs.mkdirSync(candidate, { recursive: true })
  fs.writeFileSync(path.join(candidate, '微信.json'), '{"ok":true}\n', 'utf8')
  const staged = stageProductCandidate({ dataRoot,kind: 'wechat',transactionId: 'txn-stage' })
  assert.equal(fs.readFileSync(path.join(staged.stagingDir, '微信.json'), 'utf8'), '{"ok":true}\n')
  assert.equal(fs.readFileSync(path.join(candidate, '微信.json'), 'utf8'), '{"ok":true}\n')
  assert.throws(() => stageProductCandidate({
    dataRoot,kind: 'wechat',transactionId: 'txn-stage',
  }), /PRODUCT_STAGING_EXISTS/u)
})

test('refuses a generated staging role junction', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chatfiles-product-stage-link-'))
  t.after(() => fs.rmSync(root, { recursive: true,force: true }))
  const dataRoot = path.join(root, 'data')
  const candidate = path.join(dataRoot, 'wechat.next')
  const outside = path.join(root, 'outside')
  fs.mkdirSync(candidate, { recursive: true })
  fs.mkdirSync(outside)
  fs.writeFileSync(path.join(candidate, 'index.json'), '{}\n', 'utf8')
  try { fs.symlinkSync(outside, path.join(dataRoot, 'product-staging'), 'junction') }
  catch { t.skip('This Windows host does not allow creating directory links'); return }
  assert.throws(() => stageProductCandidate({
    dataRoot,kind: 'wechat',transactionId: 'txn-link',
  }), /PRODUCT_STAGING_ROLE_INVALID/u)
  assert.deepEqual(fs.readdirSync(outside), [])
})
