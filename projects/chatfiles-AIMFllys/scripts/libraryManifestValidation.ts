import path from 'node:path'
import type { LibraryFile, LibraryManifest } from '../shared/contracts/index.js'

const categories = new Set([
  '过去', '创业', 'AI', '树林', '学业', '专业', '比赛', '生活', '健康',
  '项目', '财务', '旅行', '阅读', '工具', '人物', '素材', '未归类',
])
const sourceApps = new Set(['QQ', '微信', '企业微信', '未知'])
const previews = new Set([
  'image', 'video', 'audio', 'voice', 'pdf', 'docx', 'sheet', 'text',
  'markdown', 'code', 'html', 'json', 'presentation', 'archive', 'database',
  'font', 'download',
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function validArchivePath(value: string) {
  if (value.includes('\\') || !value.startsWith('archive/')) return false
  const normalized = path.posix.normalize(value)
  return normalized === value && !normalized.split('/').includes('..')
}

function assertLibraryFile(value: unknown, index: number): asserts value is LibraryFile {
  if (!isRecord(value)) throw new Error(`Library file ${index} is invalid`)
  const strings = ['id', 'name', 'ext', 'mime', 'modified', 'archivePath', 'sourcePath', 'sha256'] as const
  if (strings.some((key) => typeof value[key] !== 'string')) throw new Error(`Library file ${index} is invalid`)
  if (!isNonNegativeInteger(value.size)) throw new Error(`Library file ${index} is invalid`)
  if (!categories.has(value.category as string) || !isStringArray(value.subcategory)) {
    throw new Error(`Library file ${index} is invalid`)
  }
  if (!sourceApps.has(value.sourceApp as string) || !previews.has(value.preview as string)) {
    throw new Error(`Library file ${index} is invalid`)
  }
  if (!/^[a-f0-9]{64}$/.test(value.sha256 as string) || !validArchivePath(value.archivePath as string)) {
    throw new Error(`Library file ${index} is invalid`)
  }
  if (Number.isNaN(Date.parse(value.modified as string))) throw new Error(`Library file ${index} is invalid`)
}

export function validateLibraryManifest(value: unknown): LibraryManifest {
  if (!isRecord(value) || typeof value.generatedAt !== 'string' || Number.isNaN(Date.parse(value.generatedAt))) {
    throw new Error('Library manifest metadata is invalid')
  }
  if (!isStringArray(value.roots) || !Array.isArray(value.files) || !isRecord(value.stats)) {
    throw new Error('Library manifest structure is invalid')
  }
  value.files.forEach(assertLibraryFile)
  const files = value.files as LibraryFile[]
  const { discovered, archived, duplicatesSkipped, bytes } = value.stats
  if (
    !isNonNegativeInteger(discovered) ||
    !isNonNegativeInteger(archived) ||
    !isNonNegativeInteger(duplicatesSkipped) ||
    !isNonNegativeInteger(bytes) ||
    archived !== files.length ||
    bytes !== files.reduce((sum, file) => sum + file.size, 0)
  ) {
    throw new Error('Library manifest statistics are invalid')
  }

  const hashes = new Set<string>()
  const archivePaths = new Set<string>()
  for (const file of files) {
    const archiveKey = file.archivePath.toLowerCase()
    if (hashes.has(file.sha256) || archivePaths.has(archiveKey)) {
      throw new Error('Library manifest contains duplicate files')
    }
    hashes.add(file.sha256)
    archivePaths.add(archiveKey)
  }
  return value as LibraryManifest
}
