from pathlib import Path
import re
from datetime import datetime

root = Path(
    r"D:\OneDrive Folder\OneDrive - Alliance Gulf Transport and Construction L.L.C\Desktop\sameer family\_ocr_metadata"
)
rows = []
for md in sorted(root.glob("*.md")):
    if md.name == "INDEX.md":
        continue
    text = md.read_text(encoding="utf-8")
    rel = re.search(r"\*\*Relative path:\*\* `([^`]+)`", text)
    typ = re.search(r"\*\*Inferred type:\*\* `([^`]+)`", text)
    pages = re.search(r"\*\*Pages processed:\*\* (\d+)", text)
    name = re.search(r'"full_name_en": "([^"]+)"', text) or re.search(r'"visa_holder_name": "([^"]+)"', text)
    rows.append({
        "file": rel.group(1) if rel else md.stem,
        "type": typ.group(1) if typ else "?",
        "name": name.group(1) if name else "—",
        "pages": pages.group(1) if pages else "?",
        "md": md.name,
    })

lines = [
    "# Sameer Family — OCR Metadata Index",
    "",
    f"Generated: {datetime.now().isoformat(timespec='seconds')}",
    "OCR resolution: **400 DPI** (PDF pages rendered via PyMuPDF)",
    "Languages: **English + Arabic** (EasyOCR)",
    "",
    "| # | File | Type | Person | Pages | Metadata MD |",
    "|---|------|------|--------|-------|-------------|",
]
for i, r in enumerate(rows, 1):
    lines.append(f"| {i} | `{r['file']}` | {r['type']} | {r['name']} | {r['pages']} | [{r['md']}]({r['md']}) |")

(root / "INDEX.md").write_text("\n".join(lines), encoding="utf-8")
print("INDEX.md regenerated")
