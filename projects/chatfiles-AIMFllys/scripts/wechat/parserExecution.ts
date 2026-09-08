import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { resolveArchiveTimeZone } from '../../pipeline/wechat/archiveTime.js'
import { CANONICAL_SCHEMA_VERSION } from '../../pipeline/wechat/canonicalSchema.js'
import { createInventoryLedger } from '../../pipeline/wechat/inventoryAccounting.js'
import { canonicalPersonId } from '../../pipeline/wechat/personIdentity.js'
import {
  closeSnapshotSources,
  openSnapshotSources,
  type SourceInventoryUnit,
} from '../../pipeline/wechat/sourceDatabaseAdapter.js'
import { renderTranscript } from '../../pipeline/wechat/transcript.js'
import { chooseAccountSnapshots } from './messageModel.js'
import { truncateCodePoints } from './unicodeText.js'
import {
  compareText,
  discoverSnapshots,
  md5,
  readOwnerFragment,
} from './parserSnapshotDiscovery.js'
import {
  assertFreshOutputs,
  createSchema,
  parseConversationMessages,
  parserPaths,
  promoteArtifacts,
  safeFile,
  stagingPaths,
} from './parserMessageProcessing.js'
import type { Contact, ParserResult } from './parserTypes.js'

function displaySource(contact: Contact | undefined) {
  if (!contact) return 'source-identity'
  if (contact.remark.trim()) return 'contact-remark'
  if (contact.nick.trim()) return 'contact-nick'
  if (contact.alias.trim()) return 'contact-alias'
  return 'contact-username'
}

function insertPerson(
  statement: ReturnType<DatabaseSync['prepare']>,
  owner: string,
  username: string,
  display: string,
  source: string,
) {
  if (!username.trim()) return null
  const personId = canonicalPersonId(owner, username)
  statement.run(personId, owner, username, display || username, source, JSON.stringify({ source }))
  return personId
}

function writeInventory(
  statement: ReturnType<DatabaseSync['prepare']>,
  snapshot: string,
  units: readonly SourceInventoryUnit[],
) {
  for (const unit of units) {
    statement.run(
      snapshot,
      unit.domain,
      unit.sourceDb,
      unit.sourceTable,
      unit.discoveredRows,
      unit.parsedRows,
      unit.deduplicatedRows,
      unit.excludedRows,
      unit.exclusionReason,
    )
  }
}

