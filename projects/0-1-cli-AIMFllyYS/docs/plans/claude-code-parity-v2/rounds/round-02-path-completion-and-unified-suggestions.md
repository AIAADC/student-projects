# Round 02: Path Completion And Unified Suggestions Handoff

## Copy This Prompt To Cursor

```text
你在 D:\new_project\My-CLI 工作。只执行 Round 02: Path Completion And Unified Suggestions。

先读 AGENTS.md 和 docs/plans/claude-code-parity-v2 下的 README、00、01、02、04，以及本文件。
精读本轮 Claude Code suggestions 相关源码。把路径、命令、技能、模型、agent 建议统一成一个可测试的数据模型。保护 UTF-8 中文路径，禁止 workspace escape。
```

## Goal

Add Claude-style path/file suggestions and merge command, path, skill, model, and agent suggestions through one source model.

## Claude Sources

- `src/hooks/useUnifiedSuggestions.ts`
- `src/utils/suggestions/*`
- `src/components/ContextSuggestions.tsx`
- `src/components/GlobalSearchDialog.tsx`

## My-CLI Files

- Create: `src/chat/suggestions.ts`
- Create: `src/chat/path-completion.ts`
- Modify: `src/chat/typeahead.ts`
- Modify: `src/chat/keybindings.ts`
- Test: `tests/ai-suggestions.test.js`
- Test: `tests/ai-path-completion.test.js`

## Required Behavior

- Workspace-relative files are suggested without leaving the workspace root.
- Windows absolute paths are normalized and denied when outside root.
- Directories, files, slash commands, active skills, model IDs, and agent definitions expose a common suggestion item type.
- Suggestions are capped and ranked deterministically.
- Chinese file names survive read, render, and test assertions.

## Verification

```powershell
npm run build
node --test tests/ai-suggestions.test.js tests/ai-path-completion.test.js tests/ai-typeahead.test.js
node --test --test-concurrency=1 .\tests\*.test.js
```

## Commit

```powershell
git add src/chat/suggestions.ts src/chat/path-completion.ts src/chat/typeahead.ts src/chat/keybindings.ts tests/ai-suggestions.test.js tests/ai-path-completion.test.js
git commit -m "feat(ai): add unified prompt suggestions and path completion"
```
