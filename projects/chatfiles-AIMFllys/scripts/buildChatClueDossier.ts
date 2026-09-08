import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { readJsonFile as readJson } from '../pipeline/common/jsonFile.js'
import type {
  BinaryTextIndex,
  BinaryTextSnippet,
  ChatClueDossier,
  ChatClueGroup,
  ChatExportIndex,
  LibraryFile,
  LogTextIndex,
  SourceTextIndex,
} from '../shared/contracts/index.js'
import { dataDir, sourceApp, writeJson } from './shared.js'

type DraftGroup = Omit<ChatClueGroup, 'score' | 'value' | 'signals' | 'snippetCount' | 'verdict' | 'next' | 'excerpts'> & {
  signals: Set<string>
  excerpts: string[]
}

function idFor(value: string) {
  return crypto.createHash('sha1').update(value).digest('hex').slice(0, 16)
}

function countBy(items: string[]) {
  return items.reduce<Record<string, number>>((acc, item) => {
    acc[item] = (acc[item] ?? 0) + 1
    return acc
  }, {})
}

function cleanExcerpt(value: string) {
  return value
    .split('\u0000')
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 360)
}

function isPlatformNoise(text: string) {
  return /userAgent|WindowsWechat|MicroMessenger|httpdns|cookie|slotid|traceid|browser:|log_version|CREATE TABLE|hookWx|GetWechatInfo|message_loop|messagecenter|errmsg|errcode|beacon/i.test(text)
}

function scoreSnippet(snippet: Pick<BinaryTextSnippet, 'signals' | 'preview'>) {
  let score = 0
  if (snippet.signals.includes('聊天线索')) score += 5
  if (snippet.signals.includes('学业')) score += 4
  if (snippet.signals.includes('AI/技术') || snippet.signals.includes('技术')) score += 3
  if (snippet.signals.includes('项目/比赛') || snippet.signals.includes('创业/项目')) score += 3
  if (snippet.signals.includes('会议/日程')) score += 2
  if (/[\u4e00-\u9fff]/.test(snippet.preview)) score += 2
  if (/nt_msg|group_msg|buddy_msg|xwechat|wechat|wxwork|qq/i.test(snippet.preview)) score += 1
  if (isPlatformNoise(snippet.preview)) score -= 3
  return score
}

function valueFor(score: number) {
  if (score >= 12) return 'high'
  if (score >= 6) return 'medium'
  return 'low'
}

function sourceAppForPath(filePath: string): LibraryFile['sourceApp'] {
  return sourceApp(filePath)
}

function ensureGroup(map: Map<string, DraftGroup>, sourceType: ChatClueGroup['sourceType'], filePath: string) {
  const key = `${sourceType}|${filePath}`
  const existing = map.get(key)
  if (existing) return existing
  const group: DraftGroup = {
    id: idFor(key),
    sourceType,
    sourceApp: sourceAppForPath(filePath),
    path: filePath,
    signals: new Set<string>(),
    excerpts: [],
  }
  map.set(key, group)
  return group
}

function addSnippet(
  map: Map<string, DraftGroup>,
  sourceType: ChatClueGroup['sourceType'],
  filePath: string,
  signals: string[],
  preview: string,
) {
  const clean = cleanExcerpt(preview)
  if (!clean) return
  const group = ensureGroup(map, sourceType, filePath)
  for (const signal of signals) group.signals.add(signal)
  if (!group.excerpts.includes(clean) && group.excerpts.length < 8) group.excerpts.push(clean)
}

