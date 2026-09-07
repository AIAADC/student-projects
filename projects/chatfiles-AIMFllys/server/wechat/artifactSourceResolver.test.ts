import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test, { type TestContext } from 'node:test'
import { DatabaseSync } from 'node:sqlite'

import {
  createArtifactAccountRootProvider,
  createArtifactSourceResolver,
} from './artifactSourceResolver.js'
type AssetOptions = {
  id?: string
  kind?: string
  name?: string
  preview?: string
  relativePath?: string | null
  sourceSize?: number | null
  materialization?: string
  previewStatus?: string
  sourceContentSha256?: string | null
}

function fixture(t: TestContext) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chatfiles-artifact-source-'))
  const accountRoot = path.join(root, 'wxid_fixture')
  fs.mkdirSync(accountRoot)
  const assetDb = new DatabaseSync(':memory:')
  assetDb.exec(`
    CREATE TABLE artifacts(
      asset_id TEXT PRIMARY KEY, conv_id TEXT, category TEXT, kind TEXT, name TEXT,
      preview TEXT, url TEXT, source_relative_path TEXT, source_size INTEGER,
      created_at INTEGER, sender_name TEXT, materialization TEXT, preview_status TEXT,
      source_content_sha256 TEXT
    );
  `)
  const insert = assetDb.prepare('INSERT INTO artifacts VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
  let sequence = 0
  const addAsset = (options: AssetOptions = {}) => {
    sequence += 1
    const id = options.id ?? sequence.toString(16).padStart(64, '0')
    insert.run(
      id, 'conv-a', 'document', options.kind ?? 'resource', options.name ?? 'fixture.txt',
      options.preview ?? 'text', null, options.relativePath ?? null, options.sourceSize ?? null,
      100, 'Fixture', options.materialization ?? 'exported', options.previewStatus ?? 'ready',
      options.sourceContentSha256 ?? null,
    )
    return id
  }
  t.after(() => {
    assetDb.close()
    fs.rmSync(root, { recursive: true, force: true })
  })
  return { root, accountRoot, assetDb, addAsset }
}

function writeSource(accountRoot: string, relativePath: string, content: string | Buffer) {
  const target = path.join(accountRoot, ...relativePath.split('/'))
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, content)
  return target
}

function accountRootFingerprint(accountRoot: string) {
  const resolved = fs.realpathSync(accountRoot)
  const canonical = process.platform === 'win32' ? resolved.toLowerCase() : resolved
  return `sha256:${crypto.createHash('sha256').update(`chatfiles-path-v1\0${canonical}`, 'utf8').digest('hex')}`
}

test('rejects malformed IDs before querying and returns unknown for absent valid IDs', (t) => {
  const { accountRoot, assetDb } = fixture(t)
  const resolver = createArtifactSourceResolver({ assetDb, accountRoot })

  assert.deepEqual(resolver.resolve('A'.repeat(64), 'content'), { status: 'malformed' })
  assert.deepEqual(resolver.resolve('a'.repeat(63), 'content'), { status: 'malformed' })
  assert.deepEqual(resolver.resolve('a'.repeat(64), 'content'), { status: 'unknown' })
})

test('resolves a ready UTF-8 filename only inside the real account root with exact size', (t) => {
  const { accountRoot, assetDb, addAsset } = fixture(t)
  const relativePath = 'msg/file/中文资料.pdf'
  const target = writeSource(accountRoot, relativePath, 'pdf fixture')
  const id = addAsset({ name: '中文资料.pdf', preview: 'pdf', relativePath, sourceSize: 11 })
  const resolver = createArtifactSourceResolver({ assetDb, accountRoot })

  const result = resolver.resolve(id, 'content')
  assert.equal(result.status, 'available')
  if (result.status === 'available') {
    assert.equal(result.state, 'ready')
    assert.equal(result.target, fs.realpathSync(target))
    assert.equal(result.asset.name, '中文资料.pdf')
  }
})

