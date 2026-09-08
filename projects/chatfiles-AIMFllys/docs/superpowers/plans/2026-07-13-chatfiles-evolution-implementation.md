# ChatFiles Evolution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade ChatFiles into a formal Apple-inspired local knowledge workspace with a paged chat timeline, safe link previews, a retrieval/tool-using AI agent, and read-only local HTTP/CLI/MCP access.

**Architecture:** Preserve the canonical chat and artifact databases, and add bounded read-only domain services for timeline, link parsing, retrieval, documents, and agent tools. React features consume those contracts through small components and hooks; HTTP, CLI, MCP, and the AI loop share the same services so identity, limits, UTF-8, and path safety cannot drift.

**Tech Stack:** React 19, TypeScript 6, Vite 8, Express 5, Node SQLite/FTS5, optional sqlite-vec, OpenAI-compatible APIs, MCP TypeScript SDK, Lucide, `tsx --test`, Playwright.

---

## File map and responsibility boundaries

New files are grouped by one responsibility:

- `src/components/brand/BrandMark.tsx`: reusable brand SVG only.
- `src/features/chat-library/sidebarState.ts`: persisted collapsed-state model.
- `src/features/chat-timeline/*`: timeline data hook, list, rail, people popover, and pure UI models.
- `src/features/link-preview/*`: visible-card preview state and presentation.
- `src/components/ai/AgentProgress.tsx`, `AgentCitation.tsx`: tool progress and evidence links.
- `src/utils/aiContext.ts`, `aiAgentStream.ts`: context budgets and SSE protocol, separate from configuration persistence.
- `src/types/chatTimeline.ts`, `linkPreview.ts`, `aiAgent.ts`: public DTOs.
- `server/services/chatTimeline.ts`: cursor-safe message reads.
- `server/services/linkPreview/*`: URL policy, metadata parser, fetch/cache orchestration.
- `server/services/search/*`: index schema/build, keyword/vector retrieval, rank fusion.
- `server/services/documents/*`: artifact-safe text extraction.
- `server/services/agent/*`: tool registry and bounded tool-call loop.
- `server/routes/wechatTimelineRoutes.ts`, `linkPreviewRoutes.ts`, `aiAgent.ts`, `localApi.ts`: thin HTTP adapters.
- `server/cli.ts`, `server/mcp.ts`: read-only local adapters over shared services.

Existing files near 260 lines (`src/App.tsx`, `src/styles/layout.css`) must be split before adding behavior. No `.ts/.tsx/.css` file may exceed 300 lines.

## Task 1: Formal brand, semantic materials, and one-button themes

**Files:**
- Create: `src/components/brand/BrandMark.tsx`
- Create: `src/components/brand/BrandMark.test.ts`
- Modify: `src/hooks/themeModel.ts`
- Modify: `src/hooks/themeModel.test.ts`
- Modify: `src/App.tsx`
- Modify: `src/index.css`
- Modify: `src/styles/layout.css`
- Modify: `src/styles/chat-library-cards.css`
- Modify: `src/styles/chat-library-shell.css`
- Modify: `src/styles/chat-library-accessibility.test.ts`
- Modify: `public/favicon.svg`
- Modify: `index.html`

- [ ] **Step 1: Write failing brand and theme-model tests**

Add tests that call a new pure transition and inspect the reusable SVG contract:

```ts
assert.equal(nextThemePreference('system'), 'light')
assert.equal(nextThemePreference('light'), 'dark')
assert.equal(nextThemePreference('dark'), 'system')
assert.equal(brandMarkViewBox, '0 0 64 64')
assert.ok(brandMarkPaths.every((path) => !path.includes('linearGradient')))
```

Extend the CSS contract test to assert one `.theme-cycle-button`, no `.theme-switcher`, reduced-transparency fallbacks, and semantic avatar foregrounds.

- [ ] **Step 2: Run focused tests and confirm missing exports/contracts**

Run: `npx tsx --test src/hooks/themeModel.test.ts src/components/brand/BrandMark.test.ts src/styles/chat-library-accessibility.test.ts`

Expected: FAIL because `nextThemePreference`, `brandMarkPaths`, and `.theme-cycle-button` do not exist.

