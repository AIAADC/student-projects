# PROMPT · 增量更新 SOP 咒语（喂给 AI 补新消息，不重复分析）

> [!CAUTION]
> **下方旧提示词已停用，不可直接投喂执行。** 请让 Agent 先读并严格执行 [`06_现行安全管线.md`](06_现行安全管线.md)；旧提示词仍引用 `data/wechat.db`、覆盖式解密和无证据 owner 合并。

> 适用场景：项目**已经部署好、装满数据**（`data/wechat.db` + `data/insights/` 已存在），想把最新消息 / 之前没解密的账号补进来，且**不重复分析**旧会话。
>
> 前提：① 微信（QQ）**正在运行且已登录**（要补某账号就先登录它）；② 环境同部署时（Node24 / Python3.14 / ffmpeg）。
>
> 用法：整段复制，替换 `{{占位符}}`，用 `/goal ` 粘贴发送。开头 `ultracode` 触发多 agent 编排。

---

## A. 一键增量更新咒语（推荐）

```text
ultracode 我的「午夜书斋 / ChatFiles」已经部署好并装了数据（项目目录 "{{项目目录}}"，data/wechat.db 与 data/insights/ 都在）。请你做一次"增量更新"：把最新的微信(QQ)消息、以及之前没解密的账号补进来，且【不要重复分析已经分析过的会话】。

【先读文档再动手】
MUST 先逐篇精读 docs/ChatFiles本地更新/README.md 与 00_总览与原理.md → 05_验收与回归.md，严格按其中的"高水位增量去重"模型执行。深技术细节回查 replication/docs/spec/（尤其 03 解密 / 06 提炼）与 docs/本地部署教程/。

【按 SOP 执行，每阶段完成就 commit】
① 前置与快照（01）：确认项目已部署、微信(QQ)在跑。在重跑解析/digest【之前】：备份 data/insights/_manifest.json → _manifest.prev.json；若 data/insights/_state.json 不存在，先跑 bootstrap 脚本（见 01 §2.2）从现有 manifest 引导出高水位基线。【这一步绝不能漏，否则会重复分析或漏新】
② 重新解密+解析（02）：取微信主进程 PID；对要更新/新补的账号重解密到 work/decrypted/（只动副本）；npx tsx scripts/parseWeChat.ts 整库重建 data/wechat.db（自动含新消息/新账号）；npx tsx scripts/archiveFiles.ts 增量归档新文件（sha256 去重）；npx tsx scripts/prepChatDigests.ts 重生成 digest + _manifest.json。【注意：这些都不动 _state.json 和 conv/*.json，旧成果保留】
③ 增量提炼（03，核心）：保存并运行 scripts/computeUpdateDelta.ts 算出 delta（新增/长大的会话）+ 生成尾部 digest。若 delta 为空就到此为止。否则 ultracode 多 agent 只对 delta 扇出：new 会话直接写 data/insights/conv/<safe>.json；grown 会话只读尾部 digest、只产出新 nugget 到 work/insights-delta/<safe>.json（schema 严格、引用用「」、只回一行状态）。json-repair 修复。再运行 scripts/mergeInsightDelta.ts 把新 nugget 追加合并进 conv/*.json（去重、旧 nugget 不动），scripts/updateInsightState.ts 推进高水位，最后重综述受影响的 boards。
④ 未解密补全（04）：之前没登录、这次登录了的账号按②补解密（会被③自动判为 new）；.dat 影像在 img-key 能力就绪时还原后增量归档，否则如实记录边界；QQ 正文仍是硬边界，禁止伪造，仅增量归档其明文附件。
⑤ 验收与回归（05）：核对会话/消息/nugget/归档数 ≥ 更新前；【回归证明】delta 之外的 conv/*.json 未被改动、旧 nugget 只增不减、_state.json 水位单调；站点免重启刷新可见新内容；隐私自检（个人数据不入 git）。

【硬约束 · 一字不差遵守】
- 只读原始、只对副本解密；禁止删除/移动/改写任何原始聊天记录与文件。
- 【不重复分析 = 不覆盖旧成果】已分析会话的 conv/*.json 只能追加/合并，禁止无脑覆盖；高水位 _state.json 只增不减。
- 只解密我自己的、本机登录账号的数据；不上传任何正文/密钥。
- 仍解不了的（QQ 正文、.dat、未登录账号）如实记录，禁止伪造。
- data/ archive/ work/ imports/ 永不入仓；身份只在 .env.local。

【本轮我想补的】
{{比如：把最近两个月的新消息补进来；外加把账号 B 登录后补解密。没有特别指定就按"全部新增"处理。}}

请先做 ①（前置+快照），把"已分析基线建好了、准备算 delta"告诉我，再继续。
```

---

## B. 分阶段提示词（想分步把控时用）

1. **前置 + 快照**：`按 docs/ChatFiles本地更新/01，确认项目已部署、微信在跑；备份 _manifest.json→_manifest.prev.json；若无 _state.json 则跑 bootstrap 从现有 manifest 引导高水位基线。先别重解密，把基线建好的情况告诉我。`
2. **重解密 + 解析**：`按 02 重解密要更新/新补的账号到 work/decrypted/，跑 parseWeChat.ts 整库重建、archiveFiles.ts 增量归档、prepChatDigests.ts 重生成 manifest。统计会话/消息/归档较上次的增量给我。`
3. **算 delta + 增量提炼**：`按 03 运行 computeUpdateDelta.ts；若有 delta 则 ultracode 只对 delta 扇出（new 全量写、grown 只产出新 nugget），json-repair 修复，再 mergeInsightDelta.ts 合并、updateInsightState.ts 推进高水位、重综述受影响的板。报告新增了多少 nugget、跳过了多少未变会话。`
4. **补全 + 验收**：`按 04 处理之前没解密的账号/.dat/QQ 边界与增量派生刷新；再按 05 做增量验收 + 回归核对（delta 之外未被重跑、旧 nugget 只增不减）+ 隐私自检。`

---

## C. 一句话原理

**整库重建解析层（天然幂等）＋ 高水位 `_state.json` 做提炼层的增量去重**：新会话全量、长大会话只读新尾巴并追加、没变的会话一个 agent 都不跑。这样既不漏新、也绝不重复分析。详见 [`00_总览与原理.md`](00_总览与原理.md)。
