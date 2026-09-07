# CLI 命令面（v0）

> Created: 2026-08-16
> Status: accepted
> Source: [架构初始规范](../designs/architecture-initial-spec.md) §4 · [库存位置与路径约定](./store-and-paths-v0.md)
> 定位: 命令名与语义的唯一口径。各批次不得自行发明命令名，需要新命令先改本文。

## 0. 为什么要先把命令名定死

日常路径分开：**人只通过一键启动（`bootstrap` / `ui`）进 WebUI**；**CLI / `--json` / `--dry-run` 给 Agent 与脚本**。面板通过 `/api` 走同一套命令语义，不另起动词。

名字一改，Agent 与面板同时受影响。所以命令面先定案，再分批实现。人不会在日常路径里打命令；下表「主要使用者」里的「人」只表示该命令*可以*由人在终端调用（一次性 init、排障），不是产品主路径。

## 1. 命令表

| 命令 | 作用 | 主要使用者 |
|---|---|---|
| `init` | 设置库存位置，写入指针文件 | 人（一次性） |
| `doctor` | 环境自检：库存可达性、客户端 root、链接能力、悬空链接 | 人 / AI |

> **init 的 `--home` 是双重语义，最容易踩坑**：它既是「库存根目录」（目录布局建在这里），又是「home 基座」（指针文件写在 `<home>/.skills-hub/config.json`）。因此：
> - 用 `init --home <X> --yes` 初始化后，**后续所有命令必须传相同的 `--home <X>`**（或设 `SKILLS_HUB_HOME=<X>`），否则命令会去真实 home 找指针文件而报「库存未配置」；
> - 想让日常命令免带参数：`init` 不带 `--home`（交互输入库存根，指针落在真实 home），或先 `$env:SKILLS_HUB_HOME="<X>"` 再 `init --yes`。
| `scan` | 只读发现各客户端目录里的 skill，不入库 | 人 / AI |
| `adopt <来源>` | 收录进库存。来源 = 本地路径 / GitHub 链接 / skills.sh 链接 | 人 / AI |
| `list` | 列库存。已实现：`--source`、`--enabled`。**`--group` 未实现**，分组过滤走 `group` 命令与面板，不要把文档当已交付 | 人 / AI / 面板 |
| `show <name>` | 看单个 skill 的元信息与 description | AI / 面板 |
| `enable <name...>` | 建立链接，让指定 skill 对客户端可见 | AI / 面板 |
| `disable <name...>` | 移除链接，让 skill 对客户端不可见（原件保留） | AI / 面板 |
| `group` | 分组的增删改查 | 人 / AI |
| `archive <name>` | 软删除：移出活跃区，归档为 zip | 人 / 面板 |
| `archive restore <name>` | 从归档区恢复到活跃区（内容与归档前一致；不恢复链接） | 人 / 面板 |
| `analyze <来源>` | 相近/冲突分析报告：给定本地 skill 目录或库存名，让模型对照库存 description 给出相近与可能冲突的清单与理由（只建议，不写盘；无密钥时明确降级提示） | AI / 人 |
| `verify` | 重算哈希，报告漂移 | 人 / AI |
| `backup [--full]` | 建客户端 skills 基线快照（默认增量：共享 blob 池只补新内容；`--full` 强制新建快照并完整遍历） | 人 / AI |
| `backup list` | 列已有快照与最近备份时间 | 人 / AI |
| `backup verify [snapshotId]` | 用 manifest 重算 blob 哈希，报告损坏/缺失 | 人 / AI |
| `backup restore [snapshotId]` | 按快照把客户端 skills 逐条拼回（库存与指针不动；缺省用 latest） | 人 / AI |
| `reset [--snapshot <id>]` | 还原客户端 → 旁路指针与旧库存（只改名不真删）→ 用确认前读到的 storeRoot 再收录并拉起面板 | 人 / 面板 |
| `share <name>` | 把库存 skill 推到授信仓库 `skills/<name>/`，返回可被 `adopt` 再拉回的 GitHub tree 链接 | 人 / 面板 |
| `ui` | 起本地服务与面板 | 人 |
| `new <name>` | 在库存内分配目录、写模板（`drafts[]` 占名）。内容留给 AI 或人后续填写。**库存内写操作，不要求 `--yes`**（见 §2.1 授权分级） | AI |
| `new commit <name>` | 校验 `SKILL.md` 达标后定稿：算哈希、从 `drafts[]` 移入 `skills[]`。不要求 `--yes`。**`--enable` 未实现**（§2.1 表格是授权分级草案，不是已交付参数）；挂链走独立的 `enable` 或面板 | AI / 面板 |
| `new discard <name>` | 放弃草稿：目录移入 `archive/drafts/`，从 `drafts[]` 清除。不引入真删除——半成品原样保留 | AI |
| `new list` | 列出当前草稿（`drafts[]`），只读 | AI / 面板 |
| `bootstrap` | 一键体验：交互确认（库存位置/备份/迁移）→ 自动备份 → 收录全部本机 skills → 收录并启用自身 skill → 自动启动面板；库存已就绪时跳过全部交互直接启动面板 | 人 |

