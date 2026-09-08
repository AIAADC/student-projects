import fs from 'node:fs'
import path from 'node:path'
import type { LibraryFile, LibraryManifest, ValueCandidateIndex } from '../shared/contracts/index.js'
import { archiveDir, classify, dataDir, ensureDir, mimeFor, previewFor, root, safeName, sha256File, writeJson } from './shared.js'
import { readCurrentLibraryManifest } from './data/catalogConsumer.js'

const candidatesPath = path.join(dataDir, 'value-candidates.json')
const promotedManifestPath = path.join(dataDir, 'promoted-library-candidate.json')

const manifest: LibraryManifest = readCurrentLibraryManifest(path.dirname(dataDir))
const candidates = JSON.parse(fs.readFileSync(candidatesPath, 'utf8')) as ValueCandidateIndex

const seenHashes = new Set(manifest.files.map((file) => file.sha256))
const seenSources = new Set(manifest.files.map((file) => file.sourcePath.toLowerCase()))
const promoted: LibraryFile[] = []
const skipped: Array<{ path: string; reason: string }> = []

ensureDir(archiveDir)

for (const candidate of candidates.candidates.filter((item) => item.action === 'archive_candidate')) {
  if (seenSources.has(candidate.path.toLowerCase())) {
    skipped.push({ path: candidate.path, reason: 'source already archived' })
    continue
  }
  if (!fs.existsSync(candidate.path) || !fs.statSync(candidate.path).isFile()) {
    skipped.push({ path: candidate.path, reason: 'source missing' })
    continue
  }
  const stat = fs.statSync(candidate.path)
  if (stat.size === 0) {
    skipped.push({ path: candidate.path, reason: 'empty file' })
    continue
  }
  const hash = await sha256File(candidate.path)
  if (seenHashes.has(hash)) {
    skipped.push({ path: candidate.path, reason: 'same sha256 already archived' })
    continue
  }

  const { category, subcategory } = classify(candidate.path)
  const ext = path.extname(candidate.path).toLowerCase()
  const cleanName = safeName(path.basename(candidate.path))
  const destDir = path.join(archiveDir, category, ...subcategory)
  ensureDir(destDir)
  let dest = path.join(destDir, cleanName)
  if (fs.existsSync(dest) && (await sha256File(dest)) !== hash) {
    dest = path.join(destDir, `${path.basename(cleanName, ext)}-${hash.slice(0, 8)}${ext}`)
  }
  if (!fs.existsSync(dest)) fs.copyFileSync(candidate.path, dest)
  fs.utimesSync(dest, stat.atime, stat.mtime)

  const item: LibraryFile = {
    id: hash.slice(0, 20),
    name: path.basename(dest),
    ext,
    mime: mimeFor(dest),
    size: stat.size,
    modified: stat.mtime.toISOString(),
    category,
    subcategory,
    archivePath: path.relative(root, dest).replace(/\\/g, '/'),
    sourcePath: candidate.path,
    sourceApp: candidate.sourceApp,
    preview: previewFor(dest),
    sha256: hash,
  }
  promoted.push(item)
  seenHashes.add(hash)
  seenSources.add(candidate.path.toLowerCase())
}

if (promoted.length > 0) {
  manifest.files.push(...promoted)
  manifest.files.sort((a, b) => a.category.localeCompare(b.category, 'zh-CN') || a.name.localeCompare(b.name, 'zh-CN'))
  manifest.stats.archived = manifest.files.length
  manifest.stats.bytes = manifest.files.reduce((sum, file) => sum + file.size, 0)
  manifest.stats.duplicatesSkipped += skipped.filter((item) => item.reason.includes('already')).length
  for (const item of promoted) {
    const sourceRoot = path.dirname(item.sourcePath)
    if (!manifest.roots.includes(sourceRoot)) manifest.roots.push(sourceRoot)
  }
  writeJson(promotedManifestPath, manifest)
}

const report = {
  generatedAt: new Date().toISOString(),
  promoted: promoted.map((item) => ({
    name: item.name,
    category: item.category,
    subcategory: item.subcategory,
    archivePath: item.archivePath,
    sourcePath: item.sourcePath,
    size: item.size,
    sha256: item.sha256,
  })),
  skipped,
}

writeJson(path.join(dataDir, 'promoted-candidates.json'), report)

const markdown = `# 候选归档提升报告

生成时间：${report.generatedAt}

## 已复制进 archive

${report.promoted.length ? report.promoted.map((item) => `- ${item.category} / ${item.subcategory.join(' / ')} / ${item.name}\n  - ${item.archivePath}\n  - ${item.sourcePath}`).join('\n') : '- 暂无'}

## 跳过

${report.skipped.length ? report.skipped.map((item) => `- ${item.reason}: ${item.path}`).join('\n') : '- 暂无'}
`

fs.writeFileSync(path.join(dataDir, 'promoted-candidates.md'), markdown, 'utf8')
console.log(`Promoted ${promoted.length} value candidates, skipped ${skipped.length}.`)
