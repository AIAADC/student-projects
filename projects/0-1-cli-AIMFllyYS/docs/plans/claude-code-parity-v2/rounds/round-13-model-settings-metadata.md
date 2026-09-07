# Round 13: Model Settings Metadata Handoff

## Copy This Prompt To Cursor

```text
你在 D:\new_project\My-CLI 工作。只执行 Round 13: Model Settings Metadata。

先读 AGENTS.md 和 docs/plans/claude-code-parity-v2 下的 README、00、01、02、04，以及本文件。
精读 Claude Code model/config UI 源码。保持 provider-neutral，不添加 Claude account/provider gate。
```

## Goal

Make `/setting`, `/model`, and `/model info` robust enough for multiple custom model IDs.

## Claude Sources

- `src/commands/model/index.js`
- `src/tools/ConfigTool/*`
- `src/components/InvalidSettingsDialog.tsx`
- `src/components/InvalidConfigDialog.tsx`

## My-CLI Files

- Modify: `src/chat/config.ts`
- Modify: `src/chat/models.ts`
- Modify: `src/chat/commands.ts`
- Modify: `src/chat/index.ts`
- Modify: `.env.example`
- Test: `tests/ai-settings.test.js`
- Test: `tests/ai-config.test.js`

## Required Behavior

- `/setting` writes base URL, masked API key, model list, and active model.
- Model IDs entered with English commas become selectable.
- `/model` shows configured choices.
- `/model info` shows context length, tool support, multimodal support, provider, and source.
- `.env` writes preserve unrelated keys and Chinese content.

## Verification

```powershell
npm run build
node --test tests/ai-settings.test.js tests/ai-config.test.js
node --test --test-concurrency=1 .\tests\*.test.js
```

## Commit

```powershell
git add .env.example src/chat/config.ts src/chat/models.ts src/chat/commands.ts src/chat/index.ts tests/ai-settings.test.js tests/ai-config.test.js
git commit -m "feat(ai): enrich model settings metadata"
```
