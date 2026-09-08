# PROMPT · 本地部署咒语（喂给 AI 一键灌数据并跑起来）

> 历史材料，禁止直接执行旧布局命令。现行架构与迁移流程以 [`replication/docs/spec/01_architecture.md`](../../replication/docs/spec/01_architecture.md) 为唯一 prose 权威；先运行 `npm run data:doctor`。

> 适用场景：你**已经 `git clone` 了本仓库**（代码现成，是个空壳），想让 AI 在你本机自主搜索你自己的数据，灌进项目并跑起来。
>
> 前提：① 微信（QQ）**正在运行且已登录**（内存取密钥的硬前提）；② 已装 Node 24+、Python 3.14、ffmpeg、git，可联网（见 [`01_环境与克隆.md`](01_环境与克隆.md) §3）。
>
> 用法：把下面整段复制，替换 `{{占位符}}`，在 Claude Code（或 Codex / Cursor）里用 `/goal ` 粘贴发送。开头 `ultracode` 触发多 agent 编排。

---

## A. 一键部署咒语（推荐）

```text
ultracode 我已经 git clone 了「午夜书斋 / ChatFiles」这个仓库到 "{{项目目录}}"，代码是现成的空壳（没有任何聊天记录/媒体/洞察）。请你在我这台电脑上自主搜索我自己的微信（和 QQ）数据，解密、解析、归档、提炼，把空壳灌满并跑起来。

【最重要 · 先读文档再动手】
本次是"部署"，不是"从零写代码"——代码已存在，你复用现成的 src/ server/ scripts/。MUST 先逐篇精读本教程：
1. docs/本地部署教程/README.md（流程总览 + 安全红线）
2. docs/本地部署教程/00_总览.md → 05_验收清单.md（按文件号顺序执行）
深技术细节（解密内核 / 解析 / 归档 / 提炼的完整规格）在 replication/docs/spec/ 下，遇到对应环节 MUST 回去核对，不可凭记忆或猜测。

【按阶段执行，每阶段完成就 commit】
① 环境与克隆：确认 Node24/Python3.14/ffmpeg 自检全绿；把 .env.example 复制成 .env.local（gitignored）。（见 01）
② 定位本机数据：全盘搜 xwechat_files（戳穿"被迁到非C盘"陷阱）与 Tencent Files，识别无 --type= 的微信主进程 PID，读库头确认已加密。全程只读。把结论告诉我。（见 02）
③ 解密：自带 Go+mingw 工具链编译 crackv4，从运行进程内存取每个库的派生 encKey，只把副本解密到 work/decrypted/，原始库一字不动。每库 bad=0。（见 03 + replication/docs/spec/03_decryption.md）
④ 解析+归档：npx tsx scripts/parseWeChat.ts 生成 data/wechat.db（三表）；npx tsx scripts/archiveFiles.ts 把有价值文件复制进 archive/ 并按一级分类去重归档（同名取最大序号+sha256），原文件不动。（见 03）
⑤ 提炼：npx tsx scripts/prepChatDigests.ts 生成 digest+manifest；ultracode 多 agent 扇出，每会话一个 Sonnet agent 读 digest→写 data/insights/conv/<safe(convId)>.json（schema 严格、引用用「」、只回一行状态）；json-repair 修非法 JSON；按类聚合后每类一个 Opus agent 写 data/insights/boards/<类>.md。（见 04 + replication/docs/spec/06_insights.md）
⑥ 配置身份+启动：把我的身份写进 .env.local（见下）；npm run build（exit 0）；npm start（:3456）；端到端核验 /api/overview、/api/insights、首页 200，浏览器逐板块点检。（见 04）
⑦ 验收：逐项过 05_验收清单.md，含隐私自检（个人数据不得进 git）。

【我的信息（只写进 .env.local，绝不提交）】
- 身份标签 VITE_OWNER_IDENTITY / OWNER_IDENTITY：{{身份，如 XX大学 XX专业 XX级；没有可留空}}
- 课程站点 VITE_COURSE_URL / COURSE_URL：{{课程/成绩站点，没有可留空}}
- 一级分类（归档用）：{{一级分类，如 过去/创业/AI/学业/专业/比赛；不确定就让 AI 按我的数据自动归纳}}
- 我的显示名 VITE_OWNER_NAME / wxid 片段 VITE_OWNER_WXID：{{你的昵称}} / {{你 wxid 的一个子串}}

【硬约束 · 一字不差遵守】
- 只读原始、只对副本解密、只复制归档；禁止删除/移动/改写任何原始聊天记录与文件。
- 只解密我自己的、本机的、当前登录账号的数据。不上传任何聊天正文/密钥/原始库。
- 个人身份只进 .env.local（gitignored）；data/ archive/ work/ imports/ 永不入仓。
- 解不了的边界（QQ 正文、未登录账号、.dat 影像）如实记录，禁止用日志/缓存伪造成聊天正文。
- 遇"解密方式"或"数据定位有歧义"用 AskUserQuestion 问我；其余不确定处自主分析最佳方案后继续。

请先做 ① ②（环境 + 只读勘探），把关键发现告诉我，再继续解密及后续。
```

---

## B. 分阶段提示词（想分步把控时用）

逐条发送，每条等 AI 做完再发下一条：

1. **环境 + 只读勘探**：`先精读 docs/本地部署教程/README.md 与 00、01、02，按 01 §3 自检环境，再按 02 全盘定位我电脑上的微信/QQ 数据真实位置与加密态、找微信主进程 PID。全程只读，整理结论给我，先别解密。`
2. **解密**：`按 docs/本地部署教程/03 §1 与 replication/docs/spec/03_decryption.md，搭建工具链并把我的微信库解密到 work/decrypted/（只动副本，原始库不碰）。每库 bad=0，Python 验证能读到真实中文联系人。`
3. **解析 + 归档**：`按 03 §2/§3 跑 scripts/parseWeChat.ts 与 scripts/archiveFiles.ts，生成 data/wechat.db 与 archive/+data/library.json。统计会话/消息/归档数给我。原文件不动。`
4. **提炼**：`ultracode 按 04 §1-3 与 replication/docs/spec/06_insights.md，prepChatDigests 后多 agent 扇出写 conv/*.json（schema 严格、引用用「」、只回一行状态），json-repair 修复，再按类综述成 boards/*.md。`
5. **配置身份 + 启动**：`把我的身份写进 .env.local（值见上），npm run build（exit 0）+ npm start，端到端核验 /api/overview、/api/insights、首页 200，并逐板块点检。最后过 05 验收清单含隐私自检。`

---

## C. 两个会用 AskUserQuestion 问你的决策点

| 决策 | 建议 |
|---|---|
| **解密方式** | 答"先试成熟工具，失效就自写版本无关的派生密钥内存扫描（crackv4）"——本项目最终就是后者。 |
| **数据定位有歧义**（多账号 / 多个 xwechat_files / 被迁移） | 把 AI 全盘搜到的候选列给你，由你确认主账号与真实数据根。 |

> 想要的是把现成项目用自己的数据点亮——这套咒语强制 AI **先读部署文档、复用现成代码、按序灌数据**，而不是重写一遍轮子。
