import fs from 'node:fs'
import path from 'node:path'
import {
  catalogTransactionIdSchema,
  productKindSchema,
  type ProductKind,
} from '../../shared/contracts/productCatalog.js'
import {
  copyProductFiles,
  ensureDataRoleDirectory,
  inventoryProductTree,
  strictRealDirectory,
} from './productFiles.js'

const candidateRoles: Record<ProductKind, string> = {
  wechat: 'wechat.next',
  assets: 'chat-assets.next',
  library: 'library.next',
  insights: 'insights.next',
}

export function stageProductCandidate(input: {
  dataRoot: string
  kind: ProductKind
  transactionId: string
}) {
  const dataRoot = strictRealDirectory(input.dataRoot, 'PRODUCT_DATA_ROOT_UNSAFE')
  let kind: ProductKind
  let transactionId: string
  try {
    kind = productKindSchema.parse(input.kind)
    transactionId = catalogTransactionIdSchema.parse(input.transactionId)
  } catch (error) {
    throw new Error('PRODUCT_STAGE_ARGUMENT_INVALID', { cause: error })
  }
  const candidateDir = strictRealDirectory(
    path.join(dataRoot, candidateRoles[kind]),
    'PRODUCT_CANDIDATE_INVALID',
  )
  const transactionDir = ensureDataRoleDirectory(dataRoot, ['product-staging', transactionId], {
    create: true,code: 'PRODUCT_STAGING_ROLE_INVALID',
  })
  const stagingDir = path.join(transactionDir, kind)
  if (fs.existsSync(stagingDir)) throw new Error('PRODUCT_STAGING_EXISTS')
  const files = inventoryProductTree(candidateDir)
  fs.mkdirSync(stagingDir)
  try {
    copyProductFiles(candidateDir, stagingDir, files)
    if (JSON.stringify(inventoryProductTree(stagingDir)) !== JSON.stringify(files)) {
      throw new Error('PRODUCT_STAGING_COPY_MISMATCH')
    }
  } catch (error) {
    fs.rmSync(stagingDir, { recursive: true,force: true })
    throw error
  }
  return { candidateDir,stagingDir,files }
}
