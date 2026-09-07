import assert from 'node:assert/strict'
import { once } from 'node:events'
import fs from 'node:fs'
import type { Server } from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { chromium, type Browser } from 'playwright'
import { createApp } from '../../server/app.js'
import { createFixtureInsightsRouter } from './fixtureDataRouters.js'; import { createWechatRouter } from '../../server/routes/wechat.js'; import { createFixtureFileRouter } from './fixtureFileRouter.js'
import { captureVisual, createFixtureAgentRouter, resolveFixtureLinkPreview, seedLongTimeline, verifyAgentDock, verifyAISettings, verifyLinkPreviews, verifyLongTimeline, verifySidebarCollapse } from './e2eAssertions.js'
function fixtureDatabases() {
  const accountRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'chatfiles-e2e-'))
  const previewRelativePath = 'preview.html'
  const previewPath = path.join(accountRoot, previewRelativePath)
  const previewContent = '<!doctype html><html lang="zh-CN"><body><h1>E2E 本地预览</h1></body></html>'
  fs.writeFileSync(previewPath, previewContent, 'utf8')
  const artifactDb = new DatabaseSync(':memory:')
  const wechatDb = new DatabaseSync(':memory:')
  artifactDb.exec(`
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
  `)

  const insertConversation = wechatDb.prepare('INSERT INTO conversations VALUES (?,?,?,?,?,?,?,?,?,?)')
  const insertMessage = wechatDb.prepare('INSERT INTO messages VALUES (?,?,?,?,?,?,?,?,?)')
  for (let index = 1; index <= 120; index += 1) {
    const suffix = String(index).padStart(3, '0')
    const conversationId = `conv-${suffix}`
    const timestamp = 2_000 - index
    insertConversation.run(
      conversationId, 'fixture-account', `user-${suffix}`, `会话 ${suffix}`, index % 3 === 0 ? 1 : 0,
      1, 1, timestamp, timestamp, `测试摘要 ${suffix}`,
    )
    insertMessage.run(
      conversationId, `message-${suffix}`, 1, timestamp, `sender-${suffix}`, `发送者 ${suffix}`,
      1, 'text', `测试消息 ${suffix}`,
    )
  }
  seedLongTimeline(wechatDb)

  const insertArtifact = artifactDb.prepare('INSERT INTO artifacts VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
  const addArtifact = (input: {
    index: number
    category: 'work' | 'document' | 'skill' | 'link'
    name: string
    preview: string
    materialization: string
    previewStatus: string
    sourceRelativePath?: string | null
    sourceSize?: number | null
    url?: string | null
  }) => insertArtifact.run(
    input.index.toString(16).padStart(64, '0'),
    'conv-001',
    input.category,
    input.category === 'link' ? 'link' : 'resource',
    input.name,
    input.preview,
    input.url ?? null,
    input.sourceRelativePath ?? null,
    input.sourceSize ?? null,
    3_000 - input.index,
    '测试发送者',
    '测试索引文本',
    input.materialization,
    input.previewStatus,
    input.previewStatus === 'ready' ? null : '审计失败状态',
  )
  addArtifact({
    index: 1,
    category: 'work',
    name: previewRelativePath,
    preview: 'html',
    materialization: 'exported',
    previewStatus: 'ready',
    sourceRelativePath: previewRelativePath,
    sourceSize: Buffer.byteLength(previewContent),
  })
  addArtifact({ index: 2, category: 'document', name: '待解密文档.pdf', preview: 'pdf', materialization: 'decrypt_failed', previewStatus: 'decrypt_failed' })
  addArtifact({ index: 3, category: 'skill', name: 'fixture SKILL.md', preview: 'markdown', materialization: 'exported', previewStatus: 'ready' })
  addArtifact({ index: 4, category: 'link', name: '安全链接', preview: 'link', materialization: 'exported', previewStatus: 'ready', url: 'https://example.test/' })
  addArtifact({ index: 5, category: 'link', name: '降级链接', preview: 'link', materialization: 'exported', previewStatus: 'ready', url: 'https://fallback.example/' })

  return { accountRoot, artifactDb, previewPath, previewRelativePath, wechatDb }
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

const { accountRoot, artifactDb, previewPath, previewRelativePath, wechatDb } = fixtureDatabases()
const wechatRouter = createWechatRouter({
  openWechatDatabase: () => ({ db: wechatDb, release() {} }),
  openArtifactDatabase: () => ({ db: artifactDb, release() {} }),openProductDatabases: () => ({ wechat: { db: wechatDb, release() {} },artifacts: { db: artifactDb, release() {} } }),
  accountRootProvider: () => accountRoot,
  imageThumbnail: (target) => target,
  videoThumbnail: (target) => target,
  resolveLinkPreview: resolveFixtureLinkPreview,
})
const server = createApp({ aiAgentRouter: createFixtureAgentRouter(),fileRouter: createFixtureFileRouter('1'.padStart(64, '0'), previewPath),insightsRouter: createFixtureInsightsRouter(),wechatRouter }).listen(0, '127.0.0.1')
let browser: Browser | undefined

try {
  const baseUrl = await listen(server)
  browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    colorScheme: 'dark',
    reducedMotion: 'reduce',
    viewport: { width: 1440, height: 900 },
  })
  const page = await context.newPage()
  const browserErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text())
  })
  page.on('pageerror', (error) => browserErrors.push(error.message))
  page.on('response', (response) => { if (response.status() >= 400) browserErrors.push(`${response.status()} ${new URL(response.url()).pathname}`) })

  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: '聊天', exact: true }).click()
  await page.getByRole('heading', { name: '会话 120', exact: true }).waitFor()

  assert.ok(await page.locator('.conversation-row').count() < 40)
  assert.equal(
    (await page.locator('#conversation-heading').innerText()).replace(/\s+/gu, ' ').trim(),
    '会话 120',
  )
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false)
  assert.equal(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches), true)
  await verifySidebarCollapse(page)

  const pinConversation = page.getByRole('button', { name: '置顶 会话 005', exact: true })
  await pinConversation.click()
  await page.getByRole('button', { name: '取消置顶 会话 005', exact: true }).waitFor()
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: '聊天', exact: true }).click()
  const persistedPin = page.getByRole('button', { name: '取消置顶 会话 005', exact: true })
  await persistedPin.waitFor()
  assert.equal(await persistedPin.getAttribute('aria-pressed'), 'true')
  assert.equal(await persistedPin.evaluate((element) => element.closest('.conversation-row')?.getAttribute('aria-posinset')), '1')
  await persistedPin.click()
  await page.getByRole('button', { name: '置顶 会话 005', exact: true }).waitFor()
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: '聊天', exact: true }).click()
  const restoredPin = page.getByRole('button', { name: '置顶 会话 005', exact: true })
  await restoredPin.waitFor()
  assert.equal(await restoredPin.getAttribute('aria-pressed'), 'false')

  const conversationSearch = page.getByRole('textbox', { name: '搜索会话', exact: true })
  await conversationSearch.fill('会话 117')
  await page.getByRole('heading', { name: '会话 1', exact: true }).waitFor()
  assert.equal(await page.locator('.conversation-row').count(), 1)
  await conversationSearch.fill('')
  await page.getByRole('heading', { name: '会话 120', exact: true }).waitFor()

  await page.locator('.conversation-scroll').evaluate((element) => {
    element.scrollTop = 3_500
    element.dispatchEvent(new Event('scroll'))
  })
  await page.waitForFunction(() => Number(document.querySelector('.conversation-row')?.getAttribute('aria-posinset')) > 30)
  assert.ok(await page.locator('.conversation-row').count() < 40)

  await page.getByRole('button', { name: '我的素材库 作品与可浏览创作', exact: true }).click()
  await page.waitForFunction(() => document.querySelector('.workspace-title-counts strong')?.textContent === '4')
  assert.equal(await page.locator('.artifact-card').count(), 1)
  assert.equal(await page.locator('.artifact-card[data-availability="ready"]').count(), 1)

  await page.getByRole('button', { name: '全部产出 跨会话汇总', exact: true }).click()
  await page.waitForFunction(() => document.querySelector('.workspace-title-counts strong')?.textContent === '5')
  assert.equal(await page.locator('.artifact-card').count(), 5)
  assert.equal(await page.locator('.artifact-card[data-availability="decrypt_failed"]').count(), 1)

  const tabCases = [
    { id: 'all', name: '全部 5', count: 5 },
    { id: 'work', name: '作品 1', count: 1 },
    { id: 'document', name: '文档 1', count: 1 },
    { id: 'skill', name: 'Skills 工具 1', count: 1 },
    { id: 'link', name: '链接 2', count: 2 },
  ]
  for (const tabCase of tabCases) {
    const tab = page.getByRole('tab', { name: tabCase.name, exact: true })
    await tab.click()
    try {
      await page.waitForFunction(
        ({ id, count }) => {
          const selected = document.getElementById(`artifact-tab-${id}`)
          const mountedCards = document.querySelectorAll('.artifact-card').length
          return selected?.getAttribute('aria-selected') === 'true'
            && (count <= 4 ? mountedCards === count : mountedCards > 0)
        },
        tabCase,
        { timeout: 5_000 },
      )
    } catch (error) {
      const state = await page.evaluate((id) => ({
        cards: document.querySelectorAll('.artifact-card').length,
        panel: document.getElementById('artifact-tab-panel')?.textContent?.replace(/\s+/gu, ' ').trim(),
        selected: document.getElementById(`artifact-tab-${id}`)?.getAttribute('aria-selected'),
      }), tabCase.id)
      throw new Error(`tab ${tabCase.id} did not settle: ${JSON.stringify(state)}`, { cause: error })
    }
  }
  await page.getByRole('tab', { name: '链接 2', exact: true }).click()
  await verifyLinkPreviews(page)

  await page.getByRole('tab', { name: '聊天文字 379', exact: true }).click()
  await page.getByText('选择一个会话后查看聊天时间轴', { exact: true }).waitFor()

  const allTab = page.getByRole('tab', { name: '全部 5', exact: true })
  await allTab.click()
  await allTab.press('ArrowRight')
  assert.equal(await page.getByRole('tab', { name: '作品 1', exact: true }).getAttribute('aria-selected'), 'true')
  await page.getByRole('tab', { name: '作品 1', exact: true }).press('Home')
  assert.equal(await allTab.getAttribute('aria-selected'), 'true')

  const artifactSearch = page.getByRole('textbox', { name: '检索当前素材', exact: true })
  await artifactSearch.fill('待解密')
  await page.waitForFunction(() => document.querySelectorAll('.artifact-card').length === 1)
  assert.match(await page.locator('.artifact-card').innerText(), /待解密文档/u)
  await artifactSearch.fill('')
  await page.waitForFunction(() => document.querySelectorAll('.artifact-card').length === 5)

  const previewCard = page.locator('.artifact-card').filter({ hasText: previewRelativePath })
  assert.equal(await previewCard.count(), 1)
  await previewCard.click()
  await page.getByRole('dialog', { name: previewRelativePath, exact: true }).waitFor()
  await page.frameLocator('iframe.html-preview').getByRole('heading', { name: 'E2E 本地预览', exact: true }).waitFor()
  await page.keyboard.press('Escape')
  await page.getByRole('dialog', { name: previewRelativePath, exact: true }).waitFor({ state: 'hidden' })
  assert.equal(await page.evaluate(() => document.activeElement?.classList.contains('artifact-card')), true)

  await captureVisual(page, 'desktop-dark')

  await page.getByRole('button', { name: '当前跟随系统，切换到浅色模式', exact: true }).click()
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'light')
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'light')
  await captureVisual(page, 'desktop-light')
  await page.getByRole('button', { name: '当前浅色模式，切换到深色模式', exact: true }).click()
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark')
  assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark')
  await verifyLongTimeline(page)
  await verifyAISettings(page)
  await verifyAgentDock(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: '聊天', exact: true }).click()
  await page.getByRole('heading', { name: '会话 120', exact: true }).waitFor()
  assert.equal(await page.locator('.chat-library').getAttribute('data-mobile-pane'), 'sidebar')
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false)

  const firstConversation = page.locator('.conversation-main').filter({ hasText: '会话 001' })
  assert.equal(await firstConversation.count(), 1)
  await firstConversation.click()
  await page.waitForFunction(() => document.querySelector('.chat-library')?.getAttribute('data-mobile-pane') === 'workspace')
  await page.locator('.artifact-workspace h1').filter({ hasText: '会话 001' }).waitFor()
  assert.equal(await page.locator('.artifact-grid-window').evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').length), 1)
  await page.getByRole('tab', { name: '聊天文字 260', exact: true }).click()
  await page.locator('.timeline-message').last().waitFor()
  assert.match(await page.locator('.timeline-message').last().textContent() ?? '', /(?:张三|李四).*时间轴测试消息/su)
  await captureVisual(page, 'mobile-dark')

  await page.locator('.mobile-back').click()
  assert.equal(await page.locator('.chat-library').getAttribute('data-mobile-pane'), 'sidebar')
  await page.waitForFunction(() => document.activeElement?.classList.contains('conversation-main'))
  assert.match(await page.evaluate(() => document.activeElement?.textContent ?? ''), /会话 001/u)
  assert.deepEqual(browserErrors, [])

  await context.close()
  console.log('chat-library e2e: navigation, pins, tabs, search, preview, themes, keyboard, desktop, and mobile passed')
} finally {
  await browser?.close()
  await closeServer(server)
  artifactDb.close()
  wechatDb.close()
  fs.unlinkSync(previewPath)
  fs.rmdirSync(accountRoot)
}
