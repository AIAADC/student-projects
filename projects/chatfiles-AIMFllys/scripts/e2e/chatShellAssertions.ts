import assert from 'node:assert/strict'
import type { Page } from 'playwright'

export async function verifySidebarCollapse(page: Page) {
  await page.getByRole('button', { name: '收起资料库', exact: true }).click()
  assert.equal(await page.locator('.chat-library').getAttribute('data-sidebar-collapsed'), 'true')
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: '聊天', exact: true }).click()
  await page.getByRole('button', { name: '展开资料库', exact: true }).waitFor()
  assert.equal(await page.locator('.chat-library').getAttribute('data-sidebar-collapsed'), 'true')
  await page.getByRole('button', { name: '展开资料库', exact: true }).click()
  assert.equal(await page.locator('.chat-library').getAttribute('data-sidebar-collapsed'), 'false')
}
