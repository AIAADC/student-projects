# ChatFiles Chat Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an evidence-backed conversation asset browser with Apple-style light/dark UI, then safely rebuild and audit the local chat corpus.

**Architecture:** Keep the global app rail, replace the chat board interior with a conversation sidebar and a paginated asset workspace, and expose classification/search through Express. Normalize WeChat parsing and asset evidence in pure tested modules before rebuilding private outputs.

**Tech Stack:** React 19, TypeScript 6, Express 5, Node SQLite, Lucide React, CSS custom properties, `tsx --test`, Playwright.

---

### Task 1: Freeze Baselines and Parser Contracts

**Files:**
- Create: `scripts/wechat/messageModel.ts`
- Create: `scripts/wechat/messageModel.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Write failing tests** for 64-bit message type normalization, sender precedence, UTF-8 Chinese preservation, and strict snapshot-subset selection.
- [ ] **Step 2: Run** `npx tsx --test scripts/wechat/messageModel.test.ts` and confirm failures are caused by missing exports.
- [ ] **Step 3: Implement** pure `normalizeMessageType`, `resolveSenderIdentity`, and `chooseAccountSnapshots` functions without filesystem side effects.
- [ ] **Step 4: Run** the focused test and then `npm test`; expected result is zero failures.
- [ ] **Step 5: Commit** only the contract module, tests, and package script with `test(data): define chat identity contracts`.

### Task 2: Repair and Audit WeChat Parsing

**Files:**
- Modify: `scripts/parseWeChat.ts`
- Create: `scripts/auditChatIdentity.ts`
- Create: `scripts/auditChatIdentity.test.ts`
- Modify: `replication/docs/spec/04_parsing.md`

- [ ] **Step 1: Write failing audit tests** proving a duplicate snapshot is excluded, `raw_type` remains intact, base `type` is normalized, and sender IDs resolve to one display identity.
- [ ] **Step 2: Run** `npx tsx --test scripts/auditChatIdentity.test.ts` and capture the expected schema/behavior failures.
- [ ] **Step 3: Update the parser** to use the contract module, retain `local_id/sort_seq/raw_type`, add indexes, produce an audit manifest, and write UTF-8 transcripts atomically.
- [ ] **Step 4: Back up current private outputs** under a timestamped `work/snapshots/` directory; do not delete source or decrypted data.
- [ ] **Step 5: Rebuild from decrypted copies** with `npx tsx scripts/parseWeChat.ts`, then run `npx tsx scripts/auditChatIdentity.ts --strict`.
- [ ] **Step 6: Verify** account/conversation/message counts, first/last times, unknown-sender reasons, and sample UTF-8 round trips against the snapshot.
- [ ] **Step 7: Commit** code/spec changes only with `fix(data): keep chat identities and message types aligned`.

### Task 3: Build Evidence-Backed Conversation Assets

**Files:**
- Create: `scripts/wechat/assetEvidence.ts`
- Create: `scripts/wechat/assetEvidence.test.ts`
- Create: `scripts/buildConversationAssets.ts`
- Modify: `src/types/chat.ts`

- [ ] **Step 1: Write failing tests** for exact `local_id + chat_id + hash` linkage, unconfirmed filename candidates, category precedence, URL extraction, and `全部` excluding chat text.
- [ ] **Step 2: Run** `npx tsx --test scripts/wechat/assetEvidence.test.ts` and confirm the module is missing.
- [ ] **Step 3: Implement** evidence keys, category classification, safe source-root checks, export status, and deterministic JSON/SQLite output.
- [ ] **Step 4: Generate** the private asset index from `message_resource.db` and the configured WeChat store; never mutate the store.
- [ ] **Step 5: Run** the asset audit and require every confirmed local file to have an existing allowed path and every failure to have a reason.
- [ ] **Step 6: Commit** code/types only with `feat(data): index conversation assets with evidence`.

### Task 4: Add Asset Statistics, Search, and Preview APIs

**Files:**
- Create: `server/utils/chatArtifacts.ts`
- Create: `server/utils/chatArtifacts.test.ts`
- Modify: `server/routes/wechat.ts`
- Modify: `server/routes/files.ts`
- Modify: `server/routes/source-files.ts`

- [ ] **Step 1: Write failing tests** for count equality, category filtering, pagination boundaries, search escaping, missing conversation errors, and allowed preview paths.
- [ ] **Step 2: Run** `npx tsx --test server/utils/chatArtifacts.test.ts`; expected failure is missing API logic.
- [ ] **Step 3: Implement** `GET /api/wechat/conversation/:id/artifacts` and global collection variants with parameterized queries and stable cursors.
- [ ] **Step 4: Add** browser preview response headers and HTML sandbox/CSP while preserving current multi-format preview behavior.
- [ ] **Step 5: Verify** API responses against direct SQLite totals and exercise 400/404/416 cases.
- [ ] **Step 6: Commit** with `feat(api): expose searchable conversation artifacts`.

### Task 5: Build the Double Navigation and Artifact Gallery

**Files:**
- Create: `src/features/chat-library/ChatLibrary.tsx`
- Create: `src/features/chat-library/ConversationSidebar.tsx`
- Create: `src/features/chat-library/ArtifactWorkspace.tsx`
- Create: `src/features/chat-library/ArtifactCard.tsx`
- Create: `src/features/chat-library/pins.ts`
- Create: `src/features/chat-library/pins.test.ts`
- Modify: `src/boards/Chat.tsx`
- Modify: `src/App.tsx`
- Create: `src/styles/chat-library.css`
- Modify: `src/App.css`

- [ ] **Step 1: Write failing tests** for pin persistence, invalid ID pruning, pinned-first ordering, tab count labels, and query serialization.
- [ ] **Step 2: Run** the pin/model tests and confirm expected failures.
- [ ] **Step 3: Implement** fixed collections, searchable conversation navigation, pin controls, asset tabs, exact counts, paginated search, loading/empty/error states, and mobile list/workspace navigation.
- [ ] **Step 4: Wire card activation** to local file preview, source-message detail, or external URL; every card must have one valid action.
- [ ] **Step 5: Run** unit tests and `npm run build`.
- [ ] **Step 6: Commit** with `feat(chat): add pinned conversation asset gallery`.

### Task 6: Apply Apple Design Themes and Accessibility

**Files:**
- Create: `src/hooks/useTheme.ts`
- Create: `src/hooks/themeModel.ts`
- Create: `src/hooks/themeModel.test.ts`
- Modify: `src/index.css`
- Modify: `src/styles/layout.css`
- Modify: `src/styles/shared.css`
- Modify: `src/styles/boards-chat.css`
- Modify: `src/App.tsx`

- [ ] **Step 1: Write failing tests** for system/light/dark resolution and persisted preference validation.
- [ ] **Step 2: Run** `npx tsx --test src/hooks/themeModel.test.ts` and confirm missing behavior.
- [ ] **Step 3: Implement** semantic light/dark tokens, system preference subscription, persistent toggle, instant pressed feedback, restrained material layers, stable 8px card radii, and system typography.
- [ ] **Step 4: Add** reduced-motion, reduced-transparency and increased-contrast media-query fallbacks.
- [ ] **Step 5: Run** build and Playwright screenshots in light/dark at desktop and mobile widths; inspect for overlap and blank previews.
- [ ] **Step 6: Commit** with `feat(ui): add Apple-inspired adaptive themes`.

### Task 7: Update Private Data, Exports, and Insights by SOP

**Files:**
- Modify: `.gitignore`
- Modify: `docs/ChatFiles本地更新/05_验收与回归.md`
- Private outputs under ignored `data/`, `archive/`, and `work/`

- [ ] **Step 1: Record** pre-update counts, hashes and insight high-water state under ignored `work/snapshots/`.
- [ ] **Step 2: If current decrypted copies are stale**, run `work/crackv4.exe` against the live Weixin main PID with the documented output-only target; do not modify the original store.
- [ ] **Step 3: Run** parser, identity audit, asset export, archive ingestion, digest preparation, delta computation, and only the affected insight merge steps in SOP order.
- [ ] **Step 4: Attempt** image/video/document/voice export; preserve original payloads and write explicit failure statuses for missing keys/codecs.
- [ ] **Step 5: Verify** monotonic counts and high-water marks, no duplicate snapshot conversations, valid insight JSON, and no private paths tracked by Git.
- [ ] **Step 6: Extend** `.gitignore` for generated audits, credentials, temporary screenshots, export caches and local research outputs without hiding source/tests.
- [ ] **Step 7: Commit** only safe code/docs/config with `chore(data): harden local update and export safeguards`.

### Task 8: Full Regression and Final Polish

**Files:**
- Create: `playwright.config.ts`
- Create: `tests/chat-library.spec.ts`
- Modify: `eslint.config.js`
- Modify: files identified by regression failures

- [ ] **Step 1: Write Playwright flows** for conversation selection, pin/unpin reload, every tab, search, card preview, light/dark toggle, mobile navigation, keyboard focus and reduced motion.
- [ ] **Step 2: Run** `npm test`, `npm run lint`, `npm run build`, the strict data audit and Playwright on desktop/mobile.
- [ ] **Step 3: Inspect** screenshots and browser console; fix overlap, truncation, inaccessible labels, dead actions and non-semantic colors.
- [ ] **Step 4: Re-run the entire verification matrix** from a clean server start and record exact counts/status.
- [ ] **Step 5: Commit** final verified corrections with `test: cover chat library end to end`.

