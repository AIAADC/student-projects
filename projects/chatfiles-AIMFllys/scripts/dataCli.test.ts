import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { readCatalogCandidate, runDataCli, type DataCliOperations } from './dataCli.js'
import { createProductCatalog } from './data/catalogTransaction.js'

function operations() {
  const calls: string[] = []
  const value: DataCliOperations = {
    doctor: () => { calls.push('doctor'); return { state: 'ready' } },
    prune: () => { calls.push('prune'); return { dryRun: true,candidates: [] } },
    recover: () => { calls.push('recover'); return { status: 'clean' } },
    rollback: () => { calls.push('rollback'); return { status: 'activated' } },
    activate: () => { calls.push('activate'); return { status: 'activated' } },
    stage: () => { calls.push('stage'); return { status: 'staged' } },
    seal: () => { calls.push('seal'); return { status: 'sealed' } },
    migrate: () => { calls.push('migrate'); return { status: 'activated' } },
  }
  return { calls,value }
}

test('requires an explicit dry-run and emits only sanitized JSON', async () => {
  const fixture = operations()
  const output: string[] = []
  assert.equal(await runDataCli(['prune'], {
    operations: fixture.value,stdout: (value) => output.push(value),stderr: () => {},
  }), 2)
  assert.deepEqual(fixture.calls, [])
  assert.equal(await runDataCli(['prune', '--dry-run'], {
    operations: fixture.value,stdout: (value) => output.push(value),stderr: () => {},
  }), 0)
  assert.deepEqual(fixture.calls, ['prune'])
  assert.equal(output.join('').includes('D:\\private'), false)
})

test('maps lifecycle commands without accepting positional paths', async () => {
  const fixture = operations()
  const deps = { operations: fixture.value,stdout: () => {},stderr: () => {} }
  assert.equal(await runDataCli(['doctor'], deps), 0)
  assert.equal(await runDataCli(['recover'], deps), 0)
  assert.equal(await runDataCli(['stage', 'wechat', '--transaction', 'txn-a'], deps), 0)
  assert.equal(await runDataCli(['seal', 'wechat', '--transaction', 'txn-a'], deps), 0)
  assert.equal(await runDataCli(['activate', '--transaction', 'txn-a'], deps), 0)
  assert.equal(await runDataCli(['rollback', '--transaction', 'txn-b'], deps), 0)
  assert.equal(await runDataCli([
    'migrate','--from-legacy-layout','--transaction','txn-c','--account-root','private-root',
  ], deps), 0)
  assert.deepEqual(fixture.calls, ['doctor','recover','stage','seal','activate','rollback','migrate'])
  assert.equal(await runDataCli(['stage', 'wechat', 'D:\\private'], deps), 2)
})

test('requires an explicit private account root only when sealing assets', async () => {
  const fixture = operations()
  const sealed: unknown[] = []
  fixture.value.seal = (input) => { sealed.push(input); return { status: 'sealed' } }
  const deps = { operations: fixture.value,stdout: () => {},stderr: () => {} }
  assert.equal(await runDataCli([
    'seal','assets','--transaction','txn-assets','--account-root','private-root',
  ], deps), 0)
  assert.deepEqual(sealed, [{ kind: 'assets',transactionId: 'txn-assets',accountRoot: 'private-root' }])
  assert.equal(await runDataCli(['seal','assets','--transaction','txn-missing'], deps), 2)
  assert.equal(await runDataCli(['seal','insights','--transaction','txn-insights'], deps), 0)
})

test('reads only a strict UTF-8 regular candidate for the requested transaction', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chatfiles-data-cli-candidate-'))
  t.after(() => fs.rmSync(root, { recursive: true,force: true }))
  const dataRoot = path.join(root, 'data')
  fs.mkdirSync(dataRoot)
  const reference = {
    bundleSha256: `sha256:${'a'.repeat(64)}`,manifestSha256: `sha256:${'b'.repeat(64)}`,
  }
  const catalog = createProductCatalog({
    transactionId: 'candidate-a',committedAt: '2026-07-13T00:00:00.000Z',
    products: { wechat: reference,assets: reference,library: reference,insights: reference },
  })
  const filename = path.join(dataRoot, 'catalog.next.json')
  fs.writeFileSync(filename, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8')
  assert.equal(readCatalogCandidate(dataRoot, 'candidate-a').transactionId, 'candidate-a')
  assert.throws(() => readCatalogCandidate(dataRoot, 'candidate-b'), /DATA_CATALOG_TRANSACTION_MISMATCH/u)
  fs.writeFileSync(filename, Buffer.from([0xc3, 0x28]))
  assert.throws(() => readCatalogCandidate(dataRoot, 'candidate-a'), /DATA_CATALOG_CANDIDATE_INVALID/u)
})

test('rejects a linked catalog candidate instead of following it', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chatfiles-data-cli-link-'))
  t.after(() => fs.rmSync(root, { recursive: true,force: true }))
  const dataRoot = path.join(root, 'data')
  const outside = path.join(root, 'outside.json')
  fs.mkdirSync(dataRoot)
  fs.writeFileSync(outside, '{}', 'utf8')
  try { fs.symlinkSync(outside, path.join(dataRoot, 'catalog.next.json'), 'file') }
  catch { t.skip('This Windows host does not allow creating file links'); return }
  assert.throws(() => readCatalogCandidate(dataRoot, 'candidate-a'), /DATA_CATALOG_CANDIDATE_UNSAFE/u)
})
