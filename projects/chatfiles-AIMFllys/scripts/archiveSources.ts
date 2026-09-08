import fs from 'node:fs'
import path from 'node:path'

export type ArchiveSourceNode =
  | { kind: 'missing' }
  | { kind: 'file'; realPath: string }
  | { kind: 'directory'; realPath: string }
  | { kind: 'symlink'; realPath?: string }

export type ArchiveSourceFileSystem = {
  inspect(candidate: string): ArchiveSourceNode
  listDirectoryNames(candidate: string): string[]
}

export type ArchiveSourceIssue = {
  kind:
    | 'missing-explicit-root'
    | 'not-a-directory'
    | 'unsafe-symlink'
    | 'outside-configured-root'
    | 'invalid-qq-number'
    | 'invalid-legacy-roots-flag'
    | 'missing-account-msg-root'
  candidate: string
}

export type ResolveArchiveSourceRootsOptions = {
  home: string
  environment: Record<string, string | undefined>
  fileSystem?: ArchiveSourceFileSystem
  includeDefaults?: boolean
}

const nodeFileSystem: ArchiveSourceFileSystem = {
  inspect(candidate) {
    if (!fs.existsSync(candidate)) return { kind: 'missing' }
    const stat = fs.lstatSync(candidate)
    if (stat.isSymbolicLink()) {
      try {
        return { kind: 'symlink', realPath: fs.realpathSync(candidate) }
      } catch {
        return { kind: 'symlink' }
      }
    }
    if (stat.isDirectory()) return { kind: 'directory', realPath: fs.realpathSync(candidate) }
    return { kind: 'file', realPath: fs.realpathSync(candidate) }
  },
  listDirectoryNames(candidate) {
    return fs.readdirSync(candidate, { withFileTypes: true }).map((entry) => entry.name)
  },
}

function isContained(parent: string, candidate: string) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate))
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
}

function uniquePaths(candidates: string[]) {
  return candidates.filter(
    (candidate, index, all) =>
      all.findIndex((item) => path.resolve(item).toLowerCase() === path.resolve(candidate).toLowerCase()) === index,
  )
}

function sameResolvedPath(left: string, right: string) {
  return path.resolve(left).toLowerCase() === path.resolve(right).toLowerCase()
}

function inspectDirectory(
  candidate: string,
  fileSystem: ArchiveSourceFileSystem,
  issues: ArchiveSourceIssue[],
  explicit: boolean,
) {
  const node = fileSystem.inspect(candidate)
  if (node.kind === 'directory') return node
  if (node.kind === 'symlink') issues.push({ kind: 'unsafe-symlink', candidate })
  else if (explicit && node.kind === 'missing') issues.push({ kind: 'missing-explicit-root', candidate })
  else if (explicit && node.kind === 'file') issues.push({ kind: 'not-a-directory', candidate })
  return undefined
}

function inspectContainedDirectory(
  candidate: string,
  configuredRealRoot: string,
  fileSystem: ArchiveSourceFileSystem,
  issues: ArchiveSourceIssue[],
) {
  const node = fileSystem.inspect(candidate)
  if (node.kind === 'symlink') {
    issues.push({ kind: 'unsafe-symlink', candidate })
    return undefined
  }
  if (node.kind !== 'directory') return undefined
  if (!isContained(configuredRealRoot, node.realPath)) {
    issues.push({ kind: 'outside-configured-root', candidate })
    return undefined
  }
  return node
}

function resolveWechatOverride(
  configured: string,
  fileSystem: ArchiveSourceFileSystem,
  issues: ArchiveSourceIssue[],
) {
  const root = path.resolve(configured)
  const rootNode = inspectDirectory(root, fileSystem, issues, true)
  if (!rootNode) return []
  const basename = path.basename(root).toLowerCase()

  if (basename === 'msg') {
    const account = path.dirname(root)
    if (!/^wxid_/i.test(path.basename(account))) {
      issues.push({ kind: 'missing-account-msg-root', candidate: root })
      return []
    }
    const accountNode = inspectDirectory(account, fileSystem, issues, true)
    if (!accountNode || !isContained(accountNode.realPath, rootNode.realPath)) {
      if (accountNode && !isContained(accountNode.realPath, rootNode.realPath)) {
        issues.push({ kind: 'outside-configured-root', candidate: root })
      }
      return []
    }
    return [rootNode.realPath]
  }

  if (/^wxid_/i.test(path.basename(root))) {
    const msg = path.join(root, 'msg')
    const msgNode = inspectContainedDirectory(msg, rootNode.realPath, fileSystem, issues)
    if (!msgNode) {
      issues.push({ kind: 'missing-account-msg-root', candidate: root })
      return []
    }
    return [msgNode.realPath]
  }

  const roots: string[] = []
  for (const name of fileSystem.listDirectoryNames(root)) {
    if (!/^wxid_/i.test(name)) continue
    const account = path.join(root, name)
    const accountNode = inspectContainedDirectory(account, rootNode.realPath, fileSystem, issues)
    if (!accountNode) continue
    const msg = path.join(account, 'msg')
    const msgNode = inspectContainedDirectory(msg, accountNode.realPath, fileSystem, issues)
    if (msgNode && isContained(rootNode.realPath, msgNode.realPath)) roots.push(msgNode.realPath)
  }
  return roots
}

