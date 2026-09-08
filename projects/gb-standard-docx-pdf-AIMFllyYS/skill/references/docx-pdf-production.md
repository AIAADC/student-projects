# DOCX/PDF production and compatibility

## One-source invariant

Use this chain:

```text
verified manuscript/assets -> generated authoring DOCX -> target-suite normalized DOCX -> PDF exported from that exact DOCX -> frozen QA pair
```

Never edit the PDF independently. Never edit the final DOCX after PDF export without repeating normalization, export, structural checks, and full visual QA.

## DOCX construction

### Sections and page setup

Set page size, orientation, margins, gutter, header/footer distance, page-number behavior, columns, and section start on every section. Use real section breaks for front matter, main matter, landscape pages, appendices, and pagination changes. Avoid manual blank pages unless the print contract requires them and they are controlled by section parity.

### Named styles

Create named styles for:

- title/subtitle and metadata;
- heading levels;
- body, first paragraph, block quotation, lists;
- captions and notes;
- table text/header;
- equations;
- footnotes/endnotes;
- references;
- headers/footers.

Set font, size, weight, language, color, spacing, indents, tabs, keep rules, outline level, and numbering explicitly. Avoid direct formatting except for small semantic fragments.

### Font mappings

- Set literal `ascii`, `hAnsi`, `eastAsia`, and `cs` font mappings.
- Remove theme font references where exact Word/WPS matching is required.
- Use `w:hint="eastAsia"` when necessary for Chinese runs.
- Verify that required font files are installed and permitted.
- Check PDF font embedding/subsetting; a DOCX font declaration alone is insufficient.

### Fields and relationships

Use real fields for page numbers, total pages, dates when dynamic, TOC, lists, cross-references, and captions. Keep fields editable in DOCX and refresh them in the target suite before export. Embed images and other media; remove external links unless the contract explicitly requires live linked content.

### Images

- Prefer inline placement for cross-suite stability.
- Lock aspect ratio and set width relative to the actual text area.
- Retain adequate source resolution and avoid repeated lossy recompression.
- Set title/description or alternative text where supported.
- Keep figure, caption, source note, and necessary rights statement together.
- Store the original asset and a transformed report copy separately.

### Tables

For reliable OOXML:

- set table width in DXA and fixed layout;
- set `tblGrid` and every cell width;
- set explicit cell margins;
- include compatible `start/end` and `left/right` properties when needed;
- repeat header rows;
- avoid exact row heights that clip wrapped text;
- prevent row splitting only if the full row can fit;
- use proper header associations/reading order when accessibility matters.

If the document ends with a table, keep the required terminal paragraph tiny (for example, 1 pt with zero spacing) so Word/WPS does not push it onto an unintended blank page.

### Clean final package

Unless explicitly requested otherwise, remove:

- placeholders and sample text;
- unresolved comments and tracked changes;
- hidden personal data and stale document properties;
- external image relationships;
- broken fields and links;
- macros and embedded objects not required by the recipient;
- passwords, tokens, private URLs, revision remnants, and sensitive metadata.

Do not remove tracked changes/comments when the user requests a review copy. Produce a separate clean final if required.

## Target-renderer normalization

1. Generate the draft DOCX to a new path.
2. Open it in the recipient's target suite.
3. Refresh fields, TOC, captions, and links.
4. Save As a new normalized DOCX.
5. Close and reopen it; confirm no repair prompt, font warning, or page-count change.
6. Export PDF from this reopened normalized DOCX in the same suite.
7. Freeze both files for QA.

The included `export_office.ps1` automates save/export through WPS or Word COM. It does not refresh every field or prove visual correctness; inspect the document before and after automation.

## PDF output

For an ordinary reading/printing PDF verify:

- intended page size/orientation and page boxes;
- embedded/subset fonts where possible;
- searchable/extractable text and correct Unicode mapping;
- image sharpness and color behavior;
- links/bookmarks when required;
- metadata title/author/subject/keywords when required;
- no encryption unless explicitly requested;
- no comments, layers, attachments, scripts, or form behavior unless intended.

### PDF/A

Use PDF/A only when archival preservation is a requirement. `GB/T 23286.1—2009` covers PDF/A-1; `GB/T 23286.3—2021` covers PDF/A-3 with embedded files. Select the exact requested conformance level and validate it with a dedicated validator. A file extension, metadata flag, or office export checkbox does not prove conformance.

PDF/A may constrain encryption, external dependencies, fonts, color information, multimedia, scripts, and embedded files depending on the part/level. Do not attach the DOCX inside PDF/A-1. PDF/A-3 can support embedded files, but use it only when the archival workflow requests that behavior.

## Compatibility failure patterns

| Symptom | Likely cause | Correction |
|---|---|---|
| Chinese font changes | theme font or missing font | write literal mappings, install approved font, normalize in target suite |
| Lines/pages reflow | renderer metrics, spacing, substitution | use explicit styles, correct fonts, target-suite save/export, inspect all pages |
| Table widens/collapses | AutoFit, percent width, incomplete grid | fixed DXA width/layout/grid/cell widths |
| Caption separates | floating image or missing keep controls | inline figure; keep caption/source with figure |
| Blank chapter page | paragraph break at full boundary | use heading `page_break_before`/proper section break |
| Blank final page | terminal table and required paragraph | tiny zero-spacing terminal paragraph |
| Page number is literal text | typed number or stale field | insert/refresh PAGE field |
| TOC/cross-reference stale | fields not updated | update all fields before final save/export |
| PDF text unsearchable | outlining, bad font encoding, page rasterization | change export/font path; report limitation if unavoidable |
| PDF claims PDF/A but fails | export setting or missing conformance data | dedicated PDF/A conversion/validation and recheck |

## Renderer evidence boundary

State exactly what was tested:

- Word normalization proves the tested Word environment, not WPS or LibreOffice.
- WPS normalization proves the tested WPS environment, not Word.
- LibreOffice/headless conversion is not a substitute for a named recipient renderer.
- A PDF visual match does not prove DOCX editability after later edits.
- A structurally valid OOXML ZIP does not prove page appearance.
