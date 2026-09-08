# Round 01: Slash Command Registry And Menu Parity Handoff

## Copy This Prompt To Cursor

```text
你在 D:\new_project\My-CLI 工作。只执行 Round 01: Slash Command Registry And Menu Parity。

先读 AGENTS.md、docs/plans/claude-code-parity-v2/README.md、00-global-spec.md、01-current-state-and-gap-audit.md、02-claude-source-transplant-map.md、04-verification-and-handoff.md，以及本文件。

然后精读本轮列出的 Claude Code 源文件。优先复制/改造 Claude Code 的 command registry 和 prompt footer suggestion 结构，不要从 0 重新发明。删除或绕开登录、遥测、账号、计费、Anthropic 内部逻辑。
```

## Goal

Make slash command definitions and `/` menu behavior closer to Claude Code while preserving current command execution.

## Claude Sources

- `src/commands.ts`
- `src/types/command.ts`
- `src/components/PromptInput/PromptInputFooterSuggestions.tsx`
- `src/components/PromptInput/PromptInputHelpMenu.tsx`
- `src/components/PromptInput/PromptInputModeIndicator.tsx`

## My-CLI Files

- Modify: `src/chat/commands.ts`
- Modify: `src/chat/typeahead.ts`
- Modify: `src/chat/ui/layout.ts`
- Test: `tests/ai-typeahead.test.js`
- Test: `tests/ai-ui.test.js`

## Required Behavior

- Commands have stable IDs, aliases, argument hints, mode availability, source labels, and category labels.
- `/` menu groups commands in this order: Mode, Agent, Runtime, Skills, Help.
- Hidden commands never render.
- Canonical commands still execute when selected through aliases.
- Existing `/agent spawn`, `/model info`, `/skill`, and `/search` behavior remains intact.

## Verification

```powershell
npm run build
node --test tests/ai-typeahead.test.js tests/ai-ui.test.js
node --test --test-concurrency=1 .\tests\*.test.js
```

## Commit

```powershell
git add src/chat/commands.ts src/chat/typeahead.ts src/chat/ui/layout.ts tests/ai-typeahead.test.js tests/ai-ui.test.js
git commit -m "feat(ai): port slash command menu shape"
```
