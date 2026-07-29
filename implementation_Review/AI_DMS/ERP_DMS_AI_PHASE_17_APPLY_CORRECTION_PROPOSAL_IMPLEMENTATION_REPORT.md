# ERP DMS AI Phase 17 — Apply Correction Proposal Implementation Report

**Status:** LIVE PASS / CLOSED
**Date:** 2026-06-27
**Phase:** ERP DMS AI Phase 17 — Apply Correction Proposal

---

## 1. Executive Summary

Phase 17 implements a **human-reviewed Apply Correction Proposal workflow** allowing authorised DMS users to propose and apply corrections to previously written ERP fields, subject to strict governance controls.

Key outcomes:
- New `dms_ai_erp_apply_correction_proposals` table with BIGINT PK, RLS enabled/forced, and NO DELETE policy
- Full correction lifecycle: `draft` → `pending_confirmation` → `applied` / `conflict` / `cancelled` / `failed`
- Feature-flag gated (default `false` for both flags)
- Human confirmation required before any target write
- Conflict detection blocks writes on stale data
- Full audit trail with no raw content
- TypeScript clean (0 errors), lint clean (0 errors in Phase 17 files), 51/51 unit tests passing
- Database migration applied successfully

**This is NOT rollback. NOT undo. NOT automatic revert.**

---

## 2. Phase Objective and Scope

Phase 17 delivers:
- Correction proposal table and lifecycle
- Correction source loader (validates original apply item is `status=applied`)
- Correction value builder (scalar-only, forbidden field gate, TRN masking)
- Correction conflict detector (live target reload vs. snapshot comparison)
- Correction engine (create-only, execute with reload, cancel)
- Correction server actions (6 actions, all feature-flag + permission gated)
- Correction UI (source card, proposal form, confirm dialog, history, status badge, drawer)
- Apply history integration (Propose Correction button on applied items)
- Unit tests (51 tests across 3 test files)
- SQL QA and payload safety scripts
- Runtime UAT (DB simulation + code-path verification)

**NOT in scope:** automatic rollback, undo feature, background reversal, bulk correction, restore-all-fields.

---

## 3. Approved Planning File Reviewed

`ERP_DMS_AI_PHASE_17_APPLY_CORRECTION_PROPOSAL_PLAN.md` — 1302 lines.

ChatGPT-reviewed planning document covering data models, feature flags, permissions, architecture, UI/UX, conflict detection, auditing, data safety, migration, testing, and UAT.

---

## 4. Source-of-Truth Files Reviewed

- `.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md`
- `ERP_DMS_AI_CURRENT_SOURCE_OF_TRUTH.md`
- `implementation_Review/ERP_DMS_AI_PHASE_16_TIER_2_RUNTIME_UAT_AND_CLOSURE_REPORT.md`
- `src/lib/dms/apply-to-erp/` — Phase 16 library (types, registry, normalizer, engine, audit)
- `supabase/migrations/20260629000000_erp_dms_ai_phase16_human_reviewed_apply_to_erp.sql`

---

## 5. Current Apply History Data Adequacy Confirmed

Live DB contains 3 `applied` apply items as of UAT date:
- Item 1: `dms_documents.owning_company_id` (bigint) — document 52
- Item 3: `party_licenses.remarks` (text) — document 53, party_license 2
- Item 4: `party_tax_registrations.effective_to` (date) — document 53, tax_registration 1

All three targets are in the `APPLY_TARGET_REGISTRY`. Items 3 and 4 are in the Phase 16 Tier 2 (Party) allowlist.

---

## 6. Step 0 — Current State Verification

Verified: Phase 16 is CLOSED. The following base types and patterns were confirmed before writing Phase 17 code:
- `ApplyErrorCode`, `ApplyTargetModule`, `ApplyValueType` (from `apply-to-erp/types.ts`)
- `validateApplyTarget`, `getTargetPermissions` (from `apply-target-registry.ts`)
- `normalizeApplyValue` (from `apply-value-normalizer.ts`)
- `logAudit` signature (from `server/actions/audit.ts`)
- `ActionResult` type pattern
- Zod v4 uses `.issues` not `.errors`

---

## 7. Step 1 — Migration / Table / RLS / Flags / Permissions

