import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

function source(relativePath: string) {
  return fs.readFileSync(path.resolve(process.cwd(), 'src', relativePath), 'utf8')
}

test('validates chat-library JSON and centralizes every chat API URL', () => {
  const library = source('features/chat-library/ChatLibrary.tsx')
  const workspace = source('features/chat-library/ArtifactWorkspace.tsx')
  const linkPreview = source('features/link-preview/useLinkPreview.ts')
  assert.match(library, /readJson[\s\S]*?wechatConversationListSchema/u)
  assert.match(workspace, /readJson[\s\S]*?chatArtifactPageSchema/u)
  assert.match(workspace, /chatArtifactMetadataSchema/u)
  assert.match(linkPreview, /readJson[\s\S]*?linkPreviewSchema/u)
  for (const file of [library, workspace, linkPreview, source('features/chat-library/ArtifactCard.tsx')]) {
    assert.doesNotMatch(file, /[`'"]\/api\//u)
  }
})

test('renders artifact and agent evidence times to the source second in the bundle zone', () => {
  const card = source('features/chat-library/ArtifactCard.tsx')
  const citation = source('components/ai/AgentCitation.tsx')
  assert.match(card, /formatArchiveTimestamp\(item\.createdAt, timeZone\)/u)
  assert.match(citation, /formatArchiveTimestamp\(citation\.time, timeZone\)/u)
  assert.match(citation, /<time/u)
})
