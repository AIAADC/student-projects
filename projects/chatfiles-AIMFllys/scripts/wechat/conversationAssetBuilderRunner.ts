import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { alignResourceMessage, type CanonicalMessage, type ResourceMessageProbe } from './assetEvidence.js'
import { createAssetBundleBinding } from './assetBundleBinding.js'
import { digestFileContent } from './assetContentDigest.js'
import { createAssetRunReceipt, createMaterializationEvidenceDigest } from './assetRunReceipt.js'
import { createResourceArtifact, type AssetCanonicalMessage } from './conversationAssetModel.js'
import { persistConversationAsset } from './conversationAssetMetrics.js'
import { persistConversationMessageArtifacts } from './conversationMessageArtifacts.js'
import { normalizeMessageType } from './messageModel.js'
import { createResourceFileIndex, matchResourceFile } from './resourceFileMatcher.js'
import { parsePackedInfoEvidence } from './resourcePackedInfo.js'
import { artifactCounts, artifactInserter, completeAssetRun, createOutputSchema, startAssetRun } from './conversationAssetBuilderSchema.js'
import { resolveConversationAssetSourceScope } from './conversationAssetSourceScope.js'
import {
  CANONICAL_LOCAL_LOOKUP_PREDICATE,
  CANONICAL_SERVER_LOOKUP_PREDICATE,
  MESSAGE_COLUMNS,
  RESOURCE_QUERY,
  appendUnique,
  assertInputFile,
  assertSafeRunId,
  discoverResourceFiles,
  emptyConversationAssetMetrics,
  normalizeServerId,
  openSourceDatabases,
  packedInfoPayloadDigest,
  safeInteger,
  sourceOriginReader,
  toAssetMessage,
  type ConversationAssetBuildResult,
  type OutputMessageRow,
  type ResourceRow,
} from './conversationAssetBuilderSupport.js'

