export type MessageContentKind = 'app' | 'media' | 'system' | 'text' | 'unknown'

export type ParsedMessageContent = {
  kind: MessageContentKind
  senderPrefix: string
  structured: Record<string, unknown>
  text: string
}

export function messageTypeLabel(type: number): string {
  const labels: Record<number, string> = {
    1: 'text', 3: 'image', 34: 'voice', 42: 'card', 43: 'video', 47: 'sticker',
    48: 'location', 49: 'app', 50: 'voip', 10000: 'system', 10002: 'system',
  }
  return labels[type] ?? `type_${type}`
}

function xmlTag(xml: string, tag: string): string {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'iu'))
  return match?.[1]?.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gu, '$1').trim() ?? ''
}

function xmlAttribute(xml: string, attribute: string): string {
  const match = xml.match(new RegExp(`\\s${attribute}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, 'iu'))
  return match?.[2]?.trim() ?? ''
}

function presentFields(values: Record<string, string>) {
  return Object.fromEntries(Object.entries(values).filter(([, value]) => value))
}

function locatorEvidence(body: string) {
  const fileIdentifiers = presentFields({
    attachId: xmlTag(body, 'attachid') || xmlAttribute(body, 'attachid'),
    fileKey: xmlTag(body, 'filekey') || xmlAttribute(body, 'filekey'),
    md5: xmlTag(body, 'md5') || xmlAttribute(body, 'md5'),
    newMd5: xmlTag(body, 'newmd5') || xmlAttribute(body, 'newmd5'),
  })
  const cdnReferences = presentFields({
    attachment: xmlTag(body, 'cdnattachurl') || xmlAttribute(body, 'cdnattachurl'),
    original: xmlAttribute(body, 'cdnmidimgurl')
      || xmlAttribute(body, 'cdnvideourl')
      || xmlAttribute(body, 'cdnurl'),
    thumbnail: xmlAttribute(body, 'cdnthumburl'),
  })
  return {
    ...(Object.keys(fileIdentifiers).length > 0 ? { fileIdentifiers } : {}),
    ...(Object.keys(cdnReferences).length > 0 ? { cdnReferences } : {}),
  }
}

function splitGroupPrefix(content: string, isGroup: boolean) {
  if (!isGroup) return { body: content, senderPrefix: '' }
  const match = content.match(/^([0-9A-Za-z_@.-]+):\n/u)
  return match
    ? { body: content.slice(match[0].length), senderPrefix: match[1] ?? '' }
    : { body: content, senderPrefix: '' }
}

function appContent(body: string, senderPrefix: string): ParsedMessageContent {
  const title = xmlTag(body, 'title')
  const description = xmlTag(body, 'des')
  const url = xmlTag(body, 'url')
  const appName = xmlTag(body, 'sourcedisplayname') || xmlTag(body, 'appname')
  const fileExtension = xmlTag(body, 'fileext')
  const parts = [
    title,
    description && description !== title ? description : '',
    fileExtension ? `[文件 .${fileExtension}]` : '',
    url,
    appName ? `(${appName})` : '',
  ].filter(Boolean)
  return {
    kind: 'app',
    senderPrefix,
    structured: {
      appName,
      description,
      fileExtension,
      title,
      urls: url ? [url] : [],
      ...locatorEvidence(body),
    },
    text: parts.join(' — ') || '[链接/应用消息]',
  }
}

function mediaContent(type: number, senderPrefix: string, body: string): ParsedMessageContent {
  const labels: Record<number, string> = {
    3: '[图片]', 34: '[语音]', 43: '[视频]', 47: '[表情]', 48: '[位置]', 50: '[通话]',
  }
  return {
    kind: 'media',
    senderPrefix,
    structured: { mediaType: messageTypeLabel(type), ...locatorEvidence(body) },
    text: labels[type] ?? `[${messageTypeLabel(type)}]`,
  }
}

export function parseMessageContent(type: number, content: string, isGroup: boolean): ParsedMessageContent {
  const { body, senderPrefix } = splitGroupPrefix(content, isGroup)
  if (type === 1) return { kind: 'text', senderPrefix, structured: {}, text: body.trim() }
  if (type === 49 || body.includes('<appmsg')) return appContent(body, senderPrefix)
  if ([3, 34, 43, 47, 48, 50].includes(type)) return mediaContent(type, senderPrefix, body)
  if (type === 42) {
    const nickname = xmlTag(body, 'nickname')
    return { kind: 'app', senderPrefix, structured: { nickname }, text: `[名片] ${nickname}`.trim() }
  }
  if (type === 10000 || type === 10002) {
    const systemText = body.replace(/<[^>]+>/gu, '').trim()
    const prefix = '[系统] '
    const contentLimit = 300 - [...prefix].length
    return {
      kind: 'system',
      senderPrefix,
      structured: {},
      text: systemText ? `${prefix}${[...systemText].slice(0, contentLimit).join('')}` : '[系统消息]',
    }
  }
  const rawTypeLabel = messageTypeLabel(type)
  return { kind: 'unknown', senderPrefix, structured: { rawTypeLabel }, text: `[${rawTypeLabel}]` }
}