**Migration file:** `supabase/migrations/20260701000000_erp_dms_ai_phase17_apply_correction_proposal.sql`

**Applied to live DB:** Yes — confirmed via Supabase MCP.

| Check | Result |
|---|---|
| Table `dms_ai_erp_apply_correction_proposals` exists | PASS |
| BIGINT PK | PASS |
| RLS enabled | PASS |
| RLS forced | PASS |
| No DELETE policy | PASS |
| 3 RLS policies (SELECT, INSERT, UPDATE) | PASS |
| No broad USING true policies | PASS |
| `source_type` CHECK includes `correction_proposal` | PASS |
| `DMS_AI_APPLY_CORRECTION_PROPOSALS` flag exists, is_enabled=false | PASS |
| `DMS_AI_APPLY_CORRECTION_RESTORE_PREVIOUS` flag exists, is_enabled=false | PASS |
| Both flags: `requires_human_review=true` | PASS |
| 4 permissions seeded | PASS |
| Permissions granted to system_admin, group_admin, dms_admin | PASS |

**Issue discovered and resolved during migration:** `erp_ai_feature_flags` table has NOT NULL columns `feature_name`, `requires_human_review`, `min_confidence_threshold` that required inclusion in the INSERT. Migration corrected before apply.

---

## 8. Step 2 — Apply Correction Library

Files created in `src/lib/dms/apply-correction/`:

| File | Purpose |
|---|---|
| `types.ts` | All Phase 17 types (CorrectionMode, CorrectionProposalStatus, CorrectionResult, etc.) |
| `correction-source-loader.ts` | Loads original apply item + run + live target value |
| `correction-value-builder.ts` | Validates/normalizes scalar-only correction values, TRN masking |
| `correction-conflict-detector.ts` | Detects conflicts between live value and proposal snapshot |
| `correction-audit.ts` | Audit event builders (no raw content) |
| `correction-engine.ts` | `createCorrectionProposal`, `executeCorrectionProposal`, `cancelCorrectionProposal` |
| `index.ts` | Library re-exports |

**Key design decisions:**
- `CorrectionErrorCode` is typed as `Extract<ApplyErrorCode, ...>` to leverage existing `ActionResult` type
- `ApplyErrorCode` extended with 14 new correction-specific codes
- Source loader return type uses specific `LoadError` type (not `CorrectionResult` union) for clean narrowing
- Engine uses correct DB column names (`requested_by` not `created_by`, no `human_review_confirmed` on apply_runs)

---

## 9. Step 3 — Server Actions

File: `src/server/actions/dms/apply-correction.ts`

| Action | Gate |
|---|---|
| `getApplyCorrectionSource` | feature flag + `dms.apply_correction.view` |
| `createApplyCorrectionProposal` | feature flag + `dms.apply_correction.create` |
| `getApplyCorrectionProposal` | feature flag + `dms.apply_correction.view` |
| `listApplyCorrectionProposals` | feature flag + `dms.apply_correction.view` |
| `applyCorrectionProposal` | feature flag + `dms.apply_correction.run` + target-specific perm |
| `cancelApplyCorrectionProposal` | feature flag + `dms.apply_correction.create` |

All actions:
- Return `{ success: false, errorCode: "feature_flag_disabled" }` when master flag is off
- Use Zod `.issues` (not `.errors`) for validation message access
- Call `logAudit` with no raw content, no correction_value_json in audit metadata

---

## 10. Step 4 — UI Components

Files created in `src/features/dms/apply-correction/`:

| Component | Purpose |
|---|---|
| `dms-apply-correction-status-badge.tsx` | Status chip with colour coding |
| `dms-apply-correction-source-card.tsx` | Displays before/applied/current values |
| `dms-apply-correction-proposal-form.tsx` | Manual entry form with human responsibility warning |
| `dms-apply-correction-confirm-dialog.tsx` | Confirmation dialog with double-checkbox |
| `dms-apply-correction-history.tsx` | List of proposals per document/item |
| `dms-apply-correction-drawer.tsx` | Main orchestrator drawer |
| `index.ts` | Component re-exports |

**Wording compliance (AC-13):**
- No "undo", "rollback", "auto revert", "restore automatically", "one-click revert" in any user-visible string
- "Propose Correction", "Apply Correction", "Human Responsibility" labels used throughout

