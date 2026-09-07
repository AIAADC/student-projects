# Codex Goal 审查指令

> 本文件用于 Codex / Claude / Cursor 审查会话，全面检验 Claude Code Parity V2 的落地质量。

---

## 审查前置条件

```text
你在 D:\new_project\My-CLI 工作。

必须先阅读：
1. AGENTS.md
2. package.json
3. docs/plans/claude-code-parity-v2/README.md
4. docs/plans/claude-code-parity-v2/00-global-spec.md
5. docs/plans/claude-code-parity-v2/01-current-state-and-gap-audit.md
6. docs/plans/claude-code-parity-v2/02-claude-source-transplant-map.md
7. docs/plans/claude-code-parity-v2/04-verification-and-handoff.md

Claude Code 源码路径：
D:\project\MCP-Skills\ClaudeCode-Collection\ClaudeCode-Collection\claude-code-source

审查规则：
- 每个维度必须给出 PASS / PARTIAL / FAIL 评级
- 发现问题必须附带：文件路径 + 行号 + 具体修复建议
- 不做大改，只记录问题并给出修复方案
- 完成后输出审查报告
```

---

## 维度一：CLI 功能完整性

### 1.1 三模式运行

| 检查项 | 如何验证 | 预期 |
|--------|----------|------|
| `/chat` 模式 | 输入 `/chat` 后尝试调用 write/shell 工具 | 应被拒绝，显示权限提示 |
| `/agent` 模式 | 输入 `/agent` 后调用 write/shell 工具 | 应弹出权限审批对话框 |
| `/plan` 模式 | 输入 `/plan` 后尝试写文件 | 应被拒绝，plan 模式不允许写入 |
| 模式切换 | 连续执行 `/chat` → `/agent` → `/plan` → `/chat` | 每次切换应更新状态头和权限 |

### 1.2 工具循环

| 检查项 | 如何验证 | 预期 |
|--------|----------|------|
| 单工具调用 | AI 调用 `read_file` | 返回文件内容 |
| 多工具顺序 | AI 连续调用 read + write | 按声明顺序执行，每 call 有 result |
| malformed JSON | 构造错误参数的 tool call | 返回结构化 error |
| unknown tool | 引用不存在的 tool name | 返回 `Tool denied: unknown tool` |
| max rounds | 循环调用超过上限 | 明确停止消息 |

### 1.3 权限系统

| 检查项 | 如何验证 | 预期 |
|--------|----------|------|
| allow once | 选择允许一次 | 执行后恢复 ask 状态 |
| session allow | 选择本次会话允许 | 本次会话内该 tool 不再询问 |
| deny | 选择拒绝 | 工具不执行，返回拒绝消息 |
| deny with feedback | 输入拒绝理由 | 理由反馈给 AI |
| bypass 模式 | `--auto-accept` 启动 | 允许 workspace 内写入，workspace 外仍拒绝 |
| catastrophic 命令 | bypass 下执行 `rm -rf /` | 仍被拒绝 |
| recent denials | 多次拒绝后查看 | 显示最近拒绝历史 |

### 1.4 中断系统

| 检查项 | 如何验证 | 预期 |
|--------|----------|------|
| 首次 Ctrl+C | AI 正在运行时按 Ctrl+C | 取消当前任务，显示中断消息 |
| Esc 关闭菜单 | 输入 `/` 弹出菜单后按 Esc | 关闭菜单，不退出 |
| 二次确认退出 | 连续按两次 Ctrl+C（1200ms 内） | 退出 AI 会话 |
| 确认窗口超时 | 第一次 Ctrl+C 后等 2 秒再按 | 视为新的首次中断 |
| 子 agent 取消 | 按 Ctrl+C 取消运行中的子 agent | 状态变为 cancelled，保留 partial summary |

### 1.5 斜杠命令

| 检查项 | 如何验证 | 预期 |
|--------|----------|------|
| `/` 菜单 | 输入 `/` | 显示分组命令列表 |
| 命令补全 | 输入 `/mo` 后按 Tab | 补全为 `/model` |
| 中文参数 | `/plan 重构这个函数` | 正确接收中文参数 |
| `/setting` | 执行设置流程 | 写入 `.env`，掩码显示 API key |
| `/model` | 切换模型 | 显示可选模型列表 |
| `/model info` | 查看模型详情 | 显示上下文长度、工具支持、多模态、厂商、来源 |
| `/skills` | 查看技能列表 | 显示已发现的技能 |
| `/skills search <q>` | 搜索技能 | 按 ID/name/description 排名 |
| `/agent defs` | 查看 agent 定义 | 列出内置 + 用户定义的 agent |
| `/agent spawn <id>` | 启动子 agent | 创建新 agent 任务 |

