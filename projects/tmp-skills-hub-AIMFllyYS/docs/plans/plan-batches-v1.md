# 分批执行计划（v1）

> Created: 2026-08-16
> Status: accepted
> Source: [第一次同步会](../updates/meeting-2026-08-15-first-sync.md) · [架构初始规范](../designs/architecture-initial-spec.md) · [库存与路径](../specs/store-and-paths-v0.md) · [CLI 命令面](../specs/cli-commands-v0.md)
> 取代 [plan-first-shippable.md](./plan-first-shippable.md) 的里程碑划分（那份的 M0–M4 保留作为背景，执行以本文为准）。

## 宗旨（三条，优先于一切细节）

1. **以录音稿为方向。** 有分歧时回去看录音稿怎么说，不自行发挥产品方向。
2. **把问题变简单。** 越清晰越简单越好。能不引入的依赖就不引入；必须引入时允许，但要在 PR 里说明理由。
3. **代码规范可读。** 规范「大体是硬、细节偏软」——分层与依赖方向、产品红线是硬的；文件怎么切、组件怎么组织是软的。

## 批次与录音稿的对应

| 批 | 名称 | 对应录音稿 | 依赖 |
|---|---|---|---|
| 0 | 工程基座 | 工程执行规范 | — |
| 1 | 存：发现与库存 | Step 1 存 | 0 |
| 2 | 用改删范围：链接层 | Step 2/3/4/5 | 1 |
| 3 | 渐进式披露 | Step 2 深化 | 2 |
| 4 | 统一看：面板 | Step 6 统一看 | 3 |
| 5 | 查看器与外部收录 | Step 6 之后的收录路径 | 4 |
| 6 | AI 接入 | Step 6 之后的社区/智能玩法 | 3、5 |
| 7 | P0 修复：面板先不坏 | 真机体感（2026-08-17 实测） | 6 已完成 |
| 8 | 面板信息架构：三栏骨架 | 面板从壳变主操作台 | 7 |
| 9 | 面板管理动作补齐 | 打开面板就能管完 | 8 |
| 10 | 备份机制施工 | #83 分析稿落地 | 7-3（去重口径对齐） |
| 11 | 分享闭环 | 社团共享：拉已有、补推 | 9-3 |
| 12 | 一键恢复到初始化前 | 备份被用过一轮后的 restore + 面板 reset | 10 |
| 13 | 人用壳设计系统：克制灰阶 + 统一组件 | 天天用的壳要清晰、少、可预期 | 12 / #160 |
| 14 | 人用壳交互：反馈、收纳、仪表盘 | 批 13 只换了皮，交互语法仍像静态灰字 | 13 |

一批 = 一个父 issue + 一群 sub-issue = 一个分支族。按 [issue-to-pr](../../AGENTS.md) 规范，**每个 sub-issue 单独出一个 PR**，PR 打向 `dev`，正文末尾唯一一条 `Closes #N`。

> 批 0–6 已于 2026-08-16 完成（43 个 issue 全关）。批 7–15 已合入 `dev`（批 14 = #187，批 15 = #188）。当前执行是工程债收口 [\#189](https://github.com/AIMFllyYS/Tmp-Skills-Hub/issues/189)（规范与代码对齐、去掉已废弃 IA、统一解析与编排）。设计依据：[panel-ia-v1.md](../designs/panel-ia-v1.md)、[app-shell-v2.md](../designs/app-shell-v2.md)、[ui-design-v1.md](../conventions/ui-design-v1.md)。

## 各批内容与验收

### 批 0 工程基座

装测试框架与 CI，把规范里的矛盾修掉，让后面每一批都有可自判的验收手段。

验收：`pnpm lint` / `pnpm typecheck` / `pnpm build` / `pnpm test` 四条全绿，CI 在 PR 上自动跑。

### 批 1 存：发现与库存

发现客户端 root（按目录形状，不按品牌名）、建立统一库存、按内容哈希去重入库、`verify` 检测漂移。

验收：在沙箱 home 下能发现全部 root；同一内容重复收录不产生第二份；库存位置可通过 `--home` 完全重定向。

### 批 2 用改删范围：链接层

受管链接台账、原子集合切换与回滚、`enable` / `disable`、软删除归档为 zip。

验收：沙箱内建立链接后读取可穿透到库存原件；注入失败能完整回滚；台账未登记的同名条目会报错而非被覆盖；不存在真删除代码路径。

### 批 3 渐进式披露

分组增删改查、`list --json` / `show` 供 AI 取 description、按需 `enable` / `disable`、skills-hub 自身的 `SKILL.md`、调用计数落 `stats.json`。

验收：AI 仅凭 skills-hub 自己的 SKILL.md 就能完成「查分组 → 看 description → 注入 → 调用 → 撤回」全流程；每次 `show` / `enable` 都被计数。

### 批 4 统一看：面板

HTTP 契约、面板列表、搜索、分组、开关（开关即调用 `enable` / `disable`）、归档区、统计展示与排序。

验收：`skills-hub ui` 一条命令起完整体验；面板开关能真实改变客户端目录里的链接。

### 批 5 查看器与外部收录

skill 内容查看（类小型编辑器的渲染）、编辑写回、翻译按钮、GitHub 链接与 skills.sh 链接收录。

验收：能在面板里读完并改完一个 skill 且改动落到库存原件；能把一个 GitHub 链接收录进库存。

### 批 6 AI 接入

把 CLI 暴露给 DeepSeek：读 description、找相近 skill、分析冲突并报告用户。

