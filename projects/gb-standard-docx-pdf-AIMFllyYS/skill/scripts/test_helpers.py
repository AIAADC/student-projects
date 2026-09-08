from __future__ import annotations

import tempfile
import unittest
import zipfile
from pathlib import Path
import sys


SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))


class HelperContractTests(unittest.TestCase):
    def test_grid_shape(self) -> None:
        from render_pdf_pages import grid_shape

        self.assertEqual(grid_shape(17, 4), (5, 4))
        with self.assertRaises(ValueError):
            grid_shape(0, 4)

    def test_text_checks_ignore_whitespace(self) -> None:
        from document_preflight import evaluate_terms

        self.assertEqual(evaluate_terms("GB/T 7714—2025", ["GB/T7714—2025"], ["侵删"]), [])

    def test_docx_detects_unresolved_image_source_and_theme_font(self) -> None:
        from document_preflight import inspect_docx

        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / "sample.docx"
            document_xml = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:rPr><w:rFonts w:eastAsiaTheme="minorEastAsia"/></w:rPr><w:t>图片来源：网络</w:t></w:r></w:p>
    <w:sectPr><w:pgSz w:w="11906" w:h="16838"/></w:sectPr>
  </w:body>
</w:document>"""
            styles_xml = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:styleId="Normal" w:default="1"><w:name w:val="Normal"/></w:style>
</w:styles>"""
            with zipfile.ZipFile(path, "w") as archive:
                archive.writestr("[Content_Types].xml", '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>')
                archive.writestr("word/document.xml", document_xml)
                archive.writestr("word/styles.xml", styles_xml)
            result = inspect_docx(path)

        self.assertTrue(result.is_a4)
        self.assertGreater(result.theme_font_attributes, 0)
        self.assertTrue(any("图片来源：网络" in item for item in result.errors))


if __name__ == "__main__":
    unittest.main()