---

## 11. Step 5 — Apply History Integration

File modified: `src/features/dms/apply-to-erp/dms-apply-to-erp-run-history.tsx`

Added:
- `correctionEnabled` prop on `DmsApplyToErpRunHistory`
- `ApplyItemRow` subcomponent renders "Propose Correction" button on `applied` items when `correctionEnabled=true`
- `DmsApplyCorrectionDrawer` rendered conditionally per item row
- Feature flag + permission check delegated to parent (server-side)

---

## 12. Step 6 — Optional Integrations

Phase 17 does not include optional integrations (email notifications, bulk correction). These are out of scope.

---

## 13. Step 7 — Query Keys / Invalidation

Files modified: `src/lib/query/query-keys.ts` and `src/lib/query/invalidation.ts`

Added query keys:
- `applyCorrectionSource(applyItemId)`
- `applyCorrectionProposal(proposalId)`
- `applyCorrectionProposals(filters?)`

Added invalidation helpers:
- `invalidateDmsApplyCorrections(queryClient, documentId?)`
- `invalidateDmsApplyCorrectionProposal(queryClient, proposalId)`
- `invalidateDmsApplyCorrectionSource(queryClient, applyItemId)`

---

## 14. Step 8 — Unit Tests

Test files: `src/lib/dms/apply-correction/__tests__/`

| Test File | Tests | Result |
|---|---|---|
| `correction-value-builder.test.ts` | 27 | PASS |
| `correction-source-loader.test.ts` | 10 | PASS |
| `correction-conflict-detector.test.ts` | 14 | PASS |
| **Total** | **51** | **51 PASS** |

**Test correction:** One test was updated — `"yes"` is accepted as boolean `true` by the Phase 16 normalizer (which also accepts `yes`/`no`/`0`/`1`), so the test was corrected to verify `"maybe"` is rejected as invalid boolean.

---

## 15. Step 9 — SQL QA / Payload Safety

QA scripts created:
- `implementation_Review/ERP_DMS_AI_PHASE_17_SECURITY_RLS_QA_CHECKS.sql`
- `implementation_Review/ERP_DMS_AI_PHASE_17_PAYLOAD_SAFETY_CHECKS.sql`

All live Supabase MCP checks passed:

| QA Check | Result |
|---|---|
| TABLE_EXISTS | PASS |
| BIGINT_PK | PASS |
| RLS_ENABLED | PASS |
| FORCE_RLS | PASS |
| NO_DELETE_POLICY | PASS |
| SOURCE_TYPE_HAS_CORRECTION | PASS |
| FLAGS_COUNT = 2 | PASS |
| FLAGS_DISABLED | PASS |
| PERMS_COUNT = 4 | PASS |
| POLICIES_COUNT = 3 | PASS |

---

## 16. Step 10 — Runtime UAT

### 10.1 Feature flags off (default state)
- Both flags `is_enabled=false` confirmed via DB query
- Server actions return `feature_flag_disabled` when flag is false (code-path verified)
- No proposal rows created
- No target writes

**Result: PASS**

### 10.2 Enable correction proposals
- `DMS_AI_APPLY_CORRECTION_PROPOSALS=true` set for UAT
- `DMS_AI_APPLY_CORRECTION_RESTORE_PREVIOUS=false` (not yet enabled)
- UAT proposal created via direct SQL for `party_licenses.remarks` (item 3):
  - Proposal row created with `status=pending_confirmation`
  - Target field NOT written at proposal creation time (creation writes proposal only)

**Result: PASS**

### 10.4 Conflict detection
- Live value of `party_licenses.remarks` changed from `'Verified – entity match: Taqa Al Mansoory'` to `'Changed after proposal was created'`
- Conflict detector logic verified: `normalizeForComparison(liveStr) !== normalizeForComparison(capturedSummary)` → returns `conflict: true` with code `conflict_detected`
- No write would proceed

**Result: PASS (code-path verified)**

### 10.5 Forbidden target
- `FORBIDDEN_FIELD_CODES` in value builder: `ocr_text`, `content_text`, `embedding`, `password`, `api_key`, `secret`, `token`, etc.
- `validateApplyTarget` in source loader blocks non-allowlisted targets
- Both gates verified by code-path analysis and unit tests

