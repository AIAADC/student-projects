from __future__ import annotations

import argparse
import math
import sys
from pathlib import Path


def grid_shape(page_count: int, columns: int) -> tuple[int, int]:
    if page_count <= 0:
        raise ValueError("page_count must be positive")
    if columns <= 0:
        raise ValueError("columns must be positive")
    return math.ceil(page_count / columns), columns


def _prepare_output(output_dir: Path, contact_name: str, force: bool) -> None:
    output_dir = output_dir.resolve()
    if output_dir == Path(output_dir.anchor):
        raise ValueError("拒绝把磁盘根目录作为输出目录")
    output_dir.mkdir(parents=True, exist_ok=True)
    existing = list(output_dir.iterdir())
    if existing and not force:
        raise FileExistsError(f"输出目录非空：{output_dir}；请换新目录或显式使用 --force")
    if force:
        for path in output_dir.glob("page-*.png"):
            if path.is_file():
                path.unlink()
        contact = output_dir / contact_name
        if contact.is_file():
            contact.unlink()


def render_pdf(
    pdf_path: Path,
    output_dir: Path,
    *,
    dpi: int = 160,
    columns: int = 4,
    thumb_width: int = 280,
    contact_name: str = "contact-sheet.png",
    force: bool = False,
) -> tuple[list[Path], Path]:
    import pypdfium2 as pdfium
    from PIL import Image, ImageDraw

    if dpi < 72 or dpi > 300:
        raise ValueError("dpi 必须在 72 到 300 之间")
    pdf_path = pdf_path.resolve()
    output_dir = output_dir.resolve()
    _prepare_output(output_dir, contact_name, force)

    document = pdfium.PdfDocument(str(pdf_path))
    if len(document) <= 0:
        raise ValueError("PDF 没有页面")

    page_paths: list[Path] = []
    thumbnails: list[Image.Image] = []
    scale = dpi / 72.0
    try:
        for index in range(len(document)):
            page = document[index]
            bitmap = page.render(scale=scale, rev_byteorder=True)
            image = bitmap.to_pil().convert("RGB")
            page_path = output_dir / f"page-{index + 1:03d}.png"
            image.save(page_path, format="PNG", optimize=True)
            page_paths.append(page_path)

            thumb_height = max(1, round(image.height * thumb_width / image.width))
            thumb = image.copy()
            thumb.thumbnail((thumb_width, thumb_height))
            thumbnails.append(thumb)
            page.close()
    finally:
        document.close()

    rows, columns = grid_shape(len(thumbnails), columns)
    label_height = 28
    gutter = 18
    cell_width = thumb_width + gutter * 2
    max_thumb_height = max(image.height for image in thumbnails)
    cell_height = max_thumb_height + label_height + gutter * 2
    sheet = Image.new("RGB", (columns * cell_width, rows * cell_height), "#E7E7E7")
    draw = ImageDraw.Draw(sheet)
    for index, thumb in enumerate(thumbnails):
        row, column = divmod(index, columns)
        x = column * cell_width + gutter + (thumb_width - thumb.width) // 2
        y = row * cell_height + gutter + label_height
        draw.text((column * cell_width + gutter, row * cell_height + 6), f"Page {index + 1:03d}", fill="#222222")
        sheet.paste(thumb, (x, y))
    contact_path = output_dir / contact_name
    sheet.save(contact_path, format="PNG", optimize=True)
    return page_paths, contact_path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="把最终 PDF 的每一页渲染为 PNG，并生成联系表供逐页视觉验收。")
    parser.add_argument("pdf", type=Path)
    parser.add_argument("output_dir", type=Path)
    parser.add_argument("--dpi", type=int, default=160)
    parser.add_argument("--columns", type=int, default=4)
    parser.add_argument("--thumb-width", type=int, default=280)
    parser.add_argument("--contact-name", default="contact-sheet.png")
    parser.add_argument("--force", action="store_true")
    return parser.parse_args()


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    args = parse_args()
    try:
        pages, contact = render_pdf(
            args.pdf,
            args.output_dir,
            dpi=args.dpi,
            columns=args.columns,
            thumb_width=args.thumb_width,
            contact_name=args.contact_name,
            force=args.force,
        )
    except Exception as exc:
        print(f"FAIL: {exc}", file=sys.stderr)
        return 1
    print(f"PASS: 已渲染 {len(pages)} 页")
    print(f"联系表：{contact}")
    print("下一步：先看联系表，再逐张检查所有 page-*.png；不能只抽查首页和末页。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
