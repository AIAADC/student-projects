# AI CLI And Desktop Upgrade Design

## Goal

Upgrade `hi --ai` from a read-only chat helper into a Claude Code-inspired local coding assistant for 0-1 CLI, while preserving UTF-8 text, avoiding telemetry/account logic, and adding a desktop app that can be packaged for Windows and macOS.

This design covers:

- A better terminal AI interface with Claude Code-like structure and a 0-1 CLI visual identity.
- `/chat`, `/agent`, and `/plan` modes inside AI conversation.
- Multi-confirm interrupt behavior for `Ctrl+C` and `Esc`.
- Permission prompts by default, plus `hi --ai --auto-accept` for an explicit bypass mode.
- `/setting` for URL, API key, and comma-separated model IDs saved to `.env`.
- `/model` switching across configured model IDs.
- Skills discovery and runtime loading.
- Local subagent support during normal conversations.
- A first desktop app using Electron and electron-builder.

## Current State

The project already has a lightweight chat runtime under `src/chat`:

- `src/index.ts` routes `hi --chat` and `hi --ai` to `startChat()`.
- `src/chat/index.ts` implements a readline loop, slash commands, direct read-only tool commands, web search, and streaming responses.
- `src/chat/provider.ts` supports DeepSeek, Zhipu, and OpenAI-compatible overrides through `AI_BASE_URL`, `AI_API_KEY`, and `AI_MODEL`.
- `src/chat/tools.ts` supports manual `ls`, `read`, and `grep` style commands, but not model-driven tool calls.
- `src/modules/skills` is an installer/marketplace, not a runtime skills system.

Main gaps:

- No permission engine.
- No agent, plan, or chat mode state machine.
- No model-driven tool loop.
- No subagent queue.
- No `/setting`.
- No multiple configured model IDs.
- No desktop app.
- Some command/help text and docs still mention older model names.

## Claude Code Reference Boundary

Reference source:

`D:\project\MCP-Skills\ClaudeCode-Collection\ClaudeCode-Collection\claude-code-source`

Useful patterns to borrow:

- Permission request flow: one shared confirmation shape for tool use, edits, shell commands, and rechecks.
- Permission modes: default ask, accept edits, plan, bypass permissions, and explicit transitions between modes.
- Interrupt handling: first interrupt cancels active work or asks for confirmation; repeated interrupt exits or stops background work.
- Plan mode as session state, not a one-off command.
- Agent tool boundaries: each agent gets allowed tools, disallowed tools, model, permission mode, skills, and isolation rules.
- Skills loading: index only frontmatter and descriptions up front, then load full `SKILL.md` content on demand.
- Model command behavior: `/model`, `/model info`, and `/model <id>` should all be supported.

Do not copy or recreate:

- Login, OAuth, subscription, account-type, organization allowlist, or user-detection logic.
- Analytics, telemetry, feature gate, usage reporting, growthbook/statsig, or Anthropic data upload.
- Anthropic-only pricing, model entitlement, billing, or quota logic.
- Remote managed agents, internal swarm/team systems, CCR, Chrome bridge, IDE bridge, or enterprise policy logic.
- Large bundled React/Ink internals that do not fit the current Commander/readline/chalk architecture.

## Architecture

Keep `src/index.ts` as a command router and move AI behavior into focused modules:

```text
src/chat/
  index.ts                 # thin AI entrypoint
  session.ts               # session state and message history
  modes.ts                 # chat / agent / plan mode transitions
  interrupts.ts            # Ctrl+C and Esc confirmation controller
  commands.ts              # slash command parsing and dispatch
  settings.ts              # /setting .env update flow
  models.ts                # configured model registry and /model helpers
  provider.ts              # HTTP/SSE provider calls
  permissions/
    engine.ts              # allow / ask / deny decisions
    prompts.ts             # confirmation UI
    rules.ts               # default rules and session rules
  tools/
    registry.ts            # tool definitions and schemas
    fs-read.ts             # list/read/search tools
    fs-write.ts            # write/edit tools for agent mode
    shell.ts               # command execution with permissions
  agent/
    types.ts               # agent definitions and results
    runner.ts              # local agent execution loop
    subagents.ts           # subagent queue and structured summaries
  skills/
    discovery.ts           # find skill roots and SKILL.md files
    frontmatter.ts         # parse frontmatter safely
    runtime.ts             # load selected skill content on demand
  ui/
    layout.ts              # terminal sections and status lines
    stream.ts              # Claude Code-like streaming renderer
    theme.ts               # 0-1 CLI colors and symbols
```

