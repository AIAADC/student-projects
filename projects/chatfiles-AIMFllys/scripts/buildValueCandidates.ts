import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import type { DeepFileIndex, LibraryManifest, ValueCandidate, ValueCandidateIndex } from '../shared/contracts/index.js'
import { classify, dataDir, sha256File, writeJson } from './shared.js'
import { readCurrentLibraryManifest } from './data/catalogConsumer.js'

const deepIndex = JSON.parse(fs.readFileSync(path.join(dataDir, 'deep-index.json'), 'utf8')) as DeepFileIndex
const library: LibraryManifest = readCurrentLibraryManifest(path.dirname(dataDir))
const archivedSources = new Set(library.files.map((file) => file.sourcePath.toLowerCase()))
const archivedHashes = new Set(library.files.map((file) => file.sha256))

const valuablePreviews = new Set(['pdf', 'docx', 'sheet', 'presentation', 'archive', 'markdown', 'text', 'code', 'json', 'image', 'video', 'audio', 'voice'])
const documentPreviews = new Set(['pdf', 'docx', 'sheet', 'presentation', 'archive', 'markdown'])
const mediaPreviews = new Set(['image', 'video', 'audio', 'voice'])
const structuredPreviews = new Set(['text', 'code', 'json'])

const hardNoise =
  /\\(avatar|emoji|baseemojisyastems|emoji-recv|emojirecv|emojirelated|thumbtemp|oritemp|cache|cachestorage|code cache|service worker|local storage|session storage|indexeddb|xplugin|xworker|publiclib|offlineresource|dynamicresource|dynamicresourcepackage|upgrade|patch|crash|caton_dump|logs?|log-cache|tbs|tzdata|qzone|webview|cef_|hpModule)\\/i
const appResource =
  /\\(resources?|themes?|locales?|compatible_web|raw|shader|shaders|aekit|node_modules|_next\\static|static\\chunks|wxdrive|wemeet|virtualaudio)\\/i
const qqProgramResource =
  /\\AppData\\Roaming\\QQ\\(arks|blob_storage|cache|code cache|crashpad|dawngraphitecache|dawnwebgpucache|dictionaries|dynamic_module|dynamic_package|gpucache|local storage|miniapp|network|packages|partitions|qqex|session storage|shared dictionary)\\/i
const tencentAppResource =
  /\\Tencent\\(Androws\\context_menu|WeMail\\cache|WXWork\\wwmapp\\userdata\\Global\\Data\\AudioModel)\\/i
const noisyExt = /\.(dll|exe|pak|bin|dmp|wmc|gft|cur|cat|inf|mmap3|stk|tk|tv|sst|ldb|db|db-shm|db-wal|xlog|qqxlog|log|old|ini|map)$/i
const valuableKeyword =
  /(^|[^a-z])ai([^a-z]|$)|(^|[^a-z])bp([^a-z]|$)|llm|prompt|openai|claude|创业|商业|项目|方案|课程|学业|作业|考试|复习|基医|强基|医学|生物|化学|物理|高数|英语|思政|专业|科研|论文|实验|比赛|竞赛|森林|树林|笔记|资料|简历|合同|发票|报销|预算|课题|需求|prd|roadmap/i
const chatMediaPath = /\\(FileRecv|Image|Pic|Video|Ptt|Audio|Voice|cdn\\download|nt_data\\Video|nt_data\\File|MsgAttach)\\/i

function stableId(value: string) {
  return crypto.createHash('sha1').update(value).digest('hex').slice(0, 20)
}

function fileNameFromPath(value: string) {
  return path.basename(value) || value.split(/[\\/]+/).filter(Boolean).at(-1) || value
}

function mediaVariantKey(filePath: string) {
  const ext = path.extname(filePath).toLowerCase().replace('.jpeg', '.jpg')
  if (!/\.(png|jpe?g|gif|webp|bmp|mp4|mov|mkv|webm|mp3|wav|ogg|silk|amr)$/i.test(ext)) return ''
  const stem = path.basename(filePath, path.extname(filePath)).toLowerCase().replace(/_(0|360|480|720|750|1080)$/i, '')
  return `${stem}${ext}`
}

