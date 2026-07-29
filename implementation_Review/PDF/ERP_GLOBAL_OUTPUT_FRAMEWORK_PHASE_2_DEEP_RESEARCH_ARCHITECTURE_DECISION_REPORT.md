# ERP GLOBAL OUTPUT FRAMEWORK — PHASE 2
# Deep Research, Repository Audit and Architecture Decision Report

**Date:** 2026-07-26
**Phase:** ERP GLOBAL OUTPUT FRAMEWORK — PHASE 2 (investigation/planning only; nothing implemented)
**Prompt:** `ChatGPT/ERP_GLOBAL_OUTPUT_FRAMEWORK_PHASE_2_DEEP_RESEARCH_ARCHITECTURE_DECISION_AND_PLAN_UPDATE_CURSOR_PROMPT.md`
**Companion deliverables:**
- Plan v6: `implementation_Review/HR/HR_LETTERS_AND_CERTIFICATES_ENHANCEMENT_PLAN.md`
- Decision register: `implementation_Review/PDF/ERP_GLOBAL_OUTPUT_FRAMEWORK_PHASE_2_PLAN_CHANGELOG_AND_DECISION_REGISTER.md`

---

## 1. Executive decision

**Adopt ONE governed output framework with policy-controlled renderer adapters. The canonical template format for documents is HTML/CSS. The single renderer for OFFICIAL documents is headless Chromium via the already-deployed Gotenberg service (raw-HTML mode). The administrator's visual customization surface is a structured Template Studio built on TipTap (already installed, MIT) editing the letter body — wording, styles, colors, alignment, variables — inside a live A4 preview produced by the *same* server HTML builder that feeds Gotenberg. Puck is retired. pdfme is NOT adopted as the global engine (v5 decision reversed). jsPDF/ExcelJS/CSV remain the analytical/export adapters. Executive Ledger remains the document HTML builder and is promoted to the canonical official-document layout layer.**

The one-sentence rationale: the ERP already runs the only renderer that natively satisfies every hard global requirement — Arabic/RTL, flowing multi-page text, tables with repeating headers, print CSS, fonts, SVG/PNG, PDF/A — and the same engine (Chromium) renders both the browser preview and the final PDF, which structurally eliminates the Puck-era "designed X, printed Y" failure without adopting any new rendering technology.

## 2. Confidence and readiness gate

**Gate: `REQUIRES SPIKE`** — one focused, non-production spike (fixture data, placeholder stamp/signature) before implementation:

- **SPIKE-1 (blocking):** `gotenbergConvertHtml` raw-HTML mode E2E — one certificate with branding data-URIs, QR, page margins/`@page` CSS, header/footer behavior, and an Arabic-text smoke page. The function exists in the repo with **zero call sites** (VERIFIED — code), so raw-HTML mode has never actually been exercised against the deployed Railway Gotenberg.
- **SPIKE-2 (bundled into SPIKE-1):** preview-fidelity check — the same HTML rendered in an in-app iframe vs the Gotenberg PDF, rasterized and visually diffed at the page level.

Confidence: **HIGH** on architecture pattern and renderer decisions (all key claims verified against code, live DB, and cited external sources). **MEDIUM** on the Template Studio UX scope until Sameer sees the structured-editing model (wording/style/color, section reorder — but not free pixel drag) and confirms it satisfies his design requirement.

## 3. Files and live surfaces inspected

- Rules/SOT: `.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md`, `.cursor/rules/**` (incl. `pdf-architecture.mdc` claims — partially CONTRADICTED, see §8), `AGENTS.md`.
- Plans/reports: HR plan v5 + HR.LETTERS.0 report (both re-verified, several claims corrected below); PDF.1, Branding, Report Center/Designer, DMS closure reports (as consolidated by HR.LETTERS.0).
- Repository: full-repo output inventory (24 mechanisms, §7) and a Puck/TipTap forensic audit (imports, runtime paths, live-DB layout states) — executed 2026-07-26 by two dedicated audit agents; file:line citations retained in their findings and reproduced where material.
- Live database (`user-supabase`, read-only): `erp_report_templates` (19 rows, layout-state analysis), `erp_report_registry` (27 rows: 26 HR + 1 ADMIN), `erp_report_runs` (100), `erp_output_public_links` (13, all `valid`), `erp_generated_pdf_documents` (2), `erp_report_template_events` (26), `erp_report_schedules` (1).
- External web/GitHub research with source register (§30), all accessed 2026-07-26.

## 4. Corrected repository-wide output inventory

Twenty-four mechanisms were catalogued (IDs OUT-01…OUT-24). The compressed decision-relevant view:

