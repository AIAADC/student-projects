import assert from 'node:assert/strict'
import test from 'node:test'

import {
  RESOURCE_EVIDENCE_SIGNATURE_FIELDS,
  createAssetId,
  createResourceEvidenceSignature,
  type ResourceEvidenceSignatureInput,
} from './assetEvidence.js'
import { exactMessage } from './assetEvidenceTestFixtures.js'
test('creates a stable resource evidence signature in canonical field order', () => {
  assert.deepEqual(RESOURCE_EVIDENCE_SIGNATURE_FIELDS, [
    'message_uid',
    'canonical_chat_scope',
    'resource_kind',
    'lookup_evidence',
    'xml_file_identifier',
  ])

  const ordered: ResourceEvidenceSignatureInput = {
    message_uid: exactMessage.message_uid,
    canonical_chat_scope: 'chat:中文项目群',
    resource_kind: 'document',
    lookup_evidence: ['41dc6069a2c1d5a8757704fc3dea0701'],
    xml_file_identifier: 'xml-file-id:42',
  }
  const reordered: ResourceEvidenceSignatureInput = {
    xml_file_identifier: 'xml-file-id:42',
    lookup_evidence: ['41dc6069a2c1d5a8757704fc3dea0701'],
    resource_kind: 'document',
    canonical_chat_scope: 'chat:中文项目群',
    message_uid: exactMessage.message_uid,
  }

  const signature = createResourceEvidenceSignature(ordered)
  assert.equal(signature, createResourceEvidenceSignature(reordered))
  assert.match(signature, /^sha256:[a-f0-9]{64}$/u)
})
test('keeps snapshot and resource row audit coordinates out of the evidence signature', () => {
  const stableEvidence: ResourceEvidenceSignatureInput = {
    message_uid: exactMessage.message_uid,
    canonical_chat_scope: 'chat:project-room',
    resource_kind: 'document',
    lookup_evidence: ['41dc6069a2c1d5a8757704fc3dea0701'],
  }
  const firstAuditRecord = {
    ...stableEvidence,
    snapshot: 'snapshot-01',
    resource_message_id: '7',
    resource_id: '91',
  }
  const movedAuditRecord = {
    ...stableEvidence,
    snapshot: 'snapshot-02',
    resource_message_id: '8042',
    resource_id: '12001',
  }

  assert.equal(
    createResourceEvidenceSignature(firstAuditRecord),
    createResourceEvidenceSignature(movedAuditRecord),
  )
})

test('changes the resource signature when canonical or stable evidence changes', () => {
  const input: ResourceEvidenceSignatureInput = {
    message_uid: exactMessage.message_uid,
    canonical_chat_scope: 'chat:project-room',
    resource_kind: 'document',
    lookup_evidence: ['41dc6069a2c1d5a8757704fc3dea0701'],
  }
  const base = createResourceEvidenceSignature(input)

  assert.notEqual(base, createResourceEvidenceSignature({
    ...input,
    message_uid: 'wxm:canonical-message-99',
  }))
  assert.notEqual(base, createResourceEvidenceSignature({
    ...input,
    lookup_evidence: ['aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'],
  }))
  assert.notEqual(base, createResourceEvidenceSignature({
    ...input,
    xml_file_identifier: 'xml-file-id:added-evidence',
  }))
})

test('keeps raw packed payload and mutable source content out of stable identity', () => {
  const stable: ResourceEvidenceSignatureInput = {
    message_uid: exactMessage.message_uid,
    canonical_chat_scope: 'chat:project-room',
    resource_kind: 'document:0',
    lookup_evidence: ['41dc6069a2c1d5a8757704fc3dea0701'],
  }
  const withAuditOnlyFields = {
    ...stable,
    packed_info_payload_sha256: 'sha256:raw-protobuf-layout-a',
    source_content_sha256: 'sha256:source-version-a',
  }
  const changedAuditOnlyFields = {
    ...stable,
    packed_info_payload_sha256: 'sha256:raw-protobuf-layout-b',
    source_content_sha256: 'sha256:source-version-b',
  }

  assert.equal(
    createResourceEvidenceSignature(withAuditOnlyFields),
    createResourceEvidenceSignature(changedAuditOnlyFields),
  )
})

test('requires at least one stable resource evidence value for a signature', () => {
  assert.throws(() => createResourceEvidenceSignature({
    message_uid: exactMessage.message_uid,
    canonical_chat_scope: 'chat:project-room',
    resource_kind: 'document',
  }), /At least one stable resource evidence value is required/u)
})

test('keeps snapshot and resource row coordinates out of stable asset identity', () => {
  const firstAuditRecord = {
    snapshot: 'snapshot-01',
    resource_message_id: '7',
    resource_id: '91',
    message_uid: 'wxm:canonical-message-42',
    resource_evidence_signature: 'sha256:stable-resource-evidence',
    variant: 'original',
  }
  const movedAuditRecord = {
    ...firstAuditRecord,
    snapshot: 'snapshot-02',
    resource_message_id: '8042',
    resource_id: '12001',
  }
  const assetIdFor = (record: typeof firstAuditRecord) => createAssetId(
    record.message_uid,
    record.resource_evidence_signature,
    record.variant,
  )

  assert.equal(assetIdFor(firstAuditRecord), assetIdFor(movedAuditRecord))
  assert.match(assetIdFor(firstAuditRecord), /^[a-f0-9]{64}$/u)
})

test('changes asset_id when canonical message, resource evidence, or variant changes', () => {
  const base = createAssetId(
    'wxm:canonical-message-42',
    'sha256:stable-resource-evidence',
    'original',
  )

  assert.notEqual(base, createAssetId(
    'wxm:canonical-message-99',
    'sha256:stable-resource-evidence',
    'original',
  ))
  assert.notEqual(base, createAssetId(
    'wxm:canonical-message-42',
    'sha256:different-resource-evidence',
    'original',
  ))
  assert.notEqual(base, createAssetId(
    'wxm:canonical-message-42',
    'sha256:stable-resource-evidence',
    'thumbnail',
  ))
})

test('validates every stable asset identity part and rejects ambiguous separators', () => {
  const invalidCases = [
    [['', 'sha256:evidence', 'original'], /message_uid must not be empty/u],
    [['wxm:message', ' ', 'original'], /resource_evidence_signature must not be empty/u],
    [['wxm:message', 'sha256:evidence', ''], /variant must not be empty/u],
    [['wxm:message|other', 'sha256:evidence', 'original'], /message_uid must not contain \|/u],
    [['wxm:message', 'sha256:evidence|other', 'original'], /resource_evidence_signature must not contain \|/u],
    [['wxm:message', 'sha256:evidence', 'original|thumbnail'], /variant must not contain \|/u],
  ] as const

  for (const [parts, expectedError] of invalidCases) {
    assert.throws(() => createAssetId(parts[0], parts[1], parts[2]), expectedError)
  }
})
