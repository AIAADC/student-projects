# 0-1 CLI Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the CLI from `coding` to `hi`, upgrade it into `0-1 CLI`, add cross-platform installation surfaces, add guided AI CLI/IDE/tool installers, add a skills marketplace, and allow custom AI endpoint/API key/model configuration.

**Architecture:** Keep `src/index.ts` as a thin route table and move new behavior into focused modules under `src/modules/install`, `src/modules/skills`, `src/modules/home`, and `src/chat/config`. Keep each new TypeScript file below 300 lines and split by responsibility only when it reflects a real boundary: registry data, environment checks, install runner, menus, renderer, and marketplace installer.

**Tech Stack:** Node.js 18+, TypeScript, Commander, Chalk, built-in `readline`, built-in `child_process`, built-in `node:test` for regression tests, PowerShell installer for Windows, shell installer for macOS/Linux.

---

### Task 1: Command Identity, Version, and Home Banner

**Files:**
- Modify: `package.json`
- Modify: `src/index.ts`
- Create: `src/modules/home/banner.ts`
- Create: `src/modules/home/index.ts`
- Create: `tests/phase1.test.js`

- [ ] **Step 1: Write failing tests**

Create `tests/phase1.test.js` to verify:
- `package.json` exposes `hi` as the executable command.
- `package.json` version is bumped by exactly one patch release from `0.6.6` to `0.6.7`.
- `node dist/index.js --version` prints `0.6.7`.
- `node dist/index.js --help` shows `Usage: hi [options]`.

Run: `npm run test:phase1`
Expected before implementation: failure because the bin command is still `coding`, the runtime version is still `0.6.4`, and `test:phase1` does not exist yet.

- [ ] **Step 2: Implement identity changes**

Update `package.json`:
- version `0.6.7`
- bin key `hi`
- description `0-1 CLI - AI CLI onboarding and development toolbox`
- keywords include `hi`, `zero-one`, `ai-cli`
- script `test:phase1` runs `node --test tests/phase1.test.js`

Update `src/index.ts`:
- Commander name becomes `hi`
- Commander description becomes `0-1 CLI - AI CLI onboarding and development toolbox`
- Runtime version reads `0.6.7`
- Help footer uses `hi`

Create home banner module:
- `renderHomeHeader(version: string): string`
- Return an ASCII-styled `0-1 CLI` banner plus the quote `树林曾云：从0到1是最贵的`
- Include the supporting sentence `希望这个CLI可以帮助你从0到1入门AI-CLI工具`

- [ ] **Step 3: Verify and commit**

Run:
```powershell
npm run build
npm run test:phase1
```

Expected: build succeeds and phase1 tests pass.

Commit:
```powershell
git add package.json src/index.ts src/modules/home tests/phase1.test.js
git commit -m "feat: rename command to hi and refresh home banner"
```

### Task 2: Optional Project Root Binding

**Files:**
- Modify: `src/modules/paths.ts`
- Create: `tests/paths.test.js`

- [ ] **Step 1: Write failing tests**

Test that project path rendering returns a friendly skipped-state message when no project root is configured, and does not require interactive input during normal home rendering.

- [ ] **Step 2: Implement skip behavior**

Update `ensureProjectRoot()` so pressing Enter returns an empty string, saves no invalid path, and lets the CLI continue.

- [ ] **Step 3: Verify and commit**

Run:
```powershell
npm run build
npm run test:paths
```

Commit:
```powershell
git add package.json src/modules/paths.ts tests/paths.test.js
git commit -m "feat: allow skipping project root binding"
```

### Task 3: Cross-Platform Self Installer

**Files:**
- Modify: `scripts/install.ps1`
- Create: `scripts/install.sh`
- Modify: `README.md`
- Modify: `README_zh-CN.md`

- [ ] **Step 1: Write installer smoke tests**

Add tests that inspect scripts for:
- Windows command exposes `hi`
- macOS/Linux command exists as `scripts/install.sh`
- both installers link/register `hi`
- no installer hardcodes secrets

- [ ] **Step 2: Implement installer updates**

Update PowerShell installer text and commands from `coding` to `hi`.
Add `scripts/install.sh` with Git/Node checks, clone/update, npm install, npm run build, and npm link.
Use confirmation prompts before installing missing dependencies or linking globally.

- [ ] **Step 3: Verify and commit**

Run:
```powershell
npm run build
npm run test:installers
```

Commit:
```powershell
git add package.json scripts/install.ps1 scripts/install.sh README.md README_zh-CN.md tests/installers.test.js
git commit -m "feat: add cross-platform hi installer"
```

### Task 4: Guided Install Registry and Menus

