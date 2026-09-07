import type { ResourceMessageAlignment } from './resourceMessageAlignment.js'

export type ResourceLinkEvidenceKind =
  | 'lookup_evidence'
  | 'xml_file_identifier'
  | 'filename_only'
  | 'none'

export type ResourceLinkUnconfirmedReason =
  | 'message_alignment_not_exact'
  | 'chat_scope_mismatch'
  | 'stable_resource_evidence_mismatch'
  | 'stable_resource_evidence_missing'
  | 'filename_only'

export interface ResourceLinkEvidenceInput {
  alignment: ResourceMessageAlignment
  canonical_chat_scope: string
  resource_chat_scope: string
  message_lookup_evidence?: string | null
  candidate_lookup_evidence?: string | null
  message_xml_file_identifier?: string | null
  candidate_xml_file_identifier?: string | null
  filename?: string | null
}

export type ResourceLinkEvidenceResult =
  | {
      status: 'confirmed'
      message_uid: string
      evidence: 'lookup_evidence' | 'xml_file_identifier'
      reason: null
    }
  | {
      status: 'unconfirmed'
      message_uid: string | null
      evidence: ResourceLinkEvidenceKind
      reason: ResourceLinkUnconfirmedReason
    }

function hasNonemptyValue(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.trim() !== ''
}

function suppliedResourceEvidence(input: ResourceLinkEvidenceInput): ResourceLinkEvidenceKind {
  if (hasNonemptyValue(input.message_lookup_evidence) || hasNonemptyValue(input.candidate_lookup_evidence)) {
    return 'lookup_evidence'
  }
  if (
    hasNonemptyValue(input.message_xml_file_identifier)
    || hasNonemptyValue(input.candidate_xml_file_identifier)
  ) {
    return 'xml_file_identifier'
  }
  return hasNonemptyValue(input.filename) ? 'filename_only' : 'none'
}

function exactEvidencePair(left: string | null | undefined, right: string | null | undefined): boolean {
  return hasNonemptyValue(left) && hasNonemptyValue(right) && left === right
}

export function evaluateResourceLinkEvidence(
  input: ResourceLinkEvidenceInput,
): ResourceLinkEvidenceResult {
  const evidence = suppliedResourceEvidence(input)
  const messageUid = input.alignment.message_uid
  if (input.alignment.status !== 'exact' || messageUid === null) {
    return {
      status: 'unconfirmed',
      message_uid: messageUid,
      evidence,
      reason: 'message_alignment_not_exact',
    }
  }

  const exactChatScope = hasNonemptyValue(input.canonical_chat_scope)
    && hasNonemptyValue(input.resource_chat_scope)
    && input.canonical_chat_scope === input.resource_chat_scope
  if (!exactChatScope) {
    return {
      status: 'unconfirmed',
      message_uid: messageUid,
      evidence,
      reason: 'chat_scope_mismatch',
    }
  }

  if (exactEvidencePair(input.message_lookup_evidence, input.candidate_lookup_evidence)) {
    return {
      status: 'confirmed',
      message_uid: messageUid,
      evidence: 'lookup_evidence',
      reason: null,
    }
  }
  if (exactEvidencePair(input.message_xml_file_identifier, input.candidate_xml_file_identifier)) {
    return {
      status: 'confirmed',
      message_uid: messageUid,
      evidence: 'xml_file_identifier',
      reason: null,
    }
  }

  if (evidence === 'filename_only') {
    return {
      status: 'unconfirmed',
      message_uid: messageUid,
      evidence,
      reason: 'filename_only',
    }
  }
  return {
    status: 'unconfirmed',
    message_uid: messageUid,
    evidence,
    reason: evidence === 'none'
      ? 'stable_resource_evidence_missing'
      : 'stable_resource_evidence_mismatch',
  }
}
