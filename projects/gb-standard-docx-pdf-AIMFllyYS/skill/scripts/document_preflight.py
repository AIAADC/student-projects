from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import zipfile
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Iterable
from xml.etree import ElementTree as ET


W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
PKG_REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships"
W = f"{{{W_NS}}}"
REL = f"{{{PKG_REL_NS}}}"
THEME_FONT_ATTRS = {f"{W}asciiTheme", f"{W}hAnsiTheme", f"{W}eastAsiaTheme", f"{W}cstheme"}
DEFAULT_PLACEHOLDERS = (
    "TODO",
    "TBD",
    "待补充",
    "此处插入",
    "截图待补",
    "PLACEHOLDER",
    "图片来源：网络",
    "图片来源网络",
    "侵删",
)


@dataclass
class InspectionResult:
    kind: str
    path: str
    sha256: str
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    text: str = ""
    page_count: int | None = None
    image_count: int | None = None
    table_count: int | None = None
    section_count: int | None = None
    field_count: int = 0
    theme_font_attributes: int = 0
    is_a4: bool | None = None
    page_sizes_mm: list[tuple[float, float]] = field(default_factory=list)
    literal_fonts: list[str] = field(default_factory=list)
    unembedded_fonts: list[str] = field(default_factory=list)
    unsafe_tables: int = 0

    def public_dict(self) -> dict[str, Any]:
        payload = asdict(self)
        payload.pop("text", None)
        return payload


def normalize_text(value: str) -> str:
    return re.sub(r"\s+", "", value or "")


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


def evaluate_terms(text: str, required: Iterable[str], forbidden: Iterable[str]) -> list[str]:
    compact = normalize_text(text).casefold()
    errors: list[str] = []
    for phrase in required:
        if normalize_text(phrase).casefold() not in compact:
            errors.append(f"missing_required_text:{phrase}")
    for phrase in forbidden:
        if normalize_text(phrase).casefold() in compact:
            errors.append(f"forbidden_text:{phrase}")
    return errors


def evaluate_regex_patterns(text: str, patterns: Iterable[str]) -> list[str]:
    errors: list[str] = []
    for pattern in patterns:
        try:
            if re.search(pattern, text, flags=re.IGNORECASE | re.DOTALL):
                errors.append(f"forbidden_regex:{pattern}")
        except re.error as exc:
            errors.append(f"invalid_forbidden_regex:{pattern}:{exc}")
    return errors


def _xml(archive: zipfile.ZipFile, name: str) -> ET.Element:
    return ET.fromstring(archive.read(name))


def _word_text(archive: zipfile.ZipFile) -> str:
    parts = [
        name
        for name in archive.namelist()
        if name.startswith("word/")
        and name.endswith(".xml")
        and (
            name == "word/document.xml"
            or name.startswith("word/header")
            or name.startswith("word/footer")
        )
    ]
    texts: list[str] = []
    for name in sorted(parts):
        try:
            root = _xml(archive, name)
        except ET.ParseError:
            continue
        texts.extend(node.text or "" for node in root.iter(f"{W}t"))
    return "\n".join(texts)


def _twips_to_mm(value: str | None) -> float:
    if value is None:
        return 0.0
    return round(int(value) * 25.4 / 1440, 2)


def _is_a4_size(width_mm: float, height_mm: float, tolerance_mm: float = 2.0) -> bool:
    portrait = abs(width_mm - 210.0) <= tolerance_mm and abs(height_mm - 297.0) <= tolerance_mm
    landscape = abs(width_mm - 297.0) <= tolerance_mm and abs(height_mm - 210.0) <= tolerance_mm
    return portrait or landscape


