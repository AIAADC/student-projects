import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

import { wechatDb } from '../routes/wechat.js'
import { openValidatedWechatDatabase } from './databaseOpener.js'
import {
  createCurrentDatabase,
  createLegacyDatabase,
  fixtureRoot,
} from './databaseOpenerTestFixtures.js'

function currentRejection(root: string) {
  const opened = openValidatedWechatDatabase(root)
  assert.ok(opened.db)
  assert.equal(opened.resolution.source, 'legacy')
  assert.equal(opened.resolution.selectedPath, path.join(root, 'data', 'wechat.db'))
  assert.equal(opened.resolution.rejections.length, 1)
  assert.equal(opened.resolution.rejections[0].source, 'current')
  return opened
}

test('opens the exact minimal legacy messages schema without requiring message_uid', (t) => {
  const root = fixtureRoot(t)
  createLegacyDatabase(root)

  const opened = openValidatedWechatDatabase(root)
  try {
    assert.equal(opened.resolution.source, 'legacy')
    assert.ok(opened.db)
    const columns = opened.db.prepare('PRAGMA table_info(messages)').all() as Array<{ name: string }>
    assert.deepEqual(columns.map((column) => column.name), [
      'conv_id', 'seq', 'time', 'sender', 'sender_name', 'type', 'type_label', 'text',
    ])
  } finally {
    opened.db?.close()
  }
})

test('rejects a current database path that is a directory and opens valid legacy', (t) => {
  const root = fixtureRoot(t)
  fs.mkdirSync(path.join(root, 'data', 'wechat.current', 'wechat.db'), { recursive: true })
  createLegacyDatabase(root)

  const opened = currentRejection(root)
  try {
    assert.equal(opened.resolution.rejections[0].code, 'not-file')
  } finally {
    opened.db?.close()
  }
})

test('rejects corrupt current bytes and opens valid legacy', (t) => {
  const root = fixtureRoot(t)
  const currentPath = path.join(root, 'data', 'wechat.current', 'wechat.db')
  fs.mkdirSync(path.dirname(currentPath), { recursive: true })
  fs.writeFileSync(currentPath, 'not a sqlite database', 'utf8')
  createLegacyDatabase(root)

  const opened = currentRejection(root)
  try {
    assert.equal(opened.resolution.rejections[0].code, 'unreadable')
  } finally {
    opened.db?.close()
  }
})

test('rejects an incomplete current parse run and opens valid legacy', (t) => {
  const root = fixtureRoot(t)
  createCurrentDatabase(root, { run: { status: 'building', completedAt: '' } })
  createLegacyDatabase(root)

  const opened = currentRejection(root)
  try {
    assert.equal(opened.resolution.rejections[0].code, 'invalid-parse-run')
  } finally {
    opened.db?.close()
  }
})

test('rejects nonclosing current parse metadata and opens valid legacy', (t) => {
  const root = fixtureRoot(t)
  createCurrentDatabase(root, { run: { sourceMessages: 3, outputMessages: 2 } })
  createLegacyDatabase(root)

  const opened = currentRejection(root)
  try {
    assert.equal(opened.resolution.rejections[0].code, 'invalid-parse-run')
  } finally {
    opened.db?.close()
  }
})

test('rejects absent current count metadata instead of coercing null to zero', (t) => {
  const root = fixtureRoot(t)
  createCurrentDatabase(root, { run: { deduplicatedMessages: null } })
  createLegacyDatabase(root)

  const opened = currentRejection(root)
  try {
    assert.equal(opened.resolution.rejections[0].code, 'invalid-parse-run')
  } finally {
    opened.db?.close()
  }
})

test('rejects multiple current parse records and opens valid legacy', (t) => {
  const root = fixtureRoot(t)
  createCurrentDatabase(root, { parseRuns: 2 })
  createLegacyDatabase(root)

  const opened = currentRejection(root)
  try {
    assert.equal(opened.resolution.rejections[0].code, 'invalid-parse-run')
  } finally {
    opened.db?.close()
  }
})

