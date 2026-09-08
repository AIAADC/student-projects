# Execution Rounds

> For agentic workers: execute one round per AI interaction unless the user explicitly authorizes batching. Each round must end with local verification and a local commit.

For Cursor Claude Opus handoff, prefer the single-round files under `docs/plans/claude-code-parity-v2/rounds/`. This document is the full ordered master list; the `rounds/` files are copy-ready execution packets.

## Status

All rounds 0–18 are complete on branch `codex/ai-cli-claude-port` (2026-06-14). Final audit commit: `7a328e5` (`chore(ai): complete claude parity v2 audit`).

## Per-Round Handoff Files

- Round 00: `rounds/round-00-planning-pack-checkpoint.md`
- Round 01: `rounds/round-01-slash-command-registry-and-menu-parity.md`
- Round 02: `rounds/round-02-path-completion-and-unified-suggestions.md`
- Round 03: `rounds/round-03-utf8-and-terminal-glyph-repair.md`
- Round 04: `rounds/round-04-permission-dialog-deep-port.md`
- Round 05: `rounds/round-05-file-diff-and-edit-permission-ux.md`
- Round 06: `rounds/round-06-shell-and-powershell-safety-port.md`
- Round 07: `rounds/round-07-interrupt-and-exit-parity.md`
- Round 08: `rounds/round-08-query-engine-and-tool-pairing-discipline.md`
- Round 09: `rounds/round-09-plan-mode-approval-lifecycle.md`
- Round 10: `rounds/round-10-skills-runtime-split-and-search.md`
- Round 11: `rounds/round-11-agent-definitions-and-memory-snapshot.md`
- Round 12: `rounds/round-12-subagent-activity-timeline-and-scheduling.md`
- Round 13: `rounds/round-13-model-settings-metadata.md`
- Round 14: `rounds/round-14-terminal-ui-visual-parity.md`
- Round 15: `rounds/round-15-desktop-command-dashboard-hardening.md`
- Round 16: `rounds/round-16-desktop-visual-parity-and-ai-bridge.md`
- Round 17: `rounds/round-17-github-release-workflow-and-asset-verification.md`
- Round 18: `rounds/round-18-final-forbidden-port-audit-and-release-readiness.md`

## Round 0: Planning Pack Checkpoint

**Goal:** Commit this planning pack as the execution source of truth.

**Files:**

- Create: `docs/plans/claude-code-parity-v2/README.md`
- Create: `docs/plans/claude-code-parity-v2/00-global-spec.md`
- Create: `docs/plans/claude-code-parity-v2/01-current-state-and-gap-audit.md`
- Create: `docs/plans/claude-code-parity-v2/02-claude-source-transplant-map.md`
- Create: `docs/plans/claude-code-parity-v2/03-execution-rounds.md`
- Create: `docs/plans/claude-code-parity-v2/04-verification-and-handoff.md`

**Steps:**

- [x] Run `git status --short --branch`.
- [x] Run `git diff --check`.
- [x] Run `npm run build`.
- [x] Run `node --test --test-concurrency=1 .\tests\*.test.js`.
- [x] Commit only the new planning folder with `git commit -m "docs(ai): add claude parity v2 planning pack"`.

## Round 1: Slash Command Registry And Menu Parity

**Goal:** Make slash command definitions and `/` menu behavior closer to Claude Code while preserving current command execution.

**Claude sources:**

- `src/commands.ts`
- `src/types/command.ts`
- `src/components/PromptInput/PromptInputFooterSuggestions.tsx`
- `src/components/PromptInput/PromptInputHelpMenu.tsx`
- `src/components/PromptInput/PromptInputModeIndicator.tsx`

**My-CLI files:**

- Modify: `src/chat/commands.ts`
- Modify: `src/chat/typeahead.ts`
- Modify: `src/chat/ui/layout.ts`
- Test: `tests/ai-typeahead.test.js`
- Test: `tests/ai-ui.test.js`

**Required behavior:**

