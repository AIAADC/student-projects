# SKILLS · 用到的 Skills 与方法论

> 文档状态：补充说明；现行架构、字段、能力和激活规则以 [01_architecture.md](spec/01_architecture.md) 为唯一权威。

复刻"同款质量"的关键，不在提示词文字，而在 AI 收到后动用的 **skills / 能力**。本文逐项说明本项目用了什么、在哪一步、怎么用，并补上**最新一轮迭代**（AI 助手 + 懒加载 + 独立滚动 + 导航重组 + 本复刻文档包重建）新动用的方法。`skill` 指 Claude Code 的 Skill 系统。

> 相关文档：项目宪法 [`../AGENTS.md`](../AGENTS.md)；复刻提示词 [`./PROMPT.md`](./PROMPT.md)；解密规格 [`./spec/03_decryption.md`](./spec/03_decryption.md)；提炼规格 [`./spec/06_insights.md`](./spec/06_insights.md)；前端规格 [`./spec/08_frontend.md`](./spec/08_frontend.md)；AI 助手规格 [`./spec/09_ai-assistant.md`](./spec/09_ai-assistant.md)。

---

## 触发器：`ultracode`

在提示词里写 `ultracode`，让 AI 这一轮启用 **多 agent Workflow 编排**（大规模并行的提炼与综述靠它）。没有它，AI 默认不会自发起几十上百个子 agent。这是整条流水线"提炼/综述"阶段能跑起来的开关。

## 1. `superpowers` / `using-superpowers`（技能发现框架）

会话起手的元框架：要求"任何任务前先检查有没有可用 skill 再动手"。它让 AI 主动去用下面这些 skill，而不是埋头硬写。复刻时若环境装了 superpowers 插件即自动生效。

## 2. `frontend-design`（**用户硬要求**："审美必须结合 skills"）

做前端那一步 **MUST** 调用。它引导 AI 先定一个**大胆且自洽的审美方向**再写代码，避免"AI 通用风"。

- 本项目选定方向：**「午夜书斋 / Midnight Study」**——温暖深色编辑风（金/玉/锈点缀、Fraunces 衬线 + Hanken Grotesk + CJK、颗粒质感、发丝金线）。设计令牌见 [`./spec/08_frontend.md`](./spec/08_frontend.md)。
- 复刻者 MAY 换方向（如"羊皮纸学术风""赛博档案馆"），但 **MUST 真的调用该 skill 并先承诺一个方向**——这是质量分水岭。
- **本轮迭代同样适用**：新增的 AI 助手面板、懒加载/独立滚动、导航重组等前端改造，**全部在既有「午夜书斋」体系内**继续套用 `frontend-design`（沿用同一套设计令牌与质感，不另起炉灶）。

## 3. Workflow / 多 agent 编排（`ultracode` 启用）—— 本项目的主力

用 **Workflow 工具**做确定性的并行扇出：

- **提炼扇出**：**467 个 Sonnet agent**，每个读一份会话 digest、写一个 nugget JSON。
- **综述**：**13 个 Opus agent**，每个把一类 nugget 写成一篇富文本总结板。
- **补跑**：对漏掉的会话再起一批。
- **编排经验 / 陷阱（复刻 MUST 看）**：
  - 别用"一个 bootstrap agent 经 schema 返回几百条清单"——会卡死；改成把清单**经 `args` 传入** workflow 脚本（脚本里 `JSON.parse(args)`，因为 args 常以字符串到达）。
  - 子 agent **自己 Write 文件**、只回一行状态——避免把几百条结果回传主上下文导致爆窗。
  - 模型分工：例行提炼用 **Sonnet**（快/省），旗舰综述用 **Opus**（质量）。
  - 并发上限约 14；Read 有 2000 行上限；LLM 写 JSON 会漏转义引号（见 [`./spec/06_insights.md`](./spec/06_insights.md) 的 `json-repair` 修法）。

## 4. `AskUserQuestion`（决策门，替代了正式 brainstorming）

在两个"该用户拍板"的岔路用选项卡征询，而非自作主张：

- **解密方式**（自写脚本 / 成熟工具 / 两者）。
- **前端改造范围**（重做前端 / 现有上扩展 / 整站重写）。
- **诚实说明**：`superpowers` 体系本推荐"创作前先用 `brainstorming` skill"；本项目因需求已极其具体，**用 `AskUserQuestion` 的定点决策替代了完整 brainstorming**——这是有意识的取舍，复刻时若需求模糊，SHOULD 改用 brainstorming。

## 5. `Agent` 子代理（隔离上下文、并行）

