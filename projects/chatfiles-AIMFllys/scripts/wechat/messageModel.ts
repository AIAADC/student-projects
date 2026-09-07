export type RawMessageType = bigint | number | string

export interface MessageCoverageEvidence {
  sourceDb: string
  sourceTable: string
  localId: number
  serverId: string
  rawType: string
  time: number
  realSender: string
  contentHash: string
}

export interface MessageSemanticEvidence {
  time: number
  rawType: string
  sender: string
  text: string
}

export type PrivateMessageDirection = 'self' | 'peer' | 'unknown'

export type SenderIdentitySource =
  | 'message-name2id'
  | 'group-prefix'
  | 'private-self'
  | 'private-peer'
  | 'unknown'

export type SenderAuditReason =
  | 'group-prefix-mismatch'
  | 'message-name2id-missing'
  | 'private-direction-unknown'
  | 'group-sender-unknown'
  | 'owner-identity-missing'
  | 'conversation-peer-missing'

export type DisplayNames = ReadonlyMap<string, string> | Readonly<Record<string, string>>

export interface ResolveSenderIdentityInput {
  isGroup: boolean
  conversationUsername: string
  ownerUsername?: string | null
  messageName2IdSender?: string | null
  groupPrefixSender?: string | null
  privateDirection?: PrivateMessageDirection
  displayNames?: DisplayNames
}

export interface ResolvedSenderIdentity {
  sender: string
  senderName: string
  source: SenderIdentitySource
  auditReason: SenderAuditReason | null
}

export interface ConversationSnapshot {
  conversationId: string
  firstMessageTime: number
  messageKeys: readonly string[]
}

export interface AccountSnapshot {
  snapshotId: string
  ownerIdentity: string
  updatedAt: number
  conversations: readonly ConversationSnapshot[]
}

export interface SnapshotExclusion {
  snapshotId: string
  supersededBy: string
  reason: 'strict-subset'
}

export interface SnapshotWarning {
  ownerIdentity: string
  snapshotIds: string[]
  reason: 'coverage-not-strict' | 'owner-identity-missing'
}

export interface AccountSnapshotSelection {
  selected: AccountSnapshot[]
  excluded: SnapshotExclusion[]
  warnings: SnapshotWarning[]
}

function hasNonzeroServerId(serverId: string) {
  const value = serverId.trim()
  return value !== '' && value !== '0'
}

export function createMessageCoverageKey(message: MessageCoverageEvidence): string {
  const identity = hasNonzeroServerId(message.serverId)
    ? ['server', message.serverId]
    : ['evidence', message.sourceDb, message.sourceTable, message.localId]
  return JSON.stringify([
    identity,
    message.rawType,
    message.time,
    message.realSender,
    message.contentHash,
  ])
}

export function createMessageSemanticFingerprint(message: MessageSemanticEvidence): string {
  return JSON.stringify([message.time, message.rawType, message.sender, message.text])
}

function toRawTypeBigInt(rawType: RawMessageType): bigint {
  if (typeof rawType === 'bigint') return rawType
  if (typeof rawType === 'number') {
    if (!Number.isSafeInteger(rawType)) {
      throw new RangeError('rawType numbers must be safe integers; use bigint or a string for 64-bit values')
    }
    return BigInt(rawType)
  }

  const value = rawType.trim()
  if (!value) throw new TypeError('rawType must not be empty')
  return BigInt(value)
}

export function normalizeMessageType(rawType: RawMessageType): number {
  return Number(BigInt.asUintN(32, toRawTypeBigInt(rawType)))
}

function normalizedUsername(value: string | null | undefined): string {
  return value?.trim() ?? ''
}

function displayNameFor(username: string, displayNames?: DisplayNames): string {
  if (!username || !displayNames) return username
  let display: string | undefined
  if (displayNames instanceof Map) {
    display = displayNames.get(username)
  } else {
    const nameRecord = displayNames as Readonly<Record<string, string>>
    display = Object.prototype.hasOwnProperty.call(nameRecord, username)
      ? nameRecord[username]
      : undefined
  }
  return display?.trim() ? display : username
}

function resolved(
  sender: string,
  source: SenderIdentitySource,
  auditReason: SenderAuditReason | null,
  displayNames?: DisplayNames,
): ResolvedSenderIdentity {
  return {
    sender,
    senderName: sender ? displayNameFor(sender, displayNames) : '未知发送人',
    source,
    auditReason,
  }
}

