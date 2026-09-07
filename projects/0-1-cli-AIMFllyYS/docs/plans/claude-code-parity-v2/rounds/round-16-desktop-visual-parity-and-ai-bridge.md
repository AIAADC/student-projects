# Round 16: Desktop Visual Parity And AI Bridge Handoff

## Copy This Prompt To Cursor

```text
你在 D:\new_project\My-CLI 工作。只执行 Round 16: Desktop Visual Parity And AI Bridge。

先读 AGENTS.md 和 docs/plans/claude-code-parity-v2 下的 README、00、01、02、04，以及本文件。
桌面端要更像 Claude/Codex 的工作台布局，但不能破坏 IPC 安全。AI bridge 必须和普通命令 dashboard 分离。
```

## Goal

Move desktop from command dashboard toward a usable AI shell without breaking safety.

## References

- Claude Code prompt/input and desktop handoff patterns.
- Codex-like layout direction requested by the user.

## My-CLI Files

- Modify: `desktop/src/renderer/App.tsx`
- Modify: `desktop/src/renderer/styles.css`
- Modify: `desktop/src/main/main.ts`
- Modify: `desktop/src/main/cli-runner.ts`
- Modify: `desktop/src/preload/index.ts`
- Test: `tests/desktop-actions.test.js`
- Test: `tests/desktop-config.test.js`

## Required Behavior

- Left rail, conversation surface, inspector, and composer are visually balanced.
- Mode switch mirrors CLI modes.
- Settings panel can launch safe config flows or explain CLI `/setting`.
- AI bridge does not expose raw shell.
- Any interactive AI session launch is isolated from noninteractive dashboard commands.

## Verification

```powershell
npm run build
node --test tests/desktop-actions.test.js tests/desktop-config.test.js
npm run desktop:build
```

## Commit

```powershell
git add desktop/src/renderer/App.tsx desktop/src/renderer/styles.css desktop/src/main/main.ts desktop/src/main/cli-runner.ts desktop/src/preload/index.ts tests/desktop-actions.test.js tests/desktop-config.test.js
git commit -m "feat(desktop): polish ai shell layout"
```
