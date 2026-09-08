import fs from 'node:fs'
import path from 'node:path'
import type { ChatExportConversation, ChatExportIndex, ChatExportMessage } from '../shared/contracts/index.js'
import { candidateExt, candidateName, excludePath, maxCandidateBytes } from './ingest/constants.js'
import {
  acceptReason,
  conversationTitle,
  hashId,
  parseFile,
  signalsFor,
  type ParsedMessage,
} from './ingest/parsers.js'
import { dataDir, ensureDir, home, root, writeJson } from './shared.js'

const importDir = path.join(root, 'imports', 'chat-exports')

function walk(dir: string, out: string[] = []) {
  if (!fs.existsSync(dir)) return out
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (excludePath.test(`${full}\\`)) continue
    if (entry.isDirectory()) {
      walk(full, out)
    } else if (entry.isFile()) {
      out.push(full)
    }
  }
  return out
}

ensureDir(importDir)

const searchedRoots = [
  importDir,
  path.join(home, 'Desktop'),
  path.join(home, 'Downloads'),
  path.join(home, 'Documents'),
].filter((item, index, arr) => fs.existsSync(item) && arr.indexOf(item) === index)

const files = searchedRoots
  .flatMap((dir) => walk(dir))
  .filter((filePath, index, arr) => arr.indexOf(filePath) === index)
  .filter((filePath) => candidateExt.test(filePath))
  .filter((filePath) => filePath.startsWith(importDir) || candidateName.test(filePath))
  .filter((filePath) => {
    const stat = fs.statSync(filePath)
    return stat.size > 0 && stat.size <= maxCandidateBytes
  })
  .slice(0, 5000)

const candidateFiles: ChatExportIndex['candidateFiles'] = []
const acceptedMessages: ChatExportMessage[] = []
const conversations = new Map<string, ChatExportConversation>()

for (const filePath of files) {
  const stat = fs.statSync(filePath)
  let messages: ParsedMessage[] = []
  let parseError = ''
  try {
    messages = parseFile(filePath)
  } catch (error) {
    parseError = `解析失败：${error instanceof Error ? error.message : String(error)}`
  }
  const reason = parseError || acceptReason(filePath, messages)
  const accepted = Boolean(reason && !reason.startsWith('解析失败'))
  candidateFiles.push({
    path: filePath,
    size: stat.size,
    modified: stat.mtime.toISOString(),
    parsedMessages: messages.length,
    accepted,
    reason: accepted ? reason : reason || '解析消息不足或缺少高价值信号',
  })
  if (!accepted) continue

  const title = conversationTitle(filePath, messages)
  const key = hashId(title)
  const conversation =
    conversations.get(key) ??
    ({
      id: key,
      title,
      sourcePaths: [],
      participants: [],
      messageCount: 0,
      signalCounts: {},
      highlights: [],
    } satisfies ChatExportConversation)
  conversation.sourcePaths.push(filePath)
  const participantSet = new Set(conversation.participants)
  for (const item of messages) {
    const signals = signalsFor(item.content)
    const message: ChatExportMessage = {
      ...item,
      id: hashId(`${filePath}|${item.timestamp ?? ''}|${item.sender}|${item.content}`),
      sourcePath: filePath,
      conversation: title,
      signals,
    }
    acceptedMessages.push(message)
    conversation.messageCount += 1
    participantSet.add(item.sender)
    for (const signal of signals) {
      conversation.signalCounts[signal] = (conversation.signalCounts[signal] ?? 0) + 1
    }
    if (signals.some((signal) => signal !== '一般内容') && conversation.highlights.length < 40) {
      conversation.highlights.push(message)
    }
  }
  conversation.participants = [...participantSet].sort((a, b) => a.localeCompare(b, 'zh-CN'))
  conversations.set(key, conversation)
}

const conversationList = [...conversations.values()].sort((a, b) => b.messageCount - a.messageCount)
const participants = new Set(conversationList.flatMap((item) => item.participants))
const index: ChatExportIndex = {
  generatedAt: new Date().toISOString(),
  importDir,
  searchedRoots,
  candidateFiles: candidateFiles.sort((a, b) => Number(b.accepted) - Number(a.accepted) || b.parsedMessages - a.parsedMessages),
  totals: {
    sources: candidateFiles.filter((item) => item.accepted).length,
    conversations: conversationList.length,
    messages: acceptedMessages.length,
    participants: participants.size,
    highlights: conversationList.reduce((sum, item) => sum + item.highlights.length, 0),
  },
  conversations: conversationList,
}

writeJson(path.join(dataDir, 'chat-export-index.json'), index)
fs.writeFileSync(
  path.join(dataDir, 'chat-export-index.md'),
  `# 聊天导出导入索引

生成时间：${index.generatedAt}

导入目录：${index.importDir}

## 覆盖

- 搜索根目录：${index.searchedRoots.length}
- 候选文件：${index.candidateFiles.length}
- 接受来源：${index.totals.sources}
- 会话：${index.totals.conversations}
- 消息：${index.totals.messages}
- 参与者：${index.totals.participants}
- 高亮信息：${index.totals.highlights}

## 已接受会话

${index.conversations
    .map(
      (item) => `- ${item.title}：${item.messageCount} 条；参与者 ${item.participants.join('、') || '未知'}；信号 ${Object.entries(item.signalCounts)
        .map(([label, count]) => `${label} ${count}`)
        .join('、')}`,
    )
    .join('\n') || '- 暂未发现可稳定解析的聊天导出文件。'}

## 候选文件

${index.candidateFiles
    .slice(0, 80)
    .map((item) => `- ${item.accepted ? '接受' : '跳过'}｜${item.parsedMessages} 条｜${item.reason}｜${item.path}`)
    .join('\n') || '- 暂无候选文件。'}
`,
  'utf8',
)

console.log(
  `Built chat export index: ${index.totals.sources} sources, ${index.totals.conversations} conversations, ${index.totals.messages} messages.`,
)
