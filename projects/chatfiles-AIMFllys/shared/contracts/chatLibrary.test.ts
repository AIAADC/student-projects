import assert from 'node:assert/strict'
import test from 'node:test'

import {
  chatArtifactMetadataSchema,
  chatArtifactPageSchema,
  wechatConversationListSchema,
} from './chatLibrary.js'

const identity = { runId: 'run-一',timeZone: 'Asia/Shanghai' }

test('validates conversation lists with their bundle identity', () => {
  const parsed = wechatConversationListSchema.parse({
    ...identity,
    conversations: [{
      id: 'conv-a',display: '中文会话',is_group: 0,msg_count: 1,text_count: 1,
      first_time: 1,last_time: 1,
    }],
    totals: { conversations: 1,messages: 1,textMessages: 1 },
  })
  assert.equal(parsed.timeZone, 'Asia/Shanghai')
  assert.throws(() => wechatConversationListSchema.parse({
    conversations: [],totals: { conversations: 0,messages: 0 },
  }))
})

test('validates artifact pages and their four independent evidence axes', () => {
  const artifact = {
    id: 'a'.repeat(64),itemType: 'artifact' as const,conversationId: 'conv-a',category: 'document' as const,
    kind: 'resource',name: '资料.pdf',preview: 'pdf',url: null,createdAt: 1,senderName: '张三',size: 10,
    availability: 'ready' as const,association: { status: 'exact' as const,evidence: 'lookup_evidence' },
    source: { presence: 'present' as const },materialization: { status: 'ready' },
    capability: { previewStatus: 'ready' },metadataUrl: '/api/v1/chat/artifacts/a/metadata',
  }
  const page = chatArtifactPageSchema.parse({
    ...identity,tab: 'all',counts: { all: 1,work: 0,document: 1,skill: 0,link: 0,chatText: 0 },
    total: 1,matchingTotal: 1,offset: 0,limit: 60,items: [artifact],
  })
  assert.equal(page.items[0]?.itemType, 'artifact')
  assert.throws(() => chatArtifactPageSchema.parse({ ...page,items: [{ ...artifact,association: undefined }] }))
  assert.equal(chatArtifactMetadataSchema.safeParse({
    ...artifact,capabilities: { metadata: '/metadata',content: '/content' },
  }).success, true)
})
