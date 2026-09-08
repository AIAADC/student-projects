# Round 15: Desktop Command Dashboard Hardening Handoff

## Copy This Prompt To Cursor

```text
你在 D:\new_project\My-CLI 工作。只执行 Round 15: Desktop Command Dashboard Hardening。

先读 AGENTS.md 和 docs/plans/claude-code-parity-v2 下的 README、00、01、02、04，以及本文件。
保持桌面端 IPC 白名单和非交互安全边界。不要把任意 shell command 暴露给 renderer。
```

## Goal

Keep the desktop command surface real, safe, and non-hanging.

## References

- Existing My-CLI desktop under `desktop/**`.
- Claude Code prompt/layout components for visual density.

## My-CLI Files

- Modify: `desktop/src/renderer/App.tsx`
- Modify: `desktop/src/renderer/styles.css`
- Modify: `desktop/src/renderer/action-catalog.ts`
- Modify: `desktop/src/main/cli-runner.ts`
- Modify: `desktop/src/main/permissions.ts`
- Modify: `desktop/src/preload/index.ts`
- Test: `tests/desktop-actions.test.js`
- Test: `tests/desktop-config.test.js`

## Required Behavior

- Buttons cover `hi --clear`, `hi --skills`, `hi --install`, `hi --state`, `hi --api`, `hi --pay`.
- Clear, skills, and install use native panels with explicit confirmation.
- IPC whitelist denies arbitrary commands.
- Command output is visible and copyable.
- Renderer does not hang on interactive CLI actions.

## Verification

```powershell
npm run build
node --test tests/desktop-actions.test.js tests/desktop-config.test.js
npm run desktop:build
node --test --test-concurrency=1 .\tests\*.test.js
```

## Commit

```powershell
git add desktop/src/renderer/App.tsx desktop/src/renderer/styles.css desktop/src/renderer/action-catalog.ts desktop/src/main/cli-runner.ts desktop/src/main/permissions.ts desktop/src/preload/index.ts tests/desktop-actions.test.js tests/desktop-config.test.js
git commit -m "feat(desktop): harden command dashboard"
```
