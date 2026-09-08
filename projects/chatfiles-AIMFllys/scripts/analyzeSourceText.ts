import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { readJsonFile as readJson } from '../pipeline/common/jsonFile.js'
import type { DeepFileIndex, LibraryFile, SourceTextExtract, SourceTextIndex } from '../shared/contracts/index.js'
import { dataDir, writeJson } from './shared.js'

const maxReadBytes = 2 * 1024 * 1024
const maxExtracts = 240
const textExt = /\.(txt|md|markdown|json|html?|csv|log|xml|yml|yaml|ini|conf|config|plist|js|jsx|ts|tsx|css|py|java|cpp|c|h|ipynb)$/i
const noisyPath =
  /\\(Cache|CacheStorage|Code Cache|Service Worker|Local Storage|Session Storage|logs?|xlog|Emoji|upgrade|patch|DynamicResource|publicLib|dictionaries|dict|spellcheck|node_modules|_next\\static\\chunks|dist\\pkg|dist|locale|IndexedDB|leveldb|AIModel)\\/i
const noisyName = /sohu_simp|diagnosticMessages|assetmanifest|package-lock|pnpm-lock|yarn\.lock|license|copyright|bundle\.js|chunks-common\.js|components\.iife\.js|tokenizer\.json|file_component\.xml/i
const qqProgramResource =
  /\\AppData\\Roaming\\QQ\\(arks|blob_storage|cache|code cache|crashpad|dawngraphitecache|dawnwebgpucache|dictionaries|dynamic_module|dynamic_package|gpucache|local storage|miniapp|network|packages|qqex|session storage|shared dictionary)\\/i

const signalRules: Array<[string, RegExp]> = [
  ['AI/技术', /\b(?:AI|LLM|GPT|OpenAI|Claude|SDK|GLSL|HLSL)\b|人工智能|大模型|prompt|模型训练|算法|架构设计|shader|uniform|sampler|texture2d|fragment|vertex|python|typescript|数据库|工程化|部署|调试记录/i],
  ['哲理/方法', /哲学|意义|价值判断|基本原则|方法论|深度思考|复盘|成长|长期主义|认知|策略|心态/i],
  ['学业', /课程|考试|复习|基医|强基|医学|学分|作业|实验|高数|化学|英语|解剖|生物|病理|临床/i],
  ['创业/项目', /创业|商业计划|产品规划|用户增长|市场分析|融资|项目计划|需求文档|运营方案|商业模式|roadmap|prd/i],
  ['比赛', /比赛|竞赛|挑战杯|大创|建模|赛题|路演/i],
  ['聊天线索', /群聊|聊天记录|撤回了一条消息|发送者|接收者|消息正文|msgContent|message_content|talker|wxid_|conversationId|sender.+content|fromUser|toUser/i],
  ['生活/关系', /朋友|关系|沟通|家庭|生活|情绪|压力|喜欢|老师|同学|社团/i],
]

function idFor(value: string) {
  return crypto.createHash('sha1').update(value).digest('hex').slice(0, 16)
}

function decode(buffer: Buffer) {
  if (buffer.length > 4 && buffer[0] === 0xff && buffer[1] === 0xfe) return buffer.subarray(2).toString('utf16le')
  const sample = buffer.subarray(0, Math.min(buffer.length, 4096))
  const zeroOdd = [...sample].filter((byte, index) => index % 2 === 1 && byte === 0).length
  if (sample.length > 100 && zeroOdd / (sample.length / 2) > 0.35) return buffer.toString('utf16le')
  return buffer.toString('utf8')
}

function stripText(raw: string, ext: string) {
  let text = raw.split('\u0000').join('')
  if (/\.html?$/i.test(ext)) {
    text = text
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
  }
  if (/\.json$/i.test(ext)) {
    try {
      text = JSON.stringify(JSON.parse(text), null, 2)
    } catch {
      // Keep the original text if a cache file only looks like JSON.
    }
  }
  return text
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[^\S\r\n]{2,}/g, ' ')
    .trim()
}

function signalsFor(haystack: string) {
  const signals = signalRules.filter(([, pattern]) => pattern.test(haystack)).map(([label]) => label)
  return signals.length ? signals : ['待人工复核']
}

function isBundledCode(file: NonNullable<DeepFileIndex['files']>[number], text: string) {
  const lines = text.split(/\r?\n/).filter(Boolean)
  const tinyLineRatio = lines.length > 100 ? lines.filter((line) => line.trim().length <= 2).length / lines.length : 0
  const longLineRatio = lines.length ? lines.filter((line) => line.length > 600).length / lines.length : 0
  return /\.(js|css)$/i.test(file.ext) && (longLineRatio > 0.15 || tinyLineRatio > 0.7 || noisyPath.test(file.path) || noisyName.test(file.path) || qqProgramResource.test(file.path))
}

