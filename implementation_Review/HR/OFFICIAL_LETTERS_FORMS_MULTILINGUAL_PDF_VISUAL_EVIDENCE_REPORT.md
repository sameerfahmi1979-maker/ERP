# Official Letters & Forms — Multilingual PDF Visual Evidence Report

- **Program:** OFFICIAL DOCS.1
- **Date:** 2026-07-28
- **PDF engine:** Gotenberg 8 (Chromium print pipeline), A4 210×297 mm, engine margins 14/12/18/18 mm (`OFFICIAL_DOCUMENT_PAGE_MARGINS_MM`)
- **Arabic font:** Noto Sans Arabic, embedded server-side as base64 `@font-face`; render waits on `document.fonts.status === 'loaded'`

---

## 1. Evidence Sets

### 1.1 Gate 3 visual baselines (specimen data, watermarked, NOT official)

Rendered by `spikes/official-docs-gate3/render-visual-baselines.ts` through the
same `renderOfficialDocumentHtml` + Gotenberg path used by production issuance.
HTML + PDF pairs stored in `spikes/official-docs-gate3/evidence/` with
`manifest.json` (checksums, page sizes):

| # | Baseline | Language/Layout | Checks passed |
|---|----------|-----------------|---------------|
| 01 | Employment Certificate | EN | header/logo zone, serial+date meta strip, body wrapping, signature block, footer pinned to page bottom |
| 02 | Employment Confirmation | AR (RTL) | full RTL direction, Arabic shaping/ligatures, Arabic-Indic digits in dates, right-aligned meta |
| 03 | Employment Confirmation | Bilingual two-column | synchronized EN-left/AR-right paragraphs, single shared header/footer/signature/QR, bidi-isolated meta strip |
| 04 | Clearance Form | Bilingual labels | bilingual form-table labels, checkbox column, signature matrix |
| 05 | Joining Checklist | EN multi-page | page break inside checklist, identical margins on continuation page, **no near-blank trailing page** (fixed in Gate 3) |
| 06 | PPE Issue Form | EN | multi-row items table + acknowledgment block |
| 07 | Salary Certificate (with amount) | EN | amount + addressee lines, sensitive layout |
| 08 | NOC | EN | purpose input line, approval-class layout |
| 09 | Warning Letter | EN, **no QR** | disciplinary layout, QR omitted by policy |

### 1.2 Runtime UAT screenshots (real issuance through the app)

`implementation_Review/HR/official-docs-uat-evidence/`:

- `uat-employment-confirmation-arabic-issued.png` — Arabic PDF issued via the UI (serial `…000002`), RTL page, Arabic-Indic issue date.
- `uat-employment-confirmation-bilingual-issued.png` — bilingual two-column PDF issued via the UI (serial `…000004`) with QR.
- `uat-reissued-arabic-preserved-serial6.png` — Arabic variant preserved across reissue (serial `…000006`).
- `uat-generation-dialog-language-selector.png` — EN/AR/bilingual selector + optional inputs dialog.

SHA-256 hashes of every evidence file: `implementation_Review/HR/evidence/official_documents_evidence_sha256.json`.

## 2. Visual Checks Performed Per Family

For each baseline/issuance family: canonical HTML render → Gotenberg PDF →
page count and A4 dimensions inspected → header/logo/legal-name zone,
document serial + date, line wrapping, bilingual column synchronization,
Arabic shaping and RTL direction, QR placement (bottom meta zone),
stamp/signature zone non-overlap, page-break behavior, and no clipping or
blank pages. Stored PDFs re-opened from disk to confirm they are valid PDF
bytes; issuance PDFs additionally hashed (`content_sha256`) from exact bytes.

## 3. Defects Found by Visual Inspection (Gate 3) — all fixed forward

1. **Branding images not rendering** — `elEscapeAttr` allowed only `https://`,
   blocking server-embedded `data:image/` stamp/signature/logo bytes. Fixed via
   `escapeImageSrc` (https + safe base64 image data URIs only; unit-tested
   against `http://` and `javascript:` rejection).
2. **Bidi scrambling in bilingual meta strip** — mixed EN/AR labels reordered by
   the browser bidi algorithm. Fixed with `dir="rtl"` isolation spans.
3. **Multipage margins + near-blank trailing page** — mm padding + fixed A4
   min-height on the page container pushed continuation-page content to the
   paper edge and spilled a near-empty page. Fixed by moving margins to the
   PDF engine (`OFFICIAL_DOCUMENT_PAGE_MARGINS_MM`) and dropping the fixed
   height (retaining `min-height: 267mm` to pin single-page footers).

## 4. Tolerance Statement

Browser preview and official PDF use the same HTML and the same Chromium
rendering family; the only intended difference is engine print margins.
No visual divergence beyond font antialiasing was observed between the HTML
evidence files and their PDF counterparts.

## 5. Not Covered (honest)

- Salary Certificate in **Arabic/bilingual** — the definition is published for
  English only (verified wording exists in English only); AR/bilingual variants
  are a wording task, not a rendering gap (bilingual rendering is proven by the
  Employment Confirmation family).
- Bank/Embassy/Handover/Leave Confirmation — `disabled_pending_wording`; no
  official render is permitted until wording is approved.

## 6. Verdict

**PASS** — English, Arabic and bilingual layouts pass rendered-PDF inspection
on real Gotenberg output, with the wording-scope limits stated above.