- Commands have stable IDs, aliases, argument hints, mode availability, source labels, and category labels.
- `/` menu groups commands in the order: Mode, Agent, Runtime, Skills, Help.
- Hidden commands never render.
- Canonical commands still execute when selected through aliases.
- Existing `/agent spawn`, `/model info`, `/skill`, and `/search` behavior remains intact.

**Verification:**

- `npm run build`
- `node --test tests/ai-typeahead.test.js tests/ai-ui.test.js`
- `node --test --test-concurrency=1 .\tests\*.test.js`

**Commit:** `feat(ai): port slash command menu shape`

## Round 2: Path Completion And Unified Suggestions

**Goal:** Add Claude-style path/file suggestions and merge command, path, skill, model, and agent suggestions through one source model.

**Claude sources:**

- `src/hooks/useUnifiedSuggestions.ts`
- `src/utils/suggestions/*`
- `src/components/ContextSuggestions.tsx`
- `src/components/GlobalSearchDialog.tsx`

**My-CLI files:**

- Create: `src/chat/suggestions.ts`
- Create: `src/chat/path-completion.ts`
- Modify: `src/chat/typeahead.ts`
- Modify: `src/chat/keybindings.ts`
- Test: `tests/ai-suggestions.test.js`
- Test: `tests/ai-path-completion.test.js`

**Required behavior:**

- Workspace-relative files are suggested without leaving the workspace root.
- Windows absolute paths are normalized and denied when outside root.
- Directories, files, slash commands, active skills, model IDs, and agent definitions expose a common suggestion item type.
- Suggestions are capped and ranked deterministically.
- Chinese file names survive read, render, and test assertions.

**Verification:**

- `npm run build`
- `node --test tests/ai-suggestions.test.js tests/ai-path-completion.test.js tests/ai-typeahead.test.js`
- `node --test --test-concurrency=1 .\tests\*.test.js`

**Commit:** `feat(ai): add unified prompt suggestions and path completion`

## Round 3: UTF-8 And Terminal Glyph Repair

**Goal:** Fix mojibake in current AI runtime messages and add a regression harness that protects Chinese text and terminal glyphs.

**Claude sources:**

- `src/components/design-system/KeyboardShortcutHint.tsx`
- `src/components/design-system/Byline.tsx`
- `src/components/InterruptedByUser.tsx`

**My-CLI files:**

- Modify: `src/chat/provider.ts`
- Modify: `src/chat/ui/layout.ts`
- Modify: `src/chat/typeahead.ts`
- Modify: `src/chat/terminal-ui.ts`
- Test: `tests/ai-utf8.test.js`
- Test: `tests/ai-ui.test.js`

**Required behavior:**

- Runtime Chinese messages are valid UTF-8.
- Rendered UI strings contain no replacement character and no known mojibake fragments.
- Terminal glyphs can be disabled or replaced by ASCII-safe fallbacks when output is not UTF-8 capable.
- Tests include at least one Chinese phrase and one Windows path with Chinese characters.

**Verification:**

- `npm run build`
- `node --test tests/ai-utf8.test.js tests/ai-ui.test.js tests/ai-typeahead.test.js`
- `node --test --test-concurrency=1 .\tests\*.test.js`

**Commit:** `fix(ai): protect utf8 terminal output`

## Round 4: Permission Dialog Deep Port

**Goal:** Port Claude Code permission option depth into the readline/chalk UI.

**Claude sources:**

- `src/components/permissions/PermissionDialog.tsx`
- `src/components/permissions/PermissionPrompt.tsx`
- `src/components/permissions/PermissionRequest.tsx`
- `src/components/permissions/FilePermissionDialog/permissionOptions.tsx`
- `src/components/permissions/FilePermissionDialog/usePermissionHandler.ts`
- `src/components/permissions/rules/RecentDenialsTab.tsx`

**My-CLI files:**

