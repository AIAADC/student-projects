# 0-1 CLI · AI 编程入门工具箱

> 把 Claude Code、Codex、Kimi、Kiro、AI IDE、skills、API 平台、支付/虚拟卡、代理环境这些零散步骤收进一个 `hi` 命令，帮助你从 0 到 1 搭好本地 AI 编程环境。

这个项目的重点不是炫技，而是让第一次接触 CLI 的人也能知道下一步该做什么。当前版本 v0.7.0。

## 🔗 相关链接

| 入口 | 地址 | 说明 |
| --- | --- | --- |
| 📦 开源仓库 | https://github.com/AIMFllyYS/0-1-CLI | 完整源码、Releases、Issues |
| 📁 本目录 | `projects/0-1-cli-AIMFllyYS/` | AIAADC 学生项目展示副本（源码） |

## ✨ 主要功能

| 命令 | 作用 |
| --- | --- |
| `hi` | 默认打开新手讲解模式，从 Claude Code、CLI、代理和 skills 开始入门 |
| `hi --state` | 状态页：GitHub、项目路径、CLI 指令和常用 App |
| `hi --install` | 安装菜单：AI CLI、AI IDE 和魔法环境工具 |
| `hi --skills` | skills 市场：安装 Superpowers 或 agent-onboarding-skill |
| `hi --api` | 选择 GLM、Kimi、DeepSeek、OpenAI、Claude 等 API 平台并跳转 |
| `hi --pay` | 查看 Supay、代充平台和 API 中转平台入口 |
| `hi --ai` / `hi --chat` | 内置 AI 对话模式（支持 `/chat`、`/agent`、`/plan` 模式） |
| `hi --clear` | 清理后台进程或 C 盘空间，执行前会让你确认 |

**v0.7.0 亮点（Claude Code 级别 UX 升级）**：

- 全面 Markdown 终端渲染：表格、代码块、嵌套列表、引用块，中日韩字符宽度自动适配；
- `--ai` 模式深度对标 Claude Code：增长星号动画、品牌橙 + 蓝紫辅色、历史回溯修复、`tool_call` 工具配对修复；
- 桌面端 Claude Code 1:1 复刻：命令面板、实时 Agent 编排时间轴、文件变更差异卡片、真实流式 Markdown。

## 🛠️ 技术栈

- **Node.js CLI**（TypeScript，`marked` + `string-width` 终端渲染）
- **Electron 桌面端**（`desktop/`，vite + electron-builder）
- **安装脚本**：Windows PowerShell（`irm \| iex`）/ macOS / Linux（`curl \| bash`）

## 🚀 如何安装 / 运行

一键安装最新版（Windows PowerShell）：

```powershell
irm https://raw.githubusercontent.com/AIMFllyYS/0-1-CLI/master/scripts/install.ps1 | iex
```

macOS / Linux：

```bash
curl -fsSL https://raw.githubusercontent.com/AIMFllyYS/0-1-CLI/master/scripts/install.sh | bash
```

本地开发：

```bash
git clone https://github.com/AIMFllyYS/0-1-CLI.git
cd 0-1-CLI
npm install && npm run build && npm link
hi --help
```

新人推荐路线：先 `hi` 看讲解 → `hi --install cc` 装 Claude Code → `hi --install cc-switch` 接入其他 API → `hi --install proxy` / `clash-verge` 配置代理 → `hi --skills` 装 onboarding skill 练手 → `hi --api` / `hi --pay` 找平台与支付入口。

## 👤 作者

- **AIMFllyYS**（YuSheng），华中科技大学学生开发者
- GitHub：https://github.com/AIMFllyYS

## 🤝 欢迎共建

- 提 Issue：反馈安装/使用问题、建议新命令或平台入口；
- Fork + Pull Request：改进渲染、新增安装目标、完善文档；
- 帮新人测试并补充常见问题。

## 📄 License

MIT License（详见本目录 [LICENSE](LICENSE)）。
