import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { DatabaseSync } from 'node:sqlite'
import { pathToFileURL } from 'node:url'
import { activateCatalog, createProductCatalog } from './data/catalogTransaction.js'
import { sealedProductSet } from './data/catalogTestSupport.js'

test('builds bundle-zone second-precision digests in canonical sequence order', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chatfiles-prep-digest-'))
  t.after(() => fs.rmSync(root, { force: true, recursive: true }))
  const databasePath = path.join(root, 'custom-wechat.db')
  fs.mkdirSync(path.dirname(databasePath), { recursive: true })
  const db = new DatabaseSync(databasePath)
  db.exec(`
    CREATE TABLE parse_runs(
      run_id TEXT,status TEXT,completed_at TEXT,schema_version INTEGER,time_zone TEXT
    );
    CREATE TABLE conversations(
      id TEXT,display TEXT,is_group INTEGER,msg_count INTEGER,text_count INTEGER,
      first_time INTEGER,last_time INTEGER
    );
    CREATE TABLE messages(
      conv_id TEXT,message_uid TEXT,canonical_seq INTEGER,occurred_at_epoch_s INTEGER,
      time INTEGER,sender_name TEXT,type INTEGER,text TEXT
    );
    INSERT INTO parse_runs VALUES('run-v2','complete','2026-07-13T00:00:00.000Z',2,'Asia/Shanghai');
    INSERT INTO conversations VALUES('conv','测试群',1,20,20,1700000000,1700000000);
  `)
  const insert = db.prepare('INSERT INTO messages VALUES(?,?,?,?,?,?,?,?)')
  for (let sequence = 0; sequence < 20; sequence += 1) {
    insert.run(
      'conv', `uid-${String(19 - sequence).padStart(2, '0')}`, sequence,
      1_700_000_000, 1_700_000_000, '成员', 1, `规范顺序${String(sequence).padStart(2, '0')}`,
    )
  }
  db.close()
  const products = sealedProductSet(t, root, 'digest', { wechatDatabasePath: databasePath })
  activateCatalog({ dataRoot: products.dataRoot,catalog: createProductCatalog({
    transactionId: 'digest-current',committedAt: '2026-07-13T00:00:00.000Z',
    products: products.references,
  }) })

  const cli = spawnSync(process.execPath, [
    '--import', pathToFileURL(path.resolve(process.cwd(), 'node_modules', 'tsx', 'dist', 'loader.mjs')).href,
    path.resolve(process.cwd(), 'scripts', 'prepChatDigests.ts'),
  ], { cwd: root, encoding: 'utf8' })

  assert.equal(cli.status, 0, cli.stderr || cli.stdout)
  const digestFile = fs.readdirSync(path.join(root, 'work', 'chat-digest'))[0]!
  const digest = fs.readFileSync(path.join(root, 'work', 'chat-digest', digestFile), 'utf8')
  assert.match(digest, /\[2023-11-15 06:13:20 \+08:00\] 成员: 规范顺序00/u)
  assert.ok(digest.indexOf('规范顺序00') < digest.indexOf('规范顺序01'))
  assert.equal(digest.includes('.000'), false)
})

test('does not fall back to a legacy root database when the catalog is missing', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chatfiles-prep-legacy-'))
  t.after(() => fs.rmSync(root, { force: true,recursive: true }))
  fs.mkdirSync(path.join(root, 'data'), { recursive: true })
  const database = new DatabaseSync(path.join(root, 'data', 'wechat.db'))
  database.exec('CREATE TABLE conversations(id TEXT); CREATE TABLE messages(conv_id TEXT)')
  database.close()
  const cli = spawnSync(process.execPath, [
    '--import',pathToFileURL(path.resolve(process.cwd(), 'node_modules', 'tsx', 'dist', 'loader.mjs')).href,
    path.resolve(process.cwd(), 'scripts', 'prepChatDigests.ts'),
  ], { cwd: root,encoding: 'utf8' })
  assert.notEqual(cli.status, 0)
  assert.equal(fs.existsSync(path.join(root, 'work', 'chat-digest')), false)
})