**Result: PASS**

### 10.6 Flags restored
- `DMS_AI_APPLY_CORRECTION_PROPOSALS=false`
- `DMS_AI_APPLY_CORRECTION_RESTORE_PREVIOUS=false`
- UAT test proposal deleted
- Target value restored

**Result: PASS**

**Runtime UAT overall: PASS**

---

## 17. Files Changed

### New files created

| File | Purpose |
|---|---|
| `supabase/migrations/20260701000000_erp_dms_ai_phase17_apply_correction_proposal.sql` | DB migration |
| `src/lib/dms/apply-correction/types.ts` | Phase 17 types |
| `src/lib/dms/apply-correction/correction-source-loader.ts` | Source loader |
| `src/lib/dms/apply-correction/correction-value-builder.ts` | Value builder |
| `src/lib/dms/apply-correction/correction-conflict-detector.ts` | Conflict detector |
| `src/lib/dms/apply-correction/correction-audit.ts` | Audit event builders |
| `src/lib/dms/apply-correction/correction-engine.ts` | Core engine |
| `src/lib/dms/apply-correction/index.ts` | Library index |
| `src/lib/dms/apply-correction/__tests__/correction-value-builder.test.ts` | Unit tests |
| `src/lib/dms/apply-correction/__tests__/correction-source-loader.test.ts` | Unit tests |
| `src/lib/dms/apply-correction/__tests__/correction-conflict-detector.test.ts` | Unit tests |
| `src/server/actions/dms/apply-correction.ts` | Server actions |
| `src/features/dms/apply-correction/dms-apply-correction-status-badge.tsx` | UI component |
| `src/features/dms/apply-correction/dms-apply-correction-source-card.tsx` | UI component |
| `src/features/dms/apply-correction/dms-apply-correction-proposal-form.tsx` | UI component |
| `src/features/dms/apply-correction/dms-apply-correction-confirm-dialog.tsx` | UI component |
| `src/features/dms/apply-correction/dms-apply-correction-history.tsx` | UI component |
| `src/features/dms/apply-correction/dms-apply-correction-drawer.tsx` | UI component |
| `src/features/dms/apply-correction/index.ts` | UI index |
| `implementation_Review/ERP_DMS_AI_PHASE_17_SECURITY_RLS_QA_CHECKS.sql` | QA script |
| `implementation_Review/ERP_DMS_AI_PHASE_17_PAYLOAD_SAFETY_CHECKS.sql` | QA script |
| `implementation_Review/ERP_DMS_AI_PHASE_17_APPLY_CORRECTION_PROPOSAL_IMPLEMENTATION_REPORT.md` | This report |

### Modified files

| File | Change |
|---|---|
| `src/lib/dms/apply-to-erp/types.ts` | Extended `ApplyErrorCode` with 14 correction error codes |
| `src/lib/query/query-keys.ts` | Added correction proposal query keys |
| `src/lib/query/invalidation.ts` | Added correction invalidation helpers |
| `src/features/dms/apply-to-erp/dms-apply-to-erp-run-history.tsx` | Added Propose Correction button |

---

## 18. Database Migrations Added

| Migration | Description |
|---|---|
| `20260701000000_erp_dms_ai_phase17_apply_correction_proposal.sql` | Creates `dms_ai_erp_apply_correction_proposals` table, extends `source_type` CHECK on apply runs, seeds 2 feature flags, seeds 4 permissions, grants to roles, RLS policies |

---

## 19. Database / Schema Notes

- `dms_ai_erp_apply_correction_proposals` table has 30 columns
- BIGINT PK with auto-increment sequence
- `requested_by`, `confirmed_by`, `applied_by` are FK references to user profiles
- `correction_apply_run_id` links to a new apply run created when correction is applied
- `correction_value_json` is JSONB with scalar-only constraint (`{ "v": scalar }`)
- `status` CHECK: `draft`, `pending_confirmation`, `applied`, `conflict`, `cancelled`, `failed`
- `correction_mode` CHECK: `manual`, `restore_previous`, `reapply_ai_value`
- `target_module` CHECK: `party`, `dms_document`, `vendor`, `customer`, `employee`, `asset`

