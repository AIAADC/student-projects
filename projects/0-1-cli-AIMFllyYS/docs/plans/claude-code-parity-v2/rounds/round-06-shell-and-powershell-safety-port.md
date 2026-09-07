# Round 06: Shell And PowerShell Safety Port Handoff

## Copy This Prompt To Cursor

```text
你在 D:\new_project\My-CLI 工作。只执行 Round 06: Shell And PowerShell Safety Port。

先读 AGENTS.md 和 docs/plans/claude-code-parity-v2 下的 README、00、01、02、04，以及本文件。
精读 Claude Code Bash/PowerShell safety 源码。只移植本地安全判断，不移植 Claude account、sandbox、analytics、remote policy。
```

## Goal

Port the local shell safety shape without importing Claude account or sandbox dependencies.

## Claude Sources

- `src/components/permissions/BashPermissionRequest/BashPermissionRequest.tsx`
- `src/components/permissions/BashPermissionRequest/bashToolUseOptions.tsx`
- `src/components/permissions/PowerShellPermissionRequest/PowerShellPermissionRequest.tsx`
- `src/components/permissions/PowerShellPermissionRequest/powershellToolUseOptions.tsx`
- `src/tools/PowerShellTool/powershellSecurity.ts`
- `src/tools/PowerShellTool/pathValidation.ts`
- `src/tools/PowerShellTool/gitSafety.ts`
- `src/tools/PowerShellTool/destructiveCommandWarning.ts`

## My-CLI Files

- Modify: `src/chat/tools/shell.ts`
- Modify: `src/chat/tools/registry.ts`
- Modify: `src/chat/permissions/engine.ts`
- Modify: `src/chat/permissions/prompts.ts`
- Test: `tests/ai-tools.test.js`
- Test: `tests/ai-permissions.test.js`

## Required Behavior

- Shell tool accepts executable plus args, not a raw shell string.
- Destructive command patterns require explicit approval even in agent mode.
- `--auto-accept` still denies workspace escape and known catastrophic commands.
- Git destructive commands require a warning reason.
- PowerShell command behavior respects Windows path semantics.

## Verification

```powershell
npm run build
node --test tests/ai-tools.test.js tests/ai-permissions.test.js
node --test --test-concurrency=1 .\tests\*.test.js
```

## Commit

```powershell
git add src/chat/tools/shell.ts src/chat/tools/registry.ts src/chat/permissions/engine.ts src/chat/permissions/prompts.ts tests/ai-tools.test.js tests/ai-permissions.test.js
git commit -m "feat(ai): harden shell tool permissions"
```
