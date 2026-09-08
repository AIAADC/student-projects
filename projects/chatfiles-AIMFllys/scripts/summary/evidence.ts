import fs from 'node:fs'
import path from 'node:path'
import type { LibraryFile, TextExtract } from '../../shared/contracts/index.js'
import { root } from '../shared.js'
import type { SummaryData } from './types.js'
import { auditStatusLabel, formatMb, qualityLabel } from './utils.js'

export function textSignals(text: string, file: LibraryFile) {
  const lines = text.split(/\r?\n/).filter(Boolean)
  const mostlySingleCharacterLines = lines.length > 200 && lines.filter((line) => line.trim().length <= 2).length / lines.length > 0.75
  if (/sohu_simp|dict|dictionary|词库/i.test(file.name) || mostlySingleCharacterLines) return ['词库/字典', '低价值文本']
  const haystack = `${file.name}\n${file.archivePath}\n${text}`
  const signals: string[] = []
  const rules: Array<[string, RegExp]> = [
    ['AI/技术', /ai|llm|prompt|模型|代码|算法|开发|架构|接口|数据|python|typescript|react|openai|claude/i],
    ['哲理/方法', /哲学|意义|价值|原则|方法|思考|复盘|成长|判断|选择|长期|系统/i],
    ['学业', /课程|考试|复习|基医|强基|医学|学分|作业|实验|高数|化学|英语/i],
    ['创业/项目', /创业|商业|产品|用户|市场|融资|项目|计划|需求|运营/i],
    ['比赛', /比赛|竞赛|挑战杯|大创|建模|赛/i],
    ['生活/关系', /朋友|同学|老师|家庭|生活|旅行|聚会|情绪|睡眠/i],
  ]
  for (const [label, pattern] of rules) {
    if (pattern.test(haystack)) signals.push(label)
  }
  return signals.length ? signals : ['待人工复核']
}

function cleanExcerpt(text: string) {
  return text
    .split('\u0000')
    .join('')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, 2400)
}

export function readTextExtract(file: LibraryFile): TextExtract | undefined {
  if (!['text', 'markdown', 'code', 'html', 'json'].includes(file.preview)) return undefined
  const target = path.join(root, file.archivePath)
  if (!fs.existsSync(target) || fs.statSync(target).size > 2 * 1024 * 1024) return undefined
  try {
    const text = fs.readFileSync(target, 'utf8')
    const excerpt = cleanExcerpt(text)
    if (!excerpt) return undefined
    return {
      id: file.id,
      title: file.name,
      sourcePath: file.sourcePath,
      archivePath: file.archivePath,
      sourceApp: file.sourceApp,
      chars: text.length,
      signals: textSignals(text, file),
      excerpt,
    }
  } catch {
    return undefined
  }
}

