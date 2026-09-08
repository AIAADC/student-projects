import { formatArchiveTimestamp } from './archiveTime.js'

export type TranscriptMessage = {
  sender: string
  senderName: string
  text: string
  time: number
}

export function renderTranscript(input: {
  display: string
  isGroup: boolean
  messages: readonly TranscriptMessage[]
  owner: string
  textCount: number
  timeZone: string
  username: string
}) {
  const lines = input.messages.filter((message) => message.text).map((message) => {
    const timestamp = formatArchiveTimestamp(message.time, input.timeZone)
    const who = message.senderName || message.sender || (input.isGroup ? '未知群成员' : '未知发送人')
    return `[${timestamp}] ${who}: ${message.text}`
  })
  const header = [
    `# ${input.display}${input.isGroup ? '（群聊）' : ''}`,
    `owner: ${input.owner}`,
    `username: ${input.username}`,
    `time-zone: ${input.timeZone}`,
    `messages: ${input.messages.length} (text ${input.textCount})`,
    '',
    '',
  ].join('\n')
  return header + lines.join('\n')
}
