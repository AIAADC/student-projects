# 目录结构与分层规则

> 本文档是 `AGENTS.md` 中 "Project Structure" 与依赖方向条款的完整版。
> 技术选型的论证见 [tech-stack-decision.md](../designs/tech-stack-decision.md)。

## 一、总体形态

skill-hub 是 pnpm monorepo。确定性本体是「核心库 + CLI」；**Web 是人用主界面**，CLI 给 Agent 与脚本：

```
.
├── packages/
│   ├── core/                       # 确定性内核（纯 TS，零框架依赖）
│   │   └── src/
│   │       ├── types.ts            # 资产模型（SkillMeta / SkillRecord / …）
│   │       ├── interfaces.ts       # 换介质时的类型登记（无 implements；见架构 §5）
│   │       ├── hash.ts             # 文件夹内容哈希
│   │       ├── skill-md.ts         # SKILL.md 通用层解析
│   │       ├── clients.ts          # 按目录形状发现客户端 root
│   │       ├── store.ts            # 库存 index + 收录
│   │       ├── store-layout.ts     # 目录布局
│   │       ├── store-location.ts   # 指针 / 库存根解析
│   │       ├── create.ts           # 创建：占位 / 定稿 / 丢弃
│   │       ├── links.ts / link-switch.ts / link-status.ts / link-probe.ts
│   │       ├── archive.ts / zip.ts
│   │       ├── backup.ts / backup-restore.ts
│   │       ├── groups.ts / stats.ts / skill-files.ts / migrate.ts
│   │       └── index.ts            # 唯一公共出口
│   └── cli/                        # 终端外衣 + 本地 HTTP
│       └── src/
│           ├── index.ts            # citty 入口，只做命令注册与参数解析
│           ├── store-cmds.ts / link-actions.ts / group-cmds.ts / create-cmds.ts
│           ├── scan.ts / bootstrap.ts / backup-cmds.ts / reset-cmds.ts
│           ├── github-source.ts / skills-sh-source.ts / share.ts
│           ├── analyze.ts / doctor.ts
│           ├── llm/                # 七牛云 AI SDK provider（网络只在 cli）
│           ├── agent/              # ToolLoopAgent、一等工具、模型白名单
│           └── ui-server.ts        # Hono 本地查看服务入口（createUiApp 注册器；分组/草稿/内容/链接路由在 ui-*.ts）
├── apps/
│   └── web/                        # 人用壳（Vite + React SPA:总览/统计/Skills；设置走 Dialog）
│       └── src/
│           ├── main.tsx
│           ├── App.tsx
│           ├── components/ui/      # 跨页控件（button / dialog / chart / table…）
│           └── features/           # 按领域聚合（shell / skills / actions；见第三节）
├── docs/                           # designs / plans / conventions / updates / issues / specs / audits / ops
├── scripts/                        # setup / build / dev 辅助脚本
├── pnpm-workspace.yaml
├── tsconfig.base.json              # 全仓共享编译选项
├── tsconfig.json                   # 根 project references(core, cli)
└── eslint.config.mjs               # 全仓统一 flat config
```

上表列的是**领域模块**，不是「每个新文件都必须出现在这份树里」。放置仍走第三节决策树。

## 二、分层与依赖方向（硬规则）

```text
apps/web ──(HTTP /api)──→ packages/cli ──(import)──→ packages/core
```

- **core 不依赖任何 workspace 包，不 import 任何框架**。允许 Node 标准库；网络、进程管理、终端交互一律不进 core。
- **cli 依赖 core**，负责:命令行为、本地 HTTP 服务、把 core 的产出序列化成 JSON。
- **web 不 import core 也不 import cli**——它通过 HTTP 消费 CLI 的 `/api`。这保证 Web 壳永远可以被替换、可以被部署到别处（将来 D 块的云端站点），而不牵动内核。
- 违反方向的 import 在 code review 中直接打回，无例外。

### 为什么 web 不直接 import core

core 的能力（扫描、哈希、symlink）依赖本机文件系统，浏览器里跑不了。让 web 依赖 core 只会诱导"在构建期偷偷读文件系统"这类脆弱做法。数据必须经由 CLI 的本地服务这一条通道。

## 三、文件放置决策树

```
这段代码被谁使用？
│
├─ 是确定性操作(文件、哈希、链接、lockfile),将来 CLI 和 Web 数据源都要用
│   └─ packages/core/src/,并从 index.ts 导出
│      ※ 判断标准:错了会破坏数据一致性的逻辑,必须进 core 且可单测
│
├─ 只是某个 CLI 命令的编排/展示逻辑
│   └─ packages/cli/src/<command>.ts,入口 index.ts 只注册命令
│
├─ 只在 Web 壳的一个页面/领域内使用
│   └─ apps/web/src/features/<domain>/(组件、hooks、类型放一起)
│      ※ 单处使用的组件不要提前抽到共享目录
│      ※ 人用 IA 是 shell（总览/统计/Skills）+ skills；不要往已退役的三栏 panel IA 加新代码
│
├─ Web 壳跨领域复用的纯展示组件
│   └─ apps/web/src/components/
│
└─ 文本判断类功能(审查、分类建议、"有用"判定…)
    └─ 不写代码——写成 Skill 交给 Agent(见 core-patterns.md 第五节)
```

## 四、新增包的门槛

默认不加新包。满足以下全部条件才允许新增 workspace 包：

1. 有独立的发布/部署生命周期（如将来的浏览器插件、云端站点）；
2. 与现有包的依赖方向能画进第二节的图而不产生环；
3. 在 issue 里先立项并引用架构规范 §1 的方法论走过一遍。
