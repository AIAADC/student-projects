# 工程约定补充说明

> 文档状态：补充说明；架构、字段、能力和激活规则以 [01_architecture.md](01_architecture.md) 为唯一权威。

- 文本统一 UTF-8；禁止损坏中文、emoji、路径或引入 U+FFFD。
- 原始聊天和附件只读；只清理 ChatFiles 自己的 staging/生成物。
- `shared/contracts/index.ts` 是公共 DTO/schema 入口；浏览器领域类型通过 `src/types/index.ts` 统一转发，不保留第二个根级 barrel。
- 新源码不超过 300 行；历史超限文件只能缩小。
- API URL 由 `src/shared/api/endpoints.ts` 生成，JSON 由共享 client + Zod 校验。
- 时间使用 bundle IANA 时区和源秒；消息顺序使用 conversation-scoped `canonical_seq`。
- route、CLI、MCP、Agent 不得各自复制 operation schema。
- 每阶段完整验证后只创建一次本地 commit；不自动 push 或创建 PR。
