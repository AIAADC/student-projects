import type { ConversationArtifactRecord } from './conversationAssetModel.js'
import type { ConversationAssetMetrics } from './conversationAssetBuilderSupport.js'

type InsertResult = { assetInserted: boolean; quarantined: boolean }

export function persistConversationAsset(
  insert: (record: ConversationArtifactRecord) => InsertResult,
  metrics: ConversationAssetMetrics,
  record: ConversationArtifactRecord,
) {
  const result = insert(record)
  const candidateUids = JSON.parse(record.candidate_message_uids) as string[]
  metrics.sources++
  metrics.associations++
  metrics.materializations++
  metrics.candidates += candidateUids.length
  if (result.assetInserted) metrics.assets++
  if (result.quarantined) metrics.quarantined++
  if (record.confirmation_status === 'confirmed') metrics.confirmedAssociations++
  else metrics.unconfirmedAssociations++
  if (record.materialization === 'ready') metrics.ready++
  else if (record.materialization === 'not_attempted') metrics.notAttempted++
  else metrics.unavailable++
  if (record.kind === 'voice') metrics.voiceAttempts++
}
