# 代码风格规范

> 本文档是 `AGENTS.md` 中代码风格条款的完整版。
> 代码长度与文件组织规则见 [code-size-and-organization.md](./code-size-and-organization.md)。
> 确定性内核的硬约束见 [core-patterns.md](./core-patterns.md)。

## TypeScript（全仓）

- strict mode 全开（`tsconfig.base.json`，含 `noUncheckedIndexedAccess`、`exactOptionalPropertyTypes`）
- 禁止 `any`，用 `unknown` + 类型收窄（ESLint 设为 error）
- 命名导出优先，不用默认导出（web 的 `App`/入口组件除外）
- Node 包（core/cli）用 ESM + `NodeNext`，包内相对导入写 `.js` 后缀
- 公共类型集中从各包 `index.ts` 导出；包外不允许深路径导入（`@skills-hub/core/dist/...` 禁止）

## packages/core

- 零框架依赖，只允许 Node 标准库
- 函数尽量纯；I/O 集中在明确命名的函数里（`readSkillMeta`、`hashSkillFolder`），便于单测
- 所有对外接口先在 `interfaces.ts` 定义（对应架构规范 §5 的四个抽象点），实现类不直接暴露
- 注释只写非显然的意图与约束（如哈希确定性的三条不变量），不复述代码

## packages/cli

- `index.ts` 只做命令注册与参数解析；命令实现放独立文件
- 命令输出面向人类可读；供 Web 消费的数据一律走 `ui-server.ts` 的 JSON 接口，不解析 CLI 文本输出
- 本地服务只绑 `127.0.0.1`，只读接口；任何写操作（收录、删链接）必须由用户在终端显式发起
- `console` 是 CLI 的正常输出通道（ESLint 已对 cli 放开）

## apps/web

- 函数组件 + hooks，不引状态管理库（数据流是「fetch 一次 + 本地过滤」的量级，`useState`/`useMemo` 够用；引库需先立 issue）
- Tailwind CSS 写样式，不使用 CSS Modules；条件 className 用 `cn()`（`clsx` + `tailwind-merge`，见 `apps/web/src/lib/utils.ts`）
- 跨页按钮、输入、对话框、Tab、Toast、开关、侧栏拖条、ScrollArea、Skeleton、Tooltip、折叠、图表容器、表必须来自 `apps/web/src/components/ui/`，服从 [ui-design-v1.md](./ui-design-v1.md)；业务文件不复制第三套控件样式，不手写条形图
- 图标只用 Lucide 线性变体，且仅在能省字或帮助扫读时出现
- 新 UI 文件可用 `@/` 指向 `apps/web/src/`；feature 内既有相对路径 `.js` 导入不必为了 alias 全量改写
- 与 CLI 服务的数据契约（`/api/skills` 的字段）变更时,同一个 PR 里同步改 `ui-server.ts` 和 web 端类型
- 展示层字段（display name 一类）只影响渲染,检索与召回仍按 `name`（架构规范 §3.3）

## 测试与质量

- core 的确定性逻辑（哈希、解析、路径解析）**必须**有单元测试;测试框架首次引入时用 issue 定案（倾向 vitest）
- cli/web 的骨架阶段允许无测试,但涉及写操作（store 变更、symlink）的命令落地时必须带测试
- 改动后运行 `pnpm lint`、`pnpm typecheck` 确认无错误

## 中英文

- 代码标识符、目录、skill `name` 一律英文（Agent 读取与路径稳定性优先）
- 注释与文档用中文;面向用户的 CLI 输出用中文
