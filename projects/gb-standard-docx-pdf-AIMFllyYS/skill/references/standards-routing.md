# Standards routing and authority

## Purpose

Use this reference before applying any layout rule. It prevents a common error: treating a rule written for one document family as a universal Chinese-document standard.

## Authority and conflict order

Build a requirements matrix and classify every rule:

1. **Recipient/contract requirement:** a university template, journal instructions, government issuing rule, tender specification, funder template, court filing rule, or other explicit acceptance condition.
2. **Applicable mandatory law or rule:** including confidentiality, copyright, map review, personal-information, accessibility, records, or sector-specific requirements where relevant.
3. **Applicable current standard:** use the standard whose scope covers the document type. A recommended standard may become contractually binding when incorporated by reference.
4. **Organization/discipline convention:** house style, disciplinary notation, journal-specific citation details, or established corporate identity.
5. **Fallback editorial choice:** used only where higher authorities are silent; label it as a fallback.

Do not mechanically assert that a lower item always overrides a higher one in law. The purpose of this order is document acceptance. When requirements conflict, record both sources, identify the controlling recipient/authority, and request a decision if precedence is not clear.

## Current snapshot checked 2026-08-18

Recheck every entry before a formal delivery.

| Standard | Status at check | Use |
|---|---|---|
| GB/T 9704—2012 | Current | Layout of Party/government official documents |
| GB/T 7713.1—2025 | Current; effective 2026-02-01 | Theses and dissertations; replaced the 2006 edition |
| GB/T 7713.2—2022 | Current | Academic papers |
| GB/T 7713.3—2014 | Current | Scientific and technical reports |
| GB/T 7713.4—2025 | Current; effective 2026-03-01 | Data papers |
| GB/T 7714—2025 | Current; effective 2026-07-01 | Bibliographic references and citations; replaced the 2015 edition |
| GB/T 15834—2011 | Current | Chinese punctuation |
| GB/T 15835—2011 | Current | Numerals in publications/public texts |
| GB/T 7408.1—2023 | Current | Date/time representations for information interchange where invoked by the citation/data rule |
| CY/T 170—2019 | Current industry standard | Tables in academic publications |
| CY/T 171—2019 | Current industry standard | Illustrations in academic publications |
| GB/T 23286.1—2009 | Current | PDF/A-1 for long-term preservation, when requested |
| GB/T 23286.3—2021 | Current | PDF/A-3 with embedded files, when requested |

`GB/T 7714—2015` and `GB/T 7713.1—2006` are obsolete in this snapshot. Do not silently reuse their labels from an old template. A recipient may still explicitly require a legacy style during transition; if so, identify it as a recipient requirement and note the deviation from the current edition.

## Document routes

### Party/government official document

Use the full current `GB/T 9704` profile only when the document is genuinely an official document or the user explicitly requests that layout. Verify all applicable clauses: paper/type area, plate center, fonts and sizes, line/character grid, document elements, page numbering, attachments, seals, edition record, duplex printing, and binding. Do not add issuing authority marks, document numbers, secrecy periods, urgency marks, seals, copy recipients, or edition records without real authority and content.

### Degree thesis/dissertation

Use current `GB/T 7713.1` for semantic/document structure and the university's current graduate-school template for exact cover, declarations, fonts, margins, binding edge, pagination, title-page fields, abstracts, cataloging fields, chapter numbering, and submission packaging. The university template normally determines acceptance-facing typography where the national standard does not prescribe a single implementation.

### Academic paper

Use current `GB/T 7713.2` for the paper's presentation and current `GB/T 7714` for citations/references. The target journal's author instructions control article type, word limits, bilingual metadata, abstract structure, figure specifications, citation style choice, and production details.

### Scientific/technical report

Use current `GB/T 7713.3`, current `GB/T 7714`, and the funder/client/agency report template. Preserve report identifiers, distribution/security limitations, sponsors, performing organization, abstract, body, conclusions, appendices, and metadata only as required by the actual report contract.

### Data paper

Use current `GB/T 7713.4` together with repository/journal metadata and citation requirements. Verify dataset identifiers, versions, creators, dates, licenses, access conditions, methods, quality controls, and related publication links.

### General formal report

There is no universal national rule that fixes all fonts, sizes, margins, or chapter forms for every report. Use the recipient template. Where absent, declare a conservative fallback profile and selectively apply relevant standards for punctuation, numerals, citations, figures, tables, units, and archival format. Use wording such as `参照相关规范编排`, not `完全符合国家公文标准`.

## Requirement matrix

Create a row for each actionable requirement:

```text
ID | requirement | source/version | clause/template location | scope | exact implementation | verification | pass/exception
```

Separate:

- content requirements from visual requirements;
- normative requirements from examples and notes;
- fixed values from recommended values;
- source-manuscript defects from packaging defects;
- Word editability from PDF appearance;
- ordinary PDF from validated PDF/A.

## Standard verification procedure

1. Search the National Public Service Platform for Standards Information by exact standard number.
2. Record title, status, publication date, implementation date, replacement relationship, and whether full text is available.
3. Prefer the official standard publication for clause interpretation. The platform itself warns that electronic text is for reference and formal publications control.
4. Check the recipient's current template/instructions and their revision date.
5. Update the private matrix and source register. Do not overwrite an older required edition without explaining the transition.

## Compliance language

Use bounded statements:

- `按学校 2026 版模板编排，参考文献按 GB/T 7714—2025 整理。`
- `版式参照 GB/T 9704—2012 的 A4 与正文层级原则，本文不属于党政机关公文。`
- `PDF 已由 Microsoft Word 生成并完成逐页视觉检查；未验证 WPS 渲染。`
- `按 PDF/A-1 目标导出，并通过指定验证器检查。`

Avoid:

- `国家标准认证`;
- `全面符合所有国标`;
- `标准 PDF` when only an ordinary PDF export was produced;
- `Word/WPS 完全兼容` after testing only one renderer.
