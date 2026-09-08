import fs from 'node:fs'
import path from 'node:path'

export type DocumentationIssue = { message: string }

const CANONICAL = 'replication/docs/spec/01_architecture.md'
const SUPPLEMENTS = [
  'replication/docs/PROMPT.md',
  'replication/docs/RUNBOOK.md',
  'replication/docs/SKILLS.md',
  'replication/docs/spec/00_overview.md',
  'replication/docs/spec/02_data-sources.md',
  'replication/docs/spec/03_decryption.md',
  'replication/docs/spec/04_parsing.md',
  'replication/docs/spec/05_archiving.md',
  'replication/docs/spec/06_insights.md',
  'replication/docs/spec/07_server-api.md',
  'replication/docs/spec/08_frontend.md',
  'replication/docs/spec/09_ai-assistant.md',
  'replication/docs/spec/10_data-products-and-boundaries.md',
  'replication/docs/spec/11_conventions.md',
] as const

const REQUIRED_CANONICAL_TEXT = [
  '<!-- CHATFILES_CANONICAL_ARCHITECTURE -->',
  'Canonical Event Store',
  'source_inventory',
  'canonical_seq',
  'Asia/Shanghai',
  'VoiceInfo',
  'V2 AES',
  'wxgf',
  'CDN-only',
  'quarantine',
  'catalog.current.json',
  'operationCatalog',
  '/api/v1/files/:scope/:id',
  '/api/local/v1',
] as const

const RETIRED_CLAIMS = [
  '/api/wechat/conversation/:id/messages',
  '/api/wechat/conversation/:id/transcript',
  'src/boards/ChatMessageList.tsx',
  'src/boards/ChatContext.tsx',
  'src/hooks/useInView.ts',
  'src/types/files.ts',
  'CONFIG_NAV',
  '把该会话全文注入',
  '将该会话全文注入',
] as const

function read(root: string, relativePath: string) {
  try {
    return fs.readFileSync(path.join(root, relativePath), 'utf8')
  } catch {
    return null
  }
}

function markdownFiles(directory: string): string[] {
  if (!fs.existsSync(directory)) return []
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name)
    if (entry.isDirectory()) return markdownFiles(target)
    return entry.isFile() && entry.name.endsWith('.md') ? [target] : []
  })
}

export function inspectDocumentation(root: string): DocumentationIssue[] {
  const issues: DocumentationIssue[] = []
  const canonical = read(root, CANONICAL)
  if (canonical === null) return [{ message: `${CANONICAL} is missing` }]
  for (const text of REQUIRED_CANONICAL_TEXT) {
    if (!canonical.includes(text)) issues.push({ message: `${CANONICAL} is missing ${text}` })
  }

  const markerCount = markdownFiles(path.join(root, 'replication', 'docs'))
    .filter((filename) => fs.readFileSync(filename, 'utf8').includes('<!-- CHATFILES_CANONICAL_ARCHITECTURE -->'))
    .length
  if (markerCount !== 1) issues.push({ message: `canonical architecture marker count is ${markerCount}, expected 1` })

  for (const relativePath of SUPPLEMENTS) {
    const content = read(root, relativePath)
    if (content === null) issues.push({ message: `${relativePath} is missing` })
    else if (!content.slice(0, 600).includes('文档状态：补充')
      || !content.slice(0, 600).includes('01_architecture.md')) {
      issues.push({ message: `${relativePath} must defer to 01_architecture.md` })
    }
    if (content !== null) {
      for (const stale of RETIRED_CLAIMS) {
        if (content.includes(stale)) {
          issues.push({ message: `${relativePath} contains retired claim ${stale}` })
        }
      }
    }
  }

  const agents = read(root, 'replication/AGENTS.md') ?? ''
  if (!agents.includes('docs/spec/01_architecture.md') || !agents.includes('唯一权威')) {
    issues.push({ message: 'replication/AGENTS.md must name the canonical architecture source' })
  }
  const index = read(root, 'docs/README.md') ?? ''
  if (!index.includes('replication/docs/spec/01_architecture.md') || !index.includes('唯一权威')) {
    issues.push({ message: 'docs/README.md must publish the documentation authority map' })
  }
  const rootReadme = read(root, 'README.md') ?? ''
  if (!rootReadme.includes('replication/docs/spec/01_architecture.md')) {
    issues.push({ message: 'README.md must link the canonical architecture source' })
  }
  for (const relativePath of ['docs/index.html', 'docs/introduce.html']) {
    const content = read(root, relativePath)
    if (content !== null && !content.includes('replication/docs/spec/01_architecture.md')) {
      issues.push({ message: `${relativePath} must link the canonical architecture source` })
    }
  }
  return issues
}