export function runWeChatParser(root = path.resolve(process.cwd())): ParserResult {
  const paths = parserPaths(root)
  const staging = stagingPaths(paths)
  const timeZone = resolveArchiveTimeZone(process.env.CHATFILES_TIME_ZONE)
  assertFreshOutputs(paths)
  assertFreshOutputs(staging)
  const ownerFragment = readOwnerFragment(root)
  const discovered = discoverSnapshots(paths.decryptRoot, ownerFragment)
  const selection = chooseAccountSnapshots(discovered.map((snapshot) => snapshot.selection))
  if (selection.warnings.length > 0) {
    const detail = selection.warnings
      .map((warning) => `${warning.ownerIdentity || '<unknown>'}: ${warning.snapshotIds.join(', ')}`)
      .join('; ')
    throw new Error(`Ambiguous account snapshots; refusing to merge: ${detail}`)
  }

  const selectedIds = new Set(selection.selected.map((snapshot) => snapshot.snapshotId))
  const selected = discovered.filter((snapshot) => selectedIds.has(snapshot.name))
  fs.mkdirSync(path.dirname(staging.bundleDir), { recursive: true })
  fs.mkdirSync(staging.bundleDir)
  fs.mkdirSync(staging.transcriptDir)
  fs.closeSync(fs.openSync(staging.outDbPath, 'wx'))

  const out = new DatabaseSync(staging.outDbPath)
  const indexRows: Array<Record<string, unknown>> = []
  let totalMessages = 0
  let totalTextMessages = 0
  let processedSourceConversations = 0
  let processedSourceMessages = 0
  let deduplicatedMessages = 0
  let sourceUnitCount = 0
  let excludedSourceRows = 0
  const selectedSourceCount = selected.reduce((total, snapshot) => total + snapshot.sourceCount, 0)
  const expectedSourceConversations = selected.reduce(
    (total, snapshot) => total + snapshot.selection.conversations.length,
    0,
  )
  const expectedSourceMessages = selected.reduce((total, snapshot) => total + snapshot.sourceMessageCount, 0)
  try {
    createSchema(out)
    const addContact = out.prepare('INSERT INTO contacts VALUES (?,?,?,?,?,?,?,?)')
    const addPerson = out.prepare('INSERT OR IGNORE INTO people VALUES (?,?,?,?,?,?)')
    const addConversation = out.prepare('INSERT INTO conversations VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)')
    const addMessage = out.prepare(`INSERT INTO messages VALUES (
      ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?
    )`)
    const addInventory = out.prepare('INSERT INTO source_inventory VALUES (?,?,?,?,?,?,?,?,?)')

    for (const snapshot of selected) {
      const opened = openSnapshotSources(snapshot.dir)
      const sources = opened.messageSources
      const ledger = createInventoryLedger(snapshot.sourceInventory)
      let transactionOpen = false
      try {
        out.exec('BEGIN')
        transactionOpen = true
        for (const contact of snapshot.contactMap.values()) {
          addContact.run(
            snapshot.name, snapshot.owner, contact.username, contact.display,
            contact.nick, contact.remark, contact.alias, contact.isGroup ? 1 : 0,
          )
          insertPerson(addPerson, snapshot.owner, contact.username, contact.display, displaySource(contact))
        }

        const sourceUsernames = sources.flatMap((source) => [...source.conversationUsernames])
        const usernames = [...new Set([
          ...snapshot.contactMap.keys(), ...snapshot.sessionMap.keys(), ...sourceUsernames,
        ])].sort(compareText)
        for (const username of usernames) {
          const parsed = parseConversationMessages(snapshot, username, sources, timeZone)
          const { messages } = parsed
          if (messages.length === 0) continue
          ledger.recordParsed(messages)
          ledger.recordDeduplicated(parsed.deduplicatedMessages)
          processedSourceConversations++
          processedSourceMessages += parsed.sourceMessageCount
          deduplicatedMessages += parsed.deduplicatedMessages.length
          const contact = snapshot.contactMap.get(username)
          const isGroup = username.endsWith('@chatroom')
          const display = contact?.display || username
          const conversationId = `wx:${snapshot.owner}:${username}`
          const ownerPersonId = insertPerson(
            addPerson,
            snapshot.owner,
            snapshot.owner,
            snapshot.contactMap.get(snapshot.owner)?.display || snapshot.owner,
            displaySource(snapshot.contactMap.get(snapshot.owner)),
          )!
          const conversationPersonId = insertPerson(
            addPerson, snapshot.owner, username, display, displaySource(contact),
          )
          for (const message of messages) {
            if (message.sender) {
              insertPerson(
                addPerson,
                snapshot.owner,
                message.sender,
                message.senderName || message.sender,
                message.senderSource,
              )
            }
          }

          const textCount = messages.filter((message) => message.type === 1 && message.text).length
          const firstTime = messages[0]!.time
          const lastTime = messages.at(-1)!.time
          const summary = snapshot.sessionMap.get(username)?.summary ?? ''
          addConversation.run(
            conversationId, snapshot.name, snapshot.owner, ownerPersonId,
            isGroup ? null : conversationPersonId, username, display, isGroup ? 1 : 0,
            messages.length, textCount, firstTime, lastTime, summary,
          )
          messages.forEach((message, canonicalSeq) => {
            addMessage.run(
              conversationId, message.messageUid, canonicalSeq, canonicalSeq,
              message.time, 'second', message.archiveDay, message.sourceDomain,
              message.sourceSnapshot, message.sourceDb, message.sourceTable,
              message.localId, message.serverId, message.sortSeq, message.sortSeq,
              message.time, message.sender,
              message.sender ? canonicalPersonId(snapshot.owner, message.sender) : null,
              message.senderName, message.senderName, message.senderPrefix, message.isOwn,
              message.senderSource, message.senderAudit, BigInt(message.rawType), message.type,
              message.typeLabel, message.contentKind, message.structuredContentJson, message.text,
            )
          })

          indexRows.push({
            id: conversationId, account: snapshot.name, owner: snapshot.owner, username,
            display, isGroup, msgCount: messages.length, textCount, firstTime, lastTime,
            summary: truncateCodePoints(summary, 120),
          })
          totalMessages += messages.length
          totalTextMessages += textCount
          if (textCount > 0) {
            const transcriptName = `${safeFile(`${display}__${username}`)}__${md5(username).slice(0, 8)}.txt`
            fs.writeFileSync(path.join(staging.transcriptDir, transcriptName), renderTranscript({
              display, isGroup, messages, owner: snapshot.owner, textCount, timeZone, username,
            }), { encoding: 'utf8', flag: 'wx' })
          }
        }

        const inventory = ledger.finish()
        writeInventory(addInventory, snapshot.name, inventory)
        sourceUnitCount += inventory.length
        excludedSourceRows += inventory.reduce((total, unit) => total + unit.excludedRows, 0)
        out.exec('COMMIT')
        transactionOpen = false
      } catch (error) {
        if (transactionOpen) out.exec('ROLLBACK')
        throw error
      } finally {
        closeSnapshotSources(sources)
      }
    }

    if (indexRows.length === 0 || totalMessages === 0) throw new Error('Refusing to complete an empty WeChat parse')
    if (
      processedSourceConversations !== expectedSourceConversations
      || processedSourceMessages !== expectedSourceMessages
      || processedSourceMessages !== totalMessages + deduplicatedMessages
    ) {
      throw new Error(
        `Parse source/output counts do not close: source conversations ${processedSourceConversations}/${expectedSourceConversations}, source messages ${processedSourceMessages}/${expectedSourceMessages}, output ${totalMessages}, deduplicated ${deduplicatedMessages}`,
      )
    }
    out.prepare(`INSERT INTO parse_runs VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      paths.runId, 'complete', new Date().toISOString(), CANONICAL_SCHEMA_VERSION, timeZone,
      selected.length, selectedSourceCount, sourceUnitCount, processedSourceConversations,
      processedSourceMessages, excludedSourceRows, indexRows.length, totalMessages,
      totalTextMessages, deduplicatedMessages,
    )
    const addMetadata = out.prepare('INSERT INTO bundle_metadata VALUES (?,?)')
    addMetadata.run('run_id', paths.runId)
    addMetadata.run('schema_version', String(CANONICAL_SCHEMA_VERSION))
    addMetadata.run('time_zone', timeZone)
    out.exec('PRAGMA wal_checkpoint(TRUNCATE)')
  } finally {
    out.close()
  }

  indexRows.sort((left, right) => (
    Number(right.lastTime) - Number(left.lastTime) || compareText(String(left.id), String(right.id))
  ))
  const index = {
    generatedAt: new Date().toISOString(),
    runId: paths.runId,
    schemaVersion: CANONICAL_SCHEMA_VERSION,
    timeZone,
    selectedSnapshots: selected.map((snapshot) => ({ account: snapshot.name, owner: snapshot.owner })),
    excludedSnapshots: selection.excluded,
    sourceUnitCount,
    excludedSourceRows,
    totalConversations: indexRows.length,
    totalMessages,
    conversations: indexRows,
  }
  fs.writeFileSync(staging.indexPath, JSON.stringify(index, null, 2), { encoding: 'utf8', flag: 'wx' })
  promoteArtifacts(staging, paths)

  return {
    paths,
    conversations: indexRows.length,
    messages: totalMessages,
    selectedSnapshots: selected.map((snapshot) => snapshot.name),
    excludedSnapshots: selection.excluded.map((snapshot) => snapshot.snapshotId),
  }
}
