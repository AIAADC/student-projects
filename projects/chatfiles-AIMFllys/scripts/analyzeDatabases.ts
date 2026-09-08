import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { readJsonFile as readJson } from '../pipeline/common/jsonFile.js'
import type { DatabaseAnalysis, DatabaseTableAnalysis, DatabaseTextSample, DeepFileIndex } from '../shared/contracts/index.js'
import { dataDir, sourceApp, writeJson } from './shared.js'

function quoteIdent(value: string) {
  return `"${value.replace(/"/g, '""')}"`
}

function isMessageStructure(table: string, columns: Array<{ name: string; type: string }>) {
  const tableHit = /(^|_)(msg|message|chat|conversation|im)(_|$)/i.test(table)
  const names = columns.map((item) => item.name.toLowerCase())
  const hasBody = names.some((name) => /(^|_)(content|msg|message|body|text)(_|$)/i.test(name))
  const hasActor = names.some((name) => /(^|_)(talker|sender|receiver|from|to|peer|uin|uid)(_|$)/i.test(name))
  const onlyMeetingCounter = names.some((name) => name === 'chat_num') && !hasBody
  return tableHit && hasBody && hasActor && !onlyMeetingCounter
}

function tableFocus(table: string, columns: Array<{ name: string; type: string }>) {
  const text = `${table} ${columns.map((item) => item.name).join(' ')}`
  if (/meeting|calendar|historical_meetings|record_|participants|ai_summary/i.test(text)) return '会议/日程历史'
  if (/profile|user|login|account|authorize/i.test(text)) return '用户/登录配置'
  if (/beacon|event|report|monitor|behavior/i.test(text)) return '埋点/遥测'
  if (/config|setting|cache|resource|res_/i.test(text)) return '配置/缓存'
  if (isMessageStructure(table, columns)) return '疑似聊天/消息'
  return '其他结构化数据'
}

function sampleSignals(value: string) {
  const signals: string[] = []
  if (/http|https|www\./i.test(value)) signals.push('链接')
  if (/会议|meeting|日程|calendar/i.test(value)) signals.push('会议/日程')
  if (/msg|message|chat|content|聊天|群|好友/i.test(value)) signals.push('聊天线索')
  if (/ai|模型|prompt|代码|算法|开发/i.test(value)) signals.push('技术')
  if (/课程|考试|学分|作业|医学|强基/i.test(value)) signals.push('学业')
  if (/创业|项目|产品|商业|比赛|竞赛/i.test(value)) signals.push('项目/比赛')
  return signals.length ? signals : ['结构化文本']
}

function shouldSampleColumn(table: string, column: string, type: string) {
  const text = `${table} ${column} ${type}`
  return /text|char|clob|varchar|json|name|title|desc|content|msg|message|chat|url|data|value|profile|history|memo|remark/i.test(text)
}

function cleanValue(value: unknown) {
  if (value == null) return ''
  if (Buffer.isBuffer(value)) return ''
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value).split('\u0000').join('').replace(/\s+/g, ' ').trim()
}

function sampleColumn(db: DatabaseSync, table: string, column: string): DatabaseTextSample[] {
  try {
    const sql = `select ${quoteIdent(column)} as value from ${quoteIdent(table)} where ${quoteIdent(column)} is not null limit 8`
    const rows = db.prepare(sql).all() as Array<{ value: unknown }>
    return rows
      .map((row) => cleanValue(row.value))
      .filter((value) => value.length >= 2)
      .slice(0, 4)
      .map((value) => ({
        table,
        column,
        valuePreview: value.slice(0, 360),
        signals: sampleSignals(value),
      }))
  } catch {
    return []
  }
}

function rowCount(db: DatabaseSync, table: string) {
  try {
    const row = db.prepare(`select count(*) as count from ${quoteIdent(table)}`).get() as { count: number }
    return Number(row.count ?? 0)
  } catch {
    return 0
  }
}

