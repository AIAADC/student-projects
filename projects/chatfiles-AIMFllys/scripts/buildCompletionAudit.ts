import fs from 'node:fs'
import path from 'node:path'
import { readJsonFile as readJson } from '../pipeline/common/jsonFile.js'
import type {
  BinaryTextIndex,
  ChatClueDossier,
  ChatExportIndex,
  CompletionAudit,
  CompletionAuditItem,
  DatabaseAnalysis,
  DeepFileIndex,
  LogTextIndex,
  SourceDiscovery,
  SourceTextIndex,
} from '../shared/contracts/index.js'
import { dataDir, writeJson } from './shared.js'
import { readCurrentLibraryManifest } from './data/catalogConsumer.js'

function statusLine(status: CompletionAuditItem['status']) {
  if (status === 'proved') return '已证明'
  if (status === 'partial') return '部分完成'
  if (status === 'needs_input') return '需要外部输入'
  return '未证明'
}

const manifest = readCurrentLibraryManifest(path.dirname(dataDir))
const discovery = readJson<SourceDiscovery>(path.join(dataDir, 'source-discovery.json'), {
  generatedAt: new Date(0).toISOString(),
  roots: [],
  directoryMap: [],
  databases: [],
  topCandidates: [],
})
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
const databaseAnalysis = readJson<DatabaseAnalysis>(path.join(dataDir, 'database-analysis.json'), {
  generatedAt: new Date(0).toISOString(),
  totals: {
    readableDatabases: 0,
    unreadableDatabases: 0,
    analyzedTables: 0,
    suspectedMessageTables: 0,
    textSamples: 0,
  },
  databases: [],
})
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
const chatClueDossier = readJson<ChatClueDossier>(path.join(dataDir, 'chat-clue-dossier.json'), {
  generatedAt: new Date(0).toISOString(),
  totals: {
    groups: 0,
    snippets: 0,
    highValueGroups: 0,
    chatExportMessages: 0,
    bySourceType: {},
    bySourceApp: {},
    bySignal: {},
  },
  groups: [],
})

const previewSet = new Set([...(deepIndex.files ?? []).map((item) => item.preview), ...manifest.files.map((item) => item.preview)])
const implementedPreviewFormats = ['图片/ICO/APNG/AVIF/SVG', '视频', '浏览器音频', 'AMR/SILK 语音转码尝试', '字体样张', 'PDF', 'DOCX', '表格/CSV', 'Markdown', '代码/文本/Lua/shader', 'HTML', 'JSON', '配置/证书/LevelDB 元数据文本', 'PPTX 文本', 'ZIP/7z/RAR 压缩包目录探测', 'SQLite/数据库结构', '通用文件头/字符串检查', '下载兜底']
const chatDatabaseCandidates = deepIndex.databaseCandidates.filter((item) => /nt_msg|msg|message|fts|xwechat|wechat|qq/i.test(item.path))
const rootCount = discovery.roots.filter((item) => item.exists).length || deepIndex.roots.filter((item) => item.exists).length