| # | Mechanism | Consumers | Renderer | Preview = final? | Status | Migration consequence |
|---|---|---|---|---|---|---|
| OUT-01 | Shared table export menu (`ERPExportMenu`) | Admin, Master Data, DMS expiry, numbering, permissions… (~20 list pages) | client jsPDF / ExcelJS / CSV / print HTML | Yes (same client engines) | Working | **PRESERVE** (analytical/export classes) |
| OUT-02 | Report Center run-page export toolbar | Report Center (+ all HR reports) | same as OUT-01 (+ email via Graph) | Grid ≠ PDF layout; export engines consistent | Working | **PRESERVE** |
| OUT-03 | Report schedules email | Report Center | `generateAttachmentByType` + Graph | n/a | **Partial — no cron ever calls `processDueReportSchedules`** | ADAPT (worker) or hide (Q6) |
| OUT-04 | Gotenberg official PDF | HR employment letter only | Gotenberg **URL mode** ← `/print/*` | **No** (EL preview ≠ print-kit HTML) | Working when env OK | **ADAPT** → raw-HTML mode, shared builder |
| OUT-05/06 | Secure `/print/*` route + print kit | 3 templates (1 real + 2 demos) | React SSR HTML | is the Gotenberg source | Working | ADAPT (kept for record-context docs) |
| OUT-07/08 | Executive Ledger HTML + LetterPreviewDialog | 8 HR letter/form types | EL HTML + browser print / jsPDF fallback | EL preview ≈ browser print; ≠ Gotenberg | Working | **PROMOTE** — becomes canonical builder |
| OUT-09 | Public QR verification | issued letters | server RPC + `/verify/[token]` | n/a | Working (metadata-only links) | ADAPT (file-bind at issuance) |
| OUT-10 | Report Designer (Puck + TipTap) | template authoring only | layout JSON → EL (production renderer is Puck-free) | designer canvas ≠ EL output | Working but **unused in production** | **RETIRE** (§17) |
| OUT-11 | Branding assets + resolver | all branded outputs | storage signed URLs | n/a | Working | PRESERVE |
| OUT-13 | DMS expiry email attachments | DMS | server jsPDF/ExcelJS/CSV | same as download | Working | PRESERVE |
| OUT-14/23 | Email queue + `/api/internal/*` workers | global | Microsoft Graph | n/a | Working (ops-dependent) | PRESERVE |
| OUT-15/16 | Run/delivery/generation audit tables | Report Center + PDF | DB | n/a | Working | PRESERVE + extend (issuance) |
| OUT-17/18 | `sample-quotation-en`, `bilingual-sample-en-ar` | demos | print kit | n/a | Dormant | keep as testbeds |
| OUT-19 | `gotenbergConvertHtml` | **zero call sites** | — | — | Dead | **ACTIVATE** (core of the new render path) |
| OUT-20 | `ExecutiveLedgerPreviewDialog` | zero consumers | — | — | Dead | remove in cleanup |
| OUT-21 | Invoice/DN/WO/weighbridge/fleet outputs | — | — | — | **Planned stubs only** (field-registry placeholders) | future onboarding via framework |

Key corrections to prior documents:
- **There is no `/api/cron/*`** — workers are `/api/internal/process-email-queue` (Bearer `INTERNAL_API_SECRET`), `/api/internal/dms-ai-jobs/process` (Bearer `WORKER_SECRET`), plus one Supabase Edge scheduler. VERIFIED — code.
- **`pdf-lib` / `post-process.ts` / PDF-A tooling described in `.cursor/rules/pdf-architecture.mdc` do not exist in the repo.** DOCUMENTED ONLY → CONTRADICTED.
- The `xlsx` npm package is inbound OCR extraction only; user-facing Excel export is ExcelJS. VERIFIED — code.
- Arabic ground-work already exists for the jsPDF path: `bidi-shaper` + `@fontsource/noto-sans-arabic` + a bundled TTF. VERIFIED — code.

## 5. HR 26+ reconciliation and future HR expansion rule

Live registry: **27 rows** — 26 HR (4 flagged `is_letter_type`; 18 analytical; plus forms/cards) + 1 ADMIN (`ADMIN_PERMISSION_MATRIX`). VERIFIED — live DB. Run history concentrates on letters (50 experience-letter runs) and compliance reports. The 8 "letter cards" in the HR UI are a subset; the framework must treat the registry, not the cards, as the catalog.

