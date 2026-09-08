# Codex Parity Desktop Agent Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the desktop AI experience and `hi --ai` runtime toward top-tier Codex-style interaction fidelity: responsive desktop shell, left multi-session rail, right AI conversation, rich markdown rendering, Codex-like composer, visible thinking/tool activity, and a provider-neutral agent loop.

**Architecture:** The local upstream source is used for the CLI and backend agent mechanism, not for the desktop look. Raw upstream CLI/agent source is copied first into `vendor/upstream-agent-runtime-import/` and `vendor/upstream-terminal-ui-import/` as requested, then useful mechanics are deleted/adapted into My-CLI-native modules. The desktop surface is rebuilt separately against the Codex desktop visual target: a desktop session store, embedded AI IPC bridge, browser chat renderer, message virtualization, markdown renderer, and Codex-like composer.

**Tech Stack:** Electron, React 19, Vite, TypeScript strict, Node child process IPC, OpenAI-compatible provider runtime, `node:test`, Playwright/browser screenshot verification when the desktop renderer is changed.

---

## Current Evidence

- Current branch is `master`, aligned with `origin/master` at `8c697f7`.
- Current desktop renderer is a monolithic `desktop/src/renderer/App.tsx` around 27KB.
- Current desktop AI behavior opens an external terminal through `launchDesktopAiSession`; it does not embed an interactive AI conversation in the right pane.
- Current desktop UI is a dashboard with tools/settings panels, not a Codex-like multi-conversation chat shell.
- Direct copy source snapshots are present under `vendor/upstream-agent-runtime-import/` and `vendor/upstream-terminal-ui-import/`.

## Copied CLI And Agent Mechanism Source Set

The copied upstream source snapshots include these CLI/agent mechanism families:

- Query and message loop: `query.ts`, `context.ts`, `services/api/claude.ts`, `utils/query*`, `utils/messages/*`, `utils/processUserInput/*`
- Tool runtime: `Tool.ts`, `tools/*Tool/*`, file read/write/edit, grep/glob, shell, todo, skill, plan-review, task tools
- Permissions and safety: `utils/permissions/*`, shell command validation, destructive-command warnings, read-only validation
- Subagents and tasks: `tools/AgentTool/*`, `tasks/LocalAgentTask/*`, `tasks/LocalShellTask/*`, `tasks/LocalMainSessionTask.ts`
- CLI display concepts: `screens/REPL.tsx`, `components/PromptInput/*`, `components/Messages.tsx`, `components/VirtualMessageList.tsx`, `components/Markdown.tsx`
- Agent and task activity: `components/AgentProgressLine.tsx`, `components/BashModeProgress.tsx`, `components/CompactSummary.tsx`, `components/CoordinatorAgentStatus.tsx`, `components/tasks/BackgroundTaskStatus.tsx`, `tasks/LocalAgentTask/*`, `tasks/RemoteAgentTask/*`, `tasks/LocalShellTask/*`, `tools/AgentTool/*`, `tools/Task*Tool/*`, `tools/TodoWriteTool/*`

The desktop visual system is not copied from the upstream terminal UI. It is designed in My-CLI's Electron/React renderer to match the Codex desktop screenshot and workflow.

## Non-Negotiable Exclusions

Do not port these into runtime:

- login/logout/OAuth/account detection
- telemetry, analytics, Statsig/GrowthBook, usage reporting
- billing, quota, pricing, entitlement, subscription checks
- Anthropic employee/internal commands
- remote bridge, mobile bridge, Chrome bridge, cloud teammate services
- arbitrary renderer shell access

## Task 1: Lock The Copied Reference Snapshot

**Files:**
- Create: `vendor/upstream-terminal-ui-import/README.md`
- Create: `vendor/upstream-terminal-ui-import/FILES.txt`
- Create: `vendor/upstream-agent-runtime-import/README.md`
- Create: `vendor/upstream-agent-runtime-import/FILES.txt`
- Create: `docs/superpowers/plans/2026-06-15-codex-parity-desktop-agent-rebuild.md`

- [ ] Verify copied files are outside the compile graph.

Run:

```powershell
npm run build
```

Expected:

```text
> coding-cli@0.6.15 build
> tsc
```

- [ ] Commit the snapshot and plan.

Run:

```powershell
git add vendor/upstream-terminal-ui-import vendor/upstream-agent-runtime-import docs/superpowers/plans/2026-06-15-codex-parity-desktop-agent-rebuild.md
git commit -m "docs(ai): import upstream agent runtime reference"
```

## Task 2: Reproduce And Measure Desktop Jank

**Files:**
- Create: `tests/desktop-performance.test.js`
- Create: `desktop/src/renderer/performance-fixtures.ts`

- [ ] Write a failing structural performance test.

