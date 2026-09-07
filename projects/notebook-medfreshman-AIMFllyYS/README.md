# 期末复习工作站 · Notebook-MedFreshman

> 由课堂录音逐字稿驱动的多学科深度学习助手：可伸缩导航 + 详尽原创笔记（完美公式渲染）+ 右侧三板块（AI 对话 / Manim 动画 / 可交互内容）+ 划词问 AI。

**说明**：本项目内容庞大（完整仓库约 1.3 GB，含大量内容、媒体与构建资产），按作者要求本目录**仅以本文档介绍项目，不上传源码**；完整源码、安装包与开发记录见下方开源仓库。

## 🔗 相关链接

| 入口 | 地址 | 说明 |
| --- | --- | --- |
| 🌐 线上预览（在线使用） | https://notebook2a.husteread.icu | 可直接访问使用的线上站点 |
| 📦 开源仓库 | https://github.com/AIMFllyYS/Notebook-MedFreshman | 完整源码、Releases（Electron 桌面端）、Issues |
| 📁 本目录 | `projects/notebook-medfreshman-AIMFllyYS/` | 项目文档（无源码） |

## ▶️ 交互式演示

- 📺 [打开交互式演示（单文件 HTML）](assets/demo.html)：下载后直接用浏览器打开即可播放，无需任何依赖；演示覆盖「打开笔记 → AI 对话 → Manim 动画 → 交互练习 → 进度保存」完整旅程（约 28 秒，可拖动时间轴、切换章节、手动探索）。
- 演示为原创模拟界面（无真实数据），仅用于快速了解项目形态；真实功能以线上预览为准。

## 👋 项目简介

为期末考试复习打造的多学科辅助学习应用。它把课堂录音逐字稿整理成结构化的详尽原创笔记，配合 AI 对话、Manim 数学动画和可交互组件，帮助理解概念与刷题；笔记、动画、交互、划词问答构成一体化的学习体验，并支持安装为 PWA / Electron 桌面应用。

## ✨ 主要功能

- **多学科支持**（可扩展架构，轻松接入新学科）：
  - 概率论与数理统计：完整章节详解、动画、交互组件、考研录音题库与实战模拟卷；
  - 大学物理：第一章详解、例题、题库、考前模拟真题与 27 套录音例题；
  - 有机化学：分子结构、反应机理深度解析；
  - 中国近现代史纲要：教材内容、6 套考前模拟卷与教材题库；
  - 毛泽东思想和中国特色社会主义理论体系概论：2023 版教材拆章、教材题库、录音题库与押题卷；
  - 大学英语（CET-4）：Unit 1–8 全套，含原文精读、例题精讲与随堂测验。
- **详尽原创笔记**：基于课堂录音的深度解析 + KaTeX 完美数学公式渲染。
- **AI 对话助手**：划词提问、图片附件、联网搜索、Agent 执行时间轴、多 Provider 适配（OpenAI 兼容 / Anthropic）、思考档位全局与逐会话调节。
- **AI 图片能力**：Unsplash 图片搜索、AI 图片生成（独立查看器、会话持久化、画廊汇总）。
- **Token 与计费看板**：每个浮窗独立显示 Token 用量，汇总图片生成费用（3D 翻卡片摘要 + 趋势图表）。
- **Manim 动画讲解**：Python 驱动的数学动画；**可交互组件**：参数调节 + 实时反馈；三板块无缝切换。
- **答题会话持久化**：测验进度写入 IndexedDB，退出后自动恢复现场；小窗画中画跨页续播。
- **PWA 可安装**：桌面固定任务栏 / 手机添加到主屏幕，零安装包；Electron 桌面端已发布 v0.4.0 / v0.5.0。

## 🛠️ 技术栈

- **前端**：Next.js 16（App Router）+ React 19 + TypeScript 5.7 + Tailwind CSS 4 + Zustand
- **内容与数学**：react-markdown + KaTeX + remark-math + rehype-katex
- **动画与后端**：Manim（Python）+ ffmpeg；AI SDK 7 `ToolLoopAgent` + UIMessage Stream
- **UI 组件**：lucide-react、framer-motion、react-resizable-panels、@vidstack/react
- **可安装**：PWA（Web App Manifest + appleWebApp）、Electron 桌面端

## 🚀 如何运行

完整环境要求与部署说明见开源仓库 README（Node.js 22+、pnpm 8+、Python 3.8+ 用于 Manim、LaTeX/MiKTeX 用于公式）：

```bash
pnpm install
cp .env.example .env.local   # 填入你的 AI 端点
pnpm dev                     # http://localhost:35349
```

未配置 AI 时，笔记、动画、交互与划词等框架部分照常可用。

## 👤 作者

- **AIMFllyYS**（YuSheng），华中科技大学学生开发者
- GitHub：https://github.com/AIMFllyYS
- 线上预览：https://notebook2a.husteread.icu

## 🤝 欢迎共建

- 提 Issue：反馈内容错误、功能建议或渲染问题；
- Fork + Pull Request：新增学科内容、修复 Bug、优化 UI 与性能；
- 帮助补充单元测试与集成测试。

## 🗺️ 后续计划

- [ ] 支持更多学科（线性代数等）
- [ ] 增强 AI 对话（知识图谱、多轮深度推理）
- [ ] 优化移动端体验
- [ ] 支持用户自定义笔记
- [ ] 集成更多可视化组件
- [ ] 添加单元测试和集成测试

## 📄 License

MIT License（详见开源仓库）。
