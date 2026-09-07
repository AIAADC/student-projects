# ChatFiles 架构收敛验证记录

验证日期：2026-07-13

验证分支：`codex/architecture-convergence`

本记录只描述合成夹具与公开工程结果，不包含真实聊天计数、人物标识、消息正文、媒体、数据库、密钥、绝对数据路径或本地审计正文。

## 自动化门禁

| 检查 | 结果 | 公开证据 |
|---|---|---|
| `npm test` | exit 0 | 724 tests；719 pass；0 fail；5 skip |
| `npm run typecheck` | exit 0 | client、shared、pipeline、node 与 guardrail 严格检查通过 |
| `npm run typecheck:server` | exit 0 | server 严格检查通过 |
| `npm run typecheck:e2e` | exit 0 | E2E fixture 严格检查通过 |
| `npm run lint` | exit 0 | ESLint 无错误 |
| `npm run check:guardrails` | exit 0 | 依赖方向、循环、300 行、UTF-8、隐私与文档一致性通过 |
| `npm run build` | exit 0 | Vite 生产构建通过；最大业务 chunk 320.66 kB |
| `npm run test:e2e` | exit 0 | 文件预览、导航、筛选、每日时间轴、秒级时间、同秒顺序、刷新与前进后退通过 |

5 项 skip 均因当前 Windows 主机不允许测试创建所需的文件链接；它们没有通过放宽断言或新增跳过条件产生。

## 阶段 8 结构核验

- 已删除不可达旧聊天组件、旧样式、旧消息分页/全文服务、旧文件 router、重复 type contract 和 tests-only wrapper。
- 统一文件 preview 使用 `/api/v1/files/:scope/:id/*`；ready VoiceInfo 资产可通过同一 capability policy 预览。
- Node JSON 读取只对缺失文件使用显式 fallback；损坏、权限或 schema 错误进入 unavailable，不伪装成正常空数据。
- `replication/docs/spec/01_architecture.md` 是唯一 prose 权威；补充文档不再声明退役 API、旧三表、全文注入或旧前端结构。
- 文档 guardrail 带负向 fixture，可拒绝任一 replication 补充文档重新引入退役生产声明。

## 数据激活边界

只读 doctor 返回 `missing`，活动 current/previous catalog 均缺失，并报告 `legacy_layout_split_brain`。因此本阶段没有迁移、seal、activate、rollback 或 prune 真实数据；继续处理必须显式提供准确 account root，并将数据激活与代码 commit 分离。
