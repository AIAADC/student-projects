import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { TestContext } from 'node:test'
import { DatabaseSync } from 'node:sqlite'
import { activateCatalog, createProductCatalog } from '../data/catalogTransaction.js'
import { resolveCurrentProductEntrypoint } from '../data/catalogConsumer.js'
import { sealedProductSet } from '../data/catalogTestSupport.js'

import type { InsightConversation, InsightState } from './insightRefresh.js'

export function writeJson(file: string, value: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8')
}

export function readJson(file: string) {
  return JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>
}

export function fixture(t: TestContext) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chatfiles-insights-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const source = path.join(root, 'data', 'insights')
  const dbPath = path.join(root, 'data', 'wechat.current', 'wechat.db')
  const aliasMapPath = path.join(root, 'work', 'audits', 'insight-owner-aliases.json')
  fs.mkdirSync(path.join(source, 'conv'), { recursive: true })
  fs.mkdirSync(path.join(source, 'boards'), { recursive: true })
  fs.mkdirSync(path.dirname(dbPath), { recursive: true })
  fs.writeFileSync(path.join(source, 'boards', 'AI.md'), '# AI\n\n旧主题板', 'utf8')

  const conversations: InsightConversation[] = [
    {
      convId: 'wx:short:room@chatroom', name: '旧群名', isGroup: true, summary: '旧总结',
      topics: ['技术'], keyPeople: ['甲'],
      nuggets: [{ category: '技术', title: '旧要点', content: '必须保留', importance: 3 }],
    },
    {
      convId: 'wx:old-owner:room@chatroom', name: '中文群', isGroup: true, summary: '新总结',
      topics: ['AI'], keyPeople: ['乙'],
      nuggets: [{ category: 'AI', title: '新要点', content: '同样保留', importance: 4 }],
    },
  ]
  for (const [index, conversation] of conversations.entries()) {
    writeJson(path.join(source, 'conv', `legacy-${index}.json`), conversation)
  }
  const states: InsightState[] = [
    { convId: conversations[0]!.convId, analyzedTextCount: 30, analyzedLastTime: 100, analyzedAt: 'old' },
    {
      convId: conversations[1]!.convId, analyzedTextCount: 40, analyzedLastTime: 200,
      analyzedLastMessageUid: 'room-005', analyzedLastSequence: 4, analyzedAt: 'new',
    },
  ]
  writeJson(path.join(source, '_state.json'), states)
  writeJson(path.join(source, '_manifest.json'), conversations.map((conversation, index) => ({
    convId: conversation.convId, name: conversation.name,
    isGroup: conversation.isGroup, textCount: index === 0 ? 30 : 40,
  })))
  writeJson(aliasMapPath, {
    version: 1, canonicalOwner: 'canonical', aliases: { short: 'canonical', 'old-owner': 'canonical' },
    evidence: [{ kind: 'strict-source-audit', reference: 'fixture' }],
  })

  const db = new DatabaseSync(dbPath)
  db.exec(`
    CREATE TABLE conversations (
      id TEXT PRIMARY KEY,display TEXT NOT NULL,is_group INTEGER NOT NULL,
      text_count INTEGER NOT NULL,first_time INTEGER NOT NULL,last_time INTEGER NOT NULL
    );
    CREATE TABLE parse_runs(
      run_id TEXT NOT NULL,status TEXT NOT NULL,completed_at TEXT NOT NULL,
      schema_version INTEGER NOT NULL,time_zone TEXT NOT NULL
    );
    CREATE TABLE messages (
      conv_id TEXT NOT NULL,message_uid TEXT NOT NULL,canonical_seq INTEGER NOT NULL,
      occurred_at_epoch_s INTEGER NOT NULL,type INTEGER NOT NULL,time INTEGER NOT NULL,
      sender_name TEXT,text TEXT
    );
    INSERT INTO parse_runs VALUES(
      'fixture-run','complete','2026-07-13T00:00:00.000Z',2,'Asia/Shanghai'
    );
  `)
  const insertConversation = db.prepare('INSERT INTO conversations VALUES (?, ?, ?, ?, ?, ?)')
  insertConversation.run('wx:canonical:room@chatroom', '中文群', 1, 50, 50, 300)
  insertConversation.run('wx:canonical:new-peer', '新增私聊', 0, 20, 250, 310)
  const insertMessage = db.prepare('INSERT INTO messages VALUES (?, ?, ?, ?, 1, ?, ?, ?)')
  insertMessage.run(
    'wx:canonical:room@chatroom', 'room-005', 4, 200, 200, '孔德羽', '上一轮已分析的锚点消息。',
  )
  for (let index = 0; index < 10; index++) {
    insertMessage.run(
      'wx:canonical:room@chatroom', `room-${String(index + 6).padStart(3, '0')}`, index + 5,
      index === 0 ? 200 : 200 + index, index === 0 ? 200 : 200 + index, '孔德羽',
      index === 0 ? '这次决定使用 Codex 完成本地增量审计并记录方法。' : '收到',
    )
  }
  for (let index = 0; index < 20; index++) {
    insertMessage.run(
      'wx:canonical:new-peer', `new-${String(index + 1).padStart(3, '0')}`, index,
      291 + index, 291 + index, '陈同学',
      index === 0 ? '建议使用 Python 处理课程数据，完成后一起复盘结果。' : '嗯',
    )
  }
  db.close()
  const products = sealedProductSet(t, root, 'insight-fixture', { wechatDatabasePath: dbPath })
  activateCatalog({ dataRoot: products.dataRoot,catalog: createProductCatalog({
    transactionId: 'insight-fixture',committedAt: '2026-07-13T00:00:00.000Z',
    products: products.references,
  }) })
  const activeDbPath = resolveCurrentProductEntrypoint(products.dataRoot, 'wechat', 'database')
  return { root,source,dbPath: activeDbPath,legacyDbPath: dbPath,aliasMapPath }
}