function verdictFor(group: Omit<ChatClueGroup, 'verdict' | 'next'>) {
  const text = `${group.path}\n${group.excerpts.join('\n')}`
  if (group.sourceType === '聊天导出') return '可直接进入人物/群组级聊天总结。'
  if (/nt_msg|group_msg|buddy_msg|fts|file_assistant/i.test(group.path)) return 'QQ NT 重点消息库或索引候选；当前只能证明存在封装/索引线索，不能把片段当完整聊天正文。'
  if (/xwechat|radium|weixin/i.test(group.path)) return '微信/xwechat WebView、缓存或小程序数据线索；可作为访问痕迹和上下文旁证。'
  if (/WXWork|WeMeet/i.test(group.path)) return '企业微信/腾讯会议日志或数据库线索；多数是会议、WebView、邮箱或平台行为，不等同于私人聊天正文。'
  if (group.signals.includes('学业')) return '含学业相关可读线索，适合进入资料复核和课程行动整理。'
  if (group.signals.includes('技术') || group.signals.includes('AI/技术')) return '含技术/API/配置线索，适合作为技术价值材料复核。'
  if (isPlatformNoise(text)) return '主要是平台日志、广告、埋点或资源加载痕迹，只保留为探索证据。'
  return '保留为聊天/内容候选线索，需结合源文件右侧预览继续复核。'
}

function nextFor(group: Omit<ChatClueGroup, 'verdict' | 'next'>) {
  if (group.sourceType === '聊天导出') return '已可按会话继续汇总高价值内容。'
  if (/nt_msg|group_msg|buddy_msg|xwechat|wechat/i.test(group.path)) return '继续只读保存证据；若后续获得官方导出或已解密副本，再做原文级整理。'
  if (group.value === 'high') return '优先在文件板块打开源文件，结合右侧预览确认是否为真实个人内容。'
  return '低风险保留在档案中，避免误判为聊天正文。'
}

const binaryTextIndex = readJson<BinaryTextIndex>(path.join(dataDir, 'binary-text-index.json'), {
  generatedAt: new Date(0).toISOString(),
  scannedFiles: 0,
  scannedBytes: 0,
  candidateSnippets: 0,
  files: [],
  snippets: [],
})
const logTextIndex = readJson<LogTextIndex>(path.join(dataDir, 'log-text-index.json'), {
  generatedAt: new Date(0).toISOString(),
  scannedFiles: 0,
  scannedBytes: 0,
  candidateFiles: 0,
  candidateSnippets: 0,
  highConfidenceChatSnippets: 0,
  files: [],
  snippets: [],
})
const sourceTextIndex = readJson<SourceTextIndex>(path.join(dataDir, 'source-text-index.json'), {
  generatedAt: new Date(0).toISOString(),
  scannedFiles: 0,
  readableFiles: 0,
  skippedFiles: 0,
  totalChars: 0,
  chatLikeFiles: 0,
  signalCounts: {},
  extracts: [],
})
const chatExportIndex = readJson<ChatExportIndex>(path.join(dataDir, 'chat-export-index.json'), {
  generatedAt: new Date(0).toISOString(),
  importDir: path.join(process.cwd(), 'imports', 'chat-exports'),
  searchedRoots: [],
  candidateFiles: [],
  totals: { sources: 0, conversations: 0, messages: 0, participants: 0, highlights: 0 },
  conversations: [],
})

const groups = new Map<string, DraftGroup>()

for (const snippet of binaryTextIndex.snippets) {
  if (!snippet.signals.some((signal) => signal !== '可见文本') && !/nt_msg|msg|chat|xwechat|wechat|qq/i.test(snippet.path)) continue
  addSnippet(groups, '数据库/索引片段', snippet.path, snippet.signals, snippet.preview)
}

for (const snippet of logTextIndex.snippets) {
  if (!snippet.signals.includes('聊天线索') && !snippet.signals.includes('学业') && !snippet.signals.includes('项目/比赛')) continue
  addSnippet(groups, '日志/缓存片段', snippet.path, snippet.signals, snippet.preview)
}

for (const extract of sourceTextIndex.extracts) {
  if (!extract.signals.some((signal) => ['聊天线索', '学业', 'AI/技术', '哲理/方法', '创业/项目', '比赛', '生活/关系'].includes(signal))) continue
  addSnippet(groups, '可读源文本', extract.path, extract.signals, extract.excerpt)
}