const archivedMediaKeys = new Set(library.files.map((file) => mediaVariantKey(file.sourcePath)).filter(Boolean))

function isRepresentedMediaVariant(file: NonNullable<DeepFileIndex['files']>[number]) {
  if (!mediaPreviews.has(file.preview)) return false
  const key = mediaVariantKey(file.path)
  return Boolean(key && archivedMediaKeys.has(key))
}

function isNoise(file: NonNullable<DeepFileIndex['files']>[number]) {
  const valueText = valueTextFor(file)
  const filePath = file.path
  const preview = file.preview
  const size = file.size
  if (size === 0) return true
  if (chatMediaPath.test(filePath) && mediaPreviews.has(preview)) return false
  if (qqProgramResource.test(filePath)) return true
  if (tencentAppResource.test(filePath)) return true
  if (valuableKeyword.test(valueText) && !/\.(dll|exe|pak|bin|dmp)$/i.test(filePath)) return false
  if (hardNoise.test(filePath)) return true
  if (appResource.test(filePath) && !valuableKeyword.test(valueText)) return true
  if (noisyExt.test(filePath) && !valuableKeyword.test(valueText)) return true
  if (documentPreviews.has(preview)) return false
  return false
}

function valueTextFor(file: Pick<NonNullable<DeepFileIndex['files']>[number], 'path' | 'relativePath'>) {
  return `${file.relativePath}\n${fileNameFromPath(file.path)}`
}

function scoreFile(file: NonNullable<DeepFileIndex['files']>[number]) {
  const reasons: string[] = []
  const valueText = valueTextFor(file)
  let score = 0
  if (documentPreviews.has(file.preview)) {
    score += 45
    reasons.push('文档/表格/压缩包')
  }
  if (chatMediaPath.test(file.path) && mediaPreviews.has(file.preview)) {
    score += 38
    reasons.push('聊天媒体目录')
  }
  if (file.preview === 'archive') {
    score += 12
    reasons.push('可打开压缩包目录')
  }
  if (structuredPreviews.has(file.preview) && file.size >= 4096 && file.size <= 2 * 1024 * 1024) {
    score += 12
    reasons.push('可读文本/结构化数据')
  }
  if (valuableKeyword.test(valueText)) {
    score += 30
    reasons.push('路径命中价值关键词')
  }
  if (/Tencent Files|WeChat Files|xwechat/i.test(file.path)) {
    score += 8
    reasons.push('微信/QQ 用户数据路径')
  }
  if (/WXWork/i.test(file.path)) {
    score += 4
    reasons.push('企业微信路径')
  }
  if (file.size >= 1024 * 1024) {
    score += 4
    reasons.push('文件体积较大')
  }
  if (hardNoise.test(file.path)) score -= 30
  if (appResource.test(file.path)) score -= 18
  if (qqProgramResource.test(file.path)) score -= 42
  if (tencentAppResource.test(file.path)) score -= 42
  if (noisyExt.test(file.path)) score -= 20
  return { score, reasons: [...new Set(reasons)] }
}

const candidates: ValueCandidate[] = []
let representedByArchive = 0

for (const file of deepIndex.files ?? []) {
  if (archivedSources.has(file.path.toLowerCase())) continue
  if (!valuablePreviews.has(file.preview)) continue
  if (isRepresentedMediaVariant(file)) {
    representedByArchive += 1
    continue
  }
  if (isNoise(file)) continue
  if (fs.existsSync(file.path) && fs.statSync(file.path).isFile() && archivedHashes.has(await sha256File(file.path))) {
    representedByArchive += 1
    continue
  }
  const { score, reasons } = scoreFile(file)
  if (score < 24) continue
  const category = classify(file.path).category
  candidates.push({
    id: stableId(file.path),
    path: file.path,
    root: file.root,
    relativePath: file.relativePath,
    name: fileNameFromPath(file.path),
    ext: file.ext,
    preview: file.preview,
    sourceApp: file.sourceApp,
    size: file.size,
    modified: file.modified,
    score,
    level: score >= 70 ? 'high' : score >= 42 ? 'medium' : 'low',
    bucket: category === '未归类' ? '复核' : category,
    reasons,
    action: documentPreviews.has(file.preview) || score >= 70 ? 'archive_candidate' : 'review',
  })
}

