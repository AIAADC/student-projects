import type { InsightBoardRecord } from './insightTypes.js'

function boardText(value: string) {
  return value.replace(/[\r\n]+/gu, ' ').replace(/\s+/gu, ' ').trim()
}

function escapeBoardMarkdown(value: string) {
  return boardText(value)
    .replace(/\\/gu, '\\\\')
    .replace(/([`*_[\]{}()<>#+!|>~])/gu, '\\$1')
    .replace(/^([+-])(?=\s)/u, '\\$1')
}

export function renderInsightBoard(
  category: string,
  records: InsightBoardRecord[],
  maximumEntries = 36,
) {
  const sorted = [...records].sort((a, b) =>
    Number(b.nugget.importance ?? 0) - Number(a.nugget.importance ?? 0)
    || String(b.nugget.date ?? '').localeCompare(String(a.nugget.date ?? ''))
    || a.nugget.title.localeCompare(b.nugget.title, 'zh-CN'),
  )
  const visible = sorted.slice(0, maximumEntries)
  const conversations = new Set(records.map((record) => record.convId)).size
  const sections = [
    { title: '重点记录', matches: (importance: number) => importance >= 4 },
    { title: '值得关注', matches: (importance: number) => importance === 3 },
    { title: '补充记录', matches: (importance: number) => importance <= 2 },
  ]
  const lines = [
    `# ${boardText(category)} 主题板`,
    '',
    `本板汇总 ${records.length} 条可追溯要点，覆盖 ${conversations} 个会话，并优先展示重要度更高、日期更新的记录。`,
  ]
  for (const section of sections) {
    const matches = visible.filter((record) => section.matches(Number(record.nugget.importance ?? 0)))
    if (matches.length === 0) continue
    lines.push('', `## ${section.title}`)
    for (const record of matches) {
      const rawTitle = boardText(record.nugget.title).replace(/^#+\s*/u, '') || '未命名记录'
      const title = escapeBoardMarkdown(rawTitle)
      const content = escapeBoardMarkdown(record.nugget.content)
      const source = escapeBoardMarkdown(record.conversationName || record.convId)
      const date = escapeBoardMarkdown(record.nugget.date ?? '') || '日期未标注'
      lines.push('', `### ${title}`, '', `> ${content}`, '', `来源：${source} · ${date}`)
    }
  }
  lines.push(
    '',
    '---',
    '',
    `本板基于 ${records.length} 条要点，覆盖 ${conversations} 个会话；展示 ${visible.length} 条。`,
    '',
  )
  return lines.join('\n')
}
