# Round 14: Terminal UI Visual Parity Handoff

## Copy This Prompt To Cursor

```text
你在 D:\new_project\My-CLI 工作。只执行 Round 14: Terminal UI Visual Parity。

先读 AGENTS.md 和 docs/plans/claude-code-parity-v2 下的 README、00、01、02、04，以及本文件。
精读 Claude Code design-system/messages/spinner 源码。视觉上模仿 Claude Code，但保留 My-CLI 身份，不引入完整 Ink runtime。
```

## Goal

Make terminal output feel intentionally Claude Code-inspired while keeping My-CLI identity.

## Claude Sources

- `src/components/design-system/Dialog.tsx`
- `src/components/design-system/Byline.tsx`
- `src/components/design-system/KeyboardShortcutHint.tsx`
- `src/components/design-system/Divider.tsx`
- `src/components/messages/*`
- `src/components/Spinner/*`
- `src/components/CompactSummary.tsx`

## My-CLI Files

- Modify: `src/chat/ui/theme.ts`
- Modify: `src/chat/ui/layout.ts`
- Modify: `src/chat/terminal-ui.ts`
- Modify: `src/chat/stream-renderer.ts`
- Modify: `src/chat/spinner.ts`
- Modify: `src/chat/markdown.ts`
- Test: `tests/ai-ui.test.js`
- Test: `tests/ai-prompt.test.js`

## Required Behavior

- Header, byline, timeline, permission boxes, plan approval, and final answers use one consistent visual grammar.
- No decorative clutter or marketing-like panels.
- Visible width tests prevent overflow.
- Output works with colors enabled and disabled.

## Verification

```powershell
npm run build
node --test tests/ai-ui.test.js tests/ai-prompt.test.js
node --test --test-concurrency=1 .\tests\*.test.js
```

## Commit

```powershell
git add src/chat/ui/theme.ts src/chat/ui/layout.ts src/chat/terminal-ui.ts src/chat/stream-renderer.ts src/chat/spinner.ts src/chat/markdown.ts tests/ai-ui.test.js tests/ai-prompt.test.js
git commit -m "feat(ai): polish claude inspired terminal ui"
```
