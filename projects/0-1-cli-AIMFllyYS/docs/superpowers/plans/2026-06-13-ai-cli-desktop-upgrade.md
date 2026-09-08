# AI CLI And Desktop Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade `hi --ai` into a Claude Code-inspired local AI coding assistant with chat/agent/plan modes, permissions, settings, model switching, skills, subagents, and an Electron desktop app for Windows and macOS.

**Architecture:** Keep `src/index.ts` as a thin command router. Move AI runtime behavior into focused `src/chat` modules for config, session state, modes, permissions, tools, skills, agents, and terminal UI. Keep the desktop app under `desktop/` and connect it to CLI/core behavior through IPC and safe command adapters.

**Tech Stack:** Node.js 18+, TypeScript, Commander, Chalk, built-in `readline`, built-in `node:test`, dotenv, Electron, Vite, React, electron-builder, GitHub Actions.

---

## File Structure

Planned new or heavily changed files:

- `src/index.ts`: add `--auto-accept` and pass AI start options.
- `src/types/index.ts`: widen provider/model/session/permission/tool types.
- `src/chat/index.ts`: become a thin start function around `AiSession`.
- `src/chat/config.ts`: parse `.env`, write settings, normalize model list.
- `src/chat/session.ts`: own conversation state, active mode, model, permissions, and history.
- `src/chat/commands.ts`: parse and handle slash commands.
- `src/chat/modes.ts`: implement `/chat`, `/agent`, `/plan` transitions.
- `src/chat/interrupts.ts`: implement first/second `Ctrl+C` and `Esc` behavior.
- `src/chat/permissions/engine.ts`: allow/ask/deny decisions.
- `src/chat/permissions/prompts.ts`: confirmation prompt UI.
- `src/chat/tools/registry.ts`: tool metadata, schemas, and mode restrictions.
- `src/chat/tools/fs-read.ts`: safe list/read/search implementation.
- `src/chat/tools/fs-write.ts`: write/edit helpers gated by permission.
- `src/chat/tools/shell.ts`: shell execution gated by permission.
- `src/chat/skills/discovery.ts`: discover runtime skills.
- `src/chat/skills/frontmatter.ts`: parse `SKILL.md` frontmatter.
- `src/chat/skills/runtime.ts`: load skill content on demand.
- `src/chat/agent/types.ts`: local agent and subagent types.
- `src/chat/agent/runner.ts`: local agent loop.
- `src/chat/agent/subagents.ts`: subagent queue and status updates.
- `src/chat/ui/theme.ts`: terminal visual identity.
- `src/chat/ui/layout.ts`: status headers and sections.
- `src/chat/ui/stream.ts`: streaming renderer.
- `tests/ai-settings.test.js`: `/setting`, `.env`, model config tests.
- `tests/ai-modes.test.js`: `/chat`, `/agent`, `/plan` tests.
- `tests/ai-permissions.test.js`: permission engine tests.
- `tests/ai-interrupts.test.js`: interrupt state tests.
- `tests/ai-tools.test.js`: safe tools and mode restrictions.
- `tests/ai-skills-runtime.test.js`: runtime skills discovery tests.
- `tests/ai-subagents.test.js`: local subagent queue tests.
- `desktop/package.json`: desktop package scripts.
- `desktop/electron-builder.yml`: packaging config.
- `desktop/src/main/*`: main process and IPC adapters.
- `desktop/src/preload/index.ts`: safe renderer bridge.
- `desktop/src/renderer/*`: React UI.
- `.github/workflows/desktop-release.yml`: Windows/macOS artifact build.

---

### Task 1: AI Settings And Model Runtime

**Files:**
- Modify: `src/index.ts`
- Modify: `src/types/index.ts`
- Modify: `src/chat/index.ts`
- Modify: `src/chat/models.ts`
- Modify: `src/chat/provider.ts`
- Create: `src/chat/config.ts`
- Create: `src/chat/commands.ts`
- Modify: `.env.example`
- Create: `tests/ai-settings.test.js`

- [ ] **Step 1: Write failing tests**

Create `tests/ai-settings.test.js`:

