import { createElement } from 'react'
import { Archive, DatabaseZap, FileText, Image as ImageIcon, Mic2 } from 'lucide-react'
import type { LibraryFile, SourceIndexedFile } from '../types'
import { apiEndpoints, type FileScope } from '../shared/api/endpoints'

export type BrowsableFile = LibraryFile & {
  storage: 'archive' | 'source' | 'artifact'
  treeId: string
  root?: string
  relativePath?: string
  contentUrl?: string
  thumbnailUrl?: string
}

export type TreeNode = {
  name: string
  path: string
  children: TreeNode[]
  files: BrowsableFile[]
}

export function asArchiveFile(file: LibraryFile): BrowsableFile {
  return {
    ...file,
    storage: 'archive',
    treeId: `archive:${file.id}`,
  }
}

export function asSourceFile(file: SourceIndexedFile): BrowsableFile {
  return {
    id: file.id,
    name: file.name,
    ext: file.ext,
    mime: file.mime,
    size: file.size,
    modified: file.modified,
    category: '未归类',
    subcategory: [],
    archivePath: file.sourcePath,
    sourcePath: file.sourcePath,
    sourceApp: file.sourceApp,
    preview: file.preview,
    sha256: file.id,
    storage: 'source',
    treeId: `source:${file.id}`,
    root: file.root,
    relativePath: file.relativePath,
  }
}

export function insertFile(root: TreeNode, parts: string[], file: BrowsableFile) {
  let cursor = root
  for (const part of parts.filter(Boolean)) {
    const nextPath = [cursor.path, part].filter(Boolean).join('/')
    let next = cursor.children.find((child) => child.name === part)
    if (!next) {
      next = { name: part, path: nextPath, children: [], files: [] }
      cursor.children.push(next)
    }
    cursor = next
  }
  cursor.files.push(file)
}

export function sortTree(root: TreeNode) {
  root.children.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
  root.files.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
  root.children.forEach(sortTree)
}

export function buildArchiveTree(files: LibraryFile[]): TreeNode {
  const root: TreeNode = { name: 'ChatFiles', path: '', children: [], files: [] }
  for (const file of files) {
    insertFile(root, [file.category, ...file.subcategory], asArchiveFile(file))
  }
  sortTree(root)
  return root
}

export function buildSourceTree(files: SourceIndexedFile[]): TreeNode {
  const root: TreeNode = { name: '全部源文件', path: '', children: [], files: [] }
  for (const file of files) {
    const relativeParts = file.relativePath.split(/[\\/]+/).slice(0, -1)
    const rootName = file.root.replace(/^[A-Z]:\\/i, '').split(/[\\/]+/).filter(Boolean).slice(-2).join(' / ') || file.root
    insertFile(root, [file.sourceApp, rootName, ...relativeParts], asSourceFile(file))
  }
  sortTree(root)
  return root
}

export function fileIcon(file: BrowsableFile) {
  if (file.preview === 'database') return createElement(DatabaseZap, { size: 16 })
  if (file.preview === 'image') return createElement(ImageIcon, { size: 16 })
  if (file.preview === 'voice') return createElement(Mic2, { size: 16 })
  if (file.preview === 'markdown' || file.preview === 'text' || file.preview === 'code') return createElement(FileText, { size: 16 })
  return createElement(Archive, { size: 16 })
}

export function fileUrl(file: BrowsableFile) {
  return apiEndpoints.fileContent(file.storage as FileScope, file.id)
}

export function thumbUrl(file: BrowsableFile, w = 360) {
  return apiEndpoints.fileThumbnail(file.storage as FileScope, file.id, w)
}

export function textUrl(file: BrowsableFile) {
  if (file.storage === 'artifact') return fileUrl(file)
  return apiEndpoints.fileCapability(file.storage as FileScope, file.id, 'text')
}

export function inspectUrl(file: BrowsableFile) {
  return apiEndpoints.fileCapability(file.storage as FileScope, file.id, 'inspect')
}

export function archiveUrl(file: BrowsableFile) {
  return apiEndpoints.fileCapability(file.storage as FileScope, file.id, 'archive')
}

export function voiceUrl(file: BrowsableFile) {
  return apiEndpoints.fileCapability(file.storage as FileScope, file.id, 'voice')
}

export function isVoiceFile(file: BrowsableFile) {
  return /\.(amr|silk)$/i.test(file.ext || file.name)
}
