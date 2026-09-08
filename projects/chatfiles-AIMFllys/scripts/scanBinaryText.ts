import fs from 'node:fs'
import path from 'node:path'
import { readJsonFile as readJson } from '../pipeline/common/jsonFile.js'
import type { BinaryTextIndex, BinaryTextSnippet, DeepFileIndex } from '../shared/contracts/index.js'
import { dataDir, writeJson } from './shared.js'

function signals(text: string) {
  const out: string[] = []
  if (/聊天|消息|群|好友|发送|接收|撤回|会话|message|msg|chat|talker|sender|receiver/i.test(text)) out.push('聊天线索')
  if (/会议|日程|meeting|calendar|participants|record/i.test(text)) out.push('会议/日程')
  if (/http|https|www\.|\.com|\.cn/i.test(text)) out.push('链接')
  if (/AI|模型|prompt|代码|算法|开发|接口|数据|React|TypeScript|Python/i.test(text)) out.push('技术')
  if (/课程|考试|学分|作业|医学|强基|实验/i.test(text)) out.push('学业')
  if (/创业|项目|产品|比赛|竞赛|商业/i.test(text)) out.push('项目/比赛')
  if (/微信|QQ|WeChat|xwechat|nt_qq|WXWork/i.test(text)) out.push('平台线索')
  return out.length ? out : ['可见文本']
}

function isUseful(text: string) {
  const clean = text.replace(/\s+/g, '')
  if (clean.length < 12) return false
  if (/^[0-9a-f_:\-./\\]{20,}$/i.test(clean)) return false
  if (/(.)\1{12,}/.test(clean)) return false
  return /[\u4e00-\u9fff]/.test(clean) || /message|chat|meeting|wechat|qq|content|http|课程|考试|项目|AI|prompt/i.test(clean)
}

function cleanPreview(text: string) {
  return text.split('\u0000').join('').replace(/\s+/g, ' ').trim().slice(0, 420)
}

function extractFromDecoded(decoded: string, encoding: BinaryTextSnippet['encoding'], chunkOffset: number, filePath: string) {
  const snippets: BinaryTextSnippet[] = []
  const pattern = new RegExp('[\\u4e00-\\u9fffA-Za-z0-9_@#:/?&=.,;，。！？、（）()《》【】\\[\\]+ "\'\\n\\r\\t-]{12,700}', 'g')
  let match: RegExpExecArray | null
  while ((match = pattern.exec(decoded)) && snippets.length < 50) {
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
  const chunkSize = 8 * 1024 * 1024
  const snippets: BinaryTextSnippet[] = []
  try {
    const buffer = Buffer.alloc(chunkSize)
    let offset = 0
    while (offset < stat.size && snippets.length < 80) {
      const bytes = fs.readSync(fd, buffer, 0, chunkSize, offset)
      if (!bytes) break
      const chunk = buffer.subarray(0, bytes)
      snippets.push(...extractFromDecoded(chunk.toString('utf8'), 'utf8', offset, filePath))
      if (snippets.length < 80) snippets.push(...extractFromDecoded(chunk.toString('utf16le'), 'utf16le', offset, filePath))
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
})

const targetFiles = deepIndex.databaseCandidates
  .filter(
    (item) =>
      !item.readable ||
      /message|msg|chat|im_db|nt_msg|fts|group|buddy|wechat|xwechat|wxwork|wemeet|nt_qq/i.test(item.path),
  )
  .slice(0, 120)

const fileSummaries: BinaryTextIndex['files'] = []
const snippets: BinaryTextSnippet[] = []
let scannedBytes = 0

for (const file of targetFiles) {
  if (!fs.existsSync(file.path)) continue
  const found = scanFile(file.path)
  scannedBytes += file.size
  const fileSignals = [...new Set(found.flatMap((item) => item.signals))]
  fileSummaries.push({
    path: file.path,
    size: file.size,
    readableDatabase: file.readable,
    snippets: found.length,
    signals: fileSignals,
  })
  snippets.push(...found.slice(0, 20))
}

const index: BinaryTextIndex = {
  generatedAt: new Date().toISOString(),
  scannedFiles: fileSummaries.length,
  scannedBytes,
  candidateSnippets: snippets.length,
  files: fileSummaries.sort((a, b) => b.snippets - a.snippets || b.size - a.size),
  snippets: snippets
    .sort((a, b) => {
      const chatWeight = Number(b.signals.includes('聊天线索')) - Number(a.signals.includes('聊天线索'))
      return chatWeight || b.chars - a.chars
    })
    .slice(0, 240),
}

writeJson(path.join(dataDir, 'binary-text-index.json'), index)

const report = `# 二进制可见文本扫描

生成时间：${index.generatedAt}

## 总量

- 扫描文件：${index.scannedFiles}
- 扫描体积：${(index.scannedBytes / 1024 / 1024).toFixed(2)} MB
- 候选片段：${index.candidateSnippets}

## 片段最多的文件

${index.files
  .slice(0, 30)
  .map((item) => `- ${item.snippets} 段｜${(item.size / 1024 / 1024).toFixed(2)} MB｜${item.signals.join('、') || '无'}｜${item.path}`)
  .join('\n')}

## 高信号片段

${index.snippets
  .slice(0, 40)
  .map((item) => `- ${item.signals.join('、')}｜${item.encoding}｜${item.path}\n  - ${item.preview}`)
  .join('\n')}
`

fs.writeFileSync(path.join(dataDir, 'binary-text-index.md'), report, 'utf8')
console.log(`Scanned ${index.scannedFiles} files and found ${index.candidateSnippets} visible text snippets.`)