```js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

test('AI env parser supports multiple model ids and active model', () => {
  const { parseAiEnv } = require('../dist/chat/config');
  const parsed = parseAiEnv({
    AI_BASE_URL: 'https://api.example.com/v1',
    AI_API_KEY: 'key-123',
    AI_MODELS: 'model-a, model-b,model-c',
    AI_MODEL: 'model-b',
  });

  assert.equal(parsed.baseUrl, 'https://api.example.com/v1');
  assert.equal(parsed.apiKey, 'key-123');
  assert.deepEqual(parsed.modelIds, ['model-a', 'model-b', 'model-c']);
  assert.equal(parsed.activeModelId, 'model-b');
});

test('writeAiSettings preserves UTF-8 and unrelated env keys', () => {
  const { writeAiSettings } = require('../dist/chat/config');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hi-ai-env-'));
  const envPath = path.join(dir, '.env');
  fs.writeFileSync(envPath, 'EXISTING=保留中文\\nAI_MODEL=old\\n', 'utf8');

  writeAiSettings(envPath, {
    baseUrl: 'https://api.example.com/v1',
    apiKey: 'secret',
    modelIds: ['alpha', 'beta'],
    activeModelId: 'alpha',
  });

  const env = fs.readFileSync(envPath, 'utf8');
  assert.match(env, /EXISTING=保留中文/);
  assert.match(env, /AI_BASE_URL=https:\/\/api\.example\.com\/v1/);
  assert.match(env, /AI_API_KEY=secret/);
  assert.match(env, /AI_MODELS=alpha,beta/);
  assert.match(env, /AI_MODEL=alpha/);
});
```

Run:

```powershell
npm run build
node --test tests/ai-settings.test.js
```

Expected before implementation: build may pass, but test fails because `dist/chat/config` does not exist.

- [ ] **Step 2: Implement config module**

Create `src/chat/config.ts` with:

- `AiSettings` interface.
- `parseAiEnv(env: NodeJS.ProcessEnv | Record<string, string | undefined>): AiSettings`.
- `resolveEnvPath(): string` using project root `.env`.
- `writeAiSettings(envPath, settings)` that reads/writes UTF-8 and preserves unrelated keys.
- `getConfiguredModelIds(env?)`.
- `getActiveModelId(env?)`.

Use `AI_MODELS` for the model list and `AI_MODEL` for the active model. Keep `AI_BASE_URL`, `AI_API_KEY`, and legacy `DEEPSEEK_API_KEY` / `ZHIPU_API_KEY` behavior.

- [ ] **Step 3: Add CLI option and command plumbing**

Update `src/index.ts`:

- Add `.option('--auto-accept', '...')`.
- Call `startChat({ modelId: opts.model, autoAccept: Boolean(opts.autoAccept) })`.

Update `src/chat/index.ts` and call sites so `startChat()` accepts either a string for backward compatibility or an options object.

Update `.env.example` to document:

```text
AI_BASE_URL=https://api.example.com/v1
AI_API_KEY=your_custom_api_key_here
AI_MODELS=model-a,model-b
AI_MODEL=model-a
```

- [ ] **Step 4: Add `/setting` and `/model` foundations**

Move slash command parsing into `src/chat/commands.ts`.

Implement exported pure helpers:

- `parseSlashCommand(input)`.
- `formatModelOptions(models, activeId)`.
- `applyModelSelection(id, settings)`.

Interactive prompts can remain in `src/chat/index.ts` for this phase, but `/setting` must call `writeAiSettings()`.

- [ ] **Step 5: Verify and commit**

Run:

```powershell
npm run build
node --test tests/ai-settings.test.js
npm run test:ai-config
```

Commit:

```powershell
git add .env.example src/index.ts src/types/index.ts src/chat tests/ai-settings.test.js
git commit -m "feat(ai): add configurable model settings"
```

---

### Task 2: Session Modes And Interrupt Controller

**Files:**
- Create: `src/chat/session.ts`
- Create: `src/chat/modes.ts`
- Create: `src/chat/interrupts.ts`
- Modify: `src/chat/index.ts`
- Modify: `src/chat/commands.ts`
- Create: `tests/ai-modes.test.js`
- Create: `tests/ai-interrupts.test.js`

