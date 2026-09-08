import path from 'node:path'
import type { DatabaseSync } from 'node:sqlite'

export type ConversationAssetSourceScope = {
  conversationIds: ReadonlyMap<string, string>
  owner: string
  snapshotId: string
  sourceDatabases: readonly string[]
}

export function resolveConversationAssetSourceScope(
  wechat: DatabaseSync,
  sourceSnapshotRoot: string,
): ConversationAssetSourceScope {
  const snapshotId = path.basename(path.resolve(sourceSnapshotRoot))
  const rows = wechat.prepare(`
    SELECT DISTINCT c.id,c.owner,c.username
    FROM messages m JOIN conversations c ON c.id=m.conv_id
    WHERE m.source_snapshot=?
    ORDER BY c.owner,c.username,c.id
  `).all(snapshotId) as Array<{ id: string; owner: string; username: string }>
  if (rows.length === 0) throw new Error(`Canonical snapshot scope is missing: ${snapshotId}`)

  const owners = new Set(rows.map((row) => row.owner))
  if (owners.size !== 1) throw new Error(`Canonical snapshot owner scope is ambiguous: ${snapshotId}`)
  const conversationIds = new Map<string, string>()
  for (const row of rows) {
    const existing = conversationIds.get(row.username)
    if (existing && existing !== row.id) {
      throw new Error(`Canonical conversation scope is ambiguous: ${snapshotId}/${row.username}`)
    }
    conversationIds.set(row.username, row.id)
  }

  const inventoryRows = wechat.prepare(`
    SELECT DISTINCT source_db
    FROM source_inventory
    WHERE source_snapshot=? AND domain IN ('regular','biz') AND parsed_rows>0
    ORDER BY source_db
  `).all(snapshotId) as Array<{ source_db: string }>
  const sourceDatabases = inventoryRows.map((row) => row.source_db)
  if (sourceDatabases.length === 0) {
    throw new Error(`Canonical source inventory is empty: ${snapshotId}`)
  }
  const inventoried = new Set(sourceDatabases)
  const messageSources = wechat.prepare(`
    SELECT DISTINCT source_db FROM messages WHERE source_snapshot=? ORDER BY source_db
  `).all(snapshotId) as Array<{ source_db: string }>
  for (const row of messageSources) {
    if (!inventoried.has(row.source_db)) {
      throw new Error(`Canonical source inventory is missing shard: ${row.source_db}`)
    }
  }
  return {
    conversationIds,
    owner: [...owners][0]!,
    snapshotId,
    sourceDatabases,
  }
}
