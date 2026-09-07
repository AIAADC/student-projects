import { DatabaseSync } from 'node:sqlite'
import { discoverSourceDatabases } from '../../pipeline/wechat/sourceInventory.js'
import { materializeVoicePayload } from '../../pipeline/media/voiceInfo.js'
import {
  readVoiceInfoEvidence,
  type VoiceInfoRecord,
} from '../../pipeline/media/voiceInfoDatabase.js'
import type {
  AssetCanonicalMessage,
  ConversationArtifactRecord,
} from './conversationAssetModel.js'
import { createVoiceArtifact, createVoiceInfoArtifact } from './conversationVoiceArtifact.js'

function conflictForDuplicate(record: VoiceInfoRecord): VoiceInfoRecord {
  return {
    ...record,
    alignment: {
      ...record.alignment,
      status: 'conflict',
      messageUid: null,
      conflictingFields: [
        ...new Set([...record.alignment.conflictingFields, 'data_index']),
      ],
    },
  }
}

export function buildConversationVoiceArtifacts(input: {
  canonicalDb: DatabaseSync
  sourceSnapshotRoot: string
  sourceSnapshotId: string
  owner: string
  stagingDir: string
  messages: readonly AssetCanonicalMessage[]
}): ConversationArtifactRecord[] {
  const voiceRecords: VoiceInfoRecord[] = []
  const mediaSources = discoverSourceDatabases(input.sourceSnapshotRoot)
    .filter((source) => source.domain === 'media')
  for (const source of mediaSources) {
    const mediaDb = new DatabaseSync(source.absolutePath, { readOnly: true })
    try {
      voiceRecords.push(...readVoiceInfoEvidence({
        canonicalDb: input.canonicalDb,
        mediaDb,
        sourceSnapshotId: input.sourceSnapshotId,
        owner: input.owner,
        sourceDatabase: source.filename,
      }))
    } finally {
      mediaDb.close()
    }
  }

  const messagesByUid = new Map(input.messages.map((message) => [message.message_uid, message]))
  const uniqueCounts = new Map<string, number>()
  for (const record of voiceRecords) {
    const uid = record.alignment.status === 'unique' ? record.alignment.messageUid : null
    if (uid) uniqueCounts.set(uid, (uniqueCounts.get(uid) ?? 0) + 1)
  }

  const affectedMessageUids = new Set<string>()
  const artifacts = voiceRecords.map((record) => {
    for (const uid of record.alignment.candidateMessageUids) affectedMessageUids.add(uid)
    const uid = record.alignment.status === 'unique' ? record.alignment.messageUid : null
    const message = uid ? messagesByUid.get(uid) ?? null : null
    if (!uid || !message || uniqueCounts.get(uid) !== 1) {
      const evidence = uid && (uniqueCounts.get(uid) ?? 0) > 1
        ? conflictForDuplicate(record)
        : record
      return createVoiceInfoArtifact({ message: null, record: evidence, materialization: null })
    }
    const provisional = createVoiceInfoArtifact({ message, record, materialization: null })
    if (!provisional.asset_id) throw new Error('VOICE_INFO_EXACT_ASSET_ID_MISSING')
    const materialization = materializeVoicePayload({
      assetId: provisional.asset_id,
      payload: record.payload,
      stagingDir: input.stagingDir,
    })
    return createVoiceInfoArtifact({ message, record, materialization })
  })

  const placeholders = input.messages
    .filter((message) => !affectedMessageUids.has(message.message_uid))
    .sort((left, right) => left.canonical_seq - right.canonical_seq)
    .map(createVoiceArtifact)
  return [...artifacts, ...placeholders]
}
