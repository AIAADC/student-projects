# ChatFiles 总览

> 文档状态：补充说明；现行架构、字段、能力和激活规则以 [01_architecture.md](01_architecture.md) 为唯一 prose 权威。

ChatFiles 是本地运行的 React 19 + Vite 8 + Express 5 资料库。它只处理用户明确授权的数据，以只读方式盘点源快照，将消息规范化为 Canonical Event Store，再派生资产、媒体、搜索、洞察与文件库。

## 核心承诺

- 原始微信、QQ 和附件不删除、不移动、不改写。
- 人物未知时保持未知并记录原因，不根据昵称或前端配置猜测。
- 消息时间保留源秒精度；日期边界使用 bundle 声明的 IANA 时区。
- 同秒顺序由源排序证据和 `canonical_seq` 决定，不用 hash 重排。
- 未确认资源进入 quarantine；未成功物化的媒体不标记为 ready。
- CDN-only 只说明存在远端引用，不承诺下载或补齐本地未缓存内容。
- 私人数据库、媒体、key、路径和审计正文不进入 Git。

## 现行数据流

```text
只读源快照清单
  → Canonical Event Store
  → assets / library / insights / derived search
  → application services
  → HTTP / CLI / MCP / Agent / Vite UI
```

每个数据产品都携带 schema version、run ID、源 manifest/hash、依赖指纹、计数和审计 receipt。`catalog.current.json` 是唯一活动目录；无效 current 必须 fail closed。

## 产品入口

- `/`：概览。
- `/chat/:conversationId`：按 `canonical_seq` 展示聊天、每日右轨和秒级时间。
- `/files`、`/insights`、`/academics`、`/media`、`/knowledge`：按路由懒加载的领域页面。
- `/settings/*`：总结、线索、整理、数据库、候选和 AI 配置。

AI 不接收整段会话全文。它通过有界的搜索、消息上下文、timeline slice、资产和文档 Operation 逐步取证，并用稳定消息 UID 或资产 ID 引用来源。

## 阅读顺序

1. [01_architecture.md](01_architecture.md)：唯一 prose 权威与完整能力矩阵。
2. [02_data-sources.md](02_data-sources.md) 至 [06_insights.md](06_insights.md)：数据源和离线管线背景。
3. [07_server-api.md](07_server-api.md) 至 [11_conventions.md](11_conventions.md)：适配器、UI、AI 与工程约定补充。
4. [../RUNBOOK.md](../RUNBOOK.md)：只执行当前 catalog 流程的操作顺序。

任何补充文档与 01 或可执行 Zod/SQL 契约冲突时，必须停止发布并修正文档或实现，不能静默选择其中一套。
