import { normalizeMessageType, resolveSenderIdentity } from './messageModel.js'
import { decodeContent, extractText } from './messageParsing.js'
import type { SourceMessage } from './sourceReader.js'
import { addIssue, countReplacementCharacters, evidence, fieldSample } from './sourceIdentityAuditIssues.js'
import type {
  MutableIssue,
  OutputMessage,
  OutputMessageWithRawType,
  SourceIdentityAuditResult,
  SourceShard,
} from './sourceIdentityAuditTypes.js'

export function groupKey(message: OutputMessage) {
  return `${message.sourceSnapshot}\u0000${message.sourceDb}\u0000${message.sourceTable}`
}

export function compareSourceRow(
  message: OutputMessageWithRawType,
  row: SourceMessage,
  shard: SourceShard,
  issues: Map<string, MutableIssue>,
  metrics: SourceIdentityAuditResult['metrics'],
) {
  if (message.serverId !== row.serverId) {
    addIssue(issues, 'source-server-id-mismatch', 1, fieldSample(message, message.serverId, row.serverId))
  }
  if (message.rawType !== row.rawType) {
    addIssue(issues, 'source-raw-type-mismatch', 1, fieldSample(message, message.rawType, row.rawType))
  }
  if (message.time !== row.createTime) {
    addIssue(issues, 'source-time-mismatch', 1, fieldSample(message, message.time, row.createTime))
  }
  if (message.sortSeq !== row.sortSeq) {
    addIssue(issues, 'source-sort-seq-mismatch', 1, fieldSample(message, message.sortSeq, row.sortSeq))
  }

  const isGroup = message.peer.endsWith('@chatroom')
  let extracted: ReturnType<typeof extractText>
  try {
    const context = evidence(message)
    const primary = decodeContent(row.messageContent, `${context}:message_content`)
    const content = primary || decodeContent(row.compressedContent, `${context}:compress_content`)
    extracted = extractText(normalizeMessageType(row.rawType), content, isGroup)
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    addIssue(issues, 'source-content-decode-failed', 1, `${evidence(message)} ${reason}`)
    return
  }

  if (isGroup && message.senderPrefix !== extracted.senderPrefix) {
    addIssue(
      issues,
      'source-group-prefix-mismatch',
      1,
      fieldSample(message, message.senderPrefix, extracted.senderPrefix),
    )
  }
  if (message.text !== extracted.text) {
    addIssue(issues, 'source-text-mismatch', 1, fieldSample(message, message.text, extracted.text))
  } else {
    metrics.sourceVerifiedReplacementCharacters += countReplacementCharacters(message.text)
  }

  const identity = resolveSenderIdentity({
    isGroup,
    conversationUsername: message.peer,
    ownerUsername: message.owner,
    messageName2IdSender: shard.idToName.get(row.realSenderId),
    groupPrefixSender: extracted.senderPrefix,
    privateDirection: 'unknown',
    displayNames: shard.displayNames,
  })
  const senderMatches = message.sender === identity.sender
  if (!senderMatches) {
    addIssue(
      issues,
      'source-sender-mismatch',
      1,
      fieldSample(message, message.sender, identity.sender || '<unknown>'),
    )
  }
  const senderNameMatches = message.senderName === identity.senderName
  if (!senderNameMatches) {
    addIssue(
      issues,
      'source-sender-name-mismatch',
      1,
      fieldSample(message, message.senderName, identity.senderName),
    )
  } else if (senderMatches) {
    metrics.sourceVerifiedReplacementCharacters += countReplacementCharacters(message.senderName)
  }
}