def _inspect_tables(document_root: ET.Element) -> tuple[int, int]:
    tables = list(document_root.iter(f"{W}tbl"))
    unsafe = 0
    for table in tables:
        props = table.find(f"{W}tblPr")
        grid = table.find(f"{W}tblGrid")
        width = props.find(f"{W}tblW") if props is not None else None
        layout = props.find(f"{W}tblLayout") if props is not None else None
        fixed_width = width is not None and width.get(f"{W}type") == "dxa"
        fixed_layout = layout is not None and layout.get(f"{W}type") == "fixed"
        has_grid = grid is not None and any(True for _ in grid.iter(f"{W}gridCol"))
        cells_fixed = True
        for cell in table.iter(f"{W}tc"):
            tc_props = cell.find(f"{W}tcPr")
            tc_width = tc_props.find(f"{W}tcW") if tc_props is not None else None
            if tc_width is None or tc_width.get(f"{W}type") != "dxa":
                cells_fixed = False
                break
        if not (fixed_width and fixed_layout and has_grid and cells_fixed):
            unsafe += 1
    return len(tables), unsafe


def _inspect_external_images(archive: zipfile.ZipFile) -> int:
    count = 0
    rel_parts = [name for name in archive.namelist() if name.startswith("word/_rels/") and name.endswith(".rels")]
    for name in rel_parts:
        try:
            root = _xml(archive, name)
        except ET.ParseError:
            continue
        for rel in root.iter(f"{REL}Relationship"):
            if (rel.get("Type") or "").endswith("/image") and rel.get("TargetMode") == "External":
                count += 1
    return count


def _active_style_elements(document: ET.Element, styles: ET.Element) -> list[ET.Element]:
    by_id = {
        node.get(f"{W}styleId"): node
        for node in styles.findall(f"{W}style")
        if node.get(f"{W}styleId")
    }
    active: set[str] = set()
    for tag in ("pStyle", "rStyle", "tblStyle"):
        for node in document.iter(f"{W}{tag}"):
            value = node.get(f"{W}val")
            if value:
                active.add(value)
    for node in styles.findall(f"{W}style"):
        if node.get(f"{W}default") in {"1", "true", "on"}:
            style_id = node.get(f"{W}styleId")
            if style_id:
                active.add(style_id)

    queue = list(active)
    while queue:
        style_id = queue.pop()
        style = by_id.get(style_id)
        if style is None:
            continue
        based_on = style.find(f"{W}basedOn")
        parent = based_on.get(f"{W}val") if based_on is not None else None
        if parent and parent not in active:
            active.add(parent)
            queue.append(parent)
    return [by_id[style_id] for style_id in sorted(active) if style_id in by_id]


def inspect_docx(path: Path) -> InspectionResult:
    path = path.resolve()
    result = InspectionResult(kind="docx", path=str(path), sha256=file_sha256(path))
    try:
        with zipfile.ZipFile(path) as archive:
            names = set(archive.namelist())
            required_parts = {"[Content_Types].xml", "word/document.xml", "word/styles.xml"}
            missing = sorted(required_parts - names)
            if missing:
                result.errors.append("missing_docx_parts:" + ",".join(missing))
                return result

            bad_member = archive.testzip()
            if bad_member:
                result.errors.append(f"corrupt_zip_member:{bad_member}")

            document = _xml(archive, "word/document.xml")
            styles = _xml(archive, "word/styles.xml")
            result.text = _word_text(archive)
            if "\ufffd" in result.text:
                result.errors.append("replacement_character")
            for placeholder in DEFAULT_PLACEHOLDERS:
                if placeholder.casefold() in result.text.casefold():
                    result.errors.append(f"placeholder_or_unresolved_source:{placeholder}")

            result.image_count = len([name for name in names if name.startswith("word/media/") and not name.endswith("/")])
            result.table_count, result.unsafe_tables = _inspect_tables(document)
            if result.unsafe_tables:
                result.warnings.append(f"unsafe_tables:{result.unsafe_tables}")

            result.field_count = sum(1 for _ in document.iter(f"{W}fldChar")) + sum(1 for _ in document.iter(f"{W}fldSimple"))

            theme_attrs = 0
            literal_fonts: set[str] = set()
            for root in [document, *_active_style_elements(document, styles)]:
                for fonts in root.iter(f"{W}rFonts"):
                    for attr, value in fonts.attrib.items():
                        if attr in THEME_FONT_ATTRS:
                            theme_attrs += 1
                        elif attr in {f"{W}ascii", f"{W}hAnsi", f"{W}eastAsia", f"{W}cs"} and value:
                            literal_fonts.add(value)
            result.theme_font_attributes = theme_attrs
            result.literal_fonts = sorted(literal_fonts)
            if theme_attrs:
                result.warnings.append(f"theme_font_attributes:{theme_attrs}")

            sections = list(document.iter(f"{W}sectPr"))
            result.section_count = len(sections)
            sizes: list[tuple[float, float]] = []
            for section in sections:
                page_size = section.find(f"{W}pgSz")
                if page_size is not None:
                    sizes.append((_twips_to_mm(page_size.get(f"{W}w")), _twips_to_mm(page_size.get(f"{W}h"))))
            result.page_sizes_mm = sizes
            result.is_a4 = bool(sizes) and all(_is_a4_size(width, height) for width, height in sizes)
            if not sections:
                result.errors.append("missing_section_properties")

            if _inspect_external_images(archive):
                result.errors.append("external_images")
            if "word/comments.xml" in names:
                result.warnings.append("comments_present")
            if list(document.iter(f"{W}ins")) or list(document.iter(f"{W}del")):
                result.warnings.append("tracked_changes_present")
            if "word/vbaProject.bin" in names:
                result.warnings.append("macro_project_present")
    except (OSError, zipfile.BadZipFile, ET.ParseError) as exc:
        result.errors.append(f"docx_read_error:{exc}")
    return result


