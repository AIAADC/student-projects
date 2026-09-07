import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { archiveDay } from '../../pipeline/wechat/archiveTime.js'
import { createCanonicalSchema } from '../../pipeline/wechat/canonicalSchema.js'
import { canonicalPersonId } from '../../pipeline/wechat/personIdentity.js'
export type SourceRow = {
  localId: number
  serverId: bigint
  rawType: bigint
  sortSeq: number
  realSenderId: number
  time: number
  content: string
}

export type OutputRow = {
  uid: string
  sourceDb: string
  sourceTable?: string
  localId: number
  serverId: bigint
  rawType: bigint
  sortSeq: number
  time: number
  sender: string
  senderName?: string
  senderPrefix?: string
  text?: string
}

const snapshot = 'snapshot-new'

export function messageTable(username: string) {
  return `Msg_${crypto.createHash('md5').update(username, 'utf8').digest('hex')}`
}

function createSourceContacts(root: string) {
  const contactDir = path.join(root, snapshot, 'db_storage', 'contact')
  fs.mkdirSync(contactDir, { recursive: true })
  const dbPath = path.join(contactDir, 'contact.db')
  const db = new DatabaseSync(dbPath)
  db.exec(`
    CREATE TABLE contact(username TEXT, nick_name TEXT, remark TEXT, alias TEXT);
    INSERT INTO contact VALUES ('wxid_owner', '机主', '', '');
    INSERT INTO contact VALUES ('wxid_peer', '陈同学', '', '');
    INSERT INTO contact VALUES ('wxid_alternate', '另一个联系人', '', '');
    INSERT INTO contact VALUES ('wxid_member', '群成员甲', '', '');
    INSERT INTO contact VALUES ('room@chatroom', '中文测试群', '', '');
  `)
  db.close()
  return dbPath
}

export function createSourceShard(
  root: string,
  filename: string,
  names: ReadonlyArray<readonly [number, string]>,
  rows: readonly SourceRow[],
  conversationUsername = 'wxid_peer',
) {
  const messageDir = path.join(root, snapshot, 'db_storage', 'message')
  fs.mkdirSync(messageDir, { recursive: true })
  const dbPath = path.join(messageDir, filename)
  const db = new DatabaseSync(dbPath)
  const table = messageTable(conversationUsername)
  db.exec(`
    CREATE TABLE Name2Id(user_name TEXT PRIMARY KEY, is_session INTEGER);
    CREATE TABLE ${table}(
      local_id INTEGER, server_id INTEGER, local_type INTEGER, sort_seq INTEGER,
      real_sender_id INTEGER, create_time INTEGER, message_content TEXT, compress_content BLOB
    );
  `)
  const insertName = db.prepare('INSERT INTO Name2Id(rowid, user_name, is_session) VALUES (?,?,0)')
  for (const [id, username] of names) insertName.run(id, username)
  const insertMessage = db.prepare(`INSERT INTO ${table} VALUES (?,?,?,?,?,?,?,NULL)`)
  for (const row of rows) {
    insertMessage.run(
      row.localId,
      row.serverId,
      row.rawType,
      row.sortSeq,
      row.realSenderId,
      row.time,
      row.content,
    )
  }
  db.close()
  return dbPath
}