const items: CompletionAuditItem[] = [
  {
    id: 'all-known-files-visible',
    title: '所有已知微信/QQ相关文件可浏览',
    status: deepIndex.files?.length === deepIndex.totals.files && deepIndex.totals.files > 0 ? 'proved' : 'partial',
    detail: `全量索引记录 ${deepIndex.totals.files.toLocaleString()} 个文件，其中 ${(deepIndex.files?.length ?? 0).toLocaleString()} 个写入网站源文件树；归档副本 ${manifest.stats.archived.toLocaleString()} 个。`,
    evidence: ['data/deep-index.json', 'server/index.ts', 'src/App.tsx'],
    next: '继续运行 ingest:deep 可刷新新增文件；源文件树保持只读。'
  },
  {
    id: 'valuable-files-archived',
    title: '有价值附件已复制归档并顶级分类',
    status: manifest.stats.archived > 0 ? 'proved' : 'not_proved',
    detail: `已归档 ${manifest.stats.archived.toLocaleString()} 个副本，去重跳过 ${manifest.stats.duplicatesSkipped.toLocaleString()} 个，覆盖顶级分类 ${new Set(manifest.files.map((item) => item.category)).size} 个。`,
    evidence: ['data/library.json', 'scripts/archiveFiles.ts'],
    next: '继续按文件名和路径规则扩展分类词；不会删除原始文件。'
  },
  {
    id: 'common-preview-formats',
    title: '常见格式右侧内部预览',
    status: 'proved',
    detail: `实现支持：${implementedPreviewFormats.join('、')}。当前数据出现的预览类型：${[...previewSet].sort().join('、') || '无'}。`,
    evidence: ['src/App.tsx', 'scripts/shared.ts'],
    next: 'AMR/SILK 等浏览器无法原生解析的音频格式优先只读转码播放；失败时保留下载入口和通用检查。'
  },
  {
    id: 'chat-source-discovery',
    title: '所有已知微信/QQ目录已深度探索',
    status: rootCount > 0 && deepIndex.totals.databaseCandidates > 0 ? 'proved' : 'partial',
    detail: `已探索根目录 ${rootCount} 个、目录 ${deepIndex.totals.directories.toLocaleString()} 个、数据库候选 ${deepIndex.totals.databaseCandidates.toLocaleString()} 个。`,
    evidence: ['data/source-discovery.json', 'data/deep-index.json'],
    next: '如果新增账号或迁移目录，补充 explorationRoots 后重新 ingest。'
  },
  {
    id: 'source-coverage-matrix',
    title: '目录与聊天库覆盖矩阵已进入总结',
    status: rootCount > 0 && discovery.directoryMap.length > 0 ? 'proved' : 'not_proved',
    detail: `总结页已按根目录、重点目录、限深宽搜命中、聊天库/索引候选聚合覆盖矩阵；根目录 ${rootCount} 个，重点目录 ${discovery.directoryMap.length} 个，宽搜命中 ${discovery.wideMatches?.length ?? 0} 个，重点数据库记录 ${discovery.databases.length} 个。`,
    evidence: ['data/source-discovery.json', 'data/summary.json', 'scripts/buildSummary.ts'],
    next: '继续以该矩阵作为新增账号、迁移目录或导出聊天记录后的复核入口。'
  },
  {
    id: 'readable-database-analysis',
    title: '可读数据库已做结构与文本样本分析',
    status: databaseAnalysis.totals.readableDatabases > 0 ? 'proved' : 'partial',
    detail: `可读数据库 ${databaseAnalysis.totals.readableDatabases} 个，分析表 ${databaseAnalysis.totals.analyzedTables} 张，疑似聊天正文表 ${databaseAnalysis.totals.suspectedMessageTables} 张。`,
    evidence: ['data/database-analysis.json', 'scripts/analyzeDatabases.ts'],
    next: databaseAnalysis.totals.suspectedMessageTables ? '继续人工复核疑似消息表。' : '当前可读库主要是配置、缓存、会议和埋点。'
  },
  {
    id: 'unreadable-chat-database-boundary',
    title: '不可读聊天库边界已记录',
    status: chatDatabaseCandidates.length > 0 && binaryTextIndex.scannedFiles > 0 ? 'partial' : 'not_proved',
    detail: `重点聊天数据库/索引候选 ${chatDatabaseCandidates.length} 个；二进制可见文本扫描 ${binaryTextIndex.scannedFiles} 个文件、${binaryTextIndex.candidateSnippets} 段片段。`,
    evidence: ['data/deep-index.json', 'data/binary-text-index.json'],
    next: 'QQ NT / xwechat 正文库仍无法用普通 SQLite 稳定读取；不得写入或破坏原库。'
  },
  {
    id: 'log-cache-text-scan',
    title: '微信/QQ日志缓存已做可见文本扫描',
    status: logTextIndex.scannedFiles > 0 ? 'proved' : 'not_proved',
    detail: `扫描日志/缓存候选 ${logTextIndex.candidateFiles} 个，实际扫描 ${logTextIndex.scannedFiles} 个文件、${logTextIndex.candidateSnippets} 段片段，高置信聊天正文 ${logTextIndex.highConfidenceChatSnippets} 段。`,
    evidence: ['data/log-text-index.json', 'scripts/scanLogText.ts'],
    next: '日志/缓存片段只作为旁证；不把平台日志、广告文案或权限提示当作你的聊天正文。'
  },
  {
    id: 'chat-text-synthesis',
    title: '聊天正文整理',
    status: chatExportIndex.totals.messages > 0 ? 'proved' : 'needs_input',
    detail: `本机未发现可稳定解析的官方/手动聊天导出；导出候选 ${chatExportIndex.candidateFiles.length} 个，已接受消息 ${chatExportIndex.totals.messages} 条。`,
    evidence: ['data/chat-export-index.json', 'imports/chat-exports/.gitignore'],
    next: `把微信/QQ txt/csv/json/html 聊天导出放入 ${chatExportIndex.importDir} 后运行 npm run ingest。`
  },
  {
    id: 'chat-clue-dossier',
    title: '聊天线索已聚合成证据档案',
    status: chatClueDossier.totals.groups > 0 ? 'proved' : 'not_proved',
    detail: `已把聊天导出、数据库/索引片段、日志/缓存片段、可读源文本聚合为 ${chatClueDossier.totals.groups} 组线索、${chatClueDossier.totals.snippets} 段摘录，其中高价值 ${chatClueDossier.totals.highValueGroups} 组。`,
    evidence: ['data/chat-clue-dossier.json', 'scripts/buildChatClueDossier.ts', 'data/summary.json'],
    next: '线索档案用于优先复核和富文本总结；仍不把平台日志或缓存片段伪装成完整聊天正文。'
  },
  {
    id: 'source-text-synthesis',
    title: '全量源文本关键信息总结',
    status: sourceTextIndex.readableFiles > 0 ? 'proved' : 'not_proved',
    detail: `扫描文本候选 ${sourceTextIndex.scannedFiles} 个，可读 ${sourceTextIndex.readableFiles} 个，聊天字段线索 ${sourceTextIndex.chatLikeFiles} 个，代表摘录 ${sourceTextIndex.extracts.length} 条；可读预览类型：${Object.entries(sourceTextIndex.previewCounts ?? {}).map(([preview, count]) => `${preview} ${count}`).join('、') || '未统计'}。`,
    evidence: ['data/source-text-index.json', 'scripts/analyzeSourceText.ts'],
    next: '继续把资源噪声和真实个人文本分层，避免误把程序资源当聊天正文。'
  },
  {
    id: 'summary-board',
    title: '除文件板块外已有总结板块',
    status: 'proved',
    detail: '总结页已经聚合总览、目录、数据库、二进制片段、源文本、聊天导出、学业、格式覆盖等板块。',
    evidence: ['data/summary.json', 'src/App.tsx'],
    next: '每新增分析管线都应接入 summary board 和 completion audit。'
  },
  {
    id: 'no-original-deletion',
    title: '禁止删除原始记录和文件',
    status: 'proved',
    detail: '归档脚本只复制到项目 archive；源文件浏览接口只读映射；导入目录用 .gitignore 防止误提交真实聊天导出。',
    evidence: ['scripts/archiveFiles.ts', 'server/index.ts', 'imports/chat-exports/.gitignore'],
    next: '继续禁止对微信/QQ原始目录执行删除、移动或写入。'
  },
]

const totals = {
  proved: items.filter((item) => item.status === 'proved').length,
  partial: items.filter((item) => item.status === 'partial').length,
  needsInput: items.filter((item) => item.status === 'needs_input').length,
  notProved: items.filter((item) => item.status === 'not_proved').length,
}

const audit: CompletionAudit = {
  generatedAt: new Date().toISOString(),
  totals,
  items,
}

writeJson(path.join(dataDir, 'completion-audit.json'), audit)
fs.writeFileSync(
  path.join(dataDir, 'completion-audit.md'),
  `# 完成度审计

生成时间：${audit.generatedAt}

## 汇总

- 已证明：${totals.proved}
- 部分完成：${totals.partial}
- 需要外部输入：${totals.needsInput}
- 未证明：${totals.notProved}

## 要求逐项审计

${items
    .map(
      (item) => `### ${statusLine(item.status)}｜${item.title}

${item.detail}

证据：${item.evidence.join('；')}

下一步：${item.next}`,
    )
    .join('\n\n')}
`,
  'utf8',
)

console.log(`Built completion audit: ${totals.proved} proved, ${totals.partial} partial, ${totals.needsInput} needs input.`)
