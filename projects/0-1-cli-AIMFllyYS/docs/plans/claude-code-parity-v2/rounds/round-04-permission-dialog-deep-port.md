# Round 04: Permission Dialog Deep Port Handoff

## Copy This Prompt To Cursor

```text
你在 D:\new_project\My-CLI 工作。只执行 Round 04: Permission Dialog Deep Port。

先读 AGENTS.md 和 docs/plans/claude-code-parity-v2 下的 README、00、01、02、04，以及本文件。
精读本轮 Claude Code permission 源码。只移植本地权限状态机和 readline/chalk 可表达的 UI 结构，删除 analytics/account/remote policy 依赖。
```

## Goal

Port Claude Code permission option depth into the readline/chalk UI.

## Claude Sources

- `src/components/permissions/PermissionDialog.tsx`
- `src/components/permissions/PermissionPrompt.tsx`
- `src/components/permissions/PermissionRequest.tsx`
- `src/components/permissions/FallbackPermissionRequest.tsx`
- `src/components/permissions/FilePermissionDialog/permissionOptions.tsx`
- `src/components/permissions/FilePermissionDialog/usePermissionHandler.ts`
- `src/components/permissions/rules/RecentDenialsTab.tsx`

## My-CLI Files

- Modify: `src/chat/permissions/engine.ts`
- Modify: `src/chat/permissions/prompts.ts`
- Modify: `src/chat/ui/layout.ts`
- Modify: `src/chat/index.ts`
- Test: `tests/ai-permissions.test.js`
- Test: `tests/ai-permission-dialog.test.js`

## Required Behavior

- Permission options include allow once, allow for session, reject, reject with feedback, cancel.
- Session allow/deny rules can be path-prefix or command-prefix scoped.
- Recent denials are available for rendering.
- Plan mode still denies mutations.
- Chat mode remains read-only.

## Verification

```powershell
npm run build
node --test tests/ai-permissions.test.js tests/ai-permission-dialog.test.js
node --test --test-concurrency=1 .\tests\*.test.js
```

## Commit

```powershell
git add src/chat/permissions/engine.ts src/chat/permissions/prompts.ts src/chat/ui/layout.ts src/chat/index.ts tests/ai-permissions.test.js tests/ai-permission-dialog.test.js
git commit -m "feat(ai): port permission dialog options with recent denials tracking"
```
