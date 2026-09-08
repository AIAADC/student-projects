export type DocumentReadResult = {
  assetId: string
  title: string
  text: string
  truncated: boolean
  citation: string
}

export type DocumentReadErrorCode =
  | 'invalid_asset_id'
  | 'document_not_found'
  | 'document_unavailable'
  | 'unsupported_document'
  | 'invalid_document'
  | 'document_too_large'

export type DocumentReadInput = {
  assetId: string
  maxCharacters?: number
}
