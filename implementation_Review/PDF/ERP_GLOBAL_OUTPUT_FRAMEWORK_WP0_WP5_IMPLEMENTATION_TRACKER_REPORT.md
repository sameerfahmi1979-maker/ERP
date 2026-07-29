# ERP Global Output Framework — WP0–WP5 Implementation Tracker Report

**Program:** Global Output Framework master implementation (plan v6.1, 12 work packages)
**Date:** 2026-07-26
**Scope of this report:** compact closure record for WP0–WP5. WP6+ have their own reports.

---

## WP0 — Baseline

- Verified git state, scripts, env readiness; refreshed output/QR/template inventory.
- Full `tsc --noEmit` baseline captured: pre-existing `@/types/database` export errors
  documented as baseline (NOT introduced by this program); `tests/output-spike`
  excluded from tsconfig to keep spike scripts out of app type-checking.

## WP1 — QUICK FIX: AI employee-letter lookup defect — CLOSED

**Defect:** AI Letter/Email drafting for an existing employee returned "Employee not found."

**Root cause:** `employees` has TWO foreign keys to `owner_companies`
(`owner_company_id` + `sponsor_company_id`). The PostgREST join
`owner_company:owner_companies(legal_name_en)` was ambiguous → PGRST201 error, which
the code collapsed into the misleading "Employee not found."

**Fix (files):**
- `src/server/actions/hr/ai/hr-ai-letters.ts` — explicit FK hint
  `owner_companies!employees_owner_company_id_fkey`; query errors now logged
  server-side and surfaced as a truthful "server error" message (never "not found").
- `src/server/actions/hr/ai/employee-ai-review.ts` — same FK-hint + error-surfacing fix.

## WP2 — REPORT.DESIGNER.RETIRE.0: Puck evidence preservation — CLOSED

- Non-destructive evidence package: `implementation_Review/PDF/legacy_puck_evidence/`
  (README inventory + `template_studio_mapping_spec.md` mapping Puck concepts to the
  structured Studio schema). Nothing deleted; Puck remains installed until RETIRE.1.

## WP3 — OUTPUT.SPIKE.1: Gotenberg raw-HTML fidelity spike — GATE PASSED

- Spike harness `tests/output-spike/` (spike-runner, fixtures, visual-compare, diff-heatmap).
- Evidence: `implementation_Review/PDF/output_spike_1_evidence/` — Executive Ledger
  HTML rendered via Gotenberg raw-HTML mode with correct A4 geometry, fonts (EN + AR RTL),
  backgrounds, and multi-page flow. Gate passed → Chromium/Gotenberg confirmed as the
  single official renderer.

## WP4 — OUTPUT.1: Security + data-model foundation — CLOSED

**Migration:** `supabase/migrations/20260726120000_output_1_global_output_framework_foundation.sql` (applied)

- `erp_output_class_policies` — per-class defaults (A–G): QR policy, disclosure level,
  approval/watermark requirements (+ registry override columns).
- `erp_generated_pdf_documents` — lifecycle columns (`lifecycle_status`, `request_key`,
  `content_fingerprint`, `final_sha256`, `failure_*`, `superseded_by_id`, …) + indexes
  (idempotency, output_code, owner company, serial).
- `erp_output_public_links.generated_pdf_document_id` — canonical one-directional FK
  (verified non-destructive backfill by exact storage-path match).
- Template Studio foundation columns on `erp_report_templates`
  (`body_schema_json`, `studio_schema_version`).
- `outputs.ops.view/retry/revoke` permissions seeded.
- dms-temp cleanup governance: `erp_dms_temp_cleanup_settings` + `erp_dms_temp_cleanup_runs`.

**Code:**
- `src/lib/output/lifecycle.ts` — lifecycle state machine (pending → rendering →
  uploaded → issued; failed_retryable/failed_terminal/cancelled/reconciliation_required)
  with QR-activation rule (only after `issued`).
