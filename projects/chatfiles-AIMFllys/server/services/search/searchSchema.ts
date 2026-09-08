import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { derivedSearchStatusSchema, type DerivedSearchStatus } from '../../../shared/contracts/dataStatus.js'
import {
  classifySearchIndex,
  SEARCH_INDEX_SCHEMA_VERSION,
} from '../../../shared/contracts/searchStatus.js'
import type { EmbeddingFingerprint, SearchChunk, SearchIndexMetadata } from './searchTypes.js'

export const SEARCH_SCHEMA_VERSION = SEARCH_INDEX_SCHEMA_VERSION

export function createSearchSchema(
  db: DatabaseSync,
  input: { sourceFingerprint: string } & Partial<EmbeddingFingerprint>,
) {
  db.exec(`
    PRAGMA foreign_keys=ON;
    CREATE TABLE search_metadata(
      singleton INTEGER PRIMARY KEY CHECK(singleton=1), schema_version INTEGER NOT NULL,
      source_fingerprint TEXT NOT NULL, chunk_count INTEGER NOT NULL DEFAULT 0,
      embedding_model TEXT, embedding_dimensions INTEGER
    ) STRICT;
    CREATE TABLE search_chunks(
      id INTEGER PRIMARY KEY, chunk_id TEXT NOT NULL UNIQUE, conversation_id TEXT NOT NULL,
      first_message_uid TEXT NOT NULL, last_message_uid TEXT NOT NULL,
      first_sequence INTEGER NOT NULL, last_sequence INTEGER NOT NULL,
      start_time INTEGER NOT NULL, end_time INTEGER NOT NULL, sender_ids TEXT NOT NULL,
      text TEXT NOT NULL, ngrams TEXT NOT NULL, token_count INTEGER NOT NULL
    ) STRICT;
    CREATE INDEX search_chunks_scope ON search_chunks(conversation_id,first_sequence,last_sequence);
    CREATE VIRTUAL TABLE search_chunks_fts USING fts5(
      text, ngrams, content='search_chunks', content_rowid='id', tokenize='unicode61 remove_diacritics 2'
    );
    CREATE TABLE search_vectors(
      chunk_id TEXT PRIMARY KEY REFERENCES search_chunks(chunk_id) ON DELETE CASCADE,
      model TEXT NOT NULL, dimensions INTEGER NOT NULL, vector BLOB NOT NULL
    ) STRICT;
  `)
  db.prepare(`
    INSERT INTO search_metadata(
      singleton,schema_version,source_fingerprint,chunk_count,embedding_model,embedding_dimensions
    ) VALUES(1,?,?,?,?,?)
  `).run(
    SEARCH_SCHEMA_VERSION,
    input.sourceFingerprint,
    0,
    input.embeddingModel ?? null,
    input.embeddingDimensions ?? null,
  )
}

export function readSearchMetadata(db: DatabaseSync): SearchIndexMetadata | null {
  try {
    const row = db.prepare(`
      SELECT schema_version,source_fingerprint,chunk_count,embedding_model,embedding_dimensions
      FROM search_metadata WHERE singleton=1
    `).get() as {
      schema_version: number
      source_fingerprint: string
      chunk_count: number
      embedding_model: string | null
      embedding_dimensions: number | null
    } | undefined
    return row ? {
      schemaVersion: row.schema_version,
      sourceFingerprint: row.source_fingerprint,
      chunkCount: row.chunk_count,
      embeddingModel: row.embedding_model,
      embeddingDimensions: row.embedding_dimensions,
    } : null
  } catch {
    return null
  }
}

