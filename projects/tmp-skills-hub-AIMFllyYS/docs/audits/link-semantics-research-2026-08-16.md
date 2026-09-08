# 各系统非破坏性链接语义与权限调研(2026-08-16)

> 链接层是全项目风险最高的一块。本文档联网查证四个问题,每条结论附来源;明确区分「已查证」与「待实测」。
> 直接产出:链接类型的平台推荐、权限前提、绝对不能做的操作清单,以及 core-patterns.md §4 的修订点(§4 已随本文档同步修订)。

## 一、Windows 上 junction / 符号链接 / 硬链接的行为差异

| 维度 | 目录 junction | 目录符号链接(symlink) | 硬链接(hard link) |
| --- | --- | --- | --- |
| 权限前提 | **无需提权**,普通用户可建 | 需开发者模式或管理员(或进程显式用 SYMBOLIC_LINK_FLAG_ALLOW_UNPRIVILEGED_CREATE) | 无需提权 |
| 目标类型 | 仅目录,必须是**绝对路径**,仅本机 NTFS 卷(不跨卷/不跨 UNC) | 文件或目录皆可,支持相对路径 | 仅文件(目录硬链接被禁),同卷 |
| 语义 | 类似「目录别名」,重解析点在 NTFS 层面 | 路径级重解析,支持相对目标 | 同一 inode 的第二个名字,内容天然同步 |
| 跨卷 | 否 | 是 | 否 |
| 相对目标 | 否 | 是 | 不适用 |

来源:
- Microsoft Learn — Hard Links and Junctions: https://learn.microsoft.com/en-us/windows/win32/fileio/hard-links-and-junctions
- Microsoft Learn — Creating Symbolic Links(权限要求): https://learn.microsoft.com/en-us/windows/win32/fileio/creating-symbolic-links
- git-for-windows PR #1184(非特权 symlink 创建,ALLOW_UNPRIVILEGED_CREATE): https://github.com/git-for-windows/git/pull/1184
- OpenJDK nio-dev 8218418(同 flag 的 JDK 侧讨论): https://mail.openjdk.org/pipermail/nio-dev/2019-March/005977.html
- Wikipedia — Symbolic link(POSIX 与 Windows 对比): https://en.wikipedia.org/wiki/Symbolic_link

**各 Agent 读取链接形式 skill 目录时有无区别(查证结论):**

大多数按目录扫描的应用(glob、递归遍历)对 junction/symlink 是透明的——Dirent.isDirectory() 对两者都返回 true,内容可正常读取。但存在三类已知差异:

1. **目录整体是链接时,部分工具直接不认**:Claude Code 在 ~/.claude/skills 本身是 symlink 时不加载用户级 skills(约 v2.1.69 起回归,issue #38051);.claude 目录为 symlink 时 autocomplete 不显示 skills(#36659)。→ **绝不能让整个 skills 目录本身成为链接**。
2. **UI 面与 agent 加载器行为不一致**:Claude Code Desktop 的 / 命令菜单会漏掉 junction/symlink 形式的 skill,但 agent loader 解析正常(issue #68318)。→ junction 条目对 agent 读取可用,但对「菜单可见性」类需求可能不可见,需降级为复制。
3. **自动更新会清掉链接**:Claude Code 自动更新流程会移除 ~/.claude/skills/ 下的用户 symlink(issue #50052)。→ 链接落点所在目录若被客户端自身工具重写,链接会被清,需 verify/doctor 兜底或改用复制。

来源:
- anthropics/claude-code #38051: https://github.com/anthropics/claude-code/issues/38051
- anthropics/claude-code #36659: https://github.com/anthropics/claude-code/issues/36659
- anthropics/claude-code #68318: https://github.com/anthropics/claude-code/issues/68318
- anthropics/claude-code #50052: https://github.com/anthropics/claude-code/issues/50052
- anthropics/claude-code #68118(建议文档化 symlink 支持级别的请求,说明社区在用): https://github.com/anthropics/claude-code/issues/68118

本机实证(doctor 探测,2026-08-16):junction 可用、symlink 不可用(未开开发者模式)、hardlink 可用——与上表权限前提一致。

## 二、macOS 与 Linux 上应使用哪种链接,有无权限门槛

**查证结论:两个平台都是无特权 symlink**——普通用户即可 ln -s 创建目录/文件符号链接,无需管理员;硬链接仅限文件且同文件系统。macOS 的 Finder Alias 是另一种实体(记录路径+卷信息),程序扫描不会当作目录,不适用。

因此非 Windows 平台**首选 symlink(目录级)**,与 Windows 的 junction 对齐语义(都是「路径级重解析,目标是目录」)。

注意差异:Windows junction 目标必须是绝对路径且不跨卷;POSIX symlink 支持相对目标(换机/整体搬迁更稳)。跨平台实现时,生成目标路径的策略要按平台区分(Windows 用绝对,其余可用相对)。

来源:
- Wikipedia — Symbolic link(创建无需特权的 POSIX 语义、Windows 特例): https://en.wikipedia.org/wiki/Symbolic_link
- Symlinks Guide (macOS/Linux 实操): https://blog.starmorph.com/blog/symlinks-guide-macos-linux

## 三、哪些操作会导致「跟随链接递归删除」这类破坏性后果

**已查证的破坏性模式(绝对禁止,或必须先解链再删):**

1. **PowerShell Remove-Item -Recurse -Force 会跟随 NTFS junction 删除链接目标里的真实文件** —— pnpm 的 node_modules 场景下被脚本误删,官方 issue 标题即「catastrophic data loss」。https://github.com/PowerShell/PowerShell/issues/26913
2. **Python shutil.rmtree 曾因目录内 junction 直接失败/行为异常**(bpo-31226)。https://mail.python.org/pipermail/python-bugs-list/2019-August/414466.html
3. **openai/codex 在 Windows 上对 force delete 强制要求人工确认**(正是为防此类事故)。https://github.com/openai/codex/pull/8590
4. 命令行 del /s /q、Explorer 删除含 junction 的整棵树时,存在把 junction 目标内容一并删除的历史陷阱(gamedevguide win-internals 笔记)。https://github.com/ikrima/gamedevguide/blob/master/docs/dev-notes/win-internals/cmd.md

**安全删除模式(推荐):** 先移除链接本身(不跟随),再删链接对象。Node 侧:对链接条目用 unlink()(Windows 上 junction 也可 unlink,只删链接不碰目标);对整棵树删除时,遍历中遇到 junction/symlink 一律只 unlink 不递归。删除前先 lstat 判断类型。

**另一个破坏性陷阱(重命名):** POSIX 与 Windows 的 rename 都不允许「目录覆盖非空目录」,把新链接集合 rename 到已存在 junction 的位置会失败——所以原子切换的正确顺序是:unlink 旧链接(不跟随)→ rename 新链接;绝不能「整目录 rename 覆盖」(core-patterns.md §2 已禁止整目录替换,此处补充到条目级)。

## 四、各 Agent 是否会拒绝或跳过链接形式的 skill 目录

**查证结论:agent 加载器(读取侧)普遍能解析 junction/symlink 条目,但存在三类不友好场景(见第一节):目录整体链接不加载(#38051/#36659)、UI 菜单漏显(#68318)、自动更新清除(#50052)。**

**本机工具链实证:** distributing-skills-across-local-agents skill 的安全规则明确写着「Reject symbolic links」(拒绝符号链接)——但细读语义:它是**分发工具拒绝把链接作为源目录**(要求精确的独立副本,怕链接指向不确定位置/换机失效),不是 agent 读取侧不认链接。这印证了生态对链接的保守姿态:能不用就不用的工具是存在的,链接方案必须有复制降级路径。

来源:本机 ~/.claude/skills/distributing-skills-across-local-agents/SKILL.md「Safety rules」;上游仓库 https://github.com/AIMFllyYS/Tmp-Skills-Hub(本仓库扫描即此 skill 之产物)。

## 五、平台推荐与实施约束(结论)

| 平台 | 首选链接类型 | 权限前提 | 备注 |
| --- | --- | --- | --- |
| Windows | **目录 junction**(fs.symlink(..., junction)) | 无 | 目标绝对路径、不跨卷;条目级链接可用,目录级不可 |
| macOS / Linux | **目录 symlink** | 无 | 可用相对目标;同样条目级可用,目录级要实测各客户端 |
| 全部 | 硬链接 | 无 | **仅文件,不适用目录链接,本项目不用作挂载手段**(doctor 探测保留即可) |

**已验证(本机实测/官方文档):** junction 无需提权;symlink 需开发者模式或管理员;hardlink 仅文件;agent 加载器读取 junction 条目正常。

**需要实测验证(本批 spike 的验收项,列为后置):** ① 其余客户端(Cursor/Copilot/Codex 等)对 junction 条目的加载与 UI 显示;② 客户端自动更新对链接的清理行为;③ Windows 上「unlink 旧 junction → rename 新链接」切换序列在 NTFS 上的行为(与 §2 的 journal 回滚配合)。

## 六、绝对不能做的操作清单(Never 清单)

1. **绝不让整个客户端 skills 目录本身成为链接**(Claude Code #38051/#36659 实证会不加载)。
2. **绝不用 Remove-Item -Recurse -Force / del /s /q 删除含链接的树**(PowerShell #26913 灾难性数据丢失)。删除链接 = 先 lstat 判型,链接条目 unlink,目录才递归。
3. **绝不做整目录 rename 覆盖或整目录删除**(core-patterns.md §2 已有,本条为链接语义补充)。
4. **绝不对未登记(links.json 台账外)的同名条目做覆盖或删除**(§2 铁律,台账 #20 落地)。
5. **绝不在 store 内部放链接**(§4 已有;store 内容必须真实文件,哈希才对得上)。
6. **绝不在可能被客户端自动更新重写的落点指望链接长期存活**(#50052),要有 verify 兜底或复制降级。
7. **junction 目标用绝对路径时,绝不把 store 整体搬迁后不重建链接**(绝对路径会失效)——搬迁后必须重建链接集合(这正是原子切换的用途)。

## 七、与 core-patterns.md 第四节的对照与修订

原 §4 三条:junction 优先(无需提权)、各 Agent 读目录内容行为一致、落地前有 spike 验证。

对照结论:
- 「junction 无需提权」→ **查证成立**,保留。
- 「各 Agent 读目录内容的行为一致」→ **需要修订**:agent 加载器对 junction **条目**读取一致,但①目录整体为链接时不加载(Claude Code 实证),②UI 菜单可能漏显,③自动更新可能清除。修订为「条目级一致,目录级与 UI 层需降级/验证」。
- 「落地前有单独 spike issue」→ 保留,并把 spike 验收项补成 §五「需要实测」三项。
- 缺「破坏性删除清单」→ 已补入本文档 §六,并同步写入 core-patterns.md §四。
- 缺 hardlink 定位 → 明确:仅文件,不用于目录挂载。

## 附:来源汇总(全部已查证链接)

1. https://learn.microsoft.com/en-us/windows/win32/fileio/hard-links-and-junctions
2. https://learn.microsoft.com/en-us/windows/win32/fileio/creating-symbolic-links
3. https://en.wikipedia.org/wiki/Symbolic_link
4. https://github.com/git-for-windows/git/pull/1184
5. https://mail.openjdk.org/pipermail/nio-dev/2019-March/005977.html
6. https://github.com/PowerShell/PowerShell/issues/26913
7. https://mail.python.org/pipermail/python-bugs-list/2019-August/414466.html
8. https://github.com/openai/codex/pull/8590
9. https://github.com/ikrima/gamedevguide/blob/master/docs/dev-notes/win-internals/cmd.md
10. https://github.com/anthropics/claude-code/issues/38051
11. https://github.com/anthropics/claude-code/issues/36659
12. https://github.com/anthropics/claude-code/issues/68318
13. https://github.com/anthropics/claude-code/issues/50052
14. https://github.com/anthropics/claude-code/issues/68118
15. https://blog.starmorph.com/blog/symlinks-guide-macos-linux
