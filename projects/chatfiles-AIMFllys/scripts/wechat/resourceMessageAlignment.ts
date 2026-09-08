export const RESOURCE_MESSAGE_PRIMARY_KEY = 'message_id' as const
export const CANONICAL_MESSAGE_PRIMARY_KEY = 'message_uid' as const

export const RESOURCE_LOCATOR_FIELDS = [
  'chat_table',
  'message_table',
  'local_id',
  'normalized_type',
  'raw_type',
  'create_time',
  'server_id',
  'message_origin_source',
] as const

export type ResourceLocatorField = typeof RESOURCE_LOCATOR_FIELDS[number]
export type ResourceAlignmentField = typeof CANONICAL_MESSAGE_PRIMARY_KEY | ResourceLocatorField

export interface ResourceMessageLocator {
  chat_table: string
  message_table: string
  local_id: number
  normalized_type: number
  raw_type: string
  create_time: number
  server_id: string | null
  message_origin_source: number | null
}

export interface CanonicalMessage extends ResourceMessageLocator {
  message_uid: string
  source_db: string
}

export interface ResourceMessageProbe extends Partial<ResourceMessageLocator> {
  message_id: string
  message_uid?: string
}

export type ResourceAlignmentStatus = 'exact' | 'partial' | 'missing' | 'conflict'

export interface ResourceMessageAlignment {
  status: ResourceAlignmentStatus
  resource_message_id: string
  message_uid: string | null
  candidate_message_uids: string[]
  matched_fields: ResourceAlignmentField[]
  missing_fields: ResourceLocatorField[]
  conflicting_fields: ResourceAlignmentField[]
}

type MatchableMessageField = keyof ResourceMessageLocator | typeof CANONICAL_MESSAGE_PRIMARY_KEY

function isSupplied<K extends keyof ResourceMessageProbe>(
  probe: ResourceMessageProbe,
  field: K,
): probe is ResourceMessageProbe & Required<Pick<ResourceMessageProbe, K>> {
  return Object.prototype.hasOwnProperty.call(probe, field) && probe[field] !== undefined
}

function uniqueMessageUids(messages: readonly CanonicalMessage[]): string[] {
  return [...new Set(messages.map((message) => message.message_uid))]
    .sort((left, right) => left < right ? -1 : left > right ? 1 : 0)
}

function matchesField(
  message: CanonicalMessage,
  probe: ResourceMessageProbe,
  field: MatchableMessageField,
): boolean {
  return !isSupplied(probe, field) || Object.is(message[field], probe[field])
}

function matchesFields(
  message: CanonicalMessage,
  probe: ResourceMessageProbe,
  fields: readonly MatchableMessageField[],
): boolean {
  return fields.every((field) => matchesField(message, probe, field))
}

function hasNonzeroServerId(
  probe: ResourceMessageProbe,
): probe is ResourceMessageProbe & { server_id: string } {
  if (!isSupplied(probe, 'server_id') || probe.server_id === null) return false
  const serverId = probe.server_id.trim()
  return serverId !== '' && serverId !== '0'
}

function selectIdentityCandidates(
  probe: ResourceMessageProbe,
  messages: readonly CanonicalMessage[],
): CanonicalMessage[] {
  const candidateGroups: CanonicalMessage[][] = []

  if (isSupplied(probe, CANONICAL_MESSAGE_PRIMARY_KEY)) {
    candidateGroups.push(messages.filter((message) => message.message_uid === probe.message_uid))
  }

  const positionalFields = ['chat_table', 'message_table', 'local_id'] as const
  if (positionalFields.every((field) => isSupplied(probe, field))) {
    candidateGroups.push(messages.filter((message) => matchesFields(message, probe, positionalFields)))
  }

  const serverScopeFields = ['chat_table', 'message_table'] as const
  const hasServerLocator = hasNonzeroServerId(probe)
    && serverScopeFields.every((field) => isSupplied(probe, field))
  if (hasServerLocator) {
    candidateGroups.push(messages.filter((message) => (
      matchesFields(message, probe, serverScopeFields) && message.server_id === probe.server_id
    )))
  }

  if (candidateGroups.length === 0) return []
  const selected = new Set(candidateGroups.flat())
  return messages.filter((message) => selected.has(message))
}

function conflictFieldsFor(
  probe: ResourceMessageProbe,
  candidates: readonly CanonicalMessage[],
): ResourceAlignmentField[] {
  const conflicts: ResourceAlignmentField[] = []
  const conflictsWithMessageUid = isSupplied(probe, CANONICAL_MESSAGE_PRIMARY_KEY)
    && candidates.some((candidate) => candidate.message_uid !== probe.message_uid)
  if (candidates.length > 1 || conflictsWithMessageUid) {
    conflicts.push(CANONICAL_MESSAGE_PRIMARY_KEY)
  }

  for (const field of RESOURCE_LOCATOR_FIELDS) {
    const candidateValues = new Set(candidates.map((candidate) => candidate[field]))
    const conflictsWithProbe = isSupplied(probe, field)
      && candidates.some((candidate) => !Object.is(candidate[field], probe[field]))
    if (candidateValues.size > 1 || conflictsWithProbe) conflicts.push(field)
  }

  return conflicts
}

function fieldsMatchingEveryCandidate(
  probe: ResourceMessageProbe,
  candidates: readonly CanonicalMessage[],
  suppliedFields: readonly ResourceAlignmentField[],
): ResourceAlignmentField[] {
  return suppliedFields.filter((field) => (
    candidates.every((candidate) => Object.is(candidate[field], probe[field]))
  ))
}

export function alignResourceMessage(
  probe: ResourceMessageProbe,
  messages: readonly CanonicalMessage[],
): ResourceMessageAlignment {
  const suppliedFields: ResourceAlignmentField[] = [
    ...(isSupplied(probe, CANONICAL_MESSAGE_PRIMARY_KEY) ? [CANONICAL_MESSAGE_PRIMARY_KEY] : []),
    ...RESOURCE_LOCATOR_FIELDS.filter((field) => isSupplied(probe, field)),
  ]
  const missingFields = RESOURCE_LOCATOR_FIELDS.filter((field) => !isSupplied(probe, field))
  const candidates = selectIdentityCandidates(probe, messages)

  if (candidates.length === 0) {
    return {
      status: 'missing',
      resource_message_id: probe.message_id,
      message_uid: null,
      candidate_message_uids: [],
      matched_fields: [],
      missing_fields: missingFields,
      conflicting_fields: [],
    }
  }

  const conflictFields = conflictFieldsFor(probe, candidates)
  if (candidates.length > 1 || conflictFields.length > 0) {
    return {
      status: 'conflict',
      resource_message_id: probe.message_id,
      message_uid: null,
      candidate_message_uids: uniqueMessageUids(candidates),
      matched_fields: fieldsMatchingEveryCandidate(probe, candidates, suppliedFields),
      missing_fields: missingFields,
      conflicting_fields: conflictFields,
    }
  }

  const candidate = candidates[0]
  if (!candidate) throw new Error('Unreachable: a unique candidate was expected')

  return {
    status: missingFields.length === 0 ? 'exact' : 'partial',
    resource_message_id: probe.message_id,
    message_uid: candidate.message_uid,
    candidate_message_uids: [candidate.message_uid],
    matched_fields: suppliedFields,
    missing_fields: missingFields,
    conflicting_fields: [],
  }
}
