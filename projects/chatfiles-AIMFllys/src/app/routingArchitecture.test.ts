import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const srcRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function source(relativePath: string) {
  const path = resolve(srcRoot, relativePath)
  assert.equal(existsSync(path), true, `${relativePath} must exist`)
  return readFileSync(path, 'utf8')
}

test('keeps App as a URL-driven shell with an Outlet and no eager page data fan-out', () => {
  const app = source('App.tsx')
  assert.match(app, /\bOutlet\b/u)
  assert.doesNotMatch(app, /from ['"]\.\/boards\/(?:Overview|Chat|Files|Insights|Academics|AISettings)['"]/u)
  assert.doesNotMatch(app, /\bfetch\s*\(/u)
  assert.doesNotMatch(app, /empty(?:Overview|Insights|Manifest|Knowledge|Summary)/u)
})

test('lazy-loads every route page and gives Chat ownership of URL params', () => {
  const router = source('app/routePages.tsx')
  for (const page of [
    'OverviewPage', 'ChatPage', 'FilesPage', 'InsightsPage', 'AcademicsPage',
    'MediaPage', 'KnowledgePage', 'SummaryPage', 'CluesPage', 'SynthesisPage',
    'DatabasesPage', 'CandidatesPage', 'AISettingsPage',
  ]) {
    assert.match(router, new RegExp(`lazy\\(\\(\\) => import\\(['"]\\.\\.\\/pages\\/${page}['"]\\)\\)`, 'u'))
  }
  const chatPage = source('pages/ChatPage.tsx')
  assert.match(chatPage, /\buseParams\b/u)
  assert.match(chatPage, /\buseSearchParams\b/u)
  assert.match(chatPage, /parseChatRouteState/u)
})

test('loads page data and CSS from lazy page modules instead of the root bundle', () => {
  const appCss = source('App.css')
  assert.doesNotMatch(appCss, /boards|files\.css|file-preview|workbenches|summary|chat-library|chat-timeline|link-preview|ai\.css/u)

  const expectations: Record<string, { endpoints: string[]; styles: string[] }> = {
    'OverviewPage.tsx': { endpoints: ['apiEndpoints.overview'], styles: ['boards-overview.css'] },
    'ChatPage.tsx': { endpoints: ['apiEndpoints.insights'], styles: ['chat-library.css', 'chat-timeline.css'] },
    'FilesPage.tsx': { endpoints: ['apiEndpoints.library', 'apiEndpoints.sourceLibrary'], styles: ['files.css', 'file-preview.css'] },
    'InsightsPage.tsx': { endpoints: ['apiEndpoints.insights'], styles: ['boards-insights.css'] },
    'AcademicsPage.tsx': { endpoints: ['apiEndpoints.insights', 'apiEndpoints.knowledge'], styles: ['boards-academics.css'] },
    'MediaPage.tsx': { endpoints: ['apiEndpoints.library'], styles: ['workbenches-media.css'] },
    'KnowledgePage.tsx': { endpoints: ['apiEndpoints.knowledge'], styles: ['workbenches-layout.css'] },
    'SummaryPage.tsx': { endpoints: ['apiEndpoints.summary'], styles: ['summary.css'] },
    'CluesPage.tsx': { endpoints: ['apiEndpoints.chatClues', 'apiEndpoints.sourceLibrary', 'apiEndpoints.library'], styles: ['workbenches-clue.css'] },
    'SynthesisPage.tsx': { endpoints: ['apiEndpoints.chatSynthesis'], styles: ['workbenches-synthesis.css'] },
    'DatabasesPage.tsx': { endpoints: ['apiEndpoints.databaseAnalysis', 'apiEndpoints.sourceLibrary'], styles: ['workbenches-database-value.css'] },
    'CandidatesPage.tsx': { endpoints: ['apiEndpoints.valueCandidates', 'apiEndpoints.sourceLibrary'], styles: ['workbenches-database-value.css'] },
    'AISettingsPage.tsx': { endpoints: [], styles: ['ai-settings.css'] },
  }

  for (const [page, expected] of Object.entries(expectations)) {
    const pageSource = source(`pages/${page}`)
    for (const endpoint of expected.endpoints) assert.ok(pageSource.includes(endpoint), `${page} owns ${endpoint}`)
    for (const style of expected.styles) assert.ok(pageSource.includes(style), `${page} owns ${style}`)
  }

  const chatLibrary = source('features/chat-library/ChatLibrary.tsx')
  assert.ok(chatLibrary.includes('apiEndpoints.conversations'))
  assert.ok(!chatLibrary.includes("'/api/wechat/conversations'"))
})

test('sends a cross-conversation message citation through one complete navigation callback', () => {
  const chatLibrary = source('features/chat-library/ChatLibrary.tsx')
  assert.match(
    chatLibrary,
    /onConversationChange\(conversationId,\s*\{\s*messageUid:\s*citation\.id\s*\}\)/u,
  )
  assert.doesNotMatch(
    chatLibrary,
    /onConversationChange\(conversationId\)[\s\S]{0,120}onChatRouteStateChange\(\{\s*messageUid:/u,
  )
})

test('does not push the same chat URL when switching collections under /chat', () => {
  const chatPage = source('pages/ChatPage.tsx')
  assert.match(chatPage, /if \(nextUrl === chatRouteUrl\(locationRef\.current\)\) return/u)
})
