# Round 05: File Diff And Edit Permission UX Handoff

## Copy This Prompt To Cursor

```text
你在 D:\new_project\My-CLI 工作。只执行 Round 05: File Diff And Edit Permission UX。

先读 AGENTS.md 和 docs/plans/claude-code-parity-v2 下的 README、00、01、02、04，以及本文件。
精读 Claude Code 文件编辑/写入权限展示源码。实现前先补测试，确保拒绝写入不会改变文件。
```

## Goal

Make file writes/edit requests reviewable before approval.

## Claude Sources

- `src/components/permissions/FileEditPermissionRequest/FileEditPermissionRequest.tsx`
- `src/components/permissions/FileWritePermissionRequest/FileWritePermissionRequest.tsx`
- `src/components/permissions/FileWritePermissionRequest/FileWriteToolDiff.tsx`
- `src/components/FileEditToolDiff.tsx`
- `src/components/FileEditToolUpdatedMessage.tsx`

## My-CLI Files

- Modify: `src/chat/tools/fs-write.ts`
- Modify: `src/chat/tools/runner.ts`
- Modify: `src/chat/permissions/prompts.ts`
- Modify: `src/chat/ui/layout.ts`
- Test: `tests/ai-tools.test.js`
- Test: `tests/ai-permission-dialog.test.js`

## Required Behavior

- Write tool computes added, removed, and changed line summary before approval.
- New file, overwrite, and edit operations have distinct labels.
- Rejected writes leave files unchanged.
- Approved writes preserve UTF-8.

## Verification

```powershell
npm run build
node --test tests/ai-tools.test.js tests/ai-permission-dialog.test.js
node --test --test-concurrency=1 .\tests\*.test.js
```

## Commit

```powershell
git add src/chat/tools/fs-write.ts src/chat/tools/runner.ts src/chat/permissions/prompts.ts src/chat/ui/layout.ts tests/ai-tools.test.js tests/ai-permission-dialog.test.js
git commit -m "feat(ai): show file change permission previews"
```
