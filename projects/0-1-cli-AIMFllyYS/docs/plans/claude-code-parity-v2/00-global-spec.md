# Global Spec: Claude Code Parity V2

## Product Objective

`hi --ai` should feel like a compact Claude Code-style coding assistant:

- `/chat` is read-only and can inspect code, search files, and explain.
- `/agent` can use tools with visible permission control.
- `/plan` drafts implementation plans, calls an approval tool, and only proceeds after user approval.
- `--auto-accept` behaves like a dangerous skip-permissions mode for local development.
- Skills and subagents are first-class runtime features during ordinary conversation.
- The desktop app exposes real My-CLI commands and the latest GitHub release assets.

The key direction is copy-first, then prune: inspect Claude Code source, port the useful shape, then remove account, telemetry, login, billing, remote bridge, and Anthropic-only behavior.

## Hard Non-Goals

Never port these categories into My-CLI:

- Login, logout, OAuth refresh, account detection, subscription checks.
- Telemetry, OpenTelemetry, analytics, usage reporting, Statsig, GrowthBook.
- Anthropic employee-only commands, internal agents platform, org allowlists.
- Billing, quota, pricing, entitlement, trusted-device flows.
- Remote bridge, CCR, Chrome bridge, mobile bridge, cloud teammate services.
- Any feature that sends local user/project metadata to Anthropic or another vendor without direct user request.

## Current Branch Contract

Work starts from:

- Repo: `D:\new_project\My-CLI`
- Branch: `codex/ai-cli-claude-port`
- Claude Code source: `D:\project\MCP-Skills\ClaudeCode-Collection\ClaudeCode-Collection\claude-code-source`

Respect the current repository split:

- `src/index.ts`: CLI command routing.
- `src/chat/index.ts`: interactive AI loop.
- `src/chat/session.ts`: mode, permission, model, plan, skills, subagent session state.
- `src/chat/commands.ts`: slash command registry and parsing.
- `src/chat/typeahead.ts`, `src/chat/keybindings.ts`, `src/chat/suggestions.ts`, and `src/chat/path-completion.ts`: prompt suggestions and keyboard routing.
- `src/chat/interrupts.ts`: Ctrl+C / Esc interrupt state machine.
- `src/chat/provider.ts`: provider-neutral OpenAI-compatible chat completion.
- `src/chat/tools/**`: provider tool registry, read/write/shell runners.
- `src/chat/permissions/**`: permission state and prompts.
- `src/chat/agent/**`: local subagent queue, runner, prompt contracts, definitions.
- `src/chat/skills.ts` and `src/chat/skills/**`: skills discovery, frontmatter, runtime, search, and formatting.
- `src/chat/ui/**`, `src/chat/terminal-ui.ts`, `src/chat/stream-renderer.ts`, `src/chat/spinner.ts`: terminal rendering.
- `desktop/**`: Electron desktop shell, safe IPC adapters, command dashboards, release assets.

## Required User Experience

### CLI Conversation

The first viewport of `hi --ai` should show:

- Project name.
- Active mode.
- Permission mode.
- Active model.
- Active skills count.
- Running subagent count.
- A short keyboard hint row.

The input loop must support:

- `/` menu with grouped slash command suggestions.
- Mid-input slash completion.
- Esc to dismiss menus or go back before exit confirmation.
- Ctrl+C and Esc repeated-confirmation behavior.
- First interrupt cancels foreground model/tool/subagent work when something is running.

### Modes

`/chat`:

- May list, read, search, and explain code.
- Must deny write, shell, and destructive tools.
- Must still allow skills as contextual reference.

`/agent`:

- May request write/shell/subagent tools.
- Must show permission UI unless `--auto-accept` is active.
- Must keep parent permission narrowing for subagents.

`/plan`:

- May inspect code.
- Must not write files or run mutating shell commands.
- Must call the plan approval tool before execution.
- On approval, switches to agent mode.
- On rejection, stays in plan mode with the plan still visible.

### Settings And Models

`/setting` must collect and persist:

- Base URL.
- API key.
- One or more model IDs, separated by English commas.
- Active model ID.

`/model` must switch among configured model IDs.

`/model info` must display model metadata:

- Context length when known.
- Tool support.
- Vision or multimodal support when known.
- Provider source: built-in or custom.
- Whether the active provider is OpenAI-compatible.

API keys must be masked in all display paths.

### Skills

Skills are contextual references, not higher-priority executable instructions.

Runtime discovery must:

- Index `name`, `description`, trigger metadata, and source path.
- Load full `SKILL.md` only on demand.
- Preserve UTF-8 Chinese content.
- Support local project, My-CLI user, Codex, Claude, and configured roots.

### Subagents

Subagents must:

- Be available in ordinary agent conversations.
- Inherit model, plan, skill context, and workspace root.
- Narrow permissions relative to parent.
- Report queued, running, completed, failed, and cancelled states.
- Surface activity summaries in the parent timeline.

### Desktop

The desktop app must remain safe and practical first:

- Real command buttons for `hi --clear`, `hi --skills`, `hi --install`, `hi --state`, `hi --api`, `hi --pay`.
- Command execution through whitelisted IPC only.
- Interactive or destructive actions must use native panels with explicit confirmation.
- Release panel must read the real latest GitHub release and expose downloadable assets.

The visual direction is Claude/Codex-like:

- Left sessions/navigation rail.
- Center conversation/work surface.
- Right inspector with Plan, Tools, Diff, Preview, Settings.
- Bottom prompt/composer.
- Quiet dense UI, no marketing landing page.

## Global Definition Of Done

The full V2 push is complete only when:

- All execution rounds in `03-execution-rounds.md` are checked off in commits.
- `node --test --test-concurrency=1 .\tests\*.test.js` passes.
- `npm run build` passes.
- `npm run desktop:build` passes when desktop dependencies are installed.
- `git diff --check` is clean or only reports known CRLF warnings.
- Forbidden-port scan has no runtime account/telemetry/login residue.
- The desktop release workflow can build Windows and macOS assets.
- Current branch has one local commit per completed phase.
