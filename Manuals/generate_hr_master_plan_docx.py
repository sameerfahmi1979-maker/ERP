"""
ALGT ERP — HR Module Master Plan DOCX Generator

Converts:
  implementation_Review/HR_Module/ALGT_ERP_HR_MODULE_FULL_MASTER_IMPLEMENTATION_PLAN.md

Output:
  implementation_Review/HR_Module/ALGT_ERP_HR_MODULE_FULL_MASTER_IMPLEMENTATION_PLAN.docx

Requires: pandoc, python-docx
"""
from __future__ import annotations

import datetime
import subprocess
import sys
from pathlib import Path

from docx import Document
from docx.enum.style import WD_STYLE_TYPE
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor

ROOT = Path(__file__).resolve().parents[1]
INPUT_MD = ROOT / "implementation_Review/HR_Module/ALGT_ERP_HR_MODULE_FULL_MASTER_IMPLEMENTATION_PLAN.md"
OUTPUT_DOCX = ROOT / "implementation_Review/HR_Module/ALGT_ERP_HR_MODULE_FULL_MASTER_IMPLEMENTATION_PLAN.docx"
REFERENCE_DOCX = ROOT / "implementation_Review/HR_Module/_hr_plan_reference.docx"

DARK = RGBColor(0x0F, 0x17, 0x2A)
BLUE = RGBColor(0x1D, 0x4E, 0xD8)
SLATE = RGBColor(0x33, 0x41, 0x55)


def _set_font(style, name: str = "Calibri") -> None:
    style.font.name = name
    style._element.rPr.rFonts.set(qn("w:eastAsia"), name)


def build_reference_doc() -> None:
    doc = Document()

    for section in doc.sections:
        section.top_margin = Inches(1)
        section.bottom_margin = Inches(1)
        section.left_margin = Inches(1)
        section.right_margin = Inches(1)

    normal = doc.styles["Normal"]
    normal.font.name = "Calibri"
    normal.font.size = Pt(10.5)
    normal.font.color.rgb = SLATE
    _set_font(normal)

    title = doc.styles["Title"]
    title.font.name = "Calibri Light"
    title.font.size = Pt(28)
    title.font.bold = True
    title.font.color.rgb = DARK
    _set_font(title)

    for level, size, color in [(1, 18, DARK), (2, 14, BLUE), (3, 12, DARK)]:
        style = doc.styles[f"Heading {level}"]
        style.font.name = "Calibri"
        style.font.size = Pt(size)
        style.font.bold = True
        style.font.color.rgb = color
        style.paragraph_format.space_before = Pt(14 if level == 1 else 10)
        style.paragraph_format.space_after = Pt(6)
        style.paragraph_format.keep_with_next = True
        _set_font(style)

    if "TOC Heading" in doc.styles:
        toc = doc.styles["TOC Heading"]
        toc.font.name = "Calibri"
        toc.font.size = Pt(16)
        toc.font.bold = True
        toc.font.color.rgb = DARK
        _set_font(toc)

    for i in range(1, 4):
        name = f"TOC {i}"
        if name in doc.styles:
            style = doc.styles[name]
            style.font.name = "Calibri"
            style.font.size = Pt(11 if i == 1 else 10)
            style.font.color.rgb = SLATE
            _set_font(style)

    if "Source Code" not in [s.name for s in doc.styles]:
        code = doc.styles.add_style("Source Code", WD_STYLE_TYPE.PARAGRAPH)
    else:
        code = doc.styles["Source Code"]
    code.font.name = "Consolas"
    code.font.size = Pt(8.5)
    code.font.color.rgb = RGBColor(0x1E, 0x29, 0x3B)
    _set_font(code, "Consolas")

    p = doc.add_paragraph("Reference styles for ALGT ERP HR Master Plan", style="Normal")
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    REFERENCE_DOCX.parent.mkdir(parents=True, exist_ok=True)
    doc.save(REFERENCE_DOCX)


def _markdown_for_docx() -> Path:
    """Prepare markdown for Word: drop manual TOC, promote heading levels."""
    text = INPUT_MD.read_text(encoding="utf-8")
    lines = text.splitlines()
    out: list[str] = []
    skip_toc = False
    skip_title = True
    for line in lines:
        if skip_title and line.startswith("# ALGT ERP"):
            skip_title = False
            continue
        if line.strip().startswith("**Document:**"):
            continue
        if line.strip().startswith("**Date:**"):
            continue
        if line.strip().startswith("**Status:**"):
            continue
        if line.strip().startswith("**Company:**"):
            continue
        if line.strip().startswith("**Context:**"):
            continue
        if line.strip() == "## Table of Contents":
            skip_toc = True
            continue
        if skip_toc:
            if line.strip() == "---":
                skip_toc = False
            continue
        if line.startswith("#### "):
            out.append("### " + line[5:])
        elif line.startswith("### "):
            out.append("## " + line[4:])
        elif line.startswith("## "):
            out.append("# " + line[3:])
        else:
            out.append(line)
    temp_md = INPUT_MD.with_name("_hr_plan_for_docx.md")
    temp_md.write_text("\n".join(out) + "\n", encoding="utf-8")
    return temp_md


def run_pandoc() -> None:
    if not INPUT_MD.exists():
        raise FileNotFoundError(f"Missing source markdown: {INPUT_MD}")

    source_md = _markdown_for_docx()
    cmd = [
        "pandoc",
        str(source_md),
        "-o",
        str(OUTPUT_DOCX),
        "--from",
        "gfm",
        "--to",
        "docx",
        "--reference-doc",
        str(REFERENCE_DOCX),
        "--toc",
        "--toc-depth=3",
        "--number-sections",
        "--syntax-highlighting=tango",
        "--metadata",
        "title=ALGT ERP — HR Module Full Master Implementation Plan",
        "--metadata",
        "author=Alliance Gulf Transport Group",
        "--metadata",
        f"date={datetime.date.today().isoformat()}",
    ]
    subprocess.run(cmd, check=True)
    source_md.unlink(missing_ok=True)


def main() -> int:
    build_reference_doc()
    run_pandoc()
    print(f"Generated: {OUTPUT_DOCX}")
    print(f"Reference: {REFERENCE_DOCX}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
