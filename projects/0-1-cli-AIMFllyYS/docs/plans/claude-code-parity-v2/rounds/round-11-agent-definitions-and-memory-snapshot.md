# Round 11: Agent Definitions And Memory Snapshot Handoff

## Copy This Prompt To Cursor

```text
你在 D:\new_project\My-CLI 工作。只执行 Round 11: Agent Definitions And Memory Snapshot。

先读 AGENTS.md 和 docs/plans/claude-code-parity-v2 下的 README、00、01、02、04，以及本文件。
精读 Claude Code AgentTool agent definitions 和 memory snapshot 源码。只做本地 agent 定义，不接远程/内部 teammate 平台。
```

## Goal

Port built-in/local agent definition loading and parent context snapshots.

## Claude Sources

- `src/tools/AgentTool/loadAgentsDir.ts`
- `src/tools/AgentTool/builtInAgents.ts`
- `src/tools/AgentTool/agentMemory.ts`
- `src/tools/AgentTool/agentMemorySnapshot.ts`
- `src/tools/AgentTool/built-in/generalPurposeAgent.ts`
- `src/tools/AgentTool/built-in/exploreAgent.ts`
- `src/tools/AgentTool/built-in/planAgent.ts`
- `src/tools/AgentTool/built-in/verificationAgent.ts`

## My-CLI Files

- Modify: `src/chat/agent/definitions.ts`
- Modify: `src/chat/agent/prompt.ts`
- Modify: `src/chat/agent/types.ts`
- Modify: `src/chat/commands.ts`
- Test: `tests/ai-subagents.test.js`

## Required Behavior

- Built-in agents have stable IDs, descriptions, default tools, and default permission narrowing.
- Local agent definition discovery supports project and user roots.
- Subagent prompt includes parent mode, model, plan file, active skills, and relevant recent messages.
- No subagent can widen parent permission.

## Verification

```powershell
npm run build
node --test tests/ai-subagents.test.js
node --test --test-concurrency=1 .\tests\*.test.js
```

## Commit

```powershell
git add src/chat/agent/definitions.ts src/chat/agent/prompt.ts src/chat/agent/types.ts src/chat/commands.ts tests/ai-subagents.test.js
git commit -m "feat(ai): port local agent definition loading"
```
