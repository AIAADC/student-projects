import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

async function parser() {
  const target = path.resolve(process.cwd(), 'server/services/linkPreview/htmlMetadata.ts')
  assert.equal(fs.existsSync(target), true)
  if (!fs.existsSync(target)) return null
  return import('./htmlMetadata.js')
}

test('prefers Open Graph and normalizes Chinese HTML metadata', async () => {
  const metadata = await parser()
  if (!metadata) return
  const html = `<!doctype html><html><head>
    <title>普通标题</title>
    <meta content="午夜 &amp; 档案" property="og:title">
    <meta property="og:description" content="  一段\n 中文   简介  ">
    <meta name="description" content="普通简介">
    <meta property="og:site_name" content="示例站点">
    <link href="/favicon.ico" rel="shortcut icon">
  </head></html>`
  assert.deepEqual(metadata.parseHtmlMetadata(html, new URL('https://example.com/page')), {
    title: '午夜 & 档案',
    description: '一段 中文 简介',
    siteName: '示例站点',
    iconUrl: 'https://example.com/favicon.ico',
  })
})

test('falls back to title and truncates at Unicode code-point boundaries', async () => {
  const metadata = await parser()
  if (!metadata) return
  const parsed = metadata.parseHtmlMetadata(
    `<title>${'😀'.repeat(81)}</title><meta name="description" content="${'中'.repeat(181)}">`,
    new URL('https://example.com'),
  )
  assert.equal([...parsed.title].length, 80)
  assert.equal([...parsed.description].length, 180)
  assert.equal(parsed.siteName, '')
})
