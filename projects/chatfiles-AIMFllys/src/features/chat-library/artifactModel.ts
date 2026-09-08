import { apiEndpoints } from '../../shared/api/endpoints'

export type ArtifactKind = 'work' | 'document' | 'skill' | 'link' | 'chatText'

export type ChatLibrarySelection =
  | { kind: 'collection'; id: 'library' | 'outputs' }
  | { kind: 'conversation'; id: string }

export type ArtifactCandidate = {
  name: string
  preview?: string
  url?: string
  hasLocalFile?: boolean
  chatText?: boolean
}

export type ChatArtifact = {
  id: string
  kind: ArtifactKind
  available: boolean
}

const artifactTabOrder = ['all', 'work', 'document', 'skill', 'link', 'chatText'] as const
export type ArtifactTabId = typeof artifactTabOrder[number]

export type ArtifactCounts = Record<ArtifactKind, number> & {
  all: number
  available: number
  missing: number
}

const artifactAvailabilityCopy: Record<string, { label: string; description: string }> = {
  ready: { label: '可预览', description: '本地内容已经过验证，可以安全打开' },
  not_attempted: { label: '尚未物化', description: '源文件尚未经过验证物化，暂时无法预览' },
  key_unavailable: { label: '缺少临时解密密钥', description: '当前没有可用的短生命周期解密密钥' },
  source_missing: { label: '未找到源文件', description: '没有找到可验证的本地源文件' },
  cdn_only: { label: '仅有 CDN 引用', description: '这条消息只保留了 CDN 引用，本地没有缓存' },
  thumbnail_only: { label: '仅可预览缩略图', description: '本地只有缩略图，没有可验证的媒体原片' },
  missing_source: { label: '未找到源文件', description: '没有找到可验证的本地源文件' },
  decrypt_failed: { label: '待解密', description: '文件仍是加密载荷，暂时无法预览' },
  source_ambiguous: { label: '来源待确认', description: '存在多个候选文件，无法安全确认' },
  hash_mismatch: { label: '文件校验不一致', description: '本地文件与消息证据不一致' },
  source_changed: { label: '源文件内容已变化', description: '本地源文件内容已与构建时证据不同' },
  unsupported_codec: { label: '格式暂不支持', description: '当前环境不支持此媒体编码' },
  source_unavailable: { label: '源文件不可用', description: '本地源文件当前不可用' },
}

export function artifactAvailabilityLabel(availability: string) {
  return artifactAvailabilityCopy[availability]?.label ?? '状态未知'
}

export function artifactAvailabilityDescription(availability: string) {
  return artifactAvailabilityCopy[availability]?.description ?? '这条记录没有可安全打开的本地内容'
}

export function firstCodePoint(value: string, fallback: string) {
  return [...value.trim()][0] ?? fallback
}

const documentPreviews = new Set(['pdf', 'docx', 'sheet', 'presentation', 'markdown', 'text', 'json'])
const workPreviews = new Set(['image', 'video', 'audio', 'voice', 'html', 'code'])
const documentExtensions = /\.(?:pdf|docx?|pptx?|ppsx|xlsx?|csv|md|markdown|txt|rtf)$/i
const skillSignal = /(?:^|[\s/_.-])skills?(?:[\s/_.-]|$)|skill\.md|技能包|技能工具/i

const extensionPreviews: Array<[RegExp, string]> = [
  [/\.(?:png|jpe?g|gif|webp|bmp|svg|ico|apng|avif)$/iu, 'image'],
  [/\.(?:mp4|webm|mov|mkv)$/iu, 'video'],
  [/\.(?:amr|silk)$/iu, 'voice'],
  [/\.(?:mp3|wav|ogg|m4a)$/iu, 'audio'],
  [/\.pdf$/iu, 'pdf'],
  [/\.(?:docx?)$/iu, 'docx'],
  [/\.(?:xlsx?|csv)$/iu, 'sheet'],
  [/\.(?:pptx?|ppsx)$/iu, 'presentation'],
  [/\.(?:html?)$/iu, 'html'],
  [/\.(?:md|markdown)$/iu, 'markdown'],
  [/\.json$/iu, 'json'],
  [/\.(?:txt|log|xml|ya?ml|toml|ini|cfg|conf)$/iu, 'text'],
  [/\.(?:zip|rar|7z)$/iu, 'archive'],
  [/\.(?:py|js|jsx|ts|tsx|css|vue|c|h|cpp|java)$/iu, 'code'],
]

export function previewForArtifactName(name: string, claimedPreview: string) {
  return extensionPreviews.find(([pattern]) => pattern.test(name.trim()))?.[1] ?? claimedPreview
}

export function safeExternalUrl(value: string) {
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : null
  } catch {
    return null
  }
}

export function nextArtifactTab(current: ArtifactTabId, key: string): ArtifactTabId {
  if (key === 'Home') return artifactTabOrder[0]
  if (key === 'End') return artifactTabOrder[artifactTabOrder.length - 1]
  if (key !== 'ArrowLeft' && key !== 'ArrowRight') return current
  const direction = key === 'ArrowRight' ? 1 : -1
  const index = artifactTabOrder.indexOf(current)
  return artifactTabOrder[(index + direction + artifactTabOrder.length) % artifactTabOrder.length]
}

export function classifyArtifact(candidate: ArtifactCandidate): ArtifactKind {
  const name = candidate.name.trim()
  const preview = candidate.preview?.toLowerCase() ?? ''

  if (skillSignal.test(name)) return 'skill'
  if (documentPreviews.has(preview) || documentExtensions.test(name)) return 'document'
  if (workPreviews.has(preview)) return 'work'
  if (candidate.url) return 'link'
  if (candidate.chatText) return 'chatText'
  return 'work'
}

export function countArtifacts(artifacts: readonly ChatArtifact[]): ArtifactCounts {
  const counts: ArtifactCounts = {
    all: 0,
    work: 0,
    document: 0,
    skill: 0,
    link: 0,
    chatText: 0,
    available: 0,
    missing: 0,
  }

  for (const artifact of artifacts) {
    counts[artifact.kind] += 1
    if (artifact.kind !== 'chatText') counts.all += 1
    if (artifact.available) counts.available += 1
    else counts.missing += 1
  }
  return counts
}

export function artifactRequestUrl(input: {
  selection: ChatLibrarySelection
  tab: 'all' | ArtifactKind
  query: string
  offset: number
  limit: number
}) {
  return apiEndpoints.artifacts({
    ...(input.selection.kind === 'conversation' ? { conversationId: input.selection.id } : {}),
    ...(input.selection.kind === 'collection' ? { collection: input.selection.id } : {}),
    tab: input.tab,
    query: input.query,
    offset: input.offset,
    limit: input.limit,
  })
}
