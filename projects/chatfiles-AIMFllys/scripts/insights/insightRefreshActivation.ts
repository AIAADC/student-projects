import fs from 'node:fs'
import path from 'node:path'
import { auditInsightRefresh } from './insightRefreshAudit.js'
import {
  assertDataRoles,
  assertRunId,
  readJson,
  resolvePaths,
  writeJson,
  type RefreshOptions,
} from './insightRefreshContext.js'

export function activateInsightRefresh(options: RefreshOptions) {
  assertRunId(options.runId)
  const paths = resolvePaths(options)
  assertDataRoles(paths, 'candidate')
  const currentDir = path.resolve(paths.root, 'data', 'insights')
  const previousDir = path.resolve(paths.root, 'data', `insights.previous.${options.runId}`)
  const journalPath = path.resolve(paths.root, 'data', `.insights-activation.${options.runId}.json`)
  const rename = options.activationRename ?? fs.renameSync
  if (fs.existsSync(journalPath)) {
    const previousJournal = readJson<{ status?: string }>(journalPath)
    if (
      previousJournal.status === 'current_moved'
      && !fs.existsSync(currentDir)
      && fs.existsSync(previousDir)
    ) {
      rename(previousDir, currentDir)
      writeJson(journalPath, {
        version: 1,
        runId: options.runId,
        status: 'recovered',
        recoveredAt: new Date().toISOString(),
      })
    }
  }
  if (!fs.existsSync(currentDir)) throw new Error('Current insight directory is missing')
  if (!fs.existsSync(paths.bundleDir)) throw new Error('Next insight directory is missing')
  if (fs.existsSync(previousDir)) throw new Error(`Previous insight directory already exists: ${previousDir}`)
  const audit = auditInsightRefresh({
    root: paths.root,
    bundleDir: paths.bundleDir,
    databasePath: paths.databasePath,
  })
  if (!audit.ok) throw new Error(`Insight bundle audit failed: ${audit.issues.join('; ')}`)

  writeJson(journalPath, {
    version: 1,
    runId: options.runId,
    status: 'validated',
    validatedAt: new Date().toISOString(),
    current: 'data/insights',
    next: 'data/insights.next',
    previous: `data/insights.previous.${options.runId}`,
    audit: audit.metrics,
  })
  rename(currentDir, previousDir)
  writeJson(journalPath, {
    version: 1,
    runId: options.runId,
    status: 'current_moved',
    movedAt: new Date().toISOString(),
  })
  try {
    rename(paths.bundleDir, currentDir)
  } catch (error) {
    let rollbackError: unknown
    try {
      rename(previousDir, currentDir)
    } catch (cause) {
      rollbackError = cause
    }
    if (rollbackError) {
      writeJson(journalPath, {
        version: 1,
        runId: options.runId,
        status: 'rollback_failed',
        failedAt: new Date().toISOString(),
        failure: 'current_restore_failed',
      })
      throw new Error('Insight activation and rollback both failed; recovery journal was retained', {
        cause: error,
      })
    }
    writeJson(journalPath, {
      version: 1,
      runId: options.runId,
      status: 'rolled_back',
      rolledBackAt: new Date().toISOString(),
      failure: 'candidate_publication_failed',
    })
    throw new Error('Insight activation failed and the current directory was restored', { cause: error })
  }
  writeJson(journalPath, {
    version: 1,
    runId: options.runId,
    status: 'activated',
    activatedAt: new Date().toISOString(),
    previous: `data/insights.previous.${options.runId}`,
    audit: audit.metrics,
  })
  return { currentDir, previousDir, journalPath, audit }
}