The first implementation may keep some existing files and gradually move logic, but new behavior should use these boundaries.

## Modes

### Chat Mode

`/chat` is the safe default for reading and explaining code.

Allowed by default:

- List files.
- Read files.
- Search files.
- Web search if configured.
- Load skill descriptions.

Denied by default:

- Write/edit/delete files.
- Run arbitrary shell commands.
- Install packages.
- Modify `.env`.
- Spawn subagents that can write.

### Agent Mode

`/agent` enables Claude Code-like task execution.

Allowed with confirmation by default:

- Write and edit files.
- Run shell commands.
- Install packages.
- Update config files.
- Invoke skills that require tools.
- Spawn local subagents.

`hi --ai --auto-accept` starts agent mode with a bypass-like permission mode. Bypass mode still respects hard deny rules for secrets, destructive filesystem actions outside the workspace, and explicit user-denied operations.

### Plan Mode

`/plan` explores and plans without editing source files.

Allowed:

- Read/search/list.
- Run safe inspection commands when approved.
- Build an implementation plan.

Denied:

- Source edits.
- Destructive commands.
- Package installation.

Plan mode can produce a plan artifact, then the user can switch to `/agent` to execute it.

## Permission Engine

The permission engine returns:

- `allow`
- `ask`
- `deny`

Inputs:

- Current mode.
- Permission mode.
- Tool name.
- Tool input.
- Workspace root.
- Active skill.
- Active subagent.
- Session allow/deny memory.

Default behavior:

- `hi --ai`: ask for edits, shell commands, `.env` writes, installs, network-changing actions, and subagent write access.
- `hi --ai --auto-accept`: allow most agent actions but still deny hard-dangerous operations.
- `/chat`: deny writes and shell execution.
- `/plan`: deny writes and package installs.

Confirmation UI should support:

- Yes once.
- Yes for session.
- No.
- No with feedback.
- Abort current action.

## Interrupts

`Ctrl+C` and `Esc` must not immediately exit on first press.

Rules:

- If a model response or tool is running, first interrupt cancels that operation.
- If no operation is running, first interrupt shows an exit confirmation hint.
- A second interrupt inside a short window exits the AI session.
- In a sub-menu, `Esc` first returns to the previous prompt.
- Background subagents require a second confirmation before stop.

## Settings And Models

`/setting` prompts in order:

1. Base URL.
2. API Key.
3. Model IDs.

Model IDs are comma-separated and saved to `.env`.

Recommended environment keys:

```text
AI_BASE_URL=
AI_API_KEY=
AI_MODELS=
AI_MODEL=
```

`AI_MODELS` stores the available list. `AI_MODEL` stores the active default.

`/model` behavior:

- `/model` opens a selector from `AI_MODELS` plus built-in defaults.
- `/model <id>` switches directly if available.
- `/model info` prints active model, provider URL, context metadata if known, and capability guesses.

Model metadata can start conservative:

- Context length: unknown unless registered.
- Modalities: text by default.
- Tool support: enabled only for OpenAI-compatible tool call responses that the provider can parse.

## Skills Runtime

Skills support has two layers:

- Existing marketplace/install flow remains under `src/modules/skills`.
- Runtime skills for `hi --ai` live under `src/chat/skills`.

Runtime discovery sources:

- Project-local `.0-1-cli/skills`.
- User global `.0-1-cli/skills`.
- Codex skills under `.codex/skills`.
- Claude skills under `.claude/skills`.

The runtime should:

- Read `SKILL.md` as UTF-8.
- Parse frontmatter when present.
- Index only name, description, and trigger metadata initially.
- Load full skill content only when selected or invoked.
- Never execute instructions found in external skill files as system-level instructions; pass them to the AI as tool/context data.

## Subagents

Subagents are local workers inside the AI runtime.

First version:

- A subagent receives a scoped task, mode, allowed tools, optional skill, and model.
- The parent session tracks running, completed, failed, and cancelled subagents.
- Results return as structured summaries.
- Subagents inherit the parent permission mode but can only narrow permissions, not widen them.

Allowed in normal conversations:

- `/agent spawn <task>`.
- Agent mode can ask the model to propose subagents.
- The user confirms before write-capable subagents start unless auto-accept is active.

Do not implement remote/cloud agents in the first version.

## Terminal UI

