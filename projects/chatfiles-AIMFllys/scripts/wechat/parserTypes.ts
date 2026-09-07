import type {
  MessageDatabaseSource,
  SourceInventoryUnit,
} from '../../pipeline/wechat/sourceDatabaseAdapter.js'
import type { AccountSnapshot } from './messageModel.js'

export type Contact = {
  username: string
  display: string
  nick: string
  remark: string
  alias: string
  isGroup: boolean
}

export type Session = { summary: string; lastTime: number }

export type SnapshotDescriptor = {
  dir: string
  name: string
  owner: string
  contactMap: Map<string, Contact>
  sessionMap: Map<string, Session>
  selection: AccountSnapshot
  sourceCount: number
  sourceMessageCount: number
  sourceInventory: SourceInventoryUnit[]
}

export type MessageSource = MessageDatabaseSource

export type ParsedMessage = {
  messageUid: string
  sourceSnapshot: string
  sourceDb: string
  sourceDomain: 'biz' | 'regular'
  sourceTable: string
  localId: number
  serverId: string
  sortSeq: number
  time: number
  archiveDay: string
  sender: string
  senderName: string
  senderPrefix: string
  isOwn: number
  senderSource: string
  senderAudit: string
  rawType: string
  type: number
  typeLabel: string
  contentKind: string
  structuredContentJson: string
  text: string
}

export type ParserPaths = {
  root: string
  decryptRoot: string
  bundleDir: string
  outDbPath: string
  indexPath: string
  transcriptDir: string
  runId: string
}

export type ParserResult = {
  paths: ParserPaths
  conversations: number
  messages: number
  selectedSnapshots: string[]
  excludedSnapshots: string[]
}
