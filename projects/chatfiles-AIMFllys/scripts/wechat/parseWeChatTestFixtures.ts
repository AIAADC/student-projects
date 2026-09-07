import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const parserPath = path.join(repoRoot, 'scripts', 'parseWeChat.ts')
const tsxCli = path.join(repoRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs')

export const owner = 'wxid_owner_fragment'
export const peer = 'wxid_peer'
export const room = 'fixture@chatroom'

export function md5(value: string) {
  return crypto.createHash('md5').update(value, 'utf8').digest('hex')
}

function createContactDatabase(snapshotDir: string, peerDisplay = '陈同学') {
  const targetDir = path.join(snapshotDir, 'db_storage', 'contact')
  fs.mkdirSync(targetDir, { recursive: true })
  const db = new DatabaseSync(path.join(targetDir, 'contact.db'))
  db.exec(`
    CREATE TABLE contact(username TEXT, nick_name TEXT, remark TEXT, alias TEXT, local_type INTEGER);
    INSERT INTO contact VALUES ('${owner}', '机主', '', '', 0);
    INSERT INTO contact VALUES ('${peer}', '${peerDisplay}', '', '', 0);
    INSERT INTO contact VALUES ('${room}', '中文项目群', '', '', 0);
    INSERT INTO contact VALUES ('wxid_member', '群成员甲', '', '', 0);
    CREATE TABLE chat_room(username TEXT);
    INSERT INTO chat_room VALUES ('${room}');
  `)
  db.close()
}

function createSessionDatabase(snapshotDir: string, peerSummary = '中文私聊摘要') {
  const targetDir = path.join(snapshotDir, 'db_storage', 'session')
  fs.mkdirSync(targetDir, { recursive: true })
  const db = new DatabaseSync(path.join(targetDir, 'session.db'))
  db.exec(`
    CREATE TABLE SessionTable(username TEXT, summary TEXT, last_timestamp INTEGER);
    INSERT INTO SessionTable VALUES ('${peer}', '${peerSummary}', 1700000000);
    INSERT INTO SessionTable VALUES ('${room}', '中文群聊摘要', 1700000001);
  `)
  db.close()
}

type FixtureMessage = {
  conversation: string
  localId: number
  serverId: string
  rawType: string
  sortSeq: number
  realSenderId: number
  time: number
  content: string
}

function createMessageDatabase(
  snapshotDir: string,
  filename: string,
  names: Array<[number, string]>,
  messages: FixtureMessage[],
) {
  const targetDir = path.join(snapshotDir, 'db_storage', 'message')
  fs.mkdirSync(targetDir, { recursive: true })
  const dbPath = path.join(targetDir, filename)
  const db = new DatabaseSync(dbPath)
  db.exec('CREATE TABLE Name2Id(user_name TEXT PRIMARY KEY, is_session INTEGER);')
  const insertName = db.prepare('INSERT INTO Name2Id(rowid, user_name, is_session) VALUES (?,?,0)')
  for (const [id, username] of names) insertName.run(id, username)

  for (const conversation of new Set(messages.map((message) => message.conversation))) {
    const table = `Msg_${md5(conversation)}`
    db.exec(`
      CREATE TABLE "${table}"(
        local_id INTEGER, server_id INTEGER, local_type INTEGER, sort_seq INTEGER,
        real_sender_id INTEGER, create_time INTEGER, message_content TEXT, compress_content BLOB
      );
    `)
    const insert = db.prepare(`INSERT INTO "${table}" VALUES (?,?,?,?,?,?,?,NULL)`)
    for (const message of messages.filter((item) => item.conversation === conversation)) {
      insert.run(
        message.localId,
        BigInt(message.serverId),
        BigInt(message.rawType),
        message.sortSeq,
        message.realSenderId,
        message.time,
        message.content,
      )
    }
  }
  db.close()
  return dbPath
}

function createMediaDatabase(snapshotDir: string) {
  const target = path.join(snapshotDir, 'db_storage', 'message', 'media_0.db')
  const db = new DatabaseSync(target)
  db.exec(`
    CREATE TABLE VoiceInfo(
      chat_name_id INTEGER, create_time INTEGER, local_id INTEGER,
      svr_id INTEGER, voice_data BLOB, data_index TEXT
    );
    INSERT INTO VoiceInfo VALUES (1,1700000000,2,1004,x'0102','0');
  `)
  db.close()
  return target
}

function createResourceDatabase(snapshotDir: string) {
  const target = path.join(snapshotDir, 'db_storage', 'message', 'message_resource.db')
  const db = new DatabaseSync(target)
  db.exec(`
    CREATE TABLE MessageResourceInfo(message_id INTEGER PRIMARY KEY, packed_info BLOB);
    CREATE TABLE MessageResourceDetail(resource_id INTEGER PRIMARY KEY, message_id INTEGER, packed_info BLOB);
    INSERT INTO MessageResourceInfo VALUES (1,x'01');
    INSERT INTO MessageResourceDetail VALUES (2,1,x'02');
  `)
  db.close()
  return target
}

export function createFixtureRoot(options: {
  conflictingDuplicate?: boolean
  conflictingEvidence?: boolean
  duplicateExactEvidence?: boolean
  repeatedFoldedEvidence?: boolean
  changedSharedMessage?: boolean
  boundaryUnicode?: boolean
} = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'chatfiles-parser-'))
  fs.writeFileSync(path.join(root, '.env.local'), 'VITE_OWNER_WXID=owner_fragment\n', 'utf8')
  const oldSnapshot = path.join(root, 'work', 'decrypted', 'wechat', 'snapshot-old')
  const newSnapshot = path.join(root, 'work', 'decrypted', 'wechat', 'snapshot-new')
  const boundaryEmoji = String.fromCodePoint(0x1f600)
  const peerDisplay = options.boundaryUnicode ? `${'陈'.repeat(79)}${boundaryEmoji}tail` : undefined
  const peerSummary = options.boundaryUnicode ? `${'摘'.repeat(119)}${boundaryEmoji}tail` : undefined
  for (const snapshot of [oldSnapshot, newSnapshot]) {
    createContactDatabase(snapshot, peerDisplay)
    createSessionDatabase(snapshot, peerSummary)
  }

  const oldDb = createMessageDatabase(oldSnapshot, 'message_0.db', [[7, owner]], [
    {
      conversation: peer, localId: 1, serverId: '1001', rawType: '9223372032559808513',
      sortSeq: 20, realSenderId: 7, time: 1700000000,
      content: options.changedSharedMessage ? '相同 server_id 但内容已变化' : '机主发出的中文',
    },
  ])
  const newDb0 = createMessageDatabase(newSnapshot, 'message_0.db', [[7, owner], [9, peer]], [
    {
      conversation: peer, localId: 1, serverId: '1001', rawType: '9223372032559808513',
      sortSeq: 20, realSenderId: 7, time: 1700000000, content: '机主发出的中文',
    },
    {
      conversation: peer, localId: 2, serverId: '0', rawType: '1', sortSeq: 30,
      realSenderId: 999, time: 1700000000, content: '身份未知但正文保留',
    },
    ...(options.duplicateExactEvidence ? [{
      conversation: peer, localId: 2, serverId: '0', rawType: '1', sortSeq: 30,
      realSenderId: 999, time: 1700000000, content: '身份未知但正文保留',
    }] : []),
    ...(options.conflictingEvidence ? [{
      conversation: peer, localId: 2, serverId: '0', rawType: '1', sortSeq: 35,
      realSenderId: 999, time: 1700000000, content: '相同 evidence key 的冲突正文',
    }] : []),
    {
      conversation: peer, localId: 3, serverId: '1002', rawType: '1', sortSeq: 40,
      realSenderId: 9, time: 1700000000,
      content: options.conflictingDuplicate ? '相同 server_id 的冲突正文' : '对端先发出的中文',
    },
    ...(options.repeatedFoldedEvidence ? [{
      conversation: peer, localId: 3, serverId: '1003', rawType: '1', sortSeq: 50,
      realSenderId: 9, time: 1700000000, content: '对端先发出的中文',
    }] : []),
  ])
  const newDb1 = createMessageDatabase(newSnapshot, 'message_1.db', [[7, peer], [8, 'wxid_member']], [
    {
      conversation: peer, localId: 5, serverId: '1002', rawType: '1', sortSeq: 10,
      realSenderId: 7, time: 1700000000, content: '对端先发出的中文',
    },
    {
      conversation: room, localId: 8, serverId: '2001', rawType: '1', sortSeq: 1,
      realSenderId: 8, time: 1700000001, content: 'wxid_member:\n群聊中文正文',
    },
  ])
  const newBizDb = createMessageDatabase(newSnapshot, 'biz_message_0.db', [[10, peer]], [
    {
      conversation: peer, localId: 7, serverId: '1004', rawType: '1', sortSeq: 15,
      realSenderId: 10, time: 1700000000, content: '企业消息进入统一顺序',
    },
  ])
  const mediaDb = createMediaDatabase(newSnapshot)
  const resourceDb = createResourceDatabase(newSnapshot)

  const oldTime = new Date('2025-01-01T00:00:00Z')
  const newTime = new Date('2026-01-01T00:00:00Z')
  fs.utimesSync(oldDb, oldTime, oldTime)
  fs.utimesSync(newDb0, newTime, newTime)
  fs.utimesSync(newDb1, newTime, newTime)
  fs.utimesSync(newBizDb, newTime, newTime)
  fs.utimesSync(mediaDb, newTime, newTime)
  fs.utimesSync(resourceDb, newTime, newTime)
  return root
}

export function runParser(root: string, timeZone?: string) {
  return spawnSync(process.execPath, [tsxCli, parserPath], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      CHATFILES_RUN_ID: 'fixture-run',
      ...(timeZone ? { CHATFILES_TIME_ZONE: timeZone } : {}),
    },
  })
}
