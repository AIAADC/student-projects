import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod/v4'
import { operationCatalog } from '../shared/contracts/operations.js'
import { LocalAccessError, type LocalAccessService } from './services/localAccess.js'
import { createRuntimeLocalAccessService } from './services/localAccessRuntime.js'

const responseFormat = z.enum(['markdown', 'json']).default('markdown').describe('返回 markdown 或机器可读 JSON')
const listInput = operationCatalog.list_conversations.inputSchema.shape
const searchInput = operationCatalog.search_messages.inputSchema.shape
const artifactsInput = operationCatalog.search_artifacts.inputSchema.shape
const documentInput = operationCatalog.read_document.inputSchema.shape
const contextInput = operationCatalog.get_message_context.inputSchema.shape
const outputSchema = z.object({ result: z.record(z.string(), z.unknown()) })
const annotations = {
  readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false,
} as const

function publicRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : { value }
}

async function answer(operation: () => Promise<unknown>, format: 'markdown' | 'json') {
  try {
    const result = publicRecord(await operation())
    const serialized = JSON.stringify(result, null, 2)
    return {
      content: [{ type: 'text' as const, text: format === 'json' ? serialized : `\`\`\`json\n${serialized}\n\`\`\`` }],
      structuredContent: { result },
    }
  } catch (error) {
    const code = error instanceof LocalAccessError ? error.code : 'operation_failed'
    return {
      isError: true,
      content: [{ type: 'text' as const, text: `本地只读操作失败（${code}）。请检查参数与资料库状态。` }],
    }
  }
}

export function createChatFilesMcpServer(service: LocalAccessService = createRuntimeLocalAccessService(
  process.env.CHATFILES_PROJECT_ROOT?.trim() || undefined,
)) {
  const server = new McpServer({ name: 'chatfiles-mcp-server', version: '1.0.0' })
  server.registerTool('chatfiles_status', {
    title: '读取 ChatFiles 状态',
    description: '读取午夜书斋本地资料库的只读可用状态，不返回路径或配置。',
    inputSchema: z.object({ response_format: responseFormat }).strict(), outputSchema, annotations,
  }, async ({ response_format }) => answer(() => service.status(), response_format))
  server.registerTool('chatfiles_list_conversations', {
    title: '列出 ChatFiles 会话',
    description: '按显示名称筛选并列出会话、消息数量和时间范围；默认 20 条，最多 100 条。',
    inputSchema: z.object({
      query: listInput.query.describe('可选会话名称'),
      limit: listInput.limit.describe('最多返回 1–100 条记录'), response_format: responseFormat,
    }).strict(), outputSchema, annotations,
  }, async ({ query, limit: maximum, response_format: format }) => answer(
    () => service.conversations({ query, limit: maximum }), format,
  ))
  server.registerTool('chatfiles_search_messages', {
    title: '搜索 ChatFiles 消息',
    description: '以关键词搜索聊天证据，可限定会话和发送者；返回稳定消息 UID 与引用。',
    inputSchema: z.object({
      query: searchInput.query, conversation_id: searchInput.conversationId,
      sender: searchInput.sender, limit: searchInput.limit, response_format: responseFormat,
    }).strict(), outputSchema, annotations,
  }, async ({ query, conversation_id, sender, limit: maximum, response_format: format }) => answer(
    () => service.search({ query, conversationId: conversation_id, sender, limit: maximum }), format,
  ))
  server.registerTool('chatfiles_search_artifacts', {
    title: '搜索 ChatFiles 文件',
    description: '搜索作品、文档、Skill 与链接的名称和有界摘要；返回稳定文件资产 ID。',
    inputSchema: z.object({
      query: artifactsInput.query, conversation_id: artifactsInput.conversationId,
      category: artifactsInput.category, limit: artifactsInput.limit, response_format: responseFormat,
    }).strict(), outputSchema, annotations,
  }, async ({ query, conversation_id, category, limit: maximum, response_format: format }) => answer(
    () => service.artifacts({ query, conversationId: conversation_id, category, limit: maximum }), format,
  ))
  server.registerTool('chatfiles_read_document', {
    title: '读取 ChatFiles 文档',
    description: '按 64 位文件资产 ID 读取支持的 TXT、Markdown、JSON、代码、HTML 或简单 DOCX 正文；不接受路径。',
    inputSchema: z.object({
      asset_id: documentInput.assetId, max_characters: documentInput.maxCharacters,
      response_format: responseFormat,
    }).strict(), outputSchema, annotations,
  }, async ({ asset_id, max_characters, response_format: format }) => answer(
    () => service.readDocument({ assetId: asset_id, maxCharacters: max_characters }), format,
  ))
  server.registerTool('chatfiles_get_message_context', {
    title: '读取 ChatFiles 消息上下文',
    description: '按稳定消息 UID 读取前后有限条原文，默认半径 8、最大 20。',
    inputSchema: z.object({
      message_uid: contextInput.messageUid, radius: contextInput.radius,
      response_format: responseFormat,
    }).strict(), outputSchema, annotations,
  }, async ({ message_uid, radius, response_format: format }) => answer(
    () => service.messageContext({ messageUid: message_uid, radius }), format,
  ))
  return server
}

export async function runMcpServer() {
  const server = createChatFilesMcpServer()
  await server.connect(new StdioServerTransport())
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) await runMcpServer()