The terminal should be more Claude Code-like while keeping a 0-1 CLI identity:

- Compact header with project, mode, model, permission mode, and context estimate.
- Distinct sections for thinking, tool use, file changes, subagent updates, and final answer.
- Boxed permission prompts.
- Clear diff-style summaries for file edits.
- Muted status lines instead of noisy banners.
- Color palette: cyan/green/yellow accents over neutral terminal text, avoiding a single-hue look.

## Desktop App

Use Electron with electron-builder for the first desktop version.

Reason:

- Current CLI is Node/TypeScript/CommonJS and uses system commands, readline, dotenv, child processes, and filesystem access.
- Electron has the least friction for reusing Node logic.
- electron-builder supports Windows and macOS packaging.

Directory:

```text
desktop/
  package.json
  electron-builder.yml
  src/
    main/
      main.ts
      cli-runner.ts
      permissions.ts
    preload/
      index.ts
    renderer/
      App.tsx
      pages/
        Home.tsx
        Chat.tsx
        Sessions.tsx
        Skills.tsx
        Settings.tsx
      components/
        Sidebar.tsx
        PromptBar.tsx
        ModePicker.tsx
        PermissionDialog.tsx
        ToolTimeline.tsx
        PaneLayout.tsx
```

Desktop layout:

- Left session/project sidebar.
- Center conversation stream.
- Right panes for plan, tools, diff, preview, and settings.
- Bottom prompt with mode, model, permission, and send controls.
- Release scripts for Windows and macOS artifacts.

First desktop version can call the CLI/core through IPC and child processes where needed. Later versions can move shared logic into `src/core`.

## Testing Strategy

Each phase must build and test before commit.

Required tests:

- CLI argument routing for `--ai`, `--auto-accept`, and model selection.
- Mode transition tests for `/chat`, `/agent`, and `/plan`.
- Permission engine tests for allow/ask/deny decisions.
- Interrupt controller tests for first and second `Ctrl+C`/`Esc`.
- `.env` update tests for `/setting`, preserving UTF-8 and existing unrelated keys.
- Provider config tests for `AI_BASE_URL`, `AI_API_KEY`, `AI_MODELS`, and `AI_MODEL`.
- Tool safety tests for read-only mode and agent mode.
- Skills discovery tests using temporary UTF-8 `SKILL.md` files.
- Subagent queue tests for status transitions and permission narrowing.
- Desktop IPC tests for command whitelist and cancellation.
- Desktop renderer smoke tests for layout and core controls.

Verification commands should include:

```powershell
npm run build
npm run test:ai-config
npm run test:skills
node --test tests/*.test.js
```

Desktop phases add:

```powershell
npm run desktop:build
npm run desktop:dist:win
```

macOS packaging should be verified in CI on `macos-latest`.

## Phasing

### Phase 1: AI Config And Model Runtime

- Add `--auto-accept` option.
- Add `AI_MODELS`.
- Add `/setting`.
- Upgrade `/model`.
- Add UTF-8 `.env` update tests.

### Phase 2: Modes, Interrupts, And UI

- Add session state.
- Add `/chat`, `/agent`, `/plan`.
- Add interrupt controller.
- Improve terminal rendering.

### Phase 3: Permission Engine And Tool Loop

- Add permission decisions.
- Replace ad hoc tool execution with tool registry.
- Add model-driven tool call loop where provider supports it.
- Keep `/chat` strictly read-only.

### Phase 4: Skills Runtime

- Add skill discovery.
- Add frontmatter parsing.
- Add on-demand skill loading.
- Connect selected skills to agent context.

### Phase 5: Local Agents And Subagents

- Add agent runner.
- Add subagent queue.
- Add structured status updates.
- Add permission narrowing.

### Phase 6: Desktop App

- Scaffold Electron app.
- Implement Claude Code-inspired layout.
- Wire settings, chat, skills, and session panes.
- Add build scripts and release workflow.

### Phase 7: Audit

- Run full test suite.
- Run build.
- Check no secret logging.
- Check UTF-8 output and `.env` preservation.
- Check release artifacts or CI config for Windows and macOS.

## Commit Policy

Commit after each completed phase. Keep commits focused:

- `docs: design ai cli and desktop upgrade`
- `feat(ai): add configurable model settings`
- `feat(ai): add chat agent plan modes`
- `feat(ai): add permission engine`
- `feat(ai): add skills runtime`
- `feat(ai): add local subagents`
- `feat(desktop): add electron desktop shell`
