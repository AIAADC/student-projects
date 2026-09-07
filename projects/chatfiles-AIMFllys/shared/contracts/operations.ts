import { z } from 'zod/v4'

import { dataCatalogStatusSchema, dataProductStatusSchema, derivedSearchStatusSchema } from './dataStatus.js'
import { productKindSchema } from './productCatalog.js'
import { isoTimestampSchema, sha256IdSchema, stableIdSchema } from './primitives.js'

export const OPERATION_NAMES = [
  'status',
  'list_conversations',
  'search_messages',
  'search_artifacts',
  'read_document',
  'get_message_context',
  'get_timeline_slice',
  'get_link_preview',
] as const

export type OperationName = (typeof OPERATION_NAMES)[number]
export type OperationDependency = 'chat' | 'assets' | 'documents' | 'link'
export type OperationLimit = {
  field: string
  default: number
  minimum: number
  maximum: number
}

const limit = (fallback: number) => z.number().int().min(1).max(100).default(fallback)
function unicodeText(maximum: number, trim = false) {
  const schema = trim ? z.string().trim() : z.string()
  return schema.refine((value) => [...value].length <= maximum).meta({ maxLength: maximum })
}
const optionalText = (maximum: number) => unicodeText(maximum, true).optional()
const requiredId = unicodeText(512, true)
  .refine((value) => value.length > 0)
  .meta({ minLength: 1, maxLength: 512 })
const safeInteger = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
const citationSchema = z.string().min(1).max(600)

const publicMessageSchema = z.object({
  conversationId: stableIdSchema,
  messageUid: stableIdSchema,
  time: safeInteger,
  canonicalSequence: safeInteger.optional(),
  sender: z.string(),
  senderName: z.string(),
  typeLabel: z.string(),
  text: unicodeText(4_000),
  citation: citationSchema,
}).strict()

const citationsSchema = z.array(citationSchema).max(100)

const statusOutputSchema = z.object({
  name: z.string().min(1).max(100),
  version: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).optional(),
  wechat: z.enum(['ready', 'unavailable']),
  artifacts: z.enum(['ready', 'unavailable']),
  catalog: dataCatalogStatusSchema.optional(),
  products: z.record(productKindSchema, dataProductStatusSchema).optional(),
  derived: z.object({ search: derivedSearchStatusSchema }).strict().optional(),
}).strict()

const listConversationsOutputSchema = z.object({
  conversations: z.array(z.object({
    id: stableIdSchema,
    display: z.string(),
    isGroup: z.boolean(),
    messageCount: safeInteger,
    textCount: safeInteger,
    firstTime: safeInteger,
    lastTime: safeInteger,
  }).strict()).max(100),
}).strict()

const searchMessagesOutputSchema = z.object({
  mode: z.enum(['hybrid', 'keyword-only']),
  reason: z.enum(['not_configured', 'embedding_mismatch', 'vector_unavailable']).optional(),
  hits: z.array(z.object({
    conversationId: stableIdSchema,
    firstMessageUid: stableIdSchema,
    lastMessageUid: stableIdSchema,
    firstSequence: safeInteger,
    lastSequence: safeInteger,
    startTime: safeInteger,
    endTime: safeInteger,
    senders: z.array(z.string()).max(100),
    text: unicodeText(4_000),
    citation: citationSchema,
  }).strict()).max(100),
  citations: citationsSchema,
}).strict()

const searchArtifactsOutputSchema = z.object({
  artifacts: z.array(z.object({
    assetId: sha256IdSchema,
    conversationId: stableIdSchema.nullable(),
    category: z.enum(['work', 'document', 'skill', 'link']),
    name: z.string(),
    preview: z.string(),
    senderName: z.string(),
    createdAt: safeInteger,
    availability: z.string().min(1).max(64),
    citation: citationSchema,
  }).strict()).max(100),
  citations: citationsSchema,
}).strict()

const readDocumentOutputSchema = z.object({
  assetId: sha256IdSchema,
  title: z.string(),
  text: unicodeText(50_000),
  truncated: z.boolean(),
  citation: citationSchema,
}).strict()

const messageContextOutputSchema = z.object({
  conversationId: stableIdSchema,
  messages: z.array(publicMessageSchema).max(41),
  citations: z.array(citationSchema).max(41),
}).strict()

const timelineOutputSchema = z.object({
  conversationId: stableIdSchema,
  messages: z.array(publicMessageSchema).max(100),
  pageInfo: z.object({
    olderCursor: stableIdSchema.nullable(),
    newerCursor: stableIdSchema.nullable(),
    hasOlder: z.boolean(),
    hasNewer: z.boolean(),
  }).strict(),
  citations: citationsSchema,
}).strict()