- [ ] **Step 3: Implement the brand and pure theme cycle**

`BrandMark.tsx` must export immutable geometry plus the component:

```tsx
export const brandMarkViewBox = '0 0 64 64'
export const brandMarkPaths = [
  'M12 29c7-4 14-4 20 0v23c-6-4-13-4-20-1z',
  'M52 29c-7-4-14-4-20 0v23c6-4 13-4 20-1z',
  'M41 9c-7 2-11 9-9 16 2 6 8 10 15 9-4 5-12 7-19 3-9-5-12-17-7-26 4-6 12-10 20-8z',
] as const
export function BrandMark({ title = '午夜书斋' }: { title?: string }) {
  return <svg viewBox={brandMarkViewBox} role="img" aria-label={title}>{brandMarkPaths.map((d) => <path d={d} key={d} />)}</svg>
}
```

Add `nextThemePreference` with the tested cycle. Replace the inline App logo and three-button switcher with `BrandMark` and one button using `Monitor/Sun/Moon`, current preference, and an action-oriented `aria-label`.

- [ ] **Step 4: Replace jelly colors with formal semantic tokens and the shared favicon**

Use graphite/linen surfaces, midnight-blue selection, warm-copper brand detail, neutral avatars, 8/12px radii, one material layer, and no gradient. Recreate `public/favicon.svg` with the exact BrandMark geometry and add `theme-color` plus `application-name` to `index.html`.

- [ ] **Step 5: Verify brand/UI checks**

Run: `npx tsx --test src/hooks/themeModel.test.ts src/components/brand/BrandMark.test.ts src/styles/chat-library-accessibility.test.ts && npm run lint && npm run build`

Expected: all focused tests pass; lint/build exit 0; favicon contains no Vite path or gradient.

- [ ] **Step 6: Commit stage 1**

```bash
git add index.html public/favicon.svg src/App.tsx src/components/brand src/hooks/themeModel.ts src/hooks/themeModel.test.ts src/index.css src/styles/layout.css src/styles/chat-library-cards.css src/styles/chat-library-shell.css src/styles/chat-library-accessibility.test.ts
git commit -m "feat(ui): establish formal Midnight Study design"
```

## Task 2: Collapsible library and two-level workspace header

**Files:**
- Create: `src/features/chat-library/sidebarState.ts`
- Create: `src/features/chat-library/sidebarState.test.ts`
- Modify: `src/features/chat-library/ChatLibrary.tsx`
- Modify: `src/features/chat-library/ConversationSidebar.tsx`
- Modify: `src/features/chat-library/ArtifactWorkspaceHeader.tsx`
- Modify: `src/styles/chat-library-shell.css`
- Modify: `src/styles/chat-library-workspace.css`
- Modify: `src/styles/chat-library-responsive.css`

- [ ] **Step 1: Write failing persisted-state and header-contract tests**

Test strict booleans and malformed storage:

```ts
assert.equal(parseSidebarCollapsed('true'), true)
assert.equal(parseSidebarCollapsed('false'), false)
assert.equal(parseSidebarCollapsed('1'), false)
assert.equal(serializeSidebarCollapsed(true), 'true')
```

Add a source contract asserting `.artifact-stats` is removed and `workspace-title-counts` exists once.

- [ ] **Step 2: Run the tests and observe the missing state module**

Run: `npx tsx --test src/features/chat-library/sidebarState.test.ts src/styles/chat-library-accessibility.test.ts`

Expected: FAIL on missing `sidebarState.ts` and header class.

- [ ] **Step 3: Implement the collapse state and shell behavior**

Use storage key `chatfiles.chat-library.sidebar-collapsed`, initialize lazily, persist only after mount, and expose `data-sidebar-collapsed`. Pass `collapsed/onToggleCollapsed` to `ConversationSidebar`; render an accessible `PanelLeftClose/PanelLeftOpen` control. In collapsed desktop mode render only the rail and expand control; under 760px ignore collapsed geometry.

- [ ] **Step 4: Merge identity and aggregate counts into the first header row**

Replace the separate stats row with:

