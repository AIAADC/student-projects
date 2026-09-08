# Claude Code Transplant Map

## Purpose

This phase corrects the previous direction: the AI CLI should not grow as a from-scratch chat toy. It should port the useful Claude Code source shapes first, then delete account, telemetry, and Anthropic-only behavior.

Reference source:

`D:\project\MCP-Skills\ClaudeCode-Collection\ClaudeCode-Collection\claude-code-source`

## Copy Or Adapt First

### Slash Commands

Claude Code source:

- `src/commands.ts`
- `src/types/command.ts`
- `src/commands/model/index.js`
- `src/commands/plan/index.js`
- `src/commands/skills/index.js`
- `src/commands/agents/index.js`

My-CLI targets:

- `src/chat/commands.ts`
- `src/chat/index.ts`
- `src/chat/modes.ts`
- `src/chat/models.ts`
- `src/chat/skills.ts`
- `src/chat/agent/subagents.ts`

Adaptation rule: copy the command registry shape, source annotations, aliases, and slash menu behavior. Keep the current Commander entrypoint. Do not copy provider availability checks that depend on Claude account state.

### Permission UI And Permission Flow

Claude Code source:

- `src/components/permissions/PermissionDialog.tsx`
- `src/components/permissions/PermissionPrompt.tsx`
- `src/components/permissions/FallbackPermissionRequest.tsx`
- `src/components/permissions/FileEditPermissionRequest/FileEditPermissionRequest.tsx`
- `src/components/permissions/FilePermissionDialog/usePermissionHandler.ts`
- `src/utils/permissions/*`

My-CLI targets:

- `src/chat/permissions/engine.ts`
- `src/chat/permissions/prompts.ts`
- `src/chat/ui/layout.ts`
- `src/chat/index.ts`

Adaptation rule: port the option model: allow once, allow for session, reject, reject with feedback, cancel. Delete analytics hooks and account-based permission sources. Keep hard denies for destructive paths outside the workspace.

### Terminal Rendering

Claude Code source:

- `src/components/design-system/Dialog.js`
- `src/components/design-system/Byline.js`
- `src/components/design-system/KeyboardShortcutHint.js`
- `src/components/messages/*`
- `src/components/Spinner/*`
- `src/interactiveHelpers.tsx`
- `src/replLauncher.tsx`

My-CLI targets:

- `src/chat/ui/theme.ts`
- `src/chat/ui/layout.ts`
- `src/chat/terminal-ui.ts`
- `src/chat/stream-renderer.ts`
- `src/chat/spinner.ts`
- `src/chat/index.ts`

Adaptation rule: keep My-CLI on readline/chalk for now, but copy the structure: compact header, byline hints, permission panels, activity timeline, and slash menu. Do not pull in the full Ink runtime unless a later phase deliberately migrates the TUI.

### Interrupts

Claude Code source:

- `src/components/tasks/AsyncAgentDetailDialog.tsx`
- `src/cli/exit.ts`
- `src/interactiveHelpers.tsx`
- keybinding usages under `src/components/**`

My-CLI targets:

- `src/chat/interrupts.ts`
- `src/chat/index.ts`
- `src/utils/selector.ts`

Adaptation rule: preserve the repeated-exit confirmation behavior. First interrupt cancels running foreground or subagent work. Esc inside menus returns to the parent prompt.

### Local Agents And Subagents

Claude Code source:

- `src/tasks.ts`
- `src/Task.ts`
- `src/tasks/LocalAgentTask/*`
- `src/components/tasks/AsyncAgentDetailDialog.tsx`
- `src/components/tasks/renderToolActivity.js`
- `src/components/tasks/taskStatusUtils.js`
- `src/tools/AgentTool/*`

My-CLI targets:

- `src/chat/agent/types.ts`
- `src/chat/agent/runner.ts`
- `src/chat/agent/subagents.ts`
- `src/chat/ui/layout.ts`

Adaptation rule: copy status vocabulary, activity summaries, stop behavior, and parent permission narrowing. Do not copy remote agent, internal teammate, or Anthropic platform code.

### Skills Runtime

Claude Code source:

- `src/skills/loadSkillsDir.js`
- `src/skills/bundledSkills.js`
- `src/services/skillSearch/*`
- `src/utils/plugins/loadPluginCommands.js`
- `src/commands/skills/index.js`

My-CLI targets:

- `src/chat/skills.ts`
- future split: `src/chat/skills/discovery.ts`, `frontmatter.ts`, `runtime.ts`

Adaptation rule: index only names, descriptions, and trigger metadata up front. Load full `SKILL.md` content on demand. Treat skill text as model context, not trusted system instructions.

### Prompt System

Claude Code source:

- `src/query.ts`
- `src/QueryEngine.ts`
- `src/context.ts`
- `src/tools.ts`
- `src/Tool.ts`
- `src/utils/messages.js`

My-CLI targets:

- `src/chat/provider.ts`
- `src/chat/tools.ts`
- `src/chat/tools/registry.ts`
- `src/chat/session.ts`

Adaptation rule: port the message/tool pairing discipline and model-facing tool descriptions. Keep provider-neutral OpenAI-compatible calls. Do not copy Claude-specific billing, entitlement, or first-party model routing.

## Delete Or Avoid

Never port these categories into My-CLI:

- Login, logout, OAuth refresh, account type checks, subscription checks.
- Telemetry, OpenTelemetry, analytics events, feature gates, Statsig/GrowthBook-style checks.
- Anthropic employee/internal commands, internal agents platform, usage reporting.
- Remote bridge, CCR, Chrome bridge, mobile bridge, trusted device, work secret.
- Billing, quota, pricing, organization allowlists, data upload.

## Desktop Direction

The desktop app must expose the CLI's real useful commands first:

- `hi --clear`
- `hi --skills`
- `hi --install`
- `hi --state`
- `hi --api`
- `hi --pay`

Release wiring should do both:

- produce workflow artifacts on manual runs;
- attach packaged desktop assets to GitHub Releases on release events.

## Current Phase Acceptance

- `/` in AI mode prints a command menu instead of "unknown command".
- Desktop command surface includes clear, skills, and install actions.
- GitHub release workflow can attach Windows and macOS assets to release pages.
- Source map above is committed so later phases can copy larger Claude Code blocks without rediscovering paths.
