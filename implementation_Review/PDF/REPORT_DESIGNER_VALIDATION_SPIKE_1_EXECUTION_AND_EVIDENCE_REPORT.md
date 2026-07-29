# REPORT.DESIGNER.VALIDATION.SPIKE.1 — Execution and Evidence Report

**Date:** 2026-07-26
**Worktree:** commit `31654f14e7e936e80bdb301a0a00727e0068bc1a`, branch `main`, 764 uncommitted user changes (preserved, untouched)
**Spike workspace:** `spikes/report-designer-validation-spike-1/` (isolated, disposable, not imported by production)
**Final status:** `SPIKE PASSED — ARCHITECTURE RECOMMENDATION READY FOR HUMAN REVIEW`
**Report Designer acceptance:** REMAINS **NOT ACCEPTED** (unchanged; this spike does not accept it)

---

## 1. Executive Verdict

Four candidate architectures were prototyped hands-on with the same synthetic benchmark pack
(two fixture companies, three fixture employees, 120-row dataset, Arabic/bilingual content,
placeholder QR/stamp/signature). 28 real PDFs and 10 preview PNGs were generated, page-level
rasterizations were inspected, and all matrices were computed reproducibly.

**The evidence supports a governed hybrid:** keep **Executive Ledger + Gotenberg/Chromium as the
single official renderer for every document family** (it won every matrix, every mode, and every
sensitivity scenario), keep the **enhanced Template Studio (TipTap v3 structured blocks → Executive
Ledger)** as the admin authoring surface for flowing letters, keep analytical reports and
fixed-layout cards **code-first**, and treat **Carbone/DOCX as an optional, licensing-clean pilot**
for Word-based admin authoring — the only candidate that proved real admin-tool authoring with
correct Arabic output.

- **TipTap Pages (official):** BLOCKED — paid subscription + private registry; cannot be validated without purchase.
- **pdfme:** knocked out for Arabic-bearing and flowing documents by direct evidence; viable only for English-only fixed assets.
- No production implementation, migration, template mutation, QR action or Puck deletion occurred.

---

## 2. Scope, Authorization and Environment

- Boundaries honored: read-only repo/DB inspection; disposable spike code; candidate packages installed **only** in `spikes/report-designer-validation-spike-1/node_modules` (plus an isolated `tiptap-v2-prototype` subfolder); synthetic fixtures only; no secrets printed.
- Gotenberg: `http://localhost:3100`, health `{chromium: up, libreoffice: up}` (both modules exercised).
- Database: live Supabase via `user-supabase`, **SELECT-only** reconciliation queries.
- The integrated ERP admin-UI UX walkthrough was not repeated; the prior audit's hands-on Template Studio findings (REPORT_DESIGNER_DEEP_UX_ARCHITECTURE_AND_OUTPUT_QUALITY_AUDIT.md) remain the Candidate A/D "current authoring UX" baseline.

## 3. Reconciled Contradictions (mandatory pre-test gate)

| Prior claim | Live evidence (2026-07-26, read-only) | Resolution |
|---|---|---|
| "4 published templates still reference Puck" | TRUE by label — but **all 4 published 'puck' templates (ids 11, 12, 13, 19) contain EMPTY `{}` body layouts** (md5 `99914b93…`, 2 bytes). Only 2 of 18 templates hold real Puck JSON: ids 14 (archived) + 15 (draft), identical 7,307-byte layout ("To Whom It May Concern"). | Orphaning is a **labeling problem**, not a content-migration problem. Real Puck content at risk = 1 document design. |
| `visual_layout_json` column | **Does not exist** anywhere in the live schema. Actual columns: `body_layout_json`, `header_layout_json`, `footer_layout_json` (+ `body_schema_json`, `studio_schema_version`). | Prior reports used a stale column name. |
| "28 registered outputs" | `erp_report_registry` = 28 rows (A=1, B=4, C=3, D=1, E=19). | CONFIRMED. |
| Issued PDF counts vs registry | `erp_generated_pdf_documents` = **1** issued row. | Not a contradiction: Sameer requested and approved a full issuance clean-slate (documents, QR links, sequence reset) earlier in the program. |
| "13 existing QR links" (task prompt) | `erp_output_public_links` = **1 valid** link. | Prompt figure predates the approved clean-slate. The 1 live link was not touched. |
| Field registry "28 vs 32" | `REPORT_FIELD_REGISTRY` = **57 fields across 12 module groups** (corrected in prior audit; old figures were earlier binding-path snapshots). | RESOLVED. |
| "Editor and final PDF automatically pixel-identical" | Never true for any dynamic editor. Only Candidate D has proven parity (same HTML → same Chromium for preview and PDF). | Claim rejected; parity must be proven per path. |
| Single-company testing as multi-company proof | This spike rendered every cross-company test with **two** fixture companies (D8A/D8B, B8A/B8B, C8A/C8B). | Addressed at adapter level; DB-level RLS proof remains BLOCKED inside isolated prototypes. |