test('preserves known unavailable states and never guesses sources for voice or links', (t) => {
  const { accountRoot, assetDb, addAsset } = fixture(t)
  writeSource(accountRoot, 'secret.dat', 'secret')
  const decrypt = addAsset({ relativePath: 'secret.dat', sourceSize: 6, materialization: 'decrypt_failed', previewStatus: 'decrypt_failed' })
  const missing = addAsset({ relativePath: null, materialization: 'missing_source', previewStatus: 'missing_source' })
  const ambiguous = addAsset({ relativePath: null, materialization: 'source_ambiguous', previewStatus: 'source_ambiguous' })
  const mismatch = addAsset({ relativePath: null, materialization: 'hash_mismatch', previewStatus: 'hash_mismatch' })
  const voice = addAsset({ kind: 'voice', preview: 'voice', relativePath: null, materialization: 'missing_source', previewStatus: 'missing_source' })
  const link = addAsset({ kind: 'link', preview: 'link', relativePath: null })
  const resolver = createArtifactSourceResolver({ assetDb, accountRoot })

  assert.equal(resolver.resolve(decrypt, 'content').status, 'unavailable')
  assert.equal(resolver.resolve(decrypt, 'content').state, 'decrypt_failed')
  assert.equal(resolver.resolve(missing, 'content').state, 'missing_source')
  assert.equal(resolver.resolve(ambiguous, 'content').state, 'source_ambiguous')
  assert.equal(resolver.resolve(mismatch, 'content').state, 'hash_mismatch')
  assert.equal(resolver.resolve(voice, 'content').status, 'unavailable')
  assert.equal(resolver.resolve(voice, 'content').state, 'missing_source')
  assert.equal(resolver.resolve(link, 'content').status, 'unsupported')
})
test('rejects traversal, absolute, UNC, device, ADS, empty, and dot path segments', (t) => {
  const { accountRoot, assetDb, addAsset } = fixture(t)
  const paths = [
    '../outside.txt',
    '/absolute.txt',
    'C:\\absolute.txt',
    '\\\\server\\share\\file.txt',
    '\\\\?\\C:\\device.txt',
    'safe/file.txt:stream',
    'safe//file.txt',
    './safe.txt',
    'safe/./file.txt',
    'safe/../file.txt',
    'safe/\u0000file.txt',
  ]
  const resolver = createArtifactSourceResolver({ assetDb, accountRoot })

  for (const relativePath of paths) {
    const id = addAsset({ relativePath, sourceSize: 1 })
    const result = resolver.resolve(id, 'content')
    assert.equal(result.status, 'unavailable', relativePath)
    assert.equal(result.state, 'source_unavailable', relativePath)
  }
})

test('rejects common-prefix siblings, symlink escapes, directories, missing files, and size changes', (t) => {
  const { root, accountRoot, assetDb, addAsset } = fixture(t)
  const sibling = `${accountRoot}-other`
  fs.mkdirSync(sibling)
  writeSource(sibling, 'outside.txt', 'outside')
  const outsideDir = path.join(root, 'outside')
  fs.mkdirSync(outsideDir)
  fs.writeFileSync(path.join(outsideDir, 'secret.txt'), 'secret')
  fs.symlinkSync(outsideDir, path.join(accountRoot, 'linked'), 'junction')
  fs.mkdirSync(path.join(accountRoot, 'directory'))
  writeSource(accountRoot, 'changed.txt', 'changed')

  const commonPrefix = addAsset({ relativePath: `../${path.basename(sibling)}/outside.txt`, sourceSize: 7 })
  const symlink = addAsset({ relativePath: 'linked/secret.txt', sourceSize: 6 })
  const directory = addAsset({ relativePath: 'directory', sourceSize: 0 })
  const missing = addAsset({ relativePath: 'missing.txt', sourceSize: 1 })
  const sizeMismatch = addAsset({ relativePath: 'changed.txt', sourceSize: 1 })
  const resolver = createArtifactSourceResolver({ assetDb, accountRoot })

  for (const id of [commonPrefix, symlink, directory, missing, sizeMismatch]) {
    const result = resolver.resolve(id, 'content')
    assert.equal(result.status, 'unavailable')
    assert.equal(result.state, 'source_unavailable')
  }
})

