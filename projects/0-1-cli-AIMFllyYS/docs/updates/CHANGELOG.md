# 更新日志

所有版本更新记录，遵循 [版本号规范](../standards/versioning.md)。

---

## v0.6.15 (2026-06-14)

**ci(desktop): GitHub Release 工作流与桌面安装包验证**

- 新增 Windows/macOS 双平台 desktop release workflow
- GitHub Release 事件自动附加 `.exe`、`.dmg`、`.zip` 与更新元数据
- `workflow_dispatch` 仍上传 Actions artifact，便于手动下载验证
- Desktop 设置面板读取 latest release 资产并通过 allowlist 安全打开下载链接
- 打包前复制 CLI runtime 并安装生产依赖，确保 Electron 安装包内置可运行 CLI

**chore(ai): Claude Code Parity V2 审计与发布就绪**

- 完成 Round 0–18 全量验证：`npm run build`、全量测试、`npm run desktop:build` 均通过
- forbidden-port 扫描确认 runtime 无 telemetry/login/billing/entitlement 残留
- 确认 desktop release workflow 支持 Windows/macOS 双平台 artifact 与 GitHub Release 附加
- 本地 `hi` 命令解析到 `C:\Users\AIMFl\AppData\Roaming\npm\hi`（全局 npm link）

## v0.6.3 (2026-04-27)

**fix: 修复 AI Chat 多个核心 Bug**

- 修复回答重复显示两次（onDone 被调用两次）
- 修复选择模型后菜单残留在屏幕上
- 修复 AI 输出 XML 工具调用格式而非正常回答
- 修复搜索返回空结果（search-prime → search-std）
- 移除 search.ts 中硬编码的旧 API Key
- 修复 env 变量在模块加载时为空（改为运行时读取）

## v0.6.2 (2026-04-27)

**fix: 修复任意目录运行时 .env 加载失败**

- `dotenv.config()` 改为从项目根目录加载 `.env`，不再依赖 cwd
- 移除 provider.ts 和 modules/chat.ts 中重复的 dotenv 调用

## v0.6.1 (2026-04-27)

**fix: 修复 AI Chat 多个问题**

- 修复模型选择器重复渲染菜单
- 修复选择模型后退出对话（stdin 被意外关闭）
- 更新 DeepSeek 模型 ID 为 V4（`deepseek-v4-flash`、`deepseek-v4-pro`）
- 移除硬编码的 API Key，统一从 `.env` 读取
- 401 错误提示优化，明确提示检查 API Key

## v0.6.0 (2026-04-27)

**feat(chat): 重构 AI 对话模块**

- 新增斜杠命令系统（`/model`、`/help` 等）
- 支持运行时模型切换
- 新增 Markdown 渲染输出
- 对话模块整体重构

## v0.5.0 (2026-04-27)

**refactor: 提取共享配置工具 + 更新 README**

- 抽取 `utils/config.ts` 共享配置模块
- 更新双语 README 文档

## v0.4.0 (2026-04-27)

**refactor: 重组项目结构**

- 重新组织 `src/modules/` 目录结构
- 模块分类更清晰

## v0.3.1 (2026-04-27)

**chore: 修复 .gitignore 排除 dist 目录**

- 修正 `.gitignore` 规则，完整排除 `dist/` 目录

## v0.3.0 (2026-04-27)

**feat: 可配置项目根目录 + 动态 GitHub 仓库获取**

- 支持自定义项目扫描根目录
- GitHub 仓库信息动态获取

## v0.2.0 (2026-04-27)

**refactor: 模块化架构 + 交互式 GitHub 账户切换**

- 全新模块化架构设计
- 新增交互式 GitHub 账户切换功能（`--gh-switch`）

## v0.1.2 (2026-04-27)

**docs: 添加专业双语 README**

- 新增中英双语 README

## v0.1.1 (2026-04-27)

**chore: 添加 package-lock.json 到 gitignore**

- 将 `package-lock.json` 加入 `.gitignore`

**feat: 添加 Windows 开机自启动脚本**

- 新增 `create_shortcut.ps1` 快捷方式创建脚本

## v0.1.0 (2026-04-27)

**feat: 核心模块初始化**

- 新增 GitHub 集成模块（认证、Issues）
- 新增项目路径扫描模块
- 新增 AI CLI 命令参考模块
- 新增应用启动命令模块

## v0.0.1 (2026-04-27)

**docs: 项目初始化**

- 初始项目搭建
