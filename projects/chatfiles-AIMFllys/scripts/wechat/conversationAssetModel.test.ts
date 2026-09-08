import assert from 'node:assert/strict'
import test from 'node:test'
import { alignResourceMessage, type CanonicalMessage } from './assetEvidence.js'
import {
  createLinkArtifacts,
  createResourceArtifact,
  type AssetCanonicalMessage,
} from './conversationAssetModel.js'
import { createVoiceArtifact } from './conversationVoiceArtifact.js'

const canonical: CanonicalMessage = {
  message_uid: 'wxm:message-42',
  source_db: 'message_0.db',
  chat_table: 'wxid_peer',
  message_table: 'Msg_0123456789abcdef0123456789abcdef',
  local_id: 42,
  normalized_type: 49,
  raw_type: '25769803825',
  create_time: 1_783_800_000,
  server_id: '9223372036854770000',
  message_origin_source: 1,
}

const message: AssetCanonicalMessage = {
  ...canonical,
  conv_id: 'wx:owner:wxid_peer',
  canonical_seq: 0,
  occurred_at_epoch_s: canonical.create_time,
  source_snapshot: 'snapshot',
  source_adapter: 'regular',
  conversation_username: 'wxid_peer',
  sender_name: '陈同学',
  structured_content_json: '{}',
  text: '课程讲义 https://example.com/path?a=1',
}

function exactAlignment() {
  return alignResourceMessage({
    message_id: '100',
    chat_table: canonical.chat_table,
    message_table: canonical.message_table,
    local_id: canonical.local_id,
    normalized_type: canonical.normalized_type,
    raw_type: canonical.raw_type,
    create_time: canonical.create_time,
    server_id: canonical.server_id,
    message_origin_source: canonical.message_origin_source,
  }, [canonical])
}

test('creates a confirmed document artifact from stable hash and local file evidence', () => {
  const artifact = createResourceArtifact({
    message,
    alignment: exactAlignment(),
    resourceMessageId: '100',
    resourceId: '501',
    resourceType: '3342339',
    dataIndex: '0',
    expectedSize: 4096,
    detailStatus: 1,
    lookupEvidence: ['0123456789abcdef0123456789abcdef'],
    filenames: ['课程讲义.pdf'],
    packedInfoPayloadSha256: 'sha256:packed-info',
    packedInfoValid: true,
    detailPackedInfoValid: true,
    sourceContentSha256: 'sha256:source-content',
    fileMatch: {
      status: 'lookup_exact',
      candidate: {
        relativePath: 'msg\\file\\2026-07\\0123456789abcdef0123456789abcdef.pdf',
        name: '0123456789abcdef0123456789abcdef.pdf',
        size: 4096,
      },
      candidates: [],
    },
  })

  assert.equal(artifact.category, 'document')
  assert.equal(artifact.name, '课程讲义.pdf')
  assert.equal(artifact.confirmation_status, 'confirmed')
  assert.equal(artifact.association_reason, null)
  assert.equal(artifact.evidence_kind, 'lookup_evidence')
  assert.equal(artifact.materialization, 'ready')
  assert.equal(artifact.preview_status, 'ready')
  assert.equal(artifact.failure_reason, null)
  assert.equal(artifact.source_relative_path?.endsWith('.pdf'), true)
})

test('keeps filename-only local matches explicitly unconfirmed', () => {
  const artifact = createResourceArtifact({
    message,
    alignment: exactAlignment(),
    resourceMessageId: '100',
    resourceId: '502',
    resourceType: '3342339',
    dataIndex: '0',
    expectedSize: 4096,
    detailStatus: 1,
    lookupEvidence: [],
    filenames: ['课程讲义.pdf'],
    packedInfoPayloadSha256: 'sha256:packed-info',
    packedInfoValid: true,
    detailPackedInfoValid: true,
    sourceContentSha256: 'sha256:source-content',
    fileMatch: {
      status: 'filename_only',
      candidate: {
        relativePath: 'msg\\file\\2026-07\\课程讲义.pdf',
        name: '课程讲义.pdf',
        size: 4096,
      },
      candidates: [],
    },
  })

  assert.equal(artifact.confirmation_status, 'unconfirmed')
  assert.equal(artifact.evidence_kind, 'filename_only')
  assert.equal(artifact.association_reason, 'filename_only')
  assert.equal(artifact.failure_reason, null)
})

test('confirms a candidate matched by any packed-info lookup evidence value', () => {
  const matched = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
  const artifact = createResourceArtifact({
    message,
    alignment: exactAlignment(),
    resourceMessageId: '100',
    resourceId: '505',
    resourceType: '3342339',
    dataIndex: '0',
    expectedSize: 4,
    detailStatus: 1,
    lookupEvidence: ['aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', matched],
    filenames: ['资料.pdf'],
    packedInfoPayloadSha256: 'sha256:packed-info',
    packedInfoValid: true,
    detailPackedInfoValid: true,
    sourceContentSha256: 'sha256:source-content',
    fileMatch: {
      status: 'lookup_exact',
      candidate: { relativePath: `msg\\file\\${matched}.pdf`, name: `${matched}.pdf`, size: 4 },
      candidates: [],
    },
  })

  assert.equal(artifact.confirmation_status, 'confirmed')
  assert.notEqual(artifact.asset_id, null)
})