export function runConversationAssetBuilder(options: {
  wechatDbPath: string
  resourceDbPath: string
  sourceSnapshotRoot: string
  accountRoot: string
  bundleDir: string
  runId: string
}): ConversationAssetBuildResult {
  assertSafeRunId(options.runId)
  assertInputFile(options.wechatDbPath, 'wechat database')
  assertInputFile(options.resourceDbPath, 'resource database')
  if (fs.existsSync(options.bundleDir)) throw new Error('Asset bundle already exists')

  const stagingDir = path.join(
    path.dirname(options.bundleDir),
    `.${path.basename(options.bundleDir)}.${options.runId}.${process.pid}.staging`,
  )
  if (fs.existsSync(stagingDir)) throw new Error('Asset staging bundle already exists')
  fs.mkdirSync(path.dirname(options.bundleDir), { recursive: true })
  fs.mkdirSync(stagingDir)
  const databasePath = path.join(stagingDir, 'artifacts.db')
  const indexPath = path.join(stagingDir, 'index.json')
  fs.closeSync(fs.openSync(databasePath, 'wx'))

  const wechat = new DatabaseSync(options.wechatDbPath, { readOnly: true })
  const resources = new DatabaseSync(options.resourceDbPath, { readOnly: true })
  const sourceDatabases = new Map<string, DatabaseSync>()
  const output = new DatabaseSync(databasePath)
  const metrics = emptyConversationAssetMetrics()

  try {
    const sourceScope = resolveConversationAssetSourceScope(wechat, options.sourceSnapshotRoot)
    const binding = createAssetBundleBinding({
      wechat,
      wechatDbPath: options.wechatDbPath,
      resourceDbPath: options.resourceDbPath,
      sourceSnapshotRoot: options.sourceSnapshotRoot,
      accountRoot: options.accountRoot,
      sourceScope,
    })
    for (const [filename, database] of openSourceDatabases(
      options.sourceSnapshotRoot,
      sourceScope.sourceDatabases,
    )) sourceDatabases.set(filename, database)
    createOutputSchema(output)
    startAssetRun(output, options.runId, binding)
    const insertArtifact = artifactInserter(output, options.runId)
    const persistArtifact = (artifact: ReturnType<typeof createResourceArtifact>) => (
      persistConversationAsset(insertArtifact, metrics, artifact)
    )
    const fileIndex = createResourceFileIndex(discoverResourceFiles(options.accountRoot))
    const contentDigests = new Map<string, string>()
    const chats = new Map<number, string>()
    for (const row of resources.prepare('SELECT rowid AS id, user_name FROM ChatName2Id').all() as Array<{
      id: number
      user_name: string
    }>) {
      chats.set(Number(row.id), row.user_name)
    }
    const canonicalLocalStatement = wechat.prepare(`
      SELECT ${MESSAGE_COLUMNS}
      FROM messages m JOIN conversations c ON c.id=m.conv_id
      WHERE ${CANONICAL_LOCAL_LOOKUP_PREDICATE}
      ORDER BY m.canonical_seq
    `)
    const canonicalServerStatement = wechat.prepare(`
      SELECT ${MESSAGE_COLUMNS}
      FROM messages m JOIN conversations c ON c.id=m.conv_id
      WHERE ${CANONICAL_SERVER_LOOKUP_PREDICATE}
      ORDER BY m.canonical_seq
    `)
    const readOrigin = sourceOriginReader(sourceDatabases)
    const resourceStatement = resources.prepare(RESOURCE_QUERY)
    resourceStatement.setReadBigInts(true)
    const resourceRows = resourceStatement.all() as ResourceRow[]
    const contextCache = new Map<string, {
      message: AssetCanonicalMessage | null
      candidates: CanonicalMessage[]
      alignment: ReturnType<typeof alignResourceMessage>
      lookupEvidence: string[]
      filenames: string[]
      messagePackedInfo: Uint8Array | null
      messagePackedInfoValid: boolean
      chatScope: string
    }>()

    output.exec('BEGIN IMMEDIATE')
    try {
      for (const row of resourceRows) {
        const messageId = row.message_id.toString()
        let context = contextCache.get(messageId)
        if (!context) {
          const chatScope = chats.get(safeInteger(row.chat_id, 'chat_id')) ?? ''
          const table = chatScope
            ? `Msg_${crypto.createHash('md5').update(chatScope, 'utf8').digest('hex')}`
            : ''
          const convId = sourceScope.conversationIds.get(chatScope)
          const localId = safeInteger(row.message_local_id, 'message_local_id')
          const serverId = normalizeServerId(row.message_svr_id)
          const outputRowsByUid = new Map<string, OutputMessageRow>()
          if (convId && table) {
            for (const sourceDb of sourceDatabases.keys()) {
              const localRows = canonicalLocalStatement.all(
                sourceScope.snapshotId, convId, sourceDb, table, localId,
              ) as OutputMessageRow[]
              for (const messageRow of localRows) outputRowsByUid.set(messageRow.message_uid, messageRow)
            }
            if (serverId !== null) {
              const serverRows = canonicalServerStatement.all(
                sourceScope.snapshotId, convId, serverId,
              ) as OutputMessageRow[]
              for (const messageRow of serverRows) outputRowsByUid.set(messageRow.message_uid, messageRow)
            }
          }
          const outputRows = [...outputRowsByUid.values()]
            .sort((left, right) => left.canonical_seq - right.canonical_seq)
          const messages = outputRows.map((messageRow) => toAssetMessage(
            messageRow,
            readOrigin(messageRow.source_db, messageRow.source_table, Number(messageRow.local_id)),
          ))
          const candidates: CanonicalMessage[] = messages.map((item) => ({
            message_uid: item.message_uid,
            source_db: item.source_db,
            chat_table: item.chat_table,
            message_table: item.message_table,
            local_id: item.local_id,
            normalized_type: item.normalized_type,
            raw_type: item.raw_type,
            create_time: item.create_time,
            server_id: item.server_id,
            message_origin_source: item.message_origin_source,
          }))
          const probe: ResourceMessageProbe = {
            message_id: messageId,
            chat_table: chatScope,
            message_table: table,
            local_id: localId,
            normalized_type: normalizeMessageType(row.message_local_type),
            raw_type: row.message_local_type.toString(),
            create_time: safeInteger(row.message_create_time, 'message_create_time'),
            server_id: serverId,
            message_origin_source: safeInteger(row.message_origin_source, 'message_origin_source'),
          }
          const alignment = alignResourceMessage(probe, candidates)
          const message = alignment.message_uid
            ? messages.find((item) => item.message_uid === alignment.message_uid) ?? null
            : null
          const packed = parsePackedInfoEvidence(row.message_packed_info)
          context = {
            message,
            candidates,
            alignment,
            lookupEvidence: packed.lookupEvidence,
            filenames: packed.filenames,
            messagePackedInfo: row.message_packed_info,
            messagePackedInfoValid: packed.valid,
            chatScope,
          }
          contextCache.set(messageId, context)
          if (alignment.status === 'exact') metrics.exactAlignments++
          else if (alignment.status === 'partial') metrics.partialAlignments++
          else if (alignment.status === 'missing') metrics.missingAlignments++
          else metrics.conflictingAlignments++
        }

        const detail = parsePackedInfoEvidence(row.detail_packed_info)
        const lookupEvidence = [...context.lookupEvidence]
        appendUnique(lookupEvidence, detail.lookupEvidence)
        const filenames = [...context.filenames]
        appendUnique(filenames, detail.filenames)
        const expectedSize = safeInteger(row.resource_size, 'resource_size')
        const fileMatch = matchResourceFile(fileIndex, { lookupEvidence, filenames, expectedSize })
        const sourcePath = fileMatch.candidate?.absolutePath
        let sourceContentSha256 = sourcePath ? contentDigests.get(sourcePath) ?? null : null
        if (sourcePath && !sourceContentSha256) {
          sourceContentSha256 = digestFileContent(sourcePath)
          contentDigests.set(sourcePath, sourceContentSha256)
        }
        const artifact = createResourceArtifact({
          message: context.message,
          alignment: context.alignment,
          resourceChatScope: context.chatScope,
          resourceMessageId: messageId,
          resourceId: row.resource_id.toString(),
          resourceType: row.resource_type.toString(),
          dataIndex: row.data_index ?? '',
          expectedSize,
          detailStatus: safeInteger(row.detail_status, 'detail_status'),
          lookupEvidence,
          filenames,
          packedInfoPayloadSha256: packedInfoPayloadDigest(
            context.messagePackedInfo,
            row.detail_packed_info,
          ),
          packedInfoValid: context.messagePackedInfoValid,
          detailPackedInfoValid: detail.valid,
          sourceContentSha256,
          fileMatch,
        })
        persistArtifact(artifact)
        metrics.resources++
      }

      persistConversationMessageArtifacts({
        canonicalDb: wechat,
        sourceSnapshotRoot: options.sourceSnapshotRoot,
        sourceSnapshotId: sourceScope.snapshotId,
        owner: sourceScope.owner,
        stagingDir,
        persist: persistArtifact,
      })
      output.exec('COMMIT')
    } catch (error) {
      output.exec('ROLLBACK')
      throw error
    }

    const counts = artifactCounts(output, wechat, sourceScope.snapshotId)
    const completedAt = new Date().toISOString()
    const materializationEvidenceSha256 = createMaterializationEvidenceDigest(output)
    const receipt = createAssetRunReceipt({
      runId: options.runId, completedAt, binding, counts, metrics,materializationEvidenceSha256,
    })
    completeAssetRun(output, options.runId, completedAt, metrics, receipt)
    output.exec('PRAGMA journal_mode=DELETE')
    const index = {
      version: 2,runId: options.runId,completedAt,binding,counts,metrics,
      materializationEvidenceSha256,receipt,
    }
    fs.writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}\n`, 'utf8')
    output.close()
    resources.close()
    wechat.close()
    for (const database of sourceDatabases.values()) database.close()
    fs.renameSync(stagingDir, options.bundleDir)
    return {
      bundleDir: options.bundleDir,
      databasePath: path.join(options.bundleDir, 'artifacts.db'),
      indexPath: path.join(options.bundleDir, 'index.json'),
      counts,
      metrics,
    }
  } catch (error) {
    try { output.close() } catch { /* Preserve the original failure. */ }
    try { resources.close() } catch { /* Preserve the original failure. */ }
    try { wechat.close() } catch { /* Preserve the original failure. */ }
    for (const database of sourceDatabases.values()) {
      try { database.close() } catch { /* Preserve the original failure. */ }
    }
    try {
      const expectedParent = path.resolve(path.dirname(options.bundleDir))
      const candidate = path.resolve(stagingDir)
      if (path.dirname(candidate) === expectedParent
        && path.basename(candidate).startsWith(`.${path.basename(options.bundleDir)}.`)) {
        fs.rmSync(candidate, { recursive: true, force: true })
      }
    } catch { /* A later run will still fail closed if cleanup was interrupted. */ }
    throw error
  }
}