export function buildEvidenceTexts(data: SummaryData, textExtracts: TextExtract[]) {
  const { chatExportIndex, chatClueDossier, sourceTextIndex, logTextIndex, discovery, completionAudit } = data

  const textEvidence = textExtracts.length
    ? textExtracts
        .map((item) => `- ${item.title}：${item.signals.join('、')}；${item.chars.toLocaleString()} 字符；来源 ${item.sourceApp}`)
        .join('\n')
    : '- 当前没有可直接读取的聊天文本导出；已读到的内容主要来自附件文件名、课程数据和数据库/目录元信息。'

  const chatExportCandidates = chatExportIndex.candidateFiles
  const chatExportSignalTotals = chatExportIndex.conversations.reduce<Record<string, number>>((acc, conversation) => {
    for (const [label, count] of Object.entries(conversation.signalCounts)) {
      acc[label] = (acc[label] ?? 0) + count
    }
    return acc
  }, {})
  const chatExportSignalText =
    Object.entries(chatExportSignalTotals)
      .sort(([, a], [, b]) => b - a)
      .map(([label, count]) => `- ${label}：${count} 条`)
      .join('\n') || '- 暂无可统计的导出消息信号。'
  const chatExportConversationText =
    chatExportIndex.conversations
      .slice(0, 12)
      .map(
        (conversation) => `### ${conversation.title}

- 消息：${conversation.messageCount}
- 参与者：${conversation.participants.join('、') || '未知'}
- 来源：${conversation.sourcePaths.join('；')}
- 信号：${Object.entries(conversation.signalCounts)
          .sort(([, a], [, b]) => b - a)
          .map(([label, count]) => `${label} ${count}`)
          .join('、') || '无'}

${conversation.highlights
  .slice(0, 8)
  .map((message) => `- ${message.timestamp ?? '无时间'}｜${message.sender}｜${message.signals.join('、')}：${message.content.slice(0, 180)}`)
  .join('\n') || '- 暂无高亮信息。'}`,
      )
      .join('\n\n')
  const chatExportCandidateText =
    chatExportCandidates
      .slice(0, 20)
      .map((item) => `- ${item.accepted ? '接受' : '跳过'}｜${item.parsedMessages} 条｜${item.reason}｜${item.path}`)
      .join('\n') || '- 暂未发现候选聊天导出文件。'

  const chatClueSourceTypeText =
    Object.entries(chatClueDossier.totals.bySourceType)
      .sort(([, a], [, b]) => b - a)
      .map(([label, count]) => `- ${label}：${count} 组`)
      .join('\n') || '- 暂无线索组。'
  const chatClueAppText =
    Object.entries(chatClueDossier.totals.bySourceApp)
      .sort(([, a], [, b]) => b - a)
      .map(([label, count]) => `- ${label}：${count} 组`)
      .join('\n') || '- 暂无来源应用统计。'
  const chatClueSignalText =
    Object.entries(chatClueDossier.totals.bySignal)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 12)
      .map(([label, count]) => `- ${label}：${count} 组`)
      .join('\n') || '- 暂无线号。'
  const chatClueGroupText =
    chatClueDossier.groups
      .slice(0, 18)
      .map((item) => `### ${item.value === 'high' ? '高' : item.value === 'medium' ? '中' : '低'}｜${item.score}｜${item.sourceType}｜${item.sourceApp}

\`${item.path}\`

- 信号：${item.signals.join('、') || '无'}
- 判读：${item.verdict}
- 下一步：${item.next}

${item.excerpts
  .slice(0, 3)
  .map((excerpt) => `> ${excerpt}`)
  .join('\n\n')}`)
      .join('\n\n') || '- 尚无可聚合聊天线索。'

  const sourceTextSignalText =
    Object.entries(sourceTextIndex.signalCounts)
      .sort(([, a], [, b]) => b - a)
      .map(([signal, count]) => `- ${signal}：${count} 个文件`)
      .join('\n') || '- 暂无源文本信号。'
  const sourceTextPreviewText =
    Object.entries(sourceTextIndex.previewCounts ?? {})
      .sort(([, a], [, b]) => b - a)
      .map(([preview, count]) => `- ${preview}：${count} 个文件`)
      .join('\n') || '- 暂无按预览类型统计。'
  const sourceTextExtractText =
    sourceTextIndex.extracts
      .filter((item) => item.quality !== 'low')
      .slice(0, 18)
      .map((item) => `### ${qualityLabel(item.quality)}｜${item.preview ?? (item.ext || 'text')}｜${item.signals.join('、')}｜${item.path}

${item.excerpt}`)
      .join('\n\n') || '- 没有足够强的源文本摘录；当前可读文本主要是程序资源、配置和缓存。'
  const sourceTextChatLikeText =
    sourceTextIndex.extracts
      .filter((item) => item.signals.includes('聊天线索'))
      .slice(0, 12)
      .map((item) => `- ${qualityLabel(item.quality)}｜${item.preview ?? (item.ext || 'text')}｜${item.path}\n  - ${item.excerpt.slice(0, 220)}`)
      .join('\n') || '- 源文本摘录中暂未出现可直接整理为聊天正文的连续内容。'

  const logSignalCounts = logTextIndex.snippets.reduce<Record<string, number>>((acc, item) => {
    for (const signal of item.signals) acc[signal] = (acc[signal] ?? 0) + 1
    return acc
  }, {})
  const logSignalText =
    Object.entries(logSignalCounts)
      .sort(([, a], [, b]) => b - a)
      .map(([signal, count]) => `- ${signal}：${count} 段`)
      .join('\n') || '- 暂无日志/缓存片段。'
  const logPathCounts = new Map<string, number>()
  const logDisplaySnippets = [
    ...logTextIndex.snippets.filter((item) => !/userAgent|slotid|publisher_appid|traceid|httpdns|cookie/i.test(item.preview)),
    ...logTextIndex.snippets,
  ].filter((item) => {
    const count = logPathCounts.get(item.path) ?? 0
    if (count >= 2) return false
    logPathCounts.set(item.path, count + 1)
    return true
  })
  const logSnippetText =
    logDisplaySnippets
      .slice(0, 16)
      .map((item) => `- ${item.signals.join('、')}｜${item.encoding}｜${item.path}\n  - ${item.preview.slice(0, 260)}`)
      .join('\n') || '- 没有抽取到可展示片段。'

  const coverageRootText =
    discovery.roots
      .map((item) => `| ${item.exists ? '已找到' : '未找到'} | ${item.candidateCount.toLocaleString()} | ${formatMb(item.candidateBytes)} | ${item.path} | ${item.note} |`)
      .join('\n') || '| - | - | - | - | - |'
  const coverageDirectoryText =
    discovery.directoryMap
      .map((item) => `| ${item.exists ? '已找到' : '未找到'} | ${item.focus} | ${item.files.toLocaleString()} | ${formatMb(item.bytes)} | ${item.newest ?? '无'} | ${item.path} |`)
      .join('\n') || '| - | - | - | - | - | - |'
  const coverageWideMatchText =
    (discovery.wideMatches ?? [])
      .map((item) => `| ${item.focus} | ${item.files.toLocaleString()} | ${formatMb(item.bytes)} | ${item.depth} | ${item.newest ?? '无'} | ${item.path} |`)
      .join('\n') || '| - | - | - | - | - | - |'
  const coverageConclusionText = `- QQ NT 主消息库、群/好友 FTS、聊天文件库均已定位；当前普通 SQLite 不可直接读取，二进制扫描只找到结构/索引/平台片段，未形成连续聊天正文。
- 新版微信 xwechat、roam、radium/users、WeChat 旧目录和临时目录均已登记；传统 Documents\\WeChat Files 不存在，xwechat 需要官方导出或已解密副本才能稳定获得原文。
- 企业微信/WXWork 和 WeMeet 中发现大量日志、会议、邮箱、WebView 与平台缓存，可作为旁证和资料来源，但不能直接等同私人聊天正文。
- 当前能继续自动做的是只读索引、预览、片段归档和富文本证据总结；原文级“按群/人物整理”仍需要可解析聊天导出或解密后的数据库副本。`

  const auditItemText =
    completionAudit.items
      .map((item) => `### ${auditStatusLabel(item.status)}｜${item.title}

${item.detail}

证据：${item.evidence.join('；')}

下一步：${item.next}`)
      .join('\n\n') || '- 完成度审计尚未生成。'

  return {
    textEvidence,
    chatExportSignalText,
    chatExportConversationText,
    chatExportCandidateText,
    chatClueSourceTypeText,
    chatClueAppText,
    chatClueSignalText,
    chatClueGroupText,
    sourceTextSignalText,
    sourceTextPreviewText,
    sourceTextExtractText,
    sourceTextChatLikeText,
    logSignalText,
    logSnippetText,
    coverageRootText,
    coverageDirectoryText,
    coverageWideMatchText,
    coverageConclusionText,
    auditItemText,
    chatExportCandidates,
  }
}
