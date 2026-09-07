# AI 集成 v1——七牛云推理服务

> 状态:生效 | 取代 [deepseek-integration-v0.md](deepseek-integration-v0.md)
> 修订理由:供应商从 DeepSeek 官方切换为七牛云聚合推理——统一多模型入口、更便宜、支持 `enable_thinking` 开关、流式与工具调用(function calling),满足翻译流式化与新增 Agent 模块的需求。
>
> **#216 修订（2026-08-24）**：调用封装从自制 `chatCompletion` / `chatCompletionStream`(手写 OpenAI SSE 与 tool_calls 累积)改为 Vercel AI SDK。七牛云仍是唯一供应商;密钥铁律不变。

## 1. 事实清单

| 项 | 值 |
| --- | --- |
| 端点 | `{QINIU_BASE_URL:-https://api.qnaigc.com/v1}`(OpenAI 兼容 `/chat/completions`) |
| 认证 | `Authorization: Bearer <QINIU_API_KEY>` |
| 默认模型 | `deepseek/deepseek-v4-flash-20260731`;`QINIU_MODEL` 环境变量可覆盖(只影响翻译/分析的缺省模型) |
| Agent 模型 | 白名单制,见 [agent-v0.md](agent-v0.md) §6 |
| SDK | `ai` + `@ai-sdk/openai-compatible`;provider 名 `qiniu` |
| 思考开关 | 翻译/分析/Agent 一律 `enable_thinking: false`(经 `transformRequestBody` 注入);供应商仍可能发 reasoning 字段,SDK/客户端忽略 |
| Agent | `ToolLoopAgent` + `createAgentUIStreamResponse`;`stopWhen: stepCountIs(15)` |
| 翻译 | `streamText`;HTTP 仍发翻译专用 `delta/done/error` |
| 分析 | `generateText` + `Output.object`;失败不编造结论 |
| 错误码 | 400 格式 / 401 认证 / 402 余额 / 422 参数 / 429 限流 / 500 服务端 / 503 过载 |

## 2. 密钥铁律(沿用 v0)

- 密钥只从环境变量读取(`QINIU_API_KEY`),`.env` 仅作为把变量放进进程环境的方式(启动时 `loadEnvFile` 载入,不覆盖已有环境变量)
- 密钥绝不写入:源码、日志、任何发往前端的响应;错误提示只给原因不给 key
- 未配置密钥 → `not-configured` 可读提示(功能不可用但不崩溃、不静默)
- 失败分类:not-configured / timeout / network / api(错误码中文提示表沿用 v0,401 提示指向 `QINIU_API_KEY`)
- Agent 无密钥:进流前 HTTP 503 JSON。翻译无密钥:流内 `error` 事件(翻译页已按此处理)

## 3. 边界

- 调用封装在 `packages/cli/src/llm/`(外部调用属于 cli,core 禁止网络访问——project-structure §2)
- 三个出口:`streamText`(翻译)、`generateText`+`Output.object`(分析)、`ToolLoopAgent`(Agent)
- 测试用 LanguageModel 替身隔离,不触达真实网络;密钥不出现在测试断言文本里
- web 只通过 `/api` 消费,可依赖 `@ai-sdk/react` 与 `ai` 的 UI 类型,**不得** import `@ai-sdk/openai-compatible` 或 cli 的 provider
