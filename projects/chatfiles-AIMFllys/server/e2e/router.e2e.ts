import assert from 'node:assert/strict'
import { once } from 'node:events'
import fs from 'node:fs'
import type { Server } from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { chromium, type Browser, type Page } from 'playwright'
import { archiveDay } from '../../shared/time/archiveTime.js'
import { createApp } from '../app.js'
import { createFixtureInsightsRouter } from './fixtureDataRouters.js'
import { createWechatRouter } from '../routes/wechat.js'

const deepSearch = new URLSearchParams({
  q: '时间轴测试消息 100', sender: 'sender-zhang', day: '2025-04-11', messageUid: 'timeline-100',
}).toString()

async function verifyCollectionHistoryIsStable(page: Page, baseUrl: string) {
  await page.goto(`${baseUrl}/chat`, { waitUntil: 'domcontentloaded' })
  await page.getByRole('heading', { name: '全部产出', exact: true }).waitFor()
  const historyLength = () => (
    (globalThis as unknown as { history: { length: number } }).history.length
  )
  const initialLength = await page.evaluate(historyLength)

  await page.getByRole('button', { name: /我的素材库/u }).click()
  await page.getByRole('heading', { name: '我的素材库', exact: true }).waitFor()
  await page.getByRole('button', { name: /全部产出/u }).click()
  await page.getByRole('heading', { name: '全部产出', exact: true }).waitFor()

  assert.equal(await page.evaluate(historyLength), initialLength)
}

async function verifyRouteDeepLinks(page: Page, baseUrl: string) {
  const filteredUrl = `${baseUrl}/chat/conv-001?q=%E6%97%B6%E9%97%B4%E8%BD%B4&sender=sender-zhang`
  await page.goto(filteredUrl, { waitUntil: 'domcontentloaded' })
  await page.locator('.chat-timeline').waitFor({ timeout: 5_000 })
  assert.equal(await page.getByRole('tab', { name: /聊天文字/u }).getAttribute('aria-selected'), 'true')
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.locator('.chat-timeline').waitFor({ timeout: 5_000 })
  assert.equal(page.url(), filteredUrl)

  const deepUrl = `${baseUrl}/chat/conv-001?${deepSearch}`
  await page.goto(deepUrl, { waitUntil: 'domcontentloaded' })
  await page.getByRole('heading', { name: '会话 001', exact: true }).waitFor()
  await page.locator('#timeline-timeline-100.is-highlighted').waitFor()
  await page.locator('#timeline-timeline-100 time', { hasText: '08:00:00' }).waitFor()
  assert.equal(await page.getByRole('textbox', { name: '检索当前素材', exact: true }).inputValue(), '时间轴测试消息 100')
  assert.equal(await page.locator('#timeline-timeline-100 time').innerText(), '08:00:00')
  assert.equal(await page.locator('.timeline-date-buttons button').first().innerText(), '2025-04-11')

  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.locator('#timeline-timeline-100.is-highlighted').waitFor()
  assert.equal(page.url(), deepUrl)

  await page.locator('.conversation-main').filter({ hasText: '会话 002' }).click()
  await page.waitForURL(`${baseUrl}/chat/conv-002`)
  assert.equal(new URL(page.url()).search, '')
  await page.goBack({ waitUntil: 'domcontentloaded' })
  await page.locator('#timeline-timeline-100.is-highlighted').waitFor()
  assert.equal(page.url(), deepUrl)
  await page.goForward({ waitUntil: 'domcontentloaded' })
  await page.waitForURL(`${baseUrl}/chat/conv-002`)
  assert.equal(new URL(page.url()).search, '')

  await page.goto(`${baseUrl}/chat/conv-001?messageUid=same-z`, { waitUntil: 'domcontentloaded' })
  await page.locator('#timeline-same-z.is-highlighted').waitFor()
  const sameSecond = await page.locator('.timeline-message').filter({ hasText: '同秒' }).allTextContents()
  assert.equal(sameSecond.length, 2)
  assert.match(sameSecond[0] ?? '', /同秒第一/u)
  assert.match(sameSecond[1] ?? '', /同秒第二/u)
}

