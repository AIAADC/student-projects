import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { planInsightDelta } from './insightRefresh.js'
import { resolveCurrentProductEntrypoint } from '../data/catalogConsumer.js'

export type RefreshOptions = {
  root: string
  runId: string
  sourceDir?: string
  bundleDir?: string
  databasePath?: string
  minimumGrowth?: number
  aliasMapPath?: string
  activationRename?: (source: string, target: string) => void
}

export type AuditOptions = {
  root: string
  bundleDir?: string
  databasePath?: string
}

export type DeltaEntry = ReturnType<typeof planInsightDelta>['entries'][number]

type OwnerAliasMap = {
  version: number
  canonicalOwner: string
  aliases: Record<string, string>
  evidence: Array<Record<string, unknown>>
}

export const allowedCategories = new Set([
  '技术',
  '哲理',
  '学业',
  '创业',
  '比赛',
  'AI',
  '人物',
  '资源工具',
  '生活',
  '健康',
  '财务',
  '专业',
  '其他',
])

export function assertRunId(runId: string) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/u.test(runId)) {
    throw new Error('Run id must contain only safe ASCII filename characters')
  }
}

export function resolvePaths(options: RefreshOptions | AuditOptions) {
  const root = path.resolve(options.root)
  const databasePath = options.databasePath
    ? path.resolve(root, options.databasePath)
    : resolveCurrentProductEntrypoint(path.join(root, 'data'), 'wechat', 'database')
  return {
    root,
    sourceDir: path.resolve(root, 'sourceDir' in options && options.sourceDir ? options.sourceDir : 'data/insights'),
    bundleDir: path.resolve(root, options.bundleDir ?? 'data/insights.next'),
    databasePath,
  }
}

function assertContained(base: string, target: string, label: string) {
  const relative = path.relative(base, target)
  if (relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))) {
    return
  }
  throw new Error(`${label} must stay inside the data root`)
}

function assertDistinctPaths(pathsToCheck: Array<{ label: string; value: string }>) {
  for (let left = 0; left < pathsToCheck.length; left++) {
    for (let right = left + 1; right < pathsToCheck.length; right++) {
      const a = pathsToCheck[left]!
      const b = pathsToCheck[right]!
      const relative = path.relative(a.value, b.value)
      const reverse = path.relative(b.value, a.value)
      if (
        relative === ''
        || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
        || (!reverse.startsWith(`..${path.sep}`) && reverse !== '..' && !path.isAbsolute(reverse))
      ) {
        throw new Error(`${a.label} and ${b.label} must be distinct, non-nested paths`)
      }
    }
  }
}

function assertNoLinkedPath(root: string, target: string, label: string) {
  const relative = path.relative(root, target)
  if (relative.startsWith('..') || path.isAbsolute(relative)) return
  let current = root
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, segment)
    if (!fs.existsSync(current)) break
    if (fs.lstatSync(current).isSymbolicLink()) throw new Error(`${label} must not use a symlink or junction`)
  }
}

export function assertDataRoles(paths: ReturnType<typeof resolvePaths>, mode: 'prepare' | 'candidate' | 'audit') {
  const dataRoot = path.join(paths.root, 'data')
  assertContained(dataRoot, paths.sourceDir, 'Insight source')
  assertContained(dataRoot, paths.bundleDir, 'Insight bundle')
  assertContained(dataRoot, paths.databasePath, 'WeChat database')
  assertNoLinkedPath(paths.root, paths.sourceDir, 'Insight source')
  assertNoLinkedPath(paths.root, paths.bundleDir, 'Insight bundle')
  assertNoLinkedPath(paths.root, paths.databasePath, 'WeChat database')
  const currentDatabase = path.join(dataRoot, 'wechat.current', 'wechat.db')
  const databaseRole = path.relative(dataRoot, paths.databasePath).split(path.sep).join('/')
  const sealedDatabase = /^products\/wechat\/[0-9a-f]{64}\/wechat\.db$/u.test(databaseRole)
  if (paths.databasePath !== currentDatabase && !sealedDatabase) {
    throw new Error('WeChat database must be data/wechat.current/wechat.db')
  }
  if (mode !== 'audit' && paths.bundleDir !== path.join(dataRoot, 'insights.next')) {
    throw new Error('Writable insight bundle must be data/insights.next')
  }
  if (mode === 'prepare') {
    const sourceName = path.basename(paths.sourceDir)
    if (sourceName !== 'insights' && !sourceName.startsWith('insights.previous.')) {
      throw new Error('Insight source must be the current or a retained previous insight directory')
    }
    assertDistinctPaths([
      { label: 'Insight source', value: paths.sourceDir },
      { label: 'Insight bundle', value: paths.bundleDir },
      { label: 'WeChat database', value: paths.databasePath },
    ])
  }
}