test('rejects a same-size source replacement when a content digest is bound', (t) => {
  const { accountRoot, assetDb, addAsset } = fixture(t)
  const relativePath = 'msg/file/同大小资料.pdf'
  const target = writeSource(accountRoot, relativePath, 'AAAA')
  const digest = `sha256:${crypto.createHash('sha256').update('AAAA').digest('hex')}`
  const id = addAsset({ relativePath, sourceSize: 4, sourceContentSha256: digest })
  fs.writeFileSync(target, 'BBBB', 'utf8')

  assert.equal(
    createArtifactSourceResolver({ assetDb, accountRoot }).resolve(id, 'content').status,
    'unavailable',
  )
})

test('allows thumbnails only for ready image/video sources, including thumbnail-only state', (t) => {
  const { accountRoot, assetDb, addAsset } = fixture(t)
  writeSource(accountRoot, 'ready.jpg', 'image')
  writeSource(accountRoot, 'poster.mp4', 'video')
  writeSource(accountRoot, 'document.pdf', 'pdf')
  const image = addAsset({ name: 'ready.jpg', preview: 'image', relativePath: 'ready.jpg', sourceSize: 5 })
  const video = addAsset({ name: 'poster.mp4', preview: 'video', relativePath: 'poster.mp4', sourceSize: 5, materialization: 'thumbnail_only', previewStatus: 'thumbnail_only' })
  const document = addAsset({ name: 'document.pdf', preview: 'pdf', relativePath: 'document.pdf', sourceSize: 3 })
  const resolver = createArtifactSourceResolver({ assetDb, accountRoot })

  assert.equal(resolver.resolve(image, 'thumbnail').status, 'available')
  assert.equal(resolver.resolve(video, 'thumbnail').status, 'available')
  assert.equal(resolver.resolve(video, 'content').status, 'unavailable')
  assert.equal(resolver.resolve(document, 'thumbnail').status, 'unsupported')
})

test('loads a unique account root from strict UTF-8 local env once and fails closed on ambiguity', (t) => {
  const { root, assetDb, addAsset } = fixture(t)
  const store = path.join(root, '微信存储')
  const account = path.join(store, 'wxid_only')
  fs.mkdirSync(account, { recursive: true })
  writeSource(account, '中文.txt', 'hello')
  const id = addAsset({ relativePath: '中文.txt', sourceSize: 5 })
  fs.writeFileSync(path.join(root, '.env.local'), `WECHAT_STORE=${store}\n`, 'utf8')
  const resolver = createArtifactSourceResolver({ assetDb, projectRoot: root, environment: {} })

  assert.equal(resolver.resolve(id, 'content').status, 'available')
  const second = path.join(store, 'wxid_second')
  fs.mkdirSync(second)
  assert.equal(resolver.resolve(id, 'content').status, 'available')

  writeSource(second, '中文.txt', 'hello')
  const ambiguous = createArtifactSourceResolver({ assetDb, projectRoot: root, environment: {} })
  assert.equal(ambiguous.resolve(id, 'content').status, 'configuration_unavailable')

  fs.writeFileSync(path.join(root, '.env.local'), Buffer.from([0xff, 0xfe]))
  const invalidUtf8 = createArtifactSourceResolver({ assetDb, projectRoot: root, environment: {} })
  assert.equal(invalidUtf8.resolve(id, 'content').status, 'configuration_unavailable')
})

