# 洞察管线补充说明

> 文档状态：补充说明；现行架构、字段、能力和激活规则以 [01_architecture.md](01_architecture.md) 为唯一 prose 权威。

洞察是 Canonical Event Store 的可重建派生产品，不是人物、顺序或原文的第二权威。

## 输入与高水位

- 只读取已激活或明确指定的候选 wechat bundle。
- 按 `canonical_seq` 生成增量窗口和引用，不以时间 hash 或数组下标作为水位。
- 每条事实保留稳定消息 UID/sequence；越界或不存在的引用使审计失败。
- bundle 时区用于归日，展示时间保留秒和偏移。

## 生成边界

- 摘要、nugget 和主题板只写 insights staging。
- 模型失败、空输出、非法结构或越界引用不得覆盖最后可用产品。
- 提示词和输出 schema 必须版本化；AI 结果不能改变 canonical 人物或资产关联。
- 私人正文、模型 key、绝对路径和原始审计正文不进入 Git。

## 发布与读取

insights manifest 绑定 wechat run、bundle fingerprint、schema、计数和 receipt。依赖不匹配时状态为 `dependency_mismatch`，前端显示 unavailable/stale，而不是空洞察。

HTTP 页面数据使用 `/api/v1/insights`。Agent 如需证据，通过 Operation Catalog 的有界搜索和上下文操作读取 canonical 消息，不绕过 application service。

当前命令入口：

```powershell
npm run insights:prepare
npm run insights:distill
npm run insights:boards
npm run audit:insights
```

正式激活仍由 catalog 事务完成，不能由洞察脚本自行切换 current。
