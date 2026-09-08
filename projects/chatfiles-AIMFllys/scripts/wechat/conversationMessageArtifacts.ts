import type { DatabaseSync } from 'node:sqlite'
import { createLinkArtifacts, type AssetCanonicalMessage } from './conversationAssetModel.js'
import {
  MESSAGE_COLUMNS,
  toAssetMessage,
  type OutputMessageRow,
} from './conversationAssetBuilderSupport.js'
import { buildConversationVoiceArtifacts } from './conversationVoiceAdapter.js'

export function persistConversationMessageArtifacts(input: {
  canonicalDb: DatabaseSync
  sourceSnapshotRoot: string
  sourceSnapshotId: string
  owner: string
  stagingDir: string
  persist: (artifact: ReturnType<typeof createLinkArtifacts>[number]) => void
}) {
  const statement = input.canonicalDb.prepare(`
    SELECT ${MESSAGE_COLUMNS}
    FROM messages m JOIN conversations c ON c.id=m.conv_id
    WHERE m.source_snapshot=? AND (m.text<>'' OR m.type=34)
    ORDER BY m.conv_id, m.canonical_seq
  `)
  const voiceMessages: AssetCanonicalMessage[] = []
  for (const row of statement.iterate(input.sourceSnapshotId) as Iterable<OutputMessageRow>) {
    const message = toAssetMessage(row, 0)
    for (const link of createLinkArtifacts(message)) input.persist(link)
    if (message.normalized_type === 34) voiceMessages.push(message)
  }
  for (const voice of buildConversationVoiceArtifacts({
    canonicalDb: input.canonicalDb,
    sourceSnapshotRoot: input.sourceSnapshotRoot,
    sourceSnapshotId: input.sourceSnapshotId,
    owner: input.owner,
    stagingDir: input.stagingDir,
    messages: voiceMessages,
  })) input.persist(voice)
}
