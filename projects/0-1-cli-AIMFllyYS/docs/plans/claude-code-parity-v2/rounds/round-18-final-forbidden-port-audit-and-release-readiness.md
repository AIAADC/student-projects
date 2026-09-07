# Round 18: Final Forbidden-Port Audit And Release Readiness Handoff

## Copy This Prompt To Cursor

```text
你在 D:\new_project\My-CLI 工作。只执行 Round 18: Final Forbidden-Port Audit And Release Readiness。

先读 AGENTS.md 和 docs/plans/claude-code-parity-v2 下的 README、00、01、02、04，以及本文件。
本轮是审计和发布准备，不做大改。发现问题时只做小范围修复并解释原因。不要 push、merge、release，除非用户当轮明确授权。
```

## Goal

Close the V2 push with proof that My-CLI is provider-neutral, locally safe, and release-ready.

## Files

- Modify docs only if implementation behavior changed.
- Do not refactor runtime code in this round except for audit fixes discovered by tests.

## Required Audit

- Forbidden categories scan.
- Test and build matrix.
- Desktop build.
- Release workflow inspection.
- Local `hi` wrapper resolution check if shell behavior differs from built source.
- README and Chinese README consistency check.

## Verification

```powershell
git status --short --branch
git diff --check
npm run build
node --test --test-concurrency=1 .\tests\*.test.js
npm run desktop:build
rg -n "telemetry|analytics|OpenTelemetry|Statsig|GrowthBook|login|logout|oauth|subscription|billing|entitlement|account" src desktop tests docs
Get-Command hi -All
where.exe hi
```

## Commit

```powershell
git add README.md README_zh-CN.md docs/updates/CHANGELOG.md docs/plans/claude-code-parity-v2
git commit -m "chore(ai): complete claude parity v2 audit"
```
