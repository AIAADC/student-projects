import { z } from 'zod/v4'
import { isoTimestampSchema, stableIdSchema } from './primitives.js'

export const productKindSchema = z.enum(['wechat', 'assets', 'library', 'insights'])
export const productDigestSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/u)
export const catalogTransactionIdSchema = z.string().regex(/^[0-9A-Za-z._-]{1,100}$/u)

const safeIntegerSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
const relativePathSchema = z.string().min(1).max(1024).superRefine((value, context) => {
  if (value.includes('\u0000') || /^[\\/]/u.test(value) || /^[A-Za-z]:/u.test(value)) {
    context.addIssue({ code: 'custom', message: 'relative path must stay inside its product' })
    return
  }
  const segments = value.split(/[\\/]/u)
  if (segments.some((segment) => !segment || segment === '.' || segment === '..' || segment.includes(':'))) {
    context.addIssue({ code: 'custom', message: 'relative path contains an unsafe segment' })
  }
})

const productFileSchema = z.object({
  relativePath: relativePathSchema,
  size: safeIntegerSchema,
  sha256: productDigestSchema,
}).strict()

export const productReleaseReceiptSchema = z.object({
  version: z.literal(1),
  kind: productKindSchema,
  runId: stableIdSchema,
  domainSchemaVersion: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  validatedAt: isoTimestampSchema,
  evidenceSha256: productDigestSchema,
  counts: z.record(z.string().min(1).max(64), safeIntegerSchema),
}).strict()

const productDependencySchema = z.object({
  bundleSha256: productDigestSchema,
  entrypoint: relativePathSchema,
  entrypointSha256: productDigestSchema,
  runId: stableIdSchema,
  domainSchemaVersion: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  domainReceiptSha256: productDigestSchema,
}).strict()

const productDependenciesSchema = z.object({
  wechat: productDependencySchema.optional(),
  assets: productDependencySchema.optional(),
  library: productDependencySchema.optional(),
  insights: productDependencySchema.optional(),
}).strict()

export const productManifestSchema = z.object({
  schemaVersion: z.literal(1),
  kind: productKindSchema,
  runId: stableIdSchema,
  domainSchemaVersion: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  createdAt: isoTimestampSchema,
  bundleSha256: productDigestSchema,
  domainReceiptSha256: productDigestSchema,
  entrypoints: z.record(z.string().min(1).max(64), relativePathSchema),
  files: z.array(productFileSchema).max(1_000_000),
  dependencies: productDependenciesSchema,
  counts: z.record(z.string().min(1).max(64), safeIntegerSchema),
}).strict().superRefine((manifest, context) => {
  const paths = manifest.files.map((file) => file.relativePath)
  if (new Set(paths).size !== paths.length) {
    context.addIssue({ code: 'custom', path: ['files'], message: 'files must be unique' })
  }
  if (paths.some((value, index) => index > 0 && paths[index - 1]! >= value)) {
    context.addIssue({ code: 'custom', path: ['files'], message: 'files must be sorted' })
  }
  const available = new Set(paths)
  for (const [name, entrypoint] of Object.entries(manifest.entrypoints)) {
    if (!available.has(entrypoint)) {
      context.addIssue({
        code: 'custom',path: ['entrypoints', name],message: 'entrypoint must reference a file',
      })
    }
  }
})

export const productReferenceSchema = z.object({
  bundleSha256: productDigestSchema,
  manifestSha256: productDigestSchema,
}).strict()

export const productCatalogSchema = z.object({
  schemaVersion: z.literal(1),
  transactionId: catalogTransactionIdSchema,
  committedAt: isoTimestampSchema,
  parentCatalogSha256: productDigestSchema.optional(),
  products: z.object({
    wechat: productReferenceSchema,
    assets: productReferenceSchema,
    library: productReferenceSchema,
    insights: productReferenceSchema,
  }).strict(),
  bundleSetSha256: productDigestSchema,
}).strict()

export type ProductKind = z.infer<typeof productKindSchema>
export type ProductManifest = z.infer<typeof productManifestSchema>
export type ProductReference = z.infer<typeof productReferenceSchema>
export type ProductCatalog = z.infer<typeof productCatalogSchema>
export type ProductReleaseReceipt = z.infer<typeof productReleaseReceiptSchema>
