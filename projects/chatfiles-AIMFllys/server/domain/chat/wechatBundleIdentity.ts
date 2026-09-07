import type { DatabaseSync } from 'node:sqlite'
import {
  DEFAULT_ARCHIVE_TIME_ZONE,
  resolveArchiveTimeZone,
} from '../../../shared/time/archiveTime.js'

export type WechatBundleIdentity = { runId: string;timeZone: string }

export function readWechatBundleIdentity(database: DatabaseSync): WechatBundleIdentity {
  const columns = new Set((database.prepare('PRAGMA table_info(parse_runs)').all() as Array<{ name: string }>)
    .map((column) => column.name))
  if (!columns.has('run_id')) {
    return { runId: 'legacy',timeZone: DEFAULT_ARCHIVE_TIME_ZONE }
  }
  const projection = columns.has('time_zone') ? 'run_id,time_zone' : 'run_id,NULL AS time_zone'
  const row = database.prepare(`SELECT ${projection} FROM parse_runs LIMIT 1`).get() as
    { run_id?: unknown;time_zone?: unknown } | undefined
  const configured = String(row?.time_zone ?? '').trim()
  return {
    runId: String(row?.run_id ?? 'legacy'),
    timeZone: configured ? resolveArchiveTimeZone(configured) : DEFAULT_ARCHIVE_TIME_ZONE,
  }
}
