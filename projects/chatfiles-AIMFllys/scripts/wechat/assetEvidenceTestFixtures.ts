import type { CanonicalMessage, ResourceMessageProbe } from './assetEvidence.js'

export const exactMessage: CanonicalMessage = {
  message_uid: 'wxm:canonical-message-42',
  source_db: 'message_0.db',
  chat_table: 'Chat_2f10',
  message_table: 'Msg_2f10',
  local_id: 42,
  normalized_type: 49,
  raw_type: '25769803825',
  create_time: 1_720_000_000,
  server_id: 'server-9001',
  message_origin_source: 2,
}

export const exactProbe: ResourceMessageProbe = {
  message_id: 'resource-message-7',
  chat_table: exactMessage.chat_table,
  message_table: exactMessage.message_table,
  local_id: exactMessage.local_id,
  normalized_type: exactMessage.normalized_type,
  raw_type: exactMessage.raw_type,
  create_time: exactMessage.create_time,
  server_id: exactMessage.server_id,
  message_origin_source: exactMessage.message_origin_source,
}
