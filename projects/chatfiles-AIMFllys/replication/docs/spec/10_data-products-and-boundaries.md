# 数据产品与能力边界补充说明

> 文档状态：补充说明；现行架构、字段、能力和激活规则以 [01_architecture.md](01_architecture.md) 为唯一 prose 权威。

## 产品角色

| kind | 主要内容 | 关键依赖 |
|---|---|---|
| `wechat` | canonical people/conversations/messages/source inventory | 源快照 |
| `assets` | 资产证据、关联、quarantine、物化 | `wechat` 精确指纹 |
| `library` | 用户文件库 manifest 与副本 | 文件源 manifest |
| `insights` | 摘要、nugget、主题板与引用 | `wechat` 精确指纹 |

每个 sealed product 带 domain schema version、run ID、bundle SHA-256、文件清单、依赖 run/fingerprint、计数和 receipt。路径不进入公开状态 DTO。

## Catalog

`catalog.current.json` 是唯一活动指针；`catalog.previous.json` 是最后可回滚版本。旧的散落 current 角色只能通过显式 legacy migration 导入，不能在 current 无效时静默回退。

公开状态分为 ready、degraded、stale、missing、invalid、dependency_mismatch；事务还可能处于 recovery_required。真实空数据必须是已验证产品中的零计数，不能用 missing/invalid 伪装。

## 媒体边界

- V2 `.dat` 需要短生命周期 AES key；key 不默认持久化。
- wxgf/HEVC 需要严格 framing 和可用 FFmpeg。
- VoiceInfo 只有 unique 对齐和受支持 codec 才能 ready。
- 只有缩略图时为 `thumbnail_only`。
- CDN-only 不越权下载。
- 本机未缓存的资源构成本地恢复上限，不承诺 100% 补齐。

## 运维边界

- `npm run data:doctor`：只读检查 catalog、产品和事务。
- `npm run data -- recover`：恢复被中断且证据一致的事务。
- `npm run data:prune`：只输出生成物 dry-run 计划。
- migrate、stage、seal、activate、rollback 都必须显式指定事务参数。

任何真实数据激活与代码 commit 分离；原始数据、私人媒体、key 和本地 receipt 不进入 Git。
