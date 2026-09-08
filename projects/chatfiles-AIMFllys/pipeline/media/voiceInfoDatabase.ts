import type { DatabaseSync } from 'node:sqlite'
import {
  alignVoiceInfo,
  type VoiceAlignment,
  type VoiceCandidate,
  type VoiceInfoEvidence,
} from './voiceInfo.js'

type VoiceInfoRow = {
  source_row_id: string
  chat_name_id: number
  create_time: number
  local_id: number | null
  server_id: string | null
  voice_data: Uint8Array
  data_index: string | null
}

export type VoiceInfoRecord = {
  sourceDatabase: string
  sourceRowId: string
  evidence: VoiceInfoEvidence
  alignment: VoiceAlignment
  payload: Buffer
}

export type VoiceInfoLimits = {
  maxRows: number
  maxPayloadBytes: number
  maxTotalBytes: number
}

const DEFAULT_LIMITS: VoiceInfoLimits = {
  maxRows: 100_000,
  maxPayloadBytes: 16 * 1024 * 1024,
  maxTotalBytes: 128 * 1024 * 1024,
}

const REQUIRED_COLUMNS = [
  'chat_name_id', 'create_time', 'local_id', 'svr_id', 'voice_data', 'data_index',
] as const

function tableExists(database: DatabaseSync, table: string) {
  return Boolean(database.prepare(
    "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?",
  ).get(table))
}

function tableColumns(database: DatabaseSync, table: string) {
  return new Set((database.prepare(`PRAGMA table_info(${JSON.stringify(table)})`).all() as Array<{
    name: string
  }>).map((row) => row.name))
}

function chatNames(database: DatabaseSync) {
  const table = tableExists(database, 'Name2Id')
    ? 'Name2Id'
    : tableExists(database, 'ChatName2Id')
      ? 'ChatName2Id'
      : null
  if (!table) return new Map<number, string>()
  const columns = tableColumns(database, table)
  if (!columns.has('user_name')) return new Map<number, string>()
  const rows = database.prepare(`
    SELECT rowid AS id,user_name FROM ${table} ORDER BY rowid
  `).all() as Array<{ id: number; user_name: string }>
  return new Map(rows.map((row) => [Number(row.id), String(row.user_name)]))
}

function dataIndexFromStructuredJson(value: string) {
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>
    const direct = parsed.dataIndex ?? parsed.data_index
    if (typeof direct === 'string' || typeof direct === 'number') return String(direct)
    const locator = parsed.mediaLocator
    if (locator && typeof locator === 'object') {
      const nested = (locator as Record<string, unknown>).dataIndex
      if (typeof nested === 'string' || typeof nested === 'number') return String(nested)
    }
  } catch { /* Invalid optional evidence stays unavailable. */ }
  return null
}

function readCandidates(input: {
  canonicalDb: DatabaseSync
  sourceSnapshotId: string
  owner: string
}): VoiceCandidate[] {
  const rows = input.canonicalDb.prepare(`
    SELECT m.message_uid,m.conv_id,c.username,m.local_id,m.server_id,
           m.occurred_at_epoch_s,m.type,m.structured_content_json
    FROM messages m JOIN conversations c ON c.id=m.conv_id
    WHERE m.source_snapshot=? AND c.owner=? AND m.type=34
    ORDER BY m.conv_id,m.canonical_seq
  `).all(input.sourceSnapshotId, input.owner) as Array<{
    message_uid: string
    conv_id: string
    username: string
    local_id: number
    server_id: string
    occurred_at_epoch_s: number
    type: number
    structured_content_json: string
  }>
  return rows.map((row) => ({
    messageUid: row.message_uid,
    conversationId: row.conv_id,
    chatUsername: row.username,
    localId: Number.isSafeInteger(Number(row.local_id)) ? Number(row.local_id) : null,
    serverId: row.server_id && row.server_id !== '0' ? String(row.server_id) : null,
    occurredAtEpochS: Number(row.occurred_at_epoch_s),
    dataIndex: dataIndexFromStructuredJson(row.structured_content_json),
    normalizedType: Number(row.type),
  }))
}

function resolvedLimits(limits: Partial<VoiceInfoLimits> | undefined): VoiceInfoLimits {
  const result = { ...DEFAULT_LIMITS,...limits }
  if (Object.values(result).some((value) => !Number.isSafeInteger(value) || value <= 0)) {
    throw new Error('VOICE_INFO_LIMITS_INVALID')
  }
  return result
}

function readRows(database: DatabaseSync, limits: VoiceInfoLimits): VoiceInfoRow[] {
  if (!tableExists(database, 'VoiceInfo')) throw new Error('VOICE_INFO_SCHEMA_UNSUPPORTED')
  const columns = tableColumns(database, 'VoiceInfo')
  if (REQUIRED_COLUMNS.some((column) => !columns.has(column))) {
    throw new Error('VOICE_INFO_SCHEMA_UNSUPPORTED')
  }
  const budget = database.prepare(`
    SELECT CAST(count(*) AS TEXT) AS row_count,
           CAST(coalesce(max(length(voice_data)),0) AS TEXT) AS max_payload_bytes,
           CAST(coalesce(sum(length(voice_data)),0) AS TEXT) AS total_bytes
    FROM VoiceInfo
  `).get() as {
    row_count: string
    max_payload_bytes: string
    total_bytes: string
  }
  if (BigInt(budget.row_count) > BigInt(limits.maxRows)
    || BigInt(budget.max_payload_bytes) > BigInt(limits.maxPayloadBytes)
    || BigInt(budget.total_bytes) > BigInt(limits.maxTotalBytes)) {
    throw new Error('VOICE_INFO_PAYLOAD_LIMIT_EXCEEDED')
  }
  return database.prepare(`
    SELECT CAST(rowid AS TEXT) AS source_row_id,chat_name_id,create_time,local_id,
           CAST(svr_id AS TEXT) AS server_id,voice_data,data_index
    FROM VoiceInfo ORDER BY rowid
  `).all() as VoiceInfoRow[]
}

export function readVoiceInfoEvidence(input: {
  canonicalDb: DatabaseSync
  mediaDb: DatabaseSync
  sourceSnapshotId: string
  owner: string
  sourceDatabase: string
  limits?: Partial<VoiceInfoLimits>
}): VoiceInfoRecord[] {
  const limits = resolvedLimits(input.limits)
  const names = chatNames(input.mediaDb)
  const candidates = readCandidates(input)
  return readRows(input.mediaDb, limits).map((row) => {
    if (!(row.voice_data instanceof Uint8Array)) throw new Error('VOICE_INFO_SCHEMA_UNSUPPORTED')
    const evidence: VoiceInfoEvidence = {
      chatUsername: names.get(Number(row.chat_name_id)) ?? '',
      localId: row.local_id === null || !Number.isSafeInteger(Number(row.local_id))
        ? null
        : Number(row.local_id),
      serverId: row.server_id && row.server_id !== '0' ? String(row.server_id) : null,
      occurredAtEpochS: Number(row.create_time),
      dataIndex: String(row.data_index ?? ''),
    }
    return {
      sourceDatabase: input.sourceDatabase,
      sourceRowId: row.source_row_id,
      evidence,
      alignment: alignVoiceInfo(evidence, candidates),
      payload: Buffer.from(row.voice_data),
    }
  })
}