- `src/lib/output/idempotency.ts` — request keys, content fingerprints, SHA-256, tokens.
- `src/lib/output/class-policy.ts` — effective policy + QR expiry resolution.
- `src/lib/output/feature-flags.ts` — env-driven rollout/rollback flags.
- `src/lib/dms/temp-cleanup/eligibility.ts` + `src/server/actions/dms/temp-cleanup.ts` —
  settings-driven, dry-run-default, legal-hold/retain-list aware cleanup with run log.
- Schedules UI hidden behind `OUTPUT_SCHEDULES_UI_ENABLED` (off) —
  `src/app/(protected)/admin/reports/schedules/page.tsx`.

**QR inventory (non-destructive):**
`implementation_Review/PDF/OUTPUT_1_QR_LINKS_INVENTORY_AND_DECISION_TABLE.md` —
13 legacy HR links, all metadata-only; retained valid-until-revoked; no revoke/reissue actions.

## WP5 — OUTPUT.2: Renderer + template foundation + issuance coordinator — CLOSED

**Migrations (applied):**
- `20260726130000_output_2_pending_activation_links.sql` — `pending_activation` status
  for `erp_output_public_links`; public RPC `get_public_verification_by_token` returns
  NULL for unactivated links (QR can be embedded pre-render, but is never publicly
  resolvable until issuance completes — activation-last).
- `20260726131000_output_2_register_hr_employment_letter.sql` — `HR_EMPLOYMENT_LETTER`
  registered in `erp_report_registry` (Class B letter).

**Code:**
- `src/lib/output/types.ts` — coordinator contracts (`OutputDataProvider`, outcomes).
- `src/lib/output/variable-allowlist.ts` — token extraction/allowlist/zero-unresolved gate.
- `src/lib/output/letter-document-builder.ts` — shared Executive Ledger builder
  (preview-final parity; `LetterPreviewDialog` refactored to use it).
- `src/lib/output/html-adapter.ts` — canonical Gotenberg raw-HTML adapter with
  retryable/terminal error classification.
- `src/lib/output/issuance-engine.ts` — testable 11-step issuance orchestration
  (idempotent replay, content-duplicate warning, authorized reissue, exact-byte
  SHA-256 verification, QR create-pending → activate-after-issuance).
- `src/server/actions/output/generate-official-document.ts` — `generateOfficialDocument`
  entry point: auth → registry → class policy → approval gate → data fetch (runReport)
  → company isolation → branding snapshot → storage path → engine wiring → audit.
- Pipeline A migrated: `src/server/actions/pdf/generate-hr-letter.ts` delegates to the
  coordinator; legacy path retained behind `OUTPUT_LEGACY_EMPLOYMENT_LETTER_ENABLED`.
- Governance rule codified: `.cursor/rules/erp-output-framework-standard.mdc`.

**Evidence:**
- Unit tests: 55 (lifecycle 20, idempotency 8, class-policy 7, issuance-engine 12,
  variable-allowlist 8) — all passing.
- Live E2E vs running Gotenberg: `tests/output-spike/coordinator-adapter-e2e.mts` →
  `tests/output-spike/evidence/coordinator-e2e/` (PDF + SHA-256 + result JSON).

---

## Program status after WP5

| WP | Phase | Status |
|---|---|---|
| WP1 | QUICK FIX | CLOSED |
| WP2 | RETIRE.0 | CLOSED |
| WP3 | OUTPUT.SPIKE.1 | GATE PASSED |
| WP4 | OUTPUT.1 | CLOSED |
| WP5 | OUTPUT.2 | CLOSED |
| WP6 | OUTPUT.3A | see `ERP_OUTPUT_3A_STRUCTURED_TEMPLATE_STUDIO_PROTOTYPE_IMPLEMENTATION_REPORT.md` |

Flags at this point: coordinator ON, official issuance OFF (until OUTPUT.5 UAT),
schedules UI OFF, dms-temp deletion OFF (dry-run only), legacy employment-letter path OFF.