test('keeps stable asset identity independent of resource row ids and packed layout', () => {
  const base = {
    message,
    alignment: exactAlignment(),
    resourceMessageId: '100',
    resourceType: '3342339',
    dataIndex: '0',
    expectedSize: 4096,
    detailStatus: 1,
    lookupEvidence: ['0123456789abcdef0123456789abcdef'],
    filenames: ['课程讲义.pdf'],
    packedInfoValid: true,
    detailPackedInfoValid: true,
    fileMatch: {
      status: 'lookup_exact' as const,
      candidate: {
        relativePath: 'msg\\file\\0123456789abcdef0123456789abcdef.pdf',
        name: '0123456789abcdef0123456789abcdef.pdf',
        size: 4096,
      },
      candidates: [],
    },
  }
  const first = createResourceArtifact({
    ...base,
    resourceId: '501',
    packedInfoPayloadSha256: 'sha256:protobuf-layout-a',
    sourceContentSha256: 'sha256:source-version-a',
  })
  const moved = createResourceArtifact({
    ...base,
    resourceId: '9999',
    packedInfoPayloadSha256: 'sha256:protobuf-layout-b',
    sourceContentSha256: 'sha256:source-version-b',
  })

  assert.equal(first.asset_id, moved.asset_id)
})

test('records encrypted image payloads as explicit decrypt attempts', () => {
  const imageMessage: AssetCanonicalMessage = {
    ...message,
    normalized_type: 3,
    raw_type: '3',
  }
  const artifact = createResourceArtifact({
    message: imageMessage,
    alignment: { ...exactAlignment(), message_uid: imageMessage.message_uid },
    resourceMessageId: '101',
    resourceId: '503',
    resourceType: '65537',
    dataIndex: '0',
    expectedSize: 2048,
    detailStatus: 1,
    lookupEvidence: ['41dc6069a2c1d5a8757704fc3dea0701'],
    filenames: [],
    packedInfoPayloadSha256: 'sha256:image-packed-info',
    packedInfoValid: true,
    detailPackedInfoValid: true,
    sourceContentSha256: 'sha256:encrypted-source',
    fileMatch: {
      status: 'lookup_exact',
      candidate: {
        relativePath: 'msg\\attach\\room\\2026-07\\Img\\41dc6069a2c1d5a8757704fc3dea0701.dat',
        name: '41dc6069a2c1d5a8757704fc3dea0701.dat',
        size: 2048,
      },
      candidates: [],
    },
  })

  assert.equal(artifact.category, 'work')
  assert.equal(artifact.preview, 'image')
  assert.equal(artifact.materialization, 'not_attempted')
  assert.equal(artifact.preview_status, 'unavailable')
  assert.equal(artifact.failure_reason, 'encrypted_wechat_dat_requires_materialization')
})

test('never marks any matched dat source ready before verified materialization', () => {
  const artifact = createResourceArtifact({
    message,
    alignment: exactAlignment(),
    resourceMessageId: '102',
    resourceId: '504',
    resourceType: '3342339',
    dataIndex: '0',
    expectedSize: 4,
    detailStatus: 1,
    lookupEvidence: ['41dc6069a2c1d5a8757704fc3dea0701'],
    filenames: ['附件.dat'],
    packedInfoPayloadSha256: 'sha256:packed-dat',
    packedInfoValid: true,
    detailPackedInfoValid: true,
    sourceContentSha256: 'sha256:encrypted-source',
    fileMatch: {
      status: 'lookup_exact',
      candidate: {
        relativePath: 'msg\\file\\附件.dat',
        name: '附件.dat',
        size: 4,
      },
      candidates: [],
    },
  })

  assert.equal(artifact.preview, 'download')
  assert.equal(artifact.materialization, 'not_attempted')
  assert.equal(artifact.preview_status, 'unavailable')
})

test('extracts canonical links as separate ready artifacts', () => {
  const links = createLinkArtifacts(message)

  assert.equal(links.length, 1)
  assert.equal(links[0]?.category, 'link')
  assert.equal(links[0]?.url, 'https://example.com/path?a=1')
  assert.equal(links[0]?.materialization, 'ready')
  assert.equal(links[0]?.preview_status, 'ready')
})

test('creates a visible voice export attempt with a required failure reason', () => {
  const voice = createVoiceArtifact({
    ...message,
    normalized_type: 34,
    raw_type: '34',
    text: '[语音 3秒]',
  })

  assert.equal(voice.preview, 'voice')
  assert.equal(voice.materialization, 'source_missing')
  assert.equal(voice.preview_status, 'unavailable')
  assert.equal(voice.failure_reason, 'voice_info_source_missing')
  assert.equal(voice.association_reason, 'voice_info_source_missing')
  assert.equal(voice.asset_id, null)
  assert.equal(voice.confirmation_status, 'unconfirmed')
})
