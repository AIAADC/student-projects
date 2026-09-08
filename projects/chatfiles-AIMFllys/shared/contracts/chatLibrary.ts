import { z } from 'zod/v4'
import { stableIdSchema, timeZoneSchema, unixSecondsSchema } from './primitives.js'

export type WechatConversation = {
  id: string
  account?: string
  username?: string
  display: string
  is_group: number
  msg_count: number
  text_count: number
  first_time: number
  last_time: number
  summary?: string
}

export type WechatConversationList = {
  runId: string
  timeZone: string
  conversations: WechatConversation[]
  totals: {
    conversations: number
    messages: number
    textMessages?: number
  }
}

export type ChatArtifactTab = 'all' | 'work' | 'document' | 'skill' | 'link' | 'chatText'

export type ChatArtifactAvailability =
  | 'ready'
  | 'not_attempted'
  | 'key_unavailable'
  | 'source_missing'
  | 'cdn_only'
  | 'thumbnail_only'
  | 'missing_source'
  | 'decrypt_failed'
  | 'source_ambiguous'
  | 'hash_mismatch'
  | 'source_changed'
  | 'unsupported_codec'
  | 'source_unavailable'

export type ChatArtifactCounts = Record<ChatArtifactTab, number>

export type ChatArtifactItem = {
  id: string
  itemType: 'artifact'
  conversationId: string | null
  category: Exclude<ChatArtifactTab, 'all' | 'chatText'>
  kind: string
  name: string
  preview: string
  url: string | null
  createdAt: number
  senderName: string
  size: number | null
  availability: ChatArtifactAvailability
  association: {
    status: 'exact' | 'partial' | 'conflict' | 'missing' | 'legacy'
    evidence: string
  }
  source: {
    presence: 'present' | 'missing' | 'ambiguous' | 'size_mismatch' | 'content_mismatch' | 'oversized'
      | 'not_applicable' | 'unknown'
  }
  materialization: {
    status: string
  }
  capability: {
    previewStatus: string
  }
  metadataUrl: string
}

export type ChatTextItem = {
  id: string
  itemType: 'chatText'
  conversationId: string
  messageUid: string
  createdAt: number
  senderName: string
  content: string
}

export type ChatArtifactListItem = ChatArtifactItem | ChatTextItem

export type ChatArtifactPage = {
  runId: string
  timeZone: string
  tab: ChatArtifactTab
  counts: ChatArtifactCounts
  total: number
  matchingTotal: number
  offset: number
  limit: number
  items: ChatArtifactListItem[]
}

export type ChatArtifactCapability = {
  metadata: string
  content?: string
  thumbnail?: string
}

export type ChatArtifactMetadata = ChatArtifactItem & {
  capabilities: ChatArtifactCapability
}

const safeCountSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
const nullableUrlSchema = z.string().url().nullable()

export const wechatConversationSchema = z.object({
  id: stableIdSchema,
  account: z.string().optional(),
  username: z.string().optional(),
  display: z.string(),
  is_group: z.number().int(),
  msg_count: safeCountSchema,
  text_count: safeCountSchema,
  first_time: unixSecondsSchema,
  last_time: unixSecondsSchema,
  summary: z.string().optional(),
}).strict() satisfies z.ZodType<WechatConversation>

export const wechatConversationListSchema = z.object({
  runId: stableIdSchema,
  timeZone: timeZoneSchema,
  conversations: z.array(wechatConversationSchema),
  totals: z.object({
    conversations: safeCountSchema,
    messages: safeCountSchema,
    textMessages: safeCountSchema.optional(),
  }).strict(),
}).strict() satisfies z.ZodType<WechatConversationList>

export const chatArtifactTabSchema = z.enum(['all', 'work', 'document', 'skill', 'link', 'chatText'])
export const chatArtifactAvailabilitySchema = z.enum([
  'ready','not_attempted','key_unavailable','source_missing','cdn_only','thumbnail_only',
  'missing_source','decrypt_failed','source_ambiguous','hash_mismatch','source_changed',
  'unsupported_codec','source_unavailable',
])
const associationSchema = z.object({
  status: z.enum(['exact', 'partial', 'conflict', 'missing', 'legacy']),
  evidence: z.string(),
}).strict()
const sourceSchema = z.object({
  presence: z.enum([
    'present','missing','ambiguous','size_mismatch','content_mismatch','oversized',
    'not_applicable','unknown',
  ]),
}).strict()
const materializationSchema = z.object({ status: z.string() }).strict()
const previewCapabilitySchema = z.object({ previewStatus: z.string() }).strict()

export const chatArtifactItemSchema = z.object({
  id: stableIdSchema,
  itemType: z.literal('artifact'),
  conversationId: stableIdSchema.nullable(),
  category: z.enum(['work', 'document', 'skill', 'link']),
  kind: z.string(),
  name: z.string(),
  preview: z.string(),
  url: nullableUrlSchema,
  createdAt: unixSecondsSchema,
  senderName: z.string(),
  size: safeCountSchema.nullable(),
  availability: chatArtifactAvailabilitySchema,
  association: associationSchema,
  source: sourceSchema,
  materialization: materializationSchema,
  capability: previewCapabilitySchema,
  metadataUrl: z.string().min(1),
}).strict() satisfies z.ZodType<ChatArtifactItem>

export const chatTextItemSchema = z.object({
  id: stableIdSchema,
  itemType: z.literal('chatText'),
  conversationId: stableIdSchema,
  messageUid: stableIdSchema,
  createdAt: unixSecondsSchema,
  senderName: z.string(),
  content: z.string(),
}).strict() satisfies z.ZodType<ChatTextItem>

const artifactCountsSchema = z.object({
  all: safeCountSchema,work: safeCountSchema,document: safeCountSchema,
  skill: safeCountSchema,link: safeCountSchema,chatText: safeCountSchema,
}).strict()

export const chatArtifactPageSchema = z.object({
  runId: stableIdSchema,
  timeZone: timeZoneSchema,
  tab: chatArtifactTabSchema,
  counts: artifactCountsSchema,
  total: safeCountSchema,
  matchingTotal: safeCountSchema,
  offset: safeCountSchema,
  limit: z.number().int().min(1).max(200),
  items: z.array(z.discriminatedUnion('itemType', [chatArtifactItemSchema, chatTextItemSchema])),
}).strict() satisfies z.ZodType<ChatArtifactPage>

export const chatArtifactCapabilitySchema = z.object({
  metadata: z.string().min(1),
  content: z.string().min(1).optional(),
  thumbnail: z.string().min(1).optional(),
}).strict() satisfies z.ZodType<ChatArtifactCapability>

export const chatArtifactMetadataSchema = chatArtifactItemSchema.extend({
  capabilities: chatArtifactCapabilitySchema,
}) satisfies z.ZodType<ChatArtifactMetadata>