export function sha256File(file: string) {
  const handle = fs.openSync(file, 'r')
  const hash = createHash('sha256')
  const buffer = Buffer.allocUnsafe(4 * 1024 * 1024)
  try {
    let offset = 0
    while (true) {
      const read = fs.readSync(handle, buffer, 0, buffer.length, offset)
      if (read === 0) break
      hash.update(buffer.subarray(0, read))
      offset += read
    }
  } finally {
    fs.closeSync(handle)
  }
  return hash.digest('hex')
}

export function sha256Text(value: string) {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

export function databaseFingerprint(databasePath: string) {
  const stats = fs.statSync(databasePath)
  return { sha256: sha256File(databasePath), size: stats.size }
}

export function assertDatabaseFingerprint(expected: { sha256: string; size: number }, databasePath: string) {
  const actual = databaseFingerprint(databasePath)
  if (actual.sha256 !== expected.sha256 || actual.size !== expected.size) {
    throw new Error('WeChat database fingerprint changed between insight refresh stages')
  }
}

export function loadOwnerAliases(options: RefreshOptions, root: string, canonicalOwners: Set<string>) {
  if (canonicalOwners.size !== 1) throw new Error('Insight refresh requires exactly one canonical owner')
  const canonicalOwner = [...canonicalOwners][0]!
  if (!options.aliasMapPath) return {
    aliases: {} as Record<string, string>,
    evidence: { status: 'not-required', canonicalOwner },
  }
  const aliasMapPath = path.resolve(root, options.aliasMapPath)
  const auditRoot = path.join(root, 'work', 'audits')
  const relative = path.relative(auditRoot, aliasMapPath)
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Owner alias map must stay inside work/audits')
  }
  const aliasMap = readJson<OwnerAliasMap>(aliasMapPath)
  if (
    aliasMap.version !== 1
    || aliasMap.canonicalOwner !== canonicalOwner
    || !aliasMap.aliases
    || !Array.isArray(aliasMap.evidence)
    || aliasMap.evidence.length === 0
  ) throw new Error('Owner alias map is incomplete or targets the wrong canonical owner')
  for (const target of Object.values(aliasMap.aliases)) {
    if (target !== canonicalOwner) throw new Error('Owner alias map contains a non-canonical target')
  }
  return {
    aliases: aliasMap.aliases,
    evidence: {
      status: 'validated',
      canonicalOwner,
      path: path.relative(root, aliasMapPath).replaceAll('\\', '/'),
      sha256: sha256File(aliasMapPath),
      entries: Object.keys(aliasMap.aliases).length,
    },
  }
}

export function readUtf8(file: string) {
  return new TextDecoder('utf-8', { fatal: true }).decode(fs.readFileSync(file))
}

export function readJson<T>(file: string) {
  return JSON.parse(readUtf8(file)) as T
}

export function writeJson(file: string, value: unknown, exclusive = false) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: 'utf8',
    flag: exclusive ? 'wx' : 'w',
  })
}

export function safeInsightId(convId: string) {
  return Array.from(convId.replace(/[<>:"/\\|?*@ -]/gu, '_')).slice(0, 90).join('')
}