```tsx
<div className="workspace-title-counts" aria-label="记录数量">
  <span>{counts.all.toLocaleString()} 项产出</span>
  <span>{counts.chatText.toLocaleString()} 条文字</span>
</div>
```

Keep category counts only inside their Tab buttons. Make the header two fixed rows and ensure loading does not change height.

- [ ] **Step 5: Verify interaction and build**

Run: `npx tsx --test src/features/chat-library/sidebarState.test.ts src/styles/chat-library-accessibility.test.ts && npm test && npm run lint && npm run build`

Expected: all tests pass; source-size guard remains green.

- [ ] **Step 6: Commit stage 2**

```bash
git add src/features/chat-library src/styles/chat-library-shell.css src/styles/chat-library-workspace.css src/styles/chat-library-responsive.css src/styles/chat-library-accessibility.test.ts
git commit -m "feat(chat): simplify the library workspace shell"
```

## Task 3: Cursor-paged Telegram-style chat timeline

**Files:**
- Create: `src/types/chatTimeline.ts`
- Modify: `src/types/index.ts`
- Create: `server/services/chatTimeline.ts`
- Create: `server/services/chatTimeline.test.ts`
- Create: `server/routes/wechatTimelineRoutes.ts`
- Modify: `server/routes/wechat.ts`
- Modify: `server/routes/wechat.test.ts`
- Create: `src/features/chat-timeline/timelineModel.ts`
- Create: `src/features/chat-timeline/timelineModel.test.ts`
- Create: `src/features/chat-timeline/useChatTimeline.ts`
- Create: `src/features/chat-timeline/ChatTimeline.tsx`
- Create: `src/features/chat-timeline/TimelineRail.tsx`
- Create: `src/features/chat-timeline/PeoplePopover.tsx`
- Create: `src/styles/chat-timeline.css`
- Modify: `src/App.css`
- Modify: `src/features/chat-library/ArtifactWorkspace.tsx`

- [ ] **Step 1: Define DTOs and write failing cursor/query tests**

Define `TimelineCursor = { time:number; messageUid:string }`, `TimelineParticipant`, `TimelineBucket`, `TimelinePage`, and test fixture rows sharing one timestamp. Tests must prove stable before/after/around pagination, sender filtering, literal `%/_/\\` search, maximum limit 240, participant counts, date buckets, and exact Chinese/emoji preservation.

```ts
const page = queryTimeline(db, { conversationId: 'c1', limit: 2, before: encodeCursor({ time: 20, messageUid: 'm3' }) })
assert.deepEqual(page.messages.map((m) => m.message_uid), ['m1', 'm2'])
assert.equal(page.messages[0].text, '中文🙂')
```

- [ ] **Step 2: Run server tests and confirm missing service**

Run: `npx tsx --test server/services/chatTimeline.test.ts server/routes/wechat.test.ts`

Expected: FAIL because timeline service and route are absent.

- [ ] **Step 3: Implement parameterized timeline service and thin route**

`queryTimeline(db,input)` must use tuple ordering `(time,message_uid)`, clamp `limit`, decode URL-safe base64 JSON cursors strictly, and return path-free DTOs. Register `GET /api/wechat/conversation/:id/timeline`; invalid cursors return 400, unknown conversation 404, unavailable DB 503. Always close leases in `finally`.

- [ ] **Step 4: Write failing frontend model tests**

Test `groupTimelineMessages`, `mergeTimelinePages`, `trimTimelinePages(maxPages=5)`, `participantMatches`, and `timelineAnchorTarget`. Verify first message in a run retains a name, group boundaries change by local date, duplicate UIDs are removed, and trimming keeps the anchor page.

- [ ] **Step 5: Implement timeline components and bounded loading**

`useChatTimeline` owns request scope, aborts stale fetches, loads the latest 120, prepends older pages with scroll-height correction, supports `around` and sender/query filters, and retains at most five pages. `ChatTimeline` renders date separators, explicit sender/time, UID anchors, and `content-visibility`. `TimelineRail` renders sampled buckets and a people button. `PeoplePopover` provides search, counts, keyboard focus, Escape/outside close, and returns `{ sender, anchorUid? }`.

