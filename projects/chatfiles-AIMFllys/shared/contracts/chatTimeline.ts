import { z } from 'zod/v4'
import { wechatMessageSchema, type WechatMessage } from './chatIdentity.js'
import { archiveDateSchema, stableIdSchema, timelineBucketKeySchema, timeZoneSchema, unixSecondsSchema } from './primitives.js'

export type TimelineCursor = { version: 2; runId: string; sequence: number; messageUid: string }

export type TimelineMessage = WechatMessage & { message_uid: string }

export type TimelineParticipant = {
  senderKey: string
  personId: string | null
  name: string
  identitySource: 'person_id' | 'sender' | 'name_snapshot' | 'unknown'
  messageCount: number
  lastTime: number
}

export type TimelineParticipantPage = {
  conversationId: string
  runId: string
  timeZone: string
  participants: TimelineParticipant[]
}

export type TimelineBucket = {
  key: string
  label: string
  startTime: number
  endTime: number
  messageCount: number
  cursor: string
}

export type TimelinePageInfo = {
  olderCursor: string | null
  newerCursor: string | null
  hasOlder: boolean
  hasNewer: boolean
}

export type TimelinePage = {
  conversationId: string
  runId: string
  timeZone: string
  limit: number
  messages: TimelineMessage[]
  pageInfo: TimelinePageInfo
}

export const timelineCursorSchema = z.object({
  version: z.literal(2),
  runId: stableIdSchema,
  sequence: z.number().int().nonnegative(),
  messageUid: stableIdSchema,
}) satisfies z.ZodType<TimelineCursor>

export const timelineMessageSchema = wechatMessageSchema.extend({ message_uid: stableIdSchema }) satisfies z.ZodType<TimelineMessage>

export const timelineParticipantSchema = z.object({
  senderKey: stableIdSchema,
  personId: stableIdSchema.nullable(),
  name: z.string(),
  identitySource: z.enum(['person_id', 'sender', 'name_snapshot', 'unknown']),
  messageCount: z.number().int().nonnegative(),
  lastTime: unixSecondsSchema,
}) satisfies z.ZodType<TimelineParticipant>

export const timelineParticipantPageSchema = z.object({
  conversationId: stableIdSchema,
  runId: stableIdSchema,
  timeZone: timeZoneSchema,
  participants: z.array(timelineParticipantSchema),
}) satisfies z.ZodType<TimelineParticipantPage>

export const timelineBucketSchema = z.object({
  key: timelineBucketKeySchema,
  label: z.string().min(1),
  startTime: unixSecondsSchema,
  endTime: unixSecondsSchema,
  messageCount: z.number().int().nonnegative(),
  cursor: stableIdSchema,
}) satisfies z.ZodType<TimelineBucket>

export const timelinePageInfoSchema = z.object({
  olderCursor: stableIdSchema.nullable(),
  newerCursor: stableIdSchema.nullable(),
  hasOlder: z.boolean(),
  hasNewer: z.boolean(),
}) satisfies z.ZodType<TimelinePageInfo>

export const timelinePageSchema = z.object({
  conversationId: stableIdSchema,
  runId: stableIdSchema,
  timeZone: timeZoneSchema,
  limit: z.number().int().min(1).max(240),
  messages: z.array(timelineMessageSchema),
  pageInfo: timelinePageInfoSchema,
}) satisfies z.ZodType<TimelinePage>

export type TimelineDay = {
  date: string
  firstMessageUid: string
  firstSequence: number
  messageCount: number
}

export const timelineDaySchema = z.object({
  date: archiveDateSchema,
  firstMessageUid: stableIdSchema,
  firstSequence: z.number().int().nonnegative(),
  messageCount: z.number().int().positive(),
}) satisfies z.ZodType<TimelineDay>

export type TimelineDayPage = {
  conversationId: string
  runId: string
  timeZone: string
  limit: number
  days: TimelineDay[]
  pageInfo: { nextCursor: string | null; hasMore: boolean }
}

export const timelineDayPageSchema = z.object({
  conversationId: stableIdSchema,
  runId: stableIdSchema,
  timeZone: timeZoneSchema,
  limit: z.number().int().min(1).max(366),
  days: z.array(timelineDaySchema),
  pageInfo: z.object({
    nextCursor: archiveDateSchema.nullable(),
    hasMore: z.boolean(),
  }),
}) satisfies z.ZodType<TimelineDayPage>
