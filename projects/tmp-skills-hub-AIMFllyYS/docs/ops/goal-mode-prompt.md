# 目标模式提示词（交给 harness 直接使用）

> Updated: 2026-08-17
> 用法：把下面「提示词正文」整段复制进 harness 的目标模式。它自包含，不需要额外对话。
> 上一轮（批 0–6，43 个 issue）已完成。本轮从批 7 起，把 Web 从「查看壳」做成主操作台。

---

## 提示词正文

你在仓库 `d:\projects\Dev-Tools\Skills-Hub`（远程 `AIMFllyYS/Tmp-Skills-Hub`）上以目标模式长时间无人值守工作。

### 你的目标

按队列顺序清空 GitHub 上已经写好的 **25 个子 issue**（#95–#119），把面板做成正常人打开就能完成全部管理的主操作台，并顺手落地备份命令与分享闭环。**卡功能，不卡时间**——不要为了赶时间牺牲质量，也不要在一个 issue 上无限打磨。

父 issue #90–#94 不单独开 PR，随子 issue 全部完成而关闭。#83 在批 10（#116+#117）完成后关闭。

### 开工前必读（按顺序，只读一次）

1. `AGENTS.md` —— 操作索引与硬规则，特别是「目标模式」一节（你的权限与禁区）
2. `docs/audits/panel-and-perf-audit-2026-08-17.md` —— **本轮事实依据**。卡顿不是点击造成的，四个 P0 都有实测数据。不要重新发明原因。
3. `docs/designs/app-shell-v2.md` —— 人用壳（总览 / 统计 / Skills 管理 / 设置）
4. `docs/designs/panel-ia-v1.md` —— 数据层约束（行级关系、一次原子提交、动作注册表；三栏不再是人用 IA）
5. `docs/plans/plan-batches-v1.md` —— 执行依据；当前从批 7 起
6. `docs/specs/store-and-paths-v0.md` —— 库存位置、沙箱边界
7. `docs/specs/cli-commands-v0.md` —— 命令名唯一口径，新命令先改本文
8. `docs/conventions/ui-design-v1.md` —— 视觉与旅程铁律：无阴影、无毛玻璃、无渐变；控件走统一组件
9. `docs/conventions/core-patterns.md` —— 确定性内核（注意 2026-08-16 修订）

方向有疑问时，回去看 `docs/updates/meeting-2026-08-15-first-sync.md` 的录音稿原文。

### 三条宗旨（优先于一切细节）

1. **以录音稿为方向。** 有分歧回去看录音稿怎么说，不自行发挥产品方向。
2. **把问题变简单。** 越清晰越简单越好。能不引入的依赖就不引入；必须引入时允许，在 PR 里说明理由。
3. **代码规范可读。** 规范「大体硬、细节软」：分层与依赖方向、产品红线、软删除铁律是硬的，违反即打回；文件怎么切、组件怎么组织是软的，按可读性判断。

### 工作流程（每个 issue 一轮）

调用 `issue-to-pr` skill 处理每一个 issue。要点：

1. 从**最新的 `dev`** 切分支，命名 `<type>/<issue编号>-<slug>`。禁止在上一个 issue 的分支上开新分支。
2. 实现前先读当前代码确认实际行为——issue 里写的「当前行为」可能已被前面的 PR 改掉。
3. 实现后必须跑：`pnpm lint`、`pnpm typecheck`、`pnpm build`、`pnpm test`。四条全绿才能提 PR。`pnpm smoke` 在 #100 落地后也要跑（无 Chrome 可跳过）。
4. PR 打向 `dev`，正文包含测试命令与结果摘要，末尾唯一一条 `Closes #<编号>`。
5. **CI 绿后自行 squash merge 进 `dev`**，然后处理队列里的下一个。不要停下来等人审。
6. 父 issue（#90–#94）不单独开 PR。

### 执行队列（严格按此顺序）

```
批 7  P0 修复        #95 → #96 → #97 → #98 → #99 → #100
批 8  三栏骨架        #101 → #102 → #103 → #104 → #105 → #106 → #107
批 9  管理动作        #108 → #109 → #110 → #111 → #112 → #113 → #114 → #115
批 10 备份施工        #116 → #117          ← 完成后关闭 #83
批 11 分享闭环        #118 → #119          ← #118 无调研文档则 #119 不得开工
```

批 7 必须先做完再动批 8：现在的面板是坏的（开关全空、内容永远「加载中…」），在坏面板上重构没有意义。

