# Round 03: UTF-8 And Terminal Glyph Repair Handoff

## Copy This Prompt To Cursor

```text
你在 D:\new_project\My-CLI 工作。只执行 Round 03: UTF-8 And Terminal Glyph Repair。

先读 AGENTS.md 和 docs/plans/claude-code-parity-v2 下的 README、00、01、02、04，以及本文件。
本轮目标是修复当前 AI runtime 里的中文 mojibake 和终端符号风险。不要顺手改业务逻辑。
```

## Goal

Fix mojibake in current AI runtime messages and add a regression harness that protects Chinese text and terminal glyphs.

## Claude Sources

- `src/components/design-system/KeyboardShortcutHint.tsx`
- `src/components/design-system/Byline.tsx`
- `src/components/InterruptedByUser.tsx`

## My-CLI Files

- Modify: `src/chat/provider.ts`
- Modify: `src/chat/ui/layout.ts`
- Modify: `src/chat/typeahead.ts`
- Modify: `src/chat/terminal-ui.ts`
- Test: `tests/ai-utf8.test.js`
- Test: `tests/ai-ui.test.js`

## Required Behavior

- Runtime Chinese messages are valid UTF-8.
- Rendered UI strings contain no replacement character and no known mojibake fragments.
- Terminal glyphs can be disabled or replaced by ASCII-safe fallbacks when output is not UTF-8 capable.
- Tests include at least one Chinese phrase and one Windows path with Chinese characters.

## Verification

```powershell
npm run build
node --test tests/ai-utf8.test.js tests/ai-ui.test.js tests/ai-typeahead.test.js
node --test --test-concurrency=1 .\tests\*.test.js
```

## Commit

```powershell
git add src/chat/provider.ts src/chat/ui/layout.ts src/chat/typeahead.ts src/chat/terminal-ui.ts tests/ai-utf8.test.js tests/ai-ui.test.js
git commit -m "fix(ai): protect utf8 terminal output"
```
