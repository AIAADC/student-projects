# Round 12: Subagent Activity Timeline And Scheduling Handoff

## Copy This Prompt To Cursor

```text
你在 D:\new_project\My-CLI 工作。只执行 Round 12: Subagent Activity Timeline And Scheduling。

先读 AGENTS.md 和 docs/plans/claude-code-parity-v2 下的 README、00、01、02、04，以及本文件。
精读 Claude Code LocalAgentTask、task status 和 renderToolActivity 源码。目标是父会话可见、可取消、可验收，不是接远程 agent 平台。
```

## Goal

Make subagents visible and controllable during ordinary agent conversations.

## Claude Sources

- `src/tasks/LocalAgentTask/LocalAgentTask.tsx`
- `src/tasks/types.ts`
- `src/tasks/stopTask.ts`
- `src/components/tasks/AsyncAgentDetailDialog.tsx`
- `src/components/tasks/renderToolActivity.js`
- `src/components/tasks/taskStatusUtils.js`
- `src/tools/AgentTool/agentDisplay.ts`
- `src/tools/AgentTool/runAgent.ts`

## My-CLI Files

- Modify: `src/chat/agent/subagents.ts`
- Modify: `src/chat/agent/runner.ts`
- Modify: `src/chat/agent/loop.ts`
- Modify: `src/chat/ui/layout.ts`
- Modify: `src/chat/index.ts`
- Test: `tests/ai-subagents.test.js`
- Test: `tests/ai-agent-loop.test.js`
- Test: `tests/ai-ui.test.js`

## Required Behavior

- Parent timeline renders queued, running, completed, failed, and cancelled subagent rows.
- Scheduler supports a configured concurrency of one by default and a tested path for higher concurrency.
- Cancellation propagates to running work when possible.
- Subagent results include summary, notes, tool count, permission count, and elapsed time.

## Verification

```powershell
npm run build
node --test tests/ai-subagents.test.js tests/ai-agent-loop.test.js tests/ai-ui.test.js
node --test --test-concurrency=1 .\tests\*.test.js
```

## Commit

```powershell
git add src/chat/agent/subagents.ts src/chat/agent/runner.ts src/chat/agent/loop.ts src/chat/ui/layout.ts src/chat/index.ts tests/ai-subagents.test.js tests/ai-agent-loop.test.js tests/ai-ui.test.js
git commit -m "feat(ai): render subagent activity timeline"
```
