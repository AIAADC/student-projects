# Round 00: Planning Pack Checkpoint Handoff

## Copy This Prompt To Cursor

```text
你在 D:\new_project\My-CLI 工作。只执行 Round 00: Planning Pack Checkpoint。

先读 AGENTS.md，并保护 UTF-8 中文。
然后读 docs/plans/claude-code-parity-v2/README.md、00-global-spec.md、01-current-state-and-gap-audit.md、02-claude-source-transplant-map.md、04-verification-and-handoff.md，以及本文件。

本轮只确认规划包存在、格式健康、验证通过，然后本地 commit。不要改 src、desktop、tests 的业务实现。
```

## Goal

Commit the planning pack as the execution source of truth.

## Files

- Create or verify: `docs/plans/claude-code-parity-v2/README.md`
- Create or verify: `docs/plans/claude-code-parity-v2/00-global-spec.md`
- Create or verify: `docs/plans/claude-code-parity-v2/01-current-state-and-gap-audit.md`
- Create or verify: `docs/plans/claude-code-parity-v2/02-claude-source-transplant-map.md`
- Create or verify: `docs/plans/claude-code-parity-v2/03-execution-rounds.md`
- Create or verify: `docs/plans/claude-code-parity-v2/04-verification-and-handoff.md`
- Create or verify: `docs/plans/claude-code-parity-v2/rounds/**`

## Verification

```powershell
git status --short --branch
git diff --check
npm run build
node --test --test-concurrency=1 .\tests\*.test.js
```

## Commit

```powershell
git add docs/plans/claude-code-parity-v2
git commit -m "docs(ai): add claude parity v2 planning pack"
```
