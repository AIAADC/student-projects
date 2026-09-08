import path from 'node:path'
import { createAssetEvidenceState } from './assetEvidenceState.js'
import type { ResourceFileMatch } from './resourceFileMatcher.js'

export function previewForAsset(name: string, normalizedType: number) {
  if (normalizedType === 3) return 'image'
  if (normalizedType === 43) return 'video'
  if (normalizedType === 34) return 'voice'
  const extension = path.extname(name).toLowerCase()
  if (/\.(?:png|jpe?g|gif|webp|bmp|svg|ico|apng|avif)$/iu.test(extension)) return 'image'
  if (/\.(?:mp4|webm|mov|mkv)$/iu.test(extension)) return 'video'
  if (/\.(?:amr|silk)$/iu.test(extension)) return 'voice'
  if (/\.(?:mp3|wav|ogg|m4a)$/iu.test(extension)) return 'audio'
  if (extension === '.pdf') return 'pdf'
  if (/\.(?:docx?)$/iu.test(extension)) return 'docx'
  if (/\.(?:xlsx?|csv)$/iu.test(extension)) return 'sheet'
  if (/\.(?:pptx?|ppsx)$/iu.test(extension)) return 'presentation'
  if (/\.(?:html?)$/iu.test(extension)) return 'html'
  if (/\.(?:md|markdown)$/iu.test(extension)) return 'markdown'
  if (extension === '.json') return 'json'
  if (/\.(?:txt|log|xml|ya?ml|toml|ini|cfg|conf)$/iu.test(extension)) return 'text'
  if (/\.(?:zip|rar|7z)$/iu.test(extension)) return 'archive'
  if (/\.(?:py|js|jsx|ts|tsx|css|vue|c|h|cpp|java)$/iu.test(extension)) return 'code'
  return 'download'
}

export function fallbackAssetName(normalizedType: number) {
  if (normalizedType === 3) return '图片'
  if (normalizedType === 43) return '视频'
  if (normalizedType === 34) return '语音'
  return '聊天附件'
}

export function stateForResourceMatch(
  match: ResourceFileMatch,
  context: { cdnOnly?: boolean; preview?: string } = {},
) {
  if (match.status === 'ambiguous') {
    return createAssetEvidenceState('not_attempted', 'unavailable', 'multiple_local_candidates')
  }
  if (match.status === 'size_mismatch') {
    return createAssetEvidenceState('not_attempted', 'unavailable', 'local_candidate_size_mismatch')
  }
  if (match.status === 'missing') {
    if (context.cdnOnly) {
      return createAssetEvidenceState(
        'cdn_only',
        'unavailable',
        'remote_cdn_reference_without_local_cache',
      )
    }
    return createAssetEvidenceState('source_missing', 'unavailable', 'local_source_not_found')
  }
  const candidate = match.candidate
  if (!candidate) throw new Error('Matched resource must include one local candidate')
  if (path.extname(candidate.name).toLowerCase() === '.dat') {
    return createAssetEvidenceState(
      'not_attempted',
      'unavailable',
      'encrypted_wechat_dat_requires_materialization',
    )
  }
  if (context.preview === 'video' && /\.(?:png|jpe?g|gif|webp)$/iu.test(candidate.name)) {
    return createAssetEvidenceState('thumbnail_only', 'thumbnail_only')
  }
  return createAssetEvidenceState('ready', 'ready')
}
