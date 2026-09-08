export type ChatAuditIssue = {
  code: string
  count: number
  detail: string
}

export type ChatAuditResult = {
  ok: boolean
  metrics: {
    conversations: number
    messages: number
    textMessages: number
    accounts: number
  }
  issues: ChatAuditIssue[]
}

export const requiredConversationColumns = [
  'id', 'account', 'owner', 'owner_person_id', 'peer_person_id', 'username',
  'is_group', 'msg_count', 'text_count',
]

export const requiredMessageColumns = [
  'conv_id', 'message_uid', 'seq', 'canonical_seq', 'occurred_at_epoch_s', 'time_precision',
  'archive_day', 'source_adapter', 'source_snapshot', 'source_db', 'source_table',
  'local_id', 'server_id', 'sort_seq', 'source_sort_seq', 'time', 'sender', 'person_id',
  'sender_name', 'sender_name_snapshot', 'sender_prefix', 'is_own', 'sender_source',
  'sender_audit', 'raw_type', 'type', 'type_label', 'content_kind',
  'structured_content_json', 'text',
]

export const requiredParseRunColumns = [
  'run_id', 'status', 'completed_at', 'schema_version', 'time_zone',
  'selected_snapshot_count', 'selected_source_count', 'source_unit_count',
  'source_conversation_count', 'source_message_count', 'excluded_source_row_count',
  'output_conversation_count', 'output_message_count', 'output_text_count',
  'deduplicated_message_count',
]

export const requiredPeopleColumns = [
  'person_id', 'owner', 'username', 'display_name', 'display_name_source', 'evidence_json',
]

export const requiredSourceInventoryColumns = [
  'source_snapshot', 'domain', 'source_db', 'source_table', 'discovered_rows',
  'parsed_rows', 'deduplicated_rows', 'excluded_rows', 'exclusion_reason',
]

export const requiredBundleMetadataColumns = ['key', 'value']
