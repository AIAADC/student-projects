import { z } from 'zod/v4'

export const apiErrorCodeSchema = z.string().min(1).max(96).regex(/^[a-z][a-z0-9_]*$/u)

export const apiErrorSchema = z.object({
  error: z.literal('Request failed'),
  code: apiErrorCodeSchema,
  details: z.record(z.string(), z.unknown()).optional(),
})

export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>
export type ApiError = z.infer<typeof apiErrorSchema>

export function makeApiError(code: ApiErrorCode, details?: Record<string, unknown>): ApiError {
  return apiErrorSchema.parse({
    error: 'Request failed',
    code,
    ...(details ? { details } : {}),
  })
}
