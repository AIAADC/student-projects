import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'
import CipherDatabase from 'better-sqlite3-multiple-ciphers'
import { runSqlcipherSnapshotHelper } from './sqlcipherSnapshotHelper.js'

test('snapshots a live SQLCipher WAL database through readonly_shm without exposing its key', {
  skip: !process.env.CHATFILES_SQLCIPHER_HELPER,
}, async () => {
  const executablePath = process.env.CHATFILES_SQLCIPHER_HELPER
  assert.ok(executablePath, 'CHATFILES_SQLCIPHER_HELPER is required for the native fixture')

  const fixtureDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'chatfiles-sqlcipher-helper-'))
  const sourcePath = path.join(fixtureDirectory, '中文源.db')
  const destinationPath = path.join(fixtureDirectory, '中文副本.db')
  const key = Buffer.from(Array.from({ length: 32 }, (_, index) => index + 21))
  const rawKey = Buffer.concat([Buffer.from('raw:', 'ascii'), key])
  const source = new CipherDatabase(sourcePath)
  try {
    source.pragma("cipher='sqlcipher'")
    source.pragma('legacy=4')
    source.key(rawKey)
    rawKey.fill(0)
    source.pragma('journal_mode=WAL')
    source.exec('CREATE TABLE 记录(id INTEGER PRIMARY KEY, 内容 TEXT NOT NULL)')
    source.exec('CREATE TABLE 待移除(id INTEGER PRIMARY KEY, 内容 TEXT)')
    source.exec('CREATE TABLE 保留表(id INTEGER PRIMARY KEY, 内容 TEXT NOT NULL)')
    source.exec('DROP TABLE 待移除')
    source.prepare('INSERT INTO 记录(内容) VALUES (?)').run('中文保持完整')
    source.prepare('INSERT INTO 保留表(内容) VALUES (?)').run('物理页可重排')
    source.pragma('wal_checkpoint(FULL)')
    assert.equal(fs.existsSync(destinationPath), false)

    const result = await runSqlcipherSnapshotHelper({
      executablePath,
      sourcePath,
      destinationPath,
      key: Buffer.from(key),
    })

    assert.ok(result.schemaObjects >= 1)
    const plain = new DatabaseSync(destinationPath, { readOnly: true })
    try {
      assert.equal(plain.prepare('SELECT 内容 FROM 记录').get()?.内容, '中文保持完整')
      assert.equal(plain.prepare('SELECT 内容 FROM 保留表').get()?.内容, '物理页可重排')
      assert.equal(plain.prepare('PRAGMA integrity_check').get()?.integrity_check, 'ok')
    } finally {
      plain.close()
    }

    const existingPath = path.join(fixtureDirectory, '禁止覆盖.db')
    const sentinel = Buffer.from('禁止覆盖现有文件', 'utf8')
    fs.writeFileSync(existingPath, sentinel, { flag: 'wx' })
    await assert.rejects(
      runSqlcipherSnapshotHelper({
        executablePath,
        sourcePath,
        destinationPath: existingPath,
        key: Buffer.from(key),
      }),
      (error: unknown) => (
        error instanceof Error
        && (error as Error & { code?: string }).code === 'HELPER_NATIVE_E_DESTINATION_EXISTS'
      ),
    )
    assert.deepEqual(fs.readFileSync(existingPath), sentinel)
  } finally {
    rawKey.fill(0)
    key.fill(0)
    source.close()
  }
})

test('accepts a valid encrypted WAL database whose logical schema is empty', {
  skip: !process.env.CHATFILES_SQLCIPHER_HELPER,
}, async () => {
  const executablePath = process.env.CHATFILES_SQLCIPHER_HELPER
  assert.ok(executablePath, 'CHATFILES_SQLCIPHER_HELPER is required for the native fixture')

  const fixtureDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'chatfiles-empty-schema-'))
  const sourcePath = path.join(fixtureDirectory, '空模式源.db')
  const destinationPath = path.join(fixtureDirectory, '空模式副本.db')
  const key = Buffer.alloc(32, 0x65)
  const rawKey = Buffer.concat([Buffer.from('raw:', 'ascii'), key])
  const source = new CipherDatabase(sourcePath)
  try {
    source.pragma("cipher='sqlcipher'")
    source.pragma('legacy=4')
    source.key(rawKey)
    rawKey.fill(0)
    source.pragma('journal_mode=WAL')
    source.exec('CREATE TABLE 临时表(id INTEGER PRIMARY KEY)')
    source.exec('DROP TABLE 临时表')
    source.pragma('wal_checkpoint(FULL)')

    const result = await runSqlcipherSnapshotHelper({
      executablePath,
      sourcePath,
      destinationPath,
      key: Buffer.from(key),
    })

    assert.equal(result.schemaObjects, 0)
    const plain = new DatabaseSync(destinationPath, { readOnly: true })
    try {
      assert.equal(plain.prepare('SELECT count(*) AS count FROM sqlite_schema').get()?.count, 0)
      assert.equal(plain.prepare('PRAGMA integrity_check').get()?.integrity_check, 'ok')
    } finally {
      plain.close()
    }
  } finally {
    rawKey.fill(0)
    key.fill(0)
    source.close()
  }
})
