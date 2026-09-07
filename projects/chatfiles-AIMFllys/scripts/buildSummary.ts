import fs from 'node:fs'
import path from 'node:path'
import type { ChatSummary } from '../shared/contracts/index.js'
import { dataDir, writeJson } from './shared.js'
import { buildSummaryContext } from './summary/aggregate.js'
import { buildBoards, buildCoverage } from './summary/boards.js'

const ctx = buildSummaryContext()

const summary: ChatSummary = {
  generatedAt: new Date().toISOString(),
  coverage: buildCoverage(ctx),
  textExtracts: ctx.textExtracts,
  boards: buildBoards(ctx),
}

writeJson(path.join(dataDir, 'summary.json'), summary)
fs.writeFileSync(
  path.join(dataDir, 'summary.md'),
  `# ChatFiles 总结板块

生成时间：${summary.generatedAt}

${summary.boards.map((board) => `## ${board.title}\n\n${board.content}`).join('\n\n')}
`,
  'utf8',
)

console.log(`Built summary with ${summary.boards.length} boards and ${summary.textExtracts.length} text extracts.`)
