/*
 * prepChatDigests.ts — build size-capped, information-dense digests of each
 * substantive conversation for the content-extraction workflow, plus a manifest.
 * Huge group chats are sampled (prioritising longer, more substantive messages)
 * so each digest stays within an agent-friendly size.
 */
import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import {
  DEFAULT_ARCHIVE_TIME_ZONE,
  archiveDay,
  formatArchiveTimestamp,
  resolveArchiveTimeZone,
} from '../shared/time/archiveTime.js'
import { resolveCurrentProductEntrypoint } from './data/catalogConsumer.js'

const root = path.resolve(process.cwd())
const databasePath = resolveCurrentProductEntrypoint(path.join(root, 'data'), 'wechat', 'database')
const db = new DatabaseSync(databasePath, { readOnly: true })
const digestDir = path.join(root, 'work', 'chat-digest')
const manifestPath = path.join(root, 'data', 'insights', '_manifest.json')
fs.mkdirSync(digestDir, { recursive: true })
fs.mkdirSync(path.dirname(manifestPath), { recursive: true })

const MIN_TEXT = 20
const CAP_CHARS = 48000

const messageColumns = new Set(
  (db.prepare('PRAGMA table_info(messages)').all() as Array<{ name: string }>).map((row) => row.name),
)
const canonical = messageColumns.has('canonical_seq') && messageColumns.has('occurred_at_epoch_s')
const parseRunColumns = new Set(
  (db.prepare('PRAGMA table_info(parse_runs)').all() as Array<{ name: string }>).map((row) => row.name),
)
const configuredTimeZone = parseRunColumns.has('time_zone')
  ? String((db.prepare('SELECT time_zone FROM parse_runs LIMIT 1').get() as { time_zone?: string } | undefined)?.time_zone ?? '')
  : undefined
const timeZone = resolveArchiveTimeZone(configuredTimeZone || DEFAULT_ARCHIVE_TIME_ZONE)

function safe(id: string) {
  return id.replace(/[<>:"/\\|?*@ -]/g, '_').slice(0, 90)
}

const convs = db
  .prepare(`SELECT id, display, is_group, msg_count, text_count, first_time, last_time FROM conversations WHERE text_count >= ? ORDER BY text_count DESC`)
  .all(MIN_TEXT) as Array<Record<string, unknown>>

type Manifest = Array<{ convId: string; name: string; isGroup: boolean; textCount: number; chars: number; sampled: boolean; digest: string; first: string; last: string }>
const manifest: Manifest = []

for (const c of convs) {
  const convId = String(c.id)
  const name = String(c.display)
  const isGroup = Number(c.is_group) === 1
  const rows = db
    .prepare(`SELECT ${canonical ? 'occurred_at_epoch_s AS time' : 'time'}, sender_name, text
      FROM messages WHERE conv_id=? AND type=1 AND length(text)>0
      ORDER BY ${canonical ? 'canonical_seq' : 'time,seq'}`)
    .all(convId) as Array<{ time: number; sender_name: string; text: string }>
  if (rows.length === 0) continue

  const fmt = (r: { time: number; sender_name: string; text: string }) => {
    const dt = formatArchiveTimestamp(Number(r.time), timeZone)
    const who = (r.sender_name || '某人').slice(0, 18)
    return `[${dt}] ${who}: ${r.text.replace(/\s+/g, ' ').trim()}`
  }

  let lines: string[]
  let sampled = false
  const fullChars = rows.reduce((s, r) => s + r.text.length, 0)
  if (fullChars <= CAP_CHARS) {
    lines = rows.map(fmt)
  } else {
    sampled = true
    // keep chronological spine (first 25% by time) + the most substantive messages
    const head = rows.slice(0, Math.min(rows.length, 120)).map(fmt)
    const bySubstance = [...rows]
      .map((r, i) => ({ r, i, score: r.text.length + (/[。．.!?！？]/.test(r.text) ? 10 : 0) }))
      .sort((a, b) => b.score - a.score)
    const picked: Array<{ i: number; line: string }> = []
    let chars = head.join('\n').length
    for (const item of bySubstance) {
      if (chars >= CAP_CHARS) break
      const line = fmt(item.r)
      picked.push({ i: item.i, line })
      chars += line.length + 1
    }
    picked.sort((a, b) => a.i - b.i)
    lines = [...head, '... [按信息量抽样的其余消息] ...', ...picked.map((p) => p.line)]
  }

  const firstS = archiveDay(Number(c.first_time), timeZone)
  const lastS = archiveDay(Number(c.last_time), timeZone)
  const header = `会话：${name}${isGroup ? '（群聊）' : '（私聊）'}\n消息数：${c.msg_count}（文本 ${c.text_count}）\n时间：${firstS} ~ ${lastS}${sampled ? '\n注意：本会话很大，已按信息量抽样' : ''}\n\n`
  const body = (header + lines.join('\n')).slice(0, CAP_CHARS + 4000)
  const digestPath = path.join(digestDir, `${safe(convId)}.txt`)
  fs.writeFileSync(digestPath, body, 'utf8')
  manifest.push({ convId, name, isGroup, textCount: Number(c.text_count), chars: body.length, sampled, digest: digestPath, first: firstS, last: lastS })
}

fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8')
db.close()
console.log(`prepared ${manifest.length} digests -> ${path.relative(root, digestDir)}`)
console.log(`manifest -> ${path.relative(root, manifestPath)}`)
console.log(`sampled (huge) conversations: ${manifest.filter((m) => m.sampled).length}`)
