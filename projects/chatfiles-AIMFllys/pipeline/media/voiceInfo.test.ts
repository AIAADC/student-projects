import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  alignVoiceInfo,
  inspectVoicePayload,
  materializeVoicePayload,
  type VoiceCandidate,
  type VoiceInfoEvidence,
} from './voiceInfo.js'

const baseEvidence: VoiceInfoEvidence = {
  chatUsername: 'room@chatroom',
  localId: 7,
  serverId: '9001',
  occurredAtEpochS: 1_700_000_000,
  dataIndex: '0',
}

const candidates: VoiceCandidate[] = [
  {
    messageUid: 'uid-a',
    conversationId: 'conv-a',
    chatUsername: 'room@chatroom',
    localId: 7,
    serverId: '9001',
    occurredAtEpochS: 1_700_000_000,
    dataIndex: '0',
    normalizedType: 34,
  },
  {
    messageUid: 'uid-b',
    conversationId: 'conv-a',
    chatUsername: 'room@chatroom',
    localId: 8,
    serverId: '9002',
    occurredAtEpochS: 1_700_000_001,
    dataIndex: '1',
    normalizedType: 34,
  },
]

test('aligns one VoiceInfo row only when every available locator agrees', () => {
  assert.deepEqual(alignVoiceInfo(baseEvidence, candidates), {
    status: 'unique',
    messageUid: 'uid-a',
    conversationId: 'conv-a',
    candidateMessageUids: ['uid-a'],
    matchedFields: ['chat_username', 'local_id', 'server_id', 'occurred_at_epoch_s', 'data_index'],
    conflictingFields: [],
  })
})

test('records conflict when independent strong locators point at different messages', () => {
  const result = alignVoiceInfo({ ...baseEvidence, serverId: '9002' }, candidates)
  assert.deepEqual(result, {
    status: 'conflict',
    messageUid: null,
    conversationId: 'conv-a',
    candidateMessageUids: ['uid-a', 'uid-b'],
    matchedFields: ['chat_username'],
    conflictingFields: ['local_id', 'server_id', 'occurred_at_epoch_s', 'data_index'],
  })
})

test('records a one-candidate locator contradiction as conflict rather than missing', () => {
  const result = alignVoiceInfo({ ...baseEvidence, serverId: '9999' }, candidates)
  assert.equal(result.status, 'conflict')
  assert.deepEqual(result.candidateMessageUids, ['uid-a'])
  assert.deepEqual(result.conflictingFields, [
    'local_id','server_id','occurred_at_epoch_s','data_index',
  ])
})

test('keeps missing conversations and ambiguous duplicate matches explicit', () => {
  assert.deepEqual(alignVoiceInfo({ ...baseEvidence, chatUsername: 'missing@chatroom' }, candidates), {
    status: 'missing',
    messageUid: null,
    conversationId: null,
    candidateMessageUids: [],
    matchedFields: [],
    conflictingFields: ['chat_username'],
  })

  const duplicate = { ...candidates[0]!, messageUid: 'uid-c' }
  const ambiguous = alignVoiceInfo(baseEvidence, [...candidates, duplicate])
  assert.equal(ambiguous.status, 'conflict')
  assert.deepEqual(ambiguous.candidateMessageUids, ['uid-a', 'uid-c'])
})

test('never promotes one conversation candidate without a usable voice locator', () => {
  const result = alignVoiceInfo({
    ...baseEvidence,localId: null,serverId: null,occurredAtEpochS: Number.NaN,dataIndex: '',
  }, [candidates[0]!])
  assert.deepEqual(result, {
    status: 'missing',messageUid: null,conversationId: 'conv-a',candidateMessageUids: ['uid-a'],
    matchedFields: [],conflictingFields: ['locator_evidence'],
  })
})

test('recognizes the optional WeChat prefix before SILK and validates AMR payloads', () => {
  const prefixedSilk = Buffer.concat([Buffer.from([0x02]), Buffer.from('#!SILK_V3fixture', 'ascii')])
  assert.deepEqual(inspectVoicePayload(prefixedSilk), {
    status: 'ready', format: 'silk', bytes: Buffer.from('#!SILK_V3fixture', 'ascii'),
  })
  const amr = Buffer.from('#!AMR\nfixture', 'ascii')
  assert.deepEqual(inspectVoicePayload(amr), { status: 'ready', format: 'amr', bytes: amr })
  assert.deepEqual(inspectVoicePayload(Buffer.from([0x02, 0x01, 0x02])), {
    status: 'unsupported_codec', reason: 'unknown_voice_magic',
  })
})

test('writes only a verified voice payload inside bundle staging', (t) => {
  const stagingDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chatfiles-voice-'))
  t.after(() => fs.rmSync(stagingDir, { recursive: true, force: true }))
  const assetId = 'b'.repeat(64)
  const payload = Buffer.concat([Buffer.from([0x02]), Buffer.from('#!SILK_V3fixture', 'ascii')])
  const result = materializeVoicePayload({ assetId, payload, stagingDir })
  assert.equal(result.status, 'ready')
  if (result.status !== 'ready') throw new Error('Expected voice materialization')
  assert.equal(result.relativePath, `media/${assetId}.silk`)
  assert.match(result.contentSha256, /^sha256:[a-f0-9]{64}$/u)
  assert.deepEqual(
    fs.readFileSync(path.join(stagingDir, ...result.relativePath.split('/'))),
    Buffer.from('#!SILK_V3fixture', 'ascii'),
  )
  assert.throws(
    () => materializeVoicePayload({ assetId: '../escape', payload, stagingDir }),
    /MEDIA_ASSET_ID_INVALID/u,
  )
})
