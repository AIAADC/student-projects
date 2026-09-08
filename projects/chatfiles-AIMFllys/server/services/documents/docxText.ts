import JSZip from 'jszip'

const MAX_DOCUMENT_XML = 8 * 1024 * 1024

function decodeXml(value: string) {
  const named: Record<string, string> = { amp: '&', apos: "'", gt: '>', lt: '<', quot: '"' }
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/giu, (entity, code: string) => {
    if (!code.startsWith('#')) return named[code.toLowerCase()] ?? entity
    const hex = code[1]?.toLowerCase() === 'x'
    const point = Number.parseInt(code.slice(hex ? 2 : 1), hex ? 16 : 10)
    try { return Number.isSafeInteger(point) ? String.fromCodePoint(point) : entity } catch { return entity }
  })
}

function paragraphText(xml: string) {
  const output: string[] = []
  const token = /<w:t\b[^>]*>([\s\S]*?)<\/w:t>|<w:tab\b[^>]*\/?\s*>|<w:br\b[^>]*\/?\s*>/giu
  for (const match of xml.matchAll(token)) {
    if (match[1] !== undefined) output.push(decodeXml(match[1].replace(/<[^>]*>/gu, '')))
    else if (/^<w:tab/iu.test(match[0])) output.push('\t')
    else output.push('\n')
  }
  return output.join('').trim()
}

export async function extractDocxText(data: Buffer | Uint8Array) {
  let zip: JSZip
  try { zip = await JSZip.loadAsync(data) } catch { throw new Error('docx_invalid_zip') }
  const entry = zip.file('word/document.xml')
  if (!entry) throw new Error('docx_document_missing')
  const size = (entry as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize
  if (typeof size === 'number' && size > MAX_DOCUMENT_XML) throw new Error('docx_document_too_large')
  const xml = await entry.async('string')
  if (Buffer.byteLength(xml, 'utf8') > MAX_DOCUMENT_XML) throw new Error('docx_document_too_large')
  const paragraphs = [...xml.matchAll(/<w:p\b[^>]*>([\s\S]*?)<\/w:p>/giu)]
    .map((match) => paragraphText(match[1]))
    .filter(Boolean)
  return paragraphs.join('\n')
}