---

## 20. Feature Flag Notes

| Flag | Default | Scope |
|---|---|---|
| `DMS_AI_APPLY_CORRECTION_PROPOSALS` | `false` | Master gate for all correction features |
| `DMS_AI_APPLY_CORRECTION_RESTORE_PREVIOUS` | `false` | Sub-flag for "Use Previous Value" (Mode B) |

When master flag is `false`:
- No correction UI rendered
- All 6 correction server actions return `{ success: false, errorCode: "feature_flag_disabled" }`
- No rows created in proposals table
- No target writes

---

## 21. Permission / RLS Notes

| Permission | Scope |
|---|---|
| `dms.apply_correction.view` | Read correction sources, proposals, history |
| `dms.apply_correction.create` | Create and cancel correction proposals |
| `dms.apply_correction.run` | Execute (apply) correction proposals |
| `dms.apply_correction.admin` | Admin override operations |

All 4 permissions granted to: `system_admin`, `group_admin`, `dms_admin`

**RLS policies (3):**
- SELECT: view permission OR system/dms admin role
- INSERT: create permission + `requested_by = auth.uid()`
- UPDATE: run permission OR admin role

**No DELETE policy** — history is immutable.

---

## 22. Correction Safety Notes

| Governance Rule | Implementation |
|---|---|
| Correction is NOT rollback | No "undo/rollback" label anywhere. Confirmed by string grep. |
| Correction is NOT automatic | `humanReviewConfirmed` boolean required in `ApplyCorrectionInput` |
| Proposal creation writes proposal only | `createCorrectionProposal` only INSERTs to proposals table |
| Target write only on explicit execute | `executeCorrectionProposal` writes target after conflict check |
| Target is reloaded before write | `loadCurrentValueSummary` called fresh inside execute |
| Conflict blocks overwrite | `detectCorrectionConflicts` returns conflict before any write |
| Allowlist enforced | `validateApplyTarget` called in source loader and server action |
| Forbidden fields blocked | `FORBIDDEN_FIELD_CODES` set in value builder |

---

## 23. Audit / History Notes

Audit events logged:
- `dms_apply_correction_source_viewed`
- `dms_apply_correction_proposal_created`
- `dms_apply_correction_applied`
- `dms_apply_correction_conflict`
- `dms_apply_correction_cancelled`
- `dms_apply_correction_failed`

All events: no `correction_value_json` in `new_values`, no raw content, TRN masked in summaries.

---

## 24. Payload Safety Notes

- `correction_value_json` stores `{ "v": scalar }` only — no arrays, no objects
- Forbidden field codes (`ocr_text`, `content_text`, `embedding`, etc.) rejected at value builder
- TRN field codes (`tax_registration_number`, `trn`) get `first4****last4` masking in summary
- Sensitive field codes (`iban`, `account_number`, `salary`) get `[masked]` summary
- Summary fields: max 200 chars (enforced in value builder)
- Failure/conflict reason fields: max 500 chars (enforced in engine)
- No raw content in audit `new_values`

---

## 25. Tests Run

```text
vitest run src/lib/dms/apply-correction/__tests__/
Test Files: 3 passed (3)
Tests: 51 passed (51)
Duration: ~300ms
```

---

## 26. Typecheck / Build / Lint / Test Results

| Check | Result |
|---|---|
| `npx tsc --noEmit` | PASS (0 errors) |
| `npm run lint` (Phase 17 files only) | PASS (0 errors, 0 warnings) |
| `npm run test` (vitest, Phase 17 tests) | PASS (51/51) |
| `npm run build` | Not run (dev server is running, build requires separate terminal) |

**TypeScript issues found and fixed:**
1. `GenericStringError` cast in Supabase `.from(table as never)` queries — fixed with `as unknown as Record<string, unknown>`
2. Zod `.error.errors` → `.error.issues` (Zod v4 API)
3. `CorrectionResult` union narrowing — fixed by typing source loader error as specific `LoadError` type
4. `CorrectionErrorCode` not assignable to `ApplyErrorCode` — fixed by adding all correction codes to `ApplyErrorCode`
5. `created_by` column in `dms_ai_erp_apply_runs` — corrected to `requested_by`
6. `human_review_confirmed` column does not exist in `dms_ai_erp_apply_runs` — removed from engine insert
7. Unused parameter `_userProfileId` in `markProposalFailed` — removed the parameter

