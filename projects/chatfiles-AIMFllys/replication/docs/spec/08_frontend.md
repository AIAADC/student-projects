# Vite 前端补充说明

> 文档状态：补充说明；现行架构、字段、能力和激活规则以 [01_architecture.md](01_architecture.md) 为唯一 prose 权威。

## 应用结构

- `src/app`：router、应用壳与导航元数据。
- `src/pages`：路由页面组合。
- `src/features`：聊天时间轴、资料库等领域交互。
- `src/components`：可复用展示和文件预览。
- `src/shared/api`：统一 API client 与 URL 构造。

`App` 只负责壳、主题、导航和 `Outlet`。页面按 route lazy load，不在首屏请求其他板块数据。状态使用真实 URL 保存，刷新、深链、前进和后退必须可恢复。

## 路由

- `/`
- `/chat/:conversationId`
- `/files`、`/insights`、`/academics`、`/media`、`/knowledge`
- `/settings/{summary,clues,synthesis,databases,candidates,ai}`

## 聊天时间轴

- timeline page 只携带消息和 cursor；participants 与 days 分离请求。
- 正文按 `canonical_seq` 排列，同秒不使用 UID/hash 重排。
- 每条消息显示 `HH:mm:ss`；详情与引用显示完整日期、秒和时区偏移。
- 右轨列出所有有消息日期，格式为 `YYYY-MM-DD`，按页/虚拟化加载。
- 日期锚点由服务端首条 UID/sequence 定位。
- 未知人物使用稳定 `senderKey`，服务端筛选和浏览器显示共用相同语义。

## 数据与错误状态

组件不得拼接散落 API URL。JSON 经统一 client 检查 status、content type 和 Zod schema；text/binary 同样检查状态和类型。loading、empty、unavailable、stale 必须分开呈现。

文件预览统一调用 `/api/v1/files/:scope/:id/*`。只有 capability policy 允许且实际文件可用时才能打开内容、缩略图或语音。

## 样式与性能

根 CSS 只保留 token、reset 和 shell layout；feature 样式随 lazy route 加载。长列表虚拟化或有界分页，视频网格使用缩略图，不一次挂载全部原片。

开发环境由 Vite 5173 代理 Express 3456；生产由 Express 3456 提供 `dist`。验收命令为 `npm run build` 与 `npm run test:e2e`。
