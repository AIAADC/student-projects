import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { createApp } from './app.js'
import { withServer } from './routes/wechatRouteTestFixtures.js'

test('returns JSON 404 for unknown APIs before serving the SPA fallback', async (t) => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'chatfiles-app-boundary-'))
  const projectRoot = path.join(temporaryRoot, '.hidden-worktree')
  fs.mkdirSync(path.join(projectRoot, 'dist'), { recursive: true })
  fs.writeFileSync(path.join(projectRoot, 'dist', 'index.html'), '<!doctype html><title>ChatFiles SPA</title>', 'utf8')
  t.after(() => fs.rmSync(temporaryRoot, { recursive: true, force: true }))

  await withServer(createApp({ projectRoot }), async (baseUrl) => {
    const api = await fetch(`${baseUrl}/api/not-a-real-endpoint`)
    assert.equal(api.status, 404)
    assert.match(api.headers.get('content-type') ?? '', /application\/json/u)
    assert.deepEqual(await api.json(), { error: 'Request failed', code: 'not_found' })

    const page = await fetch(`${baseUrl}/deep-link`)
    assert.equal(page.status, 200)
    assert.match(await page.text(), /ChatFiles SPA/u)
  })
})

test('applies the AI 2 MiB body limit before the larger global JSON parser', async (t) => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'chatfiles-ai-body-'))
  t.after(() => fs.rmSync(projectRoot, { recursive: true, force: true }))
  await withServer(createApp({ projectRoot }), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/ai/agent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ payload: 'x'.repeat(2 * 1024 * 1024 + 1) }),
    })
    assert.equal(response.status, 413)
    assert.deepEqual(await response.json(), { error: 'Request failed', code: 'body_too_large' })
  })
})

test('maps malformed JSON through the same public error envelope', async () => {
  await withServer(createApp(), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/operations/list_conversations`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{',
    })
    assert.equal(response.status, 400)
    assert.deepEqual(await response.json(), { error: 'Request failed', code: 'invalid_json_body' })
  })
})

test('applies the operation body limit before the global parser', async () => {
  await withServer(createApp(), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/operations/list_conversations`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ padding: 'x'.repeat(256 * 1024 + 1) }),
    })
    assert.equal(response.status, 413)
    assert.deepEqual(await response.json(), { error: 'Request failed', code: 'body_too_large' })
  })
})