- Modify: `src/chat/permissions/engine.ts`
- Modify: `src/chat/permissions/prompts.ts`
- Modify: `src/chat/ui/layout.ts`
- Modify: `src/chat/index.ts`
- Test: `tests/ai-permissions.test.js`
- Test: `tests/ai-permission-dialog.test.js`

**Required behavior:**

- Permission options include allow once, allow for session, reject, reject with feedback, cancel.
- Session allow/deny rules can be path-prefix or command-prefix scoped.
- Recent denials are available for rendering.
- Plan mode still denies mutations.
- Chat mode remains read-only.

**Verification:**

- `npm run build`
- `node --test tests/ai-permissions.test.js tests/ai-permission-dialog.test.js`
- `node --test --test-concurrency=1 .\tests\*.test.js`

**Commit:** `feat(ai): port permission dialog options with recent denials tracking`

## Round 5: File Diff And Edit Permission UX

**Goal:** Make file writes/edit requests reviewable before approval.

**Claude sources:**

- `src/components/permissions/FileEditPermissionRequest/FileEditPermissionRequest.tsx`
- `src/components/permissions/FileWritePermissionRequest/FileWritePermissionRequest.tsx`
- `src/components/permissions/FileWritePermissionRequest/FileWriteToolDiff.tsx`
- `src/components/FileEditToolDiff.tsx`
- `src/components/FileEditToolUpdatedMessage.tsx`

**My-CLI files:**

- Modify: `src/chat/tools/fs-write.ts`
- Modify: `src/chat/tools/runner.ts`
- Modify: `src/chat/permissions/prompts.ts`
- Modify: `src/chat/ui/layout.ts`
- Test: `tests/ai-tools.test.js`
- Test: `tests/ai-permission-dialog.test.js`

**Required behavior:**

- Write tool computes added, removed, and changed line summary before approval.
- New file, overwrite, and edit operations have distinct labels.
- Rejected writes leave files unchanged.
- Approved writes preserve UTF-8.

**Verification:**

- `npm run build`
- `node --test tests/ai-tools.test.js tests/ai-permission-dialog.test.js`
- `node --test --test-concurrency=1 .\tests\*.test.js`

**Commit:** `feat(ai): show file change permission previews`

## Round 6: Shell And PowerShell Safety Port

**Goal:** Port the local shell safety shape without importing Claude account or sandbox dependencies.

**Claude sources:**

- `src/components/permissions/BashPermissionRequest/BashPermissionRequest.tsx`
- `src/components/permissions/BashPermissionRequest/bashToolUseOptions.tsx`
- `src/components/permissions/PowerShellPermissionRequest/PowerShellPermissionRequest.tsx`
- `src/components/permissions/PowerShellPermissionRequest/powershellToolUseOptions.tsx`
- `src/tools/PowerShellTool/powershellSecurity.ts`
- `src/tools/PowerShellTool/pathValidation.ts`
- `src/tools/PowerShellTool/gitSafety.ts`
- `src/tools/PowerShellTool/destructiveCommandWarning.ts`

**My-CLI files:**

- Modify: `src/chat/tools/shell.ts`
- Modify: `src/chat/tools/registry.ts`
- Modify: `src/chat/permissions/engine.ts`
- Modify: `src/chat/permissions/prompts.ts`
- Test: `tests/ai-tools.test.js`
- Test: `tests/ai-permissions.test.js`

**Required behavior:**

- Shell tool accepts executable plus args, not a raw shell string.
- Destructive command patterns require explicit approval even in agent mode.
- `--auto-accept` still denies workspace escape and known catastrophic commands.
- Git destructive commands require a warning reason.
- PowerShell command behavior respects Windows path semantics.

**Verification:**

- `npm run build`
- `node --test tests/ai-tools.test.js tests/ai-permissions.test.js`
- `node --test --test-concurrency=1 .\tests\*.test.js`

**Commit:** `feat(ai): harden shell tool permissions`

## Round 7: Interrupt And Exit Parity

**Goal:** Complete repeated interrupt behavior across prompts, menus, running tools, and subagents.

**Claude sources:**

