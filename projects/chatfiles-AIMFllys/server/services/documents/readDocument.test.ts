import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { DatabaseSync } from 'node:sqlite'
import { createArtifactSourceResolver } from '../../wechat/artifactSourceResolver.js'
import { DocumentReadError, readDocument } from './readDocument.js'

function fixture(t: test.TestContext) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chatfiles-doc-reader-'))
  const db = new DatabaseSync(':memory:')
  db.exec(`CREATE TABLE artifacts(
    asset_id TEXT PRIMARY KEY, conv_id TEXT, category TEXT, kind TEXT, name TEXT,
    preview TEXT, url TEXT, source_relative_path TEXT, source_size INTEGER,
    created_at INTEGER, sender_name TEXT, materialization TEXT, preview_status TEXT
  )`)
  const insert = db.prepare('INSERT INTO artifacts VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)')
  let sequence = 0
  const add = (name: string, preview: string, content: string | Buffer) => {
    sequence += 1
    const id = sequence.toString(16).padStart(64, '0')
    fs.writeFileSync(path.join(root, name), content)
    insert.run(id, 'conv', 'document', 'resource', name, preview, null, name, Buffer.byteLength(content), 1, '张三', 'exported', 'ready')
    return id
  }
  t.after(() => { db.close(); fs.rmSync(root, { recursive: true, force: true }) })
  return { add, resolver: createArtifactSourceResolver({ assetDb: db, accountRoot: root }), root }
}

test('reads supported UTF-8 formats by asset ID and returns only path-free evidence fields', async (t) => {
  const data = fixture(t)
  const markdown = data.add('说明.md', 'markdown', '# 中文标题\n正文🙂保持完整')
  const html = data.add('页面.html', 'html', '<h1>标题</h1><script>privatePath()</script><p>安全正文 &amp; 更多</p>')
  const json = data.add('配置.json', 'json', '{"中文":"内容"}')
  const large = data.add('长文.txt', 'text', '汉'.repeat(30_000))
  const mdResult = await readDocument(data.resolver, { assetId: markdown, maxCharacters: 9 })
  assert.deepEqual(Object.keys(mdResult).sort(), ['assetId', 'citation', 'text', 'title', 'truncated'])
  assert.equal(mdResult.text, '# 中文标题\n正文')
  assert.equal(mdResult.truncated, true)
  assert.equal(mdResult.citation, `[文件:${markdown}]`)
  assert.doesNotMatch(JSON.stringify(mdResult), new RegExp(data.root.replace(/[\\^$.*+?()[\]{}|]/gu, '\\$&'), 'u'))
  const htmlResult = await readDocument(data.resolver, { assetId: html, maxCharacters: 100 })
  assert.match(htmlResult.text, /标题.*安全正文 & 更多/su)
  assert.doesNotMatch(htmlResult.text, /script|privatePath/u)
  const jsonResult = await readDocument(data.resolver, { assetId: json })
  assert.match(jsonResult.text, /"中文": "内容"/u)
  assert.equal(jsonResult.truncated, false)
  const largeResult = await readDocument(data.resolver, { assetId: large, maxCharacters: 10 })
  assert.equal(largeResult.text, '汉'.repeat(10))
  assert.equal(largeResult.truncated, true)
})

test('rejects malformed IDs and unsupported binary previews with stable codes', async (t) => {
  const data = fixture(t)
  const binary = data.add('报告.pdf', 'pdf', Buffer.from([0, 1, 2, 3]))
  await assert.rejects(
    readDocument(data.resolver, { assetId: 'not-an-id' }),
    (error: unknown) => error instanceof DocumentReadError && error.code === 'invalid_asset_id',
  )
  await assert.rejects(
    readDocument(data.resolver, { assetId: binary }),
    (error: unknown) => error instanceof DocumentReadError && error.code === 'unsupported_document',
  )
})
