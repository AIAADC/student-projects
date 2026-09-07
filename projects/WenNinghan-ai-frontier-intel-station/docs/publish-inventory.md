# 发布信息清单

## 公开入口

- 静态主站：<https://64bb5c06830a424fbb1b8c08fc95824e.app.workbuddy.link>
- WorkBuddy Page 版：<https://workbuddy.link/p/qepMWks2Grf4KX4mbQfSaT>
- 在支持 WorkBuddy 在线资料库的环境中，页面会实时读取三张在线表；普通静态环境使用仓库内的快照数据。

## 仓库内容

本次上传保留了可公开复查的核心资产：

- `site/`：网页、数据快照和分享预览图
- `daily-briefs/`：10 期每日简报
- `knowledge/`：新模型、横评、厂商动态和优化记录

以下内容没有上传：`.lib_tmp/` 临时缓存、`img-host/` 凭证工具、分享物料、作业卡、投稿作战手册，以及仍会持续变化的周复盘和专题目录。

## 自动化说明

日报和周度复盘任务运行在 WorkBuddy 中，不是本仓库内的可执行代码。仓库只记录已经生成的公开产物，因此克隆仓库即可阅读和本地预览，不需要任何账号凭证。

## 安全检查

上传前对候选文件进行了凭证模式扫描，未发现 GitHub token、API key、Bearer token、云服务密钥或密码值。含有访问凭证读取逻辑的上传候选目录已整体排除。
