# 库存位置、目录布局与沙箱约定（v0）

> Created: 2026-08-16
> Status: accepted
> Source: [架构初始规范](../designs/architecture-initial-spec.md) §3 · [第一次同步会](../updates/meeting-2026-08-15-first-sync.md) Step 1
> 定位: 本文是「东西放在哪」的唯一口径。所有涉及路径的代码都必须按本文解析，不得自行拼路径。

## 0. 一条实测背景

本机（Windows）实测：**26 个客户端 skills 目录，579 份 skill 副本，只有 190 个不同名字**。
`demo-init` 在全部 26 个 root 里各一份；连备份目录 `.demo-init.backup-20260814T203633` 也被复制了 26 份。

这就是统一库存要解决的问题，不需要再论证。

## 1. 库存位置：不放用户目录

库存本体放在**用户指定的位置**（如 `D:\SkillsHub`），不塞进 `~`。但 CLI 必须能找到自己的库，所以用户目录里只留一个指针文件。

解析顺序（先命中者胜；适用于 `list` / `adopt` 等把 `--home` 当库存根的命令）：

1. 命令行参数 `--home <path>`
2. 环境变量 `SKILLS_HUB_HOME`
3. 指针文件 `~/.skills-hub/config.json` 里的 `storeRoot` 字段
4. 都没有 → 报错，提示先跑 `skills-hub init`

指针文件只存一个绝对路径，不存任何业务数据。这样「库在哪」可迁移，「库里有什么」全部跟着库走。

**`ui` / `bootstrap` 拉起面板时不要走第 1 条。** 这时传入的 `home` 只是客户端发现基座和指针文件所在处，不是库存根。面板按指针（其次 `SKILLS_HUB_HOME`）解析 `storeRoot`，不得把 `home` 当作 `cliHome` 直通——库存与 home 分离是本节的默认形态，直通会把用户主目录当成空库存。

## 2. 目录布局

```
<storeRoot>/
├── manifest.json     # 库自身元信息（版本号、创建时间）
├── index.json        # 哈希 ↔ skill 对照表（库存清单）
├── links.json        # 受管链接台账（我们建过哪些链接）
├── groups.json       # 分组定义（内置 + 用户自定义）
├── stats.json        # 调用计数
├── skills/<name>/    # 活跃 skill 真身，符号链接指向这里
├── archive/          # 软删除归档，<name>-<ISO时间戳>.zip
│   ├── versions/      # 编辑写回前的旧内容快照（<name>-<ISO>/<relPath>，版本历史）
│   └── drafts/        # 被 discard 的草稿（<name>-<ISO时间戳>/，原样保留不 zip，不算真删除）
├── translations/     # 译文缓存（#208）：<skillHash>/<relPath>，派生产物，不入 skill 内容
└── tmp/              # 原子操作暂存，操作结束即清空
```

### 2.1 编辑写回的版本历史（#37）

面板保存编辑时，改动前的旧文件副本先落入 `archive/versions/<name>-<ISO时间戳>/<relPath>`（原子写），再原子写回原件并更新 `index.json` 的哈希。回滚 = 从 versions 取回。与软删除归档（zip）并存：软删除收拢整份 skill，版本快照只留被改动的文件。

### 2.1.1 译文缓存（#208）

翻译是派生产物，一律存 `translations/<skillHash>/<relPath>`，**绝不写回 `skills/<name>/` 原件**——写回会改内容哈希并经链接泄漏给客户端。铁律：

- 键是记录哈希（index.json）：编辑写回/verify 更新哈希后，旧译文自然失效（孤儿清理另行立项）
- 哈希目录名只认十六进制，relPath 复用 skill-files 的同款防穿越口径（越界即拒绝）
- 备份内核只走客户端 skillsDir，不快照本目录；客户端发现不会误收它（形状扫描只认 home 直接子目录下的 skills/，而 translations/ 下没有这形状）

### 2.2 为什么活跃态是目录、归档态是 zip

符号链接必须指向一个含 `SKILL.md` 的**真实目录**，Agent 才发现得了；把 zip 链接过去等于没有 skill。
所以活跃 skill 一律是目录。zip 只用于归档：软删除后收拢成单文件，便于查看历史与将来传输。

### 2.2 为什么目录名用 `name` 而不用 `<hash>`

录音稿要求的是「**去重判定**按整个文件夹内容的哈希，不按文件名」——这一条落在入库逻辑里，不落在目录命名上。
目录名用 `name` 让库存人类可读、路径稳定；哈希记在 `index.json` 里。二者不冲突，且更简单。

### 2.3 name 冲突的处理

入库时若 `skills/<name>/` 已存在：