const linkPreviewOutputSchema = z.object({
  status: z.enum(['ready', 'fallback']),
  url: z.string(),
  domain: z.string(),
  title: z.string(),
  description: z.string(),
  siteName: z.string(),
  updatedAt: isoTimestampSchema,
  citation: citationSchema,
}).strict()

function operation<const Definition extends {
  name: OperationName
  description: string
  readOnly: true
  dependencies: readonly OperationDependency[]
  limits: readonly OperationLimit[]
  inputSchema: z.ZodType
  outputSchema: z.ZodType
}>(definition: Definition) {
  return definition
}

const commonLimit = { field: 'limit', default: 20, minimum: 1, maximum: 100 } as const

export const operationCatalog = {
  status: operation({
    name: 'status', description: '读取本地资料库的公开可用状态。', readOnly: true,
    dependencies: [], limits: [], inputSchema: z.object({}).strict(), outputSchema: statusOutputSchema,
  }),
  list_conversations: operation({
    name: 'list_conversations', description: '按名称列出会话及其消息范围。', readOnly: true,
    dependencies: ['chat'], limits: [commonLimit],
    inputSchema: z.object({ query: optionalText(120), limit: limit(20) }).strict(),
    outputSchema: listConversationsOutputSchema,
  }),
  search_messages: operation({
    name: 'search_messages', description: '以关键词与可用向量混合搜索聊天原文，返回消息证据引用。', readOnly: true,
    dependencies: ['chat'], limits: [commonLimit],
    inputSchema: z.object({
      query: unicodeText(500, true).refine((value) => value.length > 0).meta({ minLength: 1, maxLength: 500 }),
      conversationId: optionalText(512), sender: optionalText(512),
      after: safeInteger.optional(), before: safeInteger.optional(), limit: limit(20),
    }).strict(),
    outputSchema: searchMessagesOutputSchema,
  }),
  search_artifacts: operation({
    name: 'search_artifacts', description: '搜索作品、文档、Skills 与链接的名称和摘要。', readOnly: true,
    dependencies: ['chat', 'assets'], limits: [commonLimit],
    inputSchema: z.object({
      query: optionalText(200), conversationId: optionalText(512),
      category: z.enum(['all', 'work', 'document', 'skill', 'link']).default('all'), limit: limit(20),
    }).strict(),
    outputSchema: searchArtifactsOutputSchema,
  }),
  read_document: operation({
    name: 'read_document', description: '按文件资产 ID 读取受支持文档的有界正文，不接受路径。', readOnly: true,
    dependencies: ['assets', 'documents'],
    limits: [{ field: 'maxCharacters', default: 12_000, minimum: 1, maximum: 50_000 }],
    inputSchema: z.object({
      assetId: sha256IdSchema, maxCharacters: z.number().int().min(1).max(50_000).default(12_000),
    }).strict(),
    outputSchema: readDocumentOutputSchema,
  }),
  get_message_context: operation({
    name: 'get_message_context', description: '按稳定消息 UID 读取其前后有限条原文。', readOnly: true,
    dependencies: ['chat'], limits: [{ field: 'radius', default: 8, minimum: 0, maximum: 20 }],
    inputSchema: z.object({ messageUid: requiredId, radius: z.number().int().min(0).max(20).default(8) }).strict(),
    outputSchema: messageContextOutputSchema,
  }),
  get_timeline_slice: operation({
    name: 'get_timeline_slice', description: '读取一个会话的有界时间轴片段，可围绕消息 UID 定位。', readOnly: true,
    dependencies: ['chat'], limits: [{ ...commonLimit, default: 40 }],
    inputSchema: z.object({
      conversationId: requiredId, aroundMessageUid: optionalText(512), sender: optionalText(512),
      query: optionalText(200), limit: limit(40),
    }).strict(),
    outputSchema: timelineOutputSchema,
  }),
  get_link_preview: operation({
    name: 'get_link_preview', description: '按链接资产 ID 读取已安全解析的网页简介。', readOnly: true,
    dependencies: ['assets', 'link'], limits: [],
    inputSchema: z.object({ assetId: sha256IdSchema }).strict(), outputSchema: linkPreviewOutputSchema,
  }),
} as const

export const AGENT_OPERATION_NAMES = [
  'list_conversations',
  'search_messages',
  'get_message_context',
  'search_artifacts',
  'read_document',
  'get_timeline_slice',
  'get_link_preview',
] as const satisfies readonly Exclude<OperationName, 'status'>[]

export function isOperationName(value: string): value is OperationName {
  return (OPERATION_NAMES as readonly string[]).includes(value)
}

export type OperationInput<Name extends OperationName> = z.input<(typeof operationCatalog)[Name]['inputSchema']>
export type ParsedOperationInput<Name extends OperationName> = z.output<(typeof operationCatalog)[Name]['inputSchema']>
export type OperationOutput<Name extends OperationName> = z.output<(typeof operationCatalog)[Name]['outputSchema']>
