import fs from 'node:fs'
import path from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import { archiveDay } from '../../pipeline/wechat/archiveTime.js'
import { createCanonicalSchema } from '../../pipeline/wechat/canonicalSchema.js'
import { parseMessageContent } from '../../pipeline/wechat/messageTypeRegistry.js'
import { readSourceMessages } from '../../pipeline/wechat/sourceReader.js'
import {
  createMessageSemanticFingerprint,
  normalizeMessageType,
  resolveSenderIdentity,
} from './messageModel.js'
import { decodeContent, typeLabel } from './messageParsing.js'
import { truncateCodePoints } from './unicodeText.js'
import {
  compareText,
  hasServerId,
  md5,
  sha256,
} from './parserSnapshotDiscovery.js'
import type { MessageSource, ParsedMessage, ParserPaths, SnapshotDescriptor } from './parserTypes.js'

export function safeFile(name: string) {
  const unsafeCharacters = new Set('<>:"/\\|?*')
  const sanitized = [...name]
    .map((character) => character.charCodeAt(0) <= 0x1f || unsafeCharacters.has(character) ? '_' : character)
    .join('')
  return truncateCodePoints(sanitized, 80)
}

function createMessageUid(owner: string, username: string, sourceDb: string, table: string, localId: number, serverId: string) {
  const identity = hasServerId(serverId)
    ? `server:${serverId}`
    : `evidence:${sourceDb}:${table}:${localId}`
  return `wxm:${sha256(`${owner}\u0000${username}\u0000${identity}`)}`
}

function stableMessageSort(left: ParsedMessage, right: ParsedMessage) {
  const domainOrder = { regular: 0, biz: 1 } as const
  return left.time - right.time
    || left.sortSeq - right.sortSeq
    || domainOrder[left.sourceDomain] - domainOrder[right.sourceDomain]
    || compareText(left.sourceDb, right.sourceDb)
    || left.localId - right.localId
}

function deduplicateMessages(messages: readonly ParsedMessage[]) {
  const result: ParsedMessage[] = []
  const serverIds = new Map<string, ParsedMessage>()
  const evidenceKeys = new Map<string, ParsedMessage>()
  const messageUids = new Map<string, ParsedMessage>()
  const deduplicatedMessages: ParsedMessage[] = []
  for (const message of messages) {
    const evidenceKey = `${message.sourceDb}\u0000${message.sourceTable}\u0000${message.localId}`
    if (evidenceKeys.has(evidenceKey)) {
      throw new Error(
        `Duplicate exact evidence key in ${message.sourceTable}: source_db=${message.sourceDb}, local_id=${message.localId}`,
      )
    }
    evidenceKeys.set(evidenceKey, message)
    const duplicates = [
      hasServerId(message.serverId) ? serverIds.get(message.serverId) : undefined,
      messageUids.get(message.messageUid),
    ].filter((candidate): candidate is ParsedMessage => Boolean(candidate))
    const semanticFingerprint = createMessageSemanticFingerprint(message)
    for (const duplicate of new Set(duplicates)) {
      if (createMessageSemanticFingerprint(duplicate) !== semanticFingerprint) {
        throw new Error(
          `Conflicting duplicate message in ${message.sourceTable}: server_id=${message.serverId}, local_id=${message.localId}`,
        )
      }
    }
    if (duplicates.length > 0) {
      deduplicatedMessages.push(message)
      continue
    }
    if (hasServerId(message.serverId)) serverIds.set(message.serverId, message)
    messageUids.set(message.messageUid, message)
    result.push(message)
  }
  return { messages: result, deduplicatedMessages }
}

