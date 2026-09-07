import { createHash } from 'node:crypto'

export const RESOURCE_EVIDENCE_SIGNATURE_FIELDS = [
  'message_uid',
  'canonical_chat_scope',
  'resource_kind',
  'lookup_evidence',
  'xml_file_identifier',
] as const

export interface ResourceEvidenceSignatureInput {
  message_uid: string
  canonical_chat_scope: string
  resource_kind: string
  lookup_evidence?: readonly string[] | null
  xml_file_identifier?: string | null
}

function hasNonemptyValue(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.trim() !== ''
}

function requireSignatureValue(label: string, value: string): void {
  if (!hasNonemptyValue(value)) throw new TypeError(`${label} must not be empty`)
}

export function createResourceEvidenceSignature(
  input: ResourceEvidenceSignatureInput,
): string {
  requireSignatureValue('message_uid', input.message_uid)
  requireSignatureValue('canonical_chat_scope', input.canonical_chat_scope)
  requireSignatureValue('resource_kind', input.resource_kind)

  const lookupEvidence = [...new Set(input.lookup_evidence ?? [])]
    .map((value) => value.trim().toLowerCase())
    .sort()
  for (const value of lookupEvidence) {
    requireSignatureValue('lookup_evidence', value)
  }
  if (input.xml_file_identifier !== null && input.xml_file_identifier !== undefined) {
    requireSignatureValue('xml_file_identifier', input.xml_file_identifier)
  }
  if (lookupEvidence.length === 0 && !hasNonemptyValue(input.xml_file_identifier)) {
    throw new TypeError('At least one stable resource evidence value is required')
  }

  const canonicalPayload = [
    ['message_uid', input.message_uid],
    ['canonical_chat_scope', input.canonical_chat_scope],
    ['resource_kind', input.resource_kind],
    ['lookup_evidence', lookupEvidence],
    ['xml_file_identifier', input.xml_file_identifier ?? null],
  ]
  const digest = createHash('sha256')
    .update(JSON.stringify(canonicalPayload), 'utf8')
    .digest('hex')
  return `sha256:${digest}`
}

function validateAssetIdPart(label: string, value: string): void {
  if (!value.trim()) throw new TypeError(`${label} must not be empty`)
  if (value.includes('|')) throw new TypeError(`${label} must not contain |`)
}

export function createAssetId(
  messageUid: string,
  resourceEvidenceSignature: string,
  variant: string,
): string {
  const parts = [messageUid, resourceEvidenceSignature, variant] as const
  const labels = ['message_uid', 'resource_evidence_signature', 'variant'] as const
  parts.forEach((part, index) => validateAssetIdPart(labels[index] ?? 'asset_id part', part))
  return createHash('sha256').update(parts.join('|'), 'utf8').digest('hex')
}
