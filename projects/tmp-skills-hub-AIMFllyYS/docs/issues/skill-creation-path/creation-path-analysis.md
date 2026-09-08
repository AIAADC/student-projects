# 用户新建 skill 的路径分析（只分析，不实现）

> 状态：分析稿，决策点待人勾选
> 创建：2026-08-19；更新：2026-08-19
> 对应 issue：[#169](https://github.com/AIMFllyYS/Tmp-Skills-Hub/issues/169)（双向标记，见 [README](./README.md)）
> Source: [架构初始规范](../../designs/architecture-initial-spec.md) §1/§4/§5 · [第一次同步会](../../updates/meeting-2026-08-15-first-sync.md) Step 1 · [核心模式](../../conventions/core-patterns.md) §5 · [CLI 命令面](../../specs/cli-commands-v0.md) §4.1
> 定位：本文只做分析与选项对比，**不选定实现**。决策点由人勾选后，才允许另开施工 issue。

## 0. 结论先行

1. **根因**：架构 §4 定义的五个操作是「存 / 用 / 改 / 删 / 范围」，**没有「创建」**。决策甬道的起点是「我看到一个好 skill，想存下来」，全程从既有 skill 出发；「我要做一个新 skill」这条甬道从未走过。
2. **物理表现**：客户端里的 skill 是指向库存的链接，所以「改」会穿透到库存原件（§4 成立）；但「新建」是在 skills 目录里生成一个**平级真目录**，链接语义够不着。**五个操作里只有创建能逃逸出链接层。**
3. **「必须通过 CLI」建立不起来**——三条独立原因（§3），任何一条都足以否掉强制。
4. **但创建期介入的方向成立**，且有三处既有规范背书（§4）。它的价值不是「保证一致」，而是「把主路径做对、把脱管窗口压到零」。
5. **兜底不可省**：#163–#165 的事后对账无论如何都要存在。这反过来决定了强制拦截不划算（§3.3）。
6. **一个当前被忽略的前提**：规范说 skills-hub 自己的 `SKILL.md` 是唯一常驻的，但**代码里没有任何自安装路径**，本机也确实不在任何客户端目录里。创建期方案当前命中率为 0（§5）。
7. **创建与存是反向的数据流**（§8）：存是 content-first，创建是 location-first。这个反向撞坏了三条现有模型假设（哈希身份、内容去重、渐进式披露），**创建不能复用收录的代码路径**——这是模型冲突，不是实现偷懒。
8. **有一个前置 blocker 排在所有方案之前**：`index.json` 没有 schema 迁移路径，版本不符是直接抛错。draft 状态与 #168 的分类字段任何一个落地都要升版本，届时真机已有库存会直接打不开（§8.5）。

## 1. 根因：五个操作里没有「创建」

[architecture-initial-spec.md](../../designs/architecture-initial-spec.md) §4 的表只有五行：

| 操作 | 架构语义 | 现状 |
|---|---|---|
| 存 | 镜像进统一目录 + 各 Agent 目录放链接 | 已实现（adopt / enable） |
| 用 | Agent 从自己目录发现链接即能用 | 已实现 |
| 改 | 改链接 = 改原件 = 全局改 | 已实现（链接穿透） |
| 删 | 删链接 ≠ 删原件 | 已实现（disable / archive） |
| 范围 | 链接挂全局侧还是项目侧 | 已实现（--scope） |
| **创建** | — | **未定义** |

§1.2 决策甬道写明「从**用户的第一决策**出发（"我看到一个好 skill，想存下来"）」。这是**收录既有资产**的甬道。而「我做了一个新 skill」是另一条起点不同的甬道，会上没走过，因此 §4 没有它的语义，specs 里也没有对应命令。

### 1.1 逃逸的不对称性

这是全文最核心的一句：

- **改**：`~/.codex/skills/foo/` 是 junction → Agent 改文件 → 改到 `<storeRoot>/skills/foo/`。不漂移。
- **建**：Agent 在 `~/.codex/skills/bar/` 建真目录 → 与库存无任何关系。**孤儿**。

`packages/core/src/store.ts:83-148` 的 `adoptSkillFolder` 只做「复制进库存」，源目录一个字节不动；`packages/cli/src/bootstrap.ts:98-101` 在指针存在时直接跳过迁移。于是孤儿既不会被自动发现，也不会被自动收编。

### 1.2 与既有 issue 的关系

```
        ┌──────────────────────────────────────┐
        │  本文：为什么会逃逸（创建未定义）      │
        └───────────────┬──────────────────────┘
                        │
        ┌───────────────┴───────────────┐
        ▼                               ▼
  #162–#165 事后打捞逃逸物         #168 打捞上来怎么分类
  （发现 → 归拢 → 面板）           （可移植/绑定/再生/插件）
```

两者都在下游。不解决创建，孤儿会持续产生，#163 的对账就变成常态运维而不是一次性收尾。

## 2. 三个介入点与权衡轴

| 介入点 | 机制 | 依赖 | 能否保证 | 脱管窗口 |
|---|---|---|---|---|
| 写之前 | AI 命中我们的 skill，按指示走 CLI | 模型遵从 | 否 | 0（命中时） |
| 写之时 | 客户端 hook 拦截 / 落点重定向 | 客户端配置 | 单客户端可以 | 0 |
| 写之后 | 对账 + 授权归拢 | 文件系统事实 | 是 | 一次扫描周期 |

**权衡轴：越早介入越省事，越晚介入越可靠。** 三层不是互斥选项，是可以叠加的防线。

## 3. 为什么「必须通过 CLI」这个硬约束建立不起来

### 3.1 内置 creator 抢命中，且我们删不掉

| 客户端 | 内置创建入口 | 默认落点 | 我们能否干预 |
|---|---|---|---|
| Codex | `$skill-creator`（SYSTEM 级，随二进制分发） | `$CODEX_HOME/skills`，未设时 `~/.codex/skills` | 否 |
| Cursor | `create-skill`（内置） | `~/.cursor/skills/` 或 `.cursor/skills/` | 否 |
| Claude Code | skill-creator | `~/.claude/skills/` | 否 |

来源：Codex 官方 `skill-creator` 的 `SKILL.md` 原文「Respect a user-specified location; otherwise create discoverable skills in `$CODEX_HOME/skills`, or `~/.codex/skills` when `CODEX_HOME` is unset」（openai/codex PR #14837 把这条默认写死）；Cursor 内置 `create-skill` 的 Storage Locations 表。

这些正是 #168 所说的「系统再生类」。我们无法保证自己的 skill 比内置的更先被命中。

### 3.2 Hook 能强制，但代价是接管客户端配置

三家都有 hook，能力确实够：

| 客户端 | 配置落点 | 可用事件 | 额外门槛 |
|---|---|---|---|
| Claude Code | `settings.json` | `PostToolUse` + `matcher: "Edit\|Write"`；`PreToolUse` 可 exit 2 阻断 | 无 |
| Codex | `~/.codex/hooks.json` 或 `config.toml` 的 `[hooks]` | `PreToolUse` / `PostToolUse` / `Stop` / `SessionStart` 等 | 需 `[features].hooks = true`；**非托管 hook 必须在 `/hooks` 里人工 trust**；默认 fail-open |
| Cursor | `~/.cursor/hooks.json` | `afterFileEdit`（matcher `Write`）、`postToolUse`、`stop` | 无 |

但这会把项目从「只在 skills 目录里放链接条目」升级为「**修改用户客户端的配置文件**」——footprint 大一个量级，且与当前 Boundaries 的克制姿态不一致。同时 27 个已发现 root 里只有少数几家有 hook 能力。

### 3.3 覆盖不全 ⇒ 兜底必留 ⇒ 强制不划算

这是决定性推理：

1. hook 覆盖不了全部客户端，也拦不住内置 creator 与用户手动 `clone`；
2. 所以 #163 的事后对账**无论如何都必须存在**；
3. 那么强制拦截的收益就从「保证最终一致」降级为「缩短脱管窗口」；
4. 为了缩短窗口而去写用户的客户端配置，成本收益不成立。

### 3.4 规范冲突

架构 §5 结尾：「在我们提供收录入口之前，用户已经在用『对 Agent 说』和『手动 clone』。新入口**兼容**这些路径，不拦截、不接管。」

硬拦截直接撞这一条。按 AGENTS.md「遇到架构矛盾先修文档」，要做强制必须先改 §5 并写明修订理由。**更合理的读法**是：§5 约束的是**既有收录路径**，而「新建」是一条从未定义的新甬道，不算冲突——但必须显式补写进 §4/§5，否则后人会拿 §5 打回。

## 4. 但创建期介入的方向成立：三处规范背书

1. **[core-patterns.md](../../conventions/core-patterns.md) §5** 的分工表把「**收录时的对话式引导**」明确归入「写成 Skill（交给 Agent）」列，不是写成代码。创建期引导天然属于 skill 层。
2. **[cli-commands-v0.md](../../specs/cli-commands-v0.md) §4.1** 已规定 skills-hub 自己是「**唯一需要常驻在客户端目录里的**」skill。那正是安放「新建 skill 该怎么做」的位置。
3. **会议纪要** Step 6 之后的收录路径：「要把『存一个 skill』压到十秒内」。创建期直接落库存，比「建完 → 事后扫 → 授权归拢」短一个数量级。

### 4.1 「建完再同步」与「创建即落库存」不是同一件事

值得单独区分的两个变体：

| 变体 | 流程 | 是否产生孤儿 | 额外收益 |
|---|---|---|---|
| B 建完再同步 | AI 在客户端建 → 调 CLI 收录 → 原位换链接 | 短暂产生 | 无 |
| E 创建即落库存 | CLI 在库存开目录并挂链回源客户端 → AI 往该路径写内容 | **从不产生** | 创建前即可查重名，把 #164 的同名冲突提前成改名提示 |

E 比 B 更彻底：不需要搬运、不需要原位换链接（`applyLinkSet` 的 `unregistered-conflict` 分支根本不会被触发）。

## 5. 被忽略的前提：自身 skill 从未常驻

- `cli-commands-v0.md` §4.1 与 `plan-batches-v1.md` 批 3 验收都假设 skills-hub 的 `SKILL.md` 常驻在客户端目录里。
- 但 `packages/` 下**没有任何把自身 `SKILL.md` 安装/链接进客户端的代码路径**（grep `SKILL.md` 只命中测试夹具与读取逻辑）。
- 本机只读核对：`~/.codex/skills` 下只有 `.system` 与一个用户 skill，skills-hub 不在其中。

**结论**：B 与 E 的命中率当前都是 0。任何创建期方案都必须先补「自身 skill 常驻」这一前置，否则是空中楼阁。

**顺带一条元原则**：§4.1 是一句**能力声明**，但没有实现，它主动误导了后续设计——本文的创建期方案一度默认它成立。规范文档不应声明代码没有的能力；已声明未实现的，要么补实现，要么在措辞上降级为「计划」。

## 6. 方案对比

| 方案 | 成本 | 覆盖 | 可靠性 | 规范冲突 | 备注 |
|---|---|---|---|---|---|
| A 事后对账归拢（#163–#165） | 中 | 全部客户端 | 高（文件系统事实） | 无 | 已立项；兜底不可省 |
| B 创建后调 CLI 同步（写进自身 SKILL.md） | 低 | 命中我们 skill 的会话 | 中（依赖模型遵从） | 无 | 前置：自身 skill 常驻 |
| C 客户端 hook 拦截 | 高（每端一套 + 用户 trust） | 少数几家 | 单端高 | 撞 §5「不接管」 | 建议降级为「只提醒不阻断」 |
| D 文件系统 watcher | 中 | 全部客户端 | 中（依赖 ui 进程常驻） | 无 | 只在面板开着时有效 |
| E 创建即落库存（新动词） | 中 | 命中我们 skill 的会话 | 中（同 B） | 需在 §4 补「创建」语义 | 孤儿零产生；可提前查重名 |

## 7. 与 #168 的耦合

### 7.1 创建期入口是分类口径的唯一源头采集点

#168 卡在「缺少可移植 / 客户端绑定 / 系统再生 / 插件的分类口径」，且目前只能事后靠路径与文本去猜。创建期是**唯一能在源头拿到 provenance 的地方**：谁建的、在哪个客户端建的、是否依赖该端的 MCP 或插件、能否跨端启用。#168 决策点第二条（绑定类只允许启用到源客户端）需要的正是这条元数据。

**依赖方向**：#168 的分类字段口径应**先于**创建期入口定下来，否则新动词采集不到正确字段，后面要迁移 `index.json`。

**反向收益**：创建期方案会让 #168 收敛——新资产自带分类，#168 的调研范围缩小到「存量 + 系统再生」。但**不能取代** #168：存量 579 份与官方再生物永远不走我们的入口。

### 7.2 可直接喂给 #168 的实证：我们把 Cursor 内置目录当成了用户资产 root

- [store-and-paths-v0.md](../../specs/store-and-paths-v0.md) §4 规则 2 把 `.cursor/skills-cursor` 列为已知嵌套惯例；`packages/core/src/clients.ts:27` 硬编码了这条。
- 但 Cursor 自己的内置 `create-skill` 明文写着：「**Never create skills in `~/.cursor/skills-cursor/`. This directory is reserved for Cursor's internal built-in skills and is managed automatically by the system.**」
- 本机只读核对：该目录下确为 Cursor 内置（`canvas`、`create-hook`、`create-skill`、`autopilot`、`sdk`、`share` 等）。

这就是 #168 要的「系统再生类」的第一个可复核实例：发现规则把客户端**内置目录**当成了用户资产 root。已作为评论补入 #168，本文不重复决策。

## 8. 架构层要动什么（模型 / 接口 / 分层）

前面七节回答「在哪介入」。本节回答「无论选哪个方案都躲不掉的模型改动」——这些结论对 B / E 同样成立。

### 8.1 「创建」与「存」是反向的数据流

| 操作 | 顺序 | 形态 |
|---|---|---|
| 存（adopt） | 内容先在外部存在 → 算哈希 → 分配库存位置 → 拷进来 | **content-first** |
| 创建（new） | 先在库存分配位置 → 内容之后才被写进来 | **location-first** |

这不是措辞差别。`StorageProvider.add(folderPath, record)`（`packages/core/src/interfaces.ts:18`）的签名本身就是 content-first 的：调用它的前提是内容已经落在某个文件夹里。创建期没有这样的文件夹。

### 8.2 反向撞坏的三条模型假设

**(a) 哈希在创建那一刻没有身份意义。** 架构 §3 定义「唯一标识 = 整个文件夹内容的哈希」，[store-and-paths-v0.md](../../specs/store-and-paths-v0.md) §3 进一步说它是「入库那一刻的内容指纹」。创建时那一刻内容是空的，写进 index 的是模板的哈希，AI 写完 `SKILL.md` 的下一秒就漂。`verify` 会把每一个新建 skill 报成漂移。

**(b) 去重规则会反过来吃掉创建。** `adoptSkillFolder` 的第一步是按内容哈希查 `byHash`，命中即当重复、幂等返回已有记录。两个从同一模板创建的空 skill 内容逐字节相同 → 哈希相同 → **第二次创建被静默判为「已存在」**。内容哈希去重的前提是「内容已定」，创建期这个前提不成立。

**(c) 渐进式披露会被占位符污染。** 收录的最低要求是 `name` + `description`（架构 §3），所以模板必须自带占位 description。而 `list --json` 的 description 正是 AI 选 skill 的依据，库里躺着若干「TODO」会直接拉低召回质量。

### 8.3 因此资产模型要补 draft / committed 这根轴

现在 `SkillRecord` 只有「活跃 / 归档」一个状态轴。上面三条后果全部收敛到同一个缺失概念：**未定稿**。draft 不参与哈希校验、不参与内容去重、不进渐进式披露的候选集。这是本次最该先定的模型改动。

配套的去重口径也要改：创建期按 **dirName 占位优先**（先抢名字，内容后到），内容哈希去重只在 commit 时生效。

一个旁证：`packages/core/src/types.ts:17` 的 `SkillSourceKind` 里已经躺着 `"manual"`，而**生产代码从未产生过它**（全仓仅一处同名测试夹具，无关）。类型里预留了槽位、语义上没人定义，正是创建这个操作在代码里留下的影子。

### 8.4 架构规范 §5 的四个接口不需要变成五个

容易走错的一步是「再加一个 CreationProvider」。辨析：

- 塞不进 `SourceProvider`：它的形状是 `canHandle(input)` / `fetch(input)`（`interfaces.ts:31-36`），创建**没有 input 可 fetch**，硬套要伪造一个假 input。
- 也不完全属于现在的 `StorageProvider`：只有一个 content-first 的 `add`。

真正缺的不是接口，是 `StorageProvider` 上的一对语义：**allocate（占位）** 与 **commit（定稿）**。补两个方法可以保持四个抽象点不变，符合「能不引入就不引入」；新开第五个接口会让「收录来源」与「创建来源」这两个概念长期打架。

### 8.5 前置 blocker：`index.json` 没有 schema 迁移路径

`packages/core/src/store.ts` 的 `readStoreIndex` 对版本不符是**直接抛错，没有迁移分支**。draft 状态、#168 的分类字段，任何一个落地都要升 `STORE_INDEX_VERSION`——那一刻真机上已有的库存直接打不开。

**这一条排在创建模块之前，也排在 #168 之前。** 它是所有后续 schema 变更的公共前置。

### 8.6 授权应该拆成两段

创建是写操作，但它的两个动作风险完全不同：

| 动作 | 碰谁 | 建议 |
|---|---|---|
| 在**库存内**开目录、写模板 | 不碰用户任何东西 | 低风险，不必每次确认 |
| **挂链回客户端目录** | 碰用户目录 | 沿用现有授权铁律 |

[cli-commands-v0.md](../../specs/cli-commands-v0.md) §2 现在对写操作是一刀切要求确认，没有这个区分。拆开之后「AI 创建 skill」的交互成本降到可接受，而红线一步没退。

同时红线本身要延伸一格：**AI 建了模板但没写完就放弃**，库存里会堆积空壳 draft。清理这些半成品算不算「真删除」？倾向于不算（它从来不是用户资产），但必须写进规范，否则要么没人敢清、要么有人顺手写出全项目第一条真删除路径。

### 8.7 分层落点与文件放置

依据 [project-structure.md](../../conventions/project-structure.md) §三决策树与 [core-patterns.md](../../conventions/core-patterns.md) §5：

| 层 | 承担 |
|---|---|
| core | allocate（占目录名、写模板）、commit（定稿后算哈希入 index）、挂链复用现有 `applyLinkSet`。纯确定性、可单测 |
| cli | 命令面、JSON 契约、授权、编排（allocate → 交出路径 → 等内容写入 → commit） |
| web | 人用壳的「新建」入口（可后置） |
| Skill 层 | 对话式引导：问用途、定 name、写 description、判可移植性 |

**最后一行是最硬的约束。** 把「问用户这个 skill 是干什么的」写成 CLI 的交互式 prompt，就是把智能层写成了代码，直接违反 core-patterns §5——那一节的分工表已把「收录时的对话式引导」归入 Skill 层，创建期引导是同一性质。CLI 侧只应有 `new <dirName>` 这样的确定性入口。

文件放置：`core/src/create.ts` **独立于** `store.ts`。理由不是行数，是 §8.1 的语义反向——放在一起会持续诱导实现者去复用 `adoptSkillFolder`，而那恰好是 §8.2(b) 的冲突点。物理隔离在这里是防错手段。

不新增 workspace 包：project-structure §四 的三个门槛一个都不满足。命令名先改 [cli-commands-v0.md](../../specs/cli-commands-v0.md) 再写代码（它是命令名的唯一口径）。

**模块边界的一句话判据**：创建模块只负责「让一个新 skill 从诞生起就在库存里」，不负责「它写得好不好」。质量判断属于 Skill 层与 `analyze`，混进来这个模块会无限膨胀。

### 8.8 落地顺序

```
schema 迁移机制（8.5）
   └→ draft 入模型 + #168 分类字段（一次性升版）
        └→ 创建的 core 原语（allocate / commit）
             └→ CLI 命令面 → Skill 层引导 → Web 入口
```

## 9. 必须实测、不能凭猜的未知

1. 我们的 skill 能否与内置 creator 竞争命中（Codex `$skill-creator` 是显式调用，Cursor 走 description 匹配，机制不同）。
2. 创建后立即把落点从真目录切成链接，会不会打断正在往里写 `references/` 的那个会话（Windows junction 切换时序）。
3. [#166](https://github.com/AIMFllyYS/Tmp-Skills-Hub/issues/166) 的热加载结论直接决定「建完能不能马上用」；若各家都要重启，E 的体验优势打折。
4. Codex hook 的 trust 流程能否非交互完成（`/hooks` 需人工确认），这决定 C 是否现实。
5. 各客户端 creator 的默认落点是否稳定（openai/codex#14941 记录了模型把 skill 放错位置的行为）。

## 10. 建议的决策形态（不替人拍板）

分层，而不是二选一：

```
主路径   E 创建即落库存 + B 写进常驻的自身 SKILL.md
             │  （前置：自身 skill 常驻；#168 分类字段先定）
             ▼
兜底     A #163–#165 事后对账归拢   ← 保证最终一致，不可省
             │
加速(可选) C hook 只提醒不阻断（仅有 hook 能力的客户端）
           D watcher（仅 ui 进程常驻期间）
```

## 11. 决策点（待人勾选）

- [x] 在架构 §4 补第六个操作「创建」，并写明它与「存」的区别 — **已落地** `feat/169-create-operation` `6c41207`
- [x] 主路径取 E（创建即落库存）还是 B（建完再同步） — **取 E**，`core/src/create.ts` 实现 `allocateDraft` / `commitDraft`
- [x] 是否接受 C（写客户端 hook 配置）；若接受，是否限定为「只提醒不阻断」 — **不做 C**，理由见 §3.3
- [x] 是否做 D（watcher），还是只靠面板上的手动重扫 — **不做 D**，本分支只留主路径 + 事后兜底
- [x] 自身 skill 常驻怎么落地（谁装、装到哪些客户端、用户如何撤销） — **bootstrap 自动 adopt + enable**，用户用 `disable` 撤销，不做特例
- [ ] 创建期要采集哪些 provenance 字段（与 #168 分类口径对齐后才能定） — 暂只记 `kind: "authored"`，#168 定稿后追加

架构层（§8）新增：

- [x] 资产模型是否补 draft / committed 这根轴；draft 是否进 `index.json`，还是只在 commit 时入账 — **draft 单独存在 `index.json` 的 `drafts[]` 中**，不混进 `skills[]`
- [x] allocate / commit 补在 `StorageProvider` 上，还是新开第五个接口（本文倾向前者，理由见 §8.4） — **补在 `StorageProvider` 上**
- [x] `index.json` schema 迁移机制是否作为 #168 与本文的**共同前置**先行落地（§8.5） — **已落地** `core/src/migrate.ts`，index.json v1→v2
- [x] 授权是否拆成「库存内开目录」与「挂链回客户端」两段（§8.6） — **已拆**，`cli-commands-v0.md` §2.1
- [x] 空壳 draft 的清理是否豁免软删除铁律 — **豁免**，`discard` 移入 `archive/drafts/` 不引入真删除

## 12. 不做（本分析）

整盘搜索所有 Git 仓库、真删除、静默搬走用户资产、替各 Agent 重写加载算法、把客户端 skills 目录整体做成链接（[core-patterns.md](../../conventions/core-patterns.md) §4 已否决：目录整体是链接不可靠，且整目录 rename/删除是红线）。

## 13. 关联

- 云端 issue：[#169](https://github.com/AIMFllyYS/Tmp-Skills-Hub/issues/169)
- 下游兜底：[#162](https://github.com/AIMFllyYS/Tmp-Skills-Hub/issues/162) / [#163](https://github.com/AIMFllyYS/Tmp-Skills-Hub/issues/163) / [#164](https://github.com/AIMFllyYS/Tmp-Skills-Hub/issues/164) / [#165](https://github.com/AIMFllyYS/Tmp-Skills-Hub/issues/165)
- 分类口径：[#168](https://github.com/AIMFllyYS/Tmp-Skills-Hub/issues/168)
- 可见性前置：[#166](https://github.com/AIMFllyYS/Tmp-Skills-Hub/issues/166)