for (const conversation of chatExportIndex.conversations) {
  for (const sourcePath of conversation.sourcePaths) {
    const group = ensureGroup(groups, '聊天导出', sourcePath)
    for (const signal of Object.keys(conversation.signalCounts)) group.signals.add(signal)
    for (const message of conversation.highlights.slice(0, 8)) {
      const excerpt = cleanExcerpt(`${message.timestamp ?? '无时间'}｜${message.sender}：${message.content}`)
      if (excerpt && !group.excerpts.includes(excerpt)) group.excerpts.push(excerpt)
    }
  }
}

const finalized: ChatClueGroup[] = [...groups.values()]
  .map((group) => {
    const signals = [...group.signals].sort((a, b) => a.localeCompare(b, 'zh-CN'))
    const score =
      group.excerpts.reduce((sum, excerpt) => sum + scoreSnippet({ signals, preview: excerpt }), 0) +
      (group.sourceType === '聊天导出' ? 20 : 0) +
      Math.min(group.excerpts.length, 8)
    const partial = {
      ...group,
      score,
      value: valueFor(score),
      signals,
      snippetCount: group.excerpts.length,
      excerpts: group.excerpts,
    } satisfies Omit<ChatClueGroup, 'verdict' | 'next'>
    return {
      ...partial,
      verdict: verdictFor(partial),
      next: nextFor(partial),
    }
  })
  .sort((a, b) => b.score - a.score || b.snippetCount - a.snippetCount || a.path.localeCompare(b.path, 'zh-CN'))

const dossier: ChatClueDossier = {
  generatedAt: new Date().toISOString(),
  totals: {
    groups: finalized.length,
    snippets: finalized.reduce((sum, item) => sum + item.snippetCount, 0),
    highValueGroups: finalized.filter((item) => item.value === 'high').length,
    chatExportMessages: chatExportIndex.totals.messages,
    bySourceType: countBy(finalized.map((item) => item.sourceType)),
    bySourceApp: countBy(finalized.map((item) => item.sourceApp)),
    bySignal: countBy(finalized.flatMap((item) => item.signals)),
  },
  groups: finalized.slice(0, 160),
}

writeJson(path.join(dataDir, 'chat-clue-dossier.json'), dossier)
fs.writeFileSync(
  path.join(dataDir, 'chat-clue-dossier.md'),
  `# 聊天线索档案

生成时间：${dossier.generatedAt}

## 覆盖

- 线索组：${dossier.totals.groups}
- 片段：${dossier.totals.snippets}
- 高价值组：${dossier.totals.highValueGroups}
- 已接受聊天导出消息：${dossier.totals.chatExportMessages}

## 来源类型

${Object.entries(dossier.totals.bySourceType)
    .map(([label, count]) => `- ${label}：${count}`)
    .join('\n') || '- 暂无。'}

## 来源应用

${Object.entries(dossier.totals.bySourceApp)
    .map(([label, count]) => `- ${label}：${count}`)
    .join('\n') || '- 暂无。'}

## 信号分布

${Object.entries(dossier.totals.bySignal)
    .sort(([, a], [, b]) => b - a)
    .map(([label, count]) => `- ${label}：${count}`)
    .join('\n') || '- 暂无。'}

## 高分线索

${dossier.groups
    .slice(0, 60)
    .map(
      (item) => `### ${item.value}｜${item.score}｜${item.sourceType}｜${item.sourceApp}

${item.path}

- 信号：${item.signals.join('、') || '无'}
- 判读：${item.verdict}
- 下一步：${item.next}

${item.excerpts.map((excerpt) => `> ${excerpt}`).join('\n\n')}`,
    )
    .join('\n\n') || '暂无线索。'}
`,
  'utf8',
)

console.log(`Built chat clue dossier: ${dossier.totals.groups} groups, ${dossier.totals.snippets} snippets.`)
