import path from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  auditInsightRefresh,
  distillInsightRefresh,
  prepareInsightRefresh,
  rebuildInsightBoards,
} from './insights/insightRefreshRunner.js'

type InsightRefreshCommand = 'prepare' | 'distill' | 'boards' | 'audit'

export function parseInsightRefreshArgs(argv: string[]) {
  const command = argv[0] as InsightRefreshCommand | undefined
  if (!command || !new Set(['prepare', 'distill', 'boards', 'audit']).has(command)) {
    throw new Error(
      `Unknown command: ${command ?? ''}. Usage: refreshInsights <prepare|distill|boards|audit> [options]`,
    )
  }
  const names: ReadonlyMap<string, string> = new Map([
    ['--run-id', 'runId'],
    ['--source', 'sourceDir'],
    ['--bundle', 'bundleDir'],
    ['--db', 'databasePath'],
    ['--alias-map', 'aliasMapPath'],
  ] as const)
  const values: Record<string, string> = {}
  for (let index = 1; index < argv.length; index += 2) {
    const flag = argv[index]
    const value = argv[index + 1]
    const name = flag ? names.get(flag) : undefined
    if (!name) throw new Error(`Unknown option: ${flag ?? ''}`)
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${flag}`)
    values[name] = value
  }
  return { command, ...values } as {
    command: InsightRefreshCommand
    runId?: string
    sourceDir?: string
    bundleDir?: string
    databasePath?: string
    aliasMapPath?: string
  }
}

export function runInsightRefreshCli(argv: string[]) {
  const parsed = parseInsightRefreshArgs(argv)
  const common = {
    root: process.cwd(),
    ...(parsed.sourceDir ? { sourceDir: parsed.sourceDir } : {}),
    ...(parsed.bundleDir ? { bundleDir: parsed.bundleDir } : {}),
    ...(parsed.databasePath ? { databasePath: parsed.databasePath } : {}),
  }
  if (parsed.command === 'audit') {
    const result = auditInsightRefresh(common)
    console.log(JSON.stringify(result, null, 2))
    if (!result.ok) process.exitCode = 1
    return result
  }
  if (!parsed.runId) throw new Error(`--run-id is required for ${parsed.command}`)
  const options = { ...common, runId: parsed.runId }
  if (parsed.aliasMapPath) Object.assign(options, { aliasMapPath: parsed.aliasMapPath })
  const result = parsed.command === 'prepare'
    ? prepareInsightRefresh(options)
    : parsed.command === 'distill'
      ? distillInsightRefresh(options)
      : rebuildInsightBoards(options)
  console.log(JSON.stringify(result, null, 2))
  return result
}

const invoked = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : ''
if (invoked === import.meta.url) runInsightRefreshCli(process.argv.slice(2))
