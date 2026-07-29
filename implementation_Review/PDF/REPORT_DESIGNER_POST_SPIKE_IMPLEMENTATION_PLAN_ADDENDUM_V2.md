# Report Designer — Post-Spike Implementation Plan Addendum v2 (PLANNING ONLY)

**Date:** 2026-07-26 · **Status:** Proposed — **do not implement without Sameer's approval.**
**Basis:** `REPORT_DESIGNER_VALIDATION_SPIKE_1_COMPLETION_AND_EVIDENCE_CLOSURE_REPORT.md` + `..._CORRECTED_ARCHITECTURE_DECISION_REPORT.md`.
**Prime directive:** the accepted Global Output Framework backend is preserved end-to-end. Every phase below sits *in front of* the canonical Executive Ledger + Gotenberg renderer.

This supersedes `REPORT_DESIGNER_POST_SPIKE_PROPOSED_IMPLEMENTATION_PLAN_ADDENDUM.md` (v1). v1 assumed the live Studio RTL was broken and treated a bigger rebuild; v2 is smaller because the live Studio already works.

---

## Phase RD-C.0 — Governance reconciliation & Studio de-risking (S)
**Purpose:** remove the drift found in the spike before any feature work.
- Reconcile `OUTPUT_VARIABLE_ALLOWLISTS` token names with `ERP_BINDING_REGISTRY` (SEC-13 governance drift). Single source of truth for token names.
- Document the Studio authorization model (server-action `hasPermission(reports.manage)` + governance-status gate; service role is server-only).
- **Deps:** none. **Effort:** S. **Route/API impact:** `src/lib/output/variable-allowlist.ts`, `src/lib/report-designer/binding-registry.ts`. **DB:** none. **Flags:** none. **Acceptance:** studio security battery still 13/13; no allowlisted token missing from the registry.

## Phase RD-C.1 — Template Studio production hardening (M)
**Purpose:** promote the "prototype (OUTPUT.3A)" Studio to an accepted flowing-letter designer.
- Bilingual/RTL authoring polish (RTL toggle already emits `dir=rtl`; add per-block direction + Arabic fixture preview parity checks).
- In-canvas header/footer + QR/stamp/signature **placeholder** controls (real assets remain issuance-only).
- Keyboard accessibility + zoom/responsive pass.
- Unsaved-changes guard already present; verify against the Save-and-Close standard (`forceCloseActiveTab`).
- **Deps:** RD-C.0. **Effort:** M. **Route/API impact:** `src/app/(admin)/admin/reports/template-studio/*`, `src/server/actions/output/template-studio.ts`, Studio components. **DB:** none new (`body_schema_json` exists). **Flags:** `OUTPUT_TEMPLATE_STUDIO_ENABLED` (exists). **Security gates:** re-run injection battery. **Arabic gate:** bilingual UAT. **Acceptance:** business-user UAT (SUS captured) + visual UAT on EN/AR letters.

## Phase RD-C.2 — Code-first tabular/analytical report definitions (M)
**Purpose:** keep complex reports code-first (no visual editor), but make them admin-configurable via registry-driven definitions.
- Report definition registry (columns, grouping, filters, repeating headers) rendered by Executive Ledger.
- **Deps:** none (independent of Studio). **Effort:** M. **Impact:** report registry + EL section builders. **DB:** optional report-definition table. **Acceptance:** 10-page landscape report with repeating thead reproduces prior fidelity.

## Phase RD-C.3 (OPTIONAL) — pdfme English fixed-card designer (M, flag)
**Purpose:** visual designer for English-only cards/labels IF a business need appears.
- Lazy-loaded route (bundle ≈18 MB must not touch other routes).
- pdfme schema JSON → canonical document model adapter; branding via `owner_company_id`.
- **Hard gate:** blocked for any Arabic-bearing content.
- **Deps:** RD-C.1 shared field-picker. **Effort:** M. **Flags:** `OUTPUT_PDFME_CARDS_ENABLED` (new, default off). **Acceptance:** English card round-trip; canvas/PDF drift < 1 mm; bundle lazy-loaded.

## Phase RD-C.4 (OPTIONAL, LATER) — Carbone Word-authoring pilot (L, flag)
**Purpose:** let admins author letters in Word if RD-C.1 proves insufficient.
- Implement the **full 8-guard DOCX intake battery** (`.docm` reject, VBA scan, external-rel/SSRF block, remote-image block, decompression-ratio limit, path-traversal check, PK-magic check, unresolved-token gate) — see `docx-security-battery-results.json`.
- Carbone inject → Gotenberg/LibreOffice → canonical model.
- **Deps:** legal review of CCL `[OPEN]`; real business-user SUS. **Effort:** L. **Flags:** `OUTPUT_CARBONE_DOCX_ENABLED` (new, default off). **Security gates:** 8/8 intake battery in CI. **Acceptance:** business-user SUS + Arabic shaping + font-substitution review.

---

## Cross-cutting requirements (all phases)
- **Migration/compensating-migration:** any new table ships with a paired down-migration; no destructive changes to existing template/issuance tables. Never null published `body_layout_json`/`body_schema_json`.
- **Feature flags:** every new engine behind an off-by-default flag.
- **Monitoring:** reuse existing output-operations monitoring; add per-engine render metrics.
- **Security gates:** studio injection battery (13) + DOCX battery (8) run in CI where the engine is enabled.
- **Arabic/RTL gate:** mandatory bilingual UAT before any family goes live.
- **Visual UAT + business-user UAT:** required to lift the Studio's "rejected/prototype" status.
- **Rollout/rollback:** flag-gated progressive enablement; rollback = disable flag (no data migration needed for Studio).

## What remains preserved (not reopened)
Executive Ledger canonical HTML · Gotenberg rendering · output registry · `owner_company_id` branding · governed versions · numbering · QR issuance/verification · protected stamp/signature · private storage · hashing · issuance/reissue history · permissions/RLS · retries/reconciliation/monitoring · email/print/download controls.

## Effort legend
S ≈ ≤2 days · M ≈ 1–2 weeks · L ≈ 3–5 weeks (single engineer, indicative only).