- `src/cli/exit.ts`
- `src/interactiveHelpers.tsx`
- `src/components/InterruptedByUser.tsx`
- `src/components/tasks/AsyncAgentDetailDialog.tsx`

**My-CLI files:**

- Modify: `src/chat/interrupts.ts`
- Modify: `src/chat/keybindings.ts`
- Modify: `src/chat/typeahead.ts`
- Modify: `src/chat/index.ts`
- Modify: `src/chat/agent/subagents.ts`
- Test: `tests/ai-interrupts.test.js`
- Test: `tests/ai-keybindings.test.js`
- Test: `tests/ai-subagents.test.js`

**Required behavior:**

- First Ctrl+C/Esc cancels active model/tool/subagent work.
- Esc dismisses overlays before exit confirmation.
- Second interrupt within the confirmation window exits.
- Cancelled subagents report `cancelled` and preserve partial summary when available.

**Verification:**

- `npm run build`
- `node --test tests/ai-interrupts.test.js tests/ai-keybindings.test.js tests/ai-subagents.test.js`
- `node --test --test-concurrency=1 .\tests\*.test.js`

**Commit:** `feat(ai): complete interrupt confirmation flow`

## Round 8: Query Engine And Tool Pairing Discipline

**Goal:** Port Claude Code's message/tool loop discipline into the provider-neutral agent loop.

**Claude sources:**

- `src/query.ts`
- `src/QueryEngine.ts`
- `src/tools.ts`
- `src/Tool.ts`
- `src/services/tools/toolExecution.ts`
- `src/services/tools/toolOrchestration.ts`
- `src/services/tools/StreamingToolExecutor.ts`
- `src/utils/messages.js`

**My-CLI files:**

- Modify: `src/chat/agent/loop.ts`
- Modify: `src/chat/tools/runner.ts`
- Modify: `src/chat/tools/registry.ts`
- Modify: `src/chat/provider.ts`
- Test: `tests/ai-agent-loop.test.js`
- Test: `tests/ai-tool-loop.test.js`

**Required behavior:**

- Every assistant tool call receives exactly one tool result unless interrupted.
- Multiple tool calls preserve order.
- Malformed JSON arguments return a structured tool error.
- Unknown tools are denied and reported.
- Max tool rounds stop with a clear assistant message.
- Custom OpenAI-compatible providers receive tool specs when mode allows them.

**Verification:**

- `npm run build`
- `node --test tests/ai-agent-loop.test.js tests/ai-tool-loop.test.js`
- `node --test --test-concurrency=1 .\tests\*.test.js`

**Commit:** `feat(ai): enforce provider tool loop discipline`

## Round 9: Plan Mode Approval Lifecycle

**Goal:** Make `/plan` lifecycle robust enough for real execution handoff.

**Claude sources:**

- `src/commands/plan/index.ts`
- `src/commands/plan/plan.tsx`
- `src/tools/ExitPlanModeTool/ExitPlanModeV2Tool.ts`
- `src/tools/ExitPlanModeTool/prompt.ts`
- `src/components/permissions/ExitPlanModePermissionRequest/ExitPlanModePermissionRequest.tsx`

**My-CLI files:**

- Modify: `src/chat/modes.ts`
- Modify: `src/chat/agent/loop.ts`
- Modify: `src/chat/plan-store.ts`
- Modify: `src/chat/ui/layout.ts`
- Modify: `src/chat/index.ts`
- Test: `tests/ai-modes.test.js`
- Test: `tests/ai-agent-loop.test.js`
- Test: `tests/ai-ui.test.js`

**Required behavior:**

- `/plan <task>` stores a plan draft path.
- `exit_plan_mode` shows a review panel.
- Approval switches to agent mode.
- Rejection stays in plan mode.
- Existing plan can be opened with `/plan open`.
- Plan permission requests are listed and do not grant permissions automatically.

**Verification:**