export function parseConversationMessages(
  snapshot: SnapshotDescriptor,
  username: string,
  sources: readonly MessageSource[],
  timeZone = 'Asia/Shanghai',
) {
  const table = `Msg_${md5(username)}`
  const isGroup = username.endsWith('@chatroom')
  const displayNames = new Map([...snapshot.contactMap].map(([id, contact]) => [id, contact.display]))
  const collected: ParsedMessage[] = []

  for (const source of sources) {
    if (!source.tables.has(table)) continue
    for (const row of readSourceMessages(source.db, table, source.tables)) {
      const context = `${snapshot.name}/${source.filename}/${table}/${row.localId}`
      const primary = decodeContent(row.messageContent, `${context}:message_content`)
      const content = primary || decodeContent(row.compressedContent, `${context}:compress_content`)
      const type = normalizeMessageType(row.rawType)
      const extracted = parseMessageContent(type, content, isGroup)
      const identity = resolveSenderIdentity({
        isGroup,
        conversationUsername: username,
        ownerUsername: snapshot.owner,
        messageName2IdSender: source.idToName.get(row.realSenderId),
        groupPrefixSender: extracted.senderPrefix,
        privateDirection: 'unknown',
        displayNames,
      })
      collected.push({
        messageUid: createMessageUid(snapshot.owner, username, source.filename, table, row.localId, row.serverId),
        sourceSnapshot: snapshot.name,
        sourceDb: source.filename,
        sourceDomain: source.domain,
        sourceTable: table,
        localId: row.localId,
        serverId: row.serverId,
        sortSeq: row.sortSeq,
        time: row.createTime,
        archiveDay: archiveDay(row.createTime, timeZone),
        sender: identity.sender,
        senderName: identity.senderName,
        senderPrefix: extracted.senderPrefix,
        isOwn: identity.sender === snapshot.owner ? 1 : 0,
        senderSource: identity.source,
        senderAudit: identity.auditReason ?? '',
        rawType: row.rawType,
        type,
        typeLabel: typeLabel(type),
        contentKind: extracted.kind,
        structuredContentJson: JSON.stringify(extracted.structured),
        text: extracted.text,
      })
    }
  }

  const deduplicated = deduplicateMessages(collected.sort(stableMessageSort))
  return {
    ...deduplicated,
    sourceMessageCount: collected.length,
  }
}

export function createSchema(out: DatabaseSync) {
  createCanonicalSchema(out)
}

function buildRunId() {
  const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
  return `${timestamp}-${process.pid}`
}

export function parserPaths(root: string): ParserPaths {
  const configuredRunId = process.env.CHATFILES_RUN_ID?.trim()
  const runId = configuredRunId || buildRunId()
  if (!/^[0-9A-Za-z._-]+$/.test(runId)) throw new Error('CHATFILES_RUN_ID contains unsafe path characters')
  const bundleDir = path.join(root, 'data', 'wechat.next')
  return {
    root,
    decryptRoot: path.join(root, 'work', 'decrypted', 'wechat'),
    bundleDir,
    outDbPath: path.join(bundleDir, 'wechat.db'),
    indexPath: path.join(bundleDir, 'index.json'),
    transcriptDir: path.join(bundleDir, 'transcripts'),
    runId,
  }
}

export function assertFreshOutputs(paths: ParserPaths) {
  const protectedPaths = [
    paths.bundleDir,
    paths.outDbPath,
    `${paths.outDbPath}-wal`,
    `${paths.outDbPath}-shm`,
    paths.indexPath,
    paths.transcriptDir,
  ]
  const existing = protectedPaths.find((target) => fs.existsSync(target))
  if (existing) throw new Error(`Output already exists: ${existing}`)
}

export function stagingPaths(finalPaths: ParserPaths): ParserPaths {
  const token = `${finalPaths.runId}-${process.pid}`
  const bundleDir = path.join(path.dirname(finalPaths.bundleDir), `.wechat.next.${token}.staging`)
  return {
    ...finalPaths,
    bundleDir,
    outDbPath: path.join(bundleDir, 'wechat.db'),
    indexPath: path.join(bundleDir, 'index.json'),
    transcriptDir: path.join(bundleDir, 'transcripts'),
  }
}

export function promoteArtifacts(staging: ParserPaths, finalPaths: ParserPaths) {
  assertFreshOutputs(finalPaths)
  try {
    fs.renameSync(staging.bundleDir, finalPaths.bundleDir)
  } catch (error) {
    throw new Error('Unable to publish completed parse bundle', { cause: error })
  }
}
