import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'
import { auditMaterializedPaths } from './conversationMediaAudit.js'

test('audits the complete materialized payload instead of trusting a valid header', (t) => {
  const bundleDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chatfiles-media-audit-'))
  t.after(() => fs.rmSync(bundleDir, { recursive: true, force: true }))
  fs.mkdirSync(path.join(bundleDir, 'media'))
  const bytes = Buffer.concat([Buffer.from([0xff,0xd8,0xff,0xe0]),Buffer.alloc(40, 0x41)])
  const relativePath = 'media/invalid.jpg'
  fs.writeFileSync(path.join(bundleDir, ...relativePath.split('/')), bytes)
  const database = new DatabaseSync(':memory:')
  t.after(() => database.close())
  database.exec(`
    CREATE TABLE asset_sources(source_id TEXT PRIMARY KEY,source_kind TEXT,source_relative_path TEXT);
    CREATE TABLE asset_materializations(
      source_id TEXT,asset_id TEXT,status TEXT,materialized_relative_path TEXT,
      materialized_size INTEGER,materialized_content_sha256 TEXT,media_format TEXT
    );
    INSERT INTO asset_sources VALUES('source','resource','attach/image.dat');
  `)
  const digest = `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`
  database.prepare('INSERT INTO asset_materializations VALUES(?,?,?,?,?,?,?)').run(
    'source','asset','ready',relativePath,bytes.length,digest,'jpeg',
  )
  const issues: string[] = []
  auditMaterializedPaths(database, bundleDir, (code) => issues.push(code))
  assert.equal(issues.includes('materialized-media-magic-mismatch'), true)
})
