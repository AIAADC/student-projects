import assert from 'node:assert/strict'
import test from 'node:test'
import { createWechatRouter } from './wechat.js'
import { fixture, withServer } from './wechatRouteTestFixtures.js'

test('binds conversation and artifact pages to the same run and archive time zone', async (t) => {
  const data = fixture(t)
  data.wechatDb.exec(`
    CREATE TABLE parse_runs(run_id TEXT NOT NULL,time_zone TEXT NOT NULL);
    INSERT INTO parse_runs VALUES ('run-shanghai','Asia/Shanghai');
  `)
  const assetId = data.addAsset({ content: 'ready' })
  const linkId = data.addAsset({ category: 'link',url: 'https://example.test/',content: 'ready' })
  await withServer(createWechatRouter(data.dependencies), async (baseUrl) => {
    const conversations = await (await fetch(`${baseUrl}/api/v1/chat/conversations`)).json() as Record<string, unknown>
    const artifacts = await (await fetch(`${baseUrl}/api/v1/chat/artifacts`)).json() as Record<string, unknown>
    assert.deepEqual(
      { runId: conversations.runId,timeZone: conversations.timeZone },
      { runId: 'run-shanghai',timeZone: 'Asia/Shanghai' },
    )
    assert.deepEqual(
      { runId: artifacts.runId,timeZone: artifacts.timeZone },
      { runId: 'run-shanghai',timeZone: 'Asia/Shanghai' },
    )
    assert.equal((await fetch(`${baseUrl}/api/v1/chat/artifacts/${assetId}/metadata`)).status, 200)
    assert.equal((await fetch(`${baseUrl}/api/v1/chat/artifacts/${linkId}/link-preview`)).status, 200)
  })
})
