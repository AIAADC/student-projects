import fs from 'node:fs'
import { detectMaterializedVoiceFormat } from '../../shared/media/mediaMagic.js'
import {
  digestBytes,
  mediaStagingPath,
  prepareMediaStaging,
  validateMediaAssetId,
} from './stagingFile.js'

export type VoiceInfoEvidence = {
  chatUsername: string
  localId: number | null
  serverId: string | null
  occurredAtEpochS: number
  dataIndex: string
}

export type VoiceCandidate = Omit<VoiceInfoEvidence, 'dataIndex'> & {
  messageUid: string
  conversationId: string
  dataIndex: string | null
  normalizedType: number
}

export type VoiceAlignment = {
  status: 'unique' | 'missing' | 'conflict'
  messageUid: string | null
  conversationId: string | null
  candidateMessageUids: string[]
  matchedFields: string[]
  conflictingFields: string[]
}

type Locator = {
  name: 'local_id' | 'server_id' | 'occurred_at_epoch_s' | 'data_index'
  available: boolean
  matches: (candidate: VoiceCandidate) => boolean
}

function sortedUids(candidates: readonly VoiceCandidate[]) {
  return [...new Set(candidates.map((candidate) => candidate.messageUid))].sort((left, right) => (
    left.localeCompare(right, 'en')
  ))
}

function locatorEvidence(evidence: VoiceInfoEvidence, candidates: readonly VoiceCandidate[]): Locator[] {
  return [
    {
      name: 'local_id',
      available: evidence.localId !== null && Number.isSafeInteger(evidence.localId),
      matches: (candidate: VoiceCandidate) => candidate.localId === evidence.localId,
    },
    {
      name: 'server_id',
      available: Boolean(evidence.serverId && evidence.serverId !== '0'),
      matches: (candidate: VoiceCandidate) => candidate.serverId === evidence.serverId,
    },
    {
      name: 'occurred_at_epoch_s',
      available: Number.isSafeInteger(evidence.occurredAtEpochS),
      matches: (candidate: VoiceCandidate) => candidate.occurredAtEpochS === evidence.occurredAtEpochS,
    },
    {
      name: 'data_index',
      available: evidence.dataIndex.trim() !== ''
        && candidates.some((candidate) => Boolean(candidate.dataIndex?.trim())),
      matches: (candidate: VoiceCandidate) => candidate.dataIndex === evidence.dataIndex,
    },
  ].filter((locator) => locator.available) as Locator[]
}

export function alignVoiceInfo(
  evidence: VoiceInfoEvidence,
  candidates: readonly VoiceCandidate[],
): VoiceAlignment {
  const scoped = candidates.filter((candidate) => (
    candidate.normalizedType === 34 && candidate.chatUsername === evidence.chatUsername
  ))
  const conversationIds = [...new Set(scoped.map((candidate) => candidate.conversationId))]
  const conversationId = conversationIds.length === 1 ? conversationIds[0]! : null
  if (scoped.length === 0) {
    return {
      status: 'missing', messageUid: null, conversationId: null, candidateMessageUids: [],
      matchedFields: [], conflictingFields: ['chat_username'],
    }
  }
  if (!conversationId) {
    return {
      status: 'conflict', messageUid: null, conversationId: null,
      candidateMessageUids: sortedUids(scoped), matchedFields: [], conflictingFields: ['chat_username'],
    }
  }

  const locators = locatorEvidence(evidence, scoped)
  if (locators.length === 0) {
    return {
      status: 'missing',messageUid: null,conversationId,candidateMessageUids: sortedUids(scoped),
      matchedFields: [],conflictingFields: ['locator_evidence'],
    }
  }
  const exact = scoped.filter((candidate) => locators.every((locator) => locator.matches(candidate)))
  if (exact.length === 1) {
    return {
      status: 'unique', messageUid: exact[0]!.messageUid, conversationId,
      candidateMessageUids: [exact[0]!.messageUid],
      matchedFields: ['chat_username', ...locators.map((locator) => locator.name)],
      conflictingFields: [],
    }
  }
  if (exact.length > 1) {
    return {
      status: 'conflict', messageUid: null, conversationId,
      candidateMessageUids: sortedUids(exact),
      matchedFields: ['chat_username', ...locators.map((locator) => locator.name)],
      conflictingFields: [],
    }
  }

  const pointed = scoped.filter((candidate) => locators.some((locator) => locator.matches(candidate)))
  const pointedUids = sortedUids(pointed)
  const status = pointedUids.length > 0 ? 'conflict' : 'missing'
  return {
    status,
    messageUid: null,
    conversationId,
    candidateMessageUids: pointedUids,
    matchedFields: ['chat_username'],
    conflictingFields: locators.map((locator) => locator.name),
  }
}

export type InspectedVoicePayload =
  | { status: 'ready'; format: 'silk' | 'amr' | 'amr-wb'; bytes: Buffer }
  | { status: 'unsupported_codec'; reason: 'unknown_voice_magic' }

export type VoiceMaterializationResult =
  | {
    status: 'ready'
    format: 'silk' | 'amr' | 'amr-wb'
    relativePath: string
    size: number
    contentSha256: string
  }
  | { status: 'unsupported_codec'; reason: 'unknown_voice_magic' }

export function inspectVoicePayload(payload: Uint8Array): InspectedVoicePayload {
  const raw = payload[0] === 0x02 ? payload.subarray(1) : payload
  const format = detectMaterializedVoiceFormat(payload)
  if (format) return { status: 'ready', format, bytes: Buffer.from(raw) }
  return { status: 'unsupported_codec', reason: 'unknown_voice_magic' }
}

export function materializeVoicePayload(input: {
  assetId: string
  payload: Uint8Array
  stagingDir: string
}): VoiceMaterializationResult {
  validateMediaAssetId(input.assetId)
  const inspected = inspectVoicePayload(input.payload)
  if (inspected.status !== 'ready') return inspected
  const { root } = prepareMediaStaging(input.stagingDir)
  const extension = inspected.format === 'silk' ? 'silk' : 'amr'
  const target = mediaStagingPath(root, input.assetId, extension)
  fs.writeFileSync(target.absolutePath, inspected.bytes, { flag: 'wx' })
  return {
    status: 'ready' as const,
    format: inspected.format,
    relativePath: target.relativePath,
    size: inspected.bytes.length,
    contentSha256: digestBytes(inspected.bytes),
  }
}
