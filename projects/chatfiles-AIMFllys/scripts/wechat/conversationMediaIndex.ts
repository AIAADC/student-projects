import { z } from 'zod'

const digestSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/u)
const safeNonNegativeInteger = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER)
const safePositiveInteger = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER)
const runIdSchema = z.string().regex(/^[0-9A-Za-z._-]{1,100}$/u)
const completedAtSchema = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u)
  .refine((value) => {
    const parsed = new Date(value)
    return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value
  })

export const assetBundleBindingSchema = z.object({
  owner: z.string().min(1),
  sourceSnapshotId: z.string().min(1),
  sourceSnapshotRootFingerprint: digestSchema,
  accountRootFingerprint: digestSchema,
  canonicalRunId: z.string().min(1),
  canonicalSchemaVersion: safePositiveInteger,
  canonicalDatabaseSha256: digestSchema,
  sourceManifestSha256: digestSchema,
  resourceDatabaseSha256: digestSchema,
}).strict()

export const conversationAssetCountsSchema = z.object({
  all: safeNonNegativeInteger,
  work: safeNonNegativeInteger,
  document: safeNonNegativeInteger,
  skill: safeNonNegativeInteger,
  link: safeNonNegativeInteger,
  chatText: safeNonNegativeInteger,
}).strict()

export const conversationAssetMetricsSchema = z.object({
  resources: safeNonNegativeInteger,
  sources: safeNonNegativeInteger,
  assets: safeNonNegativeInteger,
  associations: safeNonNegativeInteger,
  candidates: safeNonNegativeInteger,
  materializations: safeNonNegativeInteger,
  quarantined: safeNonNegativeInteger,
  exactAlignments: safeNonNegativeInteger,
  partialAlignments: safeNonNegativeInteger,
  missingAlignments: safeNonNegativeInteger,
  conflictingAlignments: safeNonNegativeInteger,
  confirmedAssociations: safeNonNegativeInteger,
  unconfirmedAssociations: safeNonNegativeInteger,
  ready: safeNonNegativeInteger,
  notAttempted: safeNonNegativeInteger,
  unavailable: safeNonNegativeInteger,
  voiceAttempts: safeNonNegativeInteger,
}).strict()

export const assetIndexSchema = z.object({
  version: z.literal(2),
  runId: runIdSchema,
  completedAt: completedAtSchema,
  binding: assetBundleBindingSchema,
  counts: conversationAssetCountsSchema,
  metrics: conversationAssetMetricsSchema,
  materializationEvidenceSha256: digestSchema,
  receipt: digestSchema,
}).strict()

export const mediaJournalSchema = z.object({
  version: z.literal(1),
  runId: runIdSchema,
  status: z.literal('started'),
  baseIndex: assetIndexSchema,
}).strict().refine((journal) => journal.runId === journal.baseIndex.runId)

export type AssetIndex = z.infer<typeof assetIndexSchema>
export type MediaJournal = z.infer<typeof mediaJournalSchema>
