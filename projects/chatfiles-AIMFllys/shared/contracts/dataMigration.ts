import { z } from 'zod/v4'
import { stableIdSchema } from './primitives.js'
import { productDigestSchema, productKindSchema } from './productCatalog.js'
import { productKinds } from './productCatalogCanonical.js'

const legacyRoleSchema = z.enum([
  'wechat.current','chat-assets.current','library.current','library.json','insights',
])

export const migrationSourceEvidenceSchema = z.object({
  kind: productKindSchema,
  role: legacyRoleSchema,
  fingerprint: productDigestSchema,
  files: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  bytes: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
}).strict().superRefine((source, context) => {
  const roles = {
    wechat: ['wechat.current'],assets: ['chat-assets.current'],
    library: ['library.current','library.json'],insights: ['insights'],
  } as const
  if (!(roles[source.kind] as readonly string[]).includes(source.role)) {
    context.addIssue({ code: 'custom',message: 'legacy role does not match product kind' })
  }
})

export const legacyMigrationReceiptSchema = z.object({
  version: z.literal(1),
  transactionId: stableIdSchema,
  status: z.literal('activated'),
  completedAt: z.iso.datetime({ offset: true }),
  catalogSha256: productDigestSchema,
  sources: z.array(migrationSourceEvidenceSchema).length(4),
}).strict().superRefine((receipt, context) => {
  const kinds = new Set(receipt.sources.map((source) => source.kind))
  const roles = new Set(receipt.sources.map((source) => source.role))
  if (kinds.size !== receipt.sources.length || roles.size !== receipt.sources.length) {
    context.addIssue({ code: 'custom',message: 'migration sources must be unique' })
  }
  if (productKinds.some((kind) => !kinds.has(kind))) {
    context.addIssue({ code: 'custom',message: 'migration receipt must close every product kind' })
  }
})

export type LegacyMigrationReceipt = z.infer<typeof legacyMigrationReceiptSchema>
