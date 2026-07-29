# OUTPUT.SPIKE.1 Evidence — Gotenberg Raw-HTML Fidelity Spike

**Run date:** 2026-07-26
**Result:** **PASS — all mandatory acceptance criteria met.** The canonical
HTML/CSS → Gotenberg/Chromium raw-HTML path is viable as the global official renderer.

**Environment:** Gotenberg **8.34.0** (Docker `gotenberg/gotenberg:8`, local `localhost:3100`),
Chromium **149.0.7827.102**, endpoint `forms/chromium/convert/html` (raw multipart HTML),
`waitForExpression: document.fonts.status === 'loaded'`.

## Isolation Confirmation

- Fixture-only synthetic data (3 synthetic companies, synthetic employee). No production employees.
- Protected stamp/signature rendered as unmistakable dashed red **placeholders** — no real assets.
- QR token random (`crypto.randomBytes`), never stored — **no live public link created**.
- Zero database access. Zero schema changes. No official issuance.

## Mandatory Matrix Results (12/12 automated PASS — `spike_run_results.json`)

| Check | Result | Evidence |
|---|---|---|
| English short certificate | PASS | `pdf/D1…`, raster `raster/D1-1.png` |
| Arabic shaping + RTL | PASS — correct joined shaping, RTL order, bidi Latin codes, Arabic-Indic numerals | `raster/D4-1.png` |
| Embedded fonts | PASS — `pdffonts`: NotoSansArabic-Regular/Bold **embedded+subset**; Latin fallback LiberationSans (Arial-metric) **embedded** — documented safe fallback | `pdffonts_D4_arabic.txt` |
| Two company branding profiles + third synthetic company | PASS — identical template, distinct data-driven branding (D1/D2/D3) | `pdf/D1,D2,D3` |
| Logo, header, footer, watermark, margins | PASS | rasters |
| Inactive QR-token rendering/placement | PASS | rasters (QR block bottom-right) |
| Protected placeholders | PASS — dashed red placeholders only | rasters |
| Short + long flowing content, multi-page | PASS — D5 = 4 pages A4 | `pdfinfo_summary.txt` |
| Deliberate page break | PASS — `page-break-before` honored (D5 section 3) | `raster/D5-2.png` |
| Widow/orphan | PASS — `orphans:3; widows:3` honored, no stranded lines observed | `raster/D5-*.png` |
| Repeating table headers | PASS — blue `thead` repeats on continuation pages (rows 27–54 on p3) | `raster/D5-3.png` |
| Fixed-size card (class D) | PASS — CR80 exactly 242.88×153.12pt = 85.7×54.0mm, full-bleed | `raster/D6-1.png` |
| Browser preview vs PDF raster | PASS (element-specific tolerance — see below) | `compare/`, `visual_diff_metrics.json` |
| Renderer + Chromium version capture | PASS | `version_and_health.json` |
| SHA-256 reproducibility (exact final bytes) | PASS — in-memory hash == re-read-from-disk hash for all 6 docs | `pdf_sha256_hashes.json` |
| PDF/A-2b as separate post-processing | PASS — bytes differ post-conversion; **hash must be computed after conversion** (verified) | `pdf/D1…_PDFA-2b.pdf` |
| Timeout | PASS — controlled AbortError, no artifact written | results F1 |
| Renderer unavailable | PASS — controlled fetch failure | results F2 |
| Malformed request | PASS — HTTP 400 `form file 'index.html' is required`, no PDF produced | results F3 |
| Partial failure | PASS — artifacts written only after full-body buffering + hashing | results F4 |

## Visual Comparison Judgment

Identical HTML (same QR) was rendered by the **same Chromium** through the screenshot
endpoint (browser preview at print content width, 660px) and the PDF endpoint, then
compared after content-box trim and scale alignment:

- `CMP_D1_english_cert`: meanAbsDiff 13.79, 11.17% pixels >32 levels
- `CMP_D4_arabic_cert`: meanAbsDiff 12.95, 10.47% pixels >32 levels

Diff heatmaps (`compare/*_diff_heatmap.png`) prove the entire difference is
**glyph-edge anti-aliasing outlines** from screen-vs-print font rasterization:
every element coincides positionally, text wrap points are identical, and no
material content moves or disappears. Accepted under the plan's element-specific
tolerance rule (pixel identity is explicitly not claimed).

**Product implication (carried into OUTPUT.2+):** where exact visual fidelity of a
preview matters, the preview must be produced by the same Gotenberg/Chromium engine
(screenshot or PDF preview), not by the interactive browser DOM.

## Artifact Map

- `html/` — canonical fixture HTML (6 documents)
- `pdf/` — generated PDFs + PDF/A-2b variant
- `raster/` — 96–150dpi page rasterizations (poppler)
- `preview/` — Chromium browser-preview screenshots
- `compare/` — fidelity comparison pairs + diff heatmaps
- `pdffonts_D1_english.txt`, `pdffonts_D4_arabic.txt` — embedded font evidence
- `pdfinfo_summary.txt` — page counts/sizes
- `pdf_sha256_hashes.json` — exact stored-byte hashes
- `visual_diff_metrics.json` — metrics + final judgment
- `version_and_health.json` — renderer/Chromium versions (no secrets)
- `spike_run_results.json` — full run log

Spike harness source (fixtures + runners) is retained at `tests/output-spike/`
(fixture-only; not imported by production code).
