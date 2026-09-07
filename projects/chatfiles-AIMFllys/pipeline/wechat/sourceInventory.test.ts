import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { discoverSourceDatabases } from './sourceInventory.js'

test('discovers every regular, biz, media and resource shard dynamically', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chatfiles-source-inventory-'))
  t.after(() => fs.rmSync(root, { force: true, recursive: true }))
  const messageDir = path.join(root, 'db_storage', 'message')
  fs.mkdirSync(messageDir, { recursive: true })
  for (const name of [
    'message_0.db', 'message_7.db', 'biz_message_0.db', 'media_4.db',
    'message_resource.db', 'unexpected.db',
  ]) fs.writeFileSync(path.join(messageDir, name), '')

  assert.deepEqual(
    discoverSourceDatabases(root).map(({ domain, filename }) => ({ domain, filename })),
    [
      { domain: 'biz', filename: 'biz_message_0.db' },
      { domain: 'media', filename: 'media_4.db' },
      { domain: 'regular', filename: 'message_0.db' },
      { domain: 'regular', filename: 'message_7.db' },
      { domain: 'resource', filename: 'message_resource.db' },
      { domain: 'unknown', filename: 'unexpected.db' },
    ],
  )
})

test('rejects a message directory that escapes the snapshot through a directory link', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chatfiles-source-junction-'))
  t.after(() => fs.rmSync(root, { force: true, recursive: true }))
  const snapshot = path.join(root, 'snapshot')
  const externalMessage = path.join(root, 'external-message')
  fs.mkdirSync(path.join(snapshot, 'db_storage'), { recursive: true })
  fs.mkdirSync(externalMessage)
  fs.writeFileSync(path.join(externalMessage, 'message_0.db'), '')
  fs.writeFileSync(path.join(externalMessage, 'message_resource.db'), '')
  fs.symlinkSync(
    externalMessage,
    path.join(snapshot, 'db_storage', 'message'),
    process.platform === 'win32' ? 'junction' : 'dir',
  )

  assert.throws(() => discoverSourceDatabases(snapshot), /SOURCE_SNAPSHOT_PATH_UNSAFE/u)
})