function dedupeCandidateKey(candidate: ValueCandidate) {
  const serialNormalizedName = candidate.name.replace(/(?:\((\d+)\))?(\.[^.]+)$/i, '$2').toLowerCase()
  return `${serialNormalizedName}:${candidate.size}:${candidate.preview}`
}

const byDuplicateKey = new Map<string, ValueCandidate>()
let duplicateCandidatesSkipped = 0
for (const candidate of candidates) {
  const key = dedupeCandidateKey(candidate)
  const previous = byDuplicateKey.get(key)
  if (!previous) {
    byDuplicateKey.set(key, candidate)
    continue
  }
  duplicateCandidatesSkipped += 1
  if (new Date(candidate.modified).getTime() >= new Date(previous.modified).getTime()) {
    byDuplicateKey.set(key, candidate)
  }
}

const dedupedCandidates = [...byDuplicateKey.values()]

dedupedCandidates.sort((a, b) => b.score - a.score || b.size - a.size || a.path.localeCompare(b.path, 'zh-CN'))

const limited = dedupedCandidates.slice(0, 600)
const byBucket: Record<string, number> = {}
const byPreview: Record<string, number> = {}
for (const candidate of limited) {
  byBucket[candidate.bucket] = (byBucket[candidate.bucket] ?? 0) + 1
  byPreview[candidate.preview] = (byPreview[candidate.preview] ?? 0) + 1
}

const index: ValueCandidateIndex = {
  generatedAt: new Date().toISOString(),
  totals: {
    sourceFiles: deepIndex.files?.length ?? deepIndex.totals.files,
    archivedFiles: library.files.length,
    unarchivedFiles: Math.max((deepIndex.files?.length ?? deepIndex.totals.files) - library.files.length, 0),
    representedByArchive,
    duplicateCandidatesSkipped,
    candidates: limited.length,
    high: limited.filter((item) => item.level === 'high').length,
    medium: limited.filter((item) => item.level === 'medium').length,
    low: limited.filter((item) => item.level === 'low').length,
  },
  byBucket,
  byPreview,
  candidates: limited,
}

writeJson(path.join(dataDir, 'value-candidates.json'), index)

const report = `# 未归档高价值候选

生成时间：${index.generatedAt}

## 总量

- 全量源文件：${index.totals.sourceFiles}
- 已归档副本：${index.totals.archivedFiles}
- 未归档源文件：${index.totals.unarchivedFiles}
- 已由归档媒体变体覆盖：${index.totals.representedByArchive}
- 候选去重跳过：${index.totals.duplicateCandidatesSkipped}
- 候选：${index.totals.candidates}
- 高：${index.totals.high}
- 中：${index.totals.medium}
- 低：${index.totals.low}

## 分类

${Object.entries(index.byBucket).map(([bucket, count]) => `- ${bucket}：${count}`).join('\n') || '- 暂无'}

## 预览类型

${Object.entries(index.byPreview).map(([preview, count]) => `- ${preview}：${count}`).join('\n') || '- 暂无'}

## Top 80

${index.candidates
  .slice(0, 80)
  .map((item, indexNo) => `${indexNo + 1}. [${item.level}] ${item.score} ${item.bucket}/${item.preview} ${item.name}\n   - ${item.path}\n   - ${item.reasons.join('、')}`)
  .join('\n')}
`

fs.writeFileSync(path.join(dataDir, 'value-candidates.md'), `${report.trimEnd()}\n`, 'utf8')
console.log(`Built value candidates: ${index.totals.candidates} candidates, ${index.totals.high} high.`)