把"大而独立"的活外包给子 agent，保护主上下文：

- **前端重做**：一个 general-purpose 子 agent，带着精确的设计令牌 + 数据契约去实现（自带 frontend-design 原则），并用 headless Playwright 自检。
- **QQ 解密尝试**：一个子 agent 去攻 QQ NT——**结果被 Anthropic 使用政策（网络安全 / cyber 内容）拦截**；本项目**如实记录为边界、未绕过**（见 [`./spec/10_data-products-and-boundaries.md`](./spec/10_data-products-and-boundaries.md) §2.1）。
- **Explore 子代理**：只读地盘点代码库，产出结构化清单（写复刻文档时用）。

## 6. `TaskCreate` / `TaskUpdate`（任务跟踪）

把多阶段工程拆成可见的任务清单（定位→解密→解析→归档→提炼→前端→边界），逐项 `in_progress` / `completed`，让长任务进度透明。

## 7. Memory（跨会话记忆）

把"数据在哪、解密怎么做成的、当前进度"等**非显然的项目知识**写进文件型记忆，避免长会话被压缩后丢失。本项目的记忆索引覆盖：数据源位置、解密路线、构建状态与 QQ 边界。

## 8. 底层工具能力（非 skill，但属方法论）

- 自建工具链：下载自带 Go + WinLibs mingw-gcc 进 `work/`（免管理员、可审计）。
- 自写 `crackv4`（Go）做版本无关的派生密钥内存扫描（见 [`./spec/03_decryption.md`](./spec/03_decryption.md)）。
- `node:sqlite`、Node/Python 内置 zstd——零额外原生依赖。

---

## 9. 本轮新增迭代（AI 助手 + 懒加载 + 独立滚动 + 导航重组 + 复刻文档重建）

这一轮在已建成的系统上做了两类工作，各自动用了一组方法：

### 9.1 复刻文档包重建 —— `spec-driven-development` + PADC

- 采用 **spec-driven-development 约定**：以 **`AGENTS.md` 作为项目宪法（constitution）**，配合 **多文件 `spec/`** 目录（按领域拆 `03_decryption` / `06_insights` / `08_frontend` / `09_ai-assistant` / `10_data-products-and-boundaries` …），每篇规格单一职责、互相 cross-link。
- 用**并行 `Agent` 子代理**分头撰写各篇 spec 文档（每个子 agent 自己 Write 自己的文件，主上下文只收一行状态）——与 §3/§5 同一套"子 agent 自写文件"纪律。
- 流程走 **PADC（Plan-Analyze-Develop-Commit）**：先规划文档结构，再盘点代码/数据现状，再撰写，**按阶段（phase）逐个 commit**——与项目一贯的"分阶段提交"节奏一致。

### 9.2 AI 助手 + 懒加载 + 独立滚动 + 导航重组 —— 继续 `frontend-design`

- 新增 **AI 助手**（assistant config + `POST /api/ai/chat` + 对话 transcript，见 [`./spec/09_ai-assistant.md`](./spec/09_ai-assistant.md)）。
- 前端体验改造：**懒加载（lazy-loading）** 长列表、消息流与文件树/预览的**独立滚动（independent-scroll）**、**导航重组（nav-regroup）**。
- 这些改造**全部在既有「午夜书斋」设计系统内**完成：复用同一套设计令牌、字体、颗粒与发丝金线质感，**MUST NOT** 另立一套审美——再次落实"前端必用 `frontend-design`，且锚定既有方向"。

---

## ⚠️ 诚实勘误：`agent-onboarding`（保留，务必照读）

用户最初让"结合 `agent-onboarding` skill 来整理微信/QQ 聊天记录"。但 `agent-onboarding` 实际是**面向新手的交互式"上手教练"教程引擎**（带你选项目、装环境、跑样例），**与"批量解密 + 提炼聊天记录"用途不符**。

- 本项目因此**没有**用它来整理聊天；改用 **直接解密 + 多 agent Workflow 提炼**，这才是真正能完成任务的路径。
- 复刻提示词里 **MUST NOT** 为了"照搬"而强行套 `agent-onboarding`；如果你是纯新手想被"手把手带着体验"，那才用它。

---

## 一句话方法论

> **先勘探，再用 `AskUserQuestion` 定关键岔路；解密/解析这类确定性活自己写脚本；大规模提炼用 `ultracode` 多 agent 扇出；前端必用 `frontend-design`；复刻文档用 spec-driven 多文件 + `AGENTS.md`；全程只动副本、边界如实记录、按阶段 commit。**
