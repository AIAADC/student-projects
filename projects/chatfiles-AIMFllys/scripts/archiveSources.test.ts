import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'

import type { ArchiveSourceFileSystem, ArchiveSourceNode } from './archiveSources.js'
import { resolveArchiveSourceRoots } from './archiveSources.js'

class FakeSourceFileSystem implements ArchiveSourceFileSystem {
  readonly nodes = new Map<string, ArchiveSourceNode>()
  readonly entries = new Map<string, string[]>()

  directory(candidate: string, children: string[] = [], realPath = candidate) {
    const key = path.resolve(candidate).toLowerCase()
    this.nodes.set(key, { kind: 'directory', realPath: path.resolve(realPath) })
    this.entries.set(key, children)
    return this
  }

  symlink(candidate: string, realPath: string) {
    this.nodes.set(path.resolve(candidate).toLowerCase(), { kind: 'symlink', realPath: path.resolve(realPath) })
    return this
  }

  inspect(candidate: string) {
    return this.nodes.get(path.resolve(candidate).toLowerCase()) ?? { kind: 'missing' as const }
  }

  listDirectoryNames(candidate: string) {
    return this.entries.get(path.resolve(candidate).toLowerCase()) ?? []
  }
}

test('discovers relocated D: WeChat and QQ attachment roots from explicit local configuration', () => {
  const fileSystem = new FakeSourceFileSystem()
  const wechatStore = 'D:\\聊天迁移\\xwechat_files'
  const account = path.join(wechatStore, 'wxid_用户甲')
  const msgRoot = path.join(account, 'msg')
  const qqStore = 'D:\\QQ迁移\\Tencent Files'
  const qqRoot = path.join(qqStore, '123456789', 'nt_qq', 'nt_data')

  fileSystem
    .directory(wechatStore, ['wxid_用户甲', '普通目录'])
    .directory(account, ['msg'])
    .directory(msgRoot)
    .directory(qqStore, ['123456789'])
    .directory(path.join(qqStore, '123456789'), ['nt_qq'])
    .directory(path.join(qqStore, '123456789', 'nt_qq'), ['nt_data'])
    .directory(qqRoot)

  const result = resolveArchiveSourceRoots({
    home: 'C:\\Users\\测试用户',
    environment: {
      WECHAT_STORE: wechatStore,
      QQ_STORE: qqStore,
      QQ_NUMBER: '123456789',
    },
    fileSystem,
  })

  assert.deepEqual(result.roots, [path.resolve(msgRoot), path.resolve(qqRoot)])
  assert.deepEqual(result.issues, [])
})

test('accepts an explicit account root or msg root without widening the scan', () => {
  const account = 'D:\\聊天迁移\\xwechat_files\\wxid_用户乙'
  const msgRoot = path.join(account, 'msg')

  for (const configuredRoot of [account, msgRoot]) {
    const fileSystem = new FakeSourceFileSystem().directory(account, ['msg']).directory(msgRoot)
    const result = resolveArchiveSourceRoots({
      home: 'C:\\Users\\测试用户',
      environment: { WECHAT_STORE: configuredRoot },
      fileSystem,
      includeDefaults: false,
    })

    assert.deepEqual(result.roots, [path.resolve(msgRoot)])
    assert.deepEqual(result.issues, [])
  }
})

test('rejects symlinked and realpath-escaping account candidates', () => {
  const store = 'D:\\聊天迁移\\xwechat_files'
  const linkedAccount = path.join(store, 'wxid_link')
  const escapedAccount = path.join(store, 'wxid_escape')
  const fileSystem = new FakeSourceFileSystem()
    .directory(store, ['wxid_link', 'wxid_escape'])
    .symlink(linkedAccount, 'E:\\别处\\wxid_link')
    .directory(escapedAccount, ['msg'], 'E:\\别处\\wxid_escape')
    .directory(path.join(escapedAccount, 'msg'), [], 'E:\\别处\\wxid_escape\\msg')

  const result = resolveArchiveSourceRoots({
    home: 'C:\\Users\\测试用户',
    environment: { WECHAT_STORE: store },
    fileSystem,
    includeDefaults: false,
  })

  assert.deepEqual(result.roots, [])
  assert.deepEqual(
    result.issues.map((issue) => issue.kind),
    ['unsafe-symlink', 'outside-configured-root'],
  )
})

test('rejects unsafe QQ account identifiers instead of interpolating them into a path', () => {
  const qqStore = 'D:\\QQ迁移\\Tencent Files'
  const fileSystem = new FakeSourceFileSystem().directory(qqStore)

  const result = resolveArchiveSourceRoots({
    home: 'C:\\Users\\测试用户',
    environment: { QQ_STORE: qqStore, QQ_NUMBER: '..\\其他账号' },
    fileSystem,
    includeDefaults: false,
  })

  assert.deepEqual(result.roots, [])
  assert.deepEqual(result.issues.map((issue) => issue.kind), ['invalid-qq-number'])
})

