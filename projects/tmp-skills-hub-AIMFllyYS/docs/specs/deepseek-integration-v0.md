# DeepSeek 集成(v0)——调用封装与密钥管理

> 状态:已废止 —— 被 [ai-integration-v1.md](ai-integration-v1.md) 取代(供应商切换为七牛云)。正文保留作历史记录。

> 状态:已实现(#42)。依据 DeepSeek 官方文档(2026-08 查证),来源:
> - Chat Completions API: https://api-docs.deepseek.com/api/create-chat-completion/
> - 快速开始(curl 示例): https://api-docs.deepseek.com/
> - 错误码: https://api-docs.deepseek.com/quick_start/error_codes
> - 限流: https://api-docs.deepseek.com/quick_start/rate_limit

## 1. 事实清单(来自官方文档)

| 项 | 值 |
| --- | --- |
| 端点 | `POST https://api.deepseek.com/chat/completions`(OpenAI 兼容格式) |
| 认证 | `Authorization: Bearer <DEEPSEEK_API_KEY>` |
| 模型 | `deepseek-v4-flash`(默认,经 `DEEPSEEK_MODEL` 可换,`deepseek-v4-pro` 更强) |
| 请求体 | `{ model, messages:[{role,content}], stream:false }` |
| 响应 | `choices[0].message.content`(非流式) |
| 超时 | 客户端自控(封装默认 30s AbortController,不无限挂起) |
| 错误码 | 400 格式 / 401 认证 / 402 余额 / 422 参数 / 429 限流 / 500 服务端 / 503 过载 |

## 2. 密钥铁律

- 密钥只从环境变量读取(`DEEPSEEK_API_KEY`),`.env` 仅作为把变量放进进程环境的方式(启动时 `loadEnvFile` 载入,不覆盖已有环境变量)
- 密钥绝不写入:源码、日志、任何发往前端的响应;错误提示只给原因不给 key
- 未配置密钥 → `not-configured` 可读提示(功能不可用但不崩溃、不静默)
- 失败分类:not-configured / timeout / network / api(带官方错误码的中文提示)

## 3. 边界

- 调用封装在 `packages/cli`(外部调用属于 cli,core 禁止网络访问——project-structure §2)
- 测试用 fetch 替身隔离,不触达真实网络;密钥不出现在测试断言文本里
