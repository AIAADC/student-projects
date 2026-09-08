import fs from 'node:fs'
import path from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import { hasMaterializedMediaMagic } from '../../shared/media/mediaMagic.js'
import { relativePathWithinRoot } from './assetEvidence.js'
import { digestFileContent } from './assetContentDigest.js'

function count(database: DatabaseSync, sql: string) {
  return Number(database.prepare(sql).get()?.count ?? 0)
}

function materializationColumns(database: DatabaseSync) {
  return new Set((database.prepare("PRAGMA table_info('asset_materializations')").all() as Array<{
    name: string
  }>).map((row) => row.name))
}

function validMaterializedFormat(filename: string, format: string) {
  return hasMaterializedMediaMagic(fs.readFileSync(filename), format)
}

export function auditMaterializedPaths(
  database: DatabaseSync,
  bundleDir: string,
  addIssue: (code: string, count?: number) => void,
) {
  const columns = materializationColumns(database)
  const required = [
    'materialized_relative_path', 'materialized_size', 'materialized_content_sha256', 'media_format',
  ]
  if (required.some((column) => !columns.has(column))) {
    addIssue('dat-materialization-overstated', count(database, `
      SELECT count(*) AS count FROM asset_sources s
      JOIN asset_materializations m ON m.source_id=s.source_id
      WHERE lower(s.source_relative_path) LIKE '%.dat' AND m.status<>'not_attempted'
    `))
    return
  }
  addIssue('materialized-output-missing', count(database, `
    SELECT count(*) AS count FROM asset_sources s
    JOIN asset_materializations m ON m.source_id=s.source_id
    WHERE m.status IN('ready','thumbnail_only')
      AND (lower(s.source_relative_path) LIKE '%.dat' OR s.source_kind='voice')
      AND m.materialized_relative_path IS NULL
  `))
  const root = fs.realpathSync(bundleDir)
  const rows = database.prepare(`
    SELECT materialized_relative_path,materialized_size,materialized_content_sha256,media_format
    FROM asset_materializations WHERE materialized_relative_path IS NOT NULL
  `).all() as Array<{
    materialized_relative_path: string
    materialized_size: number | null
    materialized_content_sha256: string | null
    media_format: string | null
  }>
  for (const row of rows) {
    const target = path.resolve(root, ...row.materialized_relative_path.split(/[\\/]+/u))
    try {
      const real = fs.realpathSync(target)
      if (!relativePathWithinRoot(root, real).safe) {
        addIssue('unsafe-materialized-path')
        continue
      }
      const stat = fs.lstatSync(real)
      if (!stat.isFile() || stat.isSymbolicLink()) addIssue('materialized-output-not-file')
      if (row.materialized_size === null || stat.size !== Number(row.materialized_size)) {
        addIssue('materialized-size-mismatch')
      }
      if (!/^sha256:[a-f0-9]{64}$/u.test(row.materialized_content_sha256 ?? '')
        || digestFileContent(real) !== row.materialized_content_sha256) {
        addIssue('materialized-content-digest-mismatch')
      }
      if (!row.media_format || !validMaterializedFormat(real, row.media_format)) {
        addIssue('materialized-media-magic-mismatch')
      }
    } catch {
      addIssue('missing-materialized-output')
    }
  }
}
