import assert from 'node:assert/strict'
import test from 'node:test'
import type { ResourceMessageAlignment } from './assetEvidence.js'
import { createResourceArtifact, type AssetCanonicalMessage } from './conversationAssetModel.js'

const message: AssetCanonicalMessage = {
  conv_id: 'conv-a',message_uid: 'uid-a',canonical_seq: 0,occurred_at_epoch_s: 1_700_000_000,
  source_snapshot: 'snapshot',source_adapter: 'regular',source_db: 'message_0.db',
  chat_table: 'room@chatroom',message_table: 'Msg_fixture',local_id: 7,normalized_type: 3,
  raw_type: '3',create_time: 1_700_000_000,server_id: '9001',message_origin_source: 0,
  conversation_username: 'room@chatroom',sender_name: '成员甲',structured_content_json: '{}',text: '[图片]',
}

const alignment: ResourceMessageAlignment = {
  status: 'exact',resource_message_id: 'resource-message',message_uid: 'uid-a',
  candidate_message_uids: ['uid-a'],matched_fields: ['local_id'],missing_fields: [],conflicting_fields: [],
}

test('distinguishes a CDN-only resource from a missing local source', () => {
  const artifact = createResourceArtifact({
    message: {
      ...message,
      structured_content_json: JSON.stringify({
        mediaType: 'image',cdnReferences: { original: 'encrypted-cdn-reference' },
      }),
    },
    alignment,resourceMessageId: '100',resourceId: 'cdn',resourceType: 'image',dataIndex: '0',
    expectedSize: 4096,detailStatus: 0,lookupEvidence: [],filenames: [],
    packedInfoPayloadSha256: 'sha256:packed-info',packedInfoValid: true,
    detailPackedInfoValid: true,sourceContentSha256: null,
    fileMatch: { status: 'missing',candidate: null,candidates: [] },
  })
  assert.equal(artifact.materialization, 'cdn_only')
  assert.equal(artifact.preview_status, 'unavailable')
  assert.equal(artifact.failure_reason, 'remote_cdn_reference_without_local_cache')
  assert.equal(artifact.source_presence, 'missing')
})

test('marks a video image candidate as thumbnail-only instead of an original video', () => {
  const artifact = createResourceArtifact({
    message: { ...message,normalized_type: 43,raw_type: '43',text: '[视频]' },
    alignment,resourceMessageId: '100',resourceId: 'poster',resourceType: 'video',dataIndex: 'thumb',
    expectedSize: 128,detailStatus: 0,lookupEvidence: ['0123456789abcdef0123456789abcdef'],
    filenames: ['video_thumb.jpg'],packedInfoPayloadSha256: 'sha256:packed-info',
    packedInfoValid: true,detailPackedInfoValid: true,sourceContentSha256: 'sha256:poster',
    fileMatch: {
      status: 'lookup_exact',candidate: {
        relativePath: 'msg/video/video_thumb.jpg',name: 'video_thumb.jpg',size: 128,
      },candidates: [],
    },
  })
  assert.equal(artifact.preview, 'video')
  assert.equal(artifact.materialization, 'thumbnail_only')
  assert.equal(artifact.preview_status, 'thumbnail_only')
})

test('keeps ambiguous source evidence separate from the materialization state', () => {
  const artifact = createResourceArtifact({
    message,alignment,resourceMessageId: '100',resourceId: 'ambiguous',resourceType: 'image',
    dataIndex: '0',expectedSize: 128,detailStatus: 0,lookupEvidence: ['a'.repeat(32)],
    filenames: ['image.dat'],packedInfoPayloadSha256: 'sha256:packed-info',packedInfoValid: true,
    detailPackedInfoValid: true,sourceContentSha256: null,
    fileMatch: {
      status: 'ambiguous',candidate: null,candidates: [
        { relativePath: 'a/image.dat',name: 'image.dat',size: 128 },
        { relativePath: 'b/image.dat',name: 'image.dat',size: 128 },
      ],
    },
  })
  assert.equal(artifact.source_presence, 'ambiguous')
  assert.equal(artifact.materialization, 'not_attempted')
  assert.equal(artifact.failure_reason, 'multiple_local_candidates')
})

test('keeps source size mismatch evidence separate from the materialization state', () => {
  const artifact = createResourceArtifact({
    message,alignment,resourceMessageId: '100',resourceId: 'changed',resourceType: 'image',
    dataIndex: '0',expectedSize: 128,detailStatus: 0,lookupEvidence: ['b'.repeat(32)],
    filenames: ['image.dat'],packedInfoPayloadSha256: 'sha256:packed-info',packedInfoValid: true,
    detailPackedInfoValid: true,sourceContentSha256: null,
    fileMatch: {
      status: 'size_mismatch',candidate: null,
      candidates: [{ relativePath: 'a/image.dat',name: 'image.dat',size: 64 }],
    },
  })
  assert.equal(artifact.source_presence, 'size_mismatch')
  assert.equal(artifact.materialization, 'not_attempted')
  assert.equal(artifact.failure_reason, 'local_candidate_size_mismatch')
})
