import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { operationCatalog } from '../shared/contracts/operations.js'

type CliDependencies = {
  fetchImpl?: typeof fetch
  stdout?: (value: string) => void
  stderr?: (value: string) => void
  baseURL?: string
  token?: string
}

type Parsed = { command: string; positionals: string[]; flags: Map<string, string | true> }
const usage = `用法：
  chatfiles status [--json]
  chatfiles conversations [--query 文本] [--limit 20] [--json]
  chatfiles search <query> [--conversation ID] [--sender ID] [--limit 20] [--json]
  chatfiles artifacts <query> [--conversation ID] [--category all] [--limit 20] [--json]
  chatfiles read-document <asset-id> [--max-chars 12000] [--json]
  chatfiles message-context <message-uid> [--radius 8] [--json]
`

function parse(args: readonly string[]): Parsed | undefined {
  const [command, ...rest] = args
  if (!command) return undefined
  const positionals: string[] = []
  const flags = new Map<string, string | true>()
  for (let index = 0; index < rest.length; index += 1) {
    const item = rest[index]
    if (!item.startsWith('--')) { positionals.push(item); continue }
    if (flags.has(item)) return undefined
    if (item === '--json') { flags.set(item, true); continue }
    const value = rest[index + 1]
    if (!value || value.startsWith('--')) return undefined
    flags.set(item, value)
    index += 1
  }
  return { command, positionals, flags }
}

function flag(parsed: Parsed, name: string) {
  const value = parsed.flags.get(name)
  return typeof value === 'string' ? value : undefined
}

type NumberSchema = {
  safeParse: (value: unknown) => { success: true; data: number } | { success: false }
}

function schemaNumber(value: string | undefined, schema: NumberSchema) {
  if (value !== undefined && !/^\d+$/u.test(value)) return undefined
  const parsed = schema.safeParse(value === undefined ? undefined : Number(value))
  return parsed.success ? parsed.data : undefined
}

function valid(parsed: Parsed, allowed: readonly string[], positions: number) {
  return parsed.positionals.length === positions
    && [...parsed.flags.keys()].every((key) => key === '--json' || allowed.includes(key))
}

function requestPath(parsed: Parsed) {
  const query = new URLSearchParams()
  const limit = schemaNumber(flag(parsed, '--limit'), operationCatalog.list_conversations.inputSchema.shape.limit)
  if (parsed.command === 'status' && valid(parsed, [], 0)) return '/api/local/v1/status'
  if (parsed.command === 'conversations' && valid(parsed, ['--query', '--limit'], 0) && limit) {
    if (flag(parsed, '--query')) query.set('query', flag(parsed, '--query')!)
    query.set('limit', String(limit))
    return `/api/local/v1/conversations?${query}`
  }
  if (parsed.command === 'search' && valid(parsed, ['--conversation', '--sender', '--limit'], 1) && limit) {
    query.set('q', parsed.positionals[0])
    if (flag(parsed, '--conversation')) query.set('conversation', flag(parsed, '--conversation')!)
    if (flag(parsed, '--sender')) query.set('sender', flag(parsed, '--sender')!)
    query.set('limit', String(limit))
    return `/api/local/v1/search?${query}`
  }
  if (parsed.command === 'artifacts' && valid(parsed, ['--conversation', '--category', '--limit'], 1) && limit) {
    query.set('q', parsed.positionals[0])
    if (flag(parsed, '--conversation')) query.set('conversation', flag(parsed, '--conversation')!)
    if (flag(parsed, '--category')) query.set('category', flag(parsed, '--category')!)
    query.set('limit', String(limit))
    return `/api/local/v1/artifacts?${query}`
  }
  if (parsed.command === 'read-document' && valid(parsed, ['--max-chars'], 1)) {
    const maximum = schemaNumber(
      flag(parsed, '--max-chars'), operationCatalog.read_document.inputSchema.shape.maxCharacters,
    )
    if (!maximum) return undefined
    query.set('maxChars', String(maximum))
    return `/api/local/v1/documents/${encodeURIComponent(parsed.positionals[0])}?${query}`
  }
  if (parsed.command === 'message-context' && valid(parsed, ['--radius'], 1)) {
    const radius = schemaNumber(flag(parsed, '--radius'), operationCatalog.get_message_context.inputSchema.shape.radius)
    if (radius === undefined) return undefined
    query.set('radius', String(radius))
    return `/api/local/v1/messages/${encodeURIComponent(parsed.positionals[0])}/context?${query}`
  }
  return undefined
}

function localBase(value: string) {
  try {
    const url = new URL(value)
    const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
    return url.protocol === 'http:' && loopback && !url.username && !url.password
      ? url.toString().replace(/\/$/u, '')
      : undefined
  } catch { return undefined }
}

function human(value: unknown) {
  if (!value || typeof value !== 'object') return `${String(value)}\n`
  const record = value as Record<string, unknown>
  if (typeof record.name === 'string') return `${record.name}\n微信资料：${record.wechat}\n文件资料：${record.artifacts}\n`
  const items = (record.conversations ?? record.hits ?? record.artifacts ?? record.messages) as unknown
  if (Array.isArray(items)) return `${items.map((item) => {
    const row = item as Record<string, unknown>
    return `- ${row.display ?? row.name ?? row.text ?? row.messageUid ?? row.id ?? '记录'}`
  }).join('\n')}\n`
  if (typeof record.text === 'string') return `${record.title ?? '文档'}\n\n${record.text}\n`
  return `${JSON.stringify(value, null, 2)}\n`
}

export async function runCli(args: readonly string[], dependencies: CliDependencies = {}) {
  const stdout = dependencies.stdout ?? ((value) => process.stdout.write(value))
  const stderr = dependencies.stderr ?? ((value) => process.stderr.write(value))
  const parsed = parse(args)
  const target = parsed ? requestPath(parsed) : undefined
  const base = localBase(dependencies.baseURL ?? process.env.CHATFILES_LOCAL_URL ?? 'http://127.0.0.1:3456')
  if (!parsed || !target || !base) { stderr(usage); return 2 }
  try {
    const token = dependencies.token ?? process.env.CHATFILES_LOCAL_TOKEN ?? ''
    const response = await (dependencies.fetchImpl ?? fetch)(`${base}${target}`, {
      headers: { accept: 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      signal: AbortSignal.timeout(30_000),
    })
    if (!response.ok) { stderr('本地接口请求失败。\n'); return 1 }
    const value: unknown = await response.json()
    stdout(parsed.flags.has('--json') ? `${JSON.stringify(value)}\n` : human(value))
    return 0
  } catch {
    stderr('本地接口请求失败。\n')
    return 1
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) process.exitCode = await runCli(process.argv.slice(2))