test('rejects missing canonical columns and opens valid legacy', (t) => {
  const root = fixtureRoot(t)
  createCurrentDatabase(root, { missingMessageUid: true })
  createLegacyDatabase(root)

  const opened = currentRejection(root)
  try {
    assert.equal(opened.resolution.rejections[0].code, 'invalid-schema')
    assert.match(opened.resolution.rejections[0].detail, /messages\.message_uid/)
  } finally {
    opened.db?.close()
  }
})

test('requires canonical v2 sequence columns on the current bundle', (t) => {
  const root = fixtureRoot(t)
  createCurrentDatabase(root, { missingCanonicalSequence: true })
  createLegacyDatabase(root)

  const opened = currentRejection(root)
  try {
    assert.equal(opened.resolution.rejections[0].code, 'invalid-schema')
    assert.match(opened.resolution.rejections[0].detail, /messages\.canonical_seq/u)
  } finally {
    opened.db?.close()
  }
})

test('rejects unsupported schema versions and invalid IANA archive time zones', (t) => {
  const unsupportedRoot = fixtureRoot(t)
  createCurrentDatabase(unsupportedRoot, { run: { schemaVersion: 1 } })
  createLegacyDatabase(unsupportedRoot)
  const unsupported = currentRejection(unsupportedRoot)
  assert.equal(unsupported.resolution.rejections[0].code, 'invalid-parse-run')
  unsupported.db?.close()

  const invalidZoneRoot = fixtureRoot(t)
  createCurrentDatabase(invalidZoneRoot, { run: { timeZone: 'localtime' } })
  createLegacyDatabase(invalidZoneRoot)
  const invalidZone = currentRejection(invalidZoneRoot)
  assert.equal(invalidZone.resolution.rejections[0].code, 'invalid-parse-run')
  invalidZone.db?.close()
})

test('rejects non-continuous canonical sequences even when legacy time fields look valid', (t) => {
  const root = fixtureRoot(t)
  createCurrentDatabase(root, { canonicalSequences: [0, 2] })
  createLegacyDatabase(root)

  const opened = currentRejection(root)
  try {
    assert.equal(opened.resolution.rejections[0].code, 'invalid-parse-run')
    assert.match(opened.resolution.rejections[0].detail, /canonical sequence/iu)
  } finally {
    opened.db?.close()
  }
})

test('rejects receipts that do not match actual canonical rows or bundle metadata', (t) => {
  const countRoot = fixtureRoot(t)
  createCurrentDatabase(countRoot, { run: { sourceMessages: 3, outputMessages: 3 } })
  createLegacyDatabase(countRoot)
  const countMismatch = currentRejection(countRoot)
  assert.equal(countMismatch.resolution.rejections[0].code, 'invalid-parse-run')
  countMismatch.db?.close()

  const metadataRoot = fixtureRoot(t)
  createCurrentDatabase(metadataRoot, { metadataTimeZone: 'America/Los_Angeles' })
  createLegacyDatabase(metadataRoot)
  const metadataMismatch = currentRejection(metadataRoot)
  assert.equal(metadataMismatch.resolution.rejections[0].code, 'invalid-parse-run')
  metadataMismatch.db?.close()
})

test('prefers a valid complete canonical current database', (t) => {
  const root = fixtureRoot(t)
  const currentPath = createCurrentDatabase(root)
  createLegacyDatabase(root)

  const opened = openValidatedWechatDatabase(root)
  try {
    assert.ok(opened.db)
    assert.equal(opened.resolution.source, 'current')
    assert.equal(opened.resolution.selectedPath, currentPath)
    assert.equal(opened.resolution.currentAvailable, true)
    assert.equal(opened.resolution.legacyAvailable, true)
    assert.deepEqual(opened.resolution.rejections, [])
  } finally {
    opened.db?.close()
  }
})

test('wechat route opener never falls back to a legacy database without an active catalog', (t) => {
  const root = fixtureRoot(t)
  const currentPath = path.join(root, 'data', 'wechat.current', 'wechat.db')
  fs.mkdirSync(path.dirname(currentPath), { recursive: true })
  fs.writeFileSync(currentPath, 'broken current database', 'utf8')
  createLegacyDatabase(root)

  assert.equal(wechatDb(root), null)
})
