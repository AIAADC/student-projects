import type { ChatArtifactAvailability } from '../../shared/contracts/chat.js'

const normalizedUnavailable = new Set<ChatArtifactAvailability>([
  'not_attempted',
  'key_unavailable',
  'source_missing',
  'cdn_only',
  'decrypt_failed',
  'unsupported_codec',
])

const legacyFailureStates = new Set<ChatArtifactAvailability>([
  'missing_source',
  'decrypt_failed',
  'source_ambiguous',
  'hash_mismatch',
])

export function artifactAvailabilityFor(
  materialization: string,
  previewStatus: string,
  version: 1 | 2,
): ChatArtifactAvailability {
  if (version === 2) {
    if (materialization === 'ready') return 'ready'
    if (materialization === 'thumbnail_only' && previewStatus === 'thumbnail_only') {
      return 'thumbnail_only'
    }
    if (previewStatus === 'unavailable' && normalizedUnavailable.has(
      materialization as ChatArtifactAvailability,
    )) return materialization as ChatArtifactAvailability
    return 'source_unavailable'
  }
  if (materialization === 'exported' && previewStatus === 'ready') return 'ready'
  if (materialization === 'exported' && previewStatus === 'unsupported_codec') return 'unsupported_codec'
  if (materialization === 'exported' && previewStatus === 'unavailable') return 'source_unavailable'
  if (materialization === 'thumbnail_only' && previewStatus === 'thumbnail_only') return 'thumbnail_only'
  if (materialization === previewStatus && legacyFailureStates.has(
    previewStatus as ChatArtifactAvailability,
  )) return previewStatus as ChatArtifactAvailability
  return 'source_unavailable'
}
