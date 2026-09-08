import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import type { Page } from 'playwright'

export async function captureVisual(page: Page, name: string) {
  const directory = process.env.CHATFILES_E2E_SCREENSHOT_DIR?.trim()
  if (directory) fs.mkdirSync(directory, { recursive: true })
  const screenshot = await page.screenshot(directory ? { path: path.join(directory, `${name}.png`) } : {})
  assert.ok(screenshot.byteLength > 10_000)
}
