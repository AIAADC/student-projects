import fs from 'node:fs'
import path from 'node:path'
import { readJsonFile as readJson } from '../pipeline/common/jsonFile.js'
import type { BinaryTextSnippet, DeepFileIndex, LogTextIndex } from '../shared/contracts/index.js'
import { dataDir, writeJson } from './shared.js'

function formatMb(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

function signals(text: string) {
  const out: string[] = []
  if (/聊天|消息|群|好友|发送|接收|撤回|会话|message|msg|chat|talker|sender|receiver|conversation/i.test(text)) out.push('聊天线索')
  if (/会议|日程|meeting|calendar|participants|record/i.test(text)) out.push('会议/日程')
  if (/http|https|www\.|\.com|\.cn/i.test(text)) out.push('链接')
  if (/AI|模型|prompt|代码|算法|开发|接口|数据|React|TypeScript|Python/i.test(text)) out.push('技术')
  if (/课程|考试|学分|作业|医学|强基|实验/i.test(text)) out.push('学业')
  if (/创业|项目|产品|比赛|竞赛|商业/i.test(text)) out.push('项目/比赛')
  if (/微信|QQ|WeChat|xwechat|nt_qq|WXWork|Weixin/i.test(text)) out.push('平台线索')
  return out.length ? out : ['可见文本']
}

function isLikelyNoise(text: string) {
  const compact = text.replace(/\s+/g, '')
  if (compact.length < 12) return true
  if (/^[0-9a-f_:\-./\\]{20,}$/i.test(compact)) return true
  if (/^(true|false|null|undefined|nan|inf)+$/i.test(compact)) return true
  if (/(.)\1{18,}/.test(compact)) return true
  return false
}

function isUseful(text: string) {
  if (isLikelyNoise(text)) return false
  return /[\u4e00-\u9fff]/.test(text) || /message|chat|meeting|wechat|qq|content|http|课程|考试|项目|AI|prompt/i.test(text)
}

function isHighConfidenceChat(text: string) {
  if (!/[\u4e00-\u9fff]/.test(text)) return false
  if (/userAgent|WindowsWechat|MicroMessenger|browser:|cookie|httpdns|权限不足|广告|社群里抢红包|贡献者/i.test(text)) return false
  return /撤回了一条消息|发送者|接收者|消息正文|msgContent|message_content|talker|sender|receiver|fromUser|toUser|wxid_|conversationId|群聊/i.test(text)
}

function cleanPreview(text: string) {
  return text.split('\u0000').join('').replace(/\s+/g, ' ').trim().slice(0, 460)
}

function extractFromDecoded(decoded: string, encoding: BinaryTextSnippet['encoding'], chunkOffset: number, filePath: string) {
  const snippets: BinaryTextSnippet[] = []
  const pattern = new RegExp('[\\u4e00-\\u9fffA-Za-z0-9_@#:/?&=.,;，。！？、（）()《》【】\\[\\]+ "\'\\n\\r\\t-]{12,760}', 'g')
  let match: RegExpExecArray | null
  while ((match = pattern.exec(decoded)) && snippets.length < 70) {
    const preview = cleanPreview(match[0])
    if (!isUseful(preview)) continue
    snippets.push({
      path: filePath,
      encoding,
      offset: chunkOffset + match.index,
      chars: preview.length,
      preview,
      signals: signals(preview),
    })
  }
  return snippets
}

function scanFile(filePath: string) {
  const stat = fs.statSync(filePath)
  const fd = fs.openSync(filePath, 'r')
  const chunkSize = 4 * 1024 * 1024
  const snippets: BinaryTextSnippet[] = []
  try {
    const buffer = Buffer.alloc(chunkSize)
    let offset = 0
    while (offset < stat.size && snippets.length < 90) {
      const bytes = fs.readSync(fd, buffer, 0, chunkSize, offset)
      if (!bytes) break
      const chunk = buffer.subarray(0, bytes)
      snippets.push(...extractFromDecoded(chunk.toString('utf8'), 'utf8', offset, filePath))
      if (snippets.length < 90) snippets.push(...extractFromDecoded(chunk.toString('utf16le'), 'utf16le', offset, filePath))
      offset += Math.max(bytes - 512, 1)
    }
  } finally {
    fs.closeSync(fd)
  }
  const seen = new Set<string>()
  return snippets.filter((item) => {
    const key = `${item.encoding}:${item.preview}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function candidateScore(file: NonNullable<DeepFileIndex['files']>[number]) {
  const text = `${file.path} ${file.ext}`
  let score = 0
  if (/\.(xlog|qqxlog|log|ldb|sst|dat)$/i.test(file.ext)) score += 4
  if (/message|msg|chat|conversation|session|talk|nt_msg|xwechat|wechat|weixin|qq|wxwork/i.test(text)) score += 5
  if (/cache|storage|leveldb|indexeddb|log/i.test(text)) score += 2
  if (/crash|dump|dmp|installer|update|emoji|image|thumb|video/i.test(text)) score -= 3
  if (file.size > 80 * 1024 * 1024) score -= 2
  return score
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

const candidates = (deepIndex.files ?? [])
  .filter((file) => /\.(xlog|qqxlog|log|ldb|sst|dat)$/i.test(file.ext))
  .filter((file) => /Tencent|WeChat|Weixin|xwechat|nt_qq|WXWork|QQ/i.test(file.path))
  .filter((file) => file.size > 0 && file.size <= 160 * 1024 * 1024)
  .map((file) => ({ file, score: candidateScore(file) }))
  .filter((item) => item.score > 0)
  .sort((a, b) => b.score - a.score || b.file.size - a.file.size)
  .slice(0, 220)

const fileSummaries: LogTextIndex['files'] = []
const snippets: BinaryTextSnippet[] = []
let scannedBytes = 0

for (const { file } of candidates) {
  if (!fs.existsSync(file.path)) continue
  const found = scanFile(file.path)
  scannedBytes += file.size
  const fileSignals = [...new Set(found.flatMap((item) => item.signals))]
  fileSummaries.push({
    path: file.path,
    size: file.size,
    modified: file.modified,
    ext: file.ext,
    sourceApp: file.sourceApp,
    snippets: found.length,
    signals: fileSignals,
  })
  snippets.push(...found.slice(0, 24))
}

const sortedSnippets = snippets
  .sort((a, b) => {
    const chatWeight = Number(isHighConfidenceChat(b.preview)) - Number(isHighConfidenceChat(a.preview))
    const signalWeight = b.signals.length - a.signals.length
    return chatWeight || signalWeight || b.chars - a.chars
  })
  .slice(0, 260)

const index: LogTextIndex = {
  generatedAt: new Date().toISOString(),
  scannedFiles: fileSummaries.length,
  scannedBytes,
  candidateFiles: candidates.length,
  candidateSnippets: sortedSnippets.length,
  highConfidenceChatSnippets: sortedSnippets.filter((item) => isHighConfidenceChat(item.preview)).length,
  files: fileSummaries.sort((a, b) => b.snippets - a.snippets || b.size - a.size),
  snippets: sortedSnippets,
}

writeJson(path.join(dataDir, 'log-text-index.json'), index)

const report = `# 日志缓存可见文本扫描

生成时间：${index.generatedAt}

## 总量

- 候选日志/缓存文件：${index.candidateFiles}
- 实际扫描文件：${index.scannedFiles}
- 扫描体积：${formatMb(index.scannedBytes)}
- 候选片段：${index.candidateSnippets}
- 高置信聊天正文片段：${index.highConfidenceChatSnippets}

## 片段最多的文件

${index.files
  .slice(0, 35)
  .map((item) => `- ${item.snippets} 段｜${formatMb(item.size)}｜${item.sourceApp}｜${item.signals.join('、') || '无'}｜${item.path}`)
  .join('\n')}

## 高信号片段

${index.snippets
  .slice(0, 45)
  .map((item) => `- ${item.signals.join('、')}｜${item.encoding}｜${item.path}\n  - ${item.preview}`)
  .join('\n')}
`

fs.writeFileSync(path.join(dataDir, 'log-text-index.md'), report, 'utf8')
console.log(`Scanned ${index.scannedFiles} log/cache files and found ${index.candidateSnippets} visible snippets.`)
