# QA and acceptance

## Evidence layers

Keep these layers separate:

1. **Content evidence:** source manuscript, citation ledger, permission records, template, and requirements matrix.
2. **DOCX structure:** valid OOXML, styles, fields, sections, media, tables, and metadata.
3. **Renderer evidence:** target suite opens, updates, saves, closes, reopens, and exports without repair.
4. **PDF structure:** pages, boxes, fonts, searchable text, links/bookmarks, metadata, and optional PDF/A validation.
5. **Visual evidence:** contact sheet plus every final page at readable scale.

No layer substitutes for another.

## DOCX structural preflight

Check at minimum:

- valid nontrivial ZIP/OOXML package with required parts;
- no corrupt members or repair prompt;
- intended sections, paper sizes, orientation, margins, gutter, and header/footer distances;
- named heading/body/caption/reference styles and intended hierarchy;
- literal required fonts and absence of theme font ambiguity where strict compatibility is needed;
- real fields for page numbers, TOC, captions, and cross-references;
- images embedded, correct in count, plausible in dimensions, and not externally linked;
- fixed table geometry and complete cells;
- no unintended comments, tracked changes, hidden text, placeholders, macros, secrets, or private data;
- title/author/version/date and required/forbidden phrases correct;
- document properties correct when required.

The included `document_preflight.py` checks a useful subset. Add document-specific checks for exact headings, margins, styles, fields, image counts, identifiers, or disclosures. Script success is not visual QA.

## Citation and rights preflight

- every citation resolves to one entry;
- every reference-list entry is cited unless explicitly a bibliography/reading list;
- quoted passages have locators and correct quotation treatment;
- resource metadata and persistent identifiers were verified;
- citation system and edition are consistent;
- every figure/table has a callout, number, title, note/source as required;
- no `来源：网络`, `百度图片`, `侵删`, or untraceable stock image remains;
- every borrowed/adapted image/table has a permission/license basis and required attribution;
- privacy, confidentiality, map, trademark, and portrait issues are resolved.

## PDF structural preflight

- PDF opens, is not unexpectedly encrypted, and has a plausible page count;
- every page has intended size/orientation;
- expected/forbidden text checks pass after whitespace normalization;
- Chinese/Latin text extracts without replacement characters where text extraction is expected;
- fonts are embedded/subset or any exception is documented;
- metadata, link/bookmark behavior, and accessibility tags meet the contract;
- file size and SHA-256 are recorded;
- PDF/A passes a dedicated validator when claimed.

If the renderer outlines text or the PDF is intentionally image-based, report the search/accessibility limitation. Do not call failed extraction a pass.

## Visual review

Render at 160–200 DPI into a fresh directory:

```powershell
python scripts/render_pdf_pages.py final.pdf qa/final-run --dpi 180 --columns 4
```

Inspect the contact sheet for page order, blank pages, density shifts, margins, chapter rhythm, figure/table consistency, and the last page. Then inspect every `page-NNN.png` at readable scale.

For every page verify:

- characters, math, symbols, and punctuation render correctly;
- fonts, sizes, line spacing, indents, and hierarchy are correct;
- no clipping, overlap, substitution, broken border, or accidental white hole;
- headings are not orphaned and paragraphs/lists paginate acceptably;
- figures are sharp, proportional, current, correctly numbered, and paired with caption/source;
- tables show all columns, borders, wrapping, notes, and repeated headers;
- citations, footnotes/endnotes, links, and cross-references are visually correct;
- headers/footers/page numbers and section transitions are correct;
- confidential/private content is absent or properly handled;
- the final page ends intentionally.

Inspect at 200%: cover/title pages, first body page, reference pages, dense tables, multi-image pages, landscape/section transitions, appendix starts, and the final page.

## DOCX/PDF consistency

Reopen the normalized DOCX in the target suite after export and compare:

- page count and order;
- title/author/version/date;
- front-matter/main-matter pagination;
- chapter starts and TOC;
- citation markers and reference list;
- figure/table order, captions, source notes, and splits;
- headers/footers/page numbers;
- final paragraph and final page.

If available, render the DOCX separately and compare contact sheets. Otherwise, target-suite reopen plus same-suite PDF export and manual comparison is the minimum renderer evidence.

## Revision loop

After any defect:

1. fix the manuscript/generator/source asset;
2. regenerate a new draft DOCX;
3. normalize to a new final DOCX in the target suite;
4. export a new PDF from that DOCX;
5. rerun all structural and citation/rights checks;
6. rerender all PDF pages into a fresh directory;
7. inspect the new contact sheet and every page again;
8. replace the delivery pair only after both pass.

Do not inspect only the edited page: pagination and numbering can change downstream.

## Final acceptance gate

```text
Authority and content
- [ ] Document type and controlling template are identified
- [ ] Applicable standards were status-checked and versioned
- [ ] Requirement matrix has no unexplained conflict
- [ ] Meaning, claims, names, dates, numbers, and terminology are correct

Citations, figures, and rights
- [ ] Citation/reference bidirectional check passed
- [ ] Direct quotations have locators
- [ ] Figure/table callouts, numbers, captions, notes, and sources passed
- [ ] Permissions/licenses/privacy/map issues are resolved

DOCX
- [ ] Target suite opened, updated, saved, closed, and reopened the normalized DOCX
- [ ] No repair prompt, missing font, stale field, placeholder, or unintended revision remains
- [ ] Styles, sections, inline media, fixed tables, fields, and metadata passed

PDF
- [ ] PDF came from the exact normalized DOCX in the same target suite
- [ ] Page boxes, text, fonts, metadata, links/bookmarks, and hash passed as required
- [ ] PDF/A passed a dedicated validator if claimed
- [ ] Contact sheet and every page were inspected
- [ ] No blank, clipped, overlapping, blurred, stretched, substituted, or orphaned content remains

Delivery
- [ ] DOCX and PDF names and content match
- [ ] Any post-export edit triggered full regeneration and recheck
- [ ] Conformance note names actual standards, renderer, checks, and exceptions
- [ ] Only requested final artifacts are delivered
```

If a required visual, renderer, rights, or PDF/A check is unavailable, describe the result as draft/structurally checked and state the missing evidence. Do not call it fully verified.
