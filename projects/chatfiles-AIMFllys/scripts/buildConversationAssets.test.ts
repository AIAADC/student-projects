import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'

test('resolves its canonical WeChat database from the active product catalog', () => {
  const source = fs.readFileSync(path.resolve(process.cwd(), 'scripts/buildConversationAssets.ts'), 'utf8')
  assert.match(source, /resolveCurrentProductEntrypoint/u)
  assert.doesNotMatch(source, /wechat\.current/u)
})

test('selects an account root by canonical owner instead of database size', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chatfiles-account-owner-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const selected = path.join(root, 'wxid_selected')
  const larger = path.join(root, 'wxid_larger')
  fs.mkdirSync(path.join(selected, 'db_storage', 'message'), { recursive: true })
  fs.mkdirSync(path.join(larger, 'db_storage', 'message'), { recursive: true })
  fs.writeFileSync(path.join(selected, 'db_storage', 'message', 'message_0.db'), 'small')
  fs.writeFileSync(path.join(larger, 'db_storage', 'message', 'message_0.db'), 'much-larger-database')
  const module = await import('./buildConversationAssets.js') as Record<string, unknown>

  assert.equal(typeof module.accountRootForOwner, 'function')
  const select = module.accountRootForOwner as (store: string, owner: string) => string
  assert.equal(select(root, 'wxid_selected'), fs.realpathSync(selected))
  assert.throws(() => select(root, 'wxid_unknown'), /WECHAT_ACCOUNT_FOR_OWNER_NOT_FOUND/u)
})

test('rejects an owner directory without a regular message database', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chatfiles-account-stale-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  fs.mkdirSync(path.join(root, 'wxid_empty', 'db_storage', 'message'), { recursive: true })
  fs.mkdirSync(
    path.join(root, 'wxid_directory_db', 'db_storage', 'message', 'message_0.db'),
    { recursive: true },
  )
  const module = await import('./buildConversationAssets.js') as Record<string, unknown>
  const select = module.accountRootForOwner as (store: string, owner: string) => string

  assert.throws(() => select(root, 'wxid_empty'), /WECHAT_ACCOUNT_FOR_OWNER_NOT_FOUND/u)
  assert.throws(() => select(root, 'wxid_directory_db'), /WECHAT_ACCOUNT_FOR_OWNER_NOT_FOUND/u)
})

test('rejects a message database leaf symlink', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chatfiles-account-leaf-link-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const account = path.join(root, 'wxid_linked')
  const external = path.join(root, 'external.db')
  fs.mkdirSync(path.join(account, 'db_storage', 'message'), { recursive: true })
  fs.writeFileSync(external, 'external')
  try {
    fs.symlinkSync(external, path.join(account, 'db_storage', 'message', 'message_0.db'), 'file')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EPERM') {
      t.skip('This Windows host does not allow creating file symlinks')
      return
    }
    throw error
  }
  const module = await import('./buildConversationAssets.js') as Record<string, unknown>
  const select = module.accountRootForOwner as (store: string, owner: string) => string

  assert.throws(() => select(root, 'wxid_linked'), /WECHAT_ACCOUNT_FOR_OWNER_NOT_FOUND/u)
})

test('rejects a message database that escapes through a directory link', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chatfiles-account-dir-link-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const account = path.join(root, 'wxid_escape')
  const externalMessage = path.join(root, 'external-message')
  fs.mkdirSync(path.join(account, 'db_storage'), { recursive: true })
  fs.mkdirSync(externalMessage)
  fs.writeFileSync(path.join(externalMessage, 'message_0.db'), 'external')
  fs.symlinkSync(
    externalMessage,
    path.join(account, 'db_storage', 'message'),
    process.platform === 'win32' ? 'junction' : 'dir',
  )
  const module = await import('./buildConversationAssets.js') as Record<string, unknown>
  const select = module.accountRootForOwner as (store: string, owner: string) => string

  assert.throws(() => select(root, 'wxid_escape'), /WECHAT_ACCOUNT_FOR_OWNER_NOT_FOUND/u)
})

test('selects an audit account from the persisted owner and account-root fingerprint', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chatfiles-account-binding-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const selected = path.join(root, 'wxid_selected')
  const other = path.join(root, 'wxid_other')
  fs.mkdirSync(path.join(selected, 'db_storage', 'message'), { recursive: true })
  fs.mkdirSync(path.join(other, 'db_storage', 'message'), { recursive: true })
  fs.writeFileSync(path.join(selected, 'db_storage', 'message', 'message_0.db'), 'selected')
  fs.writeFileSync(path.join(other, 'db_storage', 'message', 'message_0.db'), 'other')
  const bundleDir = path.join(root, 'bundle')
  fs.mkdirSync(bundleDir)
  const database = new DatabaseSync(path.join(bundleDir, 'artifacts.db'))
  database.exec('CREATE TABLE asset_runs(owner TEXT,account_root_fingerprint TEXT)')
  const crypto = await import('node:crypto')
  const canonical = process.platform === 'win32'
    ? fs.realpathSync(selected).toLowerCase()
    : fs.realpathSync(selected)
  const fingerprint = `sha256:${crypto.createHash('sha256')
    .update(`chatfiles-path-v1\0${canonical}`, 'utf8').digest('hex')}`
  database.prepare('INSERT INTO asset_runs VALUES(?,?)').run('wxid_selected', fingerprint)
  database.close()
  const module = await import('./buildConversationAssets.js') as Record<string, unknown>

  assert.equal(typeof module.accountRootForAssetBundle, 'function')
  const select = module.accountRootForAssetBundle as (store: string, bundle: string) => string
  assert.equal(select(root, bundleDir), fs.realpathSync(selected))
})
