import path from 'node:path'
import { auditWechatDatabase } from './wechat/chatAudit.js'
import { reconcileChatAudits } from './wechat/combinedChatAudit.js'
import { auditSourceIdentity } from './wechat/sourceIdentityAudit.js'

function option(name: string) {
  const index = process.argv.indexOf(name)
  if (index < 0) return undefined
  const value = process.argv[index + 1]
  if (!value || value.startsWith('--')) throw new Error(`${name} requires a path`)
  return value
}

const dbPath = path.resolve(process.cwd(), option('--db') ?? 'data/wechat.next/wechat.db')

try {
  const strict = process.argv.includes('--strict')
  const sourceOption = option('--source')
  if (strict && !sourceOption) throw new Error('--strict requires --source <decrypted-wechat-root>')
  const sourcePath = sourceOption ? path.resolve(process.cwd(), sourceOption) : undefined
  const result = auditWechatDatabase(dbPath)
  const sourceIdentity = sourcePath ? auditSourceIdentity(dbPath, sourcePath) : undefined
  const combined = reconcileChatAudits(result, sourceIdentity)
  const ok = combined.ok
  console.log(JSON.stringify({
    database: dbPath,
    source: sourcePath,
    strict,
    ...result,
    sourceIdentity,
    replacementCharacterReconciliation: combined.replacementCharacterReconciliation,
    ok,
  }, null, 2))
  if (!ok) process.exitCode = 1
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}
