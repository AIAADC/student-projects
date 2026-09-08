import type { ChatSummary } from '../../../shared/contracts/index.js'
import type { SummaryContext } from '../types.js'
import { formatMb } from '../utils.js'

export function buildChatBoards(ctx: SummaryContext): ChatSummary['boards'] {
  const {
    chatClueDossier,
    chatExportIndex,
    chatExportCandidates,
    acceptedChatExportCandidates,
    chatClueSourceTypeText,
    chatClueAppText,
    chatClueSignalText,
    chatClueGroupText,
    chatExportSignalText,
    chatExportConversationText,
    chatExportCandidateText,
    discovery,
    deepIndex,
    blockedDbs,
    extractionBoundary,
  } = ctx

  return [
    {
      id: 'chat-clue-dossier',
      title: '聊天线索档案',
      scope: '聊天导出 / 数据库片段 / 日志缓存 / 可读源文本',
      priority: 'high',
      tags: ['聊天线索', '富文本汇总', '证据分层'],
      evidence: ['data/chat-clue-dossier.json', 'data/binary-text-index.json', 'data/log-text-index.json', 'data/source-text-index.json', 'data/chat-export-index.json'],
      content: `## 聚合结论

- 线索组：${chatClueDossier.totals.groups}
- 片段：${chatClueDossier.totals.snippets}
- 高价值组：${chatClueDossier.totals.highValueGroups}
- 已接受聊天导出消息：${chatClueDossier.totals.chatExportMessages}

这个板块把分散在数据库/索引可见字符串、日志缓存、可读源文本、聊天导出中的线索合并到同一个证据档案。它用于回答“哪里像聊天、哪里只是平台痕迹、哪里值得继续点开复核”，不会把缓存或埋点伪装成完整聊天正文。

## 来源类型

${chatClueSourceTypeText}

## 来源应用

${chatClueAppText}

## 信号分布

${chatClueSignalText}

## 优先复核线索

${chatClueGroupText}
`,
    },
    {
      id: 'extraction-boundary',
      title: '聊天正文提取边界与下一步',
      scope: 'QQNT / xwechat / 解密边界',
      priority: 'high',
      tags: ['聊天记录', '边界', '只读'],
      evidence: [
        'data/extraction-boundary.json',
        'data/extraction-boundary.md',
        ...extractionBoundary.localFacts.flatMap((item) => item.evidence),
        ...extractionBoundary.webFindings.map((item) => item.url),
      ],
      content: `## 本机事实

${extractionBoundary.localFacts.map((item) => `- ${item.title}：${item.detail}`).join('\n') || '- 尚未记录额外边界事实。'}

## 外部线索

${extractionBoundary.webFindings.map((item) => `- ${item.title}：${item.detail}（${item.url}）`).join('\n') || '- 尚未记录外部线索。'}

## 当前决策

${extractionBoundary.decisions.map((item) => `- ${item}`).join('\n') || '- 继续只读探索，不破坏原始数据库。'}`,
    },
    {
      id: 'chat-record-boundary',
      title: '聊天记录探索结论',
      scope: '微信 / QQ',
      priority: 'high',
      tags: ['聊天记录', '数据库', '不可破坏'],
      evidence: blockedDbs.map((item) => item.path),
      content: `## 已探索到的聊天记录/索引位置

${deepIndex.databaseCandidates.length
  ? deepIndex.databaseCandidates
      .slice(0, 30)
      .map((item) => `- ${item.readable ? '可读' : '不可读'}：${item.path}
  - 大小：${formatMb(item.size)}
  - 细节：${item.detail}`)
      .join('\n')
  : discovery.databases
      .map((item) => `- ${item.exists ? '已定位' : '未找到'}：${item.path}
  - 状态：${item.readable ? '普通 SQLite 可读' : '普通 SQLite 不可直接读取'}
  - 细节：${item.detail}`)
      .join('\n')}

## 关键结论

QQ NT 数据库文件头显示为 SQLite 形态但带 QQ_NT 标记，Node SQLite 返回 \`file is not a database\`。新版微信 xwechat 目录存在 roam 和数据库候选，但当前没有可稳定提取正文的明文库。为了遵守“禁止删除任何对话记录和文件”，项目只做只读探测和副本归档，没有对原始数据库做修改、重写或破解式写入。`,
    },
    {
      id: 'chat-export-ingest',
      title: '聊天导出导入与人物/群组总结',
      scope: '微信 / QQ 导出文本',
      priority: chatExportIndex.totals.messages ? 'high' : 'medium',
      tags: ['聊天导出', '人物群组', '富文本'],
      evidence: ['data/chat-export-index.json', 'data/chat-export-index.md', ...acceptedChatExportCandidates.map((item) => item.path)],
      content: `## 导入状态

- 导入目录：${chatExportIndex.importDir}
- 搜索根目录：${chatExportIndex.searchedRoots.join('；') || '暂无'}
- 候选文件：${chatExportCandidates.length}
- 已接受来源：${chatExportIndex.totals.sources}
- 会话：${chatExportIndex.totals.conversations}
- 消息：${chatExportIndex.totals.messages}
- 参与者：${chatExportIndex.totals.participants}

## 结论

${chatExportIndex.totals.messages
  ? '已发现可稳定解析的聊天导出内容，并按人物/群组生成下列摘要。后续把新的微信/QQ导出 txt、csv、json、html 放进导入目录后，运行 ingest 会继续增量纳入。'
  : `本轮没有发现可稳定解析为聊天正文的官方/手动导出文件。已创建导入目录 \`${chatExportIndex.importDir}\`；把微信或 QQ 的 txt/csv/json/html 聊天导出放进去后，网站会按人物/群组继续整理。`}

## 信号分布

${chatExportSignalText}

## 人物/群组

${chatExportConversationText || '- 暂无可整理会话。'}

## 候选文件

${chatExportCandidateText}
`,
    },
  ]
}