export function createOutputDatabase(
  root: string,
  options: {
    owner?: string
    peer?: string
    display?: string
    id?: string
    isGroup?: boolean
    rows: readonly OutputRow[]
  },
) {
  const dbPath = path.join(root, 'wechat.db')
  const owner = options.owner ?? 'wxid_owner'
  const peer = options.peer ?? 'wxid_peer'
  const display = options.display ?? (peer === 'room@chatroom' ? '中文测试群' : peer === 'wxid_peer' ? '陈同学' : peer)
  const convId = options.id ?? `wx:${owner}:${peer}`
  const db = new DatabaseSync(dbPath)
  createCanonicalSchema(db)
  const addPerson = db.prepare('INSERT OR IGNORE INTO people VALUES (?,?,?,?,?,?)')
  const people = new Set([owner, peer, ...options.rows.map((row) => row.sender).filter(Boolean)])
  for (const username of people) {
    const personDisplay = username === owner
      ? '机主'
      : username === peer
        ? display
        : options.rows.find((row) => row.sender === username)?.senderName ?? username
    addPerson.run(canonicalPersonId(owner, username), owner, username, personDisplay, 'fixture', '{}')
  }
  db.prepare('INSERT INTO conversations VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)').run(
    convId,
    snapshot,
    owner,
    canonicalPersonId(owner, owner),
    options.isGroup ? null : canonicalPersonId(owner, peer),
    peer,
    display,
    options.isGroup ? 1 : 0,
    options.rows.length,
    options.rows.filter((row) => Number(BigInt.asUintN(32, row.rawType)) === 1).length,
    Math.min(...options.rows.map((row) => row.time)),
    Math.max(...options.rows.map((row) => row.time)),
    '',
  )
  const insert = db.prepare(`INSERT INTO messages VALUES (${Array.from({ length: 30 }, () => '?').join(',')})`)
  options.rows.forEach((row, index) => {
    const type = Number(BigInt.asUintN(32, row.rawType))
    const senderName = row.senderName ?? row.sender
    insert.run(
      convId,
      row.uid,
      index,
      index,
      row.time,
      'second',
      archiveDay(row.time, 'Asia/Shanghai'),
      'regular',
      snapshot,
      row.sourceDb,
      row.sourceTable ?? messageTable(peer),
      row.localId,
      row.serverId.toString(),
      row.sortSeq,
      row.sortSeq,
      row.time,
      row.sender,
      row.sender ? canonicalPersonId(owner, row.sender) : null,
      senderName,
      senderName,
      row.senderPrefix ?? '',
      row.sender === owner ? 1 : 0,
      'message-name2id',
      '',
      row.rawType,
      type,
      type === 1 ? 'text' : `type_${type}`,
      type === 1 ? 'text' : type === 49 ? 'app' : 'unknown',
      '{}',
      row.text ?? '中文正文',
    )
  })
  const textCount = options.rows.filter(
    (row) => Number(BigInt.asUintN(32, row.rawType)) === 1,
  ).length
  const inventoryGroups = new Map<string, number>()
  for (const row of options.rows) {
    const table = row.sourceTable ?? messageTable(peer)
    const key = `${row.sourceDb}\u0000${table}`
    inventoryGroups.set(key, (inventoryGroups.get(key) ?? 0) + 1)
  }
  const addInventory = db.prepare('INSERT INTO source_inventory VALUES (?,?,?,?,?,?,?,?,?)')
  for (const [key, count] of inventoryGroups) {
    const [sourceDb, sourceTable] = key.split('\u0000')
    addInventory.run(snapshot, 'regular', sourceDb, sourceTable, count, count, 0, 0, null)
  }
  db.prepare(`INSERT INTO parse_runs VALUES (${Array.from({ length: 15 }, () => '?').join(',')})`).run(
    'fixture-run',
    'complete',
    '2026-07-12T00:00:00.000Z',
    2,
    'Asia/Shanghai',
    1,
    new Set(options.rows.map((row) => row.sourceDb)).size,
    inventoryGroups.size,
    1,
    options.rows.length,
    0,
    1,
    options.rows.length,
    textCount,
    0,
  )
  const addMetadata = db.prepare('INSERT INTO bundle_metadata VALUES (?,?)')
  addMetadata.run('run_id', 'fixture-run')
  addMetadata.run('schema_version', '2')
  addMetadata.run('time_zone', 'Asia/Shanghai')
  db.exec('PRAGMA journal_mode=DELETE')
  db.close()
  return dbPath
}

export function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chatfiles-source-audit-'))
  const sourceRoot = path.join(dir, 'source')
  const contactPath = createSourceContacts(sourceRoot)
  const files = [contactPath]
  return {
    dir,
    sourceRoot,
    contactPath,
    track(file: string) {
      files.push(file)
      return file
    },
    cleanup() {
      for (const file of files.reverse()) {
        if (fs.existsSync(file)) fs.unlinkSync(file)
      }
      const messageDir = path.join(sourceRoot, snapshot, 'db_storage', 'message')
      const contactDir = path.join(sourceRoot, snapshot, 'db_storage', 'contact')
      const directories = [
        messageDir,
        contactDir,
        path.dirname(messageDir),
        path.dirname(path.dirname(messageDir)),
        path.join(sourceRoot, snapshot),
        sourceRoot,
        dir,
      ]
      for (const directory of directories) {
        if (fs.existsSync(directory)) fs.rmdirSync(directory)
      }
    },
  }
}