function fixtureDatabases() {
  const accountRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'chatfiles-router-e2e-'))
  const artifactDb = new DatabaseSync(':memory:')
  const wechatDb = new DatabaseSync(':memory:')
  wechatDb.exec(`
    CREATE TABLE conversations(
      id TEXT PRIMARY KEY, account TEXT, username TEXT, display TEXT, is_group INTEGER,
      msg_count INTEGER, text_count INTEGER, first_time INTEGER, last_time INTEGER, summary TEXT
    );
    CREATE TABLE messages(
      conv_id TEXT, message_uid TEXT PRIMARY KEY, canonical_seq INTEGER,
      occurred_at_epoch_s INTEGER, time_precision TEXT, archive_day TEXT, person_id TEXT,
      seq INTEGER, time INTEGER, sender TEXT, sender_name TEXT, type INTEGER, type_label TEXT, text TEXT
    );
    CREATE TABLE parse_runs(run_id TEXT NOT NULL,time_zone TEXT NOT NULL);
    INSERT INTO parse_runs VALUES ('router-e2e','Asia/Shanghai');
  `)
  const insertConversation = wechatDb.prepare('INSERT INTO conversations VALUES (?,?,?,?,?,?,?,?,?,?)')
  insertConversation.run('conv-001', 'fixture', 'one', '会话 001', 0, 102, 102, 1, 102, '深链会话')
  insertConversation.run('conv-002', 'fixture', 'two', '会话 002', 0, 1, 1, 1, 1, '返回会话')
  const insertMessage = wechatDb.prepare('INSERT INTO messages VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
  const start = Math.floor(Date.UTC(2025, 0, 1) / 1000)
  for (let index = 1; index <= 100; index += 1) {
    insertMessage.run(
      'conv-001', `timeline-${String(index).padStart(3, '0')}`, index - 1, start + index * 86_400,
      'second', archiveDay(start + index * 86_400, 'Asia/Shanghai'), null, index, start + index * 86_400,
      index % 2 === 0 ? 'sender-zhang' : 'sender-li', index % 2 === 0 ? '张三' : '李四',
      1, 'text', `时间轴测试消息 ${String(index).padStart(3, '0')}`,
    )
  }
  const sharedSecond = start + 101 * 86_400
  insertMessage.run(
    'conv-001','same-z',100,sharedSecond,'second',archiveDay(sharedSecond, 'Asia/Shanghai'),null,
    101,sharedSecond,'sender-zhang','张三',1,'text','同秒第一',
  )
  insertMessage.run(
    'conv-001','same-a',101,sharedSecond,'second',archiveDay(sharedSecond, 'Asia/Shanghai'),null,
    102,sharedSecond,'sender-li','李四',1,'text','同秒第二',
  )
  insertMessage.run(
    'conv-002','message-002',102,start,'second',archiveDay(start, 'Asia/Shanghai'),null,
    1,start,'sender-two','王五',1,'text','第二个会话',
  )
  return { accountRoot, artifactDb, wechatDb }
}

async function listen(server: Server) {
  if (!server.listening) await once(server, 'listening')
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  return `http://127.0.0.1:${address.port}`
}

async function closeServer(server: Server) {
  if (!server.listening) return
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
}

const fixture = fixtureDatabases()
const wechatRouter = createWechatRouter({
  openWechatDatabase: () => ({ db: fixture.wechatDb, release() {} }),
  openArtifactDatabase: () => ({ db: fixture.artifactDb, release() {} }),
  openProductDatabases: () => ({
    wechat: { db: fixture.wechatDb, release() {} },
    artifacts: { db: fixture.artifactDb, release() {} },
  }),
  accountRootProvider: () => fixture.accountRoot,
  imageThumbnail: (target) => target,
  videoThumbnail: (target) => target,
  resolveLinkPreview: async (_artifactId, url) => ({
    status: 'fallback', url, domain: new URL(url).hostname, title: '', description: '', siteName: '',
    iconUrl: '', updatedAt: '2026-07-13T00:00:00.000Z',
  }),
})
const server = createApp({ insightsRouter: createFixtureInsightsRouter(),wechatRouter })
  .listen(0, '127.0.0.1')
let browser: Browser | undefined

try {
  const baseUrl = await listen(server)
  browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await verifyCollectionHistoryIsStable(page, baseUrl)
  await verifyRouteDeepLinks(page, baseUrl)
  assert.deepEqual(pageErrors, [])
  console.log('router e2e: deep link, daily seconds, same-second order, refresh, back, and forward passed')
} finally {
  await browser?.close()
  await closeServer(server)
  fixture.artifactDb.close()
  fixture.wechatDb.close()
  fs.rmSync(fixture.accountRoot, { recursive: true, force: true })
}