- [ ] **Step 6: Route chatText to ChatTimeline**

In `ArtifactWorkspace`, branch before grid virtualization:

```tsx
{tab === 'chatText' && selection.kind === 'conversation'
  ? <ChatTimeline conversationId={selection.id} query={deferredQuery} />
  : <ArtifactGrid ... />}
```

Collections may show a clear prompt to select a conversation; they must not request all cross-conversation text.

- [ ] **Step 7: Verify performance contracts**

Run: `npx tsx --test server/services/chatTimeline.test.ts server/routes/wechat.test.ts src/features/chat-timeline/timelineModel.test.ts && npm test && npm run lint && npm run build`

Expected: pass; fixture with 20,000 rows returns at most 240 per request and frontend model retains at most five pages.

- [ ] **Step 8: Commit stage 3**

```bash
git add server/services/chatTimeline* server/routes/wechatTimelineRoutes.ts server/routes/wechat.ts server/routes/wechat.test.ts src/types src/features/chat-timeline src/features/chat-library/ArtifactWorkspace.tsx src/styles/chat-timeline.css src/App.css
git commit -m "feat(chat): add a bounded conversation timeline"
```

## Task 4: Safe, bounded link metadata previews

**Files:**
- Create: `src/types/linkPreview.ts`
- Modify: `src/types/index.ts`
- Create: `server/services/linkPreview/urlPolicy.ts`
- Create: `server/services/linkPreview/urlPolicy.test.ts`
- Create: `server/services/linkPreview/htmlMetadata.ts`
- Create: `server/services/linkPreview/htmlMetadata.test.ts`
- Create: `server/services/linkPreview/linkPreviewService.ts`
- Create: `server/services/linkPreview/linkPreviewService.test.ts`
- Create: `server/routes/linkPreviewRoutes.ts`
- Modify: `server/routes/wechat.ts`
- Create: `src/features/link-preview/useLinkPreview.ts`
- Create: `src/features/link-preview/LinkPreviewCard.tsx`
- Modify: `src/features/chat-library/ArtifactCard.tsx`
- Create: `src/styles/link-preview.css`
- Modify: `src/App.css`

- [ ] **Step 1: Write failing URL-policy and metadata-parser tests**

Cover http/https, credential URLs, localhost, IPv4/IPv6 private/link-local/reserved ranges, DNS rebinding, redirect revalidation, HTML entities, Open Graph precedence, missing metadata, 80/180/40 code-point truncation, and Chinese emoji boundaries.

```ts
assert.equal(await validatePublicUrl('http://127.0.0.1/admin', fakeResolve), false)
assert.equal(parseHtmlMetadata(html, url).title, '中文标题')
assert.equal([...truncateMetadata('😀'.repeat(81), 80)].length, 80)
```

- [ ] **Step 2: Run focused tests and confirm modules are missing**

Run: `npx tsx --test server/services/linkPreview/*.test.ts`

Expected: FAIL on missing policy/parser/service exports.

- [ ] **Step 3: Implement policy, parser, fetch limits, and cache**

Allow only artifact-backed URLs. Revalidate each of at most three redirects, omit credentials/cookies/referer, use a five-second abort timer, accept only HTML, stop at 256KiB, normalize entities/whitespace, and cache versioned JSON under `work/link-preview-cache` for 24h success/30m failure. Dependency-inject DNS, fetch, clock, and cache root for deterministic tests.

- [ ] **Step 4: Add the artifact-ID route and visible-card client**

`GET /api/wechat/artifact/:id/link-preview` resolves the existing artifact, verifies category `link`, and returns `{status:'ready'|'fallback', domain,title,description,siteName,iconUrl,updatedAt}` without paths. `useLinkPreview` starts only when its card intersects the viewport and caches promises per ID. `LinkPreviewCard` always displays domain and falls back to `Link2` on error.

- [ ] **Step 5: Verify safety and UI fallback**

Run: `npx tsx --test server/services/linkPreview/*.test.ts server/routes/wechat.test.ts && npm test && npm run lint && npm run build`

Expected: pass; no test fetch reaches a private address; overlong Chinese is code-point safe.

- [ ] **Step 6: Commit stage 4**

