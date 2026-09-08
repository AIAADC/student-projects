import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import {
  closeSnapshotSources,
  openSnapshotSources,
} from '../../pipeline/wechat/sourceDatabaseAdapter.js'
import { readSourceMessages } from '../../pipeline/wechat/sourceReader.js'
import { createMessageCoverageKey, type AccountSnapshot } from './messageModel.js'
import { contactDisplayName, decodeContent, strictUtf8 } from './messageParsing.js'
import type { Contact, Session, SnapshotDescriptor } from './parserTypes.js'

export function compareText(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0
}

export function md5(value: string) {
  return crypto.createHash('md5').update(value, 'utf8').digest('hex')
}

export function sha256(value: string) {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex')
}

function rawBytes(value: unknown): Buffer {
  if (value == null) return Buffer.alloc(0)
  if (typeof value === 'string') return Buffer.from(value, 'utf8')
  if (value instanceof Uint8Array) return Buffer.from(value)
  return Buffer.from(String(value), 'utf8')
}

function rawContentHash(messageContent: unknown, compressedContent: unknown) {
  const messageBytes = rawBytes(messageContent)
  const useCompressed = messageBytes.length === 0 && compressedContent != null
  const bytes = useCompressed ? rawBytes(compressedContent) : messageBytes
  const source = useCompressed ? 'compress_content' : 'message_content'
  return crypto.createHash('sha256').update(source, 'utf8').update('\u0000').update(bytes).digest('hex')
}

function parseEnvValue(raw: string) {
  const value = raw.trim()
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1)
  }
  return value.replace(/\s+#.*$/, '').trim()
}

export function readOwnerFragment(root: string) {
  const envPath = path.join(root, '.env.local')
  if (!fs.existsSync(envPath)) throw new Error(`Owner configuration not found: ${envPath}`)
  const envText = strictUtf8(fs.readFileSync(envPath), envPath)
  const line = envText.split(/\r?\n/).find((item) => /^\s*VITE_OWNER_WXID\s*=/.test(item))
  if (!line) throw new Error('VITE_OWNER_WXID is required in .env.local')
  const fragment = parseEnvValue(line.slice(line.indexOf('=') + 1))
  if (!fragment) throw new Error('VITE_OWNER_WXID must contain a non-empty owner id fragment')
  return fragment
}

function readContacts(snapshotDir: string) {
  const contactPath = path.join(snapshotDir, 'db_storage', 'contact', 'contact.db')
  if (!fs.existsSync(contactPath)) throw new Error(`Contact database not found: ${contactPath}`)
  const db = new DatabaseSync(contactPath, { readOnly: true })
  try {
    const map = new Map<string, Contact>()
    const rows = db.prepare('SELECT username, nick_name, remark, alias FROM contact').all() as Array<Record<string, unknown>>
    for (const row of rows) {
      const username = String(row.username ?? '').trim()
      if (!username) continue
      const nick = String(row.nick_name ?? '').trim()
      const remark = String(row.remark ?? '').trim()
      const alias = String(row.alias ?? '').trim()
      map.set(username, {
        username,
        display: contactDisplayName(username, nick, remark, alias),
        nick,
        remark,
        alias,
        isGroup: username.endsWith('@chatroom'),
      })
    }
    try {
      const rooms = db.prepare('SELECT username FROM chat_room').all() as Array<{ username: string }>
      for (const row of rooms) {
        const username = String(row.username ?? '').trim()
        if (username && !map.has(username)) {
          map.set(username, {
            username,
            display: username,
            nick: '',
            remark: '',
            alias: '',
            isGroup: true,
          })
        }
      }
    } catch {
      // Some WeChat snapshots do not have chat_room.
    }
    return map
  } finally {
    db.close()
  }
}

function resolveOwner(contactMap: ReadonlyMap<string, Contact>, fragment: string, snapshotName: string) {
  const matches = [...contactMap.keys()].filter(
    (username) => !username.endsWith('@chatroom') && username.includes(fragment),
  )
  if (matches.length !== 1) {
    throw new Error(
      `Snapshot ${snapshotName} must resolve exactly one canonical owner from VITE_OWNER_WXID; found ${matches.length}`,
    )
  }
  return matches[0]
}

