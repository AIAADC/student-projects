# ChatFiles 实施提示词

> 文档状态：补充说明；现行架构、字段、能力和激活规则以 [01_architecture.md](spec/01_architecture.md) 为唯一 prose 权威。

可将下面内容交给实现 Agent：

```text
请在现有 ChatFiles 仓库中工作。先完整阅读：
1. 根 AGENTS.md；
2. replication/AGENTS.md；
3. replication/docs/spec/01_architecture.md。

其他 replication 文档只用于背景，不得覆盖 01 或可执行 Zod/SQL 契约。

强制边界：
- 保留 React 19 + Vite 8 + Express 5；
- 原始微信、QQ 和附件绝对只读；
- 中文、emoji、路径保持 UTF-8；
- 私人数据库、媒体、key、路径和审计正文不进入 Git；
- 人物未知时保持未知，不在浏览器猜测；
- 时间保留源秒精度，按 bundle IANA 时区归日；
- 所有消息消费者按 canonical_seq；
- 未确认资源进入 quarantine，未验证文件不标 ready；
- Agent 通过有界 Operation 取证，不读取整段会话全文；
- current 无效时 fail closed，不静默回退 legacy；
- 每阶段完整验证后只做一次本地 commit，不自动 push 或开 PR。

先运行只读检查和现有测试，再按 application/domain/infrastructure 边界实现。若真实数据仍是 legacy_layout_split_brain，只报告并给出显式迁移命令，不猜 account root、不激活。
```

推荐让 Agent 最后回答：代码验证结果、数据 doctor 状态、未执行的真实数据动作、分支与本地 commit；不得回显私人路径或计数。