test('binds a multi-account store only from the activated run account fingerprint', (t) => {
  const { root, assetDb, addAsset } = fixture(t)
  const store = path.join(root, 'multi-account-store')
  const matching = path.join(store, 'wxid_matching')
  const wrong = path.join(store, 'wxid_wrong')
  const empty = path.join(store, 'wxid_empty')
  fs.mkdirSync(empty, { recursive: true })
  writeSource(matching, 'msg/file/中文证据.txt', 'evidence')
  writeSource(wrong, 'msg/file/中文证据.txt', 'evidence')
  const id = addAsset({ relativePath: 'msg/file/中文证据.txt', sourceSize: 8 })
  assetDb.exec('CREATE TABLE asset_runs(account_root_fingerprint TEXT NOT NULL)')
  assetDb.prepare('INSERT INTO asset_runs VALUES(?)').run(accountRootFingerprint(matching))
  fs.writeFileSync(path.join(root, '.env.local'), `WECHAT_STORE=${store}\n`, 'utf8')
  const accountRootProvider = createArtifactAccountRootProvider({ projectRoot: root, environment: {} })

  const resolver = createArtifactSourceResolver({ assetDb, accountRootProvider })

  assert.equal(resolver.resolve(id, 'content').status, 'available')
})

test('fails closed when multiple account roots match the same bundle evidence', (t) => {
  const { root, assetDb, addAsset } = fixture(t)
  const store = path.join(root, 'ambiguous-store')
  for (const account of ['wxid_first', 'wxid_second']) {
    writeSource(path.join(store, account), 'same.txt', 'same')
  }
  const id = addAsset({ relativePath: 'same.txt', sourceSize: 4 })
  fs.writeFileSync(path.join(root, '.env.local'), `WECHAT_STORE=${store}\n`, 'utf8')
  const accountRootProvider = createArtifactAccountRootProvider({ projectRoot: root, environment: {} })

  const resolver = createArtifactSourceResolver({ assetDb, accountRootProvider })

  assert.equal(resolver.resolve(id, 'content').status, 'configuration_unavailable')
})

test('shares one cached account-root selection across resolver instances', (t) => {
  const { root, assetDb, addAsset } = fixture(t)
  const store = path.join(root, 'store')
  const account = path.join(store, 'wxid_only')
  fs.mkdirSync(account, { recursive: true })
  writeSource(account, 'ready.txt', 'ready')
  const id = addAsset({ relativePath: 'ready.txt', sourceSize: 5 })
  fs.writeFileSync(path.join(root, '.env.local'), `WECHAT_STORE=${store}\n`, 'utf8')
  const accountRootProvider = createArtifactAccountRootProvider({ projectRoot: root, environment: {} })

  const first = createArtifactSourceResolver({ assetDb, accountRootProvider })
  assert.equal(first.resolve(id, 'content').status, 'available')
  fs.mkdirSync(path.join(store, 'wxid_later'))
  const second = createArtifactSourceResolver({ assetDb, accountRootProvider })
  assert.equal(second.resolve(id, 'content').status, 'available')
})

test('fails closed for invalid evidence-state combinations', (t) => {
  const { accountRoot, assetDb, addAsset } = fixture(t)
  writeSource(accountRoot, 'invalid.txt', 'ready')
  const conflicting = addAsset({
    relativePath: 'invalid.txt', sourceSize: 5, materialization: 'missing_source', previewStatus: 'ready',
  })
  const invented = addAsset({
    relativePath: 'invalid.txt', sourceSize: 5, materialization: 'ready', previewStatus: 'ready',
  })
  const resolver = createArtifactSourceResolver({ assetDb, accountRoot })

  for (const id of [conflicting, invented]) {
    const result = resolver.resolve(id, 'content')
    assert.equal(result.status, 'unavailable')
    assert.equal(result.state, 'source_unavailable')
  }
})

test('canonicalizes an injected account-root provider before containment checks', (t) => {
  const { root, accountRoot, assetDb, addAsset } = fixture(t)
  writeSource(accountRoot, 'ready.txt', 'ready')
  const alias = path.join(root, 'account-alias')
  fs.symlinkSync(accountRoot, alias, 'junction')
  const id = addAsset({ relativePath: 'ready.txt', sourceSize: 5 })
  const resolver = createArtifactSourceResolver({ assetDb, accountRootProvider: () => alias })

  assert.equal(resolver.resolve(id, 'content').status, 'available')
})
