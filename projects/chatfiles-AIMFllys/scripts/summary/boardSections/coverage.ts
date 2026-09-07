import type { ChatSummary } from '../../../shared/contracts/index.js'
import type { SummaryContext } from '../types.js'
import { formatMb } from '../utils.js'

export function buildCoverageBoards(ctx: SummaryContext): ChatSummary['boards'] {
  const {
    deepIndex,
    coverageConclusionText,
    coverageRootText,
    coverageDirectoryText,
    coverageWideMatchText,
    coverageDatabaseText,
    binaryTextIndex,
    highSignalBinarySnippets,
    logTextIndex,
    logSignalText,
    logSnippetText,
    sourceTextIndex,
    sourceTextSignalText,
    sourceTextPreviewText,
    sourceTextChatLikeText,
    sourceTextExtractText,
    databaseAnalysis,
  } = ctx

  return [
    {
      id: 'source-coverage-matrix',
      title: '目录与聊天库覆盖矩阵',
      scope: '所有已知微信/QQ目录',
      priority: 'high',
      tags: ['目录覆盖', '聊天库', '证据矩阵'],
      evidence: ['data/source-discovery.json', 'data/deep-index.json', 'data/database-analysis.json', 'data/binary-text-index.json', 'data/log-text-index.json'],
      content: `## 覆盖结论

${coverageConclusionText}

## 探索根目录

| 状态 | 候选文件 | 候选体积 | 路径 | 说明 |
| --- | ---: | ---: | --- | --- |
${coverageRootText}

## 重点目录地图

| 状态 | 重点 | 文件数 | 体积 | 最新时间 | 路径 |
| --- | --- | ---: | ---: | --- | --- |
${coverageDirectoryText}

## 限深宽搜命中

| 重点 | 文件数 | 体积 | 深度 | 最新时间 | 路径 |
| --- | ---: | ---: | ---: | --- | --- |
${coverageWideMatchText}

## 重点聊天库/索引候选

| 状态 | 可读性 | 体积 | 路径 | 当前判读 |
| --- | --- | ---: | --- | --- |
${coverageDatabaseText}

## 读法

这个矩阵按“目录存在性 -> 文件数量/体积 -> 聊天库候选 -> 普通 SQLite 可读性 -> 二进制/日志片段扫描”的顺序保留证据。它证明已经探索到本机能看见的微信/QQ/企业微信相关目录，也明确标出哪些目录为空、哪些库需要官方导出或解密副本，避免把不可读数据库包装成已完成的聊天正文整理。
`,
    },
    {
      id: 'deep-directory-index',
      title: '全目录深度索引',
      scope: '所有已知微信/QQ目录',
      priority: 'high',
      tags: ['全量探索', '文件分布', '数据库候选'],
      evidence: ['data/deep-index.json', 'data/deep-index.md', 'server/index.ts', 'src/App.tsx'],
      content: `## 全目录只读索引

- 文件总数：${deepIndex.totals.files}
- 目录总数：${deepIndex.totals.directories}
- 总大小：${formatMb(deepIndex.totals.bytes)}
- 数据库候选：${deepIndex.totals.databaseCandidates}
- 文本候选：${deepIndex.totals.textCandidates}
- 媒体候选：${deepIndex.totals.mediaCandidates}
- 可归档附件候选：${deepIndex.totals.attachmentCandidates}
- 已写入网站全量源文件清单：${(deepIndex.files?.length ?? 0).toLocaleString()} 个

## 根目录覆盖

${deepIndex.roots
  .map(
    (item) => `- ${item.exists ? '已找到' : '未找到'}：${item.path}
  - 文件 ${item.files}，目录 ${item.directories}，大小 ${formatMb(item.bytes)}
  - 时间 ${item.oldest ?? '无'} -> ${item.newest ?? '无'}`,
  )
  .join('\n')}

## 扩展名分布 Top 20

${deepIndex.extensionStats
  .slice(0, 20)
  .map((item) => `- ${item.ext}：${item.files} 个，${formatMb(item.bytes)}`)
  .join('\n')}

## 网站浏览

文件板块现在有“归档副本 / 全量索引”切换。全量索引模式直接使用 \`data/deep-index.json\` 的只读源文件清单，由后端按 ID 映射到原始路径，前端不拼接任意路径；图片、视频、音频、PDF、Office、表格、代码、HTML、JSON、压缩包等继续走右侧内部预览。
`,
    },
    {
      id: 'binary-visible-text',
      title: '不可读库明文片段扫描',
      scope: 'QQ NT / xwechat / WAL / message.db',
      priority: 'high',
      tags: ['二进制扫描', '明文片段', '聊天正文边界'],
      evidence: ['data/binary-text-index.json', 'data/binary-text-index.md'],
      content: `## 二进制可见文本扫描

- 扫描文件：${binaryTextIndex.scannedFiles}
- 扫描体积：${formatMb(binaryTextIndex.scannedBytes)}
- 可见文本候选片段：${binaryTextIndex.candidateSnippets}
- 高置信聊天正文片段：${highSignalBinarySnippets.length}

## 结论

${highSignalBinarySnippets.length
  ? '发现了少量同时含中文和聊天线索的片段，已保留为候选证据，需要继续人工复核其上下文。'
  : '当前提取到的可见文本主要是表结构、配置、埋点、会议字段、平台 API 名称和缓存键；没有发现可直接整理为微信/QQ聊天正文的连续文本。'}

## 片段最多的文件

${binaryTextIndex.files
  .slice(0, 15)
  .map((item) => `- ${item.snippets} 段｜${formatMb(item.size)}｜${item.signals.join('、') || '无'}｜${item.path}`)
  .join('\n')}

## 代表性片段

${binaryTextIndex.snippets
  .slice(0, 12)
  .map((item) => `- ${item.signals.join('、')}｜${item.encoding}｜${item.path}\n  - ${item.preview}`)
  .join('\n')}
`,
    },
    {
      id: 'log-cache-text-scan',
      title: '日志缓存可见文本扫描',
      scope: 'xlog / qqxlog / log / leveldb',
      priority: 'high',
      tags: ['日志', '缓存', '聊天线索'],
      evidence: ['data/log-text-index.json', 'data/log-text-index.md', 'scripts/scanLogText.ts'],
      content: `## 覆盖

- 候选日志/缓存文件：${logTextIndex.candidateFiles}
- 实际扫描文件：${logTextIndex.scannedFiles}
- 扫描体积：${formatMb(logTextIndex.scannedBytes)}
- 可见片段：${logTextIndex.candidateSnippets}
- 高置信聊天正文片段：${logTextIndex.highConfidenceChatSnippets}

## 结论

日志/缓存里确实有大量平台、WebView、链接、会议、技术和缓存字段线索；但严格过滤后，仍没有足以直接整理为真实微信/QQ聊天正文的连续对话。这里把片段作为证据留存，不把广告文案、User-Agent、权限提示、接口日志误判为你的聊天内容。

## 信号分布

${logSignalText}

## 代表性片段

${logSnippetText}`,
    },
    {
      id: 'source-text-synthesis',
      title: '全量源文本洞察',
      scope: '所有可读源文本',
      priority: 'high',
      tags: ['源文本', '关键信息', '聊天线索'],
      evidence: ['data/source-text-index.json', 'data/source-text-index.md', 'scripts/analyzeSourceText.ts'],
      content: `## 覆盖

- 扫描文本候选：${sourceTextIndex.scannedFiles}
- 可读文本文件：${sourceTextIndex.readableFiles}
- 跳过/失败：${sourceTextIndex.skippedFiles}
- 总字符数：${sourceTextIndex.totalChars.toLocaleString()}
- 含聊天字段线索文件：${sourceTextIndex.chatLikeFiles}
- 代表性摘录：${sourceTextIndex.extracts.length}

## 关键结论

全量源文本已经被只读扫描。当前读到的大多数内容是微信/QQ/企业微信运行资源、内置前端 bundle、配置、缓存和日志，不应直接当作你的聊天正文或个人观点。脚本把这类内容降权，只把可读文本里的具体技术、学业、项目、比赛、生活关系和聊天字段线索作为证据列出。

## 信号分布

${sourceTextSignalText}

## 预览类型分布

${sourceTextPreviewText}

## 聊天字段线索

${sourceTextChatLikeText}

## 代表性摘录

${sourceTextExtractText}
`,
    },
    {
      id: 'readable-database-analysis',
      title: '可读数据库结构扫描',
      scope: 'SQLite 明文候选',
      priority: 'high',
      tags: ['数据库', '表结构', '文本字段'],
      evidence: ['data/database-analysis.json', 'data/database-analysis.md'],
      content: `## 可读数据库结构扫描

- 可读数据库：${databaseAnalysis.totals.readableDatabases}
- 不可读数据库：${databaseAnalysis.totals.unreadableDatabases}
- 已分析表：${databaseAnalysis.totals.analyzedTables}
- 疑似聊天正文表：${databaseAnalysis.totals.suspectedMessageTables}
- 文本样本：${databaseAnalysis.totals.textSamples}

## 结论

${databaseAnalysis.totals.suspectedMessageTables
  ? '可读数据库里出现了疑似消息结构，已列入证据，需要进一步逐表确认是否为真实聊天正文。'
  : '已打开的 SQLite 明文库主要是腾讯会议、埋点、配置、缓存和用户/登录配置；未发现明确微信/QQ聊天正文表。'}

## 可读库概览

${databaseAnalysis.databases
  .filter((item) => item.readable)
  .map(
    (item) => `### ${item.path}

- 应用：${item.app}
- 表数量：${item.tables.length}
- 重点类型：${[...new Set(item.tables.map((table) => table.focus))].join('、') || '无'}
- 疑似消息表：${item.tables.filter((table) => table.suspectedMessage).length}
`,
  )
  .join('\n')}
`,
    },
  ]
}
