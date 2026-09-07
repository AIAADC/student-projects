import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync, type StatementSync } from 'node:sqlite'
import { relativePathWithinRoot, type ResourceMessageProbe } from './assetEvidence.js'
import type { AssetCanonicalMessage } from './conversationAssetModel.js'
import type { ResourceFileCandidate } from './resourceFileMatcher.js'
import { discoverSourceDatabases } from '../../pipeline/wechat/sourceInventory.js'

export type ConversationAssetCounts = {
  all: number
  work: number
  document: number
  skill: number
  link: number
  chatText: number
}

export type ConversationAssetMetrics = {
  resources: number
  sources: number
  assets: number
  associations: number
  candidates: number
  materializations: number
  quarantined: number
  exactAlignments: number
  partialAlignments: number
  missingAlignments: number
  conflictingAlignments: number
  confirmedAssociations: number
  unconfirmedAssociations: number
  ready: number
  notAttempted: number
  unavailable: number
  voiceAttempts: number
}

export type ConversationAssetBuildResult = {
  bundleDir: string
  databasePath: string
  indexPath: string
  counts: ConversationAssetCounts
  metrics: ConversationAssetMetrics
}

export type ResourceRow = {
  message_id: bigint
  chat_id: bigint
  message_local_type: bigint
  message_create_time: bigint
  message_local_id: bigint
  message_svr_id: bigint
  message_origin_source: bigint
  message_packed_info: Uint8Array | null
  resource_id: bigint
  resource_type: bigint
  resource_size: bigint
  detail_status: bigint
  data_index: string | null
  detail_packed_info: Uint8Array | null
}

export type OutputMessageRow = {
  conv_id: string
  message_uid: string
  canonical_seq: number
  occurred_at_epoch_s: number
  source_snapshot: string
  source_adapter: 'biz' | 'regular'
  source_db: string
  source_table: string
  local_id: number
  server_id: string | null
  sender_name: string
  raw_type: string
  type: number
  structured_content_json: string
  text: string
  username: string
}

export const RESOURCE_QUERY = `
  SELECT
    i.message_id,
    i.chat_id,
    i.message_local_type,
    i.message_create_time,
    i.message_local_id,
    i.message_svr_id,
    i.message_origin_source,
    i.packed_info AS message_packed_info,
    d.resource_id,
    d.type AS resource_type,
    d.size AS resource_size,
    d.status AS detail_status,
    d.data_index,
    d.packed_info AS detail_packed_info
  FROM MessageResourceInfo i
  JOIN MessageResourceDetail d ON d.message_id=i.message_id
  ORDER BY i.message_id, d.resource_id
`

export const MESSAGE_COLUMNS = `
  m.conv_id, m.message_uid, m.canonical_seq, m.occurred_at_epoch_s,
  m.source_snapshot, m.source_adapter, m.source_db, m.source_table, m.local_id,
  m.server_id, m.sender_name, CAST(m.raw_type AS TEXT) AS raw_type, m.type,
  m.structured_content_json, m.text,
  c.username
`

export const CANONICAL_LOCAL_LOOKUP_PREDICATE = `
  m.source_snapshot=? AND m.conv_id=? AND m.source_db=? AND m.source_table=? AND m.local_id=?
`

export const CANONICAL_SERVER_LOOKUP_PREDICATE = `
  m.source_snapshot=? AND m.conv_id=? AND m.server_id=?
  AND m.server_id IS NOT NULL AND trim(m.server_id)<>'' AND m.server_id<>'0'
`

export function safeInteger(value: bigint, label: string) {
  const number = Number(value)
  if (!Number.isSafeInteger(number)) throw new RangeError(`${label} is outside the safe integer range`)
  return number
}

export function normalizeServerId(value: string | bigint | number | null | undefined) {
  const normalized = value === null || value === undefined ? '' : String(value).trim()
  return normalized === '' || normalized === '0' ? null : normalized
}

export function appendUnique(target: string[], values: readonly string[]) {
  for (const value of values) if (!target.includes(value)) target.push(value)
}

export function packedInfoPayloadDigest(...values: Array<Uint8Array | null>) {
  const digest = crypto.createHash('sha256')
  for (const value of values) {
    digest.update(Buffer.from([0]))
    if (value) digest.update(value)
  }
  return `sha256:${digest.digest('hex')}`
}

export function assertSafeRunId(runId: string) {
  if (!/^[0-9A-Za-z._-]{1,100}$/u.test(runId)) throw new Error('runId contains unsafe characters')
}

export function assertInputFile(target: string, label: string) {
  if (!fs.existsSync(target) || !fs.statSync(target).isFile()) throw new Error(`${label} is missing`)
}

function walkFiles(root: string, visit: (file: string) => void) {
  const stack = [root]
  while (stack.length > 0) {
    const current = stack.pop()
    if (!current) continue
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const target = path.join(current, entry.name)
      if (entry.isSymbolicLink()) continue
      if (entry.isDirectory()) stack.push(target)
      else if (entry.isFile()) visit(target)
    }
  }
}

