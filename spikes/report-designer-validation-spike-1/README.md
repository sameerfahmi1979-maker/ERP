# REPORT.DESIGNER.VALIDATION.SPIKE.1 — Isolated Spike Workspace

**Status:** DISPOSABLE, NON-PRODUCTION. Nothing in this folder is imported by any production route.
**Executed:** 2026-07-26 · Worktree commit `31654f14e7e936e80bdb301a0a00727e0068bc1a` (branch `main`)
**Safety:** 100% synthetic fixtures (`FIX-*` identifiers), placeholder stamps/signatures, random QR token never stored. No production DB writes, no migrations, no template mutation, no QR link changes, no Puck deletion.

## What this spike is

Hands-on validation of four Report Designer candidate architectures, producing the same
eight benchmark ERP documents in each candidate where technically possible, with real
PDFs, screenshots, decision matrices and reports.

| Candidate | What was tested | Result |
|---|---|---|
| A — TipTap Pages | Official Pro install attempt + isolated TipTap v2 + `tiptap-extension-pagination` prototype | Official BLOCKED (paid registry); community prototype PROVEN with 3 defects |
| B — Carbone/DOCX | `carbone@3.8.2` injection → Gotenberg **LibreOffice** → PDF | 9/9 documents PROVEN |
| C — pdfme | `@pdfme/generator@6.1.12` server-side generation | 9/9 generated; Arabic + flowing-text KNOCKOUTS observed |
| D — Executive Ledger | Production `renderExecutiveLedgerHtml` (read-only import) → Gotenberg **Chromium** | 10/10 documents PROVEN |

## How to run the prototypes

All scripts run from the **repo root** with the dev Gotenberg container up
(`http://localhost:3100`, health includes `chromium` + `libreoffice`):

```bash
# Candidate D — Executive Ledger baseline (8 benchmark docs)
npx tsx spikes/report-designer-validation-spike-1/scripts/candidate-d-executive-ledger.mts

# Candidate B — Carbone/DOCX (templates built with `docx`, carbone injection, LibreOffice PDF)
npx tsx spikes/report-designer-validation-spike-1/scripts/candidate-b-carbone-docx.mts

# Candidate C — pdfme (fixed-layout JSON templates, server generation)
npx tsx spikes/report-designer-validation-spike-1/scripts/candidate-c-pdfme.mts

# Candidate A — TipTap v2 + community pagination browser prototype
cd spikes/report-designer-validation-spike-1/tiptap-v2-prototype && npx vite --port 5199

# Utilities
npx tsx spikes/report-designer-validation-spike-1/scripts/count-pages.mts        # page counts
npx tsx spikes/report-designer-validation-spike-1/scripts/render-pdf-pages2.mts  # PDF pages → PNG
npx tsx spikes/report-designer-validation-spike-1/scripts/build-decision-matrix.mts
```

## Package versions and licenses tested

| Package | Version | License | Notes |
|---|---|---|---|
| carbone | 3.8.2 | CCL (Carbone Community License) | Free as embedded component of a value-added product; dynamic images = Enterprise v4 |
| @pdfme/generator/schemas/common | 6.1.12 | MIT | pdf-lib based; maintainer: RTL out of scope |
| docx | 9.7.1 | MIT | Used to build DOCX templates programmatically (simulates Word authoring) |
| @tiptap-pro/extension-pages | — | Proprietary (Tiptap subscription $49+/mo) | npm 404 without private-registry token — BLOCKED |
| tiptap-extension-pagination | 2.1.4 | ISC | Peer-dep @tiptap/core ^2.11.5 — incompatible with ERP TipTap 3.27.1 |
| @tiptap/core (prototype only) | 2.x | MIT | Isolated prototype only |
| pdf-to-img / @napi-rs/canvas | 4.x / 0.1.x | MIT | Evidence rendering only |
| Gotenberg | 8 (chromium + libreoffice up) | MIT | Existing dev container reused read-only |

## Evidence layout

```
evidence/
  executive-ledger/   html/ pdf/ preview/ candidate-d-results.json
  carbone-docx/       templates/ rendered-docx/ pdf/ candidate-b-results.json
  fixed-layout/       templates/ pdf/ candidate-c-results.json
  tiptap-pages/       4 screenshots + candidate-a-results.json
  comparisons/        pdf-pages/*.png (rasterized PDF pages)
  fixtures/           reconciliation-db-counts.json
  reports/            report_designer_validation_matrix.csv/.json, test manifest, evidence index
  page-counts.json
```

## Removal

Deleting `spikes/report-designer-validation-spike-1/` entirely has zero effect on production.