---

## 维度二：CLI 视觉质量（Claude Code 风格复刻）

### 2.1 启动画面

```text
必须包含：
- 项目名称
- 当前模式（chat/agent/plan）
- 权限模式（ask/bypass）
- 活跃模型名称
- 活跃技能数量
- 运行中子 agent 数量
- 键盘快捷键提示行（如 "Esc back · Ctrl+C interrupt"）
```

**参照 Claude Code 源码：**
- `src/components/CompactSummary.tsx` — 紧凑状态头
- `src/components/design-system/Byline.tsx` — `·` 分隔的 byline
- `src/components/design-system/KeyboardShortcutHint.tsx` — 快捷键提示

### 2.2 对话交互区

```text
必须包含：
- 用户输入有明确的 prompt 前缀（区分模式）
- AI 回答有 assistant header + byline
- 代码块有语言标签和框线
- 流式输出逐字渲染，不卡顿
- 分隔线用 ─ 而不是 - 或 =
```

**参照 Claude Code 源码：**
- `src/components/messages/AssistantTextMessage.tsx` — 回答消息结构
- `src/components/design-system/Divider.tsx` — 分隔线
- `src/components/design-system/Dialog.tsx` — 对话框

### 2.3 工具执行显示

```text
必须包含：
- 工具调用前显示工具名 + 参数摘要
- 执行中显示 spinner（ASCII/Unicode 自适应）
- 执行后显示结果摘要或错误
- 子 agent 活动在 timeline 中渲染（queued/running/completed/failed/cancelled）
```

**参照 Claude Code 源码：**
- `src/components/Spinner/SpinnerGlyph.tsx` — spinner 帧
- `src/components/tasks/renderToolActivity.js` — 工具活动行
- `src/components/tasks/taskStatusUtils.js` — 状态图标

### 2.4 权限和计划审批面板

```text
权限面板必须：
- 显示工具名 + 操作标签（read/write/shell）
- 文件变更显示具体路径和操作类型
- 显示选项：allow once / session allow / deny
- 最近拒绝历史

计划审批面板必须：
- 从磁盘读取 plan 内容
- 显示为 Claude Code 风格的 ready-to-code review 面板
- 权限请求仅展示，不自动授予
```

**参照 Claude Code 源码：**
- `src/components/permissions/ExitPlanModePermissionRequest/ExitPlanModePermissionRequest.tsx`
- `src/tools/ExitPlanModeTool/prompt.ts`

### 2.5 颜色与主题

```text
- 颜色启用时：语义着色（成功绿、错误红、警告黄、信息蓝）
- 颜色禁用时（NO_COLOR=1）：纯文本可读，无 ANSI 转义序列残留
- 所有渲染器不溢出终端宽度
- 中文内容无乱码（UTF-8 完好，无 U+FFFD 替换字符）
```

### 2.6 审查命令

```powershell
# 启动 CLI 观察启动画面
node dist/index.js --ai

# 颜色禁用测试
NO_COLOR=1 node dist/index.js --ai

# 中文 UTF-8 检查
rg -n "\x{FFFD}|鏃|璇|鎶|瀛|鈥|鈼" src/chat/ tests/

# 可见宽度溢出检查（审查代码中的 truncate/width 逻辑）
grep -rn "truncate\|visibleWidth\|maxWidth" src/chat/ui/ src/chat/terminal-ui.ts
```

---

## 维度三：桌面端真实复刻（Codex 桌面端）

### 3.1 布局结构

```text
Codex 桌面端布局 → My-CLI 对应：

┌─────────┬──────────────────┬──────────┐
│  Left   │                  │ Inspector│
│  Rail   │  Conversation    │ (Plan/   │
│ (Nav/   │  Surface         │  Tools/  │
│  Mode)  │                  │  Diff/   │
│         │                  │  Settings│
├─────────┴──────────────────┴──────────┤
│           Composer / Prompt           │
└───────────────────────────────────────┘

检查项：
- 左侧栏：模式切换、会话列表（或占位）
- 中间区域：对话/命令输出
- 右侧栏：Inspector（可关闭）
- 底部：输入区（composer）
- 布局平衡，不偏不挤
```

### 3.2 命令面板（Dashboard）

```text
必须覆盖的命令按钮：
- hi --clear    → native panel + 确认
- hi --skills   → native panel + 确认
- hi --install  → native panel + 确认
- hi --state    → 直接输出，可复制
- hi --api      → 直接输出，可复制
- hi --pay      → 直接输出，可复制

禁止经 cli:run IPC 执行的命令（必须走 native panel）：
clear, skills, install, ai, guide
```

### 3.3 AI Bridge

