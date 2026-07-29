# REPORT.DESIGNER.VALIDATION.SPIKE.1 — COMPLETION Evidence Index

Base path: `spikes/report-designer-validation-spike-1-completion/evidence/`
All hashes: `reports/completion_evidence_sha256.json`. Machine manifest: `reports/report_designer_completion_test_manifest.json`.

Runtime env: app `http://localhost:3000`, Supabase project `mmiefuieduzdiiwnqpie` (**PRODUCTION — read-only, no mutations**), Gotenberg `http://localhost:3100` (chromium + libreoffice up).

## Gap 1 — Live ERP Report Designer (Playwright/browser, sameer@algt.net)
| Artifact | Path |
|---|---|
| Dashboard after login | `live-erp/live-01-dashboard-after-login.png` |
| Template Studio landing (labeled "prototype") | `live-erp/live-02-template-studio-list.png` |
| Studio editor with blocks | `live-erp/live-03-studio-editor-loaded.png` |
| Field picker w/ sensitivity classes | `live-erp/live-04-field-picker-sensitivity.png` |
| Blocks + RTL mode + unsaved indicator | `live-erp/live-05-studio-rtl-blocks-unsaved.png` |

Menu path: **Reports → Template Studio** (`/admin/reports/template-studio`). 17 templates enumerated. Block palette: heading, paragraph, numbered clause, key/value, table, divider, spacer, two-columns. Field picker grouped by module with Public/Internal/Restricted/Confidential badges. Live preview renders through the canonical Executive Ledger HTML builder (`srcdoc`, 6520 bytes, no unresolved `{{tokens}}`). **RTL mode emits `<html dir="rtl">`** (correction to prior spike). Dirty-tracking + Save Draft present. **No save performed** (production DB).

## Gap 2 — Official TipTap Pages — BLOCKED
`registry.tiptap.dev` → HTTP 403 (invalid credentials); `registry.npmjs.org` → 404. No authorized token configured. Not scored as proven.

## Gap 3 — Carbone/DOCX
| Artifact | Path |
|---|---|
| DOCX intake security battery results | `security/docx-security-battery-results.json` |
| Synthetic hostile fixtures | `security/docx-fixtures/*.docx` |

GUI admin authoring + SUS = **BLOCKED** (Word installed, but no human participant; usability cannot be fabricated). Intake security: **8/8 threats detected** by the proposed guard set (guards not yet implemented in production).

## Gap 4 — pdfme visual Designer UI
| Artifact | Path |
|---|---|
| Designer canvas (drag/drop, toolbar, rulers) | `pdfme-designer/ui-screenshots/pdfme-designer-01-canvas.png` |
| Company B branding applied | `pdfme-designer/ui-screenshots/pdfme-designer-02-company-b.png` |
| Arabic card PDF (executed) | `pdfme-designer/pdf/designer-card-arabic.pdf` |
| **Arabic KNOCKOUT — rasterized** | `pdfme-designer/pages/designer-card-arabic-p1.png` |

Proven: drag/drop canvas, element palette, export JSON (1754 B), reopen, Company A/B branding switch, generate PDF (88 ms). **Arabic renders as disconnected boxes/tofu** — knockout for Arabic-bearing families.

## Gap 5 — Security & multi-company
| Artifact | Path |
|---|---|
| Studio injection battery (13 cases) | `security/studio-security-battery-results.json` |

13/13 vs production `src/lib/template-studio/validate.ts`. Server actions gated by `hasPermission(reports.manage)`; preview omits branding + protected assets. DB-level cross-company RLS proof = **BLOCKED** (single tenant, no-write).

## Gap 6 — Performance / bundle
| Artifact | Path |
|---|---|
| Gotenberg concurrency (1/5/10) | `performance/gotenberg-concurrency-results.json` |

Warm render 512 ms; 10 concurrent = 11.85 PDF/s, all succeeded. pdfme bundle: dist main 6.88 MB (2.33 MB gzip) + clawpdf worker 11.26 MB.

## Baseline verification (prior 28-PDF package)
| Artifact | Path |
|---|---|
| File manifest + SHA-256 | `baseline-verification/baseline-file-manifest-sha256.json` |
| Verification summary | `baseline-verification/baseline-verification-summary.json` |

All 28 prior PDFs open; 129 files hashed; page counts match `page-counts.json` (0 mismatches).

## Decision data
| Artifact | Path |
|---|---|
| Matrix JSON | `reports/report_designer_validation_matrix.json` |
| Matrix CSV | `reports/report_designer_validation_matrix.csv` |
| Test manifest | `reports/report_designer_completion_test_manifest.json` |
| Evidence hashes | `reports/completion_evidence_sha256.json` |