function analyzeReadableDb(filePath: string): DatabaseAnalysis['databases'][number] {
  const stat = fs.statSync(filePath)
  const db = new DatabaseSync(filePath, { readOnly: true })
  try {
    const tables = db.prepare("select name from sqlite_master where type='table' order by name").all() as Array<{ name: string }>
    const analyses: DatabaseTableAnalysis[] = []
    for (const table of tables.slice(0, 120)) {
      const columns = db.prepare(`pragma table_info(${quoteIdent(table.name)})`).all() as Array<{ name: string; type: string }>
      const normalizedColumns = columns.map((column) => ({ name: column.name, type: column.type || '' }))
      const focus = tableFocus(table.name, normalizedColumns)
      const samples = normalizedColumns
        .filter((column) => shouldSampleColumn(table.name, column.name, column.type))
        .flatMap((column) => sampleColumn(db, table.name, column.name))
        .slice(0, 12)
      analyses.push({
        name: table.name,
        rowCount: rowCount(db, table.name),
        columns: normalizedColumns,
        focus,
        suspectedMessage: focus === '疑似聊天/消息',
        textSamples: samples,
      })
    }
    return {
      path: filePath,
      readable: true,
      size: stat.size,
      modified: stat.mtime.toISOString(),
      app: sourceApp(filePath),
      detail: `分析 ${analyses.length} 张表。`,
      tables: analyses,
    }
  } finally {
    db.close()
  }
}

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
})

const databases = deepIndex.databaseCandidates.map((candidate) => {
  if (!candidate.readable) {
    return {
      path: candidate.path,
      readable: false,
      size: candidate.size,
      modified: candidate.modified,
      app: sourceApp(candidate.path),
      detail: candidate.detail,
      tables: [],
    }
  }
  try {
    return analyzeReadableDb(candidate.path)
  } catch (error) {
    return {
      path: candidate.path,
      readable: false,
      size: candidate.size,
      modified: candidate.modified,
      app: sourceApp(candidate.path),
      detail: String(error),
      tables: [],
    }
  }
})

const analysis: DatabaseAnalysis = {
  generatedAt: new Date().toISOString(),
  totals: {
    readableDatabases: databases.filter((item) => item.readable).length,
    unreadableDatabases: databases.filter((item) => !item.readable).length,
    analyzedTables: databases.reduce((sum, item) => sum + item.tables.length, 0),
    suspectedMessageTables: databases.reduce((sum, item) => sum + item.tables.filter((table) => table.suspectedMessage).length, 0),
    textSamples: databases.reduce((sum, item) => sum + item.tables.reduce((tableSum, table) => tableSum + table.textSamples.length, 0), 0),
  },
  databases,
}

writeJson(path.join(dataDir, 'database-analysis.json'), analysis)

const report = `# 可读数据库结构分析

生成时间：${analysis.generatedAt}

## 总量

- 可读数据库：${analysis.totals.readableDatabases}
- 不可读数据库：${analysis.totals.unreadableDatabases}
- 已分析表：${analysis.totals.analyzedTables}
- 疑似消息表：${analysis.totals.suspectedMessageTables}
- 文本样本：${analysis.totals.textSamples}

## 可读库概览

${analysis.databases
  .filter((item) => item.readable)
  .map(
    (item) => `- ${item.path}
  - 应用：${item.app}；表：${item.tables.length}；疑似消息表：${item.tables.filter((table) => table.suspectedMessage).length}
  - 重点：${[...new Set(item.tables.map((table) => table.focus))].join('、')}`,
  )
  .join('\n')}

## 疑似消息表

${analysis.databases
  .flatMap((item) => item.tables.filter((table) => table.suspectedMessage).map((table) => ({ db: item.path, table })))
  .map(
    (item) => `- ${item.db} / ${item.table.name}
  - 行数：${item.table.rowCount}
  - 列：${item.table.columns.map((column) => `${column.name}:${column.type}`).join('、')}`,
  )
  .join('\n') || '- 未在可读 SQLite 中发现明确聊天正文表。'}
`

fs.writeFileSync(path.join(dataDir, 'database-analysis.md'), report, 'utf8')
console.log(`Analyzed ${analysis.totals.readableDatabases} readable databases, ${analysis.totals.analyzedTables} tables.`)