**Expansion rule:** new HR outputs (and any module's outputs) enter through the registry + class-policy contract (§25) — never through a new bespoke pipeline. Employment Certificate and Experience Certificate remain **separate registered business documents** (identity ≠ technical reuse); the Q1 "merge" question is re-scoped to "shared template components, separate registry identities."

## 6. Current/future output taxonomy (20 classes → 7 policy classes)

The 20 prompt classes collapse into 7 renderer-policy classes without losing business identity:

| Policy class | Prompt classes | Renderer | Stored | Serial | QR | Approval |
|---|---|---|---|---|---|---|
| A. Official external documents | 1,2,3,4,5,18 | **Gotenberg raw-HTML** (server EL HTML) | ✔ immutable | ✔ | ✔ file-bound | per template policy |
| B. Multi-page flowing letters | 6 | same as A (Chromium flows natively) | ✔ | ✔ | policy | policy |
| C. Internal forms/checklists/clearance | 7,8 | same engine; watermark-free internal profile | ✔ | optional | ✘ | ✘ |
| D. Cards/badges/labels | 9 | same engine, fixed-size `@page`; (pdfme reconsidered ONLY here if HTML proves insufficient — gated) | ✔ | card no. | internal QR later | ✘ |
| E. Analytical reports/charts/mixed-company | 10,11,12 | existing jsPDF/ExcelJS/CSV/print (OUT-01/02) | run audit only | run ref | prohibited | ✘ |
| F. Exports/attachments/scheduled | 16,17 | ExcelJS/CSV/jsPDF attachments + Graph | ✘ | run ref | prohibited | ✘ |
| G. AI drafts | 20 | never rendered officially; text only | never | never | prohibited | human review inherent |

Classes 13–15 (operational/finance/fleet/weighbridge/future modules) are future **consumers of classes A–F**, onboarded via the module contract (§25) — confirmed as stubs only today (OUT-21). Class 14 (DMS cover sheets/packages) is a future class-C consumer.

## 7. Current mechanism map

Three PDF/print stacks coexist today (VERIFIED — code): (1) client jsPDF/ExcelJS/CSV tables; (2) Executive Ledger HTML + browser print (the de-facto letter path); (3) Gotenberg URL-mode via `/print/*` (one real template). The framework decision merges (2)+(3) into one official path (EL HTML rendered server-side → Gotenberg raw-HTML) and keeps (1) for analytical classes E/F.

## 8. Disputed-claim reconciliation

| Prior claim (source) | Finding | Evidence |
|---|---|---|
| "All live templates carry layout JSON and LetterPreviewDialog prefers Puck-rendered HTML" (plan v4 §0) | **CONTRADICTED.** 17/19 template rows have `{}` (empty) layouts; `templateHasVisualLayout()` returns false for `{}`; the visual iframe never fires for any published template. The de-facto production path is code-built EL from report rows. | VERIFIED — live DB + code (`production-renderer.ts:75–99`, `letter-preview-dialog.tsx:225–241`) |
| "Puck retirement requires a layout-snapshot migration first" (v4) | **Downgraded.** Only 2 meaningful layouts exist: ID 14 (archived) + ID 15 (draft, not issuable), both "To Whom It May Concern," identical size (7,307 chars). Retirement risk is limited to preserving their *wording*, not their runtime. | VERIFIED — live DB |
| "Puck is load-bearing at runtime" | **CONTRADICTED.** Zero `@puckeditor` imports outside the designer feature; production renderer is Puck-free; removing the package breaks only `/admin/reports/editor*` compile. | VERIFIED — code |
| "TipTap has consumers outside Report Designer" | **NOT FOUND.** All 8 `@tiptap/*` packages import only inside `report-designer`. Runtime rich-text rendering uses a custom `prosemirror-renderer.ts` without TipTap. | VERIFIED — code |
| "pdfme designer preview is byte-equivalent / true WYSIWYG / near-zero wrapper" (plan v5 §0.A) | **Unproven and partially wrong.** Fidelity is high *for supported schemas* but RTL/Arabic is explicitly unsupported (maintainer statement), `@pdfme/ui` is 22.3 MB unpacked, and ERP wrapper code (governance, allowlists, input mapping, asset injection) would not be "near-zero." | VERIFIED — official external sources (§30) |
| "5 render paths" (v4) | Confirmed and refined: 3 engines, 5+ user paths; full 24-mechanism map in §4. | VERIFIED — code |
| `pdf-architecture.mdc` describes pdf-lib post-processing | **CONTRADICTED** — not in repo. | VERIFIED — code |
| "Schedules broken" | Confirmed: schedule runner exists; no worker/cron invokes it. | VERIFIED — code + live DB |

## 9. External research methodology

Primary sources only for load-bearing facts (official GitHub repos, npm registry, vendor docs/pricing pages), all accessed 2026-07-26; GitHub issues/PRs used as evidence of real-world limitations (labeled); one blog/community source used only for orientation (labeled anecdotal). No version, star count, license, or capability below is from memory; every row in §10 cites the register in §30.

## 10. Cited candidate landscape (verified 2026-07-26)

| Candidate | Version / activity | License | Arabic/RTL | Designer for business admin | Server PDF | Key verified facts |
|---|---|---|---|---|---|---|
| **Gotenberg** (Chromium+LibreOffice API) | v8.34.0 (2026-06-12); 12,519★; monthly releases | MIT | ✔ native (Chromium) | ✘ (renderer only) | ✔ | Already deployed on Railway; native watermark/stamp routes, PDF/A + PDF/UA, header/footer HTML, SSRF-filtered LibreOffice fetches [S1,S2] |
| **pdfme** | v6.1.9 (Jun 2026); 4,431★; active | MIT | **✘ — maintainer: "RTL text support is not needed at this time"; open Arabic line-break issues** | ✔ built-in Designer | ✔ Node | `@pdfme/ui` 22.3 MB unpacked; positioned layout (fixed boxes); V4→V5 breaking schema change history; XSS fix in release notes [S3–S6] |
| **TipTap core** | v3.27.x; active | MIT (core) | ✔ (HTML/browser) | body-level rich text (headless, embeddable) | n/a (feeds HTML) | Already installed (8 packages); Pro/Platform paid features NOT required for this use [S7] |
| **GrapesJS** | 0.22.x; active | BSD-3 (core) | HTML-based | ✔ but document mode lives in the **commercial Studio SDK**; assembling print UX on the free core is a large build | n/a | Candidate only for future free-form badge/label design [S8,S9] |
| **Carbone CE** | v4/v5; active | **CCL** (source-available; SaaS restrictions; no derivative works) | ✔ via Word/LibreOffice | Word as designer | ✔ (needs LibreOffice service) | License is not OSI-open; conversion variance Word→LO [S10,S11] |
| **docxtemplater** | v3.69.3 (2026-07-23); very active (887k dl/wk) | MIT core; **image module paid (€500/yr)**; HTML module paid | ✔ via Word | Word as designer | ✔ (DOCX; PDF via LO/Gotenberg) | Stamps/signatures/QR need the paid image module; PDF requires a conversion hop [S12,S13] |
| **jsreport** | active | LGPL; **free ≤5 stored templates**; $395+/yr | via Chromium recipe | studio is developer-oriented | ✔ | A second server with its own template store — duplicates ERP registry/governance [S14,S15] |
| **@react-pdf/renderer** | active | MIT | **✘ native; open bidi/ligature bugs (#2900, #3406)** | ✘ | ✔ | Manual RTL workarounds only [S16,S17] |
| **SuperDoc** | v1.40-next (Jul 2026); 870★ | **AGPL-3.0** / commercial | DOCX | ✔ DOCX editor | partial | AGPL incompatible with proprietary ERP without a commercial license [S18] |
| **jsPDF (+autotable)** | in repo (v4.2.1) | MIT | partial (bidi-shaper + Noto Arabic already wired) | ✘ | ✔ client+server | Keep for analytical tables only [repo] |
| **Typst** | active | Apache-2.0 | good | ✘ (code/markup) | ✔ (Rust binary) | Rejected early: foreign toolchain, no admin designer, new binary dependency |
| **Paged.js** | low activity | MIT | ✔ (browser) | ✘ | via Chromium | Not needed: Gotenberg header/footer + `@page` CSS cover current requirements; revisit only for running headers on long flowing docs |
| **pdfmake** | active | MIT | known RTL/wrap issues | ✘ | ✔ | No advantage over existing jsPDF path |
| Hosted APIs (APITemplate, DocRaptor, …) | — | commercial | varies | varies | cloud | Rejected: employee PII residency + recurring cost + lock-in |

## 11. Candidates rejected early (with reasons)

Typst (toolchain/no designer), pdfmake (duplicate of jsPDF role), Paged.js (not required yet), react-pdf (RTL), SuperDoc (AGPL), jsreport (parallel server + template-count licensing), hosted APIs (PII residency), GrapesJS-as-primary (document mode is commercial; free core = big custom build), Carbone-as-primary (CCL restrictions + second conversion service; retained as future DOCX option), LibreOffice-DOCX-primary via docxtemplater (paid image module for the exact assets we must inject + fidelity hop; retained as future authority-form option — Gotenberg already bundles LibreOffice for DOCX→PDF if ever needed).

## 12. Finalist comparison

Three finalists as *official-document* architecture:

1. **HTML/CSS + Gotenberg (Chromium) + structured Template Studio (TipTap body)** — canonical HTML built server-side by the existing Executive Ledger layer; preview and final rendered by the same engine family.
2. **pdfme designer + generator** (plan v5 direction).
3. **DOCX mail-merge (docxtemplater/Carbone) + LibreOffice conversion**, Word as designer.

## 13. Weighted decision matrix

Weights defined before scoring; heaviest on the outcomes the prompt fixes as non-negotiable (global class fit, preview fidelity, security, multi-tenancy, migration). Scores 1–5.

| Criterion (weight) | 1. HTML+Gotenberg+Studio | 2. pdfme | 3. DOCX+LO |
|---|---|---|---|
| Fit across ALL output classes (10) | 5 | 2 | 3 |
| Preview-to-final fidelity (9) | 5 (same engine) | 4 (same engine, supported schemas only) | 2 (Word→LO shift) |
| Arabic/RTL + fonts (8) | 5 | 1 | 5 |
| Flowing multi-page (8) | 5 | 2 | 5 |
| Safe admin customization (8) | 4 (structured; no free pixel drag) | 5 (drag-drop) | 4 (Word familiar) |
| Simple end-user UX (7) | 5 | 5 | 4 |
| Security & server asset protection (9) | 5 (all assets stay server-side) | 4 | 3 (template files roundtrip) |
| Multi-company/tenant fit (7) | 5 | 4 | 4 |
| Template governance/versioning (7) | 5 (existing tables reused; HTML/JSON diffable) | 4 (JSON; breaking schema history) | 3 (binary DOCX) |
| Integration with current ERP (8) | 5 (all pieces exist) | 3 | 2 (new service/library) |
| Migration risk (7) | 5 (incremental) | 3 | 3 |
| Analytical report support (6) | 5 (unchanged adapters) | 1 | 2 |
| Maintainability (6) | 5 (zero new engines) | 3 | 3 |
| Testability/visual regression (5) | 5 (HTML fixtures + raster diff) | 4 | 3 |
| Performance/scale (5) | 4 (Chromium heavier per doc; Gotenberg queues) | 5 | 3 (LO conversion queue) |
| Dependency/bundle impact (5) | 5 (nothing new client-side) | 2 (22.3 MB UI pkg) | 4 |
| Maturity/maintenance (5) | 5 | 4 | 4 |
| License/total cost (5) | 5 (all MIT, already paid infra) | 5 | 3 (paid module / CCL) |
| Vendor lock-in (4) | 5 (HTML is portable) | 3 (template JSON) | 4 (DOCX portable) |
| Accessibility/archival (PDF/A) (4) | 5 (Gotenberg PDF/A+UA routes) | 2 | 4 |
| Future-module extensibility (7) | 5 | 3 | 3 |
| **Weighted total (max 700)** | **674** | **452** | **472** |

## 14. Sensitivity analysis

- Doubling the weight of "safe admin customization" (drag-drop desire) to 16: finalist 1 = 706, pdfme = 532 — **winner unchanged**.
- Zeroing Arabic/RTL entirely (English-only forever): finalist 1 = 634, pdfme = 444 — unchanged.
- The only scenario where pdfme wins is if fixed positioned layout, per-pixel drag-drop, is itself the top-weighted requirement AND Arabic, flowing text, analytical classes, and bundle cost are all near-zero weights — i.e., the badge/ID-card class in isolation. This is why pdfme survives as a *gated class-D option only*.
- Finalist 3 (DOCX) becomes competitive only if authority-mandated pre-printed Word forms become a dominant class; the framework's adapter contract allows adding it later without rework.

## 15. Recommended architecture

```
                    ┌────────────────────────────────────────────────────┐
                    │            GLOBAL OUTPUT FRAMEWORK                 │
Module code ──────▶ │ 1 Output Registry (erp_report_registry, module-    │
(HR, DMS, Finance…) │   agnostic + document_class + policy columns)      │
                    │ 2 Data contract: fetcher per output code           │
                    │   (permissions + redaction server-side)            │
                    │ 3 Template Registry (erp_report_templates:         │
                    │   structured body JSON + frame options; governed   │
                    │   draft→review→publish; variable allowlist)        │
                    │ 4 Branding resolver (erp_branding_assets,          │
                    │   versioned; stamp/signature server-only)          │
                    │ 5 Class-policy engine (§6 matrix, DB-driven)       │
                    │ 6 Issuance coordinator (idempotent lifecycle:      │
                    │   pending→rendering→uploaded→issued; §21)          │
                    └───────────────┬────────────────────────────────────┘
                                    │ canonical HTML (Executive Ledger builder,
                                    │ server-side, EN + future AR/RTL)
              ┌─────────────────────┼──────────────────────────┐
   Preview    ▼          Official   ▼                Analytical▼ / exports
  iframe srcDoc         Gotenberg raw-HTML          jsPDF / ExcelJS / CSV
  (Chromium, watermarked)  (Chromium) → storage       (existing OUT-01/02)
              └───── SAME ENGINE ───┘                + Graph email adapters
```

Every boundary the prompt requires is defined: registry (module-agnostic), template registry (existing table, new structured-body columns), module onboarding contract (§25), fetcher interface (existing `REPORT_FETCHERS` generalized), renderer adapter contract (`render(html|table, classPolicy) → bytes`), class-policy engine (§6), branding resolver (existing), permission/redaction layer (existing, server-side), preview path (same HTML, watermarked), issuance coordinator (§21), numbering (existing `global_numbering_rules`, wired at issuance), QR (§21), storage (`erp-generated-pdfs`, non-overwritable), immutable history (`erp_generated_pdf_documents`, ~70% schema-ready), approval/signing (class policy + `reports.sign`), email/delivery (existing queue/Graph), audit (runs/deliveries/issuances), retry/reconciliation (lifecycle states + orphan sweep), public verification (existing `/verify` re-anchored to file hash), QA (§27), migration layer (§26).

**Same renderer for design, preview, final?** Classes A–D: yes — Chromium for the admin's live preview, the user's watermarked preview, and the final PDF; the Template Studio edits the same HTML the renderer consumes. Classes E/F: preview is the on-screen grid; export engines are consistent with each other (existing behavior, unchanged). This split is honest: analytical tables are data products, not designed documents.

**Why not one universal renderer?** Chromium *could* render analytical exports, but replacing the working client-side jsPDF/Excel path would add server load and migration risk for zero user benefit; Excel/CSV are not PDF problems at all. The framework prevents inconsistency because module developers register a `document_class` and the policy engine picks the adapter — users never see a renderer name.

## 16–19. Current-tool decisions

| Tool | Decision |
|---|---|
| **Puck (`@puckeditor/core`)** | **Retire** (§17 detail). Designer UI removed after wording snapshot of templates 14/15; production renderer removed in the same phase (it renders nothing published — VERIFIED). No destructive DB change: template rows, layout JSON, events, history all retained. |
| **TipTap (8 pkgs)** | **Keep and repurpose** as the Template Studio body editor (wording/style/color/alignment/variable chips). MIT core suffices; `prosemirror-renderer.ts` (Puck-independent, already sanitizing) remains the render path. |
| **pdfme** | **Not adopted** as the global engine (v5 reversed; evidence §8/§10). Retained on a watch-list solely for class D (badges/ID cards) IF the HTML fixed-size spike disappoints — gated, not planned. |
| **Gotenberg** | **Keep and promote** — becomes the single official renderer via raw-HTML mode (activating the existing dead `gotenbergConvertHtml`). URL-mode `/print/*` + token infra retained for record-context documents. |
| **Executive Ledger** | **Keep and promote** — the canonical HTML document builder for classes A–D; extended with template-driven body content and (future) RTL layout profile. |
| **jsPDF/jspdf-autotable/ExcelJS/CSV** | **Keep unchanged** for classes E/F (analytical/exports/attachments). |
| **`/print/*` + PDF token infra** | Keep (dormant-capable); tokens should move to single-use at issuance hardening. |
| **Report schedules** | Build the missing worker on `/api/internal/*` pattern or hide the UI (owner decision Q6) — no dead UI to production. |

## 17. Current Report Editor decision (full answers)

- **Used in production?** No. Zero published templates with meaningful layouts; the visual path never fires (VERIFIED — live DB + code).
- **Capability lost?** Visual block authoring UI only. Today's letters unaffected (they render from code-built EL).
- **Artifacts that must remain:** all `erp_report_templates` rows, layout JSON columns, `erp_report_template_events`, run/QR history — nothing deleted.
- **The two meaningful designs (IDs 14, 15):** wording/structure re-authored in the Template Studio during RETIRE.0; JSON stays in DB as archive.
- **Template 15:** draft, `security_review_status='passed'`, not issuable as visual production; snapshot + archive.
- **TipTap elsewhere?** No (VERIFIED) — but TipTap is *kept* for the Studio.
- **Published templates / fallback output:** unaffected; fallback IS the current output.
- **What replaces visual design?** The structured Template Studio (§24): visual wording/style/color/section-order editing in a true A4 live preview rendered by the final engine. Free-pixel drag is deliberately NOT offered for official letters — that is the failure mode that produced Puck. If free-form design becomes a hard requirement for badges, GrapesJS/pdfme are the gated candidates for that class only.
- **Faithful to approved template?** Yes — the preview and the issued PDF are produced from the same server HTML.
- **Migration/rollback:** designer routes/packages removed behind a feature flag commit; rollback = revert commit (no DB migration involved in removal).
- **Readiness proof before removal:** RETIRE.0 checklist — wording snapshots re-authored + Studio published equivalents + visual-diff pass.

## 18. `pdfme` decision — see §8/§10/§16. Accepted facts: MIT, active, real designer, Node generation, JSON templates. Disqualifying facts for global use: no RTL/Arabic (explicit), positioned-only layout, 22.3 MB designer package, breaking template-schema history, duplicate engine next to an already-deployed Chromium renderer. Status: **rejected for global; gated watch-list for class D only.**

## 19. Gotenberg/EL/jsPDF decisions — see table §16.

## 20. Global security and RLS model

Carried forward intact from plan v4/v5 (verified there, re-confirmed): explicit `storage.objects` policies for the 4 buckets; company scoping on `erp_generated_pdf_documents`/`erp_output_public_links`/`erp_report_runs`; stamps/signatures server-only (data-URI injection at render; never client-fetched without `reports.sign`); `getAuthContext()`+`hasPermission()`+Zod in every action; BIGINT identity PKs; RLS enabled/forced; single-use print tokens; rotate hardcoded worker bearer secrets; template-injection defense = variable allowlist + sanitizing ProseMirror renderer (already exists) + governance security review re-scoped to structured-body validation (much smaller surface than arbitrary Puck JSON). Public verification discloses policy-approved metadata only; salary documents never publicly downloadable.

## 21. Issuance/storage/QR lifecycle (recoverable, non-atomic-aware)

`pending → rendering → uploaded → issued`, with `failed_retryable` at every arrow and a reconciliation sweep for orphans:

1. create issuance row (idempotency key = output code + record id + template version + data hash) + inactive verification token;
2. render token URL into HTML → Gotenberg → bytes;
3. upload to unique non-overwritable path; compute sha256;
4. finalize issuance row (hash, template id+version, branding asset versions, renderer version = Gotenberg/Chromium versions from response, data snapshot, serial from `global_numbering_rules`);
5. **activate** the public link last (single UPDATE; no circular FKs — link table holds `generated_pdf_document_id`, PDF table does not point back).
Failure before (5) = token never activates → no orphan valid QR. Existing 13 metadata-only links: inventory kept; owner decision Q4 (cancel+reissue circulating ones) stands.

## 22. Global branding & multi-company model

Unchanged from v4 (verified working): `erp_branding_assets` versioned per company; auto-resolve by `owner_company_id`; explicit authorized choice for mixed-company (class E) outputs; exact asset versions captured on issuance; unlimited companies = rows, not code.

## 23. Simple user experience

Unchanged from v5 §5 and re-affirmed: one Letters & Forms tab per employee/record, class-labeled catalog, one primary action per type, automatic branding, pre-generation validation, watermarked previews, issued-history with states, no renderer/technical choices ever shown to normal users. Report Center stays analytical.

## 24. Administrator customization experience — the Template Studio

What an authorized admin (`reports.manage`) **can** change per template, all with a live A4 preview rendered by the final engine:
- letter **wording** (rich text with variable chips from the allowlist: `{{employee_full_name}}` …);
- text **style**: font family (from approved set), size, weight, **color**, alignment, spacing;
- **section order** (drag to reorder body sections/clauses — list-level drag-and-drop, not pixel positioning);
- clause library reuse; per-template toggles already in the schema (`show_logo/stamp/signatory/watermark`, orientation, page size);
- language mode (EN now; AR/RTL when enabled).

What they **cannot** change: the branded frame geometry (header/footer/margins/stamp/QR positions — company-level, code/policy-controlled), sensitive-variable exposure (allowlist), storage/QR/serial policy (class policy), and anything on a published version without going through draft→review→publish.

This is the "structured configuration + controlled wording/clause editing" hybrid from the prompt's option list — chosen because the evidence shows free-form design was built once (Puck), produced zero production designs in 19 templates, and caused the fidelity failure. The honest trade-off vs. Sameer's literal "drag and drop everything": positioning is frame-governed; wording/style/color/order are fully visual. **If after the Studio demo free-pixel design is still required for a class, GrapesJS (BSD core) or pdfme (class D) are the gated add-ons — on top of, not instead of, this framework.**

## 25. Future-module onboarding contract

A new module (e.g., Weighbridge) adds an output by: (1) registry row (`module_code`, `output_code`, `document_class`, formats, permissions map); (2) a typed fetcher implementing `OutputDataProvider` (server action, `getAuthContext`+`hasPermission`+redaction); (3) permission seeds; (4) a template (Studio-authored body + frame options) OR a code print-kit template for record-context docs; (5) branding policy = automatic by `owner_company_id` unless class E; (6) class policy row (storage/serial/QR/approval); (7) fixture + visual baseline + RLS tests per §27 checklist; (8) menu entry. **No renderer code, no new pipeline.** This contract becomes `.cursor/rules/erp-output-framework-standard.mdc` at implementation time.

## 26. Migration & historical preservation

Incremental, non-destructive: HR letters adopt the coordinator first (v6 phases), OUT-01/02 untouched, `/print/*` retained, all existing tables/rows/PDFs/links preserved, Puck removal is code-only and flag-gated, the 2 stored PDFs get `template_id` backfilled, 13 QR links handled per Q4. No big-bang.

## 27. QA/UAT strategy

Fixture-based deterministic employee/company data; per-class golden HTML + rasterized page visual-diff baselines (Playwright already in repo); Gotenberg E2E in CI via docker service; structural checks (pdfinfo/pdffonts, sha256 determinism *qualified*: Chromium PDFs embed timestamps — normalize metadata before hashing); permission/redaction/RLS/cross-company suites; issuance lifecycle tests (duplicate-click, partial failure between upload and finalize, orphan sweep); QR activation/revocation/expiry/disclosure; stamp/signature authorization; email attachments; page margins/overflow/long-name cases; multi-page tables with repeating `thead`; Arabic smoke test (render + font embedding) even while UI is EN-only; PDF/A claim only after validation via Gotenberg's PDF/A route + external validator.

## 28. Risks, unknowns, spikes, stop conditions

| Risk | Mitigation / stop condition |
|---|---|
| Raw-HTML Gotenberg path never exercised | SPIKE-1 gates everything; stop if fidelity/fonts/margins fail and fall back to URL-mode `/print/*` (already working) |
| Sameer rejects structured Studio (wants free pixel drag) | Demo at end of Studio phase; gated add-on path (GrapesJS/pdfme class-D) pre-identified; stop = do not build a second Puck |
| Chromium per-doc cost under concurrency | Gotenberg queues; load test in QA phase; scale Railway service |
| PDF determinism for checksums | normalize metadata (Gotenberg supports metadata write) before hashing; documented in QA |
| Arabic full support later | HTML/CSS makes it a template/profile task, not an engine swap; smoke test kept green from day one |
| Schedules left dead | Q6 forced decision in roadmap; no silent carry |

## 29. Recommended phase roadmap

See plan v6 §4 (single source of truth): `OUTPUT.SPIKE.1` → `OUTPUT.1` (security/data-model foundation, absorbs HR.LETTERS.1) → `OUTPUT.2` (renderer/template foundation + issuance coordinator, absorbs HR.LETTERS.2) → `OUTPUT.3` (Template Studio) → `OUTPUT.4` (HR first-adopter UX = HR.LETTERS.3) → `OUTPUT.5` (security/runtime/visual UAT = HR.LETTERS.4) → `REPORT.DESIGNER.RETIRE.0/1` (parallel, approval-gated) → `OUTPUT.6` (schedules decision + Report Center tidy) → future-module onboarding standard. Each phase in the plan carries objective/scope/dependencies/allowed-excluded changes/deliverables/DB+security impact/tests/acceptance/rollback/stop conditions.

## 30. Source/citation register (all accessed 2026-07-26)

| # | Source |
|---|---|
| S1 | github.com/gotenberg/gotenberg — v8.34.0 (2026-06-12), 12,519★, MIT, release notes (watermark routes, PDF/A/UA, SSRF proxy) |
| S2 | gotenberg.dev — docs: Chromium/LibreOffice routes, image variants, header/footer, PDF/A |
| S3 | github.com/pdfme/pdfme — 4,431★, MIT, v6 line; README; releases (V5 breaking schema change; XSS fix #1117) |
| S4 | registry.npmjs.org/@pdfme/ui — 6.1.9 (2026-06-21), 22.3 MB unpacked, 62k dl/wk |
| S5 | github.com/pdfme/pdfme PR #1300 — maintainer: "RTL text support is not needed at this time, as the existing UI doesn't support RTL either" |
| S6 | github.com/pdfme/pdfme issue #398 / PR #417 — Arabic line-break overlap defects and workaround |
| S7 | tiptap.dev (product/pricing/open-source pages) + github.com/ueberdosis/tiptap README — editor core MIT; Pro/Platform paid |
| S8 | npmjs.com/package/grapesjs — BSD-3, 283.8k dl/wk; github.com/GrapesJS/grapesjs |
| S9 | grapesjs.com/blog/release-document-builder + app.grapesjs.com/docs-sdk — Document mode is Studio SDK (commercial, free tier) |
| S10 | github.com/carboneio/carbone + LICENSE.md — Carbone Community License terms (SaaS prohibition, no derivative works) |
| S11 | carbone.io docs — LibreOffice requirement, docker editions |
| S12 | npmjs.com/package/docxtemplater — v3.69.3 (2026-07-23), MIT core, 887k dl/wk |
| S13 | docxtemplater.com/pricing + /faq — paid modules (image, HTML…) €500/module/yr; PRO €1,250/yr |
| S14 | github.com/jsreport/jsreport — LGPL-3.0, 1,312★; README free-tier terms |
| S15 | jsreport.net/buy + /learn/faq — free ≤5 stored templates; $395/yr single server |
| S16 | github.com/diegomura/react-pdf issues #2900, #3076 — RTL/bidi open issues (2024→2026) |
| S17 | github.com/diegomura/react-pdf issue #3406 / PR #3407 — Arabic ligature bidi defects (2026) |
| S18 | github.com/Harbour-Enterprises/superdoc + docs.superdoc.dev/resources/license — AGPL-3.0/commercial dual license |
| S19 | dev.to article on react-pdf Arabic workarounds — **anecdotal/secondary**, used for orientation only |

## 31. Final gate

**`REQUIRES SPIKE`** — `OUTPUT.SPIKE.1` (Gotenberg raw-HTML fidelity + branding data-URI + QR + Arabic smoke + preview visual-diff, fixtures only) is the single blocking proof before `OUTPUT.1` implementation approval. Everything else is `READY FOR PLAN APPROVAL` pending Sameer's answers to the open decisions listed in plan v6 §8.

*End of Phase 2 report. Planning only — nothing was implemented, installed, removed, migrated, or generated.*