- [ ] **Step 1: Write failing mode tests**

Create `tests/ai-modes.test.js`:

```js
const assert = require('node:assert/strict');
const test = require('node:test');

test('mode transitions follow chat agent plan rules', () => {
  const { createSessionState, setMode } = require('../dist/chat/session');

  const state = createSessionState({ modelId: 'model-a', autoAccept: false });
  assert.equal(state.mode, 'chat');
  assert.equal(state.permissionMode, 'ask');

  setMode(state, 'plan');
  assert.equal(state.mode, 'plan');
  assert.equal(state.permissionMode, 'plan');

  setMode(state, 'agent');
  assert.equal(state.mode, 'agent');
  assert.equal(state.permissionMode, 'ask');

  setMode(state, 'chat');
  assert.equal(state.mode, 'chat');
});

test('auto accept starts with bypass permission mode', () => {
  const { createSessionState } = require('../dist/chat/session');
  const state = createSessionState({ modelId: 'model-a', autoAccept: true });
  assert.equal(state.mode, 'agent');
  assert.equal(state.permissionMode, 'bypass');
});
```

- [ ] **Step 2: Write failing interrupt tests**

Create `tests/ai-interrupts.test.js`:

```js
const assert = require('node:assert/strict');
const test = require('node:test');

test('interrupt controller requires repeated exit confirmation', () => {
  const { createInterruptController } = require('../dist/chat/interrupts');
  const controller = createInterruptController({ confirmWindowMs: 1000 });

  assert.equal(controller.handle({ running: false, now: 1000 }).action, 'confirm-exit');
  assert.equal(controller.handle({ running: false, now: 1200 }).action, 'exit');
});

test('first interrupt cancels running work', () => {
  const { createInterruptController } = require('../dist/chat/interrupts');
  const controller = createInterruptController({ confirmWindowMs: 1000 });

  assert.equal(controller.handle({ running: true, now: 1000 }).action, 'cancel-running');
  assert.equal(controller.handle({ running: false, now: 2500 }).action, 'confirm-exit');
});
```

- [ ] **Step 3: Implement session and modes**

Create:

- `createSessionState(options)`.
- `setMode(state, mode)`.
- `describeMode(state)`.

Mode defaults:

- Normal start: `chat` + `ask`.
- `--auto-accept`: `agent` + `bypass`.
- `/plan`: `plan` + `plan`.

- [ ] **Step 4: Implement interrupt controller**

Create `createInterruptController({ confirmWindowMs })` with `handle({ running, now })`.

Return actions:

- `cancel-running`.
- `confirm-exit`.
- `exit`.
- `back`.

Wire `Ctrl+C` and `Esc` in the interactive loop.

- [ ] **Step 5: Verify and commit**

Run:

```powershell
npm run build
node --test tests/ai-modes.test.js tests/ai-interrupts.test.js
```

Commit:

```powershell
git add src/chat tests/ai-modes.test.js tests/ai-interrupts.test.js
git commit -m "feat(ai): add chat agent plan modes"
```

---

### Task 3: Permission Engine And Safe Tools

**Files:**
- Create: `src/chat/permissions/engine.ts`
- Create: `src/chat/permissions/prompts.ts`
- Create: `src/chat/tools/registry.ts`
- Create: `src/chat/tools/fs-read.ts`
- Create: `src/chat/tools/fs-write.ts`
- Create: `src/chat/tools/shell.ts`
- Modify: `src/chat/tools.ts`
- Create: `tests/ai-permissions.test.js`
- Create: `tests/ai-tools.test.js`

- [ ] **Step 1: Write failing permission tests**

Create tests proving:

- Chat mode allows read tools.
- Chat mode denies write and shell tools.
- Plan mode denies write tools.
- Agent ask mode returns `ask` for write and shell tools.
- Agent bypass mode allows ordinary writes but denies destructive paths outside the workspace.

- [ ] **Step 2: Write failing safe-tool tests**

Create tests proving:

- `readFileTool()` truncates large files.
- `searchFilesTool()` does not run through a shell string.
- Paths outside workspace are denied unless explicitly allowed.
- UTF-8 file content remains readable.

