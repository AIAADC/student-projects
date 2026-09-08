import assert from 'node:assert/strict'
import test from 'node:test'

import { createWechatRouter } from './wechat.js'
import type { WechatRouterDependencies } from './wechatRouteHelpers.js'
import { fixture, withServer } from './wechatRouteTestFixtures.js'

test('blocks only an oversized legacy artifact archive preview before resolving content', async (t) => {
  const fixtureData = fixture(t)
  const archive = fixtureData.addAsset({
    name: '超大资料.zip', preview: 'archive', relativePath: '超大资料.zip', content: 'small fixture',
  })
  fixtureData.assetDb.prepare('UPDATE artifacts SET source_size=? WHERE asset_id=?')
    .run(512 * 1024 * 1024 + 1, archive)

  await withServer(createWechatRouter(fixtureData.dependencies), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/wechat/artifact/${archive}/archive`)
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), {
      path: '',
      size: 512 * 1024 * 1024 + 1,
      modified: new Date(0).toISOString(),
      format: '.zip',
      readable: false,
      blockedReason: 'archive_file_too_large',
      entries: [],
      error: '压缩包目录不可读',
    })
  })
})

test('distinguishes an unavailable conversation product from a real empty list', async (t) => {
  const fixtureData = fixture(t)
  const dependencies: WechatRouterDependencies = {
    ...fixtureData.dependencies,
    openWechatDatabase: () => ({ db: null, release() {} }),
  }

  await withServer(createWechatRouter(dependencies), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/wechat/conversations`)
    assert.equal(response.status, 503)
    assert.deepEqual(await response.json(), { error: 'Request failed', code: 'database_unavailable' })
  })
})

test('keeps new UI chat reads under the v1 namespace', async (t) => {
  const fixtureData = fixture(t)
  await withServer(createWechatRouter(fixtureData.dependencies), async (baseUrl) => {
    assert.equal((await fetch(`${baseUrl}/api/v1/chat/conversations`)).status, 200)
    assert.equal((await fetch(`${baseUrl}/api/v1/chat/artifacts`)).status, 200)
    assert.equal((await fetch(`${baseUrl}/api/v1/chat/conversations/conv-a/artifacts`)).status, 200)
  })
})
