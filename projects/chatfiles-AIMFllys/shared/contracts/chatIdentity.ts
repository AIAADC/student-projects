import { z } from 'zod/v4'
import { archiveDateSchema, stableIdSchema, unixSecondsSchema } from './primitives.js'

export type MessageDto = {
  message_uid: string
  canonical_seq: number
  occurred_at_epoch_s: number
  time_precision: 'second'
  archive_day: string
  sender_key: string
  person_id: string | null
  sender_name: string
  sender_source: string
  sender_audit: string | null
  raw_type: string
  type: number
  type_label: string
  content_kind: 'app' | 'media' | 'system' | 'text' | 'unknown'
  structured_content: Record<string, unknown>
  text: string
}

export const messageDtoSchema = z.object({
  message_uid: stableIdSchema,
  canonical_seq: z.number().int().nonnegative(),
  occurred_at_epoch_s: unixSecondsSchema,
  time_precision: z.literal('second'),
  archive_day: archiveDateSchema,
  sender_key: stableIdSchema,
  person_id: stableIdSchema.nullable(),
  sender_name: z.string(),
  sender_source: z.string().min(1),
  sender_audit: z.string().nullable(),
  raw_type: z.string().regex(/^-?[0-9]+$/u),
  type: z.number().int().nonnegative(),
  type_label: z.string().min(1),
  content_kind: z.enum(['app', 'media', 'system', 'text', 'unknown']),
  structured_content: z.record(z.string(), z.unknown()),
  text: z.string(),
}) satisfies z.ZodType<MessageDto>

/** Canonical cross-runtime WeChat message DTO. */
export type WechatMessage = {
  message_uid?: string
  seq: number
  time: number
  canonical_seq?: number
  occurred_at_epoch_s?: number
  time_precision?: 'second'
  archive_day?: string
  sort_seq?: number
  source_db?: string
  local_id?: number
  sender: string
  person_id?: string | null
  sender_name: string
  is_own?: 0 | 1
  sender_source?: string
  sender_audit?: string
  raw_type?: string
  type: number
  type_label: string
  text: string
}

export const wechatMessageSchema = z.object({
  message_uid: stableIdSchema.optional(),
  seq: z.number().int(),
  time: unixSecondsSchema,
  canonical_seq: z.number().int().nonnegative().optional(),
  occurred_at_epoch_s: unixSecondsSchema.optional(),
  time_precision: z.literal('second').optional(),
  archive_day: archiveDateSchema.optional(),
  sort_seq: z.number().int().optional(),
  source_db: z.string().optional(),
  local_id: z.number().int().optional(),
  sender: z.string(),
  person_id: stableIdSchema.nullable().optional(),
  sender_name: z.string(),
  is_own: z.union([z.literal(0), z.literal(1)]).optional(),
  sender_source: z.string().optional(),
  sender_audit: z.string().optional(),
  raw_type: z.string().optional(),
  type: z.number().int(),
  type_label: z.string(),
  text: z.string(),
}) satisfies z.ZodType<WechatMessage>
