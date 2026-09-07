import type { DatabaseSync } from 'node:sqlite'

export function isCanonicalWechatDatabase(database: DatabaseSync) {
  try {
    const columns = database.prepare('PRAGMA table_info(messages)').all() as Array<{ name: string }>
    return columns.some((column) => column.name === 'message_uid')
  } catch {
    return false
  }
}
