import assert from 'node:assert/strict'
import test from 'node:test'
import JSZip from 'jszip'
import { extractDocxText } from './docxText.js'

test('extracts simple DOCX paragraphs, tabs, breaks, and XML entities in order', async () => {
  const zip = new JSZip()
  zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8"?>
    <w:document xmlns:w="urn:test"><w:body>
      <w:p><w:r><w:t>第一段 &amp; 证据</w:t></w:r></w:p>
      <w:p><w:r><w:t>第二段</w:t><w:tab/><w:t>制表</w:t><w:br/><w:t>换行</w:t></w:r></w:p>
    </w:body></w:document>`)
  const data = await zip.generateAsync({ type: 'nodebuffer' })
  assert.equal(await extractDocxText(data), '第一段 & 证据\n第二段\t制表\n换行')
})

test('rejects a DOCX without a bounded document part', async () => {
  const zip = new JSZip()
  zip.file('word/other.xml', '<empty/>')
  const data = await zip.generateAsync({ type: 'nodebuffer' })
  await assert.rejects(extractDocxText(data), /docx_document_missing/u)
})