- `npm run build`
- `node --test tests/ai-modes.test.js tests/ai-agent-loop.test.js tests/ai-ui.test.js`
- `node --test --test-concurrency=1 .\tests\*.test.js`

**Commit:** `feat(ai): harden plan approval lifecycle`

## Round 10: Skills Runtime Split And Search

**Goal:** Split skills into focused modules and port Claude Code search/metadata behavior.

**Claude sources:**

- `src/skills/loadSkillsDir.ts`
- `src/skills/bundledSkills.ts`
- `src/services/skillSearch/*`
- `src/commands/skills/index.js`
- `src/tools/SkillTool/SkillTool.ts`
- `src/tools/SkillTool/prompt.ts`

**My-CLI files:**

- Create: `src/chat/skills/discovery.ts`
- Create: `src/chat/skills/frontmatter.ts`
- Create: `src/chat/skills/runtime.ts`
- Create: `src/chat/skills/search.ts`
- Create: `src/chat/skills/format.ts`
- Modify: `src/chat/skills.ts`
- Modify: `src/chat/commands.ts`
- Test: `tests/ai-skills-runtime.test.js`
- Test: `tests/skills-registry.test.js`

**Required behavior:**

- Metadata discovery reads only a prefix.
- Full content loads on demand.
- Frontmatter supports known fields used by local skills.
- Search ranks ID, name, description, and trigger text.
- Active skill context remains user-role contextual material.
- Chinese SKILL.md content is preserved.

**Verification:**

- `npm run build`
- `node --test tests/ai-skills-runtime.test.js tests/skills-registry.test.js`
- `node --test --test-concurrency=1 .\tests\*.test.js`

**Commit:** `feat(ai): split and search runtime skills`

## Round 11: Agent Definitions And Memory Snapshot

**Goal:** Port built-in/local agent definition loading and parent context snapshots.

**Claude sources:**

- `src/tools/AgentTool/loadAgentsDir.ts`
- `src/tools/AgentTool/builtInAgents.ts`
- `src/tools/AgentTool/agentMemory.ts`
- `src/tools/AgentTool/agentMemorySnapshot.ts`
- `src/tools/AgentTool/built-in/generalPurposeAgent.ts`
- `src/tools/AgentTool/built-in/exploreAgent.ts`
- `src/tools/AgentTool/built-in/planAgent.ts`
- `src/tools/AgentTool/built-in/verificationAgent.ts`

**My-CLI files:**

- Modify: `src/chat/agent/definitions.ts`
- Modify: `src/chat/agent/prompt.ts`
- Modify: `src/chat/agent/types.ts`
- Modify: `src/chat/commands.ts`
- Test: `tests/ai-subagents.test.js`

**Required behavior:**

- Built-in agents have stable IDs, descriptions, default tools, and default permission narrowing.
- Local agent definition discovery supports project and user roots.
- Subagent prompt includes parent mode, model, plan file, active skills, and relevant recent messages.
- No subagent can widen parent permission.

**Verification:**

- `npm run build`
- `node --test tests/ai-subagents.test.js`
- `node --test --test-concurrency=1 .\tests\*.test.js`

**Commit:** `feat(ai): port local agent definition loading`

## Round 12: Subagent Activity Timeline And Scheduling

**Goal:** Make subagents visible and controllable during ordinary agent conversations.

**Claude sources:**

- `src/tasks/LocalAgentTask/LocalAgentTask.tsx`
- `src/tasks/types.ts`
- `src/tasks/stopTask.ts`
- `src/components/tasks/AsyncAgentDetailDialog.tsx`
- `src/components/tasks/renderToolActivity.js`
- `src/components/tasks/taskStatusUtils.js`
- `src/tools/AgentTool/agentDisplay.ts`
- `src/tools/AgentTool/runAgent.ts`

**My-CLI files:**

- Modify: `src/chat/agent/subagents.ts`
- Modify: `src/chat/agent/runner.ts`
- Modify: `src/chat/agent/loop.ts`
- Modify: `src/chat/ui/layout.ts`
- Modify: `src/chat/index.ts`
- Test: `tests/ai-subagents.test.js`
- Test: `tests/ai-agent-loop.test.js`
- Test: `tests/ai-ui.test.js`

