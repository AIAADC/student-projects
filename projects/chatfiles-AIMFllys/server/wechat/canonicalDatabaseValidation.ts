import type { DatabaseSync } from 'node:sqlite'

import { resolveArchiveTimeZone } from '../../shared/time/archiveTime.js'

export const canonicalV2Schema = {
  people: ['person_id', 'owner', 'username', 'display_name', 'display_name_source', 'evidence_json'],
  contacts: ['account', 'owner', 'username', 'display', 'nick', 'remark', 'alias', 'is_group'],
  conversations: [
    'id', 'account', 'owner', 'owner_person_id', 'peer_person_id', 'username', 'display', 'is_group',
    'msg_count', 'text_count', 'first_time', 'last_time', 'summary',
  ],
  messages: [
    'conv_id', 'message_uid', 'seq', 'canonical_seq', 'occurred_at_epoch_s', 'time_precision',
    'archive_day', 'source_adapter', 'source_snapshot', 'source_db', 'source_table', 'local_id',
    'server_id', 'sort_seq', 'source_sort_seq', 'time', 'sender', 'person_id', 'sender_name',
    'sender_name_snapshot', 'sender_prefix', 'is_own', 'sender_source', 'sender_audit', 'raw_type',
    'type', 'type_label', 'content_kind', 'structured_content_json', 'text',
  ],
  source_inventory: [
    'source_snapshot', 'domain', 'source_db', 'source_table', 'discovered_rows', 'parsed_rows',
    'deduplicated_rows', 'excluded_rows', 'exclusion_reason',
  ],
  parse_runs: [
    'run_id', 'status', 'completed_at', 'schema_version', 'time_zone', 'selected_snapshot_count',
    'selected_source_count', 'source_unit_count', 'source_conversation_count', 'source_message_count',
    'excluded_source_row_count', 'output_conversation_count', 'output_message_count',
    'output_text_count', 'deduplicated_message_count',
  ],
  bundle_metadata: ['key', 'value'],
} as const

const countNames = [
  'selected_snapshot_count',
  'selected_source_count',
  'source_unit_count',
  'source_conversation_count',
  'source_message_count',
  'excluded_source_row_count',
  'output_conversation_count',
  'output_message_count',
  'output_text_count',
  'deduplicated_message_count',
] as const

function numericCounts(run: Record<string, unknown>) {
  if (countNames.some((name) => typeof run[name] !== 'number' || !Number.isSafeInteger(run[name]))) return null
  return Object.fromEntries(countNames.map((name) => [name, Number(run[name])])) as Record<
    (typeof countNames)[number],
    number
  >
}

function scalar(db: DatabaseSync, sql: string) {
  const row = db.prepare(sql).get() as { value?: number | bigint } | undefined
  return Number(row?.value ?? 0)
}

function receiptIssue(db: DatabaseSync, run: Record<string, unknown>) {
  const counts = numericCounts(run)
  if (!counts) return 'The parse run contains missing or invalid count metadata.'
  if (
    counts.selected_snapshot_count <= 0
    || counts.selected_source_count <= 0
    || counts.source_unit_count <= 0
    || counts.source_conversation_count <= 0
    || counts.source_message_count <= 0
    || counts.output_conversation_count <= 0
    || counts.output_message_count <= 0
    || counts.output_text_count < 0
    || counts.output_text_count > counts.output_message_count
    || counts.deduplicated_message_count < 0
    || counts.excluded_source_row_count < 0
    || counts.source_conversation_count !== counts.output_conversation_count
    || counts.source_message_count !== counts.output_message_count + counts.deduplicated_message_count
  ) return 'The parse run count metadata is empty or does not close.'

  const actual = {
    conversations: scalar(db, 'SELECT count(*) AS value FROM conversations'),
    messages: scalar(db, 'SELECT count(*) AS value FROM messages'),
    text: scalar(db, "SELECT count(*) AS value FROM messages WHERE type=1 AND length(text)>0"),
    units: scalar(db, 'SELECT count(*) AS value FROM source_inventory'),
    parsed: scalar(db, 'SELECT COALESCE(sum(parsed_rows),0) AS value FROM source_inventory'),
    deduplicated: scalar(db, 'SELECT COALESCE(sum(deduplicated_rows),0) AS value FROM source_inventory'),
    excluded: scalar(db, 'SELECT COALESCE(sum(excluded_rows),0) AS value FROM source_inventory'),
  }
  if (
    actual.conversations !== counts.output_conversation_count
    || actual.messages !== counts.output_message_count
    || actual.text !== counts.output_text_count
    || actual.units !== counts.source_unit_count
    || actual.parsed !== counts.output_message_count
    || actual.deduplicated !== counts.deduplicated_message_count
    || actual.excluded !== counts.excluded_source_row_count
  ) return 'The parse run receipt does not match canonical rows and source inventory.'
  return null
}

function sequenceIssue(db: DatabaseSync) {
  const invalidAliases = scalar(db, `SELECT count(*) AS value FROM messages
    WHERE canonical_seq<>seq OR occurred_at_epoch_s<>time OR source_sort_seq<>sort_seq
      OR time_precision<>'second'`)
  const invalidConversations = scalar(db, `SELECT count(*) AS value FROM (
    SELECT conv_id,count(*) AS message_count,count(DISTINCT canonical_seq) AS distinct_sequences,
      min(canonical_seq) AS first_sequence,max(canonical_seq) AS last_sequence
    FROM messages GROUP BY conv_id
    HAVING first_sequence<>0 OR last_sequence<>message_count-1 OR distinct_sequences<>message_count
  )`)
  return invalidAliases + invalidConversations > 0
    ? 'Every conversation must have one continuous zero-based canonical sequence with exact aliases.'
    : null
}

export function validateCanonicalV2(db: DatabaseSync) {
  const rows = db.prepare('SELECT * FROM parse_runs LIMIT 2').all() as Array<Record<string, unknown>>
  if (rows.length !== 1) return 'Expected exactly one parse_runs record.'
  const run = rows[0]
  const runId = String(run.run_id ?? '').trim()
  const timeZone = String(run.time_zone ?? '').trim()
  if (!runId || String(run.status ?? '') !== 'complete' || !String(run.completed_at ?? '').trim()) {
    return 'The parse run is not marked complete with run and completion identifiers.'
  }
  if (Number(run.schema_version) !== 2) return 'The current bundle must use canonical schema version 2.'
  try {
    resolveArchiveTimeZone(timeZone)
  } catch {
    return 'The parse run archive time zone is not a valid IANA time zone.'
  }
  const receipt = receiptIssue(db, run)
  if (receipt) return receipt
  if (scalar(db, `SELECT count(*) AS value FROM source_inventory
    WHERE discovered_rows<>parsed_rows+deduplicated_rows+excluded_rows
      OR min(discovered_rows,parsed_rows,deduplicated_rows,excluded_rows)<0`) > 0) {
    return 'The source inventory contains rows that do not close.'
  }
  const sequence = sequenceIssue(db)
  if (sequence) return sequence
  const metadata = new Map(
    (db.prepare('SELECT key,value FROM bundle_metadata').all() as Array<{ key: string; value: string }>)
      .map((row) => [row.key, row.value]),
  )
  if (
    metadata.get('run_id') !== runId
    || metadata.get('schema_version') !== String(run.schema_version)
    || metadata.get('time_zone') !== timeZone
  ) return 'Bundle metadata does not match the canonical parse run.'
  return null
}