验收：给定一个新 skill，AI 能指出库存里与它相近或冲突的既有 skill。

### 批 7 P0 修复：面板先不坏

修三个已实测的 P0：bootstrap 把库存根当 home 导致开关全空；查看器从不加载初始文件；备份对同一内容重复写入把整机拖卡。另排除本项目目录被当成客户端、补请求去重与冒烟回归。

验收：点开 skill 1 秒内出现正文；面板能看到客户端开关；备份不再 N 倍放大；`pnpm smoke` 能抓住前两类回归。

### 批 8 面板信息架构：三栏骨架

用作用域 / 集合 / 检查器三栏取代手风琴。选择模型、浮动批量条、虚拟滚动、客户端视角。本批不接新后端动作。

验收：三栏落地；1000 个 skill 时列表 DOM ≤ 3000；过滤不清空选择；视觉当时服从 ui-design-v0（现已并入 [ui-design-v1.md](../conventions/ui-design-v1.md)）。

### 批 9 面板管理动作补齐

HTTP 补 adopt / links.apply / group / analyze / verify / restore；面板按钮全部走动作注册表。批量挂链一次 `applyLinkSet`。

验收：打开面板能完成收录、归档/恢复、分组、分析、四检、按组批量挂链；批量启用一个分组的 apply 请求数 = 1。

### 批 10 备份机制施工

按 [backup-mechanism-analysis.md](../designs/backup-mechanism-analysis.md) 落地 blob 库 + `backup`/`list`/`verify`；bootstrap 改走同一实现。完成后关闭 #83。

验收：分析稿 §8 条目全部满足；同内容不新增 blob；bootstrap 无私有整树复制。

### 批 11 分享闭环

把库存 skill 推到授信仓库（先调研再施工）。不做账号。完成后「推出去再 adopt 回来」闭环。

验收：CLI + HTTP + 面板「分享」；测试只用 fetch 替身，不打真实仓库。

### 批 12 一键恢复到初始化前

按快照把客户端 skills 逐条拼回，并提供面板一键 `reset`：确认后在当前 ui 进程还原 → 旁路指针与旧库存 → 用原 storeRoot 再收录。页面继续可用，不另开控制台。

验收：沙箱 restore 后文件/链接与快照一致（含 #97 旧格式）；reset 后指针指向同一 storeRoot、旧库存以旁路目录存在；预览不写盘；缺确认短语不写盘；`POST /api/reset` 成功后磁盘已还原（不是只返回 `started`）；不整目录 rename 客户端 skills。

### 批 13 人用壳设计系统：克制灰阶 + 统一组件

四页控件各写一套 class，确认层不像对话框，Toast 是底栏，收录/创建靠展开药丸；批 9 的分组 / 分析 / 分享从人用壳进不去。先把视觉规范升级为 [ui-design-v1.md](../conventions/ui-design-v1.md)，再把四页收口到同一套组件与旅程，并把次级动作放回 Skills「内容」。不改 IA（仍是总览 / 统计 / Skills / 设置），不恢复三栏，不把命令面板放回主路径，不改链接写盘语义。

验收：四页按钮 / 输入 / Tab / 对话框 / Toast 同源；无阴影、渐变、毛玻璃；动效 ≤150ms 且只作状态反馈；空状态带主动作；分组 / 分析 / 分享可从内容页到达；主路径仍看不到哈希与 Ctrl+K；`pnpm lint` / `typecheck` / `build` / 相关 web 测试 / `pnpm smoke` 通过。

### 批 14 人用壳交互：反馈、收纳、仪表盘

批 13 把按钮 / 输入 / 对话框换成薄封装，外观仍是克制灰阶、IA 仍是「点左边换整页」。缺的是交互语法：无过渡、设置为第四页、应用名单是纯文字、统计是 CSS 细条、加载是一句「加载中…」。规范 [ui-design-v1.md](../conventions/ui-design-v1.md) 当时还禁止页切与骨架。本批先修订规范，再真正接上侧栏收起/拖宽、设置 Dialog、折叠名单、统计图、Skeleton。不改 `packages/core` / 链接写盘语义，不恢复三栏，不上深色模式，不同步 Pencil。

子项：14-1 规范；14-2 壳（Sidebar 收起/拖宽、ScrollArea、Skeleton、页切/按压、Tooltip）；14-3 设置 Dialog + 应用折叠卡；14-4 统计仪表盘；14-5 总览可点数字/事项 + Skills 空状态与应用列密度；14-6 `lint` / `typecheck` / `build` / web 测试 / `pnpm smoke`。

验收：点任何导航/按钮有反馈；设置是弹窗；长应用名单默认折叠；侧栏可收可拖；统计是图不是细条；加载是骨架不是一句字；滚动条不可见；主路径仍无哈希/Ctrl+K。

## 不做（本计划）

账号与统一登录、公开技能市场、局域网分享、「有用」的自动判定、浏览器插件、千级换存储介质。
「往授信仓库推」从本表移出，改由批 11 做——这是 backlog 里账号/主页的前置，不再后置。其余逐条见 [backlog-from-first-sync.md](../issues/backlog-from-first-sync.md)。

## 必须联网调研的知识点

以下内容仓库里没有答案，实现时必须联网查证，不允许凭猜测写代码：

- macOS / Linux 上各客户端的 skills 目录约定
- 除本机已实测的 26 个 root 外还有哪些主流客户端
- skills.sh 的链接结构与拉取方式
- symlink / junction / hardlink 在各系统的权限要求与非破坏性语义
- DeepSeek API 的调用方式（密钥在 `.env`，已被 git 忽略）
