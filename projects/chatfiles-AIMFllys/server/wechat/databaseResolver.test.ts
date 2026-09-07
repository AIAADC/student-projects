import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'

import { resolveWechatDatabase } from './databaseResolver.js'

function availablePaths(...paths: string[]) {
  const available = new Set(paths.map((item) => path.resolve(item)))
  return (candidate: string) => available.has(path.resolve(candidate))
}

test('prefers the versioned current database and reports both candidates', () => {
  const projectRoot = path.resolve('C:/chatfiles')
  const currentPath = path.join(projectRoot, 'data', 'wechat.current', 'wechat.db')
  const legacyPath = path.join(projectRoot, 'data', 'wechat.db')

  const result = resolveWechatDatabase(projectRoot, availablePaths(currentPath, legacyPath))

  assert.deepEqual(result, {
    source: 'current',
    selectedPath: currentPath,
    currentPath,
    legacyPath,
    currentAvailable: true,
    legacyAvailable: true,
  })
})

test('falls back to the legacy database when the current database is absent', () => {
  const projectRoot = path.resolve('C:/chatfiles')
  const legacyPath = path.join(projectRoot, 'data', 'wechat.db')

  const result = resolveWechatDatabase(projectRoot, availablePaths(legacyPath))

  assert.equal(result.source, 'legacy')
  assert.equal(result.selectedPath, legacyPath)
  assert.equal(result.currentAvailable, false)
  assert.equal(result.legacyAvailable, true)
})

test('reports a missing selection without inventing a database path', () => {
  const projectRoot = path.resolve('C:/chatfiles')

  const result = resolveWechatDatabase(projectRoot, () => false)

  assert.equal(result.source, 'missing')
  assert.equal(result.selectedPath, null)
  assert.equal(result.currentAvailable, false)
  assert.equal(result.legacyAvailable, false)
})
