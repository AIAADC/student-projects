import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import type { TimelineMessage, TimelineParticipant } from '../../types'

function message(id: string, time: number, sender = 'u-1', canonicalSequence?: number): TimelineMessage {
  return {
    message_uid: id,
    seq: Number(id.replace(/\D/gu, '')) || 0,
    ...(canonicalSequence === undefined ? {} : { canonical_seq: canonicalSequence }),
    time,
    sender,
    sender_name: sender === 'u-1' ? '张三' : '李四',
    type: 1,
    type_label: '文本',
    text: `消息 ${id}`,
  }
}

async function model() {
  const modulePath = path.resolve(process.cwd(), 'src/features/chat-timeline/timelineModel.ts')
  assert.equal(fs.existsSync(modulePath), true)
  if (!fs.existsSync(modulePath)) return null
  return import('./timelineModel.js')
}

test('groups days and keeps explicit identity at sender or time boundaries', async () => {
  const timeline = await model()
  if (!timeline) return
  const items = timeline.groupTimelineMessages([
    message('m1', 1_700_000_000),
    message('m2', 1_700_000_060),
    message('m3', 1_700_000_700),
    message('m4', 1_700_090_000, 'u-2'),
  ])
  assert.equal(items.filter((item: { kind: string }) => item.kind === 'day').length, 2)
  assert.deepEqual(
    items.filter((item) => item.kind === 'message').map((item) => item.showIdentity),
    [true, false, true, true],
  )
})

test('merges duplicate message pages in canonical order', async () => {
  const timeline = await model()
  if (!timeline) return
  const merged = timeline.mergeTimelineMessages(
    [message('m-z', 100, 'u-1', 0), message('m-3', 200, 'u-1', 2)],
    [message('m-a', 100, 'u-1', 1), message('m-z', 100, 'u-1', 0)],
  )
  assert.deepEqual(merged.map((item: TimelineMessage) => item.message_uid), ['m-z', 'm-a', 'm-3'])
})

test('groups archive days in the bundle time zone instead of the browser time zone', async () => {
  const timeline = await model()
  if (!timeline) return
  const items = timeline.groupTimelineMessages([
    message('before-midnight', 1_704_036_600, 'u-1', 0),
    message('after-midnight', 1_704_040_200, 'u-1', 1),
  ], 'Asia/Shanghai')

  assert.deepEqual(
    items.filter((item) => item.kind === 'day').map((item) => item.key),
    ['day:2023-12-31', 'day:2024-01-01'],
  )
})

test('formats bundle-zone timestamps to the source second', async () => {
  const timeline = await model()
  if (!timeline) return
  assert.equal(timeline.formatTimelineClock(1_700_000_000, 'Asia/Shanghai'), '06:13:20')
})

test('retains at most five page windows around the active anchor', async () => {
  const timeline = await model()
  if (!timeline) return
  const pages = Array.from({ length: 7 }, (_, index) => ({
    id: `p${index}`,
    messages: [message(`m${index}`, index)],
  }))
  assert.deepEqual(
    timeline.trimTimelinePages(pages, 5, 'm3').map((page: { id: string }) => page.id),
    ['p1', 'p2', 'p3', 'p4', 'p5'],
  )
})

test('matches participant names and IDs and resolves stable anchors', async () => {
  const timeline = await model()
  if (!timeline) return
  const participant: TimelineParticipant = {
    senderKey: 'WXID_Alice', personId: null, name: '张三', identitySource: 'sender',
    messageCount: 2, lastTime: 10,
  }
  assert.equal(timeline.participantMatches(participant, '张'), true)
  assert.equal(timeline.participantMatches(participant, 'alice'), true)
  assert.equal(timeline.participantMatches(participant, '李四'), false)
  const messages = [message('m1', 1), message('m2', 2)]
  assert.equal(timeline.timelineAnchorTarget(messages, 'm2')?.message_uid, 'm2')
  assert.equal(timeline.timelineAnchorTarget(messages, 'absent'), undefined)
  assert.equal(timeline.senderKeyForMessage({ ...message('m3', 3, ''), sender_name: '张三' }), '张三')
})
