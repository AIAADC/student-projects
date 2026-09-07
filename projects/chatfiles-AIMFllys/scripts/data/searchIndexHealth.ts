import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import {
  derivedSearchStatusSchema,
  type DerivedSearchStatus,
} from '../../shared/contracts/dataStatus.js'
import { classifySearchIndex } from '../../shared/contracts/searchStatus.js'

type MetadataRow = {
  schema_version: number
  source_fingerprint: string
  chunk_count: number
  embedding_model: string | null
  embedding_dimensions: number | null
}

export function inspectDerivedSearch(
  dataRoot: string,
  expectedFingerprint: string | null,
): DerivedSearchStatus {
  const filename = path.join(dataRoot, 'ai-index.current.db')
  if (!fs.existsSync(filename)) {
    return derivedSearchStatusSchema.parse({ state: 'missing',issues: ['search_index_missing'] })
  }
  let database: DatabaseSync | undefined
  try {
    const stat = fs.lstatSync(filename)
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('unsafe index')
    database = new DatabaseSync(filename, { readOnly: true })
    const metadata = database.prepare(`SELECT
      schema_version,source_fingerprint,chunk_count,embedding_model,embedding_dimensions
      FROM search_metadata WHERE singleton=1`).get() as MetadataRow | undefined
    if (!metadata) throw new Error('missing metadata')
    const count = (table: 'search_chunks' | 'search_vectors') => Number((database!.prepare(
      `SELECT count(*) AS count FROM ${table}`,
    ).get() as { count: number }).count)
    const integrity = database.prepare('PRAGMA integrity_check').get() as { integrity_check?: string }
    return classifySearchIndex({
      schemaVersion: metadata.schema_version,sourceFingerprint: metadata.source_fingerprint,
      declaredChunkCount: metadata.chunk_count,actualChunkCount: count('search_chunks'),
      vectorCount: count('search_vectors'),embeddingModel: metadata.embedding_model,
      embeddingDimensions: metadata.embedding_dimensions,integrityOk: integrity.integrity_check === 'ok',
    }, expectedFingerprint)
  } catch {
    return derivedSearchStatusSchema.parse({ state: 'invalid',issues: ['search_index_invalid'] })
  } finally { database?.close() }
}
