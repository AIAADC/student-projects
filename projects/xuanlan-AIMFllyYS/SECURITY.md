# Security Policy

## Supported versions

项目目前处于早期发布阶段，只为最新 GitHub Release 提供安全修复。旧版本用户应先升级到最新版本再验证问题。

## Reporting a vulnerability

请使用 GitHub 仓库的 **Security → Report a vulnerability** 私下提交安全报告。如果私有报告入口不可用，请联系仓库维护者，但不要创建公开 Issue。

报告建议包含：

- 受影响版本、Android 版本和 WebView 版本；
- 最小复现步骤与预期/实际结果；
- 涉及的 URL、Intent、JavaScript bridge、Cookie/Profile 或文件访问范围；
- 影响判断及可行缓解方案；
- 必要的日志或截图，提交前移除 Cookie、Token、浏览历史和个人信息。

维护者会尽快确认收到报告，并在复现、修复和发布节点更新状态。请在修复发布前避免公开披露可直接利用的细节。

## Security boundaries

- PocketWebShell 会展示第三方网页，网页内容、标题、图标、链接和 JavaScript 消息均不可信。
- 用户明确选择继续访问证书异常网站仍有风险；应用不得静默绕过 TLS 错误。
- 前台服务不构成永久后台执行保证。
- GitHub Release APK 只应使用项目发布证书签名。请同时核对 Release 中的 SHA-256 文件和公开证书。
- 发布私钥、JKS 和凭据永不存放在仓库或 Release 资产中。

