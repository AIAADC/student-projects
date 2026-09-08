# Round 07: Interrupt And Exit Parity Handoff

## Copy This Prompt To Cursor

```text
你在 D:\new_project\My-CLI 工作。只执行 Round 07: Interrupt And Exit Parity。

先读 AGENTS.md 和 docs/plans/claude-code-parity-v2 下的 README、00、01、02、04，以及本文件。
精读 Claude Code exit/interactive interrupt 源码。第一目标是状态机正确，第二目标才是 UI 文案。
```

## Goal

Complete repeated interrupt behavior across prompts, menus, running tools, and subagents.

## Claude Sources

- `src/cli/exit.ts`
- `src/interactiveHelpers.tsx`
- `src/components/InterruptedByUser.tsx`
- `src/components/tasks/AsyncAgentDetailDialog.tsx`

## My-CLI Files

- Modify: `src/chat/interrupts.ts`
- Modify: `src/chat/keybindings.ts`
- Modify: `src/chat/typeahead.ts`
- Modify: `src/chat/index.ts`
- Modify: `src/chat/agent/subagents.ts`
- Test: `tests/ai-interrupts.test.js`
- Test: `tests/ai-keybindings.test.js`
- Test: `tests/ai-subagents.test.js`

## Required Behavior

- First Ctrl+C/Esc cancels active model/tool/subagent work.
- Esc dismisses overlays before exit confirmation.
- Second interrupt within the confirmation window exits.
- Cancelled subagents report `cancelled` and preserve partial summary when available.

## Verification

```powershell
npm run build
node --test tests/ai-interrupts.test.js tests/ai-keybindings.test.js tests/ai-subagents.test.js
node --test --test-concurrency=1 .\tests\*.test.js
```

## Commit

```powershell
git add src/chat/interrupts.ts src/chat/keybindings.ts src/chat/typeahead.ts src/chat/index.ts src/chat/agent/subagents.ts tests/ai-interrupts.test.js tests/ai-keybindings.test.js tests/ai-subagents.test.js
git commit -m "feat(ai): complete interrupt confirmation flow"
```