### 硬禁区（违反即为事故）

- **不向真实客户端目录写入任何内容。** `~/.claude`、`~/.cursor`、`~/.codex` 等只读。所有写操作走沙箱假 home：`<repo>/.sandbox/home-<时间戳>/`，通过 `--home` / `SKILLS_HUB_HOME` 重定向。读取真实目录允许。
- **不实现真删除。** 全项目没有 `delete`，所有删除都是软删除归档。需要彻底删除时只向用户显示归档路径。
- **不动 `main`**，不 force push，不改 `pnpm-lock.yaml`（只通过 `pnpm install` 间接改）。
- **不提交 `.env`** 或任何密钥。密钥只从环境变量读，不进源码、不进日志、不进发往前端的响应。
- **core 不碰网络、不碰框架。** 外部 API 一律在 cli；web 不 import core 或 cli，只走 HTTP `/api`。
- 不建 WSL 或 Docker。理由见 `docs/specs/store-and-paths-v0.md` §5。
- **不向任何真实远程仓库推 skill。** 批 11 的推送测试只用 fetch 替身。不要写到 `KinomotoMio/skill-hub`，也不要写到用户的真实 GitHub。
- **不引入 react-query / react-window / cmdk / kbar。** 虚拟滚动、请求缓存、命令面板自己写。必须引入时在 PR 里说明理由。
- **批量挂链禁止循环打单条 enable 端点。** 走 `POST /api/links/apply`，一次 `applyLinkSet`。

### 本轮已经核实的事实（可直接引用，不必重新验证）

完整数据见 `docs/audits/panel-and-perf-audit-2026-08-17.md`。摘要：

- 库存 `D:\projects\My-Skills\Hubs`：157 个 skill，2547 个文件
- `/api/skills` 129 KB / 153 ms；`/tree` 与 `/file` 都在 45 ms 内
- 点击 skill 后静置 10 s：CPU 增量 0.00 s，fetch 0，**没有死循环**
- 内容区永远「加载中…」：`SkillViewer` 只拉树、不拉文件（#96）
- `/api/clients` 返回空数组：`bootstrap.ts:226` 把 `storeRoot` 传给了 `startUiServer` 的 home（#95）
- 正确 home 下 `discoverClientRoots` 返回 23 个 root
- `bootstrap` 进程单次读 846 MB / 写 473 MB；快照从 5 MB 放大到 309 MB（#97）
- `~/.skills-hub.pre-bootstrap-*` 被当成客户端 root（#98）
- 4321 端口可能已被用户的 `bootstrap` 占用（PID 以当时为准）。不要杀用户进程；测试用沙箱 + 随机端口，或 `createUiApp` 的 `app.request()` 不占端口

### 遇到问题怎么办

- **自己解决。** 查文档、联网搜索、换实现路径。只有真正的阻塞（鉴权失败、必需信息缺失且无法合理推断）才停下来报告。
- **遇到架构矛盾先修文档。** 尤其是 #116：批 7-3「跟随链接复制内容」与备份分析稿「不跟随链接」冲突，必须先修订分析稿并写明理由，再写代码。
- **必须联网搜索的地方，不要凭猜测写代码：**
  - #118 授信仓库推送的 GitHub API、权限、配置落点（每条结论附来源链接）
- 同一个 issue 连续失败 3 次仍无法通过验收 → 在该 issue 下留言说明卡点，跳到队列里下一个**不依赖它**的 issue，最后统一报告。
- Windows + PowerShell：不要用 `&&` 串联命令（用 `;` 或 `if ($?)`），不要用 bash heredoc 写 commit message（用 `git commit -F <file>`），含空格路径要加双引号。

### 完成标准

队列清空，`dev` 上四条校验全绿，`skills-hub ui` 一条命令起完整体验：点开 skill 能看到正文、能看到客户端开关、能从面板收录/归档/分组/分析/批量挂链。然后向用户汇报：完成了哪些 issue、跳过了哪些及原因、修订了哪些规范文档及理由、以及回来后需要人工做的第一件事。

---

## 附：给用户的说明（不要复制进 harness）

- 30 个新 issue 已建好并完成父子关联：父 #90–#94，子 #95–#119。#83 仍 open，批 10 完成后关闭。
- 远程默认分支仍是 `dev`。不要动 `main`。
- 你回来后看 `dev` 相对出发时的 diff，就是本轮全部改动。
- 真机客户端目录仍然只读。若要亲手体验，等队列跑完再自己点面板。