```bash
git add server/services/linkPreview server/routes/linkPreviewRoutes.ts server/routes/wechat.ts src/types src/features/link-preview src/features/chat-library/ArtifactCard.tsx src/styles/link-preview.css src/App.css
git commit -m "feat(links): resolve bounded metadata with safe fallback"
```

## Task 5: AI configuration and deterministic context budgets

**Files:**
- Modify: `src/utils/aiConfig.ts`
- Create: `src/utils/aiConfig.test.ts`
- Create: `src/utils/aiContext.ts`
- Create: `src/utils/aiContext.test.ts`
- Modify: `src/boards/AISettings.tsx`
- Modify: `src/styles/ai-settings.css`

- [ ] **Step 1: Write failing migration and budget tests**

Extend `AIConfig` with `contextWindow`, `contextStrategy: 'recent'|'summary'`, and `embedding: {enabled,baseURL,apiKey,model,dimensions,batchSize}`. Test legacy JSON migration, ranges, no unknown enum values, 70% raw cap, whole-message trimming, output reserve, summary allocation, and UTF-8 boundaries.

```ts
const budget = planContextBudget({ contextWindow: 128_000, strategy: 'recent' })
assert.equal(budget.rawContextMax, 89_600)
assert.ok(budget.reserved >= 38_400)
```

- [ ] **Step 2: Run tests and confirm missing budget model**

Run: `npx tsx --test src/utils/aiConfig.test.ts src/utils/aiContext.test.ts`

Expected: FAIL on missing config fields and `planContextBudget`.

- [ ] **Step 3: Implement strict config normalization and budget planning**

`loadAIConfig` must parse every field, clamp numeric ranges, reject unsupported strategies, and never move keys out of localStorage. `planContextBudget` returns explicit `rawContextMax/retrievalMax/summaryMax/recentMax/reserved`. `takeWholeMessages` must trim at message boundaries.

- [ ] **Step 4: Add settings controls**

Provide model window input, a two-option context strategy control, embedding enable/model/base URL/key/dimensions/batch configuration, keyword-only status text, and privacy language. Save through normalization before testing either chat or embeddings.

- [ ] **Step 5: Verify and commit the context stage**

Run: `npx tsx --test src/utils/aiConfig.test.ts src/utils/aiContext.test.ts && npm run lint && npm run build`

```bash
git add src/utils/aiConfig.ts src/utils/aiConfig.test.ts src/utils/aiContext.ts src/utils/aiContext.test.ts src/boards/AISettings.tsx src/styles/ai-settings.css
git commit -m "feat(ai): configure retrieval and context strategies"
```

## Task 6: Hybrid FTS/vector search index

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `server/services/search/searchTypes.ts`
- Create: `server/services/search/searchSchema.ts`
- Create: `server/services/search/searchSchema.test.ts`
- Create: `server/services/search/chunkMessages.ts`
- Create: `server/services/search/chunkMessages.test.ts`
- Create: `server/services/search/keywordSearch.ts`
- Create: `server/services/search/keywordSearch.test.ts`
- Create: `server/services/search/vectorSearch.ts`
- Create: `server/services/search/vectorSearch.test.ts`
- Create: `server/services/search/rankFusion.ts`
- Create: `server/services/search/rankFusion.test.ts`
- Create: `server/services/search/buildSearchIndex.ts`
- Create: `server/services/search/hybridSearch.ts`
- Create: `server/services/search/hybridSearch.test.ts`

- [ ] **Step 1: Install pinned search dependency and write failing schema/chunk tests**

Run: `npm install sqlite-vec@0.1.9`

Test a versioned FTS5 schema, source fingerprint, staging activation, 500–800 token chunks with 80-token overlap, first/last message UID, Chinese n-grams, and model/dimension mismatch rejection.

- [ ] **Step 2: Run schema/chunk tests**

Run: `npx tsx --test server/services/search/searchSchema.test.ts server/services/search/chunkMessages.test.ts`

Expected: FAIL because schema/chunker modules do not exist.

- [ ] **Step 3: Implement schema, chunking, and keyword search**

