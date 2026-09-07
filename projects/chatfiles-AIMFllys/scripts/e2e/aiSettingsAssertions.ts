import assert from 'node:assert/strict'
import type { Page } from 'playwright'

export async function verifyAISettings(page: Page) {
  await page.getByRole('button', { name: 'AI', exact: true }).click()
  await page.getByRole('heading', { name: 'AI', exact: true }).waitFor()
  const windowInput = page.getByLabel('模型上下文窗口 · tokens', { exact: true })
  await windowInput.fill('256000')
  await page.getByRole('radio', { name: /结构化摘要/u }).check()
  await page.getByLabel('启用向量检索', { exact: true }).check()
  await page.getByLabel('Embedding 模型', { exact: true }).fill('fixture-embedding-model')
  await page.getByRole('button', { name: '保存配置', exact: true }).click()
  const persisted = await page.evaluate(() => JSON.parse(localStorage.getItem('chatfiles.ai.config') ?? '{}'))
  assert.equal(persisted.contextWindow, 256_000)
  assert.equal(persisted.contextStrategy, 'summary')
  assert.equal(persisted.threshold, 179_200)
  assert.equal(persisted.embedding.model, 'fixture-embedding-model')
  assert.equal(persisted.embedding.enabled, true)
  await page.getByRole('button', { name: '重建检索索引', exact: true }).click()
  await page.getByText(/混合检索索引已更新.*2 个片段/u).waitFor()
}
