# Codex Goal 审查 — 激发提示词

> 复制以下内容粘贴到 Codex / Cursor 即可启动审查。详细标准见 `codex-goal-audit.md`。

---

```text
你在 D:\new_project\My-CLI 工作。任务：审查并修复项目，达到 docs/plans/claude-code-parity-v2/rounds/codex-goal-audit.md 中定义的全部标准。

Claude Code 源码参考：D:\project\MCP-Skills\ClaudeCode-Collection\ClaudeCode-Collection\claude-code-source

执行步骤：
1. 读 codex-goal-audit.md，理解 7 个审查维度的全部检查项
2. 读 AGENTS.md、00-global-spec.md、01-current-state-and-gap-audit.md、02-claude-source-transplant-map.md
3. 逐维度检查，不达标的直接修复代码
4. 每轮修复后跑 npm run build + 全量测试 + git diff --check
5. 全部完成后 commit，输出审查报告（每个维度 PASS/PARTIAL/FAIL + 问题清单 + commit hash）

禁止：不 push，不 merge，不发 release。保护 UTF-8 中文。
```