Create FTS rows containing stable chunk ID, conversation, sender/date bounds, message UID bounds, exact text, and normalized n-grams. Keyword ranking combines exact identifier/name/domain hits and BM25. Queries are parameterized and literal wildcard characters remain literal.

- [ ] **Step 4: Write and run failing vector/fusion tests**

Use deterministic 3D fixture vectors. Assert cosine order, conversation/date filters, reciprocal-rank fusion tie-breaking, duplicate collapse, and explicit `keyword-only` when sqlite-vec fails to load.

Run: `npx tsx --test server/services/search/vectorSearch.test.ts server/services/search/rankFusion.test.ts server/services/search/hybridSearch.test.ts`

Expected: FAIL on missing vector/fusion functions.

- [ ] **Step 5: Implement optional sqlite-vec and RRF**

Load the extension only from the installed package path, validate dimension/model fingerprint, and query bounded top-K. Catch extension unavailability and return `{mode:'keyword-only'}` without suppressing FTS results. Merge ranks with deterministic RRF, then expand only selected hits to adjacent raw evidence.

- [ ] **Step 6: Implement staging index build**

Build keyword rows without external calls. If embedding is enabled, batch `/embeddings` requests with the request-scoped key, enforce vector dimensions, zero temporary key-bearing structures after use, validate counts/fingerprint, then atomically rename staging to `data/ai-index.current.db`. A failure leaves current untouched.

- [ ] **Step 7: Verify hybrid search and commit**

Run: `npx tsx --test server/services/search/*.test.ts && npm test && npm run lint && npm run build`

```bash
git add package.json package-lock.json server/services/search
git commit -m "feat(search): add rebuildable hybrid chat retrieval"
```

## Task 7: Evidence-safe document readers and agent tools

**Files:**
- Create: `server/services/documents/documentTypes.ts`
- Create: `server/services/documents/readDocument.ts`
- Create: `server/services/documents/readDocument.test.ts`
- Create: `server/services/documents/docxText.ts`
- Create: `server/services/documents/docxText.test.ts`
- Create: `server/services/agent/toolSchemas.ts`
- Create: `server/services/agent/toolRegistry.ts`
- Create: `server/services/agent/toolRegistry.test.ts`

- [ ] **Step 1: Write failing readers and tool-schema tests**

Use temporary allowed-root fixtures for UTF-8 TXT/Markdown/JSON/code/HTML and a minimal DOCX ZIP containing `word/document.xml`. Assert code-point-safe caps, HTML script removal, DOCX paragraph order, unsupported binary errors, path-free output, malformed tool arguments, result caps, and stable citations.

- [ ] **Step 2: Run tests and confirm missing readers**

Run: `npx tsx --test server/services/documents/*.test.ts server/services/agent/toolRegistry.test.ts`

Expected: FAIL on missing `readDocument` and registry.

- [ ] **Step 3: Implement evidence-bound extraction**

Resolve asset ID through the existing artifact source resolver, re-check allowed-root containment and size, dispatch by preview/extension, strip unsafe HTML, parse simple DOCX XML, and return `{assetId,title,text,truncated,citation}` only. Never accept a raw path.

- [ ] **Step 4: Implement seven read-only tools**

Register `list_conversations`, `search_messages`, `get_message_context`, `search_artifacts`, `read_document`, `get_timeline_slice`, and `get_link_preview` as JSON Schema definitions plus executors. Validate every call, cap each result, and emit `[消息:uid]`/`[文件:id]` citations.

- [ ] **Step 5: Verify and commit**

Run: `npx tsx --test server/services/documents/*.test.ts server/services/agent/toolRegistry.test.ts && npm run lint && npm run build`

```bash
git add server/services/documents server/services/agent/toolSchemas.ts server/services/agent/toolRegistry.ts server/services/agent/toolRegistry.test.ts
git commit -m "feat(ai): expose evidence-safe local research tools"
```

## Task 8: Bounded multi-step agent, summaries, SSE, and citation UI