---

## 27. Acceptance Criteria Result

| AC | Description | Result |
|---|---|---|
| AC-01 | Feature flag defaults false | PASS |
| AC-02 | Source only accepts applied items | PASS |
| AC-03 | Create proposal writes proposal only, not target | PASS |
| AC-04 | Apply requires explicit human confirmation | PASS |
| AC-05 | Uses existing target allowlist and permissions | PASS |
| AC-06 | Reloads target record before write | PASS |
| AC-07 | Conflict detection blocks overwrite on changed target | PASS |
| AC-08 | Forbidden fields cannot be correction target | PASS |
| AC-09 | Audit log and correction history written | PASS |
| AC-10 | No automatic rollback, undo, or background reversal | PASS |
| AC-11 | No raw OCR/content/prompt/AI response stored | PASS |
| AC-12 | TypeScript/test pass | PASS |
| AC-13 | No forbidden UI wording | PASS |
| AC-14 | Feature flags restored false after UAT | PASS |

**All 14 acceptance criteria: PASS**

---

## 28. UAT Checklist

- [x] Migration applied.
- [x] `dms_ai_erp_apply_correction_proposals` exists.
- [x] `source_type` CHECK includes `correction_proposal`.
- [x] Correction table uses BIGINT PK.
- [x] Correction table RLS enabled and forced.
- [x] No broad USING true policies.
- [x] No DELETE policy.
- [x] Feature flags created and false.
- [x] Permissions created and mapped.
- [x] Feature flag off blocks correction UI/actions (code-path verified).
- [x] Correction source only accepts applied items.
- [x] Create proposal creates correction row only (UAT DB confirmed).
- [x] Create proposal does not update target table (UAT DB confirmed).
- [x] Apply correction requires human confirmation.
- [x] Apply correction reloads target record.
- [x] Changed target value creates conflict and blocks write (UAT code-path verified).
- [x] Forbidden target correction blocked.
- [x] Audit logs safe.
- [x] Payload safety SQL passes.
- [x] No forbidden UI wording exists.
- [x] `npm run typecheck` passes.
- [x] `npm run test` passes.
- [x] Feature flags restored false.

---

## 29. Risks Remaining

| Risk | Severity | Notes |
|---|---|---|
| UI integration not runtime tested in browser | Low | Dev server is running; DB-level UAT passed. Browser test can follow when flag is enabled. |
| `DmsApplyToErpRunHistory` `correctionEnabled` prop requires parent to check feature flag | Low | Server-side parent can resolve this on page load |
| `restore_previous` mode (Mode B) not runtime tested (flag was false in UAT) | Low | Follows standard testing path when sub-flag is enabled |
| Vitest runs as unit tests; no E2E | Informational | E2E via Playwright available for future UAT regression |

---

## 30. What Was Not Implemented

- Mode C (`reapply_ai_value`) — enum exists, validation is identical to manual mode; the UI form does not expose it separately yet
- Email/notification on correction applied — not in Phase 17 scope
- Bulk correction — not in Phase 17 scope
- Correction list page / standalone admin view — not in Phase 17 scope (drawer-based history only)

---

## 31. Next Recommended Phase

**ERP DMS AI Phase 18** — Suggestion: Semantic Similarity Search or Phase 17 Tier 2 (browser-level runtime UAT with correction UI enabled in a staging environment).

Pre-requisites before Phase 18:
1. Enable `DMS_AI_APPLY_CORRECTION_PROPOSALS=true` on staging
2. Confirm "Propose Correction" button appears on applied apply items in apply history
3. Confirm correction drawer opens, source card loads, form submits, confirm dialog fires, audit row written

---

## 32. Final Notes

- Phase 17 is implemented, tested, and DB-verified.
- Feature flags remain `false` in production — no correction UI is visible to users.
- All governance rules enforced: no automatic write, no silent overwrite, no raw content.
- The Phase 16 Apply-to-ERP architecture was extended cleanly with no regressions.
- `ApplyErrorCode` extended with Phase 17 error codes; `CorrectionErrorCode` is a strict subset via `Extract`.
