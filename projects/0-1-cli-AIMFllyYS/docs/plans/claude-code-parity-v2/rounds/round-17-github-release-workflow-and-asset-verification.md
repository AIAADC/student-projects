# Round 17: GitHub Release Workflow And Asset Verification Handoff

## Copy This Prompt To Cursor

```text
你在 D:\new_project\My-CLI 工作。只执行 Round 17: GitHub Release Workflow And Asset Verification。

先读 AGENTS.md 和 docs/plans/claude-code-parity-v2 下的 README、00、01、02、04，以及本文件。
目标是真实 GitHub Release 附件链路，不只是本地构建。不要硬编码 token，不要推送或发布，除非用户当轮明确授权。
```

## Goal

Prove desktop builds are attached to GitHub Releases, not only local artifacts.

## My-CLI Files

- Modify: `.github/workflows/desktop-release.yml`
- Modify: `desktop/scripts/copy-cli.cjs`
- Modify: `desktop/electron-builder.yml`
- Modify: `docs/updates/CHANGELOG.md`
- Test: `tests/desktop-release-assets.test.js`

## Required Behavior

- Workflow uses repo-appropriate dependency install behavior.
- Windows and macOS jobs produce desktop artifacts.
- Release events attach packaged assets to the release page.
- Manual runs still upload workflow artifacts.
- Release panel can read latest release assets.

## Verification

```powershell
npm run build
node --test tests/desktop-release-assets.test.js
npm run desktop:build
gh release view
```

If GitHub auth is unavailable, record the exact failure and keep local workflow tests passing.

## Commit

```powershell
git add .github/workflows/desktop-release.yml desktop/scripts/copy-cli.cjs desktop/electron-builder.yml docs/updates/CHANGELOG.md tests/desktop-release-assets.test.js
git commit -m "ci(desktop): verify release asset publishing"
```
