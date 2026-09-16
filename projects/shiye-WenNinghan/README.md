# 识页 Shiye · WenNinghan

> 把图片，变成可用的文档。文字能编辑，公式能看懂，校对一次，再导出。

**作者 / 维护者：[WenNinghan](https://github.com/WenNinghan)** · AIAADC 学生项目

**[下载 Windows 离线版](https://github.com/WenNinghan/shiye/releases/tag/v0.3.1) · [完整源码与详细教程](https://github.com/WenNinghan/shiye) · [问题反馈](https://github.com/WenNinghan/shiye/issues) · [公式使用指南](https://github.com/WenNinghan/shiye/blob/main/docs/formula-guide.md)**

![识页首页](assets/home.png)

## 为什么做这个工具

看论文、课本和课程讲义时，截图里的文字不好复制，公式变成代码后也不方便校对。识页把「导入 → 识别 → 对照修改 → 导出」放在同一个工作台里，让材料变成能够继续整理、学习和编辑的文档。

## 可以用它做什么

| 材料 | 可以得到的结果 |
| --- | --- |
| 图片、扫描件、PDF | 可校对文字；Word、Markdown、TXT、PDF、JSON |
| 清晰印刷公式 | 整页定位或框选识别，直接显示数学排版；可视化修改分式、根号、上下标与矩阵 |
| 需要继续编辑的公式 | 常见结构导出 Word 原生公式；Markdown 保留数学语法；单公式可导出 PNG |
| 简单有线表格 | 逐格校对并导出可编辑表格 |
| 通知截图 | 规则提取候选事项，人工确认后导出 ICS；不会自动建立系统提醒 |

![对照原图，可视化修改公式](assets/formula-editor.png)

公式默认不是一屏代码。点「对照 / 放大」检查原图，点「修改公式」直接改结构，熟悉 LaTeX 的同学也可展开高级选项。

## 当前版本与可用入口

| 项目 | 实际状态 |
| --- | --- |
| 源码 | 已公开到 [WenNinghan/shiye](https://github.com/WenNinghan/shiye) |
| 本机浏览器版 | 可按下面步骤运行，普通 OCR 不需要 API 密钥 |
| Windows 桌面 v0.3.1 | [完整离线预发布版](https://github.com/WenNinghan/shiye/releases/tag/v0.3.1)：安装器约 202 MB、可选公式包约 847 MB；未签名，无需自行配置环境 |
| 在线体验网站 | **暂无**；localhost / 127.0.0.1 不是线上网站 |
| 手机端 | 下一阶段规划中，当前没有 APK / iOS 安装包 |

这个目录是轻量项目入口，不复制整套源码或大模型；后续更新以个人主仓库为准。不单独建立作者父文件夹。

## 新同学如何开始

1. 打开 [Release 下载页](https://github.com/WenNinghan/shiye/releases/tag/v0.3.1)，下载 `Shiye-0.3.1-Windows-x64.exe` 并按向导安装。不需要另装 Python、Node 或 Office。
2. 看论文 / 教材的同学再下载 `.shiye-model`，在“识别设置 → 导入公式离线包”中选择文件和保存盘，成功后重启应用。建议模型盘预留至少 3 GB。
3. 先点“用示例体验一下”，或导入自己的图片/PDF；开始识别，对照原图校对，再生成并下载 Word / Markdown / PDF。
4. 下载和导入完成后，本机识别无需联网，也不依赖作者电脑开机；自己的 API 是可选项。
5. 核对 Release 中的 `SHA256SUMS.txt`。这是未签名测试版，不要关闭系统安全防护；[详细安装说明](https://github.com/WenNinghan/shiye/blob/v0.3.1/docs/desktop-guide.md)。

其余 Sources / Dependencies / Notices 归档是开发与许可材料，普通用户不用全部下载。

### 想改代码的同学

安装 Python 3.12（或 uv）与 Node.js 22.12+ / 24，然后按以下方式获取源码：

```powershell
git clone https://github.com/WenNinghan/shiye.git
cd shiye
./scripts/start.ps1
# 可选：第一次安装本地公式增强，完成后重启识页
./scripts/install-formula.ps1
```

源码浏览器版运行时需保持自己的服务终端开启；上面的安装版不需要命令行终端。只从主仓库 Release 下载，不要使用不明来源的同名安装器。

## 技术与隐私

React / TypeScript / Vite · FastAPI / SQLite · RapidOCR / ONNX Runtime · PaddleOCR 公式模型 · KaTeX / MathLive · PyMuPDF / python-docx · Electron。

- 默认本机 OCR 和公式识别。桌面版只有选择自己的 API 并明确确认后，才把选定图片发给对应服务商；费用由用户自行承担。
- 文档默认暂存 24 小时，请及时导出。桌面 API 密钥默认仅在内存，可主动选择系统加密保存。
- 不上传身份证、成绩单、未授权聊天截图、密钥或未获许可的教材全文来提交问题。

## 诚实说说限制

0.3.1 本机记录有 44 项后端、15 项打包材料、4 项桌面安全与 2 项最终桌面流程测试通过，新公式包已实际导入并完成公式/Word 导出，但不是“所有材料识别准确”的证明。逆矩阵曾把 `a` 识别为 `d`；公式、姓名、日期和数字必须人工校对。复杂多栏、无框线表格、手写和模糊页面仍有限制。

尚未在另一台干净 Windows 电脑或操作系统全局断网环境测试，未验证全部真实 API 服务商。原始许可及对应源码材料随 Release 提供；详情见 [最终包验收](https://github.com/WenNinghan/shiye/blob/v0.3.1/docs/release-acceptance-0.3.1.md)。

## 后续计划与参与

- 收集预发布反馈，继续干净机兼容性和真实 API 测试。
- 确定并实现手机端路线。
- 用经过授权的真实样例改进版面、表格与公式识别。
- 欢迎提交脱敏失败样例、体验建议、文档和修复；见 [贡献指南](https://github.com/WenNinghan/shiye/blob/main/CONTRIBUTING.md)。

## 许可证与备注

项目自有源码及随附文档采用 **MIT License**，版权署名为 **Copyright (c) 2026 WenNinghan**。见 [本项目 LICENSE](LICENSE) 与 [主仓库 LICENSE](https://github.com/WenNinghan/shiye/blob/main/LICENSE)。本目录的授权不改变资料库内其他同学项目的许可证。

第三方依赖、模型和字体仍遵循各自许可；尤其 PyMuPDF / MuPDF 的 AGPL / 商业双许可不会因本项目采用 MIT 而消失。完整安装包及服务的分发、部署仍需核对相关义务，详见 [第三方来源与发布边界](https://github.com/WenNinghan/shiye/blob/main/THIRD_PARTY_NOTICES.md)。

署名使用作者公开 GitHub 用户名 WenNinghan；不代填真实姓名、联系方式或学校信息。截图来自合成样例与界面演示，不含真实学生材料。
