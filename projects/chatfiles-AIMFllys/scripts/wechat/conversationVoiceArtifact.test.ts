import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { materializeVoicePayload } from '../../pipeline/media/voiceInfo.js'
import type { VoiceInfoRecord } from '../../pipeline/media/voiceInfoDatabase.js'
import type { AssetCanonicalMessage } from './conversationAssetModel.js'
import { createVoiceArtifact, createVoiceInfoArtifact } from './conversationVoiceArtifact.js'

const message: AssetCanonicalMessage = {
  conv_id: 'conv-a',
  canonical_seq: 4,
  occurred_at_epoch_s: 1_700_000_000,
  source_snapshot: 'snapshot-a',
  source_adapter: 'regular',
  conversation_username: 'room@chatroom',
  sender_name: '成员甲',
  structured_content_json: '{}',
  text: '[语音]',
  message_uid: 'uid-a',
  source_db: 'message_0.db',
  chat_table: 'room@chatroom',
  message_table: 'Msg_fixture',
  local_id: 7,
  normalized_type: 34,
  raw_type: '34',
  create_time: 1_700_000_000,
  server_id: '9001',
  message_origin_source: 0,
}

function voiceRecord(status: 'unique' | 'conflict'): VoiceInfoRecord {
  return {
    sourceDatabase: 'media_0.db',
    sourceRowId: status === 'unique' ? '1' : '2',
    evidence: {
      chatUsername: 'room@chatroom', localId: 7, serverId: status === 'unique' ? '9001' : '9002',
      occurredAtEpochS: 1_700_000_000, dataIndex: '0',
    },
    alignment: {
      status,
      messageUid: status === 'unique' ? 'uid-a' : null,
      conversationId: 'conv-a',
      candidateMessageUids: status === 'unique' ? ['uid-a'] : ['uid-a', 'uid-b'],
      matchedFields: ['chat_username'],
      conflictingFields: status === 'unique' ? [] : ['local_id', 'server_id'],
    },
    payload: Buffer.concat([Buffer.from([0x02]), Buffer.from('#!SILK_V3fixture', 'ascii')]),
  }
}

test('creates one ordinary voice asset from unique VoiceInfo evidence and a verified staging file', (t) => {
  const stagingDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chatfiles-voice-artifact-'))
  t.after(() => fs.rmSync(stagingDir, { recursive: true, force: true }))
  const record = voiceRecord('unique')
  const provisional = createVoiceInfoArtifact({ message, record, materialization: null })
  assert.match(provisional.asset_id ?? '', /^[a-f0-9]{64}$/u)
  const materialization = materializeVoicePayload({
    assetId: provisional.asset_id!, payload: record.payload, stagingDir,
  })
  const artifact = createVoiceInfoArtifact({ message, record, materialization })

  assert.equal(artifact.confirmation_status, 'confirmed')
  assert.equal(artifact.alignment_status, 'exact')
  assert.equal(artifact.source_presence, 'present')
  assert.equal(artifact.materialization, 'ready')
  assert.equal(artifact.preview_status, 'unavailable')
  assert.equal(artifact.materialized_relative_path, `media/${artifact.asset_id}.silk`)
  assert.match(artifact.materialized_content_sha256 ?? '', /^sha256:[a-f0-9]{64}$/u)
  assert.equal(artifact.media_format, 'silk')
  assert.equal(artifact.failure_reason, null)
})

test('keeps conflicting VoiceInfo evidence quarantinable and never writes it as an ordinary asset', () => {
  const artifact = createVoiceInfoArtifact({
    message: null,
    record: voiceRecord('conflict'),
    materialization: null,
  })
  assert.equal(artifact.asset_id, null)
  assert.equal(artifact.confirmation_status, 'unconfirmed')
  assert.equal(artifact.alignment_status, 'conflict')
  assert.equal(artifact.materialization, 'not_attempted')
  assert.match(artifact.failure_reason ?? '', /voice_association_conflict/u)
  assert.deepEqual(JSON.parse(artifact.candidate_message_uids), ['uid-a', 'uid-b'])
})

test('keeps a missing VoiceInfo placeholder quarantined without an ordinary asset id', () => {
  const artifact = createVoiceArtifact(message)
  assert.equal(artifact.asset_id, null)
  assert.equal(artifact.alignment_status, 'missing')
  assert.equal(artifact.confirmation_status, 'unconfirmed')
  assert.equal(artifact.materialization, 'source_missing')
  assert.equal(artifact.source_presence, 'missing')
})