function qualityFor(file: NonNullable<DeepFileIndex['files']>[number], text: string, signals: string[]) {
  const lines = text.split(/\r?\n/).filter(Boolean)
  const tinyLineRatio = lines.length > 100 ? lines.filter((line) => line.trim().length <= 2).length / lines.length : 0
  if (isBundledCode(file, text) || noisyPath.test(file.path) || noisyName.test(file.path) || qqProgramResource.test(file.path) || tinyLineRatio > 0.7) return 'low'
  if (signals.some((signal) => ['AI/技术', '哲理/方法', '学业', '创业/项目', '比赛'].includes(signal))) return 'high'
  if (signals.includes('聊天线索') || /[\u4e00-\u9fff]/.test(text)) return 'medium'
  return 'low'
}

function excerptFor(text: string, signals: string[]) {
  const paragraphs = text
    .split(/\n{1,2}/)
    .map((item) => item.trim())
    .filter((item) => item.length > 20)
  const important = paragraphs.find((item) => signalRules.some(([label, pattern]) => signals.includes(label) && pattern.test(item)))
  return (important ?? paragraphs[0] ?? text).slice(0, 900)
}

const deepIndex = readJson<DeepFileIndex>(path.join(dataDir, 'deep-index.json'), {
  generatedAt: new Date(0).toISOString(),
  roots: [],
  totals: {
    files: 0,
    directories: 0,
    bytes: 0,
    databaseCandidates: 0,
    textCandidates: 0,
    mediaCandidates: 0,
    attachmentCandidates: 0,
  },
  extensionStats: [],
  databaseCandidates: [],
  largestFiles: [],
  newestFiles: [],
  files: [],
})

const candidates = (deepIndex.files ?? []).filter((file) => {
  if (!fs.existsSync(file.path)) return false
  if (file.size <= 0 || file.size > maxReadBytes) return false
  return ['text', 'markdown', 'code', 'html', 'json'].includes(file.preview) || textExt.test(file.ext)
})

const extracts: SourceTextExtract[] = []
const signalCounts: Record<string, number> = {}
let readableFiles = 0
let skippedFiles = 0
let totalChars = 0
let chatLikeFiles = 0
const previewCounts: Record<string, number> = {}

for (const file of candidates) {
  try {
    const text = stripText(decode(fs.readFileSync(file.path)), file.ext)
    if (text.length < 20) {
      skippedFiles += 1
      continue
    }
    if (qqProgramResource.test(file.path) && isBundledCode(file, text)) {
      skippedFiles += 1
      continue
    }
    readableFiles += 1
    totalChars += text.length
    previewCounts[file.preview] = (previewCounts[file.preview] ?? 0) + 1
    const signals = signalsFor(text)
    const quality = qualityFor(file, text, signals)
    if (signals.includes('聊天线索')) chatLikeFiles += 1
    for (const signal of signals) signalCounts[signal] = (signalCounts[signal] ?? 0) + 1
    if (quality === 'low' && extracts.length > maxExtracts / 2) continue
    extracts.push({
      id: idFor(file.path),
      path: file.path,
      sourceApp: file.sourceApp as LibraryFile['sourceApp'],
      ext: file.ext,
      preview: file.preview,
      size: file.size,
      modified: file.modified,
      chars: text.length,
      signals,
      quality,
      excerpt: excerptFor(text, signals),
    })
  } catch {
    skippedFiles += 1
  }
}

const qualityRank: Record<SourceTextExtract['quality'], number> = { high: 0, medium: 1, low: 2 }
const index: SourceTextIndex = {
  generatedAt: new Date().toISOString(),
  scannedFiles: candidates.length,
  readableFiles,
  skippedFiles,
  totalChars,
  chatLikeFiles,
  signalCounts,
  previewCounts,
  extracts: extracts
    .sort((a, b) => qualityRank[a.quality] - qualityRank[b.quality] || b.signals.length - a.signals.length || b.chars - a.chars)
    .slice(0, maxExtracts),
}

writeJson(path.join(dataDir, 'source-text-index.json'), index)
fs.writeFileSync(
  path.join(dataDir, 'source-text-index.md'),
  `# 全量源文本洞察

生成时间：${index.generatedAt}

## 覆盖

- 扫描文本候选：${index.scannedFiles}
- 可读文本文件：${index.readableFiles}
- 跳过/失败：${index.skippedFiles}
- 总字符数：${index.totalChars.toLocaleString()}
- 含聊天线索文件：${index.chatLikeFiles}

## 信号分布

${Object.entries(index.signalCounts)
    .sort(([, a], [, b]) => b - a)
    .map(([signal, count]) => `- ${signal}：${count}`)
    .join('\n') || '- 暂无信号。'}

## 代表性摘录

${index.extracts
    .slice(0, 80)
    .map((item) => `### ${item.quality}｜${item.signals.join('、')}｜${item.path}

${item.excerpt}`)
    .join('\n\n') || '暂无摘录。'}
`,
  'utf8',
)

console.log(`Built source text index: ${index.readableFiles}/${index.scannedFiles} readable, ${index.extracts.length} extracts.`)
