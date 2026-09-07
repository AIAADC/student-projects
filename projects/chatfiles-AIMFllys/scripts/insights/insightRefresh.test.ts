import assert from 'node:assert/strict'
import test from 'node:test'
import {
  distillInsightMessages,
  formatInsightDigest,
  planInsightDelta,
  reconcileLegacyInsights,
  renderInsightBoard,
  type CurrentInsightConversation,
  type InsightConversation,
  type InsightState,
} from './insightRefresh.js'

const current: CurrentInsightConversation = {
  id: 'wx:wxid_owner:room@chatroom',
  display: '中文测试群',
  isGroup: true,
  textCount: 42,
  firstTime: 1_700_000_000,
  lastTime: 1_700_000_500,
}

const legacy: InsightConversation[] = [
  {
    convId: 'wx:owner-short:room@chatroom',
    name: '旧群名',
    isGroup: true,
    summary: '较旧的总结',
    topics: ['旧主题'],
    keyPeople: ['甲'],
    nuggets: [
      { category: '技术', title: '共同要点', content: '同一条内容', people: ['甲'], date: '2026-06', importance: 3 },
      { category: '学业', title: '旧记录', content: '必须保留中文', people: ['甲'], date: '2026-05', importance: 2 },
    ],
  },
  {
    convId: 'wx:wxid_owner_old:room@chatroom',
    name: '中文测试群',
    isGroup: true,
    summary: '较新的总结',
    topics: ['新主题'],
    keyPeople: ['乙'],
    nuggets: [
      { category: '技术', title: '共同要点', content: '同一条内容', people: ['乙'], date: '2026-06', importance: 4 },
      { category: 'AI', title: '新记录', content: '不能丢失中文', people: ['乙'], date: '2026-06', importance: 5 },
    ],
  },
]

const states: InsightState[] = [
  { convId: legacy[0]!.convId, analyzedTextCount: 30, analyzedLastTime: 1_700_000_100, analyzedAt: 'old' },
  { convId: legacy[1]!.convId, analyzedTextCount: 40, analyzedLastTime: 1_700_000_400, analyzedAt: 'new' },
]

test('reconciles legacy account aliases into one canonical insight without losing unique nuggets', () => {
  const result = reconcileLegacyInsights({
    current: [current],
    legacy,
    states,
    ownerAliases: {
      'owner-short': 'wxid_owner',
      'wxid_owner_old': 'wxid_owner',
    },
  })

  assert.equal(result.conversations.length, 1)
  assert.deepEqual(result.conversations[0], {
    convId: current.id,
    name: current.display,
    isGroup: true,
    summary: '较新的总结',
    topics: ['新主题', '旧主题'],
    keyPeople: ['乙', '甲'],
    nuggets: [legacy[1]!.nuggets[0], legacy[1]!.nuggets[1], legacy[0]!.nuggets[0], legacy[0]!.nuggets[1]],
    legacySummaries: [
      { convId: legacy[1]!.convId, summary: '较新的总结' },
      { convId: legacy[0]!.convId, summary: '较旧的总结' },
    ],
  })
  assert.deepEqual(result.states, [
    {
      convId: current.id,
      analyzedTextCount: 40,
      analyzedLastTime: 1_700_000_400,
      analyzedAt: 'new',
    },
  ])
  assert.deepEqual(result.metrics, {
    legacyFiles: 2,
    legacyConversationKeys: 1,
    canonicalConversations: 1,
    mergedAliasFiles: 1,
    legacyNuggets: 4,
    canonicalNuggets: 4,
    duplicateNuggetsRemoved: 0,
  })
})

test('plans only new and materially grown conversations while preserving small increments', () => {
  const conversations: CurrentInsightConversation[] = [
    current,
    { ...current, id: 'wx:wxid_owner:new-peer', display: '新增会话', textCount: 20 },
    { ...current, id: 'wx:wxid_owner:small-peer', display: '小增量', textCount: 42 },
    { ...current, id: 'wx:wxid_owner:same-peer', display: '未变化', textCount: 40 },
  ]
  const currentStates: InsightState[] = [
    {
      ...states[0]!, convId: current.id, analyzedLastMessageUid: 'message-30',
      analyzedLastSequence: 29,
    },
    { ...states[1]!, convId: 'wx:wxid_owner:small-peer' },
    { ...states[1]!, convId: 'wx:wxid_owner:same-peer' },
  ]

  const result = planInsightDelta(conversations, currentStates, 8)

  assert.deepEqual(result.entries, [
    {
      conversation: current,
      kind: 'grown',
      since: states[0]!.analyzedLastTime,
      sinceMessageUid: 'message-30',
      sinceSequence: 29,
      previousTextCount: 30,
    },
    {
      conversation: conversations[1], kind: 'new', since: 0, sinceMessageUid: '',
      sinceSequence: null, previousTextCount: 0,
    },
  ])
  assert.deepEqual(result.metrics, {
    new: 1,
    grown: 1,
    accumulated: 1,
    unchanged: 1,
  })
})