**Files:**
- Create: `src/types/aiAgent.ts`
- Modify: `src/types/index.ts`
- Create: `server/services/agent/agentLoop.ts`
- Create: `server/services/agent/agentLoop.test.ts`
- Create: `server/services/agent/contextSummary.ts`
- Create: `server/services/agent/contextSummary.test.ts`
- Create: `server/routes/aiAgent.ts`
- Create: `server/routes/aiAgent.test.ts`
- Modify: `server/app.ts`
- Create: `src/utils/aiAgentStream.ts`
- Create: `src/utils/aiAgentStream.test.ts`
- Create: `src/components/ai/AgentProgress.tsx`
- Create: `src/components/ai/AgentCitation.tsx`
- Modify: `src/components/ai/AIChatDock.tsx`
- Modify: `src/styles/ai-dock.css`

- [ ] **Step 1: Write failing loop and summary tests with a fake upstream**

Script a model that calls `search_messages`, then `get_message_context`, then answers. Assert at most eight steps, at most six tool calls/step, invalid-call rejection, timeout/abort, duplicate-call suppression, citations, non-tool fallback, no key in emitted events, and stable upstream errors. Summary tests must preserve facts/people/dates/quotes/disputes/open items/source UIDs, source hash, stale detection, and failure fallback to recent mode.

- [ ] **Step 2: Run agent tests and confirm missing loop**

Run: `npx tsx --test server/services/agent/agentLoop.test.ts server/services/agent/contextSummary.test.ts server/routes/aiAgent.test.ts`

Expected: FAIL on missing loop/route.

- [ ] **Step 3: Implement bounded agent loop and loss-aware summaries**

Call OpenAI-compatible chat completions with tool schemas, validate tool calls, execute the shared registry, append bounded results, and stop at final text or the hard limit. For models rejecting tools, perform hybrid retrieval then one citation-constrained generation. Build summaries as versioned structured JSON with source UIDs/hash; publish only when every summary fact has at least one source UID.

- [ ] **Step 4: Implement SSE route and client parser**

`POST /api/ai/agent` validates configuration and strategy, sets a 90-second abort, and emits only `step/tool/citation/delta/done/error`. `aiAgentStream` must parse frames split across arbitrary chunks, preserve Chinese, stop on done, and surface stable errors.

- [ ] **Step 5: Split and upgrade AIChatDock**

Keep the Dock shell below 300 lines by extracting progress and citations. Send the current conversation/page anchor plus user question to `/api/ai/agent`; show retrieval mode, tool steps, context strategy, and evidence count. Route message citation clicks through a callback to select chatText and anchor UID; route file citations to existing preview. Clear cancels work and deletes only AI history/summary.

- [ ] **Step 6: Verify agent behavior and privacy**

Run: `npx tsx --test server/services/agent/*.test.ts server/routes/aiAgent.test.ts src/utils/aiAgentStream.test.ts && npm test && npm run lint && npm run build`

Expected: fake two-tool flow passes, summary citation closure passes, source-size guard passes, and test logs/events contain no fake API key.

- [ ] **Step 7: Commit stage 5 completion**

```bash
git add src/types src/utils/aiAgentStream* src/components/ai src/styles/ai-dock.css server/services/agent server/routes/aiAgent* server/app.ts
git commit -m "feat(ai): orchestrate multi-step evidence research"
```

## Task 9: Shared read-only local HTTP, CLI, and MCP

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `server/services/localAccess.ts`
- Create: `server/services/localAccess.test.ts`
- Create: `server/routes/localApi.ts`
- Create: `server/routes/localApi.test.ts`
- Create: `server/cli.ts`
- Create: `server/cli.test.ts`
- Create: `server/mcp.ts`
- Create: `server/mcp.test.ts`
- Modify: `server/app.ts`
- Create: `docs/local-access.md`

- [ ] **Step 1: Install MCP SDK and write failing shared-service/API tests**

Run: `npm install @modelcontextprotocol/sdk@1.29.0 zod@4.4.3`

Test status, conversations, hybrid search, artifacts, document read, message context, default/max limits, optional bearer token, path stripping, stable error codes, and Chinese JSON.

- [ ] **Step 2: Run tests and confirm adapters are missing**

Run: `npx tsx --test server/services/localAccess.test.ts server/routes/localApi.test.ts server/cli.test.ts server/mcp.test.ts`

