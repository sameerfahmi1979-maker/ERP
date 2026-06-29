from pathlib import Path
import re

root = Path(
    r"D:\OneDrive Folder\OneDrive - Alliance Gulf Transport and Construction L.L.C\Desktop\sameer family\_ocr_metadata"
)

def infer_type(rel: str, stem: str) -> str:
    r = rel.replace("/", "\\").lower()
    s = stem.lower()
    if r.startswith("eid\\") or "eid_" in s:
        return "EMIRATES_ID"
    if r.startswith("visa\\") or "visa_" in s or "evisa" in s:
        return "VISA"
    if r.startswith("medical insurance\\") or "daman" in s or "temp_178" in s:
        return "MEDICAL_INSURANCE"
    if "birth certificate" in s:
        return "BIRTH_CERTIFICATE"
    if "passport" in s or s == "irina pp" or "scan0003" in s or "document_241219" in s:
        return "PASSPORT_COPY"
    if "marriage" in s or "عقد" in stem:
        return "MARRIAGE_CERTIFICATE"
    return "OTHER"

for md in root.glob("*.md"):
    if md.name == "INDEX.md":
        continue
    text = md.read_text(encoding="utf-8")
    rel_match = re.search(r"\*\*Relative path:\*\* `([^`]+)`", text)
    rel = rel_match.group(1) if rel_match else md.stem
    new_type = infer_type(rel, md.stem)
    text = re.sub(r"\*\*Inferred type:\*\* `[^`]+`", f"**Inferred type:** `{new_type}`", text)
    text = re.sub(r'"document_type": "[^"]+"', f'"document_type": "{new_type}"', text, count=1)
    md.write_text(text, encoding="utf-8")

print("Fixed document types")