**Required behavior:**

- Parent timeline renders queued, running, completed, failed, and cancelled subagent rows.
- Scheduler supports a configured concurrency of one by default and a tested path for higher concurrency.
- Cancellation propagates to running work when possible.
- Subagent results include summary, notes, tool count, permission count, and elapsed time.

**Verification:**

- `npm run build`
- `node --test tests/ai-subagents.test.js tests/ai-agent-loop.test.js tests/ai-ui.test.js`
- `node --test --test-concurrency=1 .\tests\*.test.js`

**Commit:** `feat(ai): render subagent activity timeline`

## Round 13: Model Settings Metadata

**Goal:** Make `/setting`, `/model`, and `/model info` robust enough for multiple custom model IDs.

**Claude sources:**

- `src/commands/model/index.js`
- `src/tools/ConfigTool/*`
- `src/components/InvalidSettingsDialog.tsx`
- `src/components/InvalidConfigDialog.tsx`

**My-CLI files:**

- Modify: `src/chat/config.ts`
- Modify: `src/chat/models.ts`
- Modify: `src/chat/commands.ts`
- Modify: `src/chat/index.ts`
- Modify: `.env.example`
- Test: `tests/ai-settings.test.js`
- Test: `tests/ai-config.test.js`

**Required behavior:**

- `/setting` writes base URL, masked API key, model list, and active model.
- Model IDs entered with English commas become selectable.
- `/model` shows configured choices.
- `/model info` shows context length, tool support, multimodal support, provider, and source.
- `.env` writes preserve unrelated keys and Chinese content.

**Verification:**

- `npm run build`
- `node --test tests/ai-settings.test.js tests/ai-config.test.js`
- `node --test --test-concurrency=1 .\tests\*.test.js`

**Commit:** `feat(ai): enrich model settings metadata`

## Round 14: Terminal UI Visual Parity

**Goal:** Make terminal output feel intentionally Claude Code-inspired while keeping My-CLI identity.

**Claude sources:**

- `src/components/design-system/Dialog.tsx`
- `src/components/design-system/Byline.tsx`
- `src/components/design-system/KeyboardShortcutHint.tsx`
- `src/components/design-system/Divider.tsx`
- `src/components/messages/*`
- `src/components/Spinner/*`
- `src/components/CompactSummary.tsx`

**My-CLI files:**

- Modify: `src/chat/ui/theme.ts`
- Modify: `src/chat/ui/layout.ts`
- Modify: `src/chat/terminal-ui.ts`
- Modify: `src/chat/stream-renderer.ts`
- Modify: `src/chat/spinner.ts`
- Modify: `src/chat/markdown.ts`
- Test: `tests/ai-ui.test.js`
- Test: `tests/ai-prompt.test.js`

**Required behavior:**

- Header, byline, timeline, permission boxes, plan approval, and final answers use one consistent visual grammar.
- No decorative clutter or marketing-like panels.
- Visible width tests prevent overflow.
- Output works with colors enabled and disabled.

**Verification:**

- `npm run build`
- `node --test tests/ai-ui.test.js tests/ai-prompt.test.js`
- `node --test --test-concurrency=1 .\tests\*.test.js`

**Commit:** `feat(ai): polish claude inspired terminal ui`

## Round 15: Desktop Command Dashboard Hardening

**Goal:** Keep the desktop command surface real, safe, and non-hanging.

**Claude/Codex references:**

- Existing My-CLI desktop under `desktop/**`.
- Claude prompt/layout components for visual density.

**My-CLI files:**

- Modify: `desktop/src/renderer/App.tsx`
- Modify: `desktop/src/renderer/styles.css`
- Modify: `desktop/src/renderer/action-catalog.ts`
- Modify: `desktop/src/main/cli-runner.ts`
- Modify: `desktop/src/main/permissions.ts`
- Modify: `desktop/src/preload/index.ts`
- Test: `tests/desktop-actions.test.js`
- Test: `tests/desktop-config.test.js`

