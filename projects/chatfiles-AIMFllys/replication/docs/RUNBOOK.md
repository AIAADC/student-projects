# ChatFiles 当前运行手册

> 文档状态：补充说明；现行架构、字段、能力和激活规则以 [01_architecture.md](spec/01_architecture.md) 为唯一 prose 权威。

本手册只给出安全顺序，不包含账号、路径、密钥、真实计数或可覆盖原始数据的命令。

## 1. 工程验证

```powershell
npm install
npm test
npm run typecheck
npm run typecheck:server
npm run typecheck:e2e
npm run lint
npm run check:guardrails
npm run build
npm run test:e2e
```

任一步失败都停止，不创建阶段提交，不激活数据。

## 2. 检查当前数据目录

```powershell
npm run data:doctor
```

- `ready`：catalog 与依赖产品均通过。
- `missing`：没有活动 catalog，不等同于真实空数据。
- `degraded/invalid`：产品或依赖不完整，相关 feature fail closed。
- `recovery_required`：先执行 `npm run data -- recover`，不能再次盲目 activate。
- `legacy_layout_split_brain`：必须显式迁移，禁止选择最大数据库或静默读取旧角色。

## 3. 生成候选

1. 在只读源或副本上生成 source manifest。
2. 动态发现 regular、biz、media、resource shard。
3. 构建 wechat 候选并运行 source/chat/identity/order/time-zone 审计。
4. 构建 assets 候选并运行 association/quarantine/materialization 审计。
5. 构建 library 与 insights，验证依赖 run/fingerprint。
6. 逐个 stage、seal，并生成同一事务的 `catalog.next.json`。

所有命令必须使用本机配置的占位参数；不要把真实 account root、路径或 key 写进文档与 Git。

## 4. Legacy 迁移

只有 `data:doctor` 明确报告 legacy layout，且操作者已确认精确 account root 时，才可运行显式迁移：

```powershell
npm run data -- migrate --from-legacy-layout --transaction <事务ID> --account-root <账号根>
```

迁移读取旧角色并写不可变候选与 receipt，不得删除或改写旧数据。迁移完成后重新运行 doctor 和全部领域审计。

## 5. 激活与恢复

激活前停止使用旧 bundle 的服务。事务使用 lock、parent hash 和 compare-and-swap 防止并发覆盖：

```powershell
npm run data -- activate --transaction <事务ID>
```

激活会先保存已验证 current 为 previous，再原子替换 current。中断后运行：

```powershell
npm run data -- recover
```

需要回滚时显式使用同一事务规则；不要手动改 catalog JSON。

## 6. 启动与验证

```powershell
npm start
```

验证 `/api/v1/status`、`/api/v1/overview`、`/api/v1/insights`、聊天每日时间轴和统一文件 preview。ready 语音、图片或视频必须实际验证内容；missing、CDN-only、thumbnail-only 和 unsupported codec 必须保持真实状态。

## 7. 清理

```powershell
npm run data:prune
```

该命令只产生生成物 dry-run 计划。不得删除 current、最后可用 previous、原始源或 archive；执行任何实际清理前必须另行人工确认。
