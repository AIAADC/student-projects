import { createHash } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'

import type { SourceDomain } from './sourceInventory.js'
import { discoverSourceDatabases } from './sourceInventory.js'
import {
  listMessageTables,
  loadMessageName2Id,
  quoteIdentifier,
  tableColumns,
} from './sourceReader.js'

const REQUIRED_MESSAGE_COLUMNS = new Set([
  'local_id', 'server_id', 'local_type', 'sort_seq', 'real_sender_id', 'create_time', 'message_content',
])

export type SourceInventoryUnit = {
  domain: SourceDomain
  sourceDb: string
  sourceTable: string
  discoveredRows: number
  parsedRows: number
  deduplicatedRows: number
  excludedRows: number
  exclusionReason: string | null
}

export type MessageDatabaseSource = {
  db: DatabaseSync
  domain: 'biz' | 'regular'
  filename: string
  tables: Set<string>
  idToName: Map<number, string>
  conversationUsernames: Set<string>
}

export type OpenSnapshotSources = {
  inventory: SourceInventoryUnit[]
  messageSources: MessageDatabaseSource[]
}

function md5(value: string) {
  return createHash('md5').update(value, 'utf8').digest('hex')
}

function rowCount(db: DatabaseSync, table: string) {
  const row = db.prepare(`SELECT count(*) AS value FROM ${quoteIdentifier(table)}`).get() as { value: number | bigint }
  return Number(row.value)
}

function inventoryUnit(
  domain: SourceDomain,
  sourceDb: string,
  sourceTable: string,
  discoveredRows: number,
  exclusionReason: string | null = null,
): SourceInventoryUnit {
  return {
    domain,
    sourceDb,
    sourceTable,
    discoveredRows,
    parsedRows: 0,
    deduplicatedRows: 0,
    excludedRows: exclusionReason ? discoveredRows : 0,
    exclusionReason,
  }
}

function openMessageDatabase(
  absolutePath: string,
  filename: string,
  domain: 'biz' | 'regular',
): { inventory: SourceInventoryUnit[]; source: MessageDatabaseSource | null } {
  const db = new DatabaseSync(absolutePath, { readOnly: true })
  try {
    const allTables = listMessageTables(db)
    let idToName: Map<number, string>
    try {
      idToName = loadMessageName2Id(db)
    } catch {
      const inventory = [...allTables].map((table) => {
        const count = rowCount(db, table)
        const columns = tableColumns(db, table)
        const valid = [...REQUIRED_MESSAGE_COLUMNS].every((column) => columns.has(column))
        return inventoryUnit(
          domain,
          filename,
          table,
          count,
          valid ? 'missing_name2id_mapping' : 'unsupported_message_schema',
        )
      })
      db.close()
      return { inventory, source: null }
    }
    const tables = new Set<string>()
    const inventory: SourceInventoryUnit[] = []
    for (const table of allTables) {
      const count = rowCount(db, table)
      const columns = tableColumns(db, table)
      const valid = [...REQUIRED_MESSAGE_COLUMNS].every((column) => columns.has(column))
      inventory.push(inventoryUnit(domain, filename, table, count, valid ? null : 'unsupported_message_schema'))
      if (valid) tables.add(table)
    }
    const conversationUsernames = new Set(
      [...idToName.values()].filter((username) => tables.has(`Msg_${md5(username)}`)),
    )
    if (tables.size === 0) {
      db.close()
      return { inventory, source: null }
    }
    return { inventory, source: { db, domain, filename, tables, idToName, conversationUsernames } }
  } catch {
    db.close()
    return {
      inventory: [inventoryUnit(domain, filename, '*', 0, 'unsupported_message_schema')],
      source: null,
    }
  }
}

function tableInventory(absolutePath: string, filename: string, domain: SourceDomain) {
  const db = new DatabaseSync(absolutePath, { readOnly: true })
  try {
    const wanted = domain === 'media'
      ? ['VoiceInfo']
      : domain === 'resource'
        ? ['MessageResourceInfo', 'MessageResourceDetail']
        : (db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
            .all() as Array<{ name: string }>).map((row) => row.name)
    const available = new Set(
      (db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{ name: string }>).map((row) => row.name),
    )
    return wanted.map((table) => inventoryUnit(
      domain,
      filename,
      table,
      available.has(table) ? rowCount(db, table) : 0,
      domain === 'media'
        ? 'deferred_media_adapter'
        : domain === 'resource'
          ? 'deferred_resource_adapter'
          : 'unknown_database_domain',
    ))
  } finally {
    db.close()
  }
}

export function openSnapshotSources(snapshotDir: string): OpenSnapshotSources {
  const inventory: SourceInventoryUnit[] = []
  const messageSources: MessageDatabaseSource[] = []
  try {
    for (const source of discoverSourceDatabases(snapshotDir)) {
      if (source.domain === 'regular' || source.domain === 'biz') {
        const opened = openMessageDatabase(source.absolutePath, source.filename, source.domain)
        inventory.push(...opened.inventory)
        if (opened.source) messageSources.push(opened.source)
      } else {
        inventory.push(...tableInventory(source.absolutePath, source.filename, source.domain))
      }
    }
    return { inventory, messageSources }
  } catch (error) {
    for (const source of messageSources) source.db.close()
    throw error
  }
}

export function closeSnapshotSources(sources: readonly MessageDatabaseSource[]) {
  for (const source of sources) source.db.close()
}