**Required behavior:**

- Buttons cover `hi --clear`, `hi --skills`, `hi --install`, `hi --state`, `hi --api`, `hi --pay`.
- Clear, skills, and install use native panels with explicit confirmation.
- IPC whitelist denies arbitrary commands.
- Command output is visible and copyable.
- Renderer does not hang on interactive CLI actions.

**Verification:**

- `npm run build`
- `node --test tests/desktop-actions.test.js tests/desktop-config.test.js`
- `npm run desktop:build`
- `node --test --test-concurrency=1 .\tests\*.test.js`

**Commit:** `feat(desktop): harden command dashboard`

## Round 16: Desktop Visual Parity And AI Bridge

**Goal:** Move desktop from command dashboard toward a usable AI shell without breaking safety.

**Claude/Codex references:**

- Claude Code prompt/input and desktop handoff patterns.
- Codex-like layout direction requested by the user.

**My-CLI files:**

- Modify: `desktop/src/renderer/App.tsx`
- Modify: `desktop/src/renderer/styles.css`
- Modify: `desktop/src/main/main.ts`
- Modify: `desktop/src/main/cli-runner.ts`
- Modify: `desktop/src/preload/index.ts`
- Test: `tests/desktop-actions.test.js`
- Test: `tests/desktop-config.test.js`

**Required behavior:**

- Left rail, conversation surface, inspector, and composer are visually balanced.
- Mode switch mirrors CLI modes.
- Settings panel can launch safe config flows or explain CLI `/setting`.
- AI bridge does not expose raw shell.
- Any interactive AI session launch is isolated from noninteractive dashboard commands.

**Verification:**

- `npm run build`
- `node --test tests/desktop-actions.test.js tests/desktop-config.test.js`
- `npm run desktop:build`

**Commit:** `feat(desktop): polish ai shell layout`

## Round 17: GitHub Release Workflow And Asset Verification

**Goal:** Prove desktop builds are attached to GitHub Releases, not only local artifacts.

**My-CLI files:**

- Modify: `.github/workflows/desktop-release.yml`
- Modify: `desktop/scripts/copy-cli.cjs`
- Modify: `desktop/electron-builder.yml`
- Modify: `docs/updates/CHANGELOG.md`
- Test: `tests/desktop-release-assets.test.js`

**Required behavior:**

- Workflow uses repo-appropriate dependency install behavior.
- Windows and macOS jobs produce desktop artifacts.
- Release events attach packaged assets to the release page.
- Manual runs still upload workflow artifacts.
- Release panel can read latest release assets.

**Verification:**

- `npm run build`
- `node --test tests/desktop-release-assets.test.js`
- `npm run desktop:build`
- `gh release view` when authenticated and release state matters.

**Commit:** `ci(desktop): verify release asset publishing`

## Round 18: Final Forbidden-Port Audit And Release Readiness

**Goal:** Close the V2 push with proof that My-CLI is provider-neutral, locally safe, and release-ready.

**Files:**

- Modify docs only if implementation behavior changed.
- Do not refactor runtime code in this round except for audit fixes discovered by tests.

**Required audit:**

- Forbidden categories scan.
- Test and build matrix.
- Desktop build.
- Release workflow inspection.
- Local `hi` wrapper resolution check if shell behavior differs from built source.
- README and Chinese README consistency check.

**Verification:**

- `git status --short --branch`
- `git diff --check`
- `npm run build`
- `node --test --test-concurrency=1 .\tests\*.test.js`
- `npm run desktop:build`
- `rg -n "telemetry|analytics|OpenTelemetry|Statsig|GrowthBook|login|logout|oauth|subscription|billing|entitlement|account" src desktop tests docs`
- `Get-Command hi -All`
- `where.exe hi`

**Commit:** `chore(ai): complete claude parity v2 audit`
