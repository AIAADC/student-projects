# Round 08: Query Engine And Tool Pairing Discipline Handoff

## Copy This Prompt To Cursor

```text
你在 D:\new_project\My-CLI 工作。只执行 Round 08: Query Engine And Tool Pairing Discipline。

先读 AGENTS.md 和 docs/plans/claude-code-parity-v2 下的 README、00、01、02、04，以及本文件。
精读 Claude Code query/tool orchestration 源码。保持 provider-neutral OpenAI-compatible，不复制 Claude billing、entitlement、model router、account state。
```

## Goal

Port Claude Code's message/tool loop discipline into the provider-neutral agent loop.

## Claude Sources

- `src/query.ts`
- `src/QueryEngine.ts`
- `src/tools.ts`
- `src/Tool.ts`
- `src/services/tools/toolExecution.ts`
- `src/services/tools/toolOrchestration.ts`
- `src/services/tools/StreamingToolExecutor.ts`
- `src/utils/messages.js`

## My-CLI Files

- Modify: `src/chat/agent/loop.ts`
- Modify: `src/chat/tools/runner.ts`
- Modify: `src/chat/tools/registry.ts`
- Modify: `src/chat/provider.ts`
- Test: `tests/ai-agent-loop.test.js`
- Test: `tests/ai-tool-loop.test.js`

## Required Behavior

- Every assistant tool call receives exactly one tool result unless interrupted.
- Multiple tool calls preserve order.
- Malformed JSON arguments return a structured tool error.
- Unknown tools are denied and reported.
- Max tool rounds stop with a clear assistant message.
- Custom OpenAI-compatible providers receive tool specs when mode allows them.

## Verification

```powershell
npm run build
node --test tests/ai-agent-loop.test.js tests/ai-tool-loop.test.js
node --test --test-concurrency=1 .\tests\*.test.js
```

## Commit

```powershell
git add src/chat/agent/loop.ts src/chat/tools/runner.ts src/chat/tools/registry.ts src/chat/provider.ts tests/ai-agent-loop.test.js tests/ai-tool-loop.test.js
git commit -m "feat(ai): enforce provider tool loop discipline"
```
