import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const contractsRoot = path.resolve(process.cwd(), 'shared', 'contracts')

async function contracts() {
  const entrypoint = path.join(contractsRoot, 'index.ts')
  assert.equal(fs.existsSync(entrypoint), true, 'shared/contracts/index.ts must exist')
  if (!fs.existsSync(entrypoint)) return null
  return import('../../shared/contracts/index.js')
}

function sourceFiles(root: string): string[] {
  if (!fs.existsSync(root)) return []
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(root, entry.name)
    if (entry.isDirectory()) return sourceFiles(target)
    return entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') ? [target] : []
  })
}

test('defines UTF-8 safe stable ID and time primitives', async () => {
  const shared = await contracts()
  if (!shared) return

  assert.equal(shared.stableIdSchema.parse('会话-张三-🙂'), '会话-张三-🙂')
  assert.equal(shared.sha256IdSchema.parse('a'.repeat(64)), 'a'.repeat(64))
  assert.throws(() => shared.stableIdSchema.parse('含\u0000空字节'))
  assert.throws(() => shared.sha256IdSchema.parse('A'.repeat(64)))

  assert.equal(shared.unixSecondsSchema.parse(1_700_000_000), 1_700_000_000)
  assert.equal(shared.isoTimestampSchema.parse('2026-07-13T12:34:56.000Z'), '2026-07-13T12:34:56.000Z')
  assert.equal(shared.timeZoneSchema.parse('America/Los_Angeles'), 'America/Los_Angeles')
  assert.throws(() => shared.unixSecondsSchema.parse(1.5))
  assert.throws(() => shared.isoTimestampSchema.parse('2026/07/13'))
})

test('normalizes the shared API error DTO', async () => {
  const shared = await contracts()
  if (!shared) return

  const error = shared.makeApiError('database_unavailable', { resource: '微信数据库' })
  assert.deepEqual(shared.apiErrorSchema.parse(error), {
    error: 'Request failed',
    code: 'database_unavailable',
    details: { resource: '微信数据库' },
  })
  assert.throws(() => shared.makeApiError('Bad-Code'))
  assert.throws(() => shared.apiErrorSchema.parse({ error: '失败', code: 'Bad-Code' }))
})

test('validates and de-duplicates an agent context summary without damaging Chinese', async () => {
  const shared = await contracts()
  if (!shared) return

  const emptySections = {
    facts: [], people: [], dates: [], quotes: [], decisions: [], disputes: [], openItems: [],
  }
  const parsed = shared.parseAgentContextSummary({
    version: 1,
    sourceHash: 'b'.repeat(64),
    sourceRange: { firstUid: '消息-一', lastUid: '消息-二', count: 2 },
    sections: {
      ...emptySections,
      facts: [{ text: '中文🙂保持完整', sourceUids: ['消息-一', '消息-一', '消息-二'] }],
    },
  })
  assert.deepEqual(parsed?.sections.facts, [{
    text: '中文🙂保持完整',
    sourceUids: ['消息-一', '消息-二'],
  }])
  assert.equal(shared.parseAgentContextSummary({ version: 1, sourceHash: 'bad' }), undefined)
})

test('separates bounded timeline messages from participant and daily facets', async () => {
  const shared = await contracts()
  if (!shared) return

  const page = shared.timelinePageSchema.parse({
    conversationId: '会话-一',
    runId: 'run-一',
    timeZone: 'Asia/Shanghai',
    limit: 120,
    messages: [{
      message_uid: '消息-一', seq: 1, canonical_seq: 1,
      occurred_at_epoch_s: 1_700_000_000, time_precision: 'second', archive_day: '2023-11-15',
      time: 1_700_000_000, sender: 'wxid-张三', person_id: '人物-一',
      sender_name: '张三', type: 1, type_label: '文本', text: '你好🙂',
    }],
    pageInfo: { olderCursor: null, newerCursor: 'cursor-一', hasOlder: false, hasNewer: true },
  })
  assert.equal(page.messages[0].text, '你好🙂')
  assert.equal('participants' in page, false)
  assert.equal('buckets' in page, false)

  const participants = shared.timelineParticipantPageSchema.parse({
    conversationId: '会话-一', runId: 'run-一', timeZone: 'Asia/Shanghai',
    participants: [{
      senderKey: 'wxid-张三', personId: '人物-一', name: '张三', identitySource: 'person_id',
      messageCount: 1, lastTime: 1_700_000_000,
    }],
  })
  assert.equal(participants.participants[0].senderKey, 'wxid-张三')

  const days = shared.timelineDayPageSchema.parse({
    conversationId: '会话-一', runId: 'run-一', timeZone: 'Asia/Shanghai', limit: 90,
    days: [{ date: '2026-07-13', firstMessageUid: '消息-一', firstSequence: 1, messageCount: 3 }],
    pageInfo: { nextCursor: '2026-07-13', hasMore: true },
  })
  assert.equal(days.days[0].date, '2026-07-13')
  assert.throws(() => shared.timelineDayPageSchema.parse({
    ...days,
    days: [{ ...days.days[0], date: '2026-7-13' }],
  }))
})

test('publishes versioned UI and chat-library response schemas from one contract entrypoint', async () => {
  const shared = await contracts()
  if (!shared) return
  assert.equal(typeof shared.overviewSchema?.safeParse, 'function')
  assert.equal(typeof shared.wechatConversationListSchema?.safeParse, 'function')
  assert.equal(typeof shared.chatArtifactPageSchema?.safeParse, 'function')
  assert.equal(typeof shared.chatArtifactMetadataSchema?.safeParse, 'function')
})

test('requires canonical sequence, second precision, and nullable audited identity on MessageDto', async () => {
  const shared = await contracts()
  if (!shared) return
  const message = shared.messageDtoSchema.parse({
    message_uid: '消息-一',
    canonical_seq: 0,
    occurred_at_epoch_s: 1_700_000_000,
    time_precision: 'second',
    archive_day: '2023-11-15',
    sender_key: 'person:人物-一',
    person_id: '人物-一',
    sender_name: '张三',
    sender_source: 'message-name2id',
    sender_audit: null,
    raw_type: '1',
    type: 1,
    type_label: 'text',
    content_kind: 'text',
    structured_content: {},
    text: '中文正文',
  })
  assert.equal(message.time_precision, 'second')
  assert.throws(() => shared.messageDtoSchema.parse({ ...message, canonical_seq: -1 }))
})

test('keeps shared contracts environment-neutral and removes server imports from src', () => {
  const sharedSource = sourceFiles(path.resolve(process.cwd(), 'shared'))
    .map((file) => fs.readFileSync(file, 'utf8'))
    .join('\n')
  assert.doesNotMatch(
    sharedSource,
    /(?:from\s+['"](?:node:|react|express)|\b(?:window|document|localStorage)\s*(?:\.|\[))/u,
  )

  const serverSource = sourceFiles(path.resolve(process.cwd(), 'server'))
    .map((file) => fs.readFileSync(file, 'utf8'))
    .join('\n')
  assert.doesNotMatch(
    serverSource,
    /from\s+['"][^'"]*src\/(?:types|utils\/(?:aiConfig|aiContext|aiSummaryValidation))/u,
  )
})
