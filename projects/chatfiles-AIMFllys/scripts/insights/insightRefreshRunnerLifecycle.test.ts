import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

import {
  activateInsightRefresh,
  auditInsightRefresh,
  distillInsightRefresh,
  prepareInsightRefresh,
  rebuildInsightBoards,
} from './insightRefreshRunner.js'
import { fixture, readJson } from './insightRefreshRunnerTestFixture.js'

test('refuses a symlinked insight source', (t) => {
  const owned = fixture(t)
  const linkedSource = path.join(owned.root, 'data', 'insights.previous.link')
  try {
    fs.symlinkSync(owned.source, linkedSource, process.platform === 'win32' ? 'junction' : 'dir')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EPERM') {
      t.skip('Directory links are not available in this environment')
      return
    }
    throw error
  }
  assert.throws(
    () => prepareInsightRefresh({
      root: owned.root, runId: 'symlink', aliasMapPath: owned.aliasMapPath, sourceDir: linkedSource,
    }),
    /symlink/u,
  )
})

test('journals activation and restores current when next publication fails', (t) => {
  const owned = fixture(t)
  prepareInsightRefresh({ root: owned.root, runId: 'rollback', aliasMapPath: owned.aliasMapPath })
  distillInsightRefresh({ root: owned.root, runId: 'rollback' })
  rebuildInsightBoards({ root: owned.root, runId: 'rollback' })
  const nextDir = path.join(owned.root, 'data', 'insights.next')
  assert.throws(
    () => activateInsightRefresh({
      root: owned.root,
      runId: 'rollback',
      activationRename(source, target) {
        if (source === nextDir) throw new Error('injected publication failure')
        fs.renameSync(source, target)
      },
    }),
    /restored/u,
  )
  assert.equal(fs.existsSync(path.join(owned.root, 'data', 'insights')), true)
  assert.equal(fs.existsSync(path.join(owned.root, 'data', 'insights.previous.rollback')), false)
  assert.equal(
    readJson(path.join(owned.root, 'data', '.insights-activation.rollback.json')).status,
    'rolled_back',
  )
})

test('audits an insight candidate against an immutable sealed WeChat database', (t) => {
  const owned = fixture(t)
  prepareInsightRefresh({ root: owned.root,runId: 'sealed',aliasMapPath: owned.aliasMapPath })
  distillInsightRefresh({ root: owned.root,runId: 'sealed' })
  rebuildInsightBoards({ root: owned.root,runId: 'sealed' })
  const sealedRoot = path.join(owned.root, 'data', 'products', 'wechat', 'a'.repeat(64))
  fs.mkdirSync(sealedRoot, { recursive: true })
  const databasePath = path.join(sealedRoot, 'wechat.db')
  fs.copyFileSync(owned.dbPath, databasePath)
  const audit = auditInsightRefresh({
    root: owned.root,bundleDir: path.join(owned.root, 'data', 'insights.next'),databasePath,
  })
  assert.equal(audit.ok, true)
})