Expected: FAIL because local adapters do not exist.

- [ ] **Step 3: Implement shared service and loopback HTTP adapter**

Expose only read operations. Mount `/api/local/v1/*` before SPA fallback. If `CHATFILES_LOCAL_TOKEN` exists, require constant-time Bearer comparison; otherwise rely on the existing loopback listener. Clamp lists to 1–100 and text to documented character caps.

- [ ] **Step 4: Implement CLI**

Support:

```text
chatfiles status [--json]
chatfiles conversations [--query 文本] [--limit 20] [--json]
chatfiles search <query> [--conversation ID] [--sender ID] [--json]
chatfiles artifacts <query> [--json]
chatfiles read-document <asset-id> [--max-chars 12000] [--json]
chatfiles message-context <message-uid> [--radius 8] [--json]
```

Use `process.stdout.write` UTF-8, never print environment values, and return exit code 2 for input errors and 1 for service errors.

- [ ] **Step 5: Implement MCP stdio**

Use the official SDK `McpServer` and `StdioServerTransport`; register the same six operations as read-only tools with Zod schemas and return text plus stable structured content. Never write logs to stdout. Protocol tests spawn the process, send initialize/list/call JSON-RPC, and verify Chinese round trips.

- [ ] **Step 6: Document safe local connection examples**

`docs/local-access.md` must show npm scripts, HTTP curl/PowerShell examples, CLI examples, and generic MCP client JSON using `npm run mcp`; all identities/tokens are placeholders and no public bind is suggested.

- [ ] **Step 7: Verify and commit stage 6**

Run: `npx tsx --test server/services/localAccess.test.ts server/routes/localApi.test.ts server/cli.test.ts server/mcp.test.ts && npm test && npm run lint && npm run build`

```bash
git add package.json package-lock.json server/services/localAccess* server/routes/localApi* server/cli* server/mcp* server/app.ts docs/local-access.md
git commit -m "feat(local): provide read-only CLI and MCP access"
```

## Task 10: End-to-end visual, performance, privacy, and UTF-8 regression

**Files:**
- Modify: `scripts/e2e/chatLibrary.e2e.ts`
- Create: `scripts/e2e/aiAgent.e2e.ts`
- Create: `docs/verification/2026-07-13-chatfiles-evolution.md`
- Modify: files exposed by verified regressions only

- [ ] **Step 1: Extend Playwright flows**

Cover desktop light/dark/system, 760px/mobile, sidebar collapse/reload/expand, single theme button, two-level header, timeline older-page load, date jump, people search/filter/clear, link success/fallback, AI two-tool fake-upstream flow, message/file citation clicks, keyboard focus, reduced motion, reduced transparency, and browser console errors.

- [ ] **Step 2: Run the complete verification matrix**

Run in order:

```bash
npm test
npm run lint
npm run build
npm run typecheck:server
npm run test:e2e
npx tsx scripts/e2e/aiAgent.e2e.ts
git diff --check
git ls-files data archive work imports .env.local image_key.json
```

Expected: all commands exit 0; the privacy `git ls-files` command prints nothing; skipped tests are only documented platform integration tests.

- [ ] **Step 3: Inspect rendered screenshots and runtime invariants**

Confirm no overlap/truncation, no Vite icon, no jelly gradients, favicon/brand consistency, one theme control, at most five timeline pages, link fallback without console errors, AI progress/citations, no key/path exposure, and correct Chinese/emoji in UI/API/CLI/MCP.

- [ ] **Step 4: Record exact evidence**

Write the command exit codes, test counts, skipped-test reasons, build asset warning status, screenshots inspected, API cases, CLI/MCP transcript summaries, privacy output, and current commit hashes to the verification document. Do not include personal counts, paths, message text, IDs, or keys.

- [ ] **Step 5: Commit final verified corrections and report**

```bash
git add scripts/e2e docs/verification src server package.json package-lock.json public index.html
git diff --cached --name-only
git commit -m "test: verify the ChatFiles evolution end to end"
```

Before committing, remove any staged `data/`, `archive/`, `work/`, `imports/`, `.env.local`, database, binary, screenshot, or user-owned untracked file.
