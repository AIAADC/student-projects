import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { archiveDay } from '../../shared/time/archiveTime.js'
import {
  formatInsightDigest,
  insightNuggetEvidenceKey,
  planInsightDelta,
  reconcileLegacyInsights,
  type InsightMessage,
  type InsightState,
} from './insightRefresh.js'
import {
  assertDataRoles,
  assertRunId,
  databaseFingerprint,
  loadOwnerAliases,
  readJson,
  resolvePaths,
  safeInsightId,
  sha256File,
  sha256Text,
  writeJson,
  type RefreshOptions,
} from './insightRefreshContext.js'
import {
  copyBoards,
  bindInsightStateSequences,
  currentConversations,
  insightArchiveTimeZone,
  insightFilename,
  loadInsightConversations,
  queryMessages,
} from './insightRefreshData.js'

export function prepareInsightRefresh(options: RefreshOptions) {
  assertRunId(options.runId)
  const paths = resolvePaths(options)
  assertDataRoles(paths, 'prepare')
  if (fs.existsSync(paths.bundleDir)) throw new Error(`Insight bundle already exists: ${paths.bundleDir}`)
  const stagingDir = path.join(
    path.dirname(paths.bundleDir),
    `.${path.basename(paths.bundleDir)}.${options.runId}.${process.pid}.staging`,
  )
  if (fs.existsSync(stagingDir)) throw new Error(`Insight staging directory already exists: ${stagingDir}`)

  const statePath = path.join(paths.sourceDir, '_state.json')
  const manifestPath = path.join(paths.sourceDir, '_manifest.json')
  const legacy = loadInsightConversations(path.join(paths.sourceDir, 'conv'))
  const states = readJson<InsightState[]>(statePath)
  const previousManifest = readJson<unknown>(manifestPath)
  const database = databaseFingerprint(paths.databasePath)
  const db = new DatabaseSync(paths.databasePath, { readOnly: true })
  try {
    const current = currentConversations(db)
    const timeZone = insightArchiveTimeZone(db)
    const canonicalOwners = new Set(current.map((conversation) => conversation.id.split(':')[1]!))
    const ownerAliases = loadOwnerAliases(options, paths.root, canonicalOwners)
    const reconciled = reconcileLegacyInsights({
      current,
      legacy,
      states,
      ownerAliases: ownerAliases.aliases,
    })
    if (reconciled.metrics.legacyConversationKeys !== reconciled.metrics.canonicalConversations) {
      throw new Error('One or more legacy insight conversations do not map uniquely to the current database')
    }
    const canonicalStates = bindInsightStateSequences(db, reconciled.states)
    const planned = planInsightDelta(current, canonicalStates, options.minimumGrowth ?? 8)
    const deltaInputs = new Map<string, { messages: InsightMessage[]; content: string }>()
    let queriedRows = 0
    for (const entry of planned.entries) {
      const messages = queryMessages(db, entry)
      const expectedGrowth = entry.conversation.textCount - entry.previousTextCount
      if (messages.length !== expectedGrowth) {
        throw new Error(
          `Conversation text growth does not close against queried rows: ${entry.conversation.id} `
          + `(growth=${expectedGrowth}, rows=${messages.length})`,
        )
      }
      queriedRows += messages.length
      deltaInputs.set(entry.conversation.id, {
        messages,
        content: formatInsightDigest(entry.conversation, entry.kind, messages, 52_000, timeZone),
      })
    }
    const filenames = new Set<string>()
    for (const conversation of current) {
      const filename = insightFilename(conversation.id)
      if (filenames.has(filename)) throw new Error(`Insight filename collision: ${filename}`)
      filenames.add(filename)
    }

    fs.mkdirSync(stagingDir, { recursive: false })
    fs.mkdirSync(path.join(stagingDir, 'conv'))
    fs.mkdirSync(path.join(stagingDir, 'digests'))
    const boards = copyBoards(paths.sourceDir, path.join(stagingDir, 'boards'))
    for (const conversation of reconciled.conversations) {
      writeJson(path.join(stagingDir, 'conv', insightFilename(conversation.convId)), conversation, true)
    }

    const manifest = current.map((conversation) => {
      const entry = planned.entries.find((candidate) => candidate.conversation.id === conversation.id)
      let chars = 0
      const digest = entry ? `digests/${safeInsightId(conversation.id)}.txt` : ''
      if (entry) {
        const content = deltaInputs.get(conversation.id)!.content
        chars = Array.from(content).length
        fs.writeFileSync(path.join(stagingDir, digest), content, { encoding: 'utf8', flag: 'wx' })
      }
      return {
        convId: conversation.id,
        name: conversation.display,
        isGroup: conversation.isGroup,
        textCount: conversation.textCount,
        chars,
        sampled: chars >= 52_000,
        digest,
        first: archiveDay(conversation.firstTime, timeZone),
        last: archiveDay(conversation.lastTime, timeZone),
      }
    })
    writeJson(path.join(stagingDir, '_manifest.prev.json'), previousManifest, true)
    writeJson(path.join(stagingDir, '_manifest.json'), manifest, true)
    writeJson(path.join(stagingDir, '_state.json'), canonicalStates, true)
    writeJson(path.join(stagingDir, '_delta.json'), planned.entries, true)
    writeJson(path.join(stagingDir, 'receipt.json'), {
      version: 1,
      runId: options.runId,
      status: 'prepared',
      preparedAt: new Date().toISOString(),
      source: {
        directory: path.relative(paths.root, paths.sourceDir).replaceAll('\\', '/'),
        conversations: legacy.length,
        states: states.length,
        manifestSha256: sha256File(manifestPath),
        stateSha256: sha256File(statePath),
      },
      database,
      ownerAliases: ownerAliases.evidence,
      baselineEvidence: reconciled.conversations.map((conversation) => ({
        convId: conversation.convId,
        nuggetHashes: conversation.nuggets.map((nugget) => sha256Text(insightNuggetEvidenceKey(nugget))),
        summaryHashes: (conversation.legacySummaries ?? []).map((entry) =>
          sha256Text(`${entry.convId}\n${entry.summary}`),
        ),
      })),
      deltaEvidence: {
        conversations: planned.entries.length,
        queriedRows,
        textGrowth: planned.entries.reduce(
          (sum, entry) => sum + entry.conversation.textCount - entry.previousTextCount,
          0,
        ),
      },
      metrics: {
        ...reconciled.metrics,
        currentConversations: current.length,
        boards,
        delta: planned.metrics,
      },
    }, true)
    fs.renameSync(stagingDir, paths.bundleDir)
    return {
      bundleDir: paths.bundleDir,
      metrics: reconciled.metrics,
      delta: planned.metrics,
    }
  } finally {
    db.close()
  }
}