> **bootstrap 的流程与铁律**：每一步确认都是显式授权（写操作铁律不变）；备份 = 调用与 `backup` 同一套内核（`<库存根>/backups/blobs` 共享池 + 快照 manifest；源目录只读；库存内链接只记引用）；库存已就绪的幂等启动不重新备份；迁移 = 与 `init`+`adopt` 同一套布局与去重/冲突判定；非 TTY 环境需 `--yes`（跳过全部确认，库存位置取默认）。拉起面板时只把 **home 基座**交给 `ui`（发现客户端、读 `<home>/.skills-hub/config.json`），库存位置以指针为准，不能把 home 当成 storeRoot。

## 2. 铁律

- **没有 `delete` 命令。** 所有删除一律是 `archive`（软删除）。需要彻底删除时，只向用户显示归档文件的路径，由用户自己动手。代码里不存在真删除 skill 内容的路径。
- **`disable` 不等于删除。** 它只摘链接，库存原件一个字节不动。
- **写操作默认要确认。** `adopt`、`enable`、`disable`、`archive`、`archive restore`、`backup`、`backup restore`、`reset`、`share` 在交互终端下需确认；非交互环境必须显式 `--yes`，否则拒绝执行。`backup list` / `backup verify` 只读，不需 `--yes`。面板「分享」按钮与设置里的重置确认弹窗算显式操作（请求体仍带 `confirm: "reset"`）。

### 2.1 授权分级（#169 新增）

创建操作的两个动作风险等级不同，授权强度分开：

| 动作 | 碰谁 | 是否要 `--yes` |
|---|---|---|
| `new`（库存内开目录、写模板） | 只碰库存 `skills/` 与 `index.json`，不碰用户任何客户端目录 | **否** |
| `new commit`（定稿入清单） | 同上 | **否** |
| `new commit --enable <client>`（**未实现**；定稿后挂链回客户端） | 碰用户客户端目录 | 若将来交付：**是**，沿用 `requireWriteAuth` |
| `new discard`（移入归档区） | 只碰库存 | **否** |

分级只对 `new` 系列生效，不回头改 `adopt` 等既有命令的授权强度，避免行为回归。面板调用 HTTP 端点时无需额外确认（面板按钮即用户显式操作，与现有写端点一致）。
- **`backup restore` 与 `archive restore` 不是同一条命令。** 前者按备份快照写回客户端 skills；后者把归档 zip 拉回库存活跃区。
- **`reset --yes` 的库存路径**必须是确认前读到的 `storeRoot`，不得落到默认 `~/.skills-hub`。面板点确认后在**当前 `ui` 进程**内跑完同一套还原（与 CLI `reset --yes` 同一实现），本请求返回完成结果；不另开控制台、不 `process.exit`。CLI 直接调用 `reset` 时仍可在结束后拉起面板。

## 3. 全局参数

| 参数 | 作用 |
|---|---|
| `--home <path>` | 重定向 home 解析（沙箱验证与测试的唯一入口）。**init 例外**：init 的 `--home` 兼作库存根与 home 基座，见上表注 |
| `--json` | 机器可读输出。**AI 与 `/api` 一律走这个** |
| `--dry-run` | 只打印将要发生的变更，不写盘 |
| `--yes` | 非交互环境下显式授权写操作 |

## 4. 渐进式披露：AI 怎么用这套 CLI

这是产品内核，也是 `enable` / `disable` / `group` 存在的理由。

所有 skill 的真身都在库存里，客户端目录下只有链接。**skill 对 AI 是否可见，由链接集合决定**。于是流程是：

1. AI 用 `list --json` 看有哪些 skill、各自的 description（按分组请先 `group list`，不要调用未实现的 `list --group`）
2. AI 判断本次任务需要哪些
3. AI 执行 `enable <name...>`，对应 skill 被链接进客户端目录
4. 客户端随即发现并可调用
5. 用完 `disable <name...>` 撤回

**这不是重做各 Agent 的加载或检索逻辑**——我们不碰它们内部怎么读 skill、怎么算相关性。我们只做架构规范 §4 早已定下的那件事：决定链接挂在哪、挂不挂。区别只是把「挂不挂」从一次性配置变成了 AI 可以随时调用的操作。

### 4.1 skills-hub 自己也是一个 Skill

上面这套流程要成立，AI 必须先知道 CLI 怎么用。所以 skills-hub 自带一份 `SKILL.md`，内容就是「什么时机该调用我、怎么调用」。
这份 skill 随 `bootstrap` 收录并默认启用到全部已发现客户端，其余全部按需 `enable`。用户可通过 `disable` 撤销。

### 4.2 调用计数的落点

既然 AI 必须经由 CLI 才能拿到 description、才能让 skill 可见，**CLI 本身就是唯一且准确的计数点**。
`show` 与 `enable` 记一次使用，写进 `stats.json`。不需要 hook 任何客户端，也不需要靠文件访问时间去猜。

## 5. 分组

第一版内置一套分组（如 development / design / tooling / writing / research），之后允许用户通过 `group` 增删改查。
一个 skill 可属于多个分组。分组只是视图与批量操作的单位，不影响库存布局。

## 6. 需要联网调研才能实现的部分

以下内容**本仓库没有现成答案，实现时必须联网查证**，不允许凭猜测写代码：

- macOS / Linux 上各客户端的 skills 目录约定
- 除本机已实测的 26 个 root 之外还有哪些主流客户端
- skills.sh 的链接结构与拉取方式
- symlink / junction / hardlink 在各系统上的权限要求与非破坏性语义