- [ ] **Step 3: Implement permission engine**

Implement:

- `decidePermission(request)`.
- `isDangerousPath(workspaceRoot, targetPath)`.
- `rememberSessionDecision(state, decision)`.

- [ ] **Step 4: Implement tool registry**

Add metadata:

- `name`.
- `kind`: `read`, `write`, `shell`, `network`, `skill`, `agent`.
- `description`.
- `allowedModes`.
- `requiresPermission`.

Keep old manual commands working by adapting them to the registry.

- [ ] **Step 5: Verify and commit**

Run:

```powershell
npm run build
node --test tests/ai-permissions.test.js tests/ai-tools.test.js
```

Commit:

```powershell
git add src/chat tests/ai-permissions.test.js tests/ai-tools.test.js
git commit -m "feat(ai): add permissioned tool registry"
```

---

### Task 4: Skills Runtime

**Files:**
- Create: `src/chat/skills/frontmatter.ts`
- Create: `src/chat/skills/discovery.ts`
- Create: `src/chat/skills/runtime.ts`
- Modify: `src/chat/commands.ts`
- Create: `tests/ai-skills-runtime.test.js`

- [ ] **Step 1: Write failing tests**

Create tests using temporary skill directories:

- Detect `SKILL.md`.
- Parse `name` and `description` frontmatter.
- Preserve Chinese UTF-8 skill content.
- Load full skill body only when requested.

- [ ] **Step 2: Implement frontmatter parser**

Support simple YAML-like frontmatter for:

- `name`.
- `description`.
- `allowed-tools`.
- `model`.
- `disable-model-invocation`.

- [ ] **Step 3: Implement discovery and runtime loading**

Search:

- `.0-1-cli/skills`.
- user `.0-1-cli/skills`.
- user `.codex/skills`.
- user `.claude/skills`.

Do not execute skill instructions as system instructions. Pass selected skill content into the AI session as contextual data.

- [ ] **Step 4: Verify and commit**

Run:

```powershell
npm run build
node --test tests/ai-skills-runtime.test.js
npm run test:skills
```

Commit:

```powershell
git add src/chat/skills src/chat/commands.ts tests/ai-skills-runtime.test.js
git commit -m "feat(ai): add runtime skills"
```

---

### Task 5: Local Agents And Subagents

**Files:**
- Create: `src/chat/agent/types.ts`
- Create: `src/chat/agent/runner.ts`
- Create: `src/chat/agent/subagents.ts`
- Modify: `src/chat/session.ts`
- Modify: `src/chat/commands.ts`
- Create: `tests/ai-subagents.test.js`

- [ ] **Step 1: Write failing tests**

Create tests proving:

- A subagent starts with `queued`, moves to `running`, then `completed`.
- Subagent permissions can narrow but not widen parent permissions.
- Cancelling a subagent changes status to `cancelled`.
- Result summaries are structured.

- [ ] **Step 2: Implement types and queue**

Implement:

- `SubagentTask`.
- `SubagentStatus`.
- `SubagentResult`.
- `createSubagentQueue()`.
- `enqueueSubagent()`.
- `cancelSubagent()`.

- [ ] **Step 3: Implement runner integration**

Support slash commands:

- `/agent`.
- `/agent spawn <task>`.
- `/agent list`.
- `/agent cancel <id>`.

First version can execute subagents sequentially in-process. Parallel worker execution can come after the queue is stable.

- [ ] **Step 4: Verify and commit**

Run:

```powershell
npm run build
node --test tests/ai-subagents.test.js
```

Commit:

```powershell
git add src/chat/agent src/chat/session.ts src/chat/commands.ts tests/ai-subagents.test.js
git commit -m "feat(ai): add local subagents"
```

---

### Task 6: Terminal UI Polish

**Files:**
- Create: `src/chat/ui/theme.ts`
- Create: `src/chat/ui/layout.ts`
- Create: `src/chat/ui/stream.ts`
- Modify: `src/chat/terminal-ui.ts`
- Modify: `src/chat/stream-renderer.ts`
- Modify: `src/chat/index.ts`
- Create: `tests/ai-ui.test.js`

- [ ] **Step 1: Write output tests**

Test pure render helpers for:

- Header includes project, mode, model, and permission mode.
- Permission boxes include clear action labels.
- Tool timeline renders read/write/shell/subagent entries.
- Chinese labels are UTF-8.

- [ ] **Step 2: Implement theme and layout helpers**

Use compact Claude Code-like sections:

- Status header.
- Thinking section.
- Tool use section.
- Permission box.
- File change summary.
- Final answer divider.

- [ ] **Step 3: Wire UI into session loop**

Replace scattered banners with the new helpers.

- [ ] **Step 4: Verify and commit**

Run:

```powershell
npm run build
node --test tests/ai-ui.test.js
```

Commit:

```powershell
git add src/chat tests/ai-ui.test.js
git commit -m "feat(ai): polish terminal interface"
```

---

### Task 7: Desktop Shell

**Files:**
- Create: `desktop/package.json`
- Create: `desktop/electron-builder.yml`
- Create: `desktop/tsconfig.json`
- Create: `desktop/index.html`
- Create: `desktop/src/main/main.ts`
- Create: `desktop/src/main/cli-runner.ts`
- Create: `desktop/src/main/permissions.ts`
- Create: `desktop/src/preload/index.ts`
- Create: `desktop/src/renderer/App.tsx`
- Create: `desktop/src/renderer/styles.css`
- Create: `desktop/src/renderer/components/*`
- Modify: `package.json`
- Create: `tests/desktop-config.test.js`

- [ ] **Step 1: Write desktop config tests**

Create tests proving:

- Root package exposes desktop scripts.
- Desktop package uses Electron and electron-builder.
- Windows and macOS build targets exist.
- Main, preload, and renderer entry files exist.

- [ ] **Step 2: Scaffold Electron app**

Implement:

- Main process window.
- Preload bridge.
- Renderer app.
- Basic IPC command runner whitelist.

- [ ] **Step 3: Build Claude Code-inspired UI**

Renderer layout:

- Left session sidebar.
- Center conversation stream.
- Right pane tabs for Plan, Tools, Diff, Preview, Settings.
- Bottom prompt with model/mode/permission controls.

Use real controls for current supported features. Disabled controls should be visibly disabled, not fake-functional.

- [ ] **Step 4: Add scripts**

Root scripts:

```json
{
  "desktop:install": "npm install --prefix desktop",
  "desktop:build": "npm run build && npm run build --prefix desktop",
  "desktop:dist:win": "npm run desktop:build && npm run dist:win --prefix desktop",
  "desktop:dist:mac": "npm run desktop:build && npm run dist:mac --prefix desktop"
}
```

- [ ] **Step 5: Verify and commit**

Run:

```powershell
npm run build
node --test tests/desktop-config.test.js
npm run desktop:build
```

Commit:

```powershell
git add package.json desktop tests/desktop-config.test.js
git commit -m "feat(desktop): add electron desktop shell"
```

---

### Task 8: Release Workflow And Final Audit

**Files:**
- Create: `.github/workflows/desktop-release.yml`
- Modify: `README.md`
- Modify: `README_zh-CN.md`
- Modify: `docs/updates/CHANGELOG.md`

- [ ] **Step 1: Add release workflow**

Add a GitHub Actions workflow with:

- `windows-latest` job for Windows artifact.
- `macos-latest` job for macOS artifact.
- `npm ci`.
- `npm run build`.
- `npm run desktop:install`.
- Desktop packaging command per OS.
- Upload artifacts.

- [ ] **Step 2: Document AI and desktop usage**

Docs must include:

- `hi --ai`.
- `hi --ai --auto-accept`.
- `/chat`.
- `/agent`.
- `/plan`.
- `/setting`.
- `/model`.
- Skills runtime.
- Desktop build commands.

- [ ] **Step 3: Final verification**

Run:

```powershell
npm run build
node --test tests/*.test.js
git status --short --branch
```

If desktop dependencies are installed:

```powershell
npm run desktop:build
```

- [ ] **Step 4: Commit**

Commit:

```powershell
git add .github/workflows/desktop-release.yml README.md README_zh-CN.md docs/updates/CHANGELOG.md
git commit -m "docs: add desktop release workflow"
```