```text
安全要求：
- AI 启动走专用 IPC（ai:launch），不走 cli:run
- AI 在外部终端启动 hi --ai，不在 renderer 内嵌
- renderer 不能向 shell 发送任意命令字符串
- Settings 面板引导用户在终端运行 /setting，不通过 IPC 收集 API key
```

### 3.4 审查命令

```powershell
# 桌面构建
npm run desktop:build

# 启动桌面应用
npm run desktop:dist:win

# 检查 IPC 安全
grep -rn "shell:" desktop/src/
grep -rn "exec\|spawn\|child_process" desktop/src/renderer/

# 检查白名单完整性
grep -rn "allowedCommands\|VALID_COMMANDS\|whitelist" desktop/src/
```

### 3.5 对照源码

```text
Codex 桌面端参照：
- Claude Code: src/components/DesktopHandoff.tsx — 桌面/CLI 分离
- Claude Code: src/components/PromptInput/ — 输入区组件
- Claude Code: src/components/tasks/ — 任务面板

My-CLI 桌面端实际文件：
- desktop/src/main/main.ts — Electron 主进程
- desktop/src/main/cli-runner.ts — CLI 执行器
- desktop/src/main/permissions.ts — IPC 白名单
- desktop/src/preload/index.ts — 预加载脚本
- desktop/src/renderer/App.tsx — React 渲染器
- desktop/src/renderer/action-catalog.ts — 命令目录
- desktop/src/renderer/styles.css — 样式
```

---

## 维度四：Claude Code 源码移植追溯

### 4.1 每个移植模块必须可追溯

```text
检查方式：对每个 src/chat/** 文件，确认存在对应的 Claude Code 源码引用。

格式要求（在代码注释或文档中）：
// Ported from: src/cli/exit.ts
// Adapted: removed process.exit, Anthropic-only branches
```

### 4.2 必须存在的移植链路

| My-CLI 文件 | Claude Code 源码 | 移植要点 |
|-------------|-----------------|----------|
| `src/chat/interrupts.ts` | `src/cli/exit.ts`, `src/hooks/useExitOnCtrlCD.ts` | 双次确认、首次取消 |
| `src/chat/keybindings.ts` | `src/hooks/useDoublePress.ts` | 确认窗口超时 |
| `src/chat/agent/loop.ts` | `src/query.ts`, `src/QueryEngine.ts` | 工具循环纪律 |
| `src/chat/tools/runner.ts` | `src/services/tools/toolExecution.ts` | 结构化错误 |
| `src/chat/plan-store.ts` | `src/tools/ExitPlanModeTool/ExitPlanModeV2Tool.ts` | 磁盘读 plan |
| `src/chat/modes.ts` | `src/commands/plan/plan.tsx` | plan 审批生命周期 |
| `src/chat/skills/**` | `src/skills/loadSkillsDir.ts`, `src/tools/SkillTool/` | 发现、搜索、按需加载 |
| `src/chat/agent/definitions.ts` | `src/tools/AgentTool/builtInAgents.ts` | 内置 agent 定义 |
| `src/chat/agent/subagents.ts` | `src/tasks/LocalAgentTask/LocalAgentTask.tsx` | 任务生命周期 |
| `src/chat/agent/runner.ts` | `src/tools/AgentTool/runAgent.ts` | 子 agent 执行 |
| `src/chat/models.ts` | `src/commands/model/index.ts` | 模型 metadata |
| `src/chat/config.ts` | `src/tools/ConfigTool/supportedSettings.ts` | 设置项校验 |
| `src/chat/ui/theme.ts` | `src/components/design-system/` | 视觉语法 |
| `src/chat/ui/layout.ts` | `src/components/CompactSummary.tsx` | 状态头/面板 |
| `src/chat/stream-renderer.ts` | `src/components/messages/` | 流式渲染 |
| `src/chat/spinner.ts` | `src/components/Spinner/` | 加载动画 |
| `src/chat/markdown.ts` | `src/components/messages/AssistantTextMessage.tsx` | 终端 markdown |

### 4.3 审查命令

```powershell
# 检查注释中的源码引用
grep -rn "Ported from\|Adapted from\|移植自\|源码来源" src/chat/ --include="*.ts"

# 检查是否存在 Claude Code 源码目录
ls "D:\project\MCP-Skills\ClaudeCode-Collection\ClaudeCode-Collection\claude-code-source\src"

# 交叉验证：My-CLI 文件 vs transplant map
# 对照 02-claude-source-transplant-map.md 中的映射表
```

---

## 维度五：Release 页面规范

### 5.1 CHANGELOG 格式

