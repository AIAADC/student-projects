import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import { runConversationAssetBuilder } from './wechat/conversationAssetBuilder.js'
import { fingerprintDirectory } from './wechat/assetBundleBinding.js'
import { resolveConversationAssetSourceScope } from './wechat/conversationAssetSourceScope.js'
import { loadLocalEnv } from './localEnv.js'
import { resolveCurrentProductEntrypoint } from './data/catalogConsumer.js'

type CliOptions = {
  sourceSnapshotRoot: string
  bundleDir: string
  runId: string
}

function parseArguments(args: readonly string[], root: string): CliOptions {
  const values = new Map<string, string>()
  const allowed = new Set(['--source-snapshot', '--bundle', '--run-id'])
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index]
    const value = args[index + 1]
    if (!flag || !allowed.has(flag) || !value || values.has(flag)) {
      throw new Error('CLI_ARGUMENT_INVALID')
    }
    values.set(flag, value)
  }
  const source = values.get('--source-snapshot')
  const runId = values.get('--run-id')
  if (!source || !runId) throw new Error('CLI_ARGUMENT_INVALID')
  return {
    sourceSnapshotRoot: path.resolve(root, source),
    bundleDir: path.resolve(root, values.get('--bundle') ?? 'data/chat-assets.next'),
    runId,
  }
}

function accountCandidates(store: string) {
  const resolved = fs.realpathSync(path.resolve(store))
  if (!fs.statSync(resolved).isDirectory()) throw new Error('WECHAT_STORE_INVALID')
  const roots = path.basename(resolved).toLowerCase().startsWith('wxid_')
    ? [resolved]
    : fs.readdirSync(resolved, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink()
      && entry.name.toLowerCase().startsWith('wxid_'))
    .map((entry) => fs.realpathSync(path.join(resolved, entry.name)))
    .filter((candidate) => {
      const relative = path.relative(resolved, candidate)
      return relative !== '' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
    })
  return roots.filter((candidate) => {
    const messageDatabase = path.join(candidate, 'db_storage', 'message', 'message_0.db')
    try {
      const leaf = fs.lstatSync(messageDatabase)
      if (!leaf.isFile() || leaf.isSymbolicLink()) return false
      const realMessageDatabase = fs.realpathSync(messageDatabase)
      const relative = path.relative(candidate, realMessageDatabase)
      return relative !== ''
        && !relative.startsWith(`..${path.sep}`)
        && relative !== '..'
        && !path.isAbsolute(relative)
        && fs.statSync(realMessageDatabase).isFile()
    } catch {
      return false
    }
  })
}

export function primaryAccountRoot(store: string) {
  const candidates = accountCandidates(store)
  if (candidates.length !== 1) throw new Error('WECHAT_ACCOUNT_BINDING_UNAVAILABLE')
  return candidates[0]!
}

export function accountRootForOwner(store: string, owner: string) {
  const normalizedOwner = owner.trim().toLowerCase()
  const matches = accountCandidates(store)
    .filter((candidate) => path.basename(candidate).toLowerCase() === normalizedOwner)
  if (matches.length !== 1) throw new Error('WECHAT_ACCOUNT_FOR_OWNER_NOT_FOUND')
  return matches[0]!
}

export function accountRootForAssetBundle(store: string, bundleDir: string) {
  const database = new DatabaseSync(path.join(bundleDir, 'artifacts.db'), { readOnly: true })
  try {
    const rows = database.prepare(`
      SELECT owner,account_root_fingerprint FROM asset_runs LIMIT 2
    `).all() as Array<{ owner: string; account_root_fingerprint: string }>
    if (rows.length !== 1) throw new Error('WECHAT_ACCOUNT_BINDING_UNAVAILABLE')
    const row = rows[0]!
    const selected = accountRootForOwner(store, row.owner)
    if (fingerprintDirectory(selected) !== row.account_root_fingerprint) {
      throw new Error('WECHAT_ACCOUNT_BINDING_MISMATCH')
    }
    return selected
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('WECHAT_ACCOUNT_')) throw error
    return primaryAccountRoot(store)
  } finally {
    database.close()
  }
}

function ownerForSnapshot(wechatDbPath: string, sourceSnapshotRoot: string) {
  const database = new DatabaseSync(wechatDbPath, { readOnly: true })
  try {
    return resolveConversationAssetSourceScope(database, sourceSnapshotRoot).owner
  } finally {
    database.close()
  }
}

export function runConversationAssetCli(args = process.argv.slice(2), root = path.resolve(process.cwd())) {
  loadLocalEnv({ filePath: path.join(root, '.env.local') })
  const options = parseArguments(args, root)
  const wechatStore = process.env.WECHAT_STORE?.trim()
  if (!wechatStore) throw new Error('WECHAT_STORE is required in .env.local')
  const resourceDbPath = path.join(
    options.sourceSnapshotRoot,
    'db_storage',
    'message',
    'message_resource.db',
  )
  const wechatDbPath = resolveCurrentProductEntrypoint(
    path.join(root, 'data'),'wechat','database',
  )
  const owner = ownerForSnapshot(wechatDbPath, options.sourceSnapshotRoot)
  const result = runConversationAssetBuilder({
    wechatDbPath,
    resourceDbPath,
    sourceSnapshotRoot: options.sourceSnapshotRoot,
    accountRoot: accountRootForOwner(wechatStore, owner),
    bundleDir: options.bundleDir,
    runId: options.runId,
  })
  process.stdout.write(`${JSON.stringify({
    status: 'complete',
    runId: options.runId,
    counts: result.counts,
    metrics: result.metrics,
  })}\n`)
  return result
}

const entryPath = process.argv[1] ? path.resolve(process.argv[1]) : ''
if (entryPath === fileURLToPath(import.meta.url)) {
  try {
    runConversationAssetCli()
  } catch (error) {
    process.stderr.write(`${JSON.stringify({
      status: 'failed',
      errorCode: error instanceof Error ? error.message : 'ASSET_BUILD_FAILED',
    })}\n`)
    process.exitCode = 1
  }
}
