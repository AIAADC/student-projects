# ChatFiles 进化升级验证记录

验证日期：2026-07-13（Asia/Shanghai）

验证分支：`codex/chatfiles-evolution`

已验证实现基线：`b20e5f6`（本地只读接入）、`b403574`（多步证据智能体）

本记录只描述合成夹具和公开工程结果，不包含真实会话数量、联系人、文件路径、消息正文、稳定私人 ID、数据库内容或密钥。

## 自动化矩阵

| 检查 | 结果 | 证据 |
|---|---|---|
| `npm test` | exit 0 | 374 tests；372 pass；0 fail；2 skip |
| `npm run typecheck:server` | exit 0 | 服务端严格 TypeScript 检查通过 |
| `npm run lint` | exit 0 | ESLint 无错误 |
| `npm run build` | exit 0 | TypeScript 与 Vite 生产构建通过 |
| `npm run test:e2e` | exit 0 | Playwright 桌面、移动、主题、时间轴、链接、AI 流程通过 |
| `git diff --check` | exit 0 | 无空白错误 |
| 隐私跟踪检查 | exit 0 | `data/archive/work/imports/.env.local/image_key.json` 输出为空 |
| UTF‑8 严格解码 | exit 0 | 本轮新增/修改文本均可用 replacement fallback 关闭的 UTF‑8 解码器读取 |
| 源文件行数 | exit 0 | 所有跟踪的 `.ts/.tsx/.css` 均不超过 300 行 |
| 视觉残留检查 | exit 0 | 非测试运行时代码无 Vite 图标及 linear/radial gradient |

两项 skip 都是需要特定 Windows 原生 SQLCipher/WAL 环境的集成测试；本轮没有改变其实现或跳过条件。构建保留 Vite 的单个大 chunk（超过 500 kB）提示，这是信息性性能建议，不影响构建退出码；本轮新增时间轴、链接和 AI 请求均为按需/有界加载。

## 浏览器与视觉核验

E2E 使用完全合成的中文/emoji 夹具，监听 `console.error` 与 `pageerror`，最终数组为空。覆盖：

- 新书本/月牙品牌、标准 favicon、单按钮 system → light → dark 主题循环；
- 桌面资料库收起、刷新后保持、重新展开；工作区标题计数只有两层；
- 桌面深色、桌面浅色、窄屏深色、`prefers-reduced-motion: reduce`；
- 长时间轴首次只取一页，滚到顶部增量加载，DOM 始终低于五页上限；
- 发言人搜索、选择、仅看状态、清除筛选与日期锚点请求；
- 链接元数据成功卡及无法解析时的标准图标/域名降级卡；
- AI 假上游连续执行消息搜索与上下文核对两种工具，显示进度、实际策略和证据数量；
- 消息引用切换时间轴并高亮，文件引用打开现有只读预览；
- 桌面/移动均无横向溢出，键盘 Escape/焦点恢复正常。

目检了未入库的 `desktop-dark.png`、`desktop-light.png`、`mobile-dark.png` 与 `agent-dock-dark.png`：未发现遮挡、截断、廉价果冻渐变、Vite 图标、不可读对比或时间轴右轨覆盖正文。截图位于外部验证工作区，不在 Git 暂存范围。

## AI、检索与摘要不变量

- 工具循环最多 8 步、每步最多 6 个调用；重复调用抑制、非法 schema 拒绝、90 秒中止传播均有测试。
- 最终回答只认可工具实际返回的 `[消息:uid]` / `[文件:id]`；未引用但存在证据时自动附加来源。
- 搜索索引是可重建派生数据； staging 失败不替换 current，Embedding Key 不写入索引。
- FTS/中文 n-gram、精确匹配和 literal `%/_/\` 兜底始终可用；向量不可用会明确降级。
- 最近窗口严格把原始上下文限制在模型窗口 70%，按完整消息裁剪并预留至少 30%。
- 结构化摘要保存事实、人物、日期、直接引语、决定、分歧、未决项及来源 turn UID/hash；空摘要、过期摘要、越界来源或模型失败均回退最近窗口。
- AI 历史和小型摘要只存浏览器；清除 AI 上下文不触碰聊天数据库、文档或检索索引。

## 本地 HTTP、CLI 与 MCP

定向测试覆盖 14 个共享接入场景，随后包含于完整测试矩阵：

- HTTP 六类只读操作、未知参数拒绝、列表/上下文/文档限额、UTF‑8 JSON；
- 可选 `CHATFILES_LOCAL_TOKEN` 的 Bearer 校验，失败响应不回显令牌或内部异常；
- CLI 的全部命令路由、JSON 中文输出，以及成功/服务错误/输入错误退出码；
- MCP SDK `1.29.0` + Zod `4.4.3`，六个 `chatfiles_*` 工具均使用严格 schema、结构化输出和完整只读 annotations；
- 真实 stdio 子进程完成 initialize → tools/list → tools/call，中文往返成功，stderr/stdout 无日志污染；
- HTTP、CLI、MCP 共用现有会话搜索、混合检索、文件查询、文档解析和消息上下文服务，公开结果不含路径或密钥。

安全使用示例与占位符配置见 `docs/local-access.md`。