## 4. Candidates Actually Run

| Candidate | Exact versions | Pipeline exercised |
|---|---|---|
| A | `tiptap-extension-pagination@2.1.4` (ISC) on `@tiptap/core@2.x` in an isolated Vite prototype; official `@tiptap-pro/extension-pages` install attempt → **npm 404** | Browser editor pagination only (no PDF path exists in this candidate) |
| B | `carbone@3.8.2` (CCL) + `docx@9.7.1` → Gotenberg **/forms/libreoffice/convert** | DOCX template → data injection → LibreOffice PDF |
| C | `@pdfme/generator@6.1.12`, `@pdfme/schemas@6.1.12`, `@pdfme/common@6.1.12` (MIT) | JSON template → server-side pdf-lib generation |
| D | Production `renderExecutiveLedgerHtml` (read-only import) → Gotenberg **/forms/chromium/convert/html** | Canonical HTML → Chromium PDF + Chromium screenshot previews |

## 5. Benchmark Results (8 mandatory documents)

See machine-readable outcome grid: `spikes/report-designer-validation-spike-1/evidence/reports/report_designer_test_manifest.json`.

Summary: **D = 10/10 PROVEN** (incl. both salary variants and both cross-company outputs) ·
**B = 9/9 PROVEN** (with material constraints) · **C = 9/9 generated but 2 knockout-quality failures** ·
**A = editor-only partial coverage, no PDF path**.

Notable page counts: D4 letter = 4p, D5 report = 10p landscape, B4 = 4p, B5 = 11p, C5 = 4p (auto-paginated table), C4 = 1p (**overflow failure**), D7/C7 cards = 2 faces at exact CR80 size.

## 6. Fidelity Findings

- **D:** Preview PNG and final PDF come from the same HTML and the same Chromium — parity PROVEN on all 10 outputs. This is the only candidate with structural preview/PDF identity.
- **B:** Rendered DOCX vs LibreOffice PDF is consistent, but **font substitution** occurs (Liberation serif observed instead of Word defaults). Word-screen vs final PDF requires a per-template fidelity gate; brand fonts must be installed in the converter container.
- **C:** Designer/preview/generator share one JSON (structural consistency), but the generated PDFs show a real defect: **standalone text fields render hairline-faint** with the embedded Noto Sans Arabic fallback font — confirmed identical across three independent rasterizers (pdfjs in-browser, pdfjs+napi-canvas, pdf-to-img), so it is in the PDF itself, not the viewer. Table-cell text renders normally. Root cause not isolated in-spike.
- **A:** The community pagination extension paginates the **editor view only**; there is no linked PDF exporter, so preview/PDF parity is architecturally unresolved in this candidate.

## 7. Arabic / RTL Findings (mandatory gate)

