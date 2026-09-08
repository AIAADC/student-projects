import assert from 'node:assert/strict'
import test from 'node:test'

import { buildInsightsResponse } from '../application/insights/insightsQueryService.js'
import { createInsightsRouter } from './insights.js'
import { withServer } from './wechatRouteTestFixtures.js'

test('builds sorted insight categories and summaries outside the HTTP route', () => {
  const result = buildInsightsResponse({
    boards: { AI: '# AI' },
    conversations: [{
      convId: 'conv-a', name: '中文群', isGroup: true, summary: '摘要', topics: ['架构'],
      keyPeople: ['张三'], nuggets: [
        { category: 'AI', title: '低', content: '内容', importance: 1 },
        { category: 'AI', title: '高', content: '内容', importance: 9 },
      ],
    }],
  })

  assert.equal(result.convCount, 1)
  assert.equal(result.nuggetCount, 2)
  assert.deepEqual(result.byCategory.AI?.map((item) => item.title), ['高', '低'])
  assert.deepEqual(result.summaries[0], {
    convId: 'conv-a', name: '中文群', isGroup: true, summary: '摘要',
    topics: ['架构'], keyPeople: ['张三'],
  })
})

test('keeps insight routes as thin application-service adapters', async () => {
  const calls: string[] = []
  const service = {
    insights() { calls.push('insights'); return { marker: '洞察' } },
    overview() { calls.push('overview'); return { marker: '总览' } },
  }
  await withServer(createInsightsRouter('C:\\fixture', service), async (baseUrl) => {
    assert.deepEqual(await (await fetch(`${baseUrl}/api/insights`)).json(), { marker: '洞察' })
    assert.deepEqual(await (await fetch(`${baseUrl}/api/overview`)).json(), { marker: '总览' })
    assert.deepEqual(await (await fetch(`${baseUrl}/api/v1/insights`)).json(), { marker: '洞察' })
    assert.deepEqual(await (await fetch(`${baseUrl}/api/v1/overview`)).json(), { marker: '总览' })
  })
  assert.deepEqual(calls, ['insights', 'overview', 'insights', 'overview'])
})
