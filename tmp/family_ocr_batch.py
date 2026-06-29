#!/usr/bin/env python3
"""High-resolution OCR + metadata extraction for Sameer family documents."""

from __future__ import annotations

import json
import re
import sys
from datetime import datetime
from pathlib import Path

import fitz  # PyMuPDF
import numpy as np
from PIL import Image

# Lazy init EasyOCR reader (downloads models on first run)
_READER = None

SOURCE_ROOT = Path(
    r"D:\OneDrive Folder\OneDrive - Alliance Gulf Transport and Construction L.L.C\Desktop\sameer family"
)
OUTPUT_DIR = SOURCE_ROOT / "_ocr_metadata"
RENDER_DPI = 400  # high resolution for OCR
IMAGE_EXT = {".jpg", ".jpeg", ".png", ".tif", ".tiff", ".webp", ".bmp"}
PDF_EXT = {".pdf"}


def get_reader():
    global _READER
    if _READER is None:
        import easyocr

        print("Loading EasyOCR models (en + ar)...", flush=True)
        _READER = easyocr.Reader(["en", "ar"], gpu=False, verbose=False)
    return _READER


def render_pdf_pages(pdf_path: Path) -> list[Image.Image]:
    doc = fitz.open(pdf_path)
    zoom = RENDER_DPI / 72.0
    matrix = fitz.Matrix(zoom, zoom)
    pages: list[Image.Image] = []
    for page in doc:
        pix = page.get_pixmap(matrix=matrix, alpha=False)
        img = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
        pages.append(img)
    doc.close()
    return pages


def load_images(file_path: Path) -> list[Image.Image]:
    if file_path.suffix.lower() in PDF_EXT:
        return render_pdf_pages(file_path)
    if file_path.suffix.lower() in IMAGE_EXT:
        return [Image.open(file_path).convert("RGB")]
    return []


def ocr_image(img: Image.Image) -> str:
    reader = get_reader()
    arr = np.array(img)
    results = reader.readtext(arr, detail=0, paragraph=True)
    return "\n".join(r.strip() for r in results if r and r.strip())


def ocr_file(file_path: Path) -> tuple[str, int]:
    pages = load_images(file_path)
    if not pages:
        return "", 0
    chunks: list[str] = []
    for i, page in enumerate(pages, start=1):
        text = ocr_image(page)
        if len(pages) > 1:
            chunks.append(f"--- Page {i} ---\n{text}")
        else:
            chunks.append(text)
    return "\n\n".join(chunks).strip(), len(pages)


def normalize_date(s: str | None) -> str | None:
    if not s:
        return None
    s = s.strip()
    for fmt in (
        r"(\d{4})[./\-](\d{1,2})[./\-](\d{1,2})",
        r"(\d{1,2})[./\-](\d{1,2})[./\-](\d{4})",
    ):
        m = re.search(fmt, s)
        if not m:
            continue
        g = m.groups()
        if len(g[0]) == 4:
            y, mo, d = g
        else:
            d, mo, y = g
        return f"{int(y):04d}-{int(mo):02d}-{int(d):02d}"
    return s


def pick_first(patterns: list[str], text: str, flags=re.I | re.M) -> str | None:
    for pat in patterns:
        m = re.search(pat, text, flags)
        if m:
            val = (m.group(1) if m.lastindex else m.group(0)).strip()
            if val:
                return val
    return None


def infer_document_type(rel_path: Path, text: str) -> str:
    name = rel_path.as_posix().lower()
    blob = (name + "\n" + text.lower())
    if "eid" in name or re.search(r"\b784[-\s]?\d{4}[-\s]?\d{7}[-\s]?\d\b", text):
        return "EMIRATES_ID"
    if "visa" in name or "evisa" in name or "residence" in blob or "gdrfa" in blob or "icp" in blob:
        return "VISA"
    if "medical" in name or "daman" in name or "insurance" in name or "tpa" in blob:
        return "MEDICAL_INSURANCE"
    if "birth" in name:
        return "BIRTH_CERTIFICATE"
    if "passport" in name or "passport" in blob or re.search(r"\bp\s*[<a-z0-9]{2,}\b", text, re.I):
        return "PASSPORT_COPY"
    if "784-" in text:
        return "EMIRATES_ID"
    return "OTHER"


