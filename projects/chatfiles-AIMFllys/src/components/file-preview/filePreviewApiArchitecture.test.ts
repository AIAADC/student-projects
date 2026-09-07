import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const root = path.resolve(process.cwd(), 'src/components/file-preview')

test('validates file-preview JSON through the shared client without scattered API URLs', () => {
  const expectations = new Map([
    ['ArchivePreview.tsx', 'archivePreviewSchema'],
    ['DatabasePreview.tsx', 'databasePreviewSchema'],
    ['GenericInspector.tsx', 'fileInspectionSchema'],
    ['VoicePreview.tsx', 'voicePreviewSchema'],
  ])
  for (const [filename, schema] of expectations) {
    const source = fs.readFileSync(path.join(root, filename), 'utf8')
    assert.match(source, new RegExp(`readJson[\\s\\S]*${schema}`, 'u'), filename)
    assert.doesNotMatch(source, /\bfetch\s*\(/u, filename)
    assert.doesNotMatch(source, /[`'"]\/api\//u, filename)
  }
})

test('loads text and binary previews through the status-aware API client', () => {
  const expectations = new Map([
    ['DocxPreview.tsx', 'readBlob'],
    ['PptxPreview.tsx', 'readArrayBuffer'],
    ['SheetPreview.tsx', 'readBlob'],
    ['TextPreview.tsx', 'readText'],
  ])
  for (const [filename, reader] of expectations) {
    const source = fs.readFileSync(path.join(root, filename), 'utf8')
    assert.match(source, new RegExp(`\\b${reader}\\b`, 'u'), filename)
    assert.doesNotMatch(source, /\bfetch\s*\(/u, filename)
  }
})