def _pdf_font_embedding(font: Any) -> tuple[str, bool]:
    try:
        font_obj = font.get_object()
        base_name = str(font_obj.get("/BaseFont", "unknown"))
        descendants = font_obj.get("/DescendantFonts")
        if descendants:
            font_obj = descendants[0].get_object()
        descriptor = font_obj.get("/FontDescriptor")
        if descriptor:
            descriptor = descriptor.get_object()
            embedded = any(key in descriptor for key in ("/FontFile", "/FontFile2", "/FontFile3"))
            return base_name, embedded
        return base_name, str(font_obj.get("/Subtype", "")) == "/Type3"
    except Exception:
        return "unknown", False


def inspect_pdf(path: Path) -> InspectionResult:
    path = path.resolve()
    result = InspectionResult(kind="pdf", path=str(path), sha256=file_sha256(path))
    try:
        from pypdf import PdfReader

        reader = PdfReader(str(path))
        if reader.is_encrypted:
            result.errors.append("encrypted_pdf")
            return result
        result.page_count = len(reader.pages)
        if result.page_count == 0:
            result.errors.append("empty_pdf")
            return result

        page_text: list[str] = []
        sizes: list[tuple[float, float]] = []
        unembedded: set[str] = set()
        for page in reader.pages:
            box = page.mediabox
            sizes.append((round(float(box.width) * 25.4 / 72, 2), round(float(box.height) * 25.4 / 72, 2)))
            page_text.append(page.extract_text() or "")
            resources = page.get("/Resources")
            if resources:
                fonts = resources.get_object().get("/Font")
                if fonts:
                    for font in fonts.get_object().values():
                        name, embedded = _pdf_font_embedding(font)
                        if not embedded:
                            unembedded.add(name)
        result.text = "\n".join(page_text)
        result.page_sizes_mm = sizes
        result.is_a4 = all(_is_a4_size(width, height) for width, height in sizes)
        result.unembedded_fonts = sorted(unembedded)
        if unembedded:
            result.warnings.append("unembedded_fonts:" + ",".join(sorted(unembedded)))
        if "\ufffd" in result.text:
            result.errors.append("replacement_character")
    except Exception as exc:
        result.errors.append(f"pdf_read_error:{exc}")
    return result


