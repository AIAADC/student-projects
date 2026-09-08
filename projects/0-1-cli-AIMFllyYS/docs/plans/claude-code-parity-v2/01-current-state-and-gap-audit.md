# Current State And Gap Audit

Audit date: 2026-06-14.

## V2 Execution Status

- Branch: `codex/ai-cli-claude-port`
- Package version: `0.6.15`
- Rounds 0–18: **complete** (final audit commit `7a328e5`)
- This document mixes a pre-V2 baseline inventory with post-V2 remaining gaps. See `README.md` and `03-execution-rounds.md` for round completion status.

## Verified Repository State

- Branch: `codex/ai-cli-claude-port`.
- Current untracked files at audit time: `AGENTS.md`, `tmp_input.txt`.
- AI test files include config, modes, permissions, permission dialog, prompt, tools, tool loop, agent loop, skills runtime, subagents, keybindings, typeahead, suggestions, path completion, utf8, interrupts, UI, settings, desktop actions, desktop config, and desktop release assets.
- Current root package already has:
  - `build`
  - `desktop:install`
  - `desktop:build`
  - `desktop:dist:win`
  - `desktop:dist:mac`

Recent completed commits show that the branch already contains the pre-V2 baseline plus the full V2 round series (`docs(ai): add claude parity v2 planning pack` through `chore(ai): complete claude parity v2 audit`), including:

- Slash command metadata, grouped `/` menu, and menu shape port (Round 1).
- Unified suggestions and path completion (Round 2).
- UTF-8 terminal output protection (Round 3).
- Permission dialog options with recent denials (Round 4).
- File change permission previews (Round 5).
- Shell and PowerShell safety hardening (Round 6).
- Interrupt and exit confirmation flow (Round 7).
- Provider tool loop discipline (Round 8).
- Plan approval lifecycle hardening (Round 9).
- Skills runtime split and search (Round 10).
- Local agent definitions and memory snapshots (Round 11).
- Subagent activity timeline and scheduling (Round 12).
- Model settings metadata (Round 13).
- Terminal UI visual polish (Round 14).
- Desktop command dashboard hardening (Round 15).
- Desktop visual parity and AI bridge shell (Round 16).
- GitHub release workflow and asset verification (Round 17).
- Final forbidden-port audit (Round 18).

## Implemented Runtime Surfaces

### Commands

`src/chat/commands.ts` already defines:

- `/chat`
- `/agent`
- `/plan`
- `/plan open`
- `/agent spawn <task>`
- `/agent list`
- `/agent cancel <id>`
- `/setting`
- `/model`
- `/model info`
- `/skills`
- `/skill <id|name>`
- `/search <query>`
- `/clear`
- `/help`
- `/exit`

Gap (remaining after V2):

- Command catalog is still smaller than Claude Code's full metadata surface.
- Plugin/skill command injection and richer help-menu grouping remain future work.
- Round 1 landed stable IDs, aliases, categories, and grouped `/` menu rendering.

### Typeahead And Keybindings

`src/chat/typeahead.ts` already implements:

- Slash suggestions.
- Alias matching.
- Mid-input slash completion.
- Visible command rendering.
- Selection movement.
- Prompt-level key handling.

Gap (remaining after V2):

- Command-help integration and footer hint density can still move closer to Claude Code.
- Rounds 2, 3, and 14 landed unified suggestions, path completion, UTF-8-safe glyphs, and terminal visual polish.

### Session Modes

`src/chat/session.ts` already supports:

- `chat`, `agent`, `plan`.
- `ask`, `bypass`, `plan`.
- Active model.
- Active skill IDs.
- Current plan and plan file path.
- Subagent queue reference.

Gap (remaining after V2):

- Keep mode prompt contracts aligned when new tools are added.
- Round 9 added rejection, approval, `/plan open`, and plan review panel coverage in tests.

### Permissions

`src/chat/permissions/engine.ts` already supports:

- Workspace path resolution.
- Dangerous path denial.
- Read allow.
- Chat write denial.
- Plan write denial.
- Agent ask/bypass.
- Session allow/deny tools and rules.

Gap (remaining after V2):