- 内容哈希相同 → 判为同一个 skill，幂等跳过，把新来源追加进该记录的 `origins`
- 内容哈希不同 → **判为冲突，不覆盖**，写进本次收录报告交给用户决定

## 3. 哈希的语义（重要）

`index.json` 里的 hash 是「**入库或上次 verify 那一刻的内容指纹**」，不是随时可信的身份。

原因：面板允许用户编辑 skill、Agent 也会通过链接改到原件，所以 `skills/<name>/` 是可写的。内容一变，记录里的 hash 就旧了。

配套约定：

- `verify` 命令重算全部 hash，报告哪些 skill 漂移了
- 用户确认后，旧内容归档成 zip，`index.json` 更新为新 hash——归档区天然构成版本历史
- 哈希算法的三条不变量（排序、路径参与、原始字节）不变，见 [core-patterns.md](../conventions/core-patterns.md)

## 4. 客户端发现规则

**不维护品牌名单**，只认目录形状。本机有 100+ 个点目录，硬编码品牌名必然漏。

1. 扫描 `<home>` 下的每个直接子目录，凡存在 `<home>/<client>/skills` 即为一个 root（`.agents` 视为普通客户端目录，天然覆盖跨客户端标准）
2. 追加已知嵌套惯例（存在才算）：`.cursor/skills-cursor`、`.gemini/antigravity/skills`、`.codeium/windsurf/skills`、`config/<client>/skills`（XDG 风格，Devin CLI / OpenCode 的官方全局目录）
3. 解析真实路径并去重（`.codex/skills` 与 `.agents/skills` 等可能互为 symlink，不去重会重复计数）

**排除**（只判定 home 之下的相对段，命中即跳过）：名为 `builtin_skills` 的目录、插件/市场缓存（`plugins`、`cache`）、扩展目录（`extensions`）、浏览器 profile（`google-chrome`、`firefox` 等）、临时目录（`tmp`、`temp`）、**本项目自己的目录**（段名去前导点后等于 `skills-hub` 或以 `skills-hub.` 开头，覆盖 `.skills-hub`、`.skills-hub.pre-bootstrap-*`、`.skills-hub.bak` 等）。这些归客户端所有或由本项目自己产生，不应再被当成客户端。

**库存根**：调用方若已知库存根，必须把它传给 `discoverClientRoots`。排除的是库存自己的 `skills/`（以及 `backups/`、`archive/`、`tmp/` 子树），不是库存根下面的一切——`--home` 双重语义下库存根等于 home，`.claude` 等客户端必须继续被发现。默认库存 `~/.skills-hub` 一旦建出 `skills/`，形状扫描会把它当成客户端，自我备份、自我收录；前缀排除与库存根声明一起挡住这件事。`translations/` 不需单独排除：形状扫描只认直接子目录下的 skills/，而译文缓存里不存在这形状。

**系统级目录**（`/etc/<client>/skills`、`/Library/Application Support/...`、`ProgramData` 等）**不在 home 扫描范围**，留给 `doctor` 提权检测。

**绝不创建**不存在的 root。发现只认既存目录。

> 本节规则来自本机已验证可用的 `distributing-skills-across-local-agents` skill，直接沿用；
> 2026-08-16 依据 [调研文档](../audits/client-skills-directories-2026-08-16.md) 修订（XDG 惯例、系统级边界、排除清单显式化），并随 issue #13 落地为 `discoverClientRoots`。

## 5. 沙箱与验证边界（硬约束）

产品红线是「收录前必须明确告知并获得授权，绝不静默搬走用户已有技能」。无人值守时没有人能授权，所以：

- **所有写操作必须能被 `--home` / `SKILLS_HUB_HOME` 整体重定向**。core 里禁止在函数内部直接调 `os.homedir()` 决定写入位置，home 必须是显式传入的参数。
- 无人值守期间的写操作**只允许打在沙箱**：`<repo>/.sandbox/home-<时间戳>/`（已在 `.gitignore` 中）。
- **禁止**在测试或验收脚本里向真实的 `~/.claude`、`~/.cursor` 等目录写入任何内容。
- 读取真实目录是允许的（用户已明确授权），可以复制真实 skill 作为测试素材。
- 真机首次收录由用户亲手执行，CLI 保留交互确认，`--yes` 是显式旁路。

### 为什么沙箱是「假 home 目录」而不是 WSL / Docker

本项目最值得验证的风险是 **Windows 上的 junction 能否被各 Agent 正常读穿**。WSL 和 Docker 里不存在 junction 这个概念，`/mnt/d` 的跨文件系统语义还会导出错误结论——进容器等于把唯一值得验证的东西验证不了。
假 home 既完全不碰真实目录，又能真验证 junction，且沙箱根位于 D 盘。
