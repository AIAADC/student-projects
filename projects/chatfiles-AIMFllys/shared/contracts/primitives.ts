import { z } from 'zod/v4'

export const stableIdSchema = z.string()
  .min(1)
  .max(512)
  .refine((value) => !value.includes('\u0000'), 'stable IDs must not contain NUL bytes')

export const sha256IdSchema = z.string().regex(/^[0-9a-f]{64}$/u)

export const unixSecondsSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)

export const isoTimestampSchema = z.iso.datetime({ offset: true })

export const timeZoneSchema = z.string()
  .min(1)
  .max(128)
  .regex(/^(?:UTC|[A-Za-z_]+(?:\/[A-Za-z0-9_+.-]+)+)$/u)

export const timelineBucketKeySchema = z.string().regex(/^[0-9]{4}-(?:0[1-9]|1[0-2])$/u)
export const archiveDateSchema = z.iso.date()

export type StableId = z.infer<typeof stableIdSchema>
export type Sha256Id = z.infer<typeof sha256IdSchema>
export type UnixSeconds = z.infer<typeof unixSecondsSchema>
export type IsoTimestamp = z.infer<typeof isoTimestampSchema>
export type TimeZone = z.infer<typeof timeZoneSchema>
export type ArchiveDate = z.infer<typeof archiveDateSchema>
