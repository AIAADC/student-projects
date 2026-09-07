# 调研：各系统主流 Agent 客户端的 skills 目录约定

> Created: 2026-08-16
> Status: accepted
> Source: [issue #12](https://github.com/AIMFllyYS/Tmp-Skills-Hub/issues/12) · 本文全部结论均为联网查证所得，未经验证处明确标注
> 定位: 本文是「客户端 skills 目录放哪」的**事实底稿**，供发现逻辑、`doctor` 与 [store-and-paths-v0.md](../specs/store-and-paths-v0.md) §4 修订引用

## 0. TL;DR

1. **主流 CLI 客户端（Claude Code / Codex / Cursor / Gemini CLI / Qwen Code / Trae）在 macOS、Linux、Windows 三平台都把用户级 skills 放在 home 下的点目录**（`~/.<client>/skills`），没有「macOS 走 `~/Library/Application Support`」这类用户级差异。
2. 唯二的结构性例外：
   - **XDG 风格**：Devin CLI、OpenCode 的全局目录是 `~/.config/<client>/skills`（两级嵌套，不在 home 正下方）。
   - **系统级**：Codex（`/etc/codex/skills`）、Windsurf（macOS `/Library/Application Support/Windsurf/skills`、Linux/WSL `/etc/windsurf/skills`、Windows `C:\ProgramData\Windsurf\skills`）——需要管理员权限，**不属于 home 扫描范围**。
3. **`.agents/skills` 已是事实上的跨客户端标准目录**：Codex（官方）、Cursor（官方）、Gemini CLI（官方别名）、Windsurf（官方）、Cline、OpenCode（agentskills.io 标准）都读它。skills-hub 把 `.agents` 作为普通客户端目录即可自然覆盖。
4. **官方文档明确支持 symlink**：Claude Code 与 Codex 官方文档都写明「skill 目录可以是 symlink，会跟随目标」——这对本库存的链接层方案（见 core-patterns.md）是直接背书。
5. 与 store-and-paths-v0.md §4 对照：**规则 1（`<home>/<client>/skills` 直接子目录扫描）跨平台成立**，需修订的点见 §5（XDG 嵌套惯例、系统级目录边界、排除清单显式化、`.agents` 双角色）。

## 1. 已验证结论（官方一手文档）

以下每条均直接抓取官方文档核对（抓取日期 2026-08-16）。列为「已验证」。

### 1.1 Claude Code

来源：https://code.claude.com/docs/en/skills

| 作用域 | 目录 |
| --- | --- |
| 个人（personal） | `~/.claude/skills/` |
| 项目（project） | `.claude/skills/`（启动目录起向上逐级查找，直到仓库根） |
| 企业（enterprise） | 企业安装位置（文档提及，未列具体路径） |
| 保留目录 | `~/.claude/skills/synced/`（claude.ai 同步专用，勿手动写入） |
| 额外加载 | `--add-dir` / `/add-dir` 可将任意目录加入技能搜索 |

关键事实：
- 个人/项目位置下的 skill 条目**可以是 symlink**，Claude Code 跟随 symlink 并去重（同一目标从多个位置可达时只加载一份）。
- `~/.claude/skills/` 与项目 `.claude/skills/` 支持热更新（SKILL.md 文本变更即时生效；插件类变更需 `/reload-plugins`）。
- Cowork/云会话不读 `~/.claude/skills/`。

### 1.2 Codex（OpenAI）

来源：https://developers.openai.com/codex/skills（官方文档站已迁移至 learn.chatgpt.com，本文核对 2026-07-05 的 Wayback 存档：http://web.archive.org/web/20260705235947/https://developers.openai.com/codex/skills）

| 作用域 | 目录 | 说明 |
| --- | --- | --- |
| REPO | `$CWD/.agents/skills` | 启动目录 |
| REPO | `$CWD/../.agents/skills` | 启动目录上一级（Git 仓库内） |
| REPO | `$REPO_ROOT/.agents/skills` | 仓库根 |
| USER | `$HOME/.agents/skills` | 个人全局 |
| ADMIN | `/etc/codex/skills` | 机器/容器级共享 |
| SYSTEM | 随 Codex 内置 | 官方随附技能 |

关键事实：
- **Codex 扫描从 CWD 到仓库根每一级的 `.agents/skills`**；同名技能不合并、选择器里并列出现。
- **官方明确支持 symlink**：「Codex supports symlinked skill folders and follows the symlink target when scanning these locations.」
- 注意：agentskills.io 的 Skills CLI 列表仍写 Codex 全局为 `~/.codex/skills/`（见 §2.1），属新旧约定并存；**官方当前口径是 `~/.agents/skills`**，`.codex/skills` 视为旧名（本机实测仍大量存在，见 §3）。

### 1.3 Cursor

来源：https://cursor.com/help/customization/skills.md（官方 markdown 原文）

| 作用域 | 目录 |
| --- | --- |
| 项目 | `.cursor/skills/`、`.agents/skills/` |
| 全局 | `~/.cursor/skills/`、`~/.agents/skills/` |
| 兼容加载 | `.claude/skills/`、`.codex/skills/`、`~/.claude/skills/`、`~/.codex/skills/` |

关键事实：
- 项目 `.cursor/skills/` 支持**递归子目录**（skill 名 = 含 SKILL.md 的文件夹名），并支持嵌套项目子目录（如 `apps/web/.cursor/skills/`，用 `paths` 限定作用范围）。
- 官方文档同时列出 `.agents/skills`，与 Codex/Gemini 对齐。

### 1.4 Gemini CLI（Google）

来源：https://geminicli.com/docs/cli/using-agent-skills/

| 作用域 | 目录 |
| --- | --- |
| User（用户级） | `~/.gemini/skills/` 或别名 `~/.agents/skills/` |
| Workspace（工作区级） | `.gemini/skills/` 或别名 `.agents/skills/` |
| 内置 | 随 Gemini CLI 内置 |
| 扩展 | 随 extensions 打包 |

关键事实：
- 发现优先级（低→高）：内置 < 扩展 < 用户 < 工作区；同名时高优先级位置生效。
- 提供 `/skills link <path> [--scope user|workspace]` 与 `gemini skills install/link/uninstall` 终端工具。
- **`.agents/skills` 是官方一级别名**，进一步坐实跨客户端标准。

### 1.5 Windsurf（现 Cascade / Devin Desktop）

来源：https://docs.windsurf.com/windsurf/cascade/skills

| 作用域 | 目录 |
| --- | --- |
| Workspace（项目级） | `.windsurf/skills/` |
| Global（用户级） | `~/.codeium/windsurf/skills/` |
| System（macOS） | `/Library/Application Support/Windsurf/skills/` |
| System（Linux/WSL） | `/etc/windsurf/skills/` |
| System（Windows） | `C:\ProgramData\Windsurf\skills` |
| 跨 Agent 兼容 | `.agents/skills/`、`~/.agents/skills/`，可选用 `.claude/skills/`、`~/.claude/skills/` |

关键事实：
- **这是唯一明确按平台分化系统级路径的客户端**（macOS 用 `/Library/Application Support`，Linux 用 `/etc`，Windows 用 `ProgramData`），可作为「系统级目录」事实的基准来源。
- 用户级仍是 `~/.codeium/windsurf/skills`（点目录），与 §0 结论一致。

### 1.6 Devin CLI

来源：https://docs.devin.ai/cli/extensibility/skills/creating-skills

| 作用域 | 目录 |
| --- | --- |
| 项目 | `.devin/skills/` |
| 全局 | `~/.config/devin/skills/` |

关键事实：
- 全局目录走 **XDG 风格**（`~/.config/<client>/skills`），是「home 正下方点目录」规则的例外之一。

### 1.7 Qwen Code（阿里）

来源：https://github.com/QwenLM/qwen-code/blob/main/docs/users/features/skills.md（官方仓库文档）

| 作用域 | 目录 |
| --- | --- |
| Personal（个人） | `~/.qwen/skills/` |
| Project（项目） | `.qwen/skills/`（`/learn` 生成的技能落在 `.qwen/skills/learned-skill-<name>/`） |

### 1.8 Trae（字节）

来源：https://docs.trae.cn/work_skills

| 作用域 | 目录 |
| --- | --- |
| 项目 | `.trae/skills/` |
| 全局（macOS/Linux） | `~/.trae-cn/skills/` |
| 全局（Windows） | `%userprofile%/.trae-cn/skills` |

关键事实：
- 项目级与全局级目录名**不对称**（项目 `.trae`，全局 `.trae-cn`）；官方文档明确写了三平台路径，无平台分化。

### 1.9 agentskills.io —— 跨客户端标准（Vercel Labs / Skills CLI）

来源：https://agentskills.io（技能 CLI 文档，经 mintlify 镜像核对） · https://github.com/vercel-labs/skills

| 客户端 | 项目级 | 全局级 |
| --- | --- | --- |
| OpenCode | `.agents/skills/` | `~/.config/opencode/skills/` |
| Cline | `.agents/skills/` | `~/.agents/skills/` |
| Claude Code | `.claude/skills/` | `~/.claude/skills/` |
| Cursor | `.agents/skills/` | `~/.cursor/skills/` |
| Windsurf | `.windsurf/skills/` | `~/.codeium/windsurf/skills/` |
| Codex | `.agents/skills/` | `~/.codex/skills/`（旧名，见 §1.2） |

关键事实：
- 通用规则：项目级 `./<agent>/skills/`、全局级 `~/<agent>/skills/`；**支持 42+ 客户端**。
- 安装方式明确支持 **symlink（单一真源）或复制（独立）** 两种——与本库链接层/归档层设计一致。
- 注意其 Codex 条目仍写 `~/.codex/skills`，与 OpenAI 官方当前 `~/.agents/skills` 口径不同，文档标注为「旧名并存」。

## 2. 文档推断 / 低置信结论（非一手官方）

> 以下条目有出处但非客户端官方文档，或仅有本机观测，**不得作为唯一依据写进代码默认值**；供 doctor 报告时提示用户自查。

- **Amazon Q Developer CLI**：未找到官方 skills 目录文档；据其「Codex 兼容」定位推断沿用 Codex 约定（`.codex/skills` 或 `.agents/skills`），置信度低。
- **Aider**：官方文档（aider.chat、GitHub Aider-AI/aider）未发现 skills 目录章节；仅有第三方生态（AiderDesk 等）提及——**暂不纳入**，待官方支持后再补。
- **Gemini 的 `.gemini/antigravity/skills`**：本机实测存在（2026-08-16 扫描），但 Gemini CLI 官方文档只写 `~/.gemini/skills`；推断为 Antigravity 框架或旧版本的嵌套惯例，**列入嵌套惯例白名单（存在才扫），不做硬编码品牌依据**。
- **Cursor 的 `.cursor/skills-cursor`**：本机实测存在，官方文档未提及；同上按嵌套惯例白名单处理。
- **`.quickwork/skills` 等小众客户端**（QuickWork、CodeBuddy、Kiro、Qoder 系列、OpenClaw、WorkBuddy 等）：本机实测存在，未找到官方文档；由「目录形状扫描」自然覆盖，无需品牌名单。

## 3. 本机（Windows）实测对照

2026-08-16 只读扫描 `%userprofile%`（不写入任何内容）：

- 直接子目录含 `skills` 的客户端目录：**23 个**
- 嵌套惯例命中：**3 个**（`.cursor/skills-cursor`、`.gemini/antigravity/skills`、`.codeium/windsurf/skills`）
- 合计 **26 个 root**，与 store-and-paths-v0.md §0 的既有统计一致（579 份副本、190 个不同名字）。

23 个直接 root 清单：`.0-1-cli` `.agents` `.claude` `.cline` `.codebuddy` `.codex` `.continue` `.copilot` `.cursor` `.devin` `.gemini` `.grok` `.hub` `.kiro` `.openclaw` `.qoder` `.qoder-cn` `.qoderworkcn` `.quickwork` `.trae` `.trae-cn` `.windsurf` `.workbuddy`（均为 `<home>/<name>/skills` 形态）。

交叉验证：
- 官方文档确认的目录在本机全部存在（`.claude/skills`、`.agents/skills`、`.codex/skills`、`.cursor/skills`、`.gemini/skills`、`.codeium/windsurf/skills`、`.trae/skills`、`.trae-cn/skills`、`.devin/skills`、`.qwen/skills` 除 `.qwen` 外——本机未见 `.qwen` 目录）。
- `~/.config/devin/skills`（XDG 风格）本机**不存在**：DevIn CLI 虽装了（`.devin/skills` 存在），但其全局目录走 `~/.config`，说明「目录形状扫描」若不支持 XDG 嵌套就会漏掉它——见 §5 修订建议。

## 4. 应排除的位置及理由

发现逻辑不得把以下目录当作 skill root（客户端所有，更新即被覆盖，或根本不是技能资产）：

| 类别 | 例子 | 理由 |
| --- | --- | --- |
| 内置技能目录 | Codex SYSTEM 内置、Gemini 内置、Claude 内置（`builtin_skills` 等） | 随客户端发布更新，非用户资产；收入库存会导致「假副本」泛滥 |
| 插件与市场缓存 | `.claude/plugins/`、`~/.claude/skills/synced/`、Cursor/市场安装缓存 | 客户端托管、随时重装覆盖；synced 目录语义特殊（claude.ai 同步），手动写入会被覆盖 |
| 扩展目录 | `.cursor/extensions/`、`.trae/extensions/`、`.vscode/extensions/` | IDE 管理，含大量非技能内容 |
| 浏览器 profile / 缓存 | Chrome/Firefox profile、`~/.cache`、`~/.tmp` | 非技能资产 |
| 系统级技能目录 | `/etc/codex/skills`、`/etc/windsurf/skills`、`/Library/Application Support/Windsurf/skills`、`C:\ProgramData\Windsurf\skills` | 需管理员权限、机器级共享；home 扫描无权限也无需触碰，留给 doctor 提权检测 |
| 本项目自己的目录 | `~/.skills-hub/`、`~/.skills-hub.pre-bootstrap-*`、调用方声明的库存根 | 形状扫描会把带 `skills/` 的自有目录当成客户端；每跑一次 bootstrap 就把上次备份再备一遍，库存自己也会自我收录。按前缀排除 `skills-hub` 及其带后缀变体；库存根由调用方显式传入后整棵子树跳过（#98） |

实现提示：形状判定（`<home>/<client>/skills`）天然排除了大部分——它们要么不叫 `skills`，要么不在 home 下；需要显式过滤的只有「恰好叫 `builtin_skills` 之类」的目录与 `synced` 保留目录。

## 5. 与 store-and-paths-v0.md §4 对照及修订建议

现状（§4 原文）：

1. 扫描 `<home>` 下每个直接子目录，凡存在 `<home>/<client>/skills` 即为一个 root
2. 追加三个已知嵌套惯例（存在才算）：`.cursor/skills-cursor`、`.gemini/antigravity/skills`、`.codeium/windsurf/skills`
3. 解析真实路径并去重
4. 排除 builtin_skills、插件/市场缓存、扩展目录、浏览器 profile、临时目录

对照结论：

| # | 结论 | 修订建议 |
| --- | --- | --- |
| 1 | 规则 1 在 macOS/Linux 同样成立（§1 全部官方文档的用户级目录均为 home 点目录） | **保留，无需改**。`.agents` 会被当作普通客户端目录自然覆盖 |
| 2 | 嵌套惯例清单需要扩充与标注 | 追加 **XDG 嵌套惯例**：`<home>/config/<client>/skills`（Devin CLI、OpenCode 官方路径）；既有三项保留（`.gemini/antigravity/skills`、`.cursor/skills-cursor` 官方未提及，标注为「本地观测、白名单性质」） |
| 3 | 真实路径去重是刚需 | **保留**。尤其 `.codex/skills` 与 `.agents/skills`、`.claude/skills` 与 `.agents/skills` 可能互为 symlink（Cursor 兼容加载、Gemini 别名），不去重会重复计数 |
| 4 | 排除清单需显式化 | 按本文 §4 表格细化；补充 `synced` 保留目录（`~/.claude/skills/synced/`） |
| 新增 | 系统级目录（`/etc/<client>/skills`、`/Library/Application Support/...`、`ProgramData`） | 明确「**不在 home 扫描范围**」；作为 doctor 的可选提权检测项记录，防止未来有人误加进 home 扫描 |
| 新增 | 同名冲突语义 | 官方口径不统一：Gemini 高优先级覆盖、Codex 并列显示。skills-hub 的 `origins` 多来源模型（已随 #11 落地）正好吸收这一差异，无需发现层做优先级 |

建议的 §4 修订后版本（供后续 PR 落地，本文不直接改规范）：

> 1. 扫描 `<home>` 下每个直接子目录，凡存在 `<home>/<client>/skills` 即为一个 root（`.agents` 视为普通客户端目录，天然覆盖跨客户端标准）
> 2. 追加已知嵌套惯例（存在才算）：`.cursor/skills-cursor`、`.gemini/antigravity/skills`、`.codeium/windsurf/skills`、`config/<client>/skills`（XDG 风格，Devin CLI / OpenCode）
> 3. 解析真实路径并去重（`.codex/skills` 与 `.agents/skills` 等可能互为 symlink）
> 4. 排除：`builtin_skills`、`~/.claude/skills/synced/`、插件/市场缓存、扩展目录、浏览器 profile、临时目录、本项目自己的目录（`skills-hub` 及 `skills-hub.*` 前缀）、调用方声明的库存根；系统级目录（`/etc/<client>/skills`、`/Library/Application Support/...`、`ProgramData`）不在 home 扫描范围，留给 doctor 提权检测
> 5. 绝不创建不存在的 root（不变）

## 6. 来源清单

| 客户端 | 来源 | 类型 |
| --- | --- | --- |
| Claude Code | https://code.claude.com/docs/en/skills | 官方文档（已验证） |
| Codex | https://developers.openai.com/codex/skills（Wayback 2026-07-05 存档：http://web.archive.org/web/20260705235947/https://developers.openai.com/codex/skills） | 官方文档（已验证） |
| Cursor | https://cursor.com/help/customization/skills.md | 官方文档（已验证） |
| Gemini CLI | https://geminicli.com/docs/cli/using-agent-skills/ | 官方文档（已验证） |
| Windsurf | https://docs.windsurf.com/windsurf/cascade/skills | 官方文档（已验证） |
| Devin CLI | https://docs.devin.ai/cli/extensibility/skills/creating-skills | 官方文档（已验证） |
| Qwen Code | https://github.com/QwenLM/qwen-code/blob/main/docs/users/features/skills.md | 官方仓库文档（已验证） |
| Trae | https://docs.trae.cn/work_skills | 官方文档（已验证） |
| agentskills.io | https://agentskills.io · https://github.com/vercel-labs/skills | 跨客户端标准（已验证） |
| 本机实测 | 2026-08-16 只读扫描 `%userprofile%`（26 root） | 实证（Windows） |

> 全部网页于 2026-08-16 抓取核对。macOS/Linux 路径为官方文档所述，未在真机复现（本机仅 Windows），故 §1 归类为「已验证=官方文档核对」，§2 为「推断/低置信」——引用时请保持此区分。
