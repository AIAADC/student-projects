# Agent v1——面板内对话式库存管家

> 状态:生效 | AI 调用口径见 [ai-integration-v1.md](ai-integration-v1.md);HTTP 端点登记见 [http-api-v0.md](http-api-v0.md)
>
> **v1 修订（2026-08-24，#216）**：运行时从自制 OpenAI 子集（WireMessage、自研 SSE、`runAgentTurn`、`run_cli` spawn）换成 Vercel AI SDK（`ToolLoopAgent` + UI message stream + `toolApproval`）。工具面改为一等 `tool()`，直调现有 `perform*`。写操作由会话级 `writePolicy` 控制。翻译不再与 Agent 共用事件契约。

## 1. 定位

面板内的对话式 Agent,通过工具调用操作本机 skills-hub 库存。服务端无状态:前端每轮请求携带全量 `UIMessage[]` 历史,服务端不保存会话。

人用入口只有 Web Agent 页。不提供 `skills-hub agent` TUI。外部编码 Agent 仍走 CLI + `self-skill`,不走本模块工具面。

## 2. 执行环境

与 ui-server 同一 home / storeRoot(真实库存),不做会话沙箱。安全由 CLI 本身的铁律兜底(软删除、原子切换、库存不可变),再加运行时 `toolApproval`。库存未配置时 Agent 仍可对话,工具返回「库存未配置」文本。

循环上限:`ToolLoopAgent` 的 `stopWhen: stepCountIs(15)`(最多 15 次模型调用)。

## 3. 写策略(`writePolicy`)

每轮请求 body 带 `writePolicy`:`"ask"` | `"allow"`。缺省 `"ask"`。服务端当轮生效。

| 策略 | 读工具 | 写工具 |
| --- | --- | --- |
| `ask`(默认) | 自动执行 | SDK 暂停,前端 Approve / Deny |
| `allow` | 自动执行 | 自动执行 |

- `allow` 是人在面板页头显式打开的选择,授权对象是本会话的写策略,不是静默搬走用户 skill。
- `ui` / `bootstrap` / `reset` 两种策略都不提供。
- 实现落在 `ToolLoopAgent` 的 `toolApproval` 回调,不要把策略写进每个 `tool()`。

## 4. 工具面

一律 `tool()` + Zod schema;`execute` 直调现有 `perform*` / core 函数,失败返回 `{ ok: false, message }` 文本,**不 throw、不 spawn CLI**。输出截断 24000 字符。

### 4.1 读(永不审批)

| 工具 | 行为 |
| --- | --- |
| `list_skills` | 列库存(含可见客户端) |
| `show_skill` | 单个 skill 元信息;`target` = dirName 或唯一 hash 前缀 |
| `scan_clients` | 扫描各客户端目录发现的 skill(不入库) |
| `read_skill_file` | 读库存中某 skill 的文件;`target` + 相对 `path` |
| `list_groups` | 列分组 |
| `list_archive` | 列归档区 |
| `list_backups` | 列备份快照 |
| `doctor` | 环境自检 |
| `verify` | 重算哈希、报告漂移 |
| `analyze_skill` | 相近/冲突建议,不写盘(复用 `performAnalyze`) |

### 4.2 写(`ask` 时审批)

| 工具 | 行为 |
| --- | --- |
| `enable_skills` / `disable_skills` | `performLinkChange`;需 `clientId`,`scope` 缺省 global |
| `adopt_skill` | `performAdopt`(本地路径或 GitHub / skills.sh URL) |
| `archive_skill` / `restore_archived` | 软删除 / 从归档恢复 |
| `share_skill` | `performShare` |
| `create_draft` / `commit_draft` / `discard_draft` | 创建路径的占位 / 定稿 / 放弃 |
| `write_skill_file` | 与 `PUT /api/skills/:hash/file` 同一 `saveSkillFile` |
| `group_create` / `group_update` / `group_delete` / `group_members` | 现有分组 `perform*` |

不做:`run_cli` 逃生舱、`reset`、`backup restore`。

## 5. HTTP 流契约

`POST /api/agent/chat` 使用 AI SDK UI message stream(`createAgentUIStreamResponse`),不是自研 `delta/tool_call/tool_result/done` 帧。

- 请求:`{ messages: UIMessage[], model?, writePolicy? }`
- `messages` 不得含 `role: "system"`(system 由服务端 `instructions` 注入)→ 400
- 缺 `messages` 或非数组 → 400
- 未配置 `QINIU_API_KEY` → **进流前** 503 `{ ok:false, code:"not-configured" }`
- `model` 不在白名单时回落默认模型
- 响应:`text/event-stream`,带 AI SDK UI message stream 头;前端用 `@ai-sdk/react` 的 `useChat` 消费

翻译的 `delta/done/error` 是翻译专用契约,见 [http-api-v0.md](http-api-v0.md),不再与 Agent 共用。

## 6. 模型白名单

`packages/cli/src/agent/models.ts` 的 `AGENT_MODELS` 常量:默认 `deepseek/deepseek-v4-flash-20260731`,另列能力旗舰 / 编程强 / 最便宜三档。`model` 参数不在白名单时回落默认模型。白名单 ID 以七牛云 `/v1/models` 实际返回为准校准。

## 7. 输出契约(系统提示词承诺)

- 正文一律简体中文 Markdown 流式输出;工具调用由前端渲染卡片,不必解释协议。
- 先查再动:不确定库存状态时先 list / show / scan。
- `ask` 模式下不要用口头「请确认」代替工具审批——写工具会自动暂停。
- 工具返回失败时如实转述,不编造结果。
- 收录用户已有 skill 前必须明确告知;在 `ask` 下由审批条落地,在 `allow` 下视为用户已选择本会话放行写操作。
