import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import type { ProductKind } from '../../shared/contracts/productCatalog.js'
import { migrateLegacyLayout } from './legacyMigration.js'

test('copies fixed legacy roles, activates last, and never mutates the legacy trees', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chatfiles-legacy-migrate-'))
  t.after(() => fs.rmSync(root, { recursive: true,force: true }))
  const roles = {
    wechat: 'wechat.current',assets: 'chat-assets.current',
    library: 'library.current',insights: 'insights',
  } as const
  const before = new Map<string, { bytes: Buffer;mtimeMs: number }>()
  for (const [kind, role] of Object.entries(roles)) {
    const filename = path.join(root, 'data', role, `${kind}.txt`)
    fs.mkdirSync(path.dirname(filename), { recursive: true })
    fs.writeFileSync(filename, `中文-${kind}`, 'utf8')
    before.set(filename, { bytes: fs.readFileSync(filename),mtimeMs: fs.statSync(filename).mtimeMs })
  }
  const accountRoot = path.join(root, 'private-account')
  fs.mkdirSync(accountRoot)
  const calls: string[] = []
  const result = migrateLegacyLayout({
    projectRoot: root,transactionId: 'migration-a',accountRoot,
    operations: {
      seal: ({ kind }: { kind: ProductKind }) => { calls.push(`seal:${kind}`) },
      activate: () => { calls.push('activate'); return { sha256: `sha256:${'a'.repeat(64)}` } },
    },
  })
  assert.deepEqual(calls, ['seal:wechat','seal:assets','seal:library','seal:insights','activate'])
  assert.equal(result.status, 'activated')
  for (const [filename, evidence] of before) {
    assert.deepEqual(fs.readFileSync(filename), evidence.bytes)
    assert.equal(fs.statSync(filename).mtimeMs, evidence.mtimeMs)
  }
  const receipt = fs.readFileSync(
    path.join(root, 'data', 'migration-receipts', 'migration-a.json'),'utf8',
  )
  assert.equal(receipt.includes(root), false)
  assert.equal(receipt.includes(accountRoot), false)
})

test('never activates or mutates legacy sources when an intermediate seal fails', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chatfiles-legacy-failure-'))
  t.after(() => fs.rmSync(root, { recursive: true,force: true }))
  const roles = {
    wechat: 'wechat.current',assets: 'chat-assets.current',
    library: 'library.current',insights: 'insights',
  } as const
  const evidence = new Map<string, Buffer>()
  for (const [kind, role] of Object.entries(roles)) {
    const filename = path.join(root, 'data', role, `${kind}.txt`)
    fs.mkdirSync(path.dirname(filename), { recursive: true })
    fs.writeFileSync(filename, `只读-${kind}`, 'utf8')
    evidence.set(filename, fs.readFileSync(filename))
  }
  const accountRoot = path.join(root, 'account')
  fs.mkdirSync(accountRoot)
  let activated = false
  assert.throws(() => migrateLegacyLayout({
    projectRoot: root,transactionId: 'migration-failure',accountRoot,
    operations: {
      seal: ({ kind }) => { if (kind === 'assets') throw new Error('SEAL_FAILED') },
      activate: () => { activated = true; return { sha256: `sha256:${'a'.repeat(64)}` } },
    },
  }), /SEAL_FAILED/u)
  assert.equal(activated, false)
  for (const [filename, bytes] of evidence) assert.deepEqual(fs.readFileSync(filename), bytes)
  assert.equal(fs.existsSync(path.join(
    root,'data','migration-receipts','migration-failure.json',
  )), false)
})
