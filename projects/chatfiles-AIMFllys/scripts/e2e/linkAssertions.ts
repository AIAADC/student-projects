import assert from 'node:assert/strict'
import type { Page } from 'playwright'

export async function resolveFixtureLinkPreview(_artifactId: string, url: string) {
  const fallback = url.includes('fallback')
  return {
    status: fallback ? 'fallback' as const : 'ready' as const, url, domain: new URL(url).hostname,
    title: fallback ? '' : '经过验证的链接介绍',
    description: fallback ? '' : '这是只使用脱敏测试数据生成的两行链接摘要。',
    siteName: fallback ? '' : '测试站点', iconUrl: '', updatedAt: '2026-07-13T00:00:00.000Z',
  }
}

export async function verifyLinkPreviews(page: Page) {
  await page.locator('.link-preview[data-status="ready"]').waitFor()
  await page.locator('.link-preview[data-status="fallback"]').waitFor()
  assert.match(await page.locator('.link-preview[data-status="ready"]').innerText(), /经过验证的链接介绍.*两行链接摘要.*测试站点/su)
  assert.match(await page.locator('.link-preview[data-status="fallback"]').innerText(), /fallback\.example/u)
}
