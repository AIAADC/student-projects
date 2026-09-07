import type { ChatSummary } from '../../../shared/contracts/index.js'
import type { SummaryContext } from '../types.js'
import { formatMb } from '../utils.js'

export function buildOverviewBoards(ctx: SummaryContext): ChatSummary['boards'] {
  const {
    manifest,
    discovery,
    deepIndex,
    binaryTextIndex,
    logTextIndex,
    chatClueDossier,
    chatExportIndex,
    sourceTextIndex,
    completionAudit,
    textExtracts,
    valuableTextExtracts,
    highSignalBinarySnippets,
    chatExportCandidates,
    acceptedChatExportCandidates,
    byApp,
    byCategory,
    auditItemText,
  } = ctx

  return [
    {
      id: 'executive-overview',
      title: '总览：现在掌握了什么',
      scope: '全局',
      priority: 'high',
      tags: ['总览', '进度', '证据'],
      evidence: ['data/library.json', 'data/source-discovery.json', 'data/chat-export-index.json', 'data/knowledge.json'],
      content: `## 当前总览

- 已归档可访问微信/QQ/企业微信文件：${manifest.stats.archived} 个，${formatMb(manifest.stats.bytes)}。
- 全目录只读索引看到文件：${deepIndex.totals.files} 个，${formatMb(deepIndex.totals.bytes)}，目录 ${deepIndex.totals.directories} 个。
- 已探索存在的数据源根目录：${discovery.roots.filter((item) => item.exists).length} 个；重点目录地图：${discovery.directoryMap.filter((item) => item.exists).length} 个。
- 已定位数据库/索引候选：${deepIndex.totals.databaseCandidates || discovery.databases.filter((item) => item.exists).length} 个；普通 SQLite 可直接读取：${deepIndex.databaseCandidates.filter((item) => item.readable).length || discovery.databases.filter((item) => item.readable).length} 个。
- 可直接抽取文本的归档文件：${textExtracts.length} 个；其中可作为关键内容候选：${valuableTextExtracts.length} 个。
- 不可读数据库/索引二进制明文片段：${binaryTextIndex.candidateSnippets} 段；高置信聊天正文片段：${highSignalBinarySnippets.length} 段。
- 日志/缓存扫描：${logTextIndex.scannedFiles} 个文件，${formatMb(logTextIndex.scannedBytes)}，可见片段 ${logTextIndex.candidateSnippets} 段；高置信聊天正文片段 ${logTextIndex.highConfidenceChatSnippets} 段。
- 聚合聊天线索档案：${chatClueDossier.totals.groups} 组，${chatClueDossier.totals.snippets} 段，高价值 ${chatClueDossier.totals.highValueGroups} 组。
- 聊天导出候选：${chatExportCandidates.length} 个；已接受来源：${acceptedChatExportCandidates.length} 个；可整理导出消息：${chatExportIndex.totals.messages} 条。
- 全量源文本可读文件：${sourceTextIndex.readableFiles} 个；含聊天字段线索：${sourceTextIndex.chatLikeFiles} 个；代表性摘录：${sourceTextIndex.extracts.length} 条。
- 完成度审计：已证明 ${completionAudit.totals.proved} 项，部分完成 ${completionAudit.totals.partial} 项，需要外部输入 ${completionAudit.totals.needsInput} 项。

## 文件来源

${Object.entries(byApp)
  .map(([app, count]) => `- ${app}：${count} 个`)
  .join('\n')}

## 顶级板块分布

${Object.entries(byCategory)
  .sort(([a], [b]) => a.localeCompare(b, 'zh-CN'))
  .map(([category, count]) => `- ${category}：${count} 个`)
  .join('\n')}
`,
    },
    {
      id: 'completion-audit',
      title: '目标完成度审计',
      scope: '逐项证据',
      priority: 'high',
      tags: ['审计', '证据', '缺口'],
      evidence: ['data/completion-audit.json', 'data/completion-audit.md', 'scripts/buildCompletionAudit.ts'],
      content: `## 汇总

- 已证明：${completionAudit.totals.proved}
- 部分完成：${completionAudit.totals.partial}
- 需要外部输入：${completionAudit.totals.needsInput}
- 未证明：${completionAudit.totals.notProved}

## 判定原则

这个板块只按当前文件、命令输出和数据索引给结论；无法从普通 SQLite 或可见文本稳定取出的微信/QQ正文，不会被伪装成“已整理”。所有缺口都保留下一步动作。

## 逐项审计

${auditItemText}
`,
    },
  ]
}
