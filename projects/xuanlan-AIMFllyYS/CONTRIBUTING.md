# Contributing

感谢你改进 PocketWebShell。项目以稳定桌面几何、正确 WebView 会话归属和可验证发布为首要原则。

## 开发流程

1. 从 `dev` 创建分支：`feat/<topic>`、`fix/<topic>`、`refactor/<topic>`、`test/<topic>` 或 `docs/<topic>`。
2. 阅读并遵守 [AGENTS.md](AGENTS.md)，尤其是所修改模块的不变量和测试矩阵。
3. 使用 Conventional Commits，例如：
   - `feat(home): add folder rename flow`
   - `fix(browser): update callbacks after tab switch`
   - `docs(release): clarify certificate verification`
4. 保持每个提交只处理一个逻辑问题。
5. 向 `dev` 提交 Pull Request；发布时再由 `dev` 合入 `main`。

## Pull Request 要求

- 说明问题、解决方法和用户可见变化。
- 列出实际执行的测试命令。
- UI 改动附前后截图；拖动改动至少覆盖两枚图标，跨页改动覆盖一页以上容量。
- 数据结构变动说明 Room/DataStore 兼容策略。
- WebView 改动说明 tab/session 所有权、SSL、外链和 JavaScript bridge 影响。
- 不包含构建目录、APK、密钥、凭据或本机配置。

## 本地验证

```powershell
.\gradlew.bat testDebugUnitTest :app:assembleDebug
```

更精确的模块测试命令见 [AGENTS.md](AGENTS.md#testing-matrix)。

## 安全问题

不要公开提交包含漏洞利用细节的 Issue。请按照 [SECURITY.md](SECURITY.md) 中的方式私下报告。

