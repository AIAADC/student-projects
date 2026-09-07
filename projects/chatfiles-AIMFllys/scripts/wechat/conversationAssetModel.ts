import { createHash } from 'node:crypto'
import {
  classifyArtifactCategory,
  createAssetId,
  createResourceEvidenceSignature,
  evaluateResourceLinkEvidence,
  extractStructuredUrls,
  type ArtifactCategory,
  type CanonicalMessage,
  type ResourceMessageAlignment,
} from './assetEvidence.js'
import { fallbackAssetName, previewForAsset, stateForResourceMatch } from './conversationAssetPresentation.js'
import type { ResourceFileMatch } from './resourceFileMatcher.js'

export interface AssetCanonicalMessage extends CanonicalMessage {
  conv_id: string
  canonical_seq: number
  occurred_at_epoch_s: number
  source_snapshot: string
  source_adapter: 'biz' | 'regular'
  conversation_username: string
  sender_name: string
  structured_content_json: string
  text: string
}

export type ConversationArtifactRecord = {
  asset_id: string | null
  conv_id: string | null
  message_uid: string | null
  resource_message_id: string | null
  resource_id: string | null
  resource_type: string | null
  data_index: string
  category: ArtifactCategory
  kind: 'resource' | 'link' | 'voice'
  name: string
  preview: string
  url: string | null
  source_relative_path: string | null
  source_size: number | null
  created_at: number
  canonical_seq: number | null
  sender_name: string
  text: string
  alignment_status: string
  confirmation_status: 'confirmed' | 'unconfirmed'
  association_reason: string | null
  candidate_message_uids: string
  matched_fields: string
  missing_fields: string
  conflicting_fields: string
  evidence_kind: string
  evidence_signature: string
  packed_info_valid: boolean
  detail_packed_info_valid: boolean
  lookup_evidence: string
  filenames: string
  packed_info_payload_sha256: string
  source_match_method: string
  source_presence: 'present' | 'missing' | 'ambiguous' | 'size_mismatch' | 'content_mismatch' | 'oversized'
    | 'not_applicable'
  source_content_sha256: string | null
  materialized_relative_path: string | null
  materialized_size: number | null
  materialized_content_sha256: string | null
  media_format: string | null
  expected_size: number | null
  detail_status: number | null
  materialization: string
  preview_status: string
  failure_reason: string | null
}

