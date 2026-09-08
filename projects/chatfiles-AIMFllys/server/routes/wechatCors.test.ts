import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { createApp } from '../app.js'
import { createWechatRouter } from './wechat.js'
import { fixture } from './wechatRouteTestFixtures.js'

test('the production app does not grant cross-origin read access', async (t) => {
  const fixtureData = fixture(t)
  fixtureData.addAsset({ content: 'ready' })
  const privateDatabasePath = path.join(fixtureData.root, 'data', 'chat-assets.current', 'artifacts.db')
  fs.mkdirSync(path.dirname(privateDatabasePath), { recursive: true })
  fs.writeFileSync(privateDatabasePath, 'PRIVATE_DATABASE_BYTES')
  const app = createApp({ projectRoot: fixtureData.root, wechatRouter: createWechatRouter(fixtureData.dependencies) })
  const server = app.listen(0, '127.0.0.1')
  await new Promise<void>((resolve) => server.once('listening', resolve))
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/wechat/artifacts`, {
      headers: { Origin: 'https://evil.example' },
    })
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('access-control-allow-origin'), null)

    const directDatabase = await fetch(
      `http://127.0.0.1:${address.port}/data/chat-assets.current/artifacts.db`,
    )
    assert.notEqual(directDatabase.status, 200)
    assert.doesNotMatch(await directDatabase.text(), /PRIVATE_DATABASE_BYTES/u)
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
})
