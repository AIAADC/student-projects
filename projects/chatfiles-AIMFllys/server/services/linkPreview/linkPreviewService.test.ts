import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

async function serviceModule() {
  const target = path.resolve(process.cwd(), 'server/services/linkPreview/linkPreviewService.ts')
  assert.equal(fs.existsSync(target), true)
  if (!fs.existsSync(target)) return null
  return import('./linkPreviewService.js')
}

test('revalidates redirects, parses metadata, and reuses a bounded cache', async (t) => {
  const module = await serviceModule()
  if (!module) return
  const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chatfiles-link-preview-'))
  t.after(() => fs.rmSync(cacheDir, { recursive: true, force: true }))
  const calls: string[] = []
  const fetchImpl = async (input: string | URL | Request) => {
    const url = String(input)
    calls.push(url)
    if (url.endsWith('/start')) return new Response(null, { status: 302, headers: { location: '/article' } })
    return new Response('<meta property="og:title" content="中文文章"><meta property="og:description" content="可靠简介">', {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    })
  }
  const service = module.createLinkPreviewService({
    cacheDir,
    fetchImpl,
    resolveHost: async () => ['93.184.216.34'],
    now: () => 1_700_000_000_000,
  })
  const first = await service.resolve('a'.repeat(64), 'https://example.com/start')
  assert.equal(first.status, 'ready')
  assert.equal(first.title, '中文文章')
  assert.equal(first.description, '可靠简介')
  assert.deepEqual(calls, ['https://example.com/start', 'https://example.com/article'])
  const cached = await service.resolve('a'.repeat(64), 'https://example.com/start')
  assert.deepEqual(cached, first)
  assert.equal(calls.length, 2)
})

test('stops a redirect to a private address and returns a stable fallback', async (t) => {
  const module = await serviceModule()
  if (!module) return
  const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chatfiles-link-preview-'))
  t.after(() => fs.rmSync(cacheDir, { recursive: true, force: true }))
  let calls = 0
  const service = module.createLinkPreviewService({
    cacheDir,
    fetchImpl: async () => {
      calls += 1
      return new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/private' } })
    },
    resolveHost: async () => ['93.184.216.34'],
    now: () => 1_700_000_000_000,
  })
  const result = await service.resolve('b'.repeat(64), 'https://example.com/start')
  assert.equal(result.status, 'fallback')
  assert.equal(result.domain, 'example.com')
  assert.equal(calls, 1)
})
