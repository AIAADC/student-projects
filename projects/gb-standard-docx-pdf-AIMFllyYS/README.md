# GB-Standard DOCX/PDF 打包 Skill

> 把中文稿件编排为符合现行国标 / 出版行业规范的、专业且可编辑的 Word 文档，以及版式一致、版式固定的 PDF。

一个面向毕业论文、学术论文、科技报告、数据论文、党政机关公文、机构报告、竞赛作品、验收材料等正式中文文档流程的 Codex Skill（`gb-standard-docx-pdf`），由 AIMFllyYS 开发并持续维护。

## 🔗 相关链接

| 入口 | 地址 | 说明 |
| --- | --- | --- |
| 📦 开源仓库 | https://github.com/AIMFllyYS/gb-standard-docx-pdf | 完整源码、Releases、Issues 与开发记录 |
| 📁 本目录 | `projects/gb-standard-docx-pdf-AIMFllyYS/` | AIAADC 学生项目展示副本（skill 源码） |

完整开发记录、标准核验快照与发布资料以开源仓库为准。

## 👋 项目简介

- **为什么做**：中文文档的国标排版繁琐且标准众多（公文 `GB/T 9704`、学位论文 `GB/T 7713.1`、期刊论文 `GB/T 7713.2`、参考文献 `GB/T 7714—2025`、出版插图表格 `CY/T 170/171` 等），容易用错模板、漏掉规范。
- **解决什么**：按文档类型路由到正确的标准档案，再对稿件、引用、图片、表格、DOCX 结构、目标 Office 套件归一化、PDF 导出与逐页检查保持全程可追溯。
- **范围边界**：不宣称"国标认证 / 全面合规"；每个取值都会标注为「接收方要求 / 强制规则 / 现行标准 / 机构惯例 / 回退编辑选择 / 渲染兼容措施」之一。

## ✨ 主要功能

- **文档族路由**：党政机关公文、学位论文、学术论文、科技报告、数据论文或通用正式报告，自动选择标准路线。
- **现行标准核验**：需求矩阵 + 标准实施日期核查（快照登记于 2026-08-18，交付前要求重新核验）。
- **GB/T 7714 参考文献工作流**：引文台账、著录格式与来源核验。
- **图表治理**：图编号、题注、来源注、替代文本、表编号与权利证据登记。
- **中文排版规范化**：中文标点与数字规范、中英文/中西文字体显式映射。
- **稳定 OOXML 构建**：命名样式、字面字体、真实域、内嵌图片、定宽表格与节/页设置。
- **Word/WPS 双套件**：目标套件归一化与同源 PDF 导出；可选 PDF/A 归档路由。
- **全流程视觉 QA**：结构预检、PDF 逐页渲染、联系表检查与 DOCX/PDF 对照。

## 🛠️ 技术栈

- **PowerShell**：`export_office.ps1`（Word/WPS COM 导出 DOCX + PDF）
- **Python**：`document_preflight.py`（OOXML/PDF 结构预检）、`render_pdf_pages.py`（PDF 渲染与联系表 QA）
- **标准体系**：GB/T 9704、GB/T 7713.1/2/3/4、GB/T 7714—2025、CY/T 170/171—2019

## 🚀 如何运行

把 `skill/` 目录复制进 Codex skills 目录（如 `%USERPROFILE%\.codex\skills\gb-standard-docx-pdf`），然后显式调用：

```text
Use $gb-standard-docx-pdf to package this Chinese manuscript as a standards-aligned DOCX and matching PDF.
```

常用脚本（详见开源仓库 README）：

```powershell
powershell -ExecutionPolicy Bypass -File skill/scripts/export_office.ps1 `
  -InputDocx draft.docx -OutputDocx final.docx -OutputPdf final.pdf -Renderer Word

python skill/scripts/document_preflight.py --docx final.docx --pdf final.pdf --require-a4 --strict-theme-fonts
python skill/scripts/render_pdf_pages.py final.pdf qa/final-run --dpi 180 --columns 4
```

## 👤 作者

- **AIMFllyYS**（YuSheng），华中科技大学学生开发者
- GitHub：https://github.com/AIMFllyYS

## 🤝 欢迎共建

- 提 Issue：反馈标准更新、脚本问题或排版建议；
- Fork + Pull Request：修复脚本、补充标准登记、完善文档与测试；
- 帮忙在实际文档上试用并反馈边界情况。

贡献规范见开源仓库的 [CONTRIBUTING.md](https://github.com/AIMFllyYS/gb-standard-docx-pdf/blob/main/CONTRIBUTING.md)。

## 📄 License

MIT License（详见本目录 [LICENSE](LICENSE)）。标准文本版权归其各自所有者，本仓库只汇总路由与核验方式，不转载标准原文。