export function insertSearchChunks(db: DatabaseSync, chunks: readonly SearchChunk[]) {
  const insertChunk = db.prepare(`
    INSERT INTO search_chunks(
      chunk_id,conversation_id,first_message_uid,last_message_uid,first_sequence,last_sequence,
      start_time,end_time,sender_ids,text,ngrams,token_count
    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
  `)
  const insertFts = db.prepare('INSERT INTO search_chunks_fts(rowid,text,ngrams) VALUES(?,?,?)')
  db.exec('BEGIN IMMEDIATE')
  try {
    for (const chunk of chunks) {
      const result = insertChunk.run(
        chunk.chunkId, chunk.conversationId, chunk.firstMessageUid, chunk.lastMessageUid,
        chunk.firstSequence, chunk.lastSequence,
        chunk.startTime, chunk.endTime, JSON.stringify(chunk.senderIds), chunk.text,
        chunk.ngrams, chunk.tokenCount,
      )
      insertFts.run(result.lastInsertRowid, chunk.text, chunk.ngrams)
    }
    db.prepare('UPDATE search_metadata SET chunk_count=(SELECT count(*) FROM search_chunks) WHERE singleton=1').run()
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

export function validateSearchMetadata(
  db: DatabaseSync,
  expected: { sourceFingerprint: string } & Partial<EmbeddingFingerprint>,
) {
  const metadata = readSearchMetadata(db)
  if (!metadata || metadata.schemaVersion !== SEARCH_SCHEMA_VERSION) {
    return { ok: false as const, code: 'schema_mismatch' as const }
  }
  if (metadata.sourceFingerprint !== expected.sourceFingerprint) {
    return { ok: false as const, code: 'source_mismatch' as const }
  }
  if (
    expected.embeddingModel !== undefined
    && (metadata.embeddingModel !== expected.embeddingModel
      || metadata.embeddingDimensions !== (expected.embeddingDimensions ?? null))
  ) return { ok: false as const, code: 'embedding_mismatch' as const }
  return { ok: true as const }
}

export function inspectSearchIndexStatus(
  filenameInput: string,
  expectedFingerprint: string | null,
): DerivedSearchStatus {
  const filename = path.resolve(filenameInput)
  if (!fs.existsSync(filename)) {
    return derivedSearchStatusSchema.parse({ state: 'missing',issues: ['search_index_missing'] })
  }
  let database: DatabaseSync | undefined
  try {
    const stat = fs.lstatSync(filename)
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('unsafe index')
    database = new DatabaseSync(filename, { readOnly: true })
    const integrity = database.prepare('PRAGMA integrity_check').get() as { integrity_check?: string }
    const metadata = readSearchMetadata(database)
    const chunkCount = Number((database.prepare(
      'SELECT count(*) AS count FROM search_chunks',
    ).get() as { count: number }).count)
    const vectorCount = Number((database.prepare(
      'SELECT count(*) AS count FROM search_vectors',
    ).get() as { count: number }).count)
    if (!metadata) throw new Error('invalid index')
    return classifySearchIndex({
      schemaVersion: metadata.schemaVersion,sourceFingerprint: metadata.sourceFingerprint,
      declaredChunkCount: metadata.chunkCount,actualChunkCount: chunkCount,vectorCount,
      embeddingModel: metadata.embeddingModel,embeddingDimensions: metadata.embeddingDimensions,
      integrityOk: integrity.integrity_check === 'ok',
    }, expectedFingerprint)
  } catch {
    return derivedSearchStatusSchema.parse({ state: 'invalid',issues: ['search_index_invalid'] })
  } finally {
    database?.close()
  }
}

export function activateSearchIndex(stagingPath: string, currentPath: string) {
  const staging = path.resolve(stagingPath)
  const current = path.resolve(currentPath)
  if (path.dirname(staging) !== path.dirname(current)) throw new Error('staging_directory_mismatch')
  if (staging === current || !fs.statSync(staging).isFile()) throw new Error('invalid_staging_index')
  const handle = fs.openSync(staging, 'r+')
  try { fs.fsyncSync(handle) } finally { fs.closeSync(handle) }
  try {
    fs.renameSync(staging, current)
    return
  } catch (error) {
    if (!fs.existsSync(current)) throw error
  }
  const backup = `${current}.previous-${process.pid}`
  fs.renameSync(current, backup)
  try {
    fs.renameSync(staging, current)
    fs.rmSync(backup)
  } catch (error) {
    if (!fs.existsSync(current) && fs.existsSync(backup)) fs.renameSync(backup, current)
    throw error
  }
}
