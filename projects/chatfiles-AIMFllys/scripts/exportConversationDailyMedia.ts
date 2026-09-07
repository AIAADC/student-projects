import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import { exportDailyConversationMedia } from '../pipeline/media/dailyConversationExport.js'

export type DailyMediaExportOptions = {
  wechatDbPath: string
  assetDbPath: string
  bundleRoot: string
  conversationId: string
  outputRoot: string
  accountRoot?: string
}

export function parseDailyMediaExportArguments(
  args: readonly string[],
  projectRoot = path.resolve(process.cwd()),
): DailyMediaExportOptions {
  const values = new Map<string, string>()
  const supported = new Set([
    '--wechat-db','--asset-db','--bundle-root','--conversation','--output','--account-root',
  ])
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index]
    const value = args[index + 1]
    if (!key || !supported.has(key) || value === undefined) {
      throw new Error(`Unknown daily media argument: ${key ?? ''}`)
    }
    values.set(key, value)
  }
  const wechat = values.get('--wechat-db')
  const assets = values.get('--asset-db')
  const bundle = values.get('--bundle-root')
  const conversation = values.get('--conversation')?.trim()
  const output = values.get('--output')
  if (!wechat || !assets || !bundle || !conversation || !output) {
    throw new Error('Missing required daily media argument')
  }
  if (conversation.length > 300 || conversation.includes('\0')) {
    throw new Error('Invalid conversation identifier')
  }
  const account = values.get('--account-root')
  return {
    wechatDbPath: path.resolve(projectRoot, wechat),
    assetDbPath: path.resolve(projectRoot, assets),
    bundleRoot: path.resolve(projectRoot, bundle),
    conversationId: conversation,
    outputRoot: path.resolve(projectRoot, output),
    ...(account ? { accountRoot: path.resolve(projectRoot, account) } : {}),
  }
}

function regularFile(filename: string) {
  const stat = fs.lstatSync(filename)
  return stat.isFile() && !stat.isSymbolicLink()
}

function main() {
  const options = parseDailyMediaExportArguments(process.argv.slice(2))
  if (!regularFile(options.wechatDbPath) || !regularFile(options.assetDbPath)) {
    throw new Error('Daily media database is unavailable')
  }
  const canonicalDb = new DatabaseSync(options.wechatDbPath, { readOnly: true })
  const assetDb = new DatabaseSync(options.assetDbPath, { readOnly: true })
  try {
    const result = exportDailyConversationMedia({
      canonicalDb,
      assetDb,
      bundleRoot: options.bundleRoot,
      conversationId: options.conversationId,
      outputRoot: options.outputRoot,
      ...(options.accountRoot ? { accountRoot: options.accountRoot } : {}),
    })
    process.stdout.write(`${JSON.stringify(result)}\n`)
  } finally {
    assetDb.close()
    canonicalDb.close()
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main()
  } catch {
    process.stderr.write('DAILY_MEDIA_EXPORT_FAILED\n')
    process.exitCode = 1
  }
}
