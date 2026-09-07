import assert from 'node:assert/strict'
import test from 'node:test'
import { createWechatRouter } from './wechat.js'
import { fixture, withServer } from './wechatRouteTestFixtures.js'

test('serves path-free link metadata only for link artifact IDs', async (t) => {
  const fixtureData = fixture(t)
  const linkId = fixtureData.addAsset({
    category: 'link', kind: 'link', preview: 'link', relativePath: null, url: 'https://example.test/文章',
  })
  const fileId = fixtureData.addAsset({ name: '普通文件.txt', preview: 'text', content: 'text' })
  const router = createWechatRouter({
    ...fixtureData.dependencies,
    resolveLinkPreview: async (_id, url) => ({
      status: 'ready', url, domain: 'example.test', title: '中文介绍', description: '内容简介',
      siteName: '示例', iconUrl: '', updatedAt: '2026-07-13T00:00:00.000Z',
    }),
  })
  await withServer(router, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/wechat/artifact/${linkId}/link-preview`)
    assert.equal(response.status, 200)
    const body = await response.json() as Record<string, unknown>
    assert.equal(body.title, '中文介绍')
    assert.doesNotMatch(JSON.stringify(body), /source_|wxid_fixture|chatfiles-wechat-http/u)
    assert.equal((await fetch(`${baseUrl}/api/wechat/artifact/${fileId}/link-preview`)).status, 415)
    assert.equal((await fetch(`${baseUrl}/api/wechat/artifact/not-an-id/link-preview`)).status, 400)
    assert.equal((await fetch(`${baseUrl}/api/wechat/artifact/${'f'.repeat(64)}/link-preview`)).status, 404)
  })
})
