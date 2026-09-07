import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'
import {
  activateInsightRefresh,
  auditInsightRefresh,
  distillInsightRefresh,
  prepareInsightRefresh,
  rebuildInsightBoards,
} from './insightRefreshRunner.js'
import type { InsightConversation, InsightState } from './insightRefresh.js'
import { fixture, readJson, writeJson } from './insightRefreshRunnerTestFixture.js'

test('prepares, distills, audits, and activates a non-destructive canonical insight snapshot', (t) => {
  const owned = fixture(t)

  const prepared = prepareInsightRefresh({ root: owned.root, runId: 'fixture', aliasMapPath: owned.aliasMapPath })
  assert.equal(prepared.metrics.canonicalConversations, 1)
  assert.deepEqual(prepared.delta, { new: 1, grown: 1, accumulated: 0, unchanged: 0 })
  assert.equal(fs.readdirSync(path.join(owned.source, 'conv')).length, 2)
  assert.equal(fs.readdirSync(path.join(prepared.bundleDir, 'conv')).length, 1)
  assert.equal(fs.existsSync(path.join(prepared.bundleDir, 'boards', 'AI.md')), true)

  const distilled = distillInsightRefresh({ root: owned.root, runId: 'fixture' })
  assert.equal(distilled.processed, 2)
  assert.equal(fs.readdirSync(path.join(prepared.bundleDir, 'conv')).length, 2)
  assert.equal(fs.existsSync(path.join(owned.root, 'data', 'insights.prepared.fixture', 'receipt.json')), true)

  const staleBoardAudit = auditInsightRefresh({ root: owned.root, bundleDir: prepared.bundleDir })
  assert.equal(staleBoardAudit.ok, false)
  assert.match(staleBoardAudit.issues.join('\n'), /board/iu)

  const rebuilt = rebuildInsightBoards({ root: owned.root, runId: 'fixture' })
  assert.equal(rebuilt.boards, 3)
  assert.match(fs.readFileSync(path.join(prepared.bundleDir, 'boards', 'AI.md'), 'utf8'), /基于 2 条要点/u)
  assert.equal(
    fs.existsSync(path.join(prepared.bundleDir, 'boards.pre-refresh.fixture', 'AI.md')),
    true,
  )

  const canonicalConversationPath = path.join(prepared.bundleDir, 'conv', 'wx_canonical_room_chatroom.json')
  const validConversationText = fs.readFileSync(canonicalConversationPath, 'utf8')
  const missingBaselineConversation = JSON.parse(validConversationText) as InsightConversation
  missingBaselineConversation.nuggets.shift()
  writeJson(canonicalConversationPath, missingBaselineConversation)
  const missingBaselineAudit = auditInsightRefresh({ root: owned.root, bundleDir: prepared.bundleDir })
  assert.equal(missingBaselineAudit.ok, false)
  assert.match(missingBaselineAudit.issues.join('\n'), /baseline/iu)
  fs.writeFileSync(canonicalConversationPath, validConversationText, 'utf8')

  const statePath = path.join(prepared.bundleDir, '_state.json')
  const validStateText = fs.readFileSync(statePath, 'utf8')
  const invalidStates = JSON.parse(validStateText) as InsightState[]
  const cursorState = invalidStates.find((state) => state.analyzedLastMessageUid)
  assert.ok(cursorState)
  cursorState.analyzedLastMessageUid = 'missing-message-uid'
  writeJson(statePath, invalidStates)
  const invalidCursorAudit = auditInsightRefresh({ root: owned.root, bundleDir: prepared.bundleDir })
  assert.equal(invalidCursorAudit.ok, false)
  assert.match(invalidCursorAudit.issues.join('\n'), /cursor/iu)
  fs.writeFileSync(statePath, validStateText, 'utf8')

  const invalidSequenceStates = JSON.parse(validStateText) as InsightState[]
  const sequenceState = invalidSequenceStates.find((state) => state.analyzedLastMessageUid)
  assert.ok(sequenceState?.analyzedLastSequence !== undefined)
  sequenceState.analyzedLastSequence += 1
  writeJson(statePath, invalidSequenceStates)
  const invalidSequenceAudit = auditInsightRefresh({ root: owned.root, bundleDir: prepared.bundleDir })
  assert.equal(invalidSequenceAudit.ok, false)
  assert.match(invalidSequenceAudit.issues.join('\n'), /cursor/iu)
  fs.writeFileSync(statePath, validStateText, 'utf8')

  const receiptPath = path.join(prepared.bundleDir, 'receipt.json')
  const validReceiptText = fs.readFileSync(receiptPath, 'utf8')
  const invalidReceipt = JSON.parse(validReceiptText) as {
    distillation: { inputRows: number }
  }
  invalidReceipt.distillation.inputRows--
  writeJson(receiptPath, invalidReceipt)
  const invalidClosureAudit = auditInsightRefresh({ root: owned.root, bundleDir: prepared.bundleDir })
  assert.equal(invalidClosureAudit.ok, false)
  assert.match(invalidClosureAudit.issues.join('\n'), /closure/iu)
  fs.writeFileSync(receiptPath, validReceiptText, 'utf8')

  const audit = auditInsightRefresh({ root: owned.root, bundleDir: prepared.bundleDir })
  assert.equal(audit.ok, true)
  assert.deepEqual(audit.metrics, {
    currentConversations: 2,
    manifestConversations: 2,
    insightConversations: 2,
    stateConversations: 2,
    nuggets: 4,
    boards: 3,
  })

  const activated = activateInsightRefresh({ root: owned.root, runId: 'fixture' })
  assert.equal(activated.previousDir, path.join(owned.root, 'data', 'insights.previous.fixture'))
  assert.equal(fs.existsSync(activated.previousDir), true)
  assert.equal(fs.existsSync(path.join(owned.root, 'data', 'insights', 'conv')), true)
  assert.equal(fs.existsSync(path.join(owned.root, 'data', 'insights.next')), false)
  assert.equal(
    readJson(path.join(owned.root, 'data', '.insights-activation.fixture.json')).status,
    'activated',
  )
})