def extract_metadata(doc_type: str, text: str, filename: str) -> dict[str, str | None]:
    meta: dict[str, str | None] = {
        "document_type": doc_type,
        "source_filename": filename,
    }

    eid = pick_first(
        [r"\b(784[-\s]?\d{4}[-\s]?\d{7}[-\s]?\d)\b", r"Emirates\s*ID[:\s#]*([\d\s-]+)"],
        text,
    )
    if eid:
        meta["emirates_id_number"] = re.sub(r"\s", "", eid)

    passport = pick_first(
        [
            r"Passport\s*(?:No|Number|#)?[:\s]*([A-Z0-9]{6,12})",
            r"\b([A-Z]{1,2}\d{6,9})\b",
        ],
        text,
    )
    if passport:
        meta["passport_number"] = passport

    visa_no = pick_first(
        [
            r"(?:Visa|File|UID|Unified)\s*(?:No|Number|#)?[:\s]*([\d/\-]{5,25})",
            r"\b(\d{2,3}/\d{4}/\d{1,3}/\d{5,8})\b",
        ],
        text,
    )
    if visa_no:
        meta["visa_file_number"] = visa_no.replace(" ", "")

    name_en = pick_first(
        [
            r"Name[:\s]+([A-Za-z][A-Za-z\s'.-]{2,60})",
            r"Holder[:\s]+([A-Za-z][A-Za-z\s'.-]{2,60})",
            r"Member[:\s]+([A-Za-z][A-Za-z\s'.-]{2,60})",
        ],
        text,
    )
    if name_en:
        meta["full_name_en"] = " ".join(name_en.split())

    nationality = pick_first([r"Nationality[:\s]+([A-Za-z\s]{3,40})", r"الجنسية[:\s]+([\u0600-\u06FF\s]{3,40})"], text)
    if nationality:
        meta["nationality"] = nationality.strip()

    dob = pick_first([r"(?:Date of Birth|DOB|Birth Date)[:\s]+([\d./\-]{8,12})", r"تاريخ الميلاد[:\s]+([\d./\-]{8,12})"], text)
    if dob:
        meta["date_of_birth"] = normalize_date(dob)

    expiry = pick_first(
        [
            r"(?:Expiry|Expir(?:y|ation)|Valid Until|Valid To)[:\s]+([\d./\-]{8,12})",
            r"تاريخ الانتهاء[:\s]+([\d./\-]{8,12})",
        ],
        text,
    )
    if expiry:
        meta["expiry_date"] = normalize_date(expiry)

    issue = pick_first([r"(?:Issue Date|Date of Issue)[:\s]+([\d./\-]{8,12})"], text)
    if issue:
        meta["issue_date"] = normalize_date(issue)

    if doc_type == "MEDICAL_INSURANCE":
        meta["insurance_provider"] = pick_first(
            [r"(Daman|NAS|NextCare|Orient|ADNIC|Sukoon|Dubai Insurance|Oman Insurance)", r"Insurer[:\s]+([A-Za-z\s]{3,40})"],
            text,
        )
        meta["policy_number"] = pick_first(
            [r"Policy\s*(?:No|Number|#)?[:\s]*([A-Z0-9\-/]{4,30})", r"Group\s*Policy[:\s]+([A-Z0-9\-/]{4,30})"],
            text,
        )
        meta["insurance_card_number"] = pick_first(
            [
                r"(?:Card|Member(?:ship)?|Health Card)\s*(?:No|Number|#|ID)?[:\s]*([A-Z0-9\-/]{4,25})",
            ],
            text,
        )
        meta["network_class"] = pick_first(
            [r"(Gold|Silver|Bronze|Platinum|Enhanced|Basic|VIP|Thiqa|Saada)", r"Network[:\s]+([A-Za-z0-9\s]{2,30})"],
            text,
        )
        meta["tpa"] = pick_first([r"TPA[:\s]+([A-Za-z\s]{3,40})"], text)

    if doc_type == "VISA":
        meta["visa_holder_name"] = meta.get("full_name_en")
        meta["sponsor_name"] = pick_first([r"Sponsor[:\s]+([A-Za-z0-9\s&.,'-]{3,80})"], text)
        meta["profession"] = pick_first([r"Profession[:\s]+([A-Za-z\s]{3,60})", r"Occupation[:\s]+([A-Za-z\s]{3,60})"], text)

    # Filename hints when OCR weak
    stem = Path(filename).stem
    if doc_type == "EMIRATES_ID" and not meta.get("emirates_id_number"):
        m = re.search(r"784\d{12}", stem.replace("_", ""))
        if m:
            raw = m.group(0)
            meta["emirates_id_number"] = f"{raw[:3]}-{raw[3:7]}-{raw[7:14]}-{raw[14]}"

    if doc_type == "VISA" and not meta.get("visa_file_number"):
        m = re.search(r"VISA_(\d+)", stem, re.I)
        if m:
            meta["visa_file_number"] = m.group(1)

    return {k: v for k, v in meta.items() if v}