function sha256(value: string | Uint8Array) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`
}

function lookupEvidenceFromName(name: string) {
  return name.match(/(?:^|[^0-9a-f])([0-9a-f]{32})(?=$|[^0-9a-f])/iu)?.[1]?.toLowerCase() ?? null
}

function hasCdnReference(message: AssetCanonicalMessage | null) {
  if (!message) return false
  try {
    const parsed = JSON.parse(message.structured_content_json) as Record<string, unknown>
    const references = parsed.cdnReferences
    return Boolean(references && typeof references === 'object'
      && Object.values(references as Record<string, unknown>).some((value) => (
        typeof value === 'string' && value.trim() !== ''
      )))
  } catch {
    return false
  }
}

export function createResourceArtifact(input: {
  message: AssetCanonicalMessage | null
  alignment: ResourceMessageAlignment
  resourceChatScope?: string
  resourceMessageId: string
  resourceId: string
  resourceType: string
  dataIndex: string
  expectedSize: number
  detailStatus: number
  lookupEvidence: readonly string[]
  filenames: readonly string[]
  packedInfoPayloadSha256: string
  packedInfoValid: boolean
  detailPackedInfoValid: boolean
  sourceContentSha256: string | null
  fileMatch: ResourceFileMatch
}): ConversationArtifactRecord {
  const candidate = input.fileMatch.candidate
  const name = input.filenames[0] ?? candidate?.name ?? fallbackAssetName(input.message?.normalized_type ?? 0)
  const preview = previewForAsset(name, input.message?.normalized_type ?? 0)
  const category = classifyArtifactCategory({
    name,
    preview,
    hasLocalFile: candidate !== null,
  })
  const candidateLookupEvidence = candidate && input.fileMatch.status === 'lookup_exact'
    ? lookupEvidenceFromName(candidate.name)
    : null
  const matchedLookupEvidence = candidateLookupEvidence
    && input.lookupEvidence.includes(candidateLookupEvidence)
    ? candidateLookupEvidence
    : input.lookupEvidence[0] ?? null
  const linkEvidence = evaluateResourceLinkEvidence({
    alignment: input.alignment,
    canonical_chat_scope: input.message?.conversation_username ?? '',
    resource_chat_scope: input.resourceChatScope ?? input.message?.conversation_username ?? '',
    message_lookup_evidence: matchedLookupEvidence,
    candidate_lookup_evidence: candidateLookupEvidence,
    filename: input.filenames[0] ?? candidate?.name ?? null,
  })
  const signatureMessageUid = input.alignment.message_uid ?? `unlinked:${input.resourceMessageId}`
  const evidenceSignature = input.lookupEvidence.length > 0
    ? createResourceEvidenceSignature({
        message_uid: signatureMessageUid,
        canonical_chat_scope: input.resourceChatScope ?? input.message?.conversation_username ?? 'unlinked',
        resource_kind: `${input.resourceType}:${input.dataIndex}`,
        lookup_evidence: input.lookupEvidence,
      })
    : input.packedInfoPayloadSha256
  const evidenceState = stateForResourceMatch(input.fileMatch, {
    cdnOnly: hasCdnReference(input.message),
    preview,
  })
  const failureReason = 'reason' in evidenceState ? evidenceState.reason ?? null : null

  return {
    asset_id: linkEvidence.status === 'confirmed'
      ? createAssetId(signatureMessageUid, evidenceSignature, 'original')
      : null,
    conv_id: input.message?.conv_id ?? null,
    message_uid: input.alignment.message_uid ?? null,
    resource_message_id: input.resourceMessageId,
    resource_id: input.resourceId,
    resource_type: input.resourceType,
    data_index: input.dataIndex,
    category,
    kind: 'resource',
    name,
    preview,
    url: null,
    source_relative_path: candidate?.relativePath ?? null,
    source_size: candidate?.size ?? null,
    created_at: input.message?.create_time ?? 0,
    canonical_seq: input.message?.canonical_seq ?? null,
    sender_name: input.message?.sender_name ?? '',
    text: input.message?.text ?? '',
    alignment_status: input.alignment.status,
    confirmation_status: linkEvidence.status,
    association_reason: linkEvidence.reason,
    candidate_message_uids: JSON.stringify(input.alignment.candidate_message_uids),
    matched_fields: JSON.stringify(input.alignment.matched_fields),
    missing_fields: JSON.stringify(input.alignment.missing_fields),
    conflicting_fields: JSON.stringify(input.alignment.conflicting_fields),
    evidence_kind: linkEvidence.evidence,
    evidence_signature: evidenceSignature,
    packed_info_valid: input.packedInfoValid,
    detail_packed_info_valid: input.detailPackedInfoValid,
    lookup_evidence: JSON.stringify(input.lookupEvidence),
    filenames: JSON.stringify(input.filenames),
    packed_info_payload_sha256: input.packedInfoPayloadSha256,
    source_match_method: input.fileMatch.status,
    source_presence: input.fileMatch.status === 'ambiguous'
      ? 'ambiguous'
      : input.fileMatch.status === 'size_mismatch'
        ? 'size_mismatch'
        : candidate ? 'present' : 'missing',
    source_content_sha256: input.sourceContentSha256,
    materialized_relative_path: null,
    materialized_size: null,
    materialized_content_sha256: null,
    media_format: null,
    expected_size: input.expectedSize,
    detail_status: input.detailStatus,
    materialization: evidenceState.materialization,
    preview_status: evidenceState.preview,
    failure_reason: failureReason,
  }
}

export function createLinkArtifacts(
  message: AssetCanonicalMessage,
): ConversationArtifactRecord[] {
  return extractStructuredUrls({ text: message.text }).map((url, index) => {
    const evidenceSignature = createResourceEvidenceSignature({
      message_uid: message.message_uid,
      canonical_chat_scope: message.conversation_username,
      resource_kind: 'link',
      lookup_evidence: [url],
    })
    return {
      asset_id: createAssetId(message.message_uid, evidenceSignature, `url:${index}`),
      conv_id: message.conv_id,
      message_uid: message.message_uid,
      resource_message_id: null,
      resource_id: null,
      resource_type: null,
      data_index: String(index),
      category: 'link',
      kind: 'link',
      name: url,
      preview: 'link',
      url,
      source_relative_path: null,
      source_size: null,
      created_at: message.create_time,
      canonical_seq: message.canonical_seq,
      sender_name: message.sender_name,
      text: message.text,
      alignment_status: 'exact',
      confirmation_status: 'confirmed',
      association_reason: null,
      candidate_message_uids: JSON.stringify([message.message_uid]),
      matched_fields: JSON.stringify(['message_uid']),
      missing_fields: JSON.stringify([]),
      conflicting_fields: JSON.stringify([]),
      evidence_kind: 'message_text',
      evidence_signature: evidenceSignature,
      packed_info_valid: true,
      detail_packed_info_valid: true,
      lookup_evidence: JSON.stringify([url]),
      filenames: JSON.stringify([]),
      packed_info_payload_sha256: sha256(url),
      source_match_method: 'message_text',
      source_presence: 'not_applicable',
      source_content_sha256: null,
      materialized_relative_path: null,
      materialized_size: null,
      materialized_content_sha256: null,
      media_format: null,
      expected_size: null,
      detail_status: null,
      materialization: 'ready',
      preview_status: 'ready',
      failure_reason: null,
    }
  })
}
