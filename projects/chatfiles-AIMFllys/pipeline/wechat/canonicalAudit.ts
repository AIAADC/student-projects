import type { DatabaseSync } from 'node:sqlite'
import { archiveDay, resolveArchiveTimeZone } from './archiveTime.js'
import { canonicalPersonId } from './personIdentity.js'

export type CanonicalAuditIssue = { code: string; count: number; detail: string }

function issue(code: string, count: number, detail: string): CanonicalAuditIssue[] {
  return count > 0 ? [{ code, count, detail }] : []
}

function scalar(db: DatabaseSync, sql: string, ...params: Array<string | number>) {
  const row = db.prepare(sql).get(...params) as { value?: number | bigint } | undefined
  return Number(row?.value ?? 0)
}

export function auditCanonicalV2(db: DatabaseSync): CanonicalAuditIssue[] {
  const issues: CanonicalAuditIssue[] = []
  const run = db.prepare('SELECT * FROM parse_runs').get() as Record<string, unknown> | undefined
  if (!run) return issues
  const timeZone = String(run.time_zone ?? '')
  try {
    resolveArchiveTimeZone(timeZone)
  } catch {
    issues.push({ code: 'archive-time-zone-invalid', count: 1, detail: 'The bundle time zone must be a valid IANA zone.' })
  }

  issues.push(...issue(
    'canonical-schema-version',
    Number(run.schema_version) === 2 ? 0 : 1,
    'The canonical message bundle must use schema version 2.',
  ))
  issues.push(...issue(
    'source-inventory-count-mismatch',
    scalar(db, `SELECT count(*) AS value FROM source_inventory
      WHERE discovered_rows<>parsed_rows+deduplicated_rows+excluded_rows
         OR min(discovered_rows,parsed_rows,deduplicated_rows,excluded_rows)<0`),
    'Every source unit must close discovered rows into parsed, deduplicated, or explicitly excluded rows.',
  ))

  const inventory = db.prepare(`SELECT count(*) AS units,
    COALESCE(sum(parsed_rows),0) AS parsed,
    COALESCE(sum(deduplicated_rows),0) AS deduplicated,
    COALESCE(sum(excluded_rows),0) AS excluded
    FROM source_inventory`).get() as Record<string, number | bigint>
  const inventoryMismatch = [
    Number(inventory.units) !== Number(run.source_unit_count),
    Number(inventory.parsed) !== Number(run.output_message_count),
    Number(inventory.deduplicated) !== Number(run.deduplicated_message_count),
    Number(inventory.excluded) !== Number(run.excluded_source_row_count),
  ].filter(Boolean).length
  issues.push(...issue(
    'source-inventory-run-mismatch',
    inventoryMismatch,
    'Source inventory totals must equal the parse completion receipt.',
  ))

  issues.push(...issue(
    'canonical-message-fields-invalid',
    scalar(db, `SELECT count(*) AS value FROM messages
      WHERE canonical_seq<>seq OR occurred_at_epoch_s<>time OR source_sort_seq<>sort_seq
         OR time_precision<>'second' OR archive_day NOT GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
         OR source_adapter NOT IN ('regular','biz')
         OR content_kind NOT IN ('text','app','media','system','unknown')
         OR json_valid(structured_content_json)<>1`),
    'Canonical aliases, precision, source adapter, day, content kind, and structured JSON must agree.',
  ))
  issues.push(...issue(
    'same-second-source-order-mismatch',
    scalar(db, `WITH ordered AS (
      SELECT source_sort_seq,source_adapter,source_db,local_id,
        lag(source_sort_seq) OVER w AS previous_sort_seq,
        lag(CASE source_adapter WHEN 'regular' THEN 0 WHEN 'biz' THEN 1 ELSE 2 END)
          OVER w AS previous_adapter_order,
        lag(source_db) OVER w AS previous_source_db,
        lag(local_id) OVER w AS previous_local_id
      FROM messages
      WINDOW w AS (PARTITION BY conv_id,occurred_at_epoch_s ORDER BY canonical_seq)
    )
    SELECT count(*) AS value FROM ordered
    WHERE previous_sort_seq>source_sort_seq
       OR (previous_sort_seq=source_sort_seq AND previous_adapter_order>
         CASE source_adapter WHEN 'regular' THEN 0 WHEN 'biz' THEN 1 ELSE 2 END)
       OR (previous_sort_seq=source_sort_seq AND previous_adapter_order=
         CASE source_adapter WHEN 'regular' THEN 0 WHEN 'biz' THEN 1 ELSE 2 END
         AND previous_source_db>source_db)
       OR (previous_sort_seq=source_sort_seq AND previous_adapter_order=
         CASE source_adapter WHEN 'regular' THEN 0 WHEN 'biz' THEN 1 ELSE 2 END
         AND previous_source_db=source_db AND previous_local_id>local_id)`),
    'Same-second messages must follow source sort, adapter, shard, and local-id evidence order.',
  ))

  let dayMismatches = 0
  if (timeZone) {
    const rows = db.prepare('SELECT occurred_at_epoch_s,archive_day FROM messages').iterate() as Iterable<{
      occurred_at_epoch_s: number
      archive_day: string
    }>
    try {
      for (const row of rows) {
        if (archiveDay(Number(row.occurred_at_epoch_s), timeZone) !== row.archive_day) dayMismatches++
      }
    } catch {
      dayMismatches = Math.max(1, dayMismatches)
    }
  }
  issues.push(...issue(
    'archive-day-mismatch',
    dayMismatches,
    'Every message day must be derived from occurred_at_epoch_s in the bundle time zone.',
  ))

  const people = new Map(
    (db.prepare('SELECT person_id,owner,username FROM people').all() as Array<Record<string, unknown>>)
      .map((row) => [String(row.person_id), { owner: String(row.owner), username: String(row.username) }]),
  )
  let personIdMismatches = 0
  for (const [personId, person] of people) {
    try {
      if (canonicalPersonId(person.owner, person.username) !== personId) personIdMismatches++
    } catch {
      personIdMismatches++
    }
  }
  issues.push(...issue(
    'person-id-mismatch',
    personIdMismatches,
    'Person ids must be stable owner-scoped hashes of canonical usernames.',
  ))
  issues.push(...issue(
    'message-person-reference-mismatch',
    scalar(db, `SELECT count(*) AS value FROM messages m
      LEFT JOIN conversations c ON c.id=m.conv_id
      LEFT JOIN people p ON p.person_id=m.person_id
      WHERE (trim(m.sender)='' AND m.person_id IS NOT NULL)
         OR (trim(m.sender)<>'' AND (p.person_id IS NULL OR p.owner<>c.owner OR p.username<>m.sender))`),
    'Known senders must resolve to the exact owner-scoped person; unknown senders remain nullable.',
  ))
  issues.push(...issue(
    'foreign-key-violation',
    scalar(db, 'SELECT count(*) AS value FROM pragma_foreign_key_check'),
    'Canonical conversations, messages, and people must satisfy every foreign key.',
  ))

  const metadata = new Map(
    (db.prepare('SELECT key,value FROM bundle_metadata').all() as Array<{ key: string; value: string }>)
      .map((row) => [row.key, row.value]),
  )
  issues.push(...issue(
    'bundle-metadata-mismatch',
    Number(metadata.get('run_id') !== String(run.run_id))
      + Number(metadata.get('schema_version') !== String(run.schema_version))
      + Number(metadata.get('time_zone') !== timeZone),
    'Bundle metadata must bind the run id, schema version, and archive time zone.',
  ))
  return issues
}
