# 服务端与公共 API 补充说明

> 文档状态：补充说明；架构、字段、能力和激活规则以 [01_architecture.md](01_architecture.md) 为唯一权威。

## 现行入口

| 入口 | 用途 |
|---|---|
| `/api/v1/data/*` | 页面级数据产品 |
| `/api/v1/chat/*` | 会话、timeline、每日/人物 facets、资产 |
| `/api/v1/files/:scope/:id/*` | archive/source/artifact 统一文件能力 |
| `/api/v1/operations/:name` | Operation Catalog 的 HTTP adapter |
| `/api/local/v1/*` | 本地 CLI/MCP 兼容入口 |
| `/api/ai/chat`、`/api/ai/agent` | 共享 OpenAI upstream 的流式适配器 |

`server/app.ts` 是 composition root。HTTP route 只做校验、application 调用和状态映射；文件访问、SQLite、FFmpeg 与上游请求由 infrastructure 实现。未知 `/api/*` 返回 `{ "error": "Request failed", "code": "not_found" }`，不会落入 SPA HTML。

## 文件 scope

- `archive`：只读归档副本。
- `source`：明确列入本地 source manifest 的只读文件。
- `artifact`：资产数据库中 exact + confirmed 且 capability 允许的物化文件。

URL 只接受稳定 ID，不接受绝对路径。JSON preview 使用共享 Zod schema；binary/text client 同时检查 status 与 content type。

## 退休接口

旧的会话全量列表式消息读取和整段会话注入不再属于公共 API。UI、Agent、CLI 与 MCP 分别使用 timeline cursor、search、message context 和有界 Operation，避免同秒乱序和超大内存请求。