function readSessions(snapshotDir: string) {
  const sessionPath = path.join(snapshotDir, 'db_storage', 'session', 'session.db')
  const map = new Map<string, Session>()
  if (!fs.existsSync(sessionPath)) return map
  const db = new DatabaseSync(sessionPath, { readOnly: true })
  try {
    try {
      const rows = db.prepare('SELECT username, summary, last_timestamp FROM SessionTable').all() as Array<Record<string, unknown>>
      for (const row of rows) {
        const username = String(row.username ?? '').trim()
        if (!username) continue
        map.set(username, {
          summary: decodeContent(row.summary, `${sessionPath}:SessionTable:${username}`),
          lastTime: Number(row.last_timestamp ?? 0),
        })
      }
    } catch (error) {
      if (error instanceof Error && /no such table/i.test(error.message)) return map
      throw error
    }
    return map
  } finally {
    db.close()
  }
}

export function hasServerId(serverId: string) {
  const value = serverId.trim()
  return value !== '' && value !== '0'
}

function loadSnapshot(snapshotDir: string, snapshotName: string, ownerFragment: string): SnapshotDescriptor {
  const contactMap = readContacts(snapshotDir)
  const owner = resolveOwner(contactMap, ownerFragment, snapshotName)
  const sessionMap = readSessions(snapshotDir)
  const opened = openSnapshotSources(snapshotDir)
  const sources = opened.messageSources
  if (sources.length === 0) throw new Error(`No supported message shards found in snapshot ${snapshotName}`)
  const usernames = [...new Set([
    ...contactMap.keys(),
    ...sessionMap.keys(),
    ...sources.flatMap((source) => [...source.conversationUsernames]),
  ])].sort(compareText)
  try {
    const conversations: Array<AccountSnapshot['conversations'][number]> = []
    let sourceMessageCount = 0
    for (const username of usernames) {
      const table = `Msg_${md5(username)}`
      const messageKeys = new Set<string>()
      let firstMessageTime = Number.POSITIVE_INFINITY
      for (const source of sources) {
        if (!source.tables.has(table)) continue
        for (const message of readSourceMessages(source.db, table, source.tables)) {
          sourceMessageCount++
          messageKeys.add(createMessageCoverageKey({
            sourceDb: source.filename,
            sourceTable: table,
            localId: message.localId,
            serverId: message.serverId,
            rawType: message.rawType,
            time: message.createTime,
            realSender: source.idToName.get(message.realSenderId) ?? '',
            contentHash: rawContentHash(message.messageContent, message.compressedContent),
          }))
          firstMessageTime = Math.min(firstMessageTime, message.createTime)
        }
      }
      if (messageKeys.size > 0) {
        conversations.push({
          conversationId: username,
          firstMessageTime,
          messageKeys: [...messageKeys].sort(compareText),
        })
      }
    }
    const updatedAt = Math.max(
      ...sources.map((source) => fs.statSync(path.join(snapshotDir, 'db_storage', 'message', source.filename)).mtimeMs),
    )
    return {
      dir: snapshotDir,
      name: snapshotName,
      owner,
      contactMap,
      sessionMap,
      sourceCount: new Set(opened.inventory.map((unit) => unit.sourceDb)).size,
      sourceMessageCount,
      sourceInventory: opened.inventory,
      selection: {
        snapshotId: snapshotName,
        ownerIdentity: owner,
        updatedAt,
        conversations,
      },
    }
  } finally {
    closeSnapshotSources(sources)
  }
}

export function discoverSnapshots(decryptRoot: string, ownerFragment: string) {
  if (!fs.existsSync(decryptRoot)) throw new Error(`Decrypted WeChat root not found: ${decryptRoot}`)
  const directories = fs.readdirSync(decryptRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(decryptRoot, entry.name, 'db_storage')))
    .sort((left, right) => compareText(left.name, right.name))
  if (directories.length === 0) throw new Error(`No decrypted account snapshots found under ${decryptRoot}`)
  return directories.map((entry) => loadSnapshot(path.join(decryptRoot, entry.name), entry.name, ownerFragment))
}
