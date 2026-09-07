# Round 09: Plan Mode Approval Lifecycle Handoff

## Copy This Prompt To Cursor

```text
你在 D:\new_project\My-CLI 工作。只执行 Round 09: Plan Mode Approval Lifecycle。

先读 AGENTS.md 和 docs/plans/claude-code-parity-v2 下的 README、00、01、02、04，以及本文件。
精读 Claude Code plan command 和 ExitPlanModeTool 源码。/plan 只能规划和请求审批，不能静默改文件。
```

## Goal

Make `/plan` lifecycle robust enough for real execution handoff.

## Claude Sources

- `src/commands/plan/index.ts`
- `src/commands/plan/plan.tsx`
- `src/tools/ExitPlanModeTool/ExitPlanModeV2Tool.ts`
- `src/tools/ExitPlanModeTool/prompt.ts`
- `src/components/permissions/ExitPlanModePermissionRequest/ExitPlanModePermissionRequest.tsx`

## My-CLI Files

- Modify: `src/chat/modes.ts`
- Modify: `src/chat/agent/loop.ts`
- Modify: `src/chat/plan-store.ts`
- Modify: `src/chat/ui/layout.ts`
- Modify: `src/chat/index.ts`
- Test: `tests/ai-modes.test.js`
- Test: `tests/ai-agent-loop.test.js`
- Test: `tests/ai-ui.test.js`

## Required Behavior

- `/plan <task>` stores a plan draft path.
- `exit_plan_mode` shows a review panel.
- Approval switches to agent mode.
- Rejection stays in plan mode.
- Existing plan can be opened with `/plan open`.
- Plan permission requests are listed and do not grant permissions automatically.

## Verification

```powershell
npm run build
node --test tests/ai-modes.test.js tests/ai-agent-loop.test.js tests/ai-ui.test.js
node --test --test-concurrency=1 .\tests\*.test.js
```

## Commit

```powershell
git add src/chat/modes.ts src/chat/agent/loop.ts src/chat/plan-store.ts src/chat/ui/layout.ts src/chat/index.ts tests/ai-modes.test.js tests/ai-agent-loop.test.js tests/ai-ui.test.js
git commit -m "feat(ai): harden plan approval lifecycle"
```
