import type { DatabaseSync } from 'node:sqlite'

export type AuditIssue = { code: string; count: number; detail: string }

export function auditColumnNames(db: DatabaseSync, table: string) {
  return new Set(
    (db.prepare(`PRAGMA table_info(${JSON.stringify(table)})`).all() as Array<{ name: string }>).map((row) => row.name),
  )
}

export function auditScalar(db: DatabaseSync, sql: string, ...params: Array<string | number>) {
  const row = db.prepare(sql).get(...params) as { value?: number | bigint } | undefined
  return Number(row?.value ?? 0)
}

export function appendAuditIssue(
  issues: AuditIssue[],
  code: string,
  count: number,
  detail: string,
) {
  if (count > 0) issues.push({ code, count, detail })
}
