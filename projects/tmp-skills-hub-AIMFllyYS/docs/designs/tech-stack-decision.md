# 技术选型决策记录

> Created: 2026-08-16
> Updated: 2026-08-16
> Status: accepted
> Source: [架构初始规范](./architecture-initial-spec.md) · [第一次同步会](../updates/meeting-2026-08-15-first-sync.md) · SPM 旧设计文档（spm-design / spm-draft / spm-agent-era-rethink，社团内部飞书）
> 定位: 记录「为什么是 core + CLI + Vite 壳，而不是 Next.js」。推翻本文结论需按架构规范 §1 方法论重走一遍。

## 1. 决定

| 部分 | 选型 | 一句话理由 |
|---|---|---|
| 语言 | TypeScript（全仓统一，Node ≥22） | 用户全员有 Node;核心逻辑可被 CLI 与 Web 共享 |
| 形态 | pnpm monorepo: `packages/core` + `packages/cli` + `apps/web` | 产品本体是本地工具,页面只是外衣 |
| core | 纯 TS 库，零框架依赖 | 确定性内核必须可单测、可复用、不被框架绑架 |
| cli | citty + Hono（本地查看服务） | 命令行为 + 给 App 壳供数,几十行的量级 |
| web | Vite + React 19 + Tailwind CSS 4，纯静态 SPA | 数据在用户硬盘上,SSR 的全部优势用不上 |
| 分享层 | Git 仓库本身（授信成员直接写） | 零服务器、零账号、天然版本历史 |
| 后置 | Supabase（账号/统计）、EdgeOne（云端站点） | D 块解 block 时再上,接口已抽象 |

## 2. 关键推理

### 2.1 产品第一性:本地文件管理器,不是网站

A 块（库存与镜像层）要做的事——扫描 `.claude/` `.codex/` 等目录、算文件夹内容哈希、创建符号链接——全部发生在用户本机文件系统上,浏览器做不了。所以 A 天然是本地进程,最自然的形态是 CLI。Next.js 是「先假设产品是个网站」的选型,与本产品第一性错位。

### 2.2 语言:为什么不是 Go/Rust

Go/Rust 的核心卖点是「用户零依赖的单文件分发」。但本项目用户是社团里玩 Agent 的人,机器上必然有 Node,这个卖点价值为零;而代价（多一门语言、核心逻辑无法与 Web 共享）是实打实的。且工作负载是文件 I/O 密集,不是计算密集,语言性能差异体现不出来。

### 2.3 Web 壳:为什么 Vite 而不是 Next

- 数据源是本机文件系统,部署在云端的 SSR 服务器摸不到用户硬盘;
- 交付方式是 `skills-hub ui` 起本地小服务(Hono)供数 + 静态页面,整条链路无部署;
- 列表/搜索/分类/tag 是纯客户端渲染的量级;
- web 与内核之间只有 HTTP 契约,将来 D 块的云端站点可以另起应用(届时再评估 Next + Supabase),不牵动本仓库内核。

### 2.4 借自 SPM 设计的三个结论

1. **确定性内核尽量小**:只有「错了会破坏数据一致性」的逻辑写成代码;文本判断类功能写成 Skill 交给 Agent。
2. **CLI + Skill 双重身份**:内核能力通过一份 SKILL.md 暴露给 Agent（描述「什么时机该调用我」）,「对 Agent 说帮我存」这条收录路径由此免费成立,不需要 MCP server。
3. **不可变 store + content hash + lockfile**:与会议定的「内容哈希唯一标识」互相印证;lockfile 同时解决 C 分享层的对齐机制（共享仓库放清单,成员 sync 对齐）。

## 3. 明确不采用

| 不采用 | 理由 |
|---|---|
| Next.js（本仓库） | 见 2.3;原模板规范整体作废,由本文与 conventions/ 新规范替代 |
| Go / Rust | 见 2.2 |
| 自建后端 / 数据库（第一版） | 分享层用 Git 当后端;存储介质接口已抽象,千级 skill 再评估 |
| SPM 的 focus / supervision / evolve | 与会议「不重做各 Agent 的加载检索」结论冲突,登记进 backlog |

## 4. 遗留验证项

- Windows junction 与各 Agent 的兼容性 spike（M1 前置,单独 issue）
- 测试框架定案（倾向 vitest,首次引入时走 issue）