function resolveQqOverride(
  configured: string,
  qqNumber: string | undefined,
  fileSystem: ArchiveSourceFileSystem,
  issues: ArchiveSourceIssue[],
) {
  const root = path.resolve(configured)
  const rootNode = inspectDirectory(root, fileSystem, issues, true)
  if (!rootNode) return []
  const basename = path.basename(root).toLowerCase()
  let ntData: string

  if (basename === 'nt_data') ntData = root
  else if (basename === 'nt_qq') ntData = path.join(root, 'nt_data')
  else {
    if (!qqNumber || !/^\d+$/.test(qqNumber)) {
      issues.push({ kind: 'invalid-qq-number', candidate: root })
      return []
    }
    if (/^\d+$/.test(path.basename(root)) && path.basename(root) !== qqNumber) {
      issues.push({ kind: 'invalid-qq-number', candidate: root })
      return []
    }
    ntData = /^\d+$/.test(path.basename(root))
      ? path.join(root, 'nt_qq', 'nt_data')
      : path.join(root, qqNumber, 'nt_qq', 'nt_data')
  }

  const ntDataNode = inspectContainedDirectory(ntData, rootNode.realPath, fileSystem, issues)
  if (!ntDataNode) {
    issues.push({ kind: 'missing-account-msg-root', candidate: ntData })
    return []
  }
  return [ntDataNode.realPath]
}

function addExistingDefaultRoot(
  roots: string[],
  candidate: string,
  fileSystem: ArchiveSourceFileSystem,
  issues: ArchiveSourceIssue[],
) {
  const node = inspectDirectory(candidate, fileSystem, issues, false)
  if (!node) return
  if (!sameResolvedPath(candidate, node.realPath)) {
    issues.push({ kind: 'outside-configured-root', candidate })
    return
  }
  roots.push(node.realPath)
}

export function resolveArchiveSourceRoots(options: ResolveArchiveSourceRootsOptions) {
  const fileSystem = options.fileSystem ?? nodeFileSystem
  const includeDefaults = options.includeDefaults ?? true
  const issues: ArchiveSourceIssue[] = []
  const roots: string[] = []
  const configuredWechat = options.environment.WECHAT_STORE?.trim()
  const configuredQq = options.environment.QQ_STORE?.trim()
  const qqNumber = options.environment.QQ_NUMBER?.trim()
  const legacyRootsFlag = options.environment.CHATFILES_INCLUDE_LEGACY_CHAT_ROOTS?.trim()
  const includeLegacyRoots = legacyRootsFlag === '1'

  if (legacyRootsFlag && legacyRootsFlag !== '0' && legacyRootsFlag !== '1') {
    issues.push({ kind: 'invalid-legacy-roots-flag', candidate: 'CHATFILES_INCLUDE_LEGACY_CHAT_ROOTS' })
  }

  if (configuredWechat) roots.push(...resolveWechatOverride(configuredWechat, fileSystem, issues))
  if (configuredQq) roots.push(...resolveQqOverride(configuredQq, qqNumber, fileSystem, issues))
  else if (qqNumber && !/^\d+$/.test(qqNumber)) {
    issues.push({ kind: 'invalid-qq-number', candidate: 'QQ_NUMBER' })
  }

  if (includeDefaults) {
    if (!configuredWechat) {
      for (const store of [path.join(options.home, 'xwechat_files'), path.join(options.home, 'Documents', 'xwechat_files')]) {
        const storeNode = inspectDirectory(store, fileSystem, issues, false)
        if (!storeNode) continue
        if (!sameResolvedPath(store, storeNode.realPath)) {
          issues.push({ kind: 'outside-configured-root', candidate: store })
          continue
        }
        roots.push(...resolveWechatOverride(store, fileSystem, issues))
      }
    }

    if (!configuredQq && qqNumber && /^\d+$/.test(qqNumber)) {
      const qqRoot = path.join(options.home, 'Documents', 'Tencent Files', qqNumber, 'nt_qq', 'nt_data')
      addExistingDefaultRoot(roots, qqRoot, fileSystem, issues)
    }

    if (includeLegacyRoots) {
      for (const candidate of [
        path.join(options.home, 'Documents', 'Tencent Files'),
        path.join(options.home, 'Documents', 'WeChat Files'),
        path.join(options.home, 'AppData', 'Roaming', 'QQ'),
        path.join(options.home, 'AppData', 'Roaming', 'Tencent', 'QQ'),
        path.join(options.home, 'AppData', 'Roaming', 'Tencent', 'xwechat'),
        path.join(options.home, 'AppData', 'Roaming', 'Tencent', 'WeChat'),
        path.join(options.home, 'AppData', 'Local', 'Temp', 'WeChat Files'),
      ]) {
        addExistingDefaultRoot(roots, candidate, fileSystem, issues)
      }
    }
  }

  return { roots: uniquePaths(roots.map((candidate) => path.resolve(candidate))), issues }
}
