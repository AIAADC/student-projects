# Changelog

All notable changes to this skill are documented here.

## [0.1.0] — 2026-08-19

Initial open-source release.

- Generalized the source workflow from software-product reports to Chinese DOCX/PDF packaging.
- Added document-family routing for official documents, theses, academic papers, scientific/technical reports, data papers, and general formal reports.
- Added current-standard status routing and an explicit distinction between standards, recipient templates, conventions, fallbacks, and renderer measures.
- Updated the reference baseline to `GB/T 7714—2025` and `GB/T 7713.1—2025` as current at the 2026-08-18 status check.
- Added guidance for `CY/T 170—2019` tables, `CY/T 171—2019` illustrations, Chinese punctuation, numerals, copyright, permissions, privacy, maps, and alternative text.
- Added explicit font mapping, fixed table geometry, inline image, real field, target-renderer normalization, ordinary PDF, and optional PDF/A guidance.
- Added `document_preflight.py`, `render_pdf_pages.py`, `export_office.ps1`, and helper tests.
- Added a source register with official standard and legal links.
