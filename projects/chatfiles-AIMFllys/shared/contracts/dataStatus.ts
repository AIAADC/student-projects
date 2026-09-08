import { z } from 'zod/v4'
import { stableIdSchema } from './primitives.js'
import { productDigestSchema } from './productCatalog.js'

export const dataProductStateSchema = z.enum([
  'ready','degraded','stale','missing','invalid','dependency_mismatch',
])

export const dataProductStatusSchema = z.object({
  schemaVersion: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).nullable(),
  runId: stableIdSchema.nullable(),
  fingerprint: productDigestSchema.nullable(),
  state: dataProductStateSchema,
  counts: z.record(
    z.string().min(1).max(64),
    z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  ),
  issues: z.array(z.string().min(1).max(128)).max(100),
}).strict()

export const dataCatalogStatusSchema = z.object({
  state: z.enum(['ready', 'missing', 'invalid', 'recovery_required']),
  previous: z.enum(['ready', 'missing', 'invalid']),
  transactionId: stableIdSchema.nullable(),
}).strict()

export const derivedSearchStatusSchema = z.object({
  state: z.enum(['ready','stale','missing','invalid']),
  mode: z.enum(['keyword-only','hybrid']).optional(),
  issues: z.array(z.string().min(1).max(128)).max(20),
}).strict()

export type DataProductState = z.infer<typeof dataProductStateSchema>
export type DataProductStatus = z.infer<typeof dataProductStatusSchema>
export type DataCatalogStatus = z.infer<typeof dataCatalogStatusSchema>
export type DerivedSearchStatus = z.infer<typeof derivedSearchStatusSchema>
