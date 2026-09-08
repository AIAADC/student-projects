import path from 'node:path'
import { auditConversationAssetBundle } from './wechat/conversationAssetAudit.js'
import { accountRootForAssetBundle } from './buildConversationAssets.js'
import { loadLocalEnv } from './localEnv.js'

function option(name: string) {
  const index = process.argv.indexOf(name)
  if (index < 0) return undefined
  const value = process.argv[index + 1]
  if (!value || value.startsWith('--')) throw new Error('CLI_ARGUMENT_INVALID')
  return value
}

try {
  const root = path.resolve(process.cwd())
  loadLocalEnv({ filePath: path.join(root, '.env.local') })
  const store = process.env.WECHAT_STORE?.trim()
  if (!store) throw new Error('WECHAT_STORE is required in .env.local')
  const bundleDir = path.resolve(root, option('--bundle') ?? 'data/chat-assets.next')
  const result = auditConversationAssetBundle({
    bundleDir,
    accountRoot: accountRootForAssetBundle(store, bundleDir),
  })
  process.stdout.write(`${JSON.stringify(result)}\n`)
  if (!result.ok) process.exitCode = 1
} catch (error) {
  process.stderr.write(`${JSON.stringify({
    ok: false,
    errorCode: error instanceof Error ? error.message : 'ASSET_AUDIT_FAILED',
  })}\n`)
  process.exitCode = 1
}
