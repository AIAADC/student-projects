# AI 助手补充说明

> 文档状态：补充说明；架构、字段、能力和激活规则以 [01_architecture.md](01_architecture.md) 为唯一权威。

AI 助手不读取整段会话全文。它通过 `operationCatalog` 中的只读工具逐步获取证据：

- `list_conversations`
- `search_messages`
- `get_message_context`
- `search_artifacts`
- `read_document`
- `get_timeline_slice`
- `get_link_preview`

每个工具声明 Zod input/output、依赖能力与上限。Agent、HTTP、CLI 和 MCP 调用同一领域 executor，引用格式绑定消息 UID 或资产 ID。

浏览器配置只保存用户主动提供的上游地址、模型和 key；服务端不写盘、不打印 key。`/api/ai/chat` 与 `/api/ai/agent` 共用一个 upstream，body 有独立上限。上下文预算按完整 Unicode 消息裁剪，不切断中文或 emoji；资产不可用时，纯聊天搜索仍可工作。

AI 结果是辅助解释，不改变 canonical 人物、顺序、资产关联或数据产品 receipt。
