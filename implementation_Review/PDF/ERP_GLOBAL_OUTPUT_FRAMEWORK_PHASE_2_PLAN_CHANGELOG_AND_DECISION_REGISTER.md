# ERP GLOBAL OUTPUT FRAMEWORK — PHASE 2
# Plan Changelog and Decision Register

**Date:** 2026-07-26 · **Plan updated:** v5 → **v6** (`implementation_Review/HR/HR_LETTERS_AND_CERTIFICATES_ENHANCEMENT_PLAN.md` — file name retained, now the GLOBAL planning source of truth)
**Evidence report:** `implementation_Review/PDF/ERP_GLOBAL_OUTPUT_FRAMEWORK_PHASE_2_DEEP_RESEARCH_ARCHITECTURE_DECISION_REPORT.md`
**File renames:** none. New files: this register + the Phase 2 report. Nothing implemented.

Legend: **KEEP** = prior assumption confirmed · **CHANGE** = corrected/amended · **REJECT** = reversed · **OWNER** = requires Sameer decision · **SPIKE** = requires proof before adoption.

| # | Prior assumption (source) | Evidence found (label) | Decision | Plan sections changed | Architectural consequence | Unresolved owner decision | Spike? |
|---|---|---|---|---|---|---|---|
| 1 | Unify around one governed orchestration + adapters (v2/v4) | Confirmed across full repo inventory (24 mechanisms) — VERIFIED code | **KEEP** | v6 §1.2 | Framework pattern is final | — | No |
| 2 | "All live templates carry Puck layout JSON; LetterPreviewDialog prefers Puck HTML; Puck is load-bearing" (v4 §0) | 17/19 layouts are `{}`; `templateHasVisualLayout()` rejects `{}`; visual path fires for zero published templates; production renderer Puck-free — VERIFIED live DB + code | **CHANGE** (claim was wrong) | v6 §0, §1.4 | Puck retirement risk downgraded from "layout migration" to "re-author 2 wordings"; RETIRE simplified | Q7 (discard drafts after snapshot) | No |
| 3 | "Retire Puck, replace with code-first only" (v3) | Visual design remains a real business requirement (Sameer, v5); code-first alone fails it — user statement + Phase 2 UX analysis | **CHANGE** | v6 §1.6 | Structured Template Studio (TipTap) replaces both Puck and code-first-only | Q11 (accept structured model) | No |
| 4 | "Adopt pdfme as visual designer AND official renderer" (v5 §0.A) | pdfme: MIT, active, real designer (VERIFIED external) — but NO RTL/Arabic (maintainer statement PR #1300; issues #398/#417), positioned-layout only, `@pdfme/ui` 22.3 MB, V4→V5 breaking schema history; duplicates an engine already deployed (Gotenberg/Chromium) that natively covers Arabic/flow/tables/PDF-A — VERIFIED official external sources | **REJECT** (reversed) | v6 §0, §1.3, §6 | No new engine; pdfme demoted to gated class-D (badge) watch-list only; v5 spike (Q10-v5) cancelled | — | Only if class-D HTML spike fails |
| 5 | "pdfme = true WYSIWYG / byte-equivalent / near-zero wrapper / four small packages" (v5 wording) | Unproven; partially false (bundle size, wrapper scope) — VERIFIED external | **REJECT** wording | v6 §0 | Precision rule: no fidelity claims without proof (constraint 11) | — | — |
| 6 | Gotenberg = dormant legacy after v5 | Gotenberg v8.34.0 (2026-06-12), MIT, 12.5k★, monthly releases, watermark/PDF-A/UA routes; already on Railway; Chromium native Arabic/RTL/flowing/tables — VERIFIED external + code | **CHANGE** (promoted) | v6 §1.2, §5 | Gotenberg raw-HTML = THE official renderer; `gotenbergConvertHtml` (zero call sites — VERIFIED code) must be proven | Q10 (approve spike) | **YES — OUTPUT.SPIKE.1 (blocking)** |
| 7 | Executive Ledger = preview-only layer | EL is the de-facto production letter renderer today (fallback path) — VERIFIED code + live DB | **KEEP + promote** | v6 §1.2 | EL = canonical HTML builder for classes A–D | — | No |
| 8 | TipTap = designer-only dead weight to remove (v3/v4) | All 8 packages confined to designer; MIT core; runtime rendering already via Puck-independent `prosemirror-renderer.ts` — VERIFIED code | **CHANGE** | v6 §1.6, §6 | TipTap KEPT and repurposed as Studio body editor; removal list now excludes it | — | No |
| 9 | "Two parallel pipelines" (v2) / "five render paths" (v4) | 3 engines, 24 mechanisms; only shared table exporter + DMS expiry emails exist outside HR; no /api/cron; invoice/fleet/weighbridge = stubs — VERIFIED code | **CHANGE** | v6 §0, §1.1 | Scope is global; HR = first adopter; future modules onboard via contract §1.9 | — | No |
| 10 | HR-only plan scope (v1–v5) | Phase 2 mandate + repo evidence | **CHANGE** | whole v6 | Plan file becomes global SOT; phases renamed OUTPUT.* | — | No |
| 11 | Merge Employment into Experience (v4/v5 Q1 recommendation "Yes") | Phase 2 rule: business identity ≠ technical reuse | **CHANGE** | v6 §1.3, §8 Q1 | Separate registry identities; shared components allowed | Q1 re-scoped | No |
| 12 | Storage security = pre-prod blocker; issuance lifecycle; QR file-binding; branding assets exist versioned (v4) | Re-confirmed — VERIFIED live DB + code | **KEEP** | v6 §1.7, §4 OUTPUT.1 | Unchanged; absorbed into OUTPUT.1 | Q3/Q4/Q5 | No |
| 13 | AI letters BUG-1 root cause + FK-hint fix (v3/v4) | Re-confirmed — VERIFIED code + live DB | **KEEP** | v6 §2 | QUICK FIX unchanged | — | No |
| 14 | Schedules broken, worker missing (v4) | Re-confirmed; no cron anywhere; `/api/internal/*` auth pattern exists to copy — VERIFIED code | **KEEP** | v6 §4 OUTPUT.6 | Worker-or-hide forced | **Q6** | No |
| 15 | `pdf-architecture.mdc` rule describes pdf-lib post-processing/PDF-A tooling | Not present in repo — CONTRADICTED | **CHANGE** | v6 §2 NEW-2 | Rule doc corrected in OUTPUT.2 | — | No |
| 16 | DOCX mail-merge (Carbone/docxtemplater) & jsreport & react-pdf & SuperDoc & hosted APIs as candidates | Carbone CCL restrictions; docxtemplater image module paid; jsreport 5-template cap + parallel store; react-pdf no native RTL; SuperDoc AGPL; hosted = PII residency — VERIFIED external | **REJECT** as primary (DOCX kept as future authority-form option via Gotenberg's LibreOffice module) | Phase 2 report §11 | No second engine; adapter contract allows later addition with register entry + spike | — | Only if adopted later |
| 17 | Free-pixel drag-and-drop = the admin design requirement (v5 reading of Sameer's request) | Puck history: full free-form built, 0 production designs, fidelity failure; requirement decomposes into wording/style/color/order + faithful output | **CHANGE** (honest trade-off recorded) | v6 §1.6, §8 Q11 | Structured Studio first; gated add-ons if a class truly needs free-form | **Q11 — Sameer must accept** | Studio demo checkpoint |
| 18 | v5 estimate 8.5–10 days | Global foundation added | **CHANGE** | v6 §4 | ~11–13 days | — | — |

**Spike register:** OUTPUT.SPIKE.1 (blocking — Gotenberg raw-HTML fidelity, branding data-URIs, QR, Arabic smoke, preview diff, fixtures only). Conditional: class-D badge HTML spike (only if needed); DOCX adapter spike (only if authority forms demand it).

**Unresolved owner decisions:** Q1 (re-scoped), Q2, Q3, Q4, Q5, Q6, Q7, Q8, Q9, Q10, Q11 — listed with recommendations in plan v6 §8.

**Gate carried to plan:** `REQUIRES SPIKE`.