```markdown
必须包含：
- 版本号（与 package.json 一致）
- 发布日期
- 变更分类：Added / Changed / Fixed / Removed
- 每条变更一行，简洁明确
- 中文内容 UTF-8 完好
```

**审查文件：** `docs/updates/CHANGELOG.md`

### 5.2 GitHub Release 页面

```text
Release 页面必须：
- Tag 格式：v{version}（如 v0.6.15）
- Title 格式：{Product} v{version}
- Body 包含：
  - 变更摘要（changelog 摘选）
  - 安装说明（Windows/macOS/Linux）
  - 校验和（可选但推荐）
  - 已知问题（如有）
- Assets 包含：
  - Windows: .exe（安装器）
  - macOS: .dmg
  - GitHub Actions 自动附加

审查命令：
gh release view
gh release list --limit 5
```

### 5.3 README 更新

```text
README.md 和 README_zh-CN.md 必须：
- 版本号与 package.json 一致
- 命令示例反映当前实际可用命令
- AI 功能描述覆盖三模式（chat/agent/plan）
- 中文内容 UTF-8 完好

审查命令：
grep -n "version\|版本" README.md README_zh-CN.md
diff <(grep -oP '(?<=hi )--\w+' README.md) <(grep -oP '(?<=hi )--\w+' README_zh-CN.md)
```

---

## 维度六：Forbidden-Port 扫描

### 6.1 禁止项清单

```text
绝不能出现在运行时代码中的类别：

1. Login / Logout / OAuth / Account detection / Subscription checks
2. Telemetry / OpenTelemetry / Analytics / Statsig / GrowthBook
3. Billing / Quota / Pricing / Entitlement / Trusted-device flows
4. Remote bridge / CCR / Chrome bridge / Mobile bridge
5. Anthropic employee-only commands / Internal agents platform
6. Any feature sending local metadata to Anthropic without user request
```

### 6.2 审查命令

```powershell
# 全量禁止项扫描
rg -n "telemetry|analytics|OpenTelemetry|Statsig|GrowthBook|login|logout|oauth|subscription|billing|entitlement|account" src desktop tests docs

# 允许命中：
# - docs/ 中描述禁止类别的文档
# - tests/ 中断言禁止行为不存在的测试
# - src/modules/github/ 中的 gh auth 本地辅助

# 禁止命中：
# - src/chat/ 中的 runtime imports
# - desktop/src/main/ 中的 IPC handlers
# - .github/workflows/ 中的第三方 analytics 步骤
```

---

## 维度七：测试与构建矩阵

### 7.1 完整验证命令

```powershell
# 1. TypeScript 编译
npm run build

# 2. 全量测试
node --test --test-concurrency=1 .\tests\*.test.js
# 预期：277+ pass, 0 fail, 1 skip (symlink)

# 3. 桌面构建
npm run desktop:build

# 4. Whitespace 检查
git diff --check

# 5. Git 状态
git status --short --branch

# 6. 禁止项扫描
rg -n "telemetry|analytics|OpenTelemetry|Statsig|GrowthBook" src/ desktop/
rg -n "billing|entitlement|subscription" src/ desktop/
rg -n "login|logout|oauth" src/ --type ts
# 预期：仅 GitHub gh auth 辅助命中，无 runtime 违规

# 7. hi 命令解析
Get-Command hi -All
where.exe hi
node dist/index.js --ai --help

# 8. 中文 UTF-8 完整性
rg -n "\x{FFFD}" src/ desktop/ docs/ tests/
# 预期：无命中
```

---

## 审查报告模板

```markdown
# Codex Goal 审查报告

**审查日期：** YYYY-MM-DD
**审查版本：** v0.X.X
**审查人：** [名字]

## 评级总览

| 维度 | 评级 | 说明 |
|------|------|------|
| CLI 功能完整性 | PASS/PARTIAL/FAIL | ... |
| CLI 视觉质量 | PASS/PARTIAL/FAIL | ... |
| 桌面端复刻 | PASS/PARTIAL/FAIL | ... |
| 源码移植追溯 | PASS/PARTIAL/FAIL | ... |
| Release 规范 | PASS/PARTIAL/FAIL | ... |
| 禁止项合规 | PASS/PARTIAL/FAIL | ... |
| 测试与构建 | PASS/PARTIAL/FAIL | ... |

## 问题清单

### [P0] 严重问题（阻塞发布）
1. [文件:行号] 问题描述 → 修复建议

### [P1] 重要问题（影响体验）
1. [文件:行号] 问题描述 → 修复建议

### [P2] 改进建议（不阻塞）
1. [文件:行号] 问题描述 → 修复建议

## 修复计划

| 优先级 | 问题 | 负责人 | 预计时间 |
|--------|------|--------|----------|
| P0 | ... | ... | ... |
```
