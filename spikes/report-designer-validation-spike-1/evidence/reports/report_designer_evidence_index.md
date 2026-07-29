# REPORT.DESIGNER.VALIDATION.SPIKE.1 — Evidence Index

Base path: `spikes/report-designer-validation-spike-1/evidence/`

## Candidate D — Executive Ledger + Gotenberg/Chromium

| Artifact | Path |
|---|---|
| Results JSON (timings, sizes, hashes) | `executive-ledger/candidate-d-results.json` |
| Source HTML (10 docs) | `executive-ledger/html/D*.html` |
| Final PDFs (10 docs) | `executive-ledger/pdf/D*.pdf` |
| Chromium preview PNGs | `executive-ledger/preview/D*.png` |
| Rasterized PDF pages | `comparisons/pdf-pages/D*.png` |

Key pages: `D2-p1` (bilingual shaped Arabic), `D3b-p1` (full RTL salary cert, Arabic-Indic numerals),
`D5-p2`/`D5-p10` (repeating thead over 10 landscape pages), `D7-p1/p2` (CR80 card — note fixture CSS QR/name overlap),
`D8A-p1` vs `D8B-p1` (branding isolation).

## Candidate B — Carbone/DOCX + Gotenberg LibreOffice

| Artifact | Path |
|---|---|
| Results JSON | `carbone-docx/candidate-b-results.json` |
| DOCX templates (with `{d.x}` markers) | `carbone-docx/templates/B*.template.docx` |
| Carbone-rendered DOCX | `carbone-docx/rendered-docx/B*.docx` |
| Final PDFs (LibreOffice) | `carbone-docx/pdf/B*.pdf` |
| Rasterized pages | `comparisons/pdf-pages/B*.png` |

Key pages: `B2-p1` (correctly shaped RTL Arabic via LibreOffice), `B5-p2`/`B5-p11` (repeating header row,
{d.rows[i]} loop over 120 rows), `B4-p1/p2` (manual PageBreak + header/footer continuity).

## Candidate C — pdfme

| Artifact | Path |
|---|---|
| Results JSON | `fixed-layout/candidate-c-results.json` |
| Template JSONs | `fixed-layout/templates/C*.template.json` |
| Final PDFs | `fixed-layout/pdf/C*.pdf` |
| Rasterized pages | `comparisons/pdf-pages/C*.png` |

Key pages: `C2-p1` (**Arabic broken/faint — knockout evidence**), `C4-p1` (**18 paragraphs compressed
into one unreadable page — no-reflow knockout**), `C5-p2` (table auto-pagination WITHOUT repeating header),
`C7-p1` (card with bidi punctuation defects), `C1-p1` (hairline-faint Latin text with Noto Arabic fallback font).

## Candidate A — TipTap Pages

| Artifact | Path |
|---|---|
| Results + findings JSON | `tiptap-pages/candidate-a-results.json` |
| Initial-load defect (1 overflowing page) | `tiptap-pages/01-initial-load-single-overflowing-page.png` |
| Page boundary after edit (5 pages) | `tiptap-pages/02-page-boundary-after-edit-5pages.png` |
| A4 page + header/footer canvas | `tiptap-pages/03-page1-a4-header-footer-scaled.png` |
| Arabic LTR defect + paragraph gap | `tiptap-pages/04-arabic-ltr-defect-and-paragraph-gap.png` |
| Prototype source | `../tiptap-v2-prototype/` (main.js, index.html) |

Official `@tiptap-pro/extension-pages`: npm 404 without paid registry token (captured in execution log).

## Shared / reconciliation

| Artifact | Path |
|---|---|
| Fixture pack (companies, employees, datasets) | `../fixtures/fixture-data.mts` |
| Live DB reconciliation (read-only) | `fixtures/reconciliation-db-counts.json` |
| Page counts (all 28 PDFs) | `page-counts.json` |
| Decision matrix (JSON, reproducible) | `reports/report_designer_validation_matrix.json` |
| Decision matrix (CSV) | `reports/report_designer_validation_matrix.csv` |
| Test manifest | `reports/report_designer_test_manifest.json` |

## Evidence labels used

`PROVEN` — real output produced and inspected in this spike.
`PARTIAL` — produced with observed material defects.
`FAILED` — attempted, output unusable for the tested purpose.
`BLOCKED` — required authority/licensing/credentials unavailable.
`NOT TESTED` — not practically exercised; never scored as available.
`DOCUMENTATION ONLY` — vendor claim without spike validation.
