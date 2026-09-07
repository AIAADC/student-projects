# Typography and layout

## First principle

There is no universal national rule saying that every Chinese thesis/report must use a particular combination such as `宋体、小四、1.5 倍行距`. Exact academic typography usually comes from the recipient's current template. Record the source of every layout value.

## Profile selection

### Strict official-document profile

Use only for a genuine Party/government official document or an explicit request. Verify the current full `GB/T 9704` text and all applicable elements. Typical core geometry and typography include:

- A4 paper, 210 mm × 297 mm;
- type area about 156 mm × 225 mm, with top margin about 37 mm and binding-side margin about 28 mm, implying about 35 mm bottom and 26 mm outer margin;
- main title in the specified size-2 small-standard-Song style when the required face is installed;
- body in size-3 FangSong; first-level headings in Heiti and second-level headings in Kaiti under the standard conventions;
- the prescribed line/character grid, page-number form/position, document elements, printing, and binding where applicable.

Do not combine a strict compliance claim with a decorative cover, arbitrary cards, poster typography, or omitted official-document elements. Font names available in software may not be the exact required typeface; verify installed fonts and final rendering.

### Recipient-template academic profile

For theses and academic papers, preserve the supplied template's:

- cover/title-page fields and declarations;
- page size, binding margin, mirror margins, section breaks, and orientation;
- Chinese/Western/monospace/math fonts and their sizes;
- title, heading, body, quotation, footnote, caption, table, equation, and bibliography styles;
- front-matter/body pagination, running heads, TOC depth, and chapter-start rules;
- bilingual metadata and discipline-specific notation.

Avoid restyling a template to match personal preferences. Fix only defects that conflict with explicit requirements, accessibility, or renderer stability.

### General formal-report fallback

Use only when no controlling template fixes the values. This is a conservative editorial default, not a national standard:

| Element | Fallback value |
|---|---|
| Paper | A4 portrait; landscape only for wide material |
| Margins | top/bottom 25–30 mm; left 28–32 mm when binding, right 25–28 mm |
| Body | Chinese Song/FangSong family 10.5–12 pt; Western text Times New Roman or recipient-approved equivalent |
| Main title | Chinese Song/Heiti family 18–22 pt, semibold/bold as supported |
| Level 1 | Heiti 15–16 pt |
| Level 2 | Heiti/Kaiti 13–15 pt |
| Level 3 | body size or 12–13 pt, differentiated without excessive weight |
| Caption/table text | 9–10.5 pt, not below readability threshold |
| Line spacing | explicit fixed/at-least spacing chosen after font test; commonly 1.3–1.6× visual density |
| Paragraph | first-line indent 2 Chinese characters where the genre uses prose indents; otherwise block spacing |
| Page number | real PAGE field, position declared in the style sheet |

Do not use the fallback if the recipient's acceptance template can be obtained.

## Font handling

### Font roles

Define explicit font roles rather than formatting individual runs ad hoc:

- Chinese title/display;
- Chinese body;
- Chinese heading levels;
- Latin letters and numerals;
- code/identifiers;
- mathematics;
- captions/notes;
- headers/footers;
- bibliography.

Set East Asian, ASCII, high ANSI, and complex-script mappings explicitly. Use `w:hint="eastAsia"` for Chinese runs when direct OOXML generation needs it. Remove theme font references (`asciiTheme`, `hAnsiTheme`, `eastAsiaTheme`, `cstheme`) when exact cross-suite typography matters.

### Availability and licensing

- Prefer fonts installed on the recipient's system or explicitly supplied/licensed.
- Do not distribute font files without permission.
- A DOCX font name does not prove that the renderer used that font.
- Verify PDF font embedding/subsetting and inspect Chinese, Latin, symbols, math, rare characters, and bold/italic variants.
- Avoid simulated bold/italic for CJK fonts when a real face is required.

## Paragraph and pagination controls

- Use named styles for all semantic roles.
- Use first-line indent or paragraph spacing consistently; do not combine them randomly.
- Prefer explicit point spacing when Word/WPS consistency matters.
- Use `keep_with_next` for headings and captions; use `keep_together` selectively for short blocks.
- Use widow/orphan control where supported, then verify actual pagination.
- Start chapters with `page_break_before` or section breaks, not strings of empty paragraphs.
- Do not apply keep rules to large blocks that cannot fit on one page.

## Page geometry

Set paper size, orientation, margins, gutter, header/footer distance, vertical alignment, and columns on every section. Check section changes around front matter, landscape tables, appendices, and title pages. For duplex/bound output, verify odd/even pages, mirror margins, blank-page logic, and binding edge.

## Heading and numbering hierarchy

- Use no more levels than the document needs.
- Use automatic multilevel lists connected to heading styles.
- Keep one numbering grammar throughout the same hierarchy.
- Do not type tabs/spaces to align numbers.
- Do not use heading styling merely for visual emphasis; reserve headings for document structure.
- Ensure the TOC and PDF bookmarks follow the real hierarchy.

## Figures and tables

- Keep images within the text area and preserve aspect ratio.
- Use consistent image widths by role, not arbitrary per-page resizing.
- Aim for adequate effective resolution at placed size; 150–220 PPI is a practical screen-heavy-report range, while print/line art may require more under the recipient specification.
- Keep a figure with its number/title and source note.
- Use fixed-width tables, explicit cell margins, repeated headers, and non-exact row heights.
- Split a complex table or use a justified landscape section before shrinking text below readable size.

## Color and accessibility

- Default body text to near-black on white.
- Use one restrained accent or the organization's approved palette.
- Maintain sufficient contrast and do not encode meaning by color alone.
- Use actual text, heading structure, alternative text, meaningful link text, and logical table order where the file must be accessible.
- Avoid rasterizing pages, decorative watermarks behind body text, low-contrast gray text, or information embedded only in an image.

Accessibility conformance is a separate claim. If the recipient requires a specific standard, perform its dedicated checks; visual neatness is not accessibility proof.

## Layout red flags

- calling a fallback font/size a national requirement;
- using GB/T 9704 geometry for an unrelated thesis without authorization;
- relying on theme fonts or unavailable proprietary fonts;
- tabs, spaces, or blank paragraphs for alignment/pagination;
- manually typed page, figure, table, heading, or reference numbers;
- floating images that reorder or move across renderers;
- auto-fit tables that change width in WPS/Word;
- captions stranded on the next page;
- page number shown as plain text instead of a field;
- inconsistent CJK/Latin baselines or unexplained font substitution.
