import { z } from 'zod/v4'
import { isoTimestampSchema } from './primitives.js'

/** Link-preview response DTO shared by the HTTP service and client. */
export type LinkPreviewStatus = 'ready' | 'fallback'

export type LinkPreview = {
  status: LinkPreviewStatus
  url: string
  domain: string
  title: string
  description: string
  siteName: string
  iconUrl: string
  updatedAt: string
}

export const linkPreviewStatusSchema = z.enum(['ready', 'fallback'])
export const linkPreviewSchema = z.object({
  status: linkPreviewStatusSchema,
  url: z.url(),
  domain: z.string(),
  title: z.string(),
  description: z.string(),
  siteName: z.string(),
  iconUrl: z.string(),
  updatedAt: isoTimestampSchema,
}) satisfies z.ZodType<LinkPreview>