def _load_lines(path: Path | None) -> list[str]:
    if path is None:
        return []
    return [
        line.strip()
        for line in path.read_text(encoding="utf-8-sig").splitlines()
        if line.strip() and not line.lstrip().startswith("#")
    ]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="对标准化中文文稿的 DOCX/PDF 做结构预检；不替代逐页视觉验收。")
    parser.add_argument("--docx", type=Path)
    parser.add_argument("--pdf", type=Path)
    parser.add_argument("--expect", action="append", default=[], help="必须出现的文字，可重复")
    parser.add_argument("--forbid", action="append", default=[], help="禁止出现的文字，可重复")
    parser.add_argument("--forbid-regex", action="append", default=[], help="禁止命中的正则表达式，可重复")
    parser.add_argument("--expect-file", type=Path, help="UTF-8 文本，每行一个必备短语")
    parser.add_argument("--forbid-file", type=Path, help="UTF-8 文本，每行一个禁用短语")
    parser.add_argument("--forbid-regex-file", type=Path, help="UTF-8 文本，每行一个禁用正则表达式")
    parser.add_argument("--require-font", action="append", default=[], help="DOCX 活跃样式中必须存在的字体，可重复")
    parser.add_argument("--min-images", type=int, default=0)
    parser.add_argument("--min-fields", type=int, default=0)
    parser.add_argument("--min-pages", type=int, default=1)
    parser.add_argument("--max-pages", type=int)
    parser.add_argument("--require-a4", action="store_true")
    parser.add_argument("--strict-theme-fonts", action="store_true")
    parser.add_argument("--strict-tables", action="store_true")
    parser.add_argument("--json-out", type=Path)
    return parser.parse_args()


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    args = parse_args()
    if not args.docx and not args.pdf:
        print("FAIL: 至少提供 --docx 或 --pdf", file=sys.stderr)
        return 2

    required = [*args.expect, *_load_lines(args.expect_file)]
    forbidden = [*args.forbid, *_load_lines(args.forbid_file)]
    forbidden_regex = [*args.forbid_regex, *_load_lines(args.forbid_regex_file)]
    results: list[InspectionResult] = []

    for kind, path in (("docx", args.docx), ("pdf", args.pdf)):
        if path is None:
            continue
        if not path.exists():
            print(f"FAIL: 文件不存在：{path}", file=sys.stderr)
            return 2
        result = inspect_docx(path) if kind == "docx" else inspect_pdf(path)
        result.errors.extend(evaluate_terms(result.text, required, forbidden))
        result.errors.extend(evaluate_regex_patterns(result.text, forbidden_regex))
        if args.require_a4 and result.is_a4 is not True:
            result.errors.append("page_size_not_a4")
        if kind == "docx":
            if (result.image_count or 0) < args.min_images:
                result.errors.append(f"image_count_below_minimum:{result.image_count}<{args.min_images}")
            if result.field_count < args.min_fields:
                result.errors.append(f"field_count_below_minimum:{result.field_count}<{args.min_fields}")
            for font in args.require_font:
                if font not in result.literal_fonts:
                    result.errors.append(f"missing_literal_font:{font}")
            if args.strict_theme_fonts and result.theme_font_attributes:
                result.errors.append(f"theme_font_attributes:{result.theme_font_attributes}")
            if args.strict_tables and result.unsafe_tables:
                result.errors.append(f"unsafe_tables:{result.unsafe_tables}")
        else:
            pages = result.page_count or 0
            if pages < args.min_pages:
                result.errors.append(f"page_count_below_minimum:{pages}<{args.min_pages}")
            if args.max_pages is not None and pages > args.max_pages:
                result.errors.append(f"page_count_above_maximum:{pages}>{args.max_pages}")
        results.append(result)

    payload = {
        "status": "PASS" if all(not item.errors for item in results) else "FAIL",
        "visual_qa_required": True,
        "citation_and_rights_qa_required": True,
        "pdfa_validation_separate": True,
        "results": [item.public_dict() for item in results],
    }
    rendered = json.dumps(payload, ensure_ascii=False, indent=2)
    print(rendered)
    print("NOTE: 结构预检不能证明引用、图片权利、PDF/A 或页面视觉正确；仍须完成相应专项检查。")
    if args.json_out:
        args.json_out.parent.mkdir(parents=True, exist_ok=True)
        args.json_out.write_text(rendered + "\n", encoding="utf-8")
    return 0 if payload["status"] == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
