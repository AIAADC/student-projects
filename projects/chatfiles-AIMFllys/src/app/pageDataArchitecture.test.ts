import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

function source(relativePath: string) {
  return fs.readFileSync(path.resolve(process.cwd(), 'src', relativePath), 'utf8')
}

test('loads lazy-page data through explicit schemas and observable states', () => {
  const hook = source('shared/api/usePageData.ts')
  assert.match(hook, /loadPageData/u)
  assert.match(hook, /schema:\s*Schema/u)
  assert.doesNotMatch(hook, /jsonObjectSchema|as T/u)

  const expectedSchemas: Record<string, string[]> = {
    'pages/OverviewPage.tsx': ['overviewSchema'],
    'pages/ChatPage.tsx': ['insightsResponseSchema'],
    'pages/FilesPage.tsx': ['libraryManifestSchema', 'sourceFileManifestSchema'],
    'pages/InsightsPage.tsx': ['insightsResponseSchema'],
    'pages/AcademicsPage.tsx': ['insightsResponseSchema', 'knowledgeBaseSchema'],
    'pages/MediaPage.tsx': ['libraryManifestSchema'],
    'pages/KnowledgePage.tsx': ['knowledgeBaseSchema'],
    'pages/SummaryPage.tsx': ['chatSummarySchema'],
    'pages/CluesPage.tsx': ['chatClueDossierSchema', 'libraryManifestSchema', 'sourceFileManifestSchema'],
    'pages/SynthesisPage.tsx': ['chatSynthesisSchema'],
    'pages/DatabasesPage.tsx': ['databaseAnalysisSchema', 'sourceFileManifestSchema'],
    'pages/CandidatesPage.tsx': ['valueCandidateIndexSchema', 'sourceFileManifestSchema'],
  }
  for (const [pagePath, schemas] of Object.entries(expectedSchemas)) {
    const page = source(pagePath)
    assert.match(page, /PageDataNotice/u, `${pagePath} exposes loading and unavailable states`)
    for (const schema of schemas) assert.ok(page.includes(schema), `${pagePath} uses ${schema}`)
  }
  assert.match(source('pages/ChatPage.tsx'), /blocking=\{false\}/u)
})
