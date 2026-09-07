import type { ArchivePreviewBlockedReason } from '../../../shared/contracts/archivePreview.js'

export type FileScope = 'archive' | 'source' | 'artifact'
export type FileRef = { scope: FileScope; id: string }
export type FileOperation =
  | 'metadata'
  | 'content'
  | 'textPreview'
  | 'archivePreview'
  | 'databasePreview'
  | 'inspectPreview'
  | 'thumbnail'
  | 'voicePreview'
  | 'voiceAudio'

export type ArtifactFileCapability = 'content' | 'thumbnail' | 'archive' | 'inspect'

export type FileDescriptor = {
  ref: FileRef
  name: string
  preview: string
  size: number
  voiceSource?: boolean
  artifactCapabilities: readonly ArtifactFileCapability[]
}

export type FileCapabilityLimits = { maxArchiveBytes?: number }
export type FileCapabilityDecision =
  | { allowed: true }
  | {
    allowed: false
    code: 'unsupported_file_capability' | 'preview_blocked'
    blockedReason?: ArchivePreviewBlockedReason
  }

const TEXT_PREVIEWS = new Set(['text', 'markdown', 'code', 'html', 'json'])
const THUMBNAIL_PREVIEWS = new Set(['image', 'video'])

function denied(): FileCapabilityDecision {
  return { allowed: false, code: 'unsupported_file_capability' }
}

function artifactAllows(file: FileDescriptor, capability: ArtifactFileCapability) {
  return file.artifactCapabilities.includes(capability)
}

export function decideFileCapability(
  file: FileDescriptor,
  operation: FileOperation,
  limits: FileCapabilityLimits = {},
): FileCapabilityDecision {
  if (operation === 'metadata') return { allowed: true }
  if (operation === 'content') {
    return file.ref.scope === 'artifact' && !artifactAllows(file, 'content') ? denied() : { allowed: true }
  }
  if (operation === 'archivePreview') {
    if (limits.maxArchiveBytes !== undefined && file.size > limits.maxArchiveBytes) {
      return { allowed: false, code: 'preview_blocked', blockedReason: 'archive_file_too_large' }
    }
    if (file.ref.scope === 'artifact') return artifactAllows(file, 'archive') ? { allowed: true } : denied()
    return file.preview === 'archive' ? { allowed: true } : denied()
  }
  if (operation === 'databasePreview') {
    return file.ref.scope === 'source' && file.preview === 'database' ? { allowed: true } : denied()
  }
  if (operation === 'textPreview') {
    return file.ref.scope !== 'artifact' && TEXT_PREVIEWS.has(file.preview) ? { allowed: true } : denied()
  }
  if (operation === 'thumbnail') {
    if (file.ref.scope === 'artifact') return artifactAllows(file, 'thumbnail') ? { allowed: true } : denied()
    return THUMBNAIL_PREVIEWS.has(file.preview) ? { allowed: true } : denied()
  }
  if (operation === 'inspectPreview') {
    if (file.ref.scope === 'artifact') return artifactAllows(file, 'inspect') ? { allowed: true } : denied()
    return { allowed: true }
  }
  if (operation === 'voicePreview' || operation === 'voiceAudio') {
    if (!file.voiceSource) return denied()
    if (file.ref.scope === 'artifact') return artifactAllows(file, 'content') ? { allowed: true } : denied()
    return { allowed: true }
  }
  return denied()
}
