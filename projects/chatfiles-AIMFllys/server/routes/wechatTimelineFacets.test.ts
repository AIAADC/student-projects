import assert from 'node:assert/strict'
import test from 'node:test'

import { createWechatRouter } from './wechat.js'
import { fixture, withServer } from './wechatRouteTestFixtures.js'

test('serves v1 message pages, participant facets, and paginated daily anchors separately', async (t) => {
  const fixtureData = fixture(t)
  fixtureData.wechatDb.exec(`
    INSERT INTO messages VALUES ('conv-a','m-2',2,86400,'sender','张三',1,'text','第二天');
    INSERT INTO messages VALUES ('conv-a','m-3',3,172800,'other','李四',1,'text','第三天');
    UPDATE conversations SET msg_count=3,text_count=3,last_time=172800 WHERE id='conv-a';
  `)

  await withServer(createWechatRouter(fixtureData.dependencies), async (baseUrl) => {
    const timeline = await fetch(`${baseUrl}/api/v1/chat/conversations/conv-a/timeline?limit=2`)
    assert.equal(timeline.status, 200)
    const page = await timeline.json() as Record<string, unknown>
    assert.equal('participants' in page, false)
    assert.equal('buckets' in page, false)

    const participantResponse = await fetch(
      `${baseUrl}/api/v1/chat/conversations/conv-a/timeline/participants`,
    )
    assert.equal(participantResponse.status, 200)
    const participants = await participantResponse.json() as {
      participants: Array<{ senderKey: string; name: string; messageCount: number }>
    }
    assert.deepEqual(participants.participants.map((participant) => participant.senderKey), ['sender', 'other'])
    assert.equal(participants.participants[0]?.messageCount, 2)

    const dayResponse = await fetch(
      `${baseUrl}/api/v1/chat/conversations/conv-a/timeline/days?limit=2`,
    )
    assert.equal(dayResponse.status, 200)
    const days = await dayResponse.json() as {
      days: Array<{ date: string; firstMessageUid: string; firstSequence: number }>
      pageInfo: { nextCursor: string | null; hasMore: boolean }
    }
    assert.deepEqual(days.days.map((day) => day.date), ['1970-01-03', '1970-01-02'])
    assert.equal(days.days[0]?.firstMessageUid, 'm-3')
    assert.equal(days.pageInfo.hasMore, true)

    const next = await fetch(
      `${baseUrl}/api/v1/chat/conversations/conv-a/timeline/days?limit=2&before=${days.pageInfo.nextCursor}`,
    )
    assert.deepEqual((await next.json() as { days: Array<{ date: string }> }).days, [{
      date: '1970-01-01', firstMessageUid: 'm-1', firstSequence: 1, messageCount: 1,
    }])

    for (const suffix of [
      'days?limit=0',
      'days?limit=367',
      'days?before=2026-7-1',
      'days?before=2026-02-30',
      'participants?q=' + 'x'.repeat(201),
    ]) {
      assert.equal(
        (await fetch(`${baseUrl}/api/v1/chat/conversations/conv-a/timeline/${suffix}`)).status,
        400,
        suffix,
      )
    }
  })
})

test('uses Unicode code points for facet limits and marks evidence-free people unknown', async (t) => {
  const fixtureData = fixture(t)
  fixtureData.wechatDb.exec(`
    INSERT INTO messages VALUES ('conv-a','m-unknown',2,200,'','',1,'text','无身份消息');
  `)

  await withServer(createWechatRouter(fixtureData.dependencies), async (baseUrl) => {
    const acceptedQuery = encodeURIComponent('😀'.repeat(200))
    const acceptedSender = encodeURIComponent('😀'.repeat(512))
    assert.equal((await fetch(
      `${baseUrl}/api/v1/chat/conversations/conv-a/timeline/participants?q=${acceptedQuery}`,
    )).status, 200)
    assert.equal((await fetch(
      `${baseUrl}/api/v1/chat/conversations/conv-a/timeline/days?sender=${acceptedSender}`,
    )).status, 200)

    const rejectedQuery = encodeURIComponent('😀'.repeat(201))
    assert.equal((await fetch(
      `${baseUrl}/api/v1/chat/conversations/conv-a/timeline/participants?q=${rejectedQuery}`,
    )).status, 400)

    const response = await fetch(`${baseUrl}/api/v1/chat/conversations/conv-a/timeline/participants`)
    const page = await response.json() as {
      participants: Array<{ senderKey: string; identitySource: string }>
    }
    assert.equal(page.participants.find((participant) => participant.senderKey === '?')?.identitySource, 'unknown')
  })
})
