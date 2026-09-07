import { z } from 'zod/v4'

import type { ArchivePreview, DatabasePreview, FileInspection, VoicePreview } from './files.js'
import { isoTimestampSchema } from './primitives.js'

const pathSchema = z.string().max(32_768)
const sizeSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
const archiveBlockedReasonSchema = z.enum([
  'archive_file_too_large',
  'archive_entry_limit_exceeded',
  'archive_directory_timeout',
  'archive_expanded_size_limit_exceeded',
  'archive_directory_too_large',
])

export const databasePreviewSchema = z.object({
  path: pathSchema,
  size: sizeSchema,
  modified: isoTimestampSchema,
  readable: z.boolean(),
  header: z.string().max(16_384),
  error: z.string().max(4_096).optional(),
  tables: z.array(z.object({
    name: z.string().max(1_024),
    rowCount: sizeSchema.optional(),
    columns: z.array(z.object({
      name: z.string().max(1_024),
      type: z.string().max(1_024),
    }).strict()).max(10_000),
  }).strict()).max(10_000),
}).strict() satisfies z.ZodType<DatabasePreview>

export const fileInspectionSchema = z.object({
  path: pathSchema,
  size: sizeSchema,
  modified: isoTimestampSchema,
  mime: z.string().max(256),
  ext: z.string().max(64),
  headerHex: z.string().max(65_536),
  headerAscii: z.string().max(65_536),
  sampledBytes: sizeSchema,
  strings: z.array(z.object({
    offset: sizeSchema,
    encoding: z.enum(['utf8', 'utf16le']),
    text: z.string().max(65_536),
  }).strict()).max(10_000),
}).strict() satisfies z.ZodType<FileInspection>

export const archivePreviewSchema = z.object({
  path: pathSchema,
  size: sizeSchema,
  modified: isoTimestampSchema,
  format: z.string().max(64),
  readable: z.boolean(),
  error: z.string().max(4_096).optional(),
  blockedReason: archiveBlockedReasonSchema.optional(),
  entries: z.array(z.object({
    name: z.string().max(32_768),
    size: sizeSchema.optional(),
    directory: z.boolean(),
  }).strict()).max(100_000),
}).strict() satisfies z.ZodType<ArchivePreview>

export const voicePreviewSchema = z.object({
  path: pathSchema,
  size: sizeSchema,
  modified: isoTimestampSchema,
  sourceFormat: z.string().max(64),
  codecHint: z.string().max(256).optional(),
  playable: z.boolean(),
  durationSeconds: z.number().finite().nonnegative().optional(),
  transcodedUrl: z.string().max(32_768).optional(),
  error: z.string().max(4_096).optional(),
}).strict() satisfies z.ZodType<VoicePreview>