test('does not widen an invalid QQ_NUMBER to the default Tencent Files root', () => {
  const home = 'C:\\Users\\测试用户'
  const broadRoot = path.join(home, 'Documents', 'Tencent Files')
  const fileSystem = new FakeSourceFileSystem().directory(broadRoot)

  const result = resolveArchiveSourceRoots({
    home,
    environment: { QQ_NUMBER: '..\\其他账号' },
    fileSystem,
  })

  assert.deepEqual(result.roots, [])
  assert.deepEqual(result.issues.map((issue) => issue.kind), ['invalid-qq-number'])
})

test('rejects a numeric QQ account root that disagrees with QQ_NUMBER', () => {
  const accountRoot = 'D:\\QQ迁移\\Tencent Files\\111111'
  const ntData = path.join(accountRoot, 'nt_qq', 'nt_data')
  const fileSystem = new FakeSourceFileSystem().directory(accountRoot).directory(ntData)

  const result = resolveArchiveSourceRoots({
    home: 'C:\\Users\\测试用户',
    environment: { QQ_STORE: accountRoot, QQ_NUMBER: '222222' },
    fileSystem,
    includeDefaults: false,
  })

  assert.deepEqual(result.roots, [])
  assert.deepEqual(result.issues.map((issue) => issue.kind), ['invalid-qq-number'])
})

test('does not add a broad Tencent Files root when QQ_NUMBER is absent', () => {
  const home = 'C:\\Users\\测试用户'
  const wechatStore = path.join(home, 'xwechat_files')
  const account = path.join(wechatStore, 'wxid_默认账号')
  const msgRoot = path.join(account, 'msg')
  const broadQqRoot = path.join(home, 'Documents', 'Tencent Files')
  const fileSystem = new FakeSourceFileSystem()
    .directory(wechatStore, ['wxid_默认账号'])
    .directory(account, ['msg'])
    .directory(msgRoot)
    .directory(broadQqRoot)

  const result = resolveArchiveSourceRoots({ home, environment: {}, fileSystem })

  assert.deepEqual(result.roots, [path.resolve(msgRoot)])
  assert.deepEqual(result.issues, [])
})

test('does not scan broad legacy WeChat or QQ roots without explicit opt-in', () => {
  const home = 'C:\\Users\\测试用户'
  const qqNumber = '123456789'
  const preciseQqRoot = path.join(home, 'Documents', 'Tencent Files', qqNumber, 'nt_qq', 'nt_data')
  const legacyRoots = [
    path.join(home, 'Documents', 'Tencent Files'),
    path.join(home, 'Documents', 'WeChat Files'),
    path.join(home, 'AppData', 'Roaming', 'QQ'),
    path.join(home, 'AppData', 'Roaming', 'Tencent', 'xwechat'),
  ]
  const fileSystem = new FakeSourceFileSystem().directory(preciseQqRoot)
  for (const root of legacyRoots) fileSystem.directory(root)

  const result = resolveArchiveSourceRoots({ home, environment: { QQ_NUMBER: qqNumber }, fileSystem })

  assert.deepEqual(result.roots, [path.resolve(preciseQqRoot)])
  assert.deepEqual(result.issues, [])
})

test('rejects a non-boolean legacy-root opt-in instead of widening discovery', () => {
  const home = 'C:\\Users\\测试用户'
  const broadRoot = path.join(home, 'Documents', 'Tencent Files')
  const fileSystem = new FakeSourceFileSystem().directory(broadRoot)

  const result = resolveArchiveSourceRoots({
    home,
    environment: { CHATFILES_INCLUDE_LEGACY_CHAT_ROOTS: 'true' },
    fileSystem,
  })

  assert.deepEqual(result.roots, [])
  assert.deepEqual(result.issues.map((issue) => issue.kind), ['invalid-legacy-roots-flag'])
})

test('adds legacy roots only for exact opt-in and still rejects symlinks', () => {
  const home = 'C:\\Users\\测试用户'
  const broadQqRoot = path.join(home, 'Documents', 'Tencent Files')
  const linkedWechatRoot = path.join(home, 'Documents', 'WeChat Files')
  const fileSystem = new FakeSourceFileSystem()
    .directory(broadQqRoot)
    .symlink(linkedWechatRoot, 'E:\\outside\\WeChat Files')

  const result = resolveArchiveSourceRoots({
    home,
    environment: { CHATFILES_INCLUDE_LEGACY_CHAT_ROOTS: '1' },
    fileSystem,
  })

  assert.deepEqual(result.roots, [path.resolve(broadQqRoot)])
  assert.deepEqual(result.issues.map((issue) => issue.kind), ['unsafe-symlink'])
})

test('rejects an opted-in legacy root whose canonical path escapes its fixed location', () => {
  const home = 'C:\\Users\\测试用户'
  const broadRoot = path.join(home, 'Documents', 'Tencent Files')
  const fileSystem = new FakeSourceFileSystem().directory(broadRoot, [], 'E:\\outside\\Tencent Files')

  const result = resolveArchiveSourceRoots({
    home,
    environment: { CHATFILES_INCLUDE_LEGACY_CHAT_ROOTS: '1' },
    fileSystem,
  })

  assert.deepEqual(result.roots, [])
  assert.deepEqual(result.issues.map((issue) => issue.kind), ['outside-configured-root'])
})
