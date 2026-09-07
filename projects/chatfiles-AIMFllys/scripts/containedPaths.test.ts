import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'

import type { ContainedPathFileSystem, ContainedPathNode } from './containedPaths.js'
import { resolveContainedWriteTarget } from './containedPaths.js'

class FakePathFileSystem implements ContainedPathFileSystem {
  readonly nodes = new Map<string, ContainedPathNode>()

  directory(candidate: string, realPath = candidate) {
    this.nodes.set(path.resolve(candidate).toLowerCase(), { kind: 'directory', realPath: path.resolve(realPath) })
    return this
  }

  symlink(candidate: string, realPath: string) {
    this.nodes.set(path.resolve(candidate).toLowerCase(), { kind: 'symlink', realPath: path.resolve(realPath) })
    return this
  }

  inspect(candidate: string) {
    return this.nodes.get(path.resolve(candidate).toLowerCase()) ?? { kind: 'missing' as const }
  }

  createDirectory(candidate: string) {
    this.directory(candidate)
  }
}

test('creates only contained parents for a Chinese archive filename', () => {
  const archiveRoot = 'D:\\project\\archive'
  const target = path.join(archiveRoot, '学业', '文档', '人物资料.pdf')
  const fileSystem = new FakePathFileSystem().directory(archiveRoot)

  const resolved = resolveContainedWriteTarget(archiveRoot, target, fileSystem)

  assert.equal(resolved, path.resolve(target))
  assert.equal(fileSystem.inspect(path.join(archiveRoot, '学业')).kind, 'directory')
  assert.equal(fileSystem.inspect(path.join(archiveRoot, '学业', '文档')).kind, 'directory')
})

test('rejects lexical traversal before creating any directory', () => {
  const archiveRoot = 'D:\\project\\archive'
  const fileSystem = new FakePathFileSystem().directory(archiveRoot)

  assert.throws(
    () => resolveContainedWriteTarget(archiveRoot, path.join(archiveRoot, '..', 'outside.txt'), fileSystem),
    /outside/i,
  )
  assert.equal(fileSystem.inspect('D:\\project\\outside.txt').kind, 'missing')
})

test('rejects a symlinked parent even when the lexical path is inside archive', () => {
  const archiveRoot = 'D:\\project\\archive'
  const linkedCategory = path.join(archiveRoot, '学业')
  const target = path.join(linkedCategory, '文档', '资料.pdf')
  const fileSystem = new FakePathFileSystem()
    .directory(archiveRoot)
    .symlink(linkedCategory, 'E:\\outside\\学业')

  assert.throws(() => resolveContainedWriteTarget(archiveRoot, target, fileSystem), /symlink/i)
  assert.equal(fileSystem.inspect(path.join(linkedCategory, '文档')).kind, 'missing')
})

test('rejects a directory whose realpath leaves archive', () => {
  const archiveRoot = 'D:\\project\\archive'
  const escapedCategory = path.join(archiveRoot, '素材')
  const fileSystem = new FakePathFileSystem()
    .directory(archiveRoot)
    .directory(escapedCategory, 'E:\\outside\\素材')

  assert.throws(
    () => resolveContainedWriteTarget(archiveRoot, path.join(escapedCategory, '附件.zip'), fileSystem),
    /real path/i,
  )
})
