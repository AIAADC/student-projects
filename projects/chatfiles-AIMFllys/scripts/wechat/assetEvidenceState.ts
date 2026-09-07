export type AssetMaterializationStatus =
  | 'not_attempted'
  | 'key_unavailable'
  | 'source_missing'
  | 'cdn_only'
  | 'decrypt_failed'
  | 'unsupported_codec'
  | 'thumbnail_only'
  | 'ready'

export type AssetPreviewStatus = 'ready' | 'thumbnail_only' | 'unavailable'

export type AssetEvidenceState = {
  materialization: AssetMaterializationStatus
  preview: AssetPreviewStatus
  reason?: string
}

const ALLOWED_PREVIEW_STATUSES: Readonly<Record<
  AssetMaterializationStatus,
  readonly AssetPreviewStatus[]
>> = {
  not_attempted: ['unavailable'],
  key_unavailable: ['unavailable'],
  source_missing: ['unavailable'],
  cdn_only: ['unavailable'],
  decrypt_failed: ['unavailable'],
  unsupported_codec: ['unavailable'],
  thumbnail_only: ['thumbnail_only'],
  ready: ['ready', 'unavailable'],
}

const REASON_REQUIRED = new Set<AssetMaterializationStatus>([
  'not_attempted',
  'key_unavailable',
  'source_missing',
  'cdn_only',
  'decrypt_failed',
  'unsupported_codec',
])

export function createAssetEvidenceState(
  materialization: AssetMaterializationStatus,
  preview: AssetPreviewStatus,
  reason?: string,
): AssetEvidenceState {
  if (!ALLOWED_PREVIEW_STATUSES[materialization].includes(preview)) {
    throw new TypeError(`Invalid asset evidence state: ${materialization} cannot use ${preview}`)
  }
  if (REASON_REQUIRED.has(materialization)) {
    if (typeof reason !== 'string' || reason.trim() === '') {
      throw new TypeError(`A nonempty reason is required for ${materialization}/${preview}`)
    }
    return { materialization, preview, reason: reason.trim() }
  }
  if (reason !== undefined) {
    throw new TypeError(`A reason is not allowed for ${materialization}/${preview}`)
  }
  return { materialization, preview }
}
