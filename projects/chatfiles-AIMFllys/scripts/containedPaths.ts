import fs from 'node:fs'
import path from 'node:path'

export type ContainedPathNode =
  | { kind: 'missing' }
  | { kind: 'file'; realPath: string }
  | { kind: 'directory'; realPath: string }
  | { kind: 'symlink'; realPath?: string }

export type ContainedPathFileSystem = {
  inspect(candidate: string): ContainedPathNode
  createDirectory(candidate: string): void
}

const nodeFileSystem: ContainedPathFileSystem = {
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
  createDirectory(candidate) {
    fs.mkdirSync(candidate)
  },
}

function relativeInside(base: string, candidate: string) {
  const relative = path.relative(path.resolve(base), path.resolve(candidate))
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`Target is outside its contained directory: ${candidate}`)
  }
  return relative
}

function inspectBase(baseDirectory: string, fileSystem: ContainedPathFileSystem) {
  const base = path.resolve(baseDirectory)
  const node = fileSystem.inspect(base)
  if (node.kind === 'symlink') throw new Error(`Contained base directory is a symlink: ${base}`)
  if (node.kind !== 'directory') throw new Error(`Contained base directory is unavailable: ${base}`)
  return { base, realPath: node.realPath }
}

function assertRealPathInside(baseRealPath: string, candidateRealPath: string) {
  try {
    relativeInside(baseRealPath, candidateRealPath)
  } catch {
    throw new Error(`Contained directory real path escaped its base: ${candidateRealPath}`)
  }
}

function ensureParents(
  baseDirectory: string,
  targetDirectory: string,
  fileSystem: ContainedPathFileSystem,
  createMissing: boolean,
) {
  const base = inspectBase(baseDirectory, fileSystem)
  const relative = relativeInside(base.base, targetDirectory)
  if (!relative) return base.base
  let current = base.base

  for (const segment of relative.split(path.sep)) {
    if (!segment || segment === '.') continue
    current = path.join(current, segment)
    let node = fileSystem.inspect(current)
    if (node.kind === 'missing' && createMissing) {
      fileSystem.createDirectory(current)
      node = fileSystem.inspect(current)
    }
    if (node.kind === 'symlink') throw new Error(`Contained parent is a symlink: ${current}`)
    if (node.kind !== 'directory') throw new Error(`Contained parent is not a directory: ${current}`)
    assertRealPathInside(base.realPath, node.realPath)
  }
  return path.resolve(targetDirectory)
}

export function ensureContainedDirectory(
  baseDirectory: string,
  targetDirectory: string,
  fileSystem: ContainedPathFileSystem = nodeFileSystem,
) {
  return ensureParents(baseDirectory, targetDirectory, fileSystem, true)
}

export function resolveContainedWriteTarget(
  baseDirectory: string,
  targetPath: string,
  fileSystem: ContainedPathFileSystem = nodeFileSystem,
) {
  const base = inspectBase(baseDirectory, fileSystem)
  const target = path.resolve(targetPath)
  const relative = relativeInside(base.base, target)
  if (!relative) throw new Error('Contained file target cannot be the base directory')
  ensureParents(base.base, path.dirname(target), fileSystem, true)
  const targetNode = fileSystem.inspect(target)
  if (targetNode.kind === 'symlink') throw new Error(`Contained file target is a symlink: ${target}`)
  if (targetNode.kind === 'directory') throw new Error(`Contained file target is a directory: ${target}`)
  if (targetNode.kind === 'file') assertRealPathInside(base.realPath, targetNode.realPath)
  return target
}

export function resolveContainedExistingFile(
  baseDirectory: string,
  targetPath: string,
  fileSystem: ContainedPathFileSystem = nodeFileSystem,
) {
  const base = inspectBase(baseDirectory, fileSystem)
  const target = path.resolve(targetPath)
  const relative = relativeInside(base.base, target)
  if (!relative) throw new Error('Contained file target cannot be the base directory')
  ensureParents(base.base, path.dirname(target), fileSystem, false)
  const targetNode = fileSystem.inspect(target)
  if (targetNode.kind === 'symlink') throw new Error(`Contained file target is a symlink: ${target}`)
  if (targetNode.kind !== 'file') throw new Error(`Contained file target is not a regular file: ${target}`)
  assertRealPathInside(base.realPath, targetNode.realPath)
  return target
}
