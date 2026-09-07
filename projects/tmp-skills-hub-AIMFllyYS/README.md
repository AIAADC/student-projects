# Skill-Hub · 社团 Agent Skill 共享与统一管理中心

> 把散落在 Claude / Codex / Cursor 等目录里的 Agent Skill 收进统一位置，用内容哈希去重，再以符号链接让各 Agent 继续发现和使用——「改一处，全局生效」，不漂移。

仓库名 **Tmp-Skills-Hub**，项目内名 **skills-hub**。它服务社团自己的成员，而不是公开市场上的所有人：第一件能用起来的事，是在本机跑一个统一查看的页面，并按授信成员写入共享仓库的方式完成分享。

## 🔗 相关链接

| 入口 | 地址 | 说明 |
| --- | --- | --- |
| 📦 开源仓库 | https://github.com/AIMFllyYS/Tmp-Skills-Hub | 完整源码、Releases、Issues |
| 📁 本目录 | `projects/tmp-skills-hub-AIMFllyYS/` | AIAADC 学生项目展示副本（源码） |

## ✨ 主要功能

- **本机管理面板**：总览 / 统计 / Skills 管理 / 设置四块面板（`ui` 一键打开）；
- **多来源收录**：本地目录、GitHub 仓库或目录、skills.sh 三段链接；
- **内容哈希去重**：按文件夹内容哈希识别重复 skill；
- **符号链接分发**：链接回各 Agent 技能目录，修改全局生效、不漂移；
- **自带可调用 Skill**（`SKILL.md`）：`adopt` 收录、`list/group list/show` 查询、`enable/disable` 按客户端启用/撤回、`archive` 软删除、`analyze` 相近/冲突分析、`backup/reset` 快照还原与重置。

研究方向（登记在册，不第一天做）：账号系统与统一登录、使用量统计与全站精选、浏览器插件（十秒内收录）、千级 skill 的存储介质。

## 🛠️ 技术栈

- **pnpm workspace + TypeScript strict**（Node ≥ 22）
- `packages/core`：纯 TypeScript 确定性内核（库存、哈希、symlink、接口抽象，零框架依赖）
- `packages/cli`：citty + Hono（终端入口 + 本地查看服务）
- `apps/web`：Vite + React 19 + Tailwind CSS 4（人用壳，纯静态 SPA）
- 共享层：Git 仓库（授信成员直接写，链接分发，零服务器）

## 🚀 如何运行

```bash
pnpm install
pnpm build

# 扫描本机各 Agent 目录，列出发现的 skill（只读）
node packages/cli/dist/index.js scan

# 启动本地查看服务（App 壳的数据源，默认 127.0.0.1:4321）
node packages/cli/dist/index.js ui
```

开发模式：

```bash
pnpm dev:cli scan     # tsx 直跑 CLI 源码
pnpm dev:cli ui       # 起本地数据服务
pnpm dev:web          # 另开终端：Vite 开发服务器（/api 代理到 4321）
```

质量检查：`pnpm lint`、`pnpm typecheck`、`pnpm build`。

## 👤 作者

- **AIMFllyYS**（YuSheng），华中科技大学学生开发者
- GitHub：https://github.com/AIMFllyYS

## 🤝 欢迎共建

- 提 Issue：反馈收录/去重/分发问题，建议新功能；
- Fork + Pull Request：完善核心库、CLI、Web 面板与文档；
- 在社团内部试用，帮助积累真实使用场景。

架构决策与工程计划见本目录 `docs/designs/` 与 `docs/plans/`。

## 📄 License

MIT（仓库 README 声明；仓库内暂未放置 LICENSE 文件，使用前请联系作者确认）。
