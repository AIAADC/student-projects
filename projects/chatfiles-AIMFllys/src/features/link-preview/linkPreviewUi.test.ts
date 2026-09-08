import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

function source(name: string) {
  const target = path.resolve(process.cwd(), 'src/features/link-preview', name)
  assert.equal(fs.existsSync(target), true, `${name} must exist`)
  return fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : ''
}

test('loads link metadata only after the card approaches the viewport', () => {
  const hook = source('useLinkPreview.ts')
  assert.match(hook, /IntersectionObserver/u)
  assert.match(hook, /rootMargin:\s*'240px 0px'/u)
  assert.match(hook, /AbortController/u)
  assert.match(hook, /apiEndpoints\.artifactLinkPreview\(artifactId\)/u)
  assert.match(hook, /linkPreviewSchema/u)
  assert.doesNotMatch(hook, /[`'"]\/api\//u)
})

test('renders bounded metadata with a private fallback and no remote favicon request', () => {
  const card = source('LinkPreviewCard.tsx')
  const artifactCard = fs.readFileSync(
    path.resolve(process.cwd(), 'src/features/chat-library/ArtifactCard.tsx'),
    'utf8',
  )
  const chatPage = fs.readFileSync(path.resolve(process.cwd(), 'src/pages/ChatPage.tsx'), 'utf8')
  assert.match(card, /link-preview-description/u)
  assert.match(card, /data-status=\{status\}/u)
  assert.doesNotMatch(card, /iconUrl/u)
  assert.match(artifactCard, /<LinkPreviewCard/u)
  assert.match(chatPage, /link-preview\.css/u)
})
