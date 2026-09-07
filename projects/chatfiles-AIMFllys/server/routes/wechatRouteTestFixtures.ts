import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { TestContext } from 'node:test'
import { DatabaseSync } from 'node:sqlite'
import express from 'express'
import type { WechatRouterDependencies } from './wechat.js'

export function fixture(t: TestContext) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chatfiles-wechat-http-'))
  const accountRoot = path.join(root, 'wxid_fixture')
  fs.mkdirSync(accountRoot)
  const assetDb = new DatabaseSync(':memory:')
  const wechatDb = new DatabaseSync(':memory:')
  assetDb.exec(`
    CREATE TABLE artifacts(
      asset_id TEXT PRIMARY KEY, conv_id TEXT, category TEXT, kind TEXT, name TEXT,
      preview TEXT, url TEXT, source_relative_path TEXT, source_size INTEGER,
      created_at INTEGER, sender_name TEXT, text TEXT, materialization TEXT,
      preview_status TEXT, failure_reason TEXT
    );
  `)
  wechatDb.exec(`
    CREATE TABLE conversations(
      id TEXT PRIMARY KEY, account TEXT, username TEXT, display TEXT, is_group INTEGER,
      msg_count INTEGER, text_count INTEGER, first_time INTEGER, last_time INTEGER, summary TEXT
    );
    CREATE TABLE messages(
      conv_id TEXT, message_uid TEXT PRIMARY KEY, seq INTEGER, time INTEGER,
      sender TEXT, sender_name TEXT, type INTEGER, type_label TEXT, text TEXT
    );
    INSERT INTO conversations VALUES ('conv-a', 'private-account', 'user-a', '测试会话', 0, 1, 1, 100, 100, '');
    INSERT INTO messages VALUES ('conv-a', 'm-1', 1, 100, 'sender', '张三', 1, 'text', '中文消息');
  `)
  const insert = assetDb.prepare('INSERT INTO artifacts VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
  let sequence = 0
  const addAsset = (options: {
    category?: string
    kind?: string
    name?: string
    preview?: string
    relativePath?: string | null
    content?: string | Buffer
    materialization?: string
    previewStatus?: string
    url?: string | null
    convId?: string | null
  } = {}) => {
    sequence += 1
    const id = sequence.toString(16).padStart(64, '0')
    const relativePath = options.relativePath === undefined ? `file-${sequence}.txt` : options.relativePath
    let sourceSize: number | null = null
    if (relativePath !== null && options.content !== undefined) {
      const target = path.join(accountRoot, ...relativePath.split('/'))
      fs.mkdirSync(path.dirname(target), { recursive: true })
      fs.writeFileSync(target, options.content)
      sourceSize = fs.statSync(target).size
    }
    insert.run(
      id, options.convId === undefined ? 'conv-a' : options.convId, options.category ?? 'document', options.kind ?? 'resource',
      options.name ?? path.basename(relativePath ?? 'missing'), options.preview ?? 'text', options.url ?? null,
      relativePath, sourceSize, 100, '张三', 'private full text',
      options.materialization ?? 'exported', options.previewStatus ?? 'ready', 'private failure detail',
    )
    return id
  }
  const dependencies: WechatRouterDependencies = {
    openWechatDatabase: () => ({ db: wechatDb, release() {} }),
    openArtifactDatabase: () => ({ db: assetDb, release() {} }),
    openProductDatabases: () => ({
      wechat: { db: wechatDb,release() {} },artifacts: { db: assetDb,release() {} },
    }),
    accountRootProvider: () => accountRoot,
    imageThumbnail: (target) => target,
    videoThumbnail: (target) => target,
    resolveLinkPreview: async (_artifactId, url) => ({
      status: 'fallback', url, domain: new URL(url).hostname, title: '', description: '',
      siteName: '', iconUrl: '', updatedAt: new Date(0).toISOString(),
    }),
  }
  t.after(() => {
    assetDb.close()
    wechatDb.close()
    fs.rmSync(root, { recursive: true, force: true })
  })
  return { root, accountRoot, assetDb, wechatDb, addAsset, dependencies }
}

export async function withServer(
  handler: express.RequestHandler,
  run: (baseUrl: string) => Promise<void>,
) {
  const app = express()
  app.use(handler)
  const server = app.listen(0, '127.0.0.1')
  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve)
    server.once('error', reject)
  })
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  try {
    await run(`http://127.0.0.1:${address.port}`)
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  }
}