The test should assert that the renderer no longer keeps all UI behavior in `App.tsx`, and that chat state, session rail, composer, and inspector are split into separate modules.

Expected initial failure: `desktop/src/renderer/codex-shell/*` does not exist.

- [ ] Add a browser smoke script or test fixture that renders at least 200 messages and checks the main thread does not do repeated full-shell work per keystroke.

Expected initial failure: there is no embedded composer or message list to measure.

## Task 3: Build Codex-Like Desktop Shell Modules

**Files:**
- Create: `desktop/src/renderer/codex-shell/types.ts`
- Create: `desktop/src/renderer/codex-shell/session-store.ts`
- Create: `desktop/src/renderer/codex-shell/SessionRail.tsx`
- Create: `desktop/src/renderer/codex-shell/ConversationView.tsx`
- Create: `desktop/src/renderer/codex-shell/MessageList.tsx`
- Create: `desktop/src/renderer/codex-shell/Composer.tsx`
- Create: `desktop/src/renderer/codex-shell/ActivityStrip.tsx`
- Create: `desktop/src/renderer/codex-shell/Inspector.tsx`
- Modify: `desktop/src/renderer/App.tsx`
- Modify: `desktop/src/renderer/styles.css`

- [ ] Implement a left rail with multiple local conversations.
- [ ] Implement a right conversation surface with user/assistant/tool/system rows.
- [ ] Implement a Codex-like composer with multiline input, attachment/skill/mode affordances, send button, and active mode pill.
- [ ] Replace plugin wording with skills wording.
- [ ] Keep cards at 8px radius or less and avoid nested cards.
- [ ] Keep text inside controls from overflowing at 1100px and 1440px widths.

## Task 4: Embed AI Conversation IPC Instead Of Opening External Terminal

**Files:**
- Create: `desktop/src/main/ai-session.ts`
- Modify: `desktop/src/main/main.ts`
- Modify: `desktop/src/preload/index.ts`
- Modify: `desktop/src/renderer/codex-shell/session-store.ts`
- Modify: `src/chat/agent/loop.ts`
- Modify: `src/chat/provider.ts`

- [ ] Add a desktop IPC channel that sends a user message to the existing provider-neutral agent loop.
- [ ] Stream assistant deltas, thinking/status events, tool calls, permission requests, and final messages back to the renderer.
- [ ] Keep renderer IPC whitelist-only; do not expose arbitrary shell.
- [ ] Reuse the existing permission engine so subagents cannot widen permissions.
- [ ] Preserve `hi --ai` terminal mode as a supported CLI entry point, but share the same message/tool loop.

## Task 5: Adapt Upstream Prompt And Message Patterns

**Files:**
- Create: `src/chat/ui/prompt-state.ts`
- Create: `src/chat/ui/message-render-model.ts`
- Modify: `src/chat/typeahead.ts`
- Modify: `src/chat/ui/layout.ts`
- Modify: `desktop/src/renderer/codex-shell/Composer.tsx`
- Modify: `desktop/src/renderer/codex-shell/MessageList.tsx`

- [ ] Adapt reference `PromptInput` ideas into My-CLI prompt state without importing Ink.
- [ ] Add keyboard behavior for Enter, Shift+Enter, Up/Down history, slash/typeahead, and escape/interrupt.
- [ ] Adapt message model from reference `Messages` and `VirtualMessageList` into browser-rendered rows.
- [ ] Add rich markdown rendering that handles code fences, tables, lists, links, and Chinese text.

## Task 6: Agent, Tools, Skills, Thinking, And Plan Review

**Files:**
- Modify: `src/chat/agent/loop.ts`
- Modify: `src/chat/agent/subagents.ts`
- Modify: `src/chat/tools/registry.ts`
- Modify: `desktop/src/renderer/codex-shell/ActivityStrip.tsx`
- Modify: `desktop/src/renderer/codex-shell/Inspector.tsx`

- [ ] Replace desktop plugin language with skills.
- [ ] Render thinking state, tool timeline, todo/status rows, subagent activity, and plan approval states.
- [ ] Add a plan review flow in the desktop UI that mirrors CLI `/plan` approval semantics.
- [ ] Keep forbidden account/telemetry/billing/remote bridge logic out.

## Task 7: Verification And Release

**Files:**
- Modify or add tests under `tests/`.
- Use browser/Playwright screenshots for desktop UI.

- [ ] Run:

```powershell
npm run build
node --test --test-concurrency=1 .\tests\*.test.js
npm run desktop:build
git diff --check
```

- [ ] Run desktop visual checks at desktop and narrow widths.
- [ ] Compare screenshots against the provided Codex reference image when available.
- [ ] Commit each completed phase on `master`.
- [ ] Push, merge if a branch was used, and update GitHub Release only after all gates pass.
