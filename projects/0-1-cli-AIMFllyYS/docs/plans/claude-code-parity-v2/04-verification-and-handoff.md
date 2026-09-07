# Verification And Handoff

## Required Skills For Future Execution

Every future implementation session must start with:

1. `superpowers:using-superpowers`
2. `superpowers:test-driven-development` for implementation rounds
3. `superpowers:verification-before-completion` before claiming done
4. `superpowers:subagent-driven-development` when dispatching independent workers

If working in a separate worktree, use `superpowers:using-git-worktrees` first.

## Per-Round Cursor/Opus Prompt Template

Preferred path: give Cursor Claude Opus 4.6 thinking Max exactly one file from `docs/plans/claude-code-parity-v2/rounds/`.

If a custom prompt is needed, use this structure:

```text
你在 D:\new_project\My-CLI 工作。保护 UTF-8 中文，不要改坏中文。
本轮只执行 docs/plans/claude-code-parity-v2/03-execution-rounds.md 的 Round <N>: <title>。

必须先读：
- AGENTS.md
- docs/plans/claude-code-parity-v2/README.md
- docs/plans/claude-code-parity-v2/00-global-spec.md
- docs/plans/claude-code-parity-v2/01-current-state-and-gap-audit.md
- docs/plans/claude-code-parity-v2/02-claude-source-transplant-map.md
- docs/plans/claude-code-parity-v2/03-execution-rounds.md
- docs/plans/claude-code-parity-v2/04-verification-and-handoff.md
- 本轮列出的 Claude Code 源文件

执行规则：
- 优先复制/改造 Claude Code 的结构，而不是从 0 发明。
- 删除或绕开登录、遥测、账号、计费、Anthropic 内部逻辑。
- 不碰本轮无关文件。
- 先补或更新测试，再实现。
- 每轮结束必须运行本轮验证命令和全局验证命令。
- 每轮结束必须本地 commit。
- 不 push，不 merge，不发 release，除非本轮用户明确要求。

最终回复必须包含：
- 本轮参考了哪些 Claude Code 文件。
- 改了哪些 My-CLI 文件。
- 删除/避开了哪些无关 Claude 功能。
- 跑了哪些命令，结果如何。
- commit hash。
```

## Global Verification Commands

Run at the start of each round:

```powershell
git status --short --branch
```

Run before committing each round:

```powershell
git diff --check
npm run build
node --test --test-concurrency=1 .\tests\*.test.js
```

Run when desktop files changed:

```powershell
npm run desktop:build
```

Run when release workflow or release panel changed:

```powershell
node --test tests/desktop-release-assets.test.js
gh release view
```

Run forbidden-port scan before committing each runtime or desktop round:

```powershell
rg -n "telemetry|analytics|OpenTelemetry|Statsig|GrowthBook|login|logout|oauth|subscription|billing|entitlement|account" src desktop tests docs
```

Allowed scan hits:

- Documentation describing forbidden categories.
- Tests asserting forbidden behavior is absent.
- Historic changelog entries that do not indicate live runtime code.

Suspicious scan hits:

- Runtime imports.
- Provider calls.
- CLI commands.
- Desktop IPC handlers.
- Workflow steps sending data to third-party analytics.

## UTF-8 Protection

Each round that touches user-facing text must:

- Read and write files as UTF-8.
- Preserve Chinese text in README, README_zh-CN, docs, prompts, skills, and runtime messages.
- Add or preserve tests that assert Chinese text round-trips.
- Scan changed files for replacement characters.

Suggested scan:

```powershell
rg -n "\x{FFFD}|鏃|璇|鎶|瀛|鈥|鈼" src desktop docs tests
```

The scan may reveal existing damage. If the round is not the UTF-8 repair round, record it and avoid making it worse. Round 3 owns the systematic repair.

## Commit Rules

Commit one phase at a time.

Preferred commit prefixes:

- `docs(ai):` planning and handoff docs.
- `feat(ai):` AI runtime features.
- `fix(ai):` AI runtime bug or encoding fixes.
- `feat(desktop):` desktop app behavior.
- `fix(desktop):` desktop bug fixes.
- `ci(desktop):` release workflow.
- `chore(ai):` final audits and cleanup.

Never include unrelated untracked files such as local temp inputs in the commit.

## Branch And Push Rules

- Work on `codex/ai-cli-claude-port` unless the user asks for a new branch.
- If creating a branch, use the `codex/` prefix.
- Do not push unless the user explicitly authorizes push.
- Do not merge unless the user explicitly authorizes merge.
- Do not publish releases unless the user explicitly asks for release publication.

## Desktop Safety Rules

Desktop IPC may call only whitelisted actions.

Safe dashboard commands:

- `hi --state`
- `hi --api`
- `hi --pay`

Native confirmation panels:

- `hi --clear`
- `hi --skills`
- `hi --install`

Desktop IPC must not expose arbitrary command strings from renderer to shell execution.

Interactive commands such as `hi --ai` must not be run through the same noninteractive command panel. If desktop AI mode is implemented, it needs a dedicated bridge that streams session events and can be cancelled.

## Release Rules

The release workflow must support both:

- Manual workflow artifacts.
- GitHub Release attached assets.

Use `npm install` rather than assuming `npm ci` when the current repo lockfile state requires it.

The desktop package must include:

- Compiled CLI runtime.
- Runtime `package.json` under the copied CLI bundle when needed.
- Production dependencies installed in the copied runtime directory before packaging.

## Local Install Troubleshooting

When built source behaves differently from `hi`, verify shell resolution before changing source:

```powershell
Get-Command hi -All
where.exe hi
node dist/index.js --ai
```

Known global wrapper location on this machine:

`C:\Users\AIMFl\AppData\Roaming\npm`

## Handoff Summary For Cursor Claude Opus

The correct mental model:

- This is not a fresh AI chat toy.
- It is a source-guided Claude Code-style transplant into My-CLI.
- Copy structure first.
- Prune forbidden vendor/account behavior immediately.
- Keep every round small enough to test and commit.
- Prefer current My-CLI boundaries over broad rewrites.

Rounds 0–18 are complete as of 2026-06-14 (final audit commit `7a328e5`). Use these handoff docs for regression checks, follow-up fixes, or a future V3 push — not as an open implementation queue unless the user explicitly starts a new round.
