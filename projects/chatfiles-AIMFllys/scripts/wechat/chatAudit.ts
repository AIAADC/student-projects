import fs from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import {
  appendAuditIssue as addIssue,
  auditColumnNames as columnNames,
  auditScalar as scalar,
} from '../../pipeline/wechat/auditSupport.js'
import { auditCanonicalV2 } from '../../pipeline/wechat/canonicalAudit.js'
import {
  requiredBundleMetadataColumns,
  requiredConversationColumns,
  requiredMessageColumns,
  requiredParseRunColumns,
  requiredPeopleColumns,
  requiredSourceInventoryColumns,
  type ChatAuditIssue,
  type ChatAuditResult,
} from './chatAuditSchema.js'

export type { ChatAuditIssue, ChatAuditResult } from './chatAuditSchema.js'

export function auditWechatDatabase(dbPath: string): ChatAuditResult {
  if (!fs.existsSync(dbPath)) throw new Error(`WeChat database not found: ${dbPath}`)

  const db = new DatabaseSync(dbPath, { readOnly: true })
  try {
    const issues: ChatAuditIssue[] = []
    const conversationColumns = columnNames(db, 'conversations')
    const messageColumns = columnNames(db, 'messages')
    const parseRunColumns = columnNames(db, 'parse_runs')
    const peopleColumns = columnNames(db, 'people')
    const inventoryColumns = columnNames(db, 'source_inventory')
    const metadataColumns = columnNames(db, 'bundle_metadata')
    const missingColumns = [
      ...requiredConversationColumns.filter((name) => !conversationColumns.has(name)).map((name) => `conversations.${name}`),
      ...requiredMessageColumns.filter((name) => !messageColumns.has(name)).map((name) => `messages.${name}`),
      ...requiredParseRunColumns.filter((name) => !parseRunColumns.has(name)).map((name) => `parse_runs.${name}`),
      ...requiredPeopleColumns.filter((name) => !peopleColumns.has(name)).map((name) => `people.${name}`),
      ...requiredSourceInventoryColumns.filter((name) => !inventoryColumns.has(name)).map((name) => `source_inventory.${name}`),
      ...requiredBundleMetadataColumns.filter((name) => !metadataColumns.has(name)).map((name) => `bundle_metadata.${name}`),
    ]

    if (missingColumns.length > 0) {
      issues.push({
        code: 'schema-missing-column',
        count: missingColumns.length,
        detail: missingColumns.join(', '),
      })
      return {
        ok: false,
        metrics: { conversations: 0, messages: 0, textMessages: 0, accounts: 0 },
        issues,
      }
    }

    const metrics = {
      conversations: scalar(db, 'SELECT count(*) AS value FROM conversations'),
      messages: scalar(db, 'SELECT count(*) AS value FROM messages'),
      textMessages: scalar(db, "SELECT count(*) AS value FROM messages WHERE type=1 AND trim(text)<>''"),
      accounts: scalar(db, 'SELECT count(DISTINCT account) AS value FROM conversations'),
    }

    const parseRunCount = scalar(db, 'SELECT count(*) AS value FROM parse_runs')
    addIssue(
      issues,
      'parse-run-record-count',
      parseRunCount === 1 ? 0 : Math.max(1, Math.abs(parseRunCount - 1)),
      'A completed candidate database must contain exactly one parse_runs record.',
    )
    addIssue(
      issues,
      'empty-output',
      Number(metrics.conversations === 0) + Number(metrics.messages === 0),
      'A completed parse must contain at least one conversation and one message.',
    )

    if (parseRunCount === 1) {
      const run = db.prepare('SELECT * FROM parse_runs').get() as Record<string, unknown>
      const number = (name: string) => Number(run[name] ?? 0)
      addIssue(
        issues,
        'parse-run-not-complete',
        String(run.status ?? '') === 'complete' && String(run.completed_at ?? '').trim() ? 0 : 1,
        'The parse run must be marked complete and retain a completion timestamp.',
      )
      addIssue(
        issues,
        'parse-run-source-output-mismatch',
        [
          number('selected_snapshot_count') <= 0,
          number('selected_source_count') <= 0,
          number('source_conversation_count') <= 0,
          number('source_message_count') <= 0,
          number('source_conversation_count') !== number('output_conversation_count'),
          number('source_message_count')
            !== number('output_message_count') + number('deduplicated_message_count'),
        ].filter(Boolean).length,
        'Selected source counts must be positive and close against output plus deduplicated messages.',
      )
      addIssue(
        issues,
        'parse-run-database-count-mismatch',
        [
          number('output_conversation_count') !== metrics.conversations,
          number('output_message_count') !== metrics.messages,
          number('output_text_count') !== metrics.textMessages,
        ].filter(Boolean).length,
        'The completion record must match the candidate database output counts.',
      )
    }

    addIssue(
      issues,
      'missing-provenance',
      scalar(
        db,
        `SELECT count(*) AS value FROM messages
         WHERE message_uid IS NULL OR trim(message_uid)=''
            OR source_snapshot IS NULL OR trim(source_snapshot)=''
            OR source_db IS NULL OR trim(source_db)=''
            OR source_table IS NULL OR trim(source_table)=''
            OR local_id IS NULL OR sort_seq IS NULL OR source_sort_seq IS NULL
            OR canonical_seq IS NULL OR occurred_at_epoch_s IS NULL
            OR sender_source IS NULL OR trim(sender_source)=''`,
      ),
      'Every message must retain its source shard, table, local id, sort sequence and sender-resolution source.',
    )

    addIssue(
      issues,
      'duplicate-message-uid',
      scalar(
        db,
        `SELECT count(*) AS value FROM (
           SELECT message_uid FROM messages
           GROUP BY message_uid HAVING count(*) > 1
         )`,
      ),
      'A stable message uid resolves to multiple rows.',
    )

    addIssue(
      issues,
      'duplicate-evidence-key',
      scalar(
        db,
        `SELECT count(*) AS value FROM (
           SELECT conv_id, source_db, source_table, local_id
           FROM messages
           GROUP BY conv_id, source_db, source_table, local_id
           HAVING count(*) > 1
         )`,
      ),
      'A conversation/source-shard/local-id evidence key resolves to multiple messages.',
    )

    addIssue(
      issues,
      'duplicate-server-id',
      scalar(
        db,
        `SELECT count(*) AS value FROM (
           SELECT conv_id, server_id
           FROM messages
           WHERE server_id IS NOT NULL AND trim(server_id)<>'' AND server_id<>'0'
           GROUP BY conv_id, server_id
           HAVING count(*) > 1
         )`,
      ),
      'A non-zero server id appears more than once in one conversation.',
    )

    addIssue(
      issues,
      'private-sender-outside-participants',
      scalar(
        db,
        `SELECT count(*) AS value
         FROM messages m JOIN conversations c ON c.id=m.conv_id
         WHERE c.is_group=0 AND trim(COALESCE(m.sender,''))<>''
           AND m.sender<>c.owner AND m.sender<>c.username`,
      ),
      'A private-chat sender is neither the canonical owner nor the conversation peer.',
    )

    addIssue(
      issues,
      'group-prefix-sender-mismatch',
      scalar(
        db,
        `SELECT count(*) AS value FROM messages
         WHERE trim(COALESCE(sender_prefix,''))<>''
           AND trim(COALESCE(sender,''))<>''
           AND sender_prefix<>sender`,
      ),
      'A sender embedded in the group body conflicts with the same-shard Name2Id mapping.',
    )

    addIssue(
      issues,
      'message-type-not-normalized',
      scalar(
        db,
        `SELECT count(*) AS value FROM messages
         WHERE (((raw_type % 4294967296) + 4294967296) % 4294967296)<>type`,
      ),
      'The base message type does not match the low 32 bits of raw_type.',
    )

    const replacement = '\uFFFD'
    addIssue(
      issues,
      'replacement-character',
      scalar(
        db,
        `SELECT count(*) AS value
         FROM messages m LEFT JOIN conversations c ON c.id=m.conv_id
         WHERE instr(COALESCE(m.text,''), ?) > 0
            OR instr(COALESCE(m.sender_name,''), ?) > 0
            OR instr(COALESCE(c.display,''), ?) > 0`,
        replacement,
        replacement,
        replacement,
      ),
      'Decoded content contains the Unicode replacement character.',
    )

    addIssue(
      issues,
      'conversation-count-mismatch',
      scalar(
        db,
        `SELECT count(*) AS value
         FROM conversations c
         LEFT JOIN (
           SELECT conv_id, count(*) AS messages,
             sum(CASE WHEN type=1 AND trim(text)<>'' THEN 1 ELSE 0 END) AS text_messages
           FROM messages GROUP BY conv_id
         ) a ON a.conv_id=c.id
         WHERE c.msg_count<>COALESCE(a.messages,0)
            OR c.text_count<>COALESCE(a.text_messages,0)`,
      ),
      'Conversation counters do not equal their message rows.',
    )

    addIssue(
      issues,
      'message-order-not-monotonic',
      scalar(
        db,
        `SELECT count(*) AS value FROM (
           SELECT conv_id, canonical_seq, occurred_at_epoch_s,
             lag(canonical_seq) OVER (PARTITION BY conv_id ORDER BY canonical_seq) AS previous_seq,
             lag(occurred_at_epoch_s) OVER (PARTITION BY conv_id ORDER BY canonical_seq) AS previous_time
           FROM messages
         )
         WHERE (previous_seq IS NULL AND canonical_seq<>0)
            OR (previous_seq IS NOT NULL AND canonical_seq<>previous_seq+1)
            OR (previous_time IS NOT NULL AND occurred_at_epoch_s<previous_time)`,
      ),
      'Message canonical_seq values must be contiguous and source time must not move backwards.',
    )

    addIssue(
      issues,
      'is-own-mismatch',
      scalar(
        db,
        `SELECT count(*) AS value
         FROM messages m JOIN conversations c ON c.id=m.conv_id
         WHERE (m.sender=c.owner AND m.is_own<>1)
            OR (trim(COALESCE(m.sender,''))<>'' AND m.sender<>c.owner AND m.is_own<>0)`,
      ),
      'is_own does not agree with the exact canonical owner id.',
    )

    addIssue(
      issues,
      'duplicate-owner-snapshot',
      scalar(
        db,
        `SELECT count(*) AS value FROM (
           SELECT owner FROM conversations
           GROUP BY owner HAVING count(DISTINCT account)>1
         )`,
      ),
      'One canonical owner is represented by multiple decrypted snapshot directories.',
    )

    issues.push(...auditCanonicalV2(db))
    return { ok: issues.length === 0, metrics, issues }
  } finally {
    db.close()
  }
}