test('refuses to advance when queried text rows do not close against count growth', (t) => {
  const owned = fixture(t)
  const db = new DatabaseSync(owned.legacyDbPath)
  db.prepare('UPDATE conversations SET text_count = text_count + 1 WHERE id = ?').run('wx:canonical:room@chatroom')
  db.close()

  assert.throws(
    () => prepareInsightRefresh({
      root: owned.root,runId: 'closure',aliasMapPath: owned.aliasMapPath,
      databasePath: owned.legacyDbPath,
    }),
    /text growth does not close/u,
  )
  assert.equal(fs.existsSync(path.join(owned.root, 'data', 'insights.next')), false)
})

test('binds distillation to the exact database fingerprint captured during prepare', (t) => {
  const owned = fixture(t)
  prepareInsightRefresh({
    root: owned.root,runId: 'fingerprint',aliasMapPath: owned.aliasMapPath,
    databasePath: owned.legacyDbPath,
  })
  const db = new DatabaseSync(owned.legacyDbPath)
  db.prepare('UPDATE conversations SET display = ? WHERE id = ?').run('被替换的数据库', 'wx:canonical:room@chatroom')
  db.close()

  assert.throws(
    () => distillInsightRefresh({
      root: owned.root,runId: 'fingerprint',databasePath: owned.legacyDbPath,
    }),
    /database fingerprint/u,
  )
})

test('refuses bundle paths outside the data root', (t) => {
  const owned = fixture(t)
  assert.throws(
    () => prepareInsightRefresh({
      root: owned.root,
      runId: 'escape',
      aliasMapPath: owned.aliasMapPath,
      bundleDir: path.join(os.tmpdir(), 'outside-insights.next'),
    }),
    /inside the data root/u,
  )
})
