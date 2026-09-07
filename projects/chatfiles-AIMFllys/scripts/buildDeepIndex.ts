import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { DeepFileIndex } from '../shared/contracts/index.js'
import { dataDir, ensureDir, explorationRoots, isEligibleAttachment, previewFor, sourceApp, walkFiles, writeJson } from './shared.js'

type FileEntry = {
  path: string
  root: string
  relativePath: string
  size: number
  modified: string
  ext: string
}

function fileHeader(filePath: string) {
  const fd = fs.openSync(filePath, 'r')
  try {
    const buffer = Buffer.alloc(64)
    const bytesRead = fs.readSync(fd, buffer, 0, buffer.length, 0)
    return [...buffer.subarray(0, bytesRead)].map((byte) => byte.toString(16).padStart(2, '0')).join(' ')
  } finally {
    fs.closeSync(fd)
  }
}

function inspectDb(filePath: string): DeepFileIndex['databaseCandidates'][number] {
  const stat = fs.statSync(filePath)
  try {
    const db = new DatabaseSync(filePath, { readOnly: true })
    const tables = db.prepare("select name from sqlite_master where type='table' limit 10").all() as Array<{ name: string }>
    db.close()
    return {
      path: filePath,
      size: stat.size,
      modified: stat.mtime.toISOString(),
      header: fileHeader(filePath),
      readable: true,
      detail: `SQLite 可打开；表样例：${tables.map((table) => table.name).join('、') || '无表'}`,
    }
  } catch (error) {
    return {
      path: filePath,
      size: stat.size,
      modified: stat.mtime.toISOString(),
      header: fileHeader(filePath),
      readable: false,
      detail: String(error),
    }
  }
}

function countDirectories(dir: string): number {
  if (!fs.existsSync(dir)) return 0
  let count = 0
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    count += 1 + countDirectories(path.join(dir, entry.name))
  }
  return count
}

function rootSummary(dir: string): DeepFileIndex['roots'][number] {
  if (!fs.existsSync(dir)) {
    return { path: dir, exists: false, files: 0, directories: 0, bytes: 0 }
  }
  const files = walkFiles(dir)
  let bytes = 0
  let newest = 0
  let oldest = Number.POSITIVE_INFINITY
  for (const file of files) {
    const stat = fs.statSync(file)
    bytes += stat.size
    newest = Math.max(newest, stat.mtimeMs)
    oldest = Math.min(oldest, stat.mtimeMs)
  }
  return {
    path: dir,
    exists: true,
    files: files.length,
    directories: countDirectories(dir),
    bytes,
    newest: newest ? new Date(newest).toISOString() : undefined,
    oldest: Number.isFinite(oldest) ? new Date(oldest).toISOString() : undefined,
  }
}

ensureDir(dataDir)

const roots = explorationRoots.map(rootSummary)
const rootPairs = explorationRoots.flatMap((dir) => walkFiles(dir).map((file) => ({ root: dir, file })))
const uniqueRootPairs = [...new Map(rootPairs.map((item) => [item.file, item])).values()]
const uniqueFiles = uniqueRootPairs.map((item) => item.file)

const fileEntries: FileEntry[] = uniqueRootPairs.map(({ root, file }) => {
  const stat = fs.statSync(file)
  return {
    path: file,
    root,
    relativePath: path.relative(root, file),
    size: stat.size,
    modified: stat.mtime.toISOString(),
    ext: path.extname(file).toLowerCase() || '[none]',
  }
})

const extMap = new Map<string, { files: number; bytes: number }>()
for (const item of fileEntries) {
  const current = extMap.get(item.ext) ?? { files: 0, bytes: 0 }
  current.files += 1
  current.bytes += item.size
  extMap.set(item.ext, current)
}

const dbFiles = fileEntries
  .filter((item) => /\.(db|sqlite|sqlite3|fts|db-wal|db-shm)$/i.test(item.ext) || /\\nt_db\\/i.test(item.path))
  .sort((a, b) => b.size - a.size)

const index: DeepFileIndex = {
  generatedAt: new Date().toISOString(),
  roots,
  totals: {
    files: fileEntries.length,
    directories: roots.reduce((sum, item) => sum + item.directories, 0),
    bytes: fileEntries.reduce((sum, item) => sum + item.size, 0),
    databaseCandidates: dbFiles.length,
    textCandidates: fileEntries.filter((item) => /\.(txt|md|json|html?|csv|log)$/i.test(item.ext)).length,
    mediaCandidates: fileEntries.filter((item) => /\.(png|jpe?g|gif|webp|bmp|mp4|mov|mkv|webm|mp3|wav|ogg|amr|silk)$/i.test(item.ext)).length,
    attachmentCandidates: uniqueFiles.filter(isEligibleAttachment).length,
  },
  extensionStats: [...extMap.entries()]
    .map(([ext, value]) => ({ ext, files: value.files, bytes: value.bytes }))
    .sort((a, b) => b.bytes - a.bytes || b.files - a.files)
    .slice(0, 80),
  databaseCandidates: dbFiles.slice(0, 80).map((item) => inspectDb(item.path)),
  largestFiles: [...fileEntries].sort((a, b) => b.size - a.size).slice(0, 80),
  newestFiles: [...fileEntries].sort((a, b) => b.modified.localeCompare(a.modified)).slice(0, 80),
  files: fileEntries
    .map((item) => ({
      ...item,
      preview: previewFor(item.path),
      sourceApp: sourceApp(item.path),
    }))
    .sort((a, b) => a.path.localeCompare(b.path, 'zh-CN')),
}

writeJson(path.join(dataDir, 'deep-index.json'), index)

const report = `# 全目录深度索引

生成时间：${index.generatedAt}

## 总量

- 文件：${index.totals.files}
- 目录：${index.totals.directories}
- 总大小：${(index.totals.bytes / 1024 / 1024).toFixed(2)} MB
- 数据库候选：${index.totals.databaseCandidates}
- 文本候选：${index.totals.textCandidates}
- 媒体候选：${index.totals.mediaCandidates}
- 可归档附件候选：${index.totals.attachmentCandidates}
- 全量文件清单：${index.files?.length ?? 0}

## 根目录

${index.roots
  .map(
    (item) => `- ${item.exists ? '已找到' : '未找到'}：${item.path}
  - 文件：${item.files}，目录：${item.directories}，大小：${(item.bytes / 1024 / 1024).toFixed(2)} MB
  - 时间：${item.oldest ?? '无'} -> ${item.newest ?? '无'}`,
  )
  .join('\n')}

## 扩展名分布 Top 30

${index.extensionStats
  .slice(0, 30)
  .map((item) => `- ${item.ext}：${item.files} 个，${(item.bytes / 1024 / 1024).toFixed(2)} MB`)
  .join('\n')}

## 数据库候选 Top 30

${index.databaseCandidates
  .slice(0, 30)
  .map(
    (item) => `- ${item.readable ? '可读' : '不可读'}：${(item.size / 1024 / 1024).toFixed(2)} MB｜${item.path}
  - ${item.detail}`,
  )
  .join('\n')}
`

fs.writeFileSync(path.join(dataDir, 'deep-index.md'), report, 'utf8')
console.log(`Built deep index with ${index.totals.files} files and ${index.totals.databaseCandidates} database candidates.`)
