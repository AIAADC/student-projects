export type ArtifactCategory = 'work' | 'document' | 'skill' | 'link' | 'chatText'

export interface ArtifactClassificationInput {
  name: string
  preview?: string | null
  url?: string | null
  hasLocalFile?: boolean
  chatText?: boolean
}

function hasNonemptyValue(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.trim() !== ''
}

const DOCUMENT_PREVIEWS = new Set([
  'pdf',
  'docx',
  'sheet',
  'presentation',
  'markdown',
  'text',
  'json',
])
const WORK_PREVIEWS = new Set(['image', 'video', 'audio', 'voice', 'html', 'code'])
const DOCUMENT_EXTENSION = /\.(?:pdf|docx?|pptx?|ppsx|xlsx?|csv|md|markdown|txt|rtf)$/iu
const WORK_EXTENSION = /\.(?:avif|bmp|gif|heic|jpe?g|png|svg|webp|mp4|mov|mkv|webm|mp3|wav|m4a|ogg|html?|css|jsx?|tsx?)$/iu
const SKILL_SIGNAL = /(?:^|[\s/_.-])skills?(?:[\s/_.-]|$)|skill\.md|技能包|技能工具/iu

export function classifyArtifactCategory(candidate: ArtifactClassificationInput): ArtifactCategory {
  const name = candidate.name.trim()
  const preview = candidate.preview?.trim().toLowerCase() ?? ''

  if (preview === 'skill' || SKILL_SIGNAL.test(name)) return 'skill'
  if (DOCUMENT_PREVIEWS.has(preview) || DOCUMENT_EXTENSION.test(name)) return 'document'
  if (WORK_PREVIEWS.has(preview) || WORK_EXTENSION.test(name) || candidate.hasLocalFile) return 'work'
  if (hasNonemptyValue(candidate.url)) return 'link'
  if (candidate.chatText) return 'chatText'
  return 'work'
}

export function isIncludedInAll(category: ArtifactCategory): boolean {
  return category === 'work'
    || category === 'document'
    || category === 'skill'
    || category === 'link'
}

export interface StructuredUrlInput {
  text?: string | null
  application_xml?: string | null
}

const STRUCTURED_URL_PATTERN = /https?:\/\/[^\s<>"'`，。！？；：、（）【】《》「」『』]+/giu
const TRAILING_URL_PUNCTUATION = /[.,!?;:)\]}]+$/u

function decodeXmlUrlEntities(value: string): string {
  return value
    .replace(/&amp;/giu, '&')
    .replace(/&#38;/giu, '&')
    .replace(/&#x26;/giu, '&')
}

function canonicalHttpUrl(value: string): string | null {
  const candidate = value.replace(TRAILING_URL_PUNCTUATION, '')
  try {
    const parsed = new URL(candidate)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
    return parsed.href
  } catch {
    return null
  }
}

export function extractStructuredUrls(input: StructuredUrlInput): string[] {
  const sources = [input.text ?? '', decodeXmlUrlEntities(input.application_xml ?? '')]
  const urls: string[] = []
  const seen = new Set<string>()
  for (const source of sources) {
    for (const match of source.matchAll(STRUCTURED_URL_PATTERN)) {
      const canonical = canonicalHttpUrl(match[0])
      if (canonical === null || seen.has(canonical)) continue
      seen.add(canonical)
      urls.push(canonical)
    }
  }
  return urls
}