| Candidate | Verdict | Evidence |
|---|---|---|
| D | **PASS** — shaped, joined Arabic; full RTL document direction; Arabic-Indic numerals; embedded WOFF2 fonts; QR label in Arabic. Minor: LTR runs inside RTL sentences need bidi isolation (`D3b` shows "01 June 2021" reordered). | `comparisons/pdf-pages/D2-p1.png`, `D3b-p1.png`, `D5-p2.png` |
| B | **PASS** — Arabic shaped and joined correctly through LibreOffice; RTL paragraphs right-aligned; Arabic in table cells correct. Font substitution caveat. | `B2-p1.png`, `B5-p2.png` |
| C | **FAIL (knockout)** — standalone Arabic text broken/faint; bidi punctuation mirrored on ID card; maintainer statement (pdfme PR #1300, Jan 2026): "RTL text support is not needed at this time, as the existing UI doesn't support RTL either." | `C2-p1.png`, `C7-p1.png` + upstream refs |
| A | **FAIL as-default** — browser shapes Arabic, but `dir="rtl"` is stripped by the StarterKit schema; Arabic paragraph rendered LTR (computed direction `ltr`). Fixable only with custom direction extensions (same gap as production Studio). | `tiptap-pages/04-…png` + CDP measurement |

## 8. Pagination and Table Findings

- **D:** repeating `<thead>` on all 10 report pages, totals after table end, landscape, manual/auto break control, no footer collisions — PROVEN.
- **B:** Word engine pagination with `tableHeader: true` repeating rows via LibreOffice, manual PageBreak honored, 11-page loop table — PROVEN.
- **C:** table schema auto-paginates (120 rows → 4 pages) **but does not repeat header rows** on continuation pages; standalone text has **no reflow** (C4 knockout).
- **A:** page boundaries render, but **no intra-paragraph splitting** (whole paragraphs move to the next page leaving large gaps) and **initial content is not paginated until the first edit transaction** — both PROVEN defects of the community extension.

## 9. Field / Governance Integration Findings

- D consumes the governed field pipeline natively (57-field registry, resolvers, sensitivity classes, zero-unresolved-tokens gate) — it is the framework.
- B: Carbone markers (`{d.x}`, `{d.rows[i]}`) map cleanly onto a registry-generated data contract; unresolved markers survive as literal braces in output → a **post-render unresolved-token scan is required** before issuance (same gate as today).
- C: pdfme inputs are named fields — registry mapping trivial; templates are JSON (versionable, hashable, validatable).
- A: field insertion/searchable picker exists only in our own Studio code; nothing new was gained from the candidate itself.

## 10. Multi-Company Findings

Same template/data shape rendered per company for B, C, D: no Company A asset appeared in any
Company B output (visual inspection of `*8A` vs `*8B` pages). Carbone community **cannot inject
per-company logo images from one template** (Enterprise v4 feature) — text-only branding proven;
one template per company or server-side image preprocessing is required. Database-level RLS proof
inside the isolated prototypes: **BLOCKED by design** (no prototype DB access); live RLS remains
governed by the existing framework, untouched.

## 11. Security Findings (assessment)

- **B (DOCX):** attack surface = malicious DOCX (macros, zip bombs), template expression abuse. Mitigations: admin-only upload permission, structural validation before storage, macro stripping/rejection (`.docm` refusal), conversion inside the already-sandboxed Gotenberg container, size/time limits. Carbone injection is data-only (no code execution in community markers as used).
- **C (pdfme):** pure-JS server generation, JSON schema fully validatable — smallest converter attack surface; MIT supply chain healthy.
- **D:** existing hardened path (HTML escaping, safe-CSS allowlists, protected server-side asset injection, private storage, hashing) — unchanged.
- **A:** editor-side only; ProseMirror JSON must continue through the existing server sanitizer/validator (unchanged posture). The React 19 Flight serialization bug already fixed in Studio (`JSON.stringify` boundary) remains the correct pattern.
- All candidates: protected stamp/signature assets were **never** loaded into any browser-side prototype — placeholders only.

## 12. Performance Findings (local, median-of-runs, dev machine + dev Gotenberg)

| Path | Injection/render | PDF conversion | Total typical |
|---|---|---|---|
| D — EL + Chromium | <1 ms HTML build | 234–842 ms | ~0.3–0.9 s |
| B — Carbone + LibreOffice | 8–23 ms | 208–736 ms | ~0.25–0.75 s |
| C — pdfme in-process | — | 34–270 ms | ~0.05–0.3 s |
| A — editor only | n/a | n/a | n/a |

Local estimates, not production-representative; concurrency behavior was validated for the existing
framework in WP9 (unchanged). Browser bundle: no candidate was added to any production route, so
production bundle impact = 0 in this spike; pdfme designer (~1 MB+ class) and TipTap Pages sizes
remain unmeasured (**NOT TESTED**) and must be lazy-loaded behind admin routes if ever adopted.

## 13. Failures and Blockers

1. Official TipTap Pages — BLOCKED (subscription + private registry).
2. pdfme Arabic + flowing text — FAILED (knockouts, §7/§8).
3. pdfme hairline-text defect with the tested font configuration — FAILED as configured, root cause not isolated.
4. Real-admin Word authoring session for Carbone — BLOCKED (no human participant); simulated programmatically.
5. pdfme drag-and-drop Designer UI session — NOT TESTED (generator only).
6. DB-level RLS proof inside prototypes — BLOCKED by isolation design.
7. Human SUS/user-research scores — not collected; all UX judgments are expert-heuristic.

## 14. What Remains Unproven

- That business admins can produce a *publishable-quality* bilingual letter in Word/Carbone without developer help (pilot with a real admin required).
- Official TipTap Pages capability set (all vendor claims remain DOCUMENTATION ONLY).
- pdfme Designer UI usability and its bundle impact.
- Production-scale conversion throughput for the LibreOffice path.

## 15. Evidence Index

Full index: `spikes/report-designer-validation-spike-1/evidence/reports/report_designer_evidence_index.md`
Machine-readable manifest: `…/reports/report_designer_test_manifest.json` · Matrices: `…/reports/report_designer_validation_matrix.{csv,json}`
Spike README (how to re-run everything): `spikes/report-designer-validation-spike-1/README.md`