- Readline/chalk UI will stay structurally flatter than Claude Code's Ink permission dialogs.
- Rounds 4–6 landed allow-once/session, reject-with-feedback, recent denials, file diff previews, and shell/PowerShell safety panels.

### Provider And Tool Loop

`src/chat/provider.ts` already supports:

- Custom OpenAI-compatible base URL.
- API key.
- Model override.
- Streaming and non-streaming calls.
- Tool specs for custom provider and Zhipu.

`src/chat/agent/loop.ts` already supports:

- Tool call rounds.
- Permission-required result.
- Plan-approval-required result.
- Agent task delegation hook.

Gap (remaining after V2):

- Tool specs attach for custom OpenAI-compatible providers and Zhipu; DeepSeek intentionally stays off in `shouldAttachProviderTools` (see `tests/ai-tool-loop.test.js`).
- Rounds 3 and 8 fixed UTF-8 provider messages and tool pairing / malformed-call handling.

### Skills

`src/chat/skills.ts` and `src/chat/skills/**` already support:

- Skill root discovery.
- `SKILL.md` detection.
- Metadata preview reads.
- On-demand content loading.
- Active skill prompt context.
- UTF-8 read path.
- Search ranking across ID, name, description, and trigger text.

Gap (remaining after V2):

- Dynamic skill slash command injection is not yet modeled.
- Round 10 split discovery, frontmatter, runtime, format, and search into focused modules.

### Subagents

`src/chat/agent/**` already supports:

- Queue creation.
- Enqueue, list, cancel, run next.
- Parent permission narrowing.
- Scoped tool specs.
- Prompt building.
- Built-in agent definitions.
- Task tool integration.

Gap (remaining after V2):

- Default concurrency remains 1; higher concurrency is tested but not tuned for production workloads.
- Deeper Claude Code remote agent memory ports remain out of scope.
- Rounds 11–12 landed built-in/local definitions, parent snapshots, timeline rows, and cancellation propagation tests.

### Terminal UI

`src/chat/ui/layout.ts` already supports:

- Status header.
- Mode pill.
- Permission box.
- Plan approval panel.
- Timeline entry.

Gap (remaining after V2):

- Terminal output can still drift from Ink-level Claude Code polish over time.
- Snapshot tests should stay focused on width and replacement-character absence rather than color brittleness.
- Rounds 3 and 14 repaired mojibake and unified header/byline/timeline/spinner grammar.

### Desktop

`desktop/src/renderer/App.tsx` already has:

- Left sidebar.
- Main conversation area.
- Right inspector tabs.
- Tools panel.
- Native clear/install/skills panels.
- Settings release panel.

`desktop/src/renderer/action-catalog.ts` already lists:

- `hi --clear`
- `hi --skills`
- `hi --install`
- `hi --state`
- `hi --api`
- `hi --pay`

Gap (remaining after V2):

- Desktop composer launches an isolated AI terminal session; it is not yet a fully embedded in-app streaming chat client.
- Rounds 15–17 landed dashboard hardening, Codex-like shell layout, release workflow verification, and release asset tests.
- IPC remains whitelist-only and noninteractive for dashboard commands.

## Risk Register

### P0 Risks

- Accidentally porting login, telemetry, account, billing, or Anthropic internal code.
- `--auto-accept` allowing writes outside the workspace.
- Desktop IPC running interactive or unbounded commands that hang the renderer.
- Provider tool-call pairing drift causing malformed model/tool messages.
- UTF-8 damage to Chinese docs, prompts, or runtime messages.

### P1 Risks

- Rebuilding from scratch instead of copying Claude Code structure.
- Over-broad refactors that touch unrelated CLI modules.
- Slash menu looks better but stops executing canonical commands.
- Skills content becomes trusted instruction instead of contextual reference.
- Subagents can widen parent permission.
- Desktop release attachment is covered by Round 17; keep verifying on each release.

### P2 Risks

- UI snapshot tests become too brittle around terminal colors.
- Model metadata stays hand-curated and drifts.
- Path completion gets slow on large repos.
- Desktop visual polish hides command output needed for debugging.

## Post-V2 Next Move

V2 is complete. Do not re-run Round 0–18 unless regression fixes are needed. For follow-up work, pick a remaining gap above or start a new planning pack. Commit `AGENTS.md` separately if the user wants it tracked in git.
