import assert from 'node:assert/strict'
import test from 'node:test'
import { createWechatRouter } from './wechat.js'
import { fixture, withServer } from './wechatRouteTestFixtures.js'

test('serves a bounded cursor timeline and validates its query', async (t) => {
  const fixtureData = fixture(t)
  fixtureData.wechatDb.exec(`
    INSERT INTO messages VALUES ('conv-a','m-2',2,100,'sender','张三',1,'text','同秒消息');
    INSERT INTO messages VALUES ('conv-a','m-3',3,200,'other','李四',1,'text','最新消息');
    UPDATE conversations SET msg_count=3,text_count=3,last_time=200 WHERE id='conv-a';
  `)
  await withServer(createWechatRouter(fixtureData.dependencies), async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/wechat/conversation/conv-a/timeline?limit=2`)
    assert.equal(response.status, 200)
    const body = await response.json() as {
      messages: Array<{ message_uid: string; text: string }>
      pageInfo: { olderCursor: string | null }
    }
    assert.deepEqual(body.messages.map((message) => message.message_uid), ['m-2', 'm-3'])
    assert.equal(body.messages[1].text, '最新消息')
    assert.ok(body.pageInfo.olderCursor)
    const olderUrl = `${baseUrl}/api/wechat/conversation/conv-a/timeline?limit=2&before=${encodeURIComponent(body.pageInfo.olderCursor!)}`
    const older = await fetch(olderUrl)
    assert.equal(older.status, 200)
    const olderBody = await older.json() as { messages: Array<{ message_uid: string }> }
    assert.deepEqual(olderBody.messages.map((message) => message.message_uid), ['m-1'])
    const anchored = await fetch(`${baseUrl}/api/wechat/conversation/conv-a/timeline?limit=3&aroundUid=m-2`)
    assert.deepEqual((await anchored.json() as { messages: Array<{ message_uid: string }> }).messages
      .map((message) => message.message_uid), ['m-1', 'm-2', 'm-3'])
    assert.equal((await fetch(`${baseUrl}/api/wechat/conversation/conv-a/timeline?aroundUid=missing`)).status, 404)

    for (const query of ['limit=0', 'limit=241', 'before=bad', 'before=a&after=b', 'around=a&aroundUid=m-2', `q=${'x'.repeat(201)}`]) {
      const invalid = await fetch(`${baseUrl}/api/wechat/conversation/conv-a/timeline?${query}`)
      assert.equal(invalid.status, 400, query)
    }
    assert.equal((await fetch(`${baseUrl}/api/wechat/conversation/absent/timeline`)).status, 404)
  })
})