def md_escape(s: str) -> str:
    return s.replace("|", "\\|")


def write_markdown(out_path: Path, src: Path, ocr_text: str, meta: dict, page_count: int) -> None:
    lines = [
        f"# Document Metadata — {src.name}",
        "",
        f"- **Source file:** `{src}`",
        f"- **Relative path:** `{src.relative_to(SOURCE_ROOT)}`",
        f"- **Processed at:** {datetime.now().isoformat(timespec='seconds')}",
        f"- **OCR DPI:** {RENDER_DPI}",
        f"- **Pages processed:** {page_count}",
        f"- **Inferred type:** `{meta.get('document_type', 'OTHER')}`",
        "",
        "## Extracted Metadata",
        "",
        "| Field | Value |",
        "|-------|-------|",
    ]
    for k, v in sorted(meta.items()):
        if k == "document_type":
            continue
        lines.append(f"| `{k}` | {md_escape(str(v))} |")

    lines.extend([
        "",
        "## Structured JSON",
        "",
        "```json",
        json.dumps(meta, indent=2, ensure_ascii=False),
        "```",
        "",
        "## Full OCR Text",
        "",
        "```text",
        ocr_text or "(no text extracted)",
        "```",
        "",
    ])
    out_path.write_text("\n".join(lines), encoding="utf-8")


def safe_print(msg: str) -> None:
    try:
        print(msg, flush=True)
    except UnicodeEncodeError:
        print(msg.encode("ascii", "replace").decode("ascii"), flush=True)


def main() -> int:
    if not SOURCE_ROOT.exists():
        print(f"Source folder not found: {SOURCE_ROOT}", file=sys.stderr)
        return 1

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    files = sorted(
        p for p in SOURCE_ROOT.rglob("*")
        if p.is_file() and p.suffix.lower() in (PDF_EXT | IMAGE_EXT)
        and "_ocr_metadata" not in p.parts
    )

    safe_print(f"Found {len(files)} documents. Output: {OUTPUT_DIR}")
    index_rows: list[dict] = []

    for i, file_path in enumerate(files, start=1):
        rel = file_path.relative_to(SOURCE_ROOT)
        safe_print(f"[{i}/{len(files)}] OCR {rel.as_posix()} @ {RENDER_DPI} DPI...")
        try:
            ocr_text, page_count = ocr_file(file_path)
            doc_type = infer_document_type(rel, ocr_text)
            meta = extract_metadata(doc_type, ocr_text, file_path.name)
            meta["document_type"] = doc_type

            out_name = rel.with_suffix(".md").as_posix().replace("/", "__")
            out_path = OUTPUT_DIR / out_name
            out_path.parent.mkdir(parents=True, exist_ok=True)
            write_markdown(out_path, file_path, ocr_text, meta, page_count)

            index_rows.append({
                "file": str(rel),
                "type": doc_type,
                "output_md": out_name,
                "pages": page_count,
                "name": meta.get("full_name_en") or meta.get("visa_holder_name"),
            })
            safe_print(f"    -> {doc_type} | {out_path.name}")
        except Exception as e:
            safe_print(f"    ERROR: {e}")
            err_path = OUTPUT_DIR / (rel.with_suffix(".error.txt").as_posix().replace("/", "__"))
            err_path.write_text(str(e), encoding="utf-8")

    # Master index
    index_lines = [
        "# Sameer Family — OCR Metadata Index",
        "",
        f"Generated: {datetime.now().isoformat(timespec='seconds')}",
        f"OCR resolution: **{RENDER_DPI} DPI** (PDF pages rendered via PyMuPDF)",
        f"Languages: **English + Arabic** (EasyOCR)",
        "",
        "| # | File | Type | Person | Pages | Metadata MD |",
        "|---|------|------|--------|-------|-------------|",
    ]
    for n, row in enumerate(index_rows, start=1):
        index_lines.append(
            f"| {n} | `{row['file']}` | {row['type']} | {row.get('name') or '—'} | {row['pages']} | [{row['output_md']}]({row['output_md']}) |"
        )
    (OUTPUT_DIR / "INDEX.md").write_text("\n".join(index_lines), encoding="utf-8")
    safe_print(f"\nDone. {len(index_rows)} metadata files + INDEX.md")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
