import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import type { Page } from 'playwright'

export function seedLongTimeline(db: DatabaseSync) {
  const insert = db.prepare('INSERT INTO messages VALUES (?,?,?,?,?,?,?,?,?)')
  const start = Math.floor(Date.UTC(2025, 0, 1) / 1000)
  for (let index = 2; index <= 260; index += 1) {
    const even = index % 2 === 0
    insert.run(
      'conv-001', `timeline-${String(index).padStart(3, '0')}`, index, start + index * 86_400,
      even ? 'sender-zhang' : 'sender-li', even ? '张三' : '李四', 1, 'text',
      `时间轴测试消息 ${String(index).padStart(3, '0')}`,
    )
  }
  db.prepare('UPDATE conversations SET msg_count=260,text_count=260,last_time=? WHERE id=?')
    .run(start + 260 * 86_400, 'conv-001')
}

export async function verifyLongTimeline(page: Page) {
  await page.locator('.conversation-scroll').evaluate((element) => {
    element.scrollTop = 0
    element.dispatchEvent(new Event('scroll'))
  })
  await page.locator('.conversation-main').filter({ hasText: '会话 001' }).click()
  await page.getByRole('tab', { name: '聊天文字 260', exact: true }).click()
  const toolbar = page.locator('.timeline-toolbar')
  await toolbar.getByText('120 条已载入', { exact: true }).waitFor()
  const scroller = page.locator('.timeline-scroll')
  await scroller.evaluate((element) => { element.scrollTop = 0; element.dispatchEvent(new Event('scroll')) })
  await page.waitForFunction(() => document.querySelectorAll('.timeline-message').length > 120)
  assert.ok(await page.locator('.timeline-message').count() <= 600)

  await page.getByRole('button', { name: '筛选发言人，共 3 人', exact: true }).click()
  const people = page.getByRole('dialog', { name: '筛选发言人', exact: true })
  await people.getByRole('textbox', { name: '搜索姓名', exact: true }).fill('张三')
  await people.getByRole('button', { name: /张三/u }).click()
  await toolbar.getByRole('button', { name: /仅看 张三/u }).waitFor()
  assert.equal(await page.locator('.timeline-message-name').filter({ hasNotText: '张三' }).count(), 0)
  await toolbar.getByRole('button', { name: /仅看 张三/u }).click()
  await page.getByRole('button', { name: '筛选发言人，共 3 人', exact: true }).waitFor()

  const dateButton = page.locator('.timeline-date-buttons button').first()
  const request = page.waitForRequest((value) => (
    value.url().includes('/timeline?') && value.url().includes('aroundUid=')
  ))
  await dateButton.click()
  await request
  const location = new URL(page.url())
  assert.match(location.searchParams.get('day') ?? '', /^\d{4}-\d{2}-\d{2}$/u)
  assert.ok(location.searchParams.get('messageUid'))
  await page.locator('.timeline-day').first().waitFor()
}
