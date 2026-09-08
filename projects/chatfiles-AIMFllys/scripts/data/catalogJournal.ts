import { z } from 'zod/v4'
import {
  catalogTransactionIdSchema,
  productCatalogSchema,
  productDigestSchema,
  type ProductCatalog,
} from '../../shared/contracts/productCatalog.js'

export const catalogJournalStatusSchema = z.enum([
  'validated','current_moved','activated','rolled_back','rollback_failed',
])

export const catalogJournalSchema = z.object({
  version: z.literal(1),
  transactionId: catalogTransactionIdSchema,
  status: catalogJournalStatusSchema,
  beforeCatalog: productCatalogSchema.nullable(),
  beforeSha256: productDigestSchema.nullable(),
  afterCatalog: productCatalogSchema,
  afterSha256: productDigestSchema,
  updatedAt: z.iso.datetime({ offset: true }),
}).strict().superRefine((journal, context) => {
  if ((journal.beforeCatalog === null) !== (journal.beforeSha256 === null)) {
    context.addIssue({ code: 'custom',message: 'before catalog and digest must share presence' })
  }
})

export type CatalogJournalStatus = z.infer<typeof catalogJournalStatusSchema>
export type CatalogJournal = z.infer<typeof catalogJournalSchema>

export function journalWithStatus(
  journal: CatalogJournal,
  status: CatalogJournalStatus,
  updatedAt: string,
): CatalogJournal {
  return catalogJournalSchema.parse({ ...journal,status,updatedAt })
}

export function initialJournal(input: {
  transactionId: string
  beforeCatalog: ProductCatalog | null
  beforeSha256: string | null
  afterCatalog: ProductCatalog
  afterSha256: string
  updatedAt: string
}) {
  return catalogJournalSchema.parse({ version: 1,status: 'validated',...input })
}
