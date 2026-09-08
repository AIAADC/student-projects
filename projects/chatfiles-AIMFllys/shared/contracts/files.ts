/** File, manifest, and preview DTOs shared by browser and server runtimes. */
import { z } from 'zod/v4'
import type { ArchivePreviewBlockedReason } from './archivePreview.js'
export type Category =
  | '过去'
  | '创业'
  | 'AI'
  | '树林'
  | '学业'
  | '专业'
  | '比赛'
  | '生活'
  | '健康'
  | '项目'
  | '财务'
  | '旅行'
  | '阅读'
  | '工具'
  | '人物'
  | '素材'
  | '未归类'

export type LibraryFile = {
  id: string
  name: string
  ext: string
  mime: string
  size: number
  modified: string
  category: Category
  subcategory: string[]
  archivePath: string
  sourcePath: string
  sourceApp: 'QQ' | '微信' | '企业微信' | '未知'
  preview:
    | 'image'
    | 'video'
    | 'audio'
    | 'voice'
    | 'pdf'
    | 'docx'
    | 'sheet'
    | 'text'
    | 'markdown'
    | 'code'
    | 'html'
    | 'json'
    | 'presentation'
    | 'archive'
    | 'database'
    | 'font'
    | 'download'
  sha256: string
}

export type DatabasePreview = {
  path: string
  size: number
  modified: string
  readable: boolean
  header: string
  error?: string
  tables: Array<{
    name: string
    rowCount?: number
    columns: Array<{
      name: string
      type: string
    }>
  }>
}

export type FileInspection = {
  path: string
  size: number
  modified: string
  mime: string
  ext: string
  headerHex: string
  headerAscii: string
  sampledBytes: number
  strings: Array<{
    offset: number
    encoding: 'utf8' | 'utf16le'
    text: string
  }>
}

export type ArchivePreview = {
  path: string
  size: number
  modified: string
  format: string
  readable: boolean
  error?: string
  blockedReason?: ArchivePreviewBlockedReason
  entries: Array<{
    name: string
    size?: number
    directory: boolean
  }>
}

export type VoicePreview = {
  path: string
  size: number
  modified: string
  sourceFormat: string
  codecHint?: string
  playable: boolean
  durationSeconds?: number
  transcodedUrl?: string
  error?: string
}

export type LibraryManifest = {
  generatedAt: string
  roots: string[]
  files: LibraryFile[]
  stats: {
    discovered: number
    archived: number
    duplicatesSkipped: number
    bytes: number
  }
}

const libraryCategorySchema = z.enum([
  '过去','创业','AI','树林','学业','专业','比赛','生活','健康','项目','财务','旅行','阅读',
  '工具','人物','素材','未归类',
])

const libraryPreviewSchema = z.enum([
  'image','video','audio','voice','pdf','docx','sheet','text','markdown','code','html','json',
  'presentation','archive','database','font','download',
])

const archivePathSchema = z.string().min(9).max(2048).superRefine((value, context) => {
  if (!value.startsWith('archive/') || value.includes('\\') || value.includes('\u0000')
    || value.split('/').some((segment) => !segment || segment === '.' || segment === '..')) {
    context.addIssue({ code: 'custom',message: 'archive path must stay inside the archive role' })
  }
})

export const libraryManifestSchema = z.object({
  generatedAt: z.iso.datetime({ offset: true }),
  roots: z.array(z.string().max(32_768)).max(100_000),
  files: z.array(z.object({
    id: z.string().min(1).max(512),name: z.string().min(1).max(1024),
    ext: z.string().max(64),mime: z.string().max(256),
    size: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    modified: z.iso.datetime({ offset: true }),category: libraryCategorySchema,
    subcategory: z.array(z.string().min(1).max(256)).max(100),archivePath: archivePathSchema,
    sourcePath: z.string().min(1).max(32_768),sourceApp: z.enum(['QQ','微信','企业微信','未知']),
    preview: libraryPreviewSchema,sha256: z.string().regex(/^[0-9a-f]{64}$/u),
  }).strict()).max(1_000_000),
  stats: z.object({
    discovered: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    archived: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    duplicatesSkipped: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    bytes: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  }).strict(),
}).strict().superRefine((manifest, context) => {
  if (manifest.stats.archived !== manifest.files.length
    || manifest.stats.bytes !== manifest.files.reduce((sum, file) => sum + file.size, 0)) {
    context.addIssue({ code: 'custom',path: ['stats'],message: 'library counts must close' })
  }
  if (new Set(manifest.files.map((file) => file.id)).size !== manifest.files.length
    || new Set(manifest.files.map((file) => file.archivePath)).size !== manifest.files.length) {
    context.addIssue({ code: 'custom',path: ['files'],message: 'library identities must be unique' })
  }
})

export type SourceIndexedFile = {
  id: string
  name: string
  ext: string
  mime: string
  size: number
  modified: string
  root: string
  relativePath: string
  sourcePath: string
  sourceApp: LibraryFile['sourceApp']
  preview: LibraryFile['preview']
}

export type SourceFileManifest = {
  generatedAt: string
  roots: string[]
  files: SourceIndexedFile[]
  stats: {
    files: number
    bytes: number
    databaseCandidates: number
    mediaCandidates: number
    textCandidates: number
  }
}

export type SourceDiscovery = {
  generatedAt: string
  roots: Array<{
    path: string
    exists: boolean
    candidateCount: number
    candidateBytes: number
    note: string
  }>
  directoryMap: Array<{
    path: string
    exists: boolean
    files: number
    bytes: number
    newest?: string
    focus: string
  }>
  databases: Array<{
    path: string
    exists: boolean
    size: number
    readable: boolean
    detail: string
  }>
  wideMatches?: Array<{
    path: string
    exists: boolean
    files: number
    bytes: number
    newest?: string
    depth: number
    reason: string
    focus: string
  }>
  topCandidates: Array<{
    path: string
    size: number
    modified: string
    kind: string
  }>
}

export type DeepFileIndex = {
  generatedAt: string
  roots: Array<{
    path: string
    exists: boolean
    files: number
    directories: number
    bytes: number
    newest?: string
    oldest?: string
  }>
  totals: {
    files: number
    directories: number
    bytes: number
    databaseCandidates: number
    textCandidates: number
    mediaCandidates: number
    attachmentCandidates: number
  }
  extensionStats: Array<{
    ext: string
    files: number
    bytes: number
  }>
  databaseCandidates: Array<{
    path: string
    size: number
    modified: string
    header: string
    readable: boolean
    detail: string
  }>
  largestFiles: Array<{
    path: string
    size: number
    modified: string
    ext: string
  }>
  newestFiles: Array<{
    path: string
    size: number
    modified: string
    ext: string
  }>
  files?: Array<{
    path: string
    root: string
    relativePath: string
    size: number
    modified: string
    ext: string
    preview: LibraryFile['preview']
    sourceApp: LibraryFile['sourceApp']
  }>
}