export function resolveSenderIdentity(input: ResolveSenderIdentityInput): ResolvedSenderIdentity {
  const messageSender = normalizedUsername(input.messageName2IdSender)
  const groupPrefix = normalizedUsername(input.groupPrefixSender)

  if (messageSender) {
    const auditReason = input.isGroup && groupPrefix && groupPrefix !== messageSender
      ? 'group-prefix-mismatch'
      : null
    return resolved(messageSender, 'message-name2id', auditReason, input.displayNames)
  }

  if (input.isGroup) {
    if (groupPrefix) {
      return resolved(groupPrefix, 'group-prefix', 'message-name2id-missing', input.displayNames)
    }
    return resolved('', 'unknown', 'group-sender-unknown', input.displayNames)
  }

  if (input.privateDirection === 'self') {
    const owner = normalizedUsername(input.ownerUsername)
    return owner
      ? resolved(owner, 'private-self', 'message-name2id-missing', input.displayNames)
      : resolved('', 'unknown', 'owner-identity-missing', input.displayNames)
  }

  if (input.privateDirection === 'peer') {
    const peer = normalizedUsername(input.conversationUsername)
    return peer
      ? resolved(peer, 'private-peer', 'message-name2id-missing', input.displayNames)
      : resolved('', 'unknown', 'conversation-peer-missing', input.displayNames)
  }

  return resolved('', 'unknown', 'private-direction-unknown', input.displayNames)
}

function conversationMap(snapshot: AccountSnapshot): Map<string, ConversationSnapshot> {
  return new Map(snapshot.conversations.map((conversation) => [conversation.conversationId, conversation]))
}

function isStrictSnapshotSubset(older: AccountSnapshot, newer: AccountSnapshot): boolean {
  if (!older.ownerIdentity || older.ownerIdentity !== newer.ownerIdentity) return false
  if (newer.updatedAt <= older.updatedAt) return false

  const olderConversations = conversationMap(older)
  const newerConversations = conversationMap(newer)
  let isStrict = newerConversations.size > olderConversations.size

  for (const [conversationId, olderConversation] of olderConversations) {
    const newerConversation = newerConversations.get(conversationId)
    if (!newerConversation) return false
    if (newerConversation.firstMessageTime > olderConversation.firstMessageTime) return false

    const olderKeys = new Set(olderConversation.messageKeys)
    const newerKeys = new Set(newerConversation.messageKeys)
    for (const messageKey of olderKeys) {
      if (!newerKeys.has(messageKey)) return false
    }

    if (newerConversation.firstMessageTime < olderConversation.firstMessageTime) isStrict = true
    if (newerKeys.size > olderKeys.size) isStrict = true
  }

  return isStrict
}

function snapshotSize(snapshot: AccountSnapshot): number {
  return snapshot.conversations.reduce(
    (total, conversation) => total + new Set(conversation.messageKeys).size,
    0,
  )
}

export function chooseAccountSnapshots(snapshots: readonly AccountSnapshot[]): AccountSnapshotSelection {
  const excluded: SnapshotExclusion[] = []
  const excludedIds = new Set<string>()

  for (const candidate of snapshots) {
    const supersets = snapshots
      .filter((other) => other !== candidate && isStrictSnapshotSubset(candidate, other))
      .sort((left, right) => (
        right.updatedAt - left.updatedAt
        || snapshotSize(right) - snapshotSize(left)
        || right.snapshotId.localeCompare(left.snapshotId)
      ))

    const supersedingSnapshot = supersets[0]
    if (!supersedingSnapshot) continue
    excludedIds.add(candidate.snapshotId)
    excluded.push({
      snapshotId: candidate.snapshotId,
      supersededBy: supersedingSnapshot.snapshotId,
      reason: 'strict-subset',
    })
  }

  const selected = snapshots.filter((snapshot) => !excludedIds.has(snapshot.snapshotId))
  const warnings: SnapshotWarning[] = []
  const selectedByOwner = new Map<string, AccountSnapshot[]>()

  for (const snapshot of selected) {
    if (!snapshot.ownerIdentity) {
      warnings.push({
        ownerIdentity: '',
        snapshotIds: [snapshot.snapshotId],
        reason: 'owner-identity-missing',
      })
      continue
    }
    const group = selectedByOwner.get(snapshot.ownerIdentity) ?? []
    group.push(snapshot)
    selectedByOwner.set(snapshot.ownerIdentity, group)
  }

  for (const [ownerIdentity, ownerSnapshots] of selectedByOwner) {
    if (ownerSnapshots.length < 2) continue
    warnings.push({
      ownerIdentity,
      snapshotIds: ownerSnapshots.map((snapshot) => snapshot.snapshotId),
      reason: 'coverage-not-strict',
    })
  }

  return { selected: [...selected], excluded, warnings }
}