**Files:**
- Create: `src/modules/install/types.ts`
- Create: `src/modules/install/registry.ts`
- Create: `src/modules/install/environment.ts`
- Create: `src/modules/install/runner.ts`
- Create: `src/modules/install/menu.ts`
- Create: `src/modules/install/index.ts`
- Modify: `src/index.ts`
- Create: `tests/install-registry.test.js`

- [ ] **Step 1: Write failing registry tests**

Verify canonical keys and aliases:
- CLI: `cc`, `kimi`, `codex`, `kiro`, `mimo`, `antigravity`, `opencode`, `openclaw`, `hermes`
- IDE/tool links: `vscode`, `cursor`, `trae`, `windsuf`, `devin`, `zed`, `qoder`, `codebuddy`, `workbuddy`, `trae-solo`, `qoderwork`, `kiro`, `trae-cn`
- Magic tools: `proxy`, `virtual-card`, `browser`

- [ ] **Step 2: Implement registry and route**

`hi --install` opens a first-level selector:
- `下载AI CLI工具`
- `AI IDE`
- `魔法环境工具`

`hi --install -<tool>` bypasses the menu and runs the selected target.
`hi --install -<tool> -latest` checks installed version first and updates when supported.

- [ ] **Step 3: Implement dependency checks and confirmation**

CLI targets declare environment requirements. The runner checks each dependency, explains missing requirements, asks for `Y`, and then runs the install command when automation is supported. Non-CLI targets open the official URL.

- [ ] **Step 4: Verify and commit**

Run:
```powershell
npm run build
npm run test:install-registry
```

Commit:
```powershell
git add package.json src/index.ts src/modules/install tests/install-registry.test.js
git commit -m "feat: add guided installer registry"
```

### Task 5: Skills Marketplace

**Files:**
- Create: `src/modules/skills/types.ts`
- Create: `src/modules/skills/registry.ts`
- Create: `src/modules/skills/targets.ts`
- Create: `src/modules/skills/installer.ts`
- Create: `src/modules/skills/menu.ts`
- Create: `src/modules/skills/index.ts`
- Modify: `src/index.ts`
- Create: `tests/skills-registry.test.js`

- [ ] **Step 1: Write failing skills tests**

Verify built-in skills:
- Official Superpowers
- `kaijie0074-art/agent-onboarding-skill`

Verify supported install targets:
- Claude
- Codex
- Cursor
- Global

- [ ] **Step 2: Implement marketplace**

`hi --skills` opens a skills market selector, then a multi-select target menu. Target detection scans common paths and includes a global install option.

- [ ] **Step 3: Implement progress reporting**

Installer prints progress per skill and per target, preserves UTF-8, and never deletes existing user files without confirmation.

- [ ] **Step 4: Verify and commit**

Run:
```powershell
npm run build
npm run test:skills
```

Commit:
```powershell
git add package.json src/index.ts src/modules/skills tests/skills-registry.test.js
git commit -m "feat: add skills marketplace"
```

### Task 6: Custom AI Provider Configuration

**Files:**
- Modify: `.env.example`
- Modify: `src/chat/models.ts`
- Modify: `src/chat/provider.ts`
- Modify: `src/types/index.ts`
- Create: `tests/ai-config.test.js`

- [ ] **Step 1: Write failing AI config tests**

Verify `.env.example` documents:
- `AI_BASE_URL`
- `AI_API_KEY`
- `AI_MODEL`

Verify provider builds requests from those env vars when present.

- [ ] **Step 2: Implement configurable provider**

Add generic OpenAI-compatible provider config. Keep DeepSeek/ZhiPu defaults for compatibility, but allow env overrides.

- [ ] **Step 3: Verify and commit**

Run:
```powershell
npm run build
npm run test:ai-config
```

Commit:
```powershell
git add .env.example src/chat src/types tests/ai-config.test.js
git commit -m "feat: support custom AI provider config"
```

### Task 7: Final Audit

**Files:**
- Modify only if audit finds a concrete gap.

- [ ] **Step 1: Check file size limits**

Run:
```powershell
Get-ChildItem -Recurse -File src,scripts | ForEach-Object { $lines=(Get-Content $_.FullName).Count; if ($lines -gt 300) { "$lines`t$($_.FullName)" } }
```

Expected: no new TypeScript files over 300 lines. Existing legacy scripts can remain if not expanded, but touched files over 300 must be split.

- [ ] **Step 2: Build and smoke test**

Run:
```powershell
npm run build
node dist/index.js --help
node dist/index.js --version
```

Expected: command help references `hi`, version is latest package version.

- [ ] **Step 3: Commit final docs if needed**

Commit any audit fixes with a focused message.
