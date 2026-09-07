# AI 前沿情报站 📡

> 每天用一份结构化简报，追踪大模型、厂商动态和新模型实测。

[在线预览](https://64bb5c06830a424fbb1b8c08fc95824e.app.workbuddy.link) · [WorkBuddy Page 版](https://workbuddy.link/p/qepMWks2Grf4KX4mbQfSaT)

## 项目信息

- 作者：WenNinghan（GitHub 用户名）
- GitHub：<https://github.com/AIAADC/student-projects/tree/main/projects/ai-frontier-intel-station-WenNinghan>
- 在线网站：<https://64bb5c06830a424fbb1b8c08fc95824e.app.workbuddy.link>
- 项目状态：持续更新中

## 这是什么？

AI 前沿情报站是一个由 WorkBuddy 自动化驱动的 AI 信息工作台：每天定时搜集公开渠道的大模型动态，整理成可快速阅读的日报，并把重要信息沉淀到模型追踪、厂商动态和横评实测笔记中。

网页目录中的 `site/` 是可直接部署的静态站点；在 WorkBuddy 平台打开时，还可以读取三张在线资料表。离开平台后，网页会自动降级到仓库内的 `site/data.js` 快照。

## 你能看到什么？

- `daily-briefs/`：2026-08-28 至 2026-09-07 的每日简报
- `knowledge/02-新模型追踪.md`：新模型发布时间线与状态
- `knowledge/03-横评实测笔记.md`：模型体验、性能比较与实测记录
- `knowledge/04-厂商动态.md`：主要厂商的公开动态
- `knowledge/06-优化记录.md`：工作台版本迭代与修复记录
- `site/`：可以直接打开或部署的静态网页

## 本地预览

由于网页会加载同目录下的 `data.js`，建议通过本地静态服务器预览：

```bash
cd site
python -m http.server 8000
```

然后打开 <http://localhost:8000>。直接双击 `index.html` 也能看到页面，但部分浏览器会限制本地脚本加载。

## 自动化流程

```text
定时触发 → 搜集公开信息 → 生成每日简报 → 更新知识库
        → 刷新网页快照 → 同步 WorkBuddy 在线资料表
```

自动化任务本身运行在 WorkBuddy 中，不随本仓库导出；仓库保存的是公开内容、静态站点和可复查的产物。

## 版本记录

- v1 → v2：拆分数据层，集中维护 `data.js`
- v3：加入工作台外壳、侧栏、模型擂台和成本计算器
- v4 → v5：接入 WorkBuddy 在线资料表
- v5+：增加全部往期简报入口

## 说明

本项目中的情报来自公开渠道。涉及尚未官方确认的消息，会尽量保留“未证实”等状态标记；阅读时请以厂商公告和原始来源为准。

如果你想交流项目、补充资料或提出建议，可以通过 GitHub Issue 或 Pull Request 联系作者。