export function discoverResourceFiles(accountRoot: string) {
  const rootRealPath = fs.realpathSync(accountRoot)
  const candidates: ResourceFileCandidate[] = []
  const messageRoot = path.join(rootRealPath, 'msg')
  if (!fs.existsSync(messageRoot) || !fs.statSync(messageRoot).isDirectory()) return candidates
  walkFiles(messageRoot, (filePath) => {
    const targetRealPath = fs.realpathSync(filePath)
    const contained = relativePathWithinRoot(rootRealPath, targetRealPath)
    if (!contained.safe) return
    const stat = fs.statSync(targetRealPath)
    candidates.push({
      relativePath: contained.relative_path,
      name: path.basename(targetRealPath),
      size: stat.size,
      absolutePath: targetRealPath,
    })
  })
  return candidates
}

function quoteMessageTable(table: string) {
  if (!/^Msg_[0-9a-f]{32}$/u.test(table)) throw new Error('Unsafe message table name')
  return `"${table}"`
}

export function openSourceDatabases(
  sourceSnapshotRoot: string,
  requiredSourceDatabases?: readonly string[],
) {
  const result = new Map<string, DatabaseSync>()
  const discovered = discoverSourceDatabases(sourceSnapshotRoot)
    .filter((source) => source.domain === 'regular' || source.domain === 'biz')
  const byName = new Map(discovered.map((source) => [source.filename, source]))
  const filenames = requiredSourceDatabases?.length
    ? [...new Set(requiredSourceDatabases)].sort()
    : [...byName.keys()].sort()
  try {
    for (const filename of filenames) {
      const source = byName.get(filename)
      if (!source) throw new Error(`Canonical source shard is missing: ${filename}`)
      result.set(filename, new DatabaseSync(source.absolutePath, { readOnly: true }))
    }
  } catch (error) {
    for (const database of result.values()) database.close()
    throw error
  }
  if (result.size === 0) throw new Error('No source message shards were found')
  return result
}

export function sourceOriginReader(databases: ReadonlyMap<string, DatabaseSync>) {
  const statements = new Map<string, StatementSync>()
  return (sourceDb: string, sourceTable: string, localId: number) => {
    const database = databases.get(sourceDb)
    if (!database) throw new Error('Canonical source shard is missing')
    const key = `${sourceDb}\0${sourceTable}`
    let statement = statements.get(key)
    if (!statement) {
      statement = database.prepare(
        `SELECT origin_source FROM ${quoteMessageTable(sourceTable)} WHERE local_id=?`,
      )
      statements.set(key, statement)
    }
    const row = statement.get(localId) as { origin_source?: number } | undefined
    if (!row || !Number.isSafeInteger(Number(row.origin_source))) {
      throw new Error('Canonical source message origin is missing')
    }
    return Number(row.origin_source)
  }
}

export function toAssetMessage(
  row: OutputMessageRow,
  messageOriginSource: number,
): AssetCanonicalMessage {
  return {
    conv_id: row.conv_id,
    message_uid: row.message_uid,
    canonical_seq: Number(row.canonical_seq),
    occurred_at_epoch_s: Number(row.occurred_at_epoch_s),
    source_snapshot: row.source_snapshot,
    source_adapter: row.source_adapter,
    source_db: row.source_db,
    chat_table: row.username,
    message_table: row.source_table,
    local_id: Number(row.local_id),
    normalized_type: Number(row.type),
    raw_type: String(row.raw_type),
    create_time: Number(row.occurred_at_epoch_s),
    server_id: normalizeServerId(row.server_id),
    message_origin_source: messageOriginSource,
    conversation_username: row.username,
    sender_name: row.sender_name,
    structured_content_json: row.structured_content_json,
    text: row.text,
  }
}

export function emptyConversationAssetMetrics(): ConversationAssetMetrics {
  return {
    resources: 0,
    sources: 0,
    assets: 0,
    associations: 0,
    candidates: 0,
    materializations: 0,
    quarantined: 0,
    exactAlignments: 0,
    partialAlignments: 0,
    missingAlignments: 0,
    conflictingAlignments: 0,
    confirmedAssociations: 0,
    unconfirmedAssociations: 0,
    ready: 0,
    notAttempted: 0,
    unavailable: 0,
    voiceAttempts: 0,
  }
}

export type ResourceAlignmentContext = {
  message: AssetCanonicalMessage | null
  candidates: import('./assetEvidence.js').CanonicalMessage[]
  alignment: ReturnType<typeof import('./assetEvidence.js').alignResourceMessage>
  lookupEvidence: string[]
  messagePackedInfo: Uint8Array | null
  messagePackedInfoValid: boolean
  chatScope: string
}

export type ResourceProbe = ResourceMessageProbe