test('refuses ambiguous canonical usernames instead of guessing across accounts', () => {
  assert.throws(
    () => reconcileLegacyInsights({
      current: [current, { ...current, id: 'wx:other-owner:room@chatroom' }],
      legacy,
      states,
      ownerAliases: {
        'owner-short': 'wxid_owner',
        'wxid_owner_old': 'wxid_owner',
      },
    }),
    /ambiguous/u,
  )
})

test('distills a grown tail into bounded Chinese nuggets without replacing the existing summary', () => {
  const existing = legacy[1]!
  const longText = `我建议先用 Codex 做本地代码审计，再逐步修复问题。${'这是需要保留的中文内容。'.repeat(12)}`

  const result = distillInsightMessages({
    conversation: current,
    kind: 'grown',
    existing,
    messages: [
      { time: 1_700_000_410, senderName: '甲', text: '收到' },
      { time: 1_700_000_420, senderName: '孔德羽', text: longText },
      { time: 1_700_000_430, senderName: '乙', text: 'https://example.com' },
    ],
  })

  assert.equal(result.conversation.summary, existing.summary)
  assert.equal(result.addedNuggets, 1)
  assert.equal(result.conversation.nuggets.length, existing.nuggets.length + 1)
  assert.equal(result.conversation.nuggets.at(-1)?.category, 'AI')
  assert.equal(result.conversation.nuggets.at(-1)?.people?.[0], '孔德羽')
  assert.equal(Array.from(result.conversation.nuggets.at(-1)?.content ?? '').length <= 140, true)
  assert.match(result.conversation.nuggets.at(-1)?.content ?? '', /中文内容/u)
  assert.deepEqual(result.metrics, { inputRows: 3, eligibleRows: 1, selectedRows: 1, addedNuggets: 1 })
})

test('refuses legacy owners without an explicit canonical alias mapping', () => {
  assert.throws(
    () => reconcileLegacyInsights({ current: [current], legacy, states, ownerAliases: {} }),
    /owner alias/u,
  )
})

test('formats a bounded UTF-8 digest without splitting emoji or Chinese text', () => {
  const digest = formatInsightDigest(
    current,
    'new',
    [{ time: 1_700_000_420, senderName: '孔德羽', text: `中文😀${'内容'.repeat(80)}` }],
    150,
    'Asia/Shanghai',
  )

  assert.match(digest, /^会话：中文测试群（群聊）/u)
  assert.match(digest, /首次提炼/u)
  assert.match(digest, /\[2023-11-15 06:20:20 \+08:00\] 孔德羽:/u)
  assert.equal(Array.from(digest).length <= 150, true)
  assert.equal(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(digest), false)
})

test('creates an evidence-bounded summary and topics for a new conversation', () => {
  const result = distillInsightMessages({
    conversation: { ...current, display: '新会话' },
    kind: 'new',
    messages: [
      { time: 1_700_000_420, senderName: '乙', text: '这次决定使用 Python 编写本地数据处理工具，并在完成后复盘。' },
    ],
  })

  assert.match(result.conversation.summary, /新会话.*2023-11-15.*1 条/u)
  assert.deepEqual(result.conversation.topics, ['资源工具'])
  assert.deepEqual(result.conversation.keyPeople, ['乙'])
})

test('renders a deterministic board from exact nuggets with source and coverage counts', () => {
  const board = renderInsightBoard('AI', [
    {
      convId: current.id,
      conversationName: '中文测试群',
      nugget: { category: 'AI', title: '重要方法', content: '先审计来源，再推进高水位。', date: '2026-07', importance: 5 },
    },
    {
      convId: 'wx:canonical:other',
      conversationName: '另一个会话',
      nugget: { category: 'AI', title: '次要记录', content: '这条不进入展示上限。', date: '2026-06', importance: 2 },
    },
  ], 1)

  assert.match(board, /^# AI 主题板/u)
  assert.match(board, /> 先审计来源，再推进高水位。/u)
  assert.match(board, /来源：中文测试群 · 2026-07/u)
  assert.match(board, /基于 2 条要点，覆盖 2 个会话；展示 1 条/u)
  assert.doesNotMatch(board, /这条不进入展示上限/u)
})

test('escapes nugget Markdown so quoted source text cannot change the board structure', () => {
  const board = renderInsightBoard('技术', [{
    convId: current.id,
    conversationName: '含#符号的群',
    nugget: {
      category: '技术',
      title: '# 配置 `nvm`',
      content: '# 标题 [链接](https://example.com) 与 `代码`',
      date: '2026-07',
      importance: 5,
    },
  }])

  assert.match(board, /### 配置 \\`nvm\\`/u)
  assert.equal(board.includes('> \\# 标题 \\[链接\\]\\(https://example.com\\) 与 \\`代码\\`'), true)
  assert.match(board, /来源：含\\#符号的群/u)
})
