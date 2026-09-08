import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import type { ChatExportMessage } from '../../shared/contracts/index.js'
import { candidateName, signalRules } from './constants.js'

export type ParsedMessage = Omit<ChatExportMessage, 'id' | 'sourcePath' | 'conversation' | 'signals'>

export function normalizeTime(raw?: string) {
  if (!raw) return undefined
  const value = raw
    .replace(/[年月]/g, '-')
    .replace(/日/g, '')
    .replace(/\//g, '-')
    .replace('T', ' ')
    .replace(/：/g, ':')
    .trim()
  const match = value.match(/(\d{4})-(\d{1,2})-(\d{1,2})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/)
  if (!match) return value
  const [, year, month, day, hour, minute, second = '00'] = match
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')} ${hour.padStart(2, '0')}:${minute}:${second}`
}

export function cleanText(value: string) {
  return value
    .split('\u0000')
    .join('')
    .replace(/\s+/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&')
    .trim()
}

function stripHtml(value: string) {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
}

export function signalsFor(content: string) {
  const signals = signalRules.filter(([, pattern]) => pattern.test(content)).map(([label]) => label)
  return signals.length ? signals : ['一般内容']
}

function isUsefulContent(content: string) {
  const text = cleanText(content)
  if (text.length < 2) return false
  if (/^(图片|语音|表情|视频|文件|撤回了一条消息|\[图片]|\[表情]|\[语音]|\[视频])$/i.test(text)) return false
  return true
}

export function hashId(value: string) {
  return crypto.createHash('sha1').update(value).digest('hex').slice(0, 16)
}

function pushMessage(messages: ParsedMessage[], timestamp: string | undefined, sender: string, content: string) {
  const cleanSender = cleanText(sender).replace(/[：:]+$/, '').slice(0, 80)
  const cleanContent = cleanText(content)
  if (/^(date|author|subject|refs|body|commit|merged|files?|index)$/i.test(cleanSender)) return
  if (!cleanSender || !isUsefulContent(cleanContent)) return
  messages.push({
    sender: cleanSender,
    timestamp: normalizeTime(timestamp),
    content: cleanContent.slice(0, 4000),
  })
}

function parseLooseText(raw: string, ext: string) {
  const text = ext.match(/html?$/i) ? stripHtml(raw) : raw
  const messages: ParsedMessage[] = []
  const lines = text.split(/\r?\n/)
  let last: ParsedMessage | undefined
  const patterns: Array<{
    pattern: RegExp
    read: (match: RegExpMatchArray) => { time?: string; sender: string; content: string }
  }> = [
    {
      pattern: /^\s*\[?(\d{4}[-/.年]\d{1,2}[-/.月]\d{1,2}(?:日)?\s+\d{1,2}[:：]\d{2}(?::\d{2})?)\]?\s+(.{1,60}?)[：:]\s*(.+)$/,
      read: (match) => ({ time: match[1], sender: match[2], content: match[3] }),
    },
    {
      pattern: /^\s*(\d{4}[-/.年]\d{1,2}[-/.月]\d{1,2}(?:日)?)\s+(\d{1,2}[:：]\d{2}(?::\d{2})?)\s+(.{1,60}?)[：:]\s*(.+)$/,
      read: (match) => ({ time: `${match[1]} ${match[2]}`, sender: match[3], content: match[4] }),
    },
    {
      pattern: /^\s*(.{1,60}?)\s+(\d{4}[-/.年]\d{1,2}[-/.月]\d{1,2}(?:日)?\s+\d{1,2}[:：]\d{2}(?::\d{2})?)\s*[：:]\s*(.+)$/,
      read: (match) => ({ time: match[2], sender: match[1], content: match[3] }),
    },
  ]

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const matched = patterns.map((item) => ({ item, match: trimmed.match(item.pattern) })).find((item) => item.match)
    if (matched?.match) {
      const message = matched.item.read(matched.match)
      pushMessage(messages, message.time, message.sender, message.content)
      last = messages.at(-1)
      continue
    }
    if (last && trimmed.length > 0 && !/^\d{4}[-/.年]/.test(trimmed)) {
      last.content = cleanText(`${last.content}\n${trimmed}`).slice(0, 4000)
    }
  }
  return messages
}

function parseCsv(raw: string) {
  const lines = raw.split(/\r?\n/).filter(Boolean)
  if (lines.length < 2) return []
  const delimiter = lines[0].includes('\t') ? '\t' : ','
  const headers = lines[0].split(delimiter).map((item) => cleanText(item).toLowerCase())
  const timeIndex = headers.findIndex((item) => /time|date|timestamp|时间|日期/.test(item))
  const senderIndex = headers.findIndex((item) => /sender|from|name|speaker|昵称|发送者|发言人|用户/.test(item))
  const contentIndex = headers.findIndex((item) => /content|text|message|msg|body|内容|消息|正文/.test(item))
  if (senderIndex < 0 || contentIndex < 0) return []
  const messages: ParsedMessage[] = []
  for (const line of lines.slice(1, 10000)) {
    const cells = line.split(delimiter)
    pushMessage(messages, timeIndex >= 0 ? cells[timeIndex] : undefined, cells[senderIndex] ?? '', cells[contentIndex] ?? '')
  }
  return messages
}

function stringField(item: Record<string, unknown>, names: string[]) {
  for (const name of names) {
    const value = item[name]
    if (typeof value === 'string' || typeof value === 'number') return String(value)
  }
  return undefined
}

function parseJson(raw: string) {
  const messages: ParsedMessage[] = []
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return messages
  }

  function visit(node: unknown, depth = 0) {
    if (depth > 8 || messages.length > 20000) return
    if (Array.isArray(node)) {
      for (const item of node) visit(item, depth + 1)
      return
    }
    if (!node || typeof node !== 'object') return
    const record = node as Record<string, unknown>
    const content = stringField(record, ['content', 'text', 'message', 'msg', 'body', 'html', '消息', '内容'])
    const sender = stringField(record, ['sender', 'from', 'name', 'speaker', 'nickName', 'nickname', 'user', '昵称', '发送者'])
    if (content && sender) {
      const timestamp = stringField(record, ['time', 'timestamp', 'date', 'createdAt', 'createTime', '时间', '日期'])
      pushMessage(messages, timestamp, sender, content)
    }
    for (const child of Object.values(record)) {
      if (typeof child === 'object') visit(child, depth + 1)
    }
  }

  visit(value)
  return messages
}

export function parseFile(filePath: string) {
  const ext = path.extname(filePath).toLowerCase()
  const raw = fs.readFileSync(filePath, 'utf8')
  if (ext === '.json') return parseJson(raw)
  if (ext === '.csv') return parseCsv(raw)
  return parseLooseText(raw, ext)
}

export function conversationTitle(filePath: string, messages: ParsedMessage[]) {
  const stem = path.basename(filePath, path.extname(filePath)).replace(/[_-]+/g, ' ').trim()
  const participants = [...new Set(messages.map((item) => item.sender))].slice(0, 3)
  if (candidateName.test(stem)) return participants.length ? participants.join(' / ') : stem
  return stem || participants.join(' / ') || '未命名聊天'
}

export function acceptReason(filePath: string, messages: ParsedMessage[]) {
  const strongName = candidateName.test(filePath)
  const signalMessages = messages.filter((item) => signalsFor(item.content).some((signal) => signal !== '一般内容')).length
  if (messages.length >= 20 && strongName) return '文件名含聊天线索且解析出 20 条以上消息'
  if (messages.length >= 8 && signalMessages >= 2) return '解析出多条高价值信号消息'
  if (messages.length >= 50) return '解析出 50 条以上结构化消息'
  return ''
}
