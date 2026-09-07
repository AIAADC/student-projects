# 真机只读全量扫描报告(2026-08-16)

> 目的:把本机真实的 skill 分布测出来落档,作为产品论证(按内容哈希去重,不按文件名)与后续回归的基线。
> 全程**只读**:仅调用 discoverClientRoots / readdir / readSkillMeta / hashSkillFolder,未对任何客户端目录执行写入。

## 结论速览

| 指标 | 数值 | 说明 |
| --- | --- | --- |
| 客户端 skills root 数 | **27** | 23 个直接目录 + 3 个嵌套约定(cursor/gemini/windsurf)+ 1 个 XDG(.config/opencode) |
| 副本总数(按目录) | **581** | 每个 root 下每个 skill 目录计 1 份 |
| 按内容哈希去重后的唯一 skill | **213** | 这才是库存的真实规模;目录名统计(约 190)会漏掉同名不同内容的变体 |
| 未达收录最低要求 | **10** | 缺 name 或 description,见下文清单 |
| 去重后副本保留率 | 27.3% | 581 → 213,即约 3.7 份重复副本可以收敛为 1 份 |
| 重复度最高 | 26 份 × 2 个内容变体(demo-init) | 详见分布 |
| 扫描时间 | 2026-08-16T09:50Z(本地 17:50) | 只读聚合脚本,结果落档于此 |

> 与粗测基线(26 roots / 579 副本 / 190 名字)的差异:root 数从 26 → 27 是因为本批发现逻辑补齐了 .config/opencode(XDG)与嵌套约定;副本数 579 → 581 为新发现 root 中的增量;唯一数 213 > 190 是因为同名目录可能内容不同(变体),按名字统计会合并它们。

## 按内容哈希去重后的重复度分布

| 副本份数 | 唯一 skill 数 | 累计副本 |
| --- | --- | --- |
| 1(唯一副本) | 183 | 183 |
| 2 | 5 | 10 |
| 3 | 1 | 3 |
| 4 | 2 | 8 |
| 6 | 2 | 12 |
| 10 | 2 | 20 |
| 14 | 1 | 14 |
| 17 | 12 | 204 |
| 25 | 3 | 75 |
| 26 | 2 | 52 |
| **合计** | **213** | **581** |

解读:183/213 = 86% 的 skill 在本机只有一份副本;多副本集中在少数「全量安装」型 skill(HyperFrames 全家桶 17 份、demo-init 26 份),这与用户手动把同一套 skill 复制进每个客户端的习惯吻合。

## 重复份数最高的 skill(前 12)

| 份数 | 名称 | 覆盖客户端 |
| --- | --- | --- |
| 26 | demo-init(内容变体 A) | 0-1-cli, agents, claude, cline, codebuddy, codex, continue, copilot, cursor, devin, gemini, grok, hub, kiro, openclaw, qoder, qoder-cn, qoderworkcn, quickwork, trae, trae-cn, windsurf, workbuddy |
| 26 | demo-init(内容变体 B,含备份目录变体) | 同上 |
| 25 | concept-keeper | 除 agents 外的 25 个 |
| 25 | creating-formal-reports-from-software-products | 除一个客户端外的 25 个 |
| 25 | distributing-skills-across-local-agents | 同上 |
| 17 | faceless-explainer | agents, claude, codebuddy, codex, continue, copilot, cursor, gemini, kiro, openclaw, opencode, qoder, qoder-cn, trae, trae-cn, windsurf |
| 17 | general-video / hyperframes / hyperframes-animation / hyperframes-audio / hyperframes-cli / hyperframes-core(共 7 个,全同分布) | 同上 |

> demo-init 存在**两个内容变体各 26 份**——目录名相同但内容哈希不同,佐证「按文件名去重」会错误合并变体,必须按内容哈希。变体 B 对应 issue 背景中提到的备份目录 .demo-init.backup-20260814T203633 被一并复制的情况。

## 未达收录最低要求的目录(缺 name 或 description)

按收录规则(SKILL.md 需含非空 name 与 description),以下 10 个目录不入库:

| 路径 | 疑似原因 |
| --- | --- |
| .agents/skills/skill-build-quarantine | 隔离/半成品 |
| .codex/skills/.system | 系统目录,点开头 |
| .codex/skills/codex-primary-runtime | 运行时目录,非 skill |
| .qoderworkcn/skills/.temp | 临时目录 |
| .quickwork/skills/app_building | description 近乎为空(issue 提到的已知案例) |
| .quickwork/skills/canvas | description 近乎为空 |
| .quickwork/skills/docx-design-extractor | description 近乎为空 |
| .quickwork/skills/html-design-extractor | description 近乎为空 |
| .trae-cn/skills/composition-patterns | 缺字段 |
| .trae-cn/skills/react-native-skills | 缺字段 |

## 只读声明

- 本报告数据来自一次只读聚合扫描:discoverClientRoots → readdir → readSkillMeta → hashSkillFolder,均为只读 API
- 未创建、修改、移动、删除任何客户端目录下的文件;未写入任何配置
- 未读取任何密钥/凭据文件;报告中不含任何凭据内容
- 复现方法:node packages/cli/dist/index.js scan(人读)或 core 的 discoverClientRoots + hashSkillFolder(程序读,即本报告脚本)

## 对本产品的影响

1. **库存真实规模 = 213**(哈希去重后),目录数统计无意义——产品一切去重/冲突判定必须以内容哈希为准(已落地 #15)
2. **demo-init 双变体 × 26** 是「同一 skill 多版本并存」的实证:按名字冲突会误伤合法变体,冲突时应展示内容差异而非静默覆盖(#21 原子切换的依据)
3. **10 个未达标目录**说明收录必须有「进报告不静默跳过」的语义(#15 已实现 invalid 通道),且 doctor 应能提示这类目录(#16 已实现 root 清单)
4. 下一次全量扫描(如 SDK 变化后)与此报告对比即可回归验证发现逻辑
