import { createHash } from 'node:crypto'
import { digestBytes } from '../../pipeline/media/stagingFile.js'
import type { VoiceMaterializationResult } from '../../pipeline/media/voiceInfo.js'
import type { VoiceInfoRecord } from '../../pipeline/media/voiceInfoDatabase.js'
import { createAssetId, createResourceEvidenceSignature } from './assetEvidence.js'
import type {
  AssetCanonicalMessage,
  ConversationArtifactRecord,
} from './conversationAssetModel.js'

function sha256(value: string) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`
}

export function createVoiceArtifact(
  message: AssetCanonicalMessage,
): ConversationArtifactRecord {
  const evidenceSignature = createResourceEvidenceSignature({
    message_uid: message.message_uid,
    canonical_chat_scope: message.conversation_username,
    resource_kind: 'voice',
    lookup_evidence: ['message-type:34'],
  })
  return {
    asset_id: null,
    conv_id: message.conv_id,
    message_uid: message.message_uid,
    resource_message_id: null,
    resource_id: null,
    resource_type: null,
    data_index: 'voice',
    category: 'work',
    kind: 'voice',
    name: '语音消息',
    preview: 'voice',
    url: null,
    source_relative_path: null,
    source_size: null,
    created_at: message.create_time,
    canonical_seq: message.canonical_seq,
    sender_name: message.sender_name,
    text: message.text,
    alignment_status: 'missing',
    confirmation_status: 'unconfirmed',
    association_reason: 'voice_info_source_missing',
    candidate_message_uids: JSON.stringify([message.message_uid]),
    matched_fields: JSON.stringify([]),
    missing_fields: JSON.stringify(['voice_info']),
    conflicting_fields: JSON.stringify([]),
    evidence_kind: 'message_type',
    evidence_signature: evidenceSignature,
    packed_info_valid: true,
    detail_packed_info_valid: true,
    lookup_evidence: JSON.stringify(['message-type:34']),
    filenames: JSON.stringify([]),
    packed_info_payload_sha256: sha256(`${message.message_uid}\0voice`),
    source_match_method: 'message_type',
    source_presence: 'missing',
    source_content_sha256: null,
    materialized_relative_path: null,
    materialized_size: null,
    materialized_content_sha256: null,
    media_format: null,
    expected_size: null,
    detail_status: null,
    materialization: 'source_missing',
    preview_status: 'unavailable',
    failure_reason: 'voice_info_source_missing',
  }
}

export function createVoiceInfoArtifact(input: {
  message: AssetCanonicalMessage | null
  record: VoiceInfoRecord
  materialization: VoiceMaterializationResult | null
}): ConversationArtifactRecord {
  const confirmed = input.record.alignment.status === 'unique'
    && input.record.alignment.messageUid !== null
    && input.message?.message_uid === input.record.alignment.messageUid
  const signatureUid = input.record.alignment.messageUid
    ?? `unlinked-voice:${input.record.sourceDatabase}:${input.record.sourceRowId}`
  const lookupEvidence = [
    `voice-info:${input.record.evidence.dataIndex || 'default'}`,
    ...(input.record.evidence.serverId ? [`voice-server:${input.record.evidence.serverId}`] : []),
  ]
  const evidenceSignature = createResourceEvidenceSignature({
    message_uid: signatureUid,
    canonical_chat_scope: input.record.evidence.chatUsername || 'unlinked',
    resource_kind: `voice:${input.record.evidence.dataIndex || 'default'}`,
    lookup_evidence: lookupEvidence,
  })
  const assetId = confirmed
    ? createAssetId(signatureUid, evidenceSignature, `voice:${input.record.evidence.dataIndex || 'default'}`)
    : null
  const sourceDigest = digestBytes(input.record.payload)
  const ready = confirmed && input.materialization?.status === 'ready'
    ? input.materialization
    : null
  const failedMaterialization = confirmed && input.materialization?.status === 'unsupported_codec'
    ? input.materialization
    : null
  const materialization = ready
    ? 'ready'
    : failedMaterialization
      ? 'unsupported_codec'
      : 'not_attempted'
  const failureReason = ready
    ? null
    : failedMaterialization?.reason
      ?? (confirmed
        ? 'voice_materialization_not_attempted'
        : `voice_association_${input.record.alignment.status}`)

  return {
    asset_id: assetId,
    conv_id: input.message?.conv_id ?? input.record.alignment.conversationId,
    message_uid: input.record.alignment.messageUid,
    resource_message_id: null,
    resource_id: `${input.record.sourceDatabase}:${input.record.sourceRowId}`,
    resource_type: 'voice_info',
    data_index: input.record.evidence.dataIndex,
    category: 'work',
    kind: 'voice',
    name: '语音消息',
    preview: 'voice',
    url: null,
    source_relative_path: null,
    source_size: input.record.payload.length,
    created_at: input.message?.create_time ?? input.record.evidence.occurredAtEpochS,
    canonical_seq: input.message?.canonical_seq ?? null,
    sender_name: input.message?.sender_name ?? '',
    text: input.message?.text ?? '',
    alignment_status: confirmed ? 'exact' : input.record.alignment.status,
    confirmation_status: confirmed ? 'confirmed' : 'unconfirmed',
    association_reason: confirmed ? null : `voice_association_${input.record.alignment.status}`,
    candidate_message_uids: JSON.stringify(input.record.alignment.candidateMessageUids),
    matched_fields: JSON.stringify(input.record.alignment.matchedFields),
    missing_fields: JSON.stringify(confirmed ? [] : ['message_uid']),
    conflicting_fields: JSON.stringify(input.record.alignment.conflictingFields),
    evidence_kind: confirmed ? 'voice_info_unique' : `voice_info_${input.record.alignment.status}`,
    evidence_signature: evidenceSignature,
    packed_info_valid: true,
    detail_packed_info_valid: true,
    lookup_evidence: JSON.stringify(lookupEvidence),
    filenames: JSON.stringify([]),
    packed_info_payload_sha256: sourceDigest,
    source_match_method: confirmed ? 'voice_info_unique' : `voice_info_${input.record.alignment.status}`,
    source_presence: 'present',
    source_content_sha256: sourceDigest,
    materialized_relative_path: ready?.relativePath ?? null,
    materialized_size: ready?.size ?? null,
    materialized_content_sha256: ready?.contentSha256 ?? null,
    media_format: ready?.format ?? null,
    expected_size: input.record.payload.length,
    detail_status: null,
    materialization,
    preview_status: 'unavailable',
    failure_reason: failureReason,
  }
}
