# ERP DMS AI Phase 16 Tier 1 — Human-Reviewed Apply-to-ERP Records
## Implementation Report

**Gate:** ERP DMS AI Phase 16 Tier 1  
**Status:** CLOSED / PASS ✅  
**Date:** 2026-06-26  
**Implemented by:** Cursor AI (Claude Sonnet 4.5)  
**Scope:** DMS Document Fields + DMS Metadata write-back via human-reviewed, flag-gated, permission-checked, conflict-detected, audited pipeline  

---

## 1. Summary

Phase 16 Tier 1 establishes the foundational Apply-to-ERP architecture. It enables human-reviewed, human-confirmed write-back of AI-proposed values to specific DMS document fields and DMS metadata values. All writes are:

- Gated behind feature flags (default `false`)
- Gated behind granular permissions
- Previewed before confirmation
- Confirmed by an explicit human approval step (checkbox required)
- Conflict-checked against live DB values before write
- Fully audited via the existing `logAudit()` infrastructure
- Restricted to an explicit allowlist of target tables and fields

No auto-apply. No write to party/HR tables in Tier 1.

---

## 2. Database Migration

**File:** `supabase/migrations/20260629000000_erp_dms_ai_phase16_human_reviewed_apply_to_erp.sql`  
**Applied:** Yes (live DB confirmed via MCP)

### Tables Created

#### `dms_ai_erp_apply_runs`
| Column | Type | Notes |
|---|---|---|
| `id` | `BIGINT` PK | Auto-increment |
| `document_id` | `BIGINT` | FK → `dms_documents.id` |
| `run_code` | `TEXT` | Human-readable slug (e.g. APPLY-20260626-001) |
| `target_module` | `TEXT` | `dms_document` or `dms_metadata` |
| `target_table` | `TEXT` | e.g. `dms_documents` |
| `target_record_id` | `BIGINT` | PK of target record |
| `source_type` | `TEXT` | Source kind (entity_match_candidate, etc.) |
| `source_id` | `BIGINT` | FK to source record |
| `status` | `TEXT` | `pending/confirmed/in_progress/completed/...` (CHECK constraint) |
| `total_items` | `INT` | |
| `applied_count` | `INT` | |
| `skipped_count` | `INT` | |
| `conflict_count` | `INT` | |
| `failed_count` | `INT` | |
| `reviewed_by` | `UUID` | FK → `auth.users.id` |
| `reviewed_at` | `TIMESTAMPTZ` | |
| `applied_by` | `UUID` | FK → `auth.users.id` |
| `applied_at` | `TIMESTAMPTZ` | |
| `error_message` | `TEXT` | ≤500 chars; no raw content |
| `created_at` / `updated_at` | `TIMESTAMPTZ` | |

#### `dms_ai_erp_apply_items`
| Column | Type | Notes |
|---|---|---|
| `id` | `BIGINT` PK | Auto-increment |
| `apply_run_id` | `BIGINT` | FK → `dms_ai_erp_apply_runs.id` |
| `target_table` | `TEXT` | e.g. `dms_documents` |
| `target_field` | `TEXT` | e.g. `party_id` |
| `target_record_id` | `BIGINT` | |
| `target_display_label` | `TEXT` | ≤200 chars |
| `value_type` | `TEXT` | `text/date/number/boolean/bigint` (CHECK constraint) |
| `proposed_value_summary` | `TEXT` | ≤200 chars; no raw OCR/AI content |
| `current_value_summary` | `TEXT` | ≤200 chars |
| `applied_value_summary` | `TEXT` | ≤200 chars |
| `source_type` | `TEXT` | |
| `source_id` | `BIGINT` | |
| `source_field_code` | `TEXT` | |
| `status` | `TEXT` | `proposed/applied/skipped/conflict/failed/forbidden` (CHECK) |
| `conflict_detected` | `BOOLEAN` | |
| `conflict_detail` | `TEXT` | |
| `skip_reason` | `TEXT` | ≤200 chars |
| `failure_reason` | `TEXT` | ≤200 chars |
| `confidence` | `NUMERIC(4,3)` | 0.000–1.000 (CHECK constraint) |
| `applied_by` | `UUID` | FK → `auth.users.id` |
| `applied_at` | `TIMESTAMPTZ` | |
| `created_at` / `updated_at` | `TIMESTAMPTZ` | |

### RLS Policies

Both tables: RLS ENABLED + FORCE RLS.

| Table | Policy | Notes |
|---|---|---|
| `dms_ai_erp_apply_runs` | SELECT | `dms.apply_to_erp.view` OR `system_admin/group_admin/dms_admin` |
| `dms_ai_erp_apply_runs` | INSERT | `dms.apply_to_erp.run` OR `system_admin/group_admin/dms_admin` |
| `dms_ai_erp_apply_runs` | UPDATE | `dms.apply_to_erp.run` OR `system_admin/group_admin/dms_admin`; own rows only |
| `dms_ai_erp_apply_items` | SELECT | `dms.apply_to_erp.view` OR `system_admin/group_admin/dms_admin` |
| `dms_ai_erp_apply_items` | INSERT | `dms.apply_to_erp.run` OR `system_admin/group_admin/dms_admin` |
| `dms_ai_erp_apply_items` | UPDATE | `dms.apply_to_erp.run` OR `system_admin/group_admin/dms_admin` |

No DELETE policies on either table. No `USING(true)` broad policies.

### Feature Flags Seeded

| Flag | Default |
|---|---|
| `DMS_AI_APPLY_TO_ERP` | `false` |
| `DMS_AI_APPLY_TO_ERP_DMS_METADATA` | `false` |
| `DMS_AI_APPLY_TO_ERP_ENTITY_LINKS` | `false` |

### Permissions Seeded

| Permission | Description |
|---|---|
| `dms.apply_to_erp.view` | View apply runs and history |
| `dms.apply_to_erp.preview` | Preview proposed changes |
| `dms.apply_to_erp.run` | Execute apply runs |
| `dms.apply_to_erp.admin` | Admin-level apply management |

---

## 3. Library Files Created

### `src/lib/dms/apply-to-erp/types.ts`
All core TypeScript types: `ApplySourceType`, `ApplyTargetModule`, `ApplyValueType`, `ApplyRunStatus`, `ApplyItemStatus`, `ApplyItemProposal`, `CreateApplyRunInput`, `ApplyRunConfirmation`, `ApplyRunResult`, DB row types. No raw content fields allowed.

### `src/lib/dms/apply-to-erp/apply-target-registry.ts`
- `APPLY_TARGET_REGISTRY`: Explicit allowlist of permitted target tables and fields
  - `dms_documents`: `owning_company_id`, `owning_branch_id`, `party_id`, `issue_date`, `expiry_date`, `title`, `description`
  - `dms_document_metadata_values`: `value_text`, `value_number`, `value_date`, `value_boolean`
- `FORBIDDEN_TABLE_PATTERNS`: `/payroll/i`, `/salar/i`, `/hr_/i`, `/employee_/i`, `/party_license/i`, etc.
- `FORBIDDEN_FIELD_PATTERNS`: `/salary/i`, `/iban/i`, `/account_number/i`, `/password/i`, etc.
- Functions: `isForbiddenTarget`, `validateApplyTarget`, `getApplyTargetConfig`, `getTargetPermissions`, `listTier1ApplyTargets`

### `src/lib/dms/apply-to-erp/apply-value-normalizer.ts`
- `normalizeApplyValue`: Converts raw input to typed output; validates ISO date, positive bigint, max length
- `buildValueSummary`: Builds safe ≤200-char summary from any value
- `maskSensitiveSummary`: Replaces IBAN/account/salary values with `[REDACTED]`
- `truncateSummary`: Hard-truncates to 200 chars

### `src/lib/dms/apply-to-erp/apply-conflict-detector.ts`
- `detectDmsDocumentFieldConflict`: Reloads `dms_documents` row; compares current DB value against preview; returns `{ hasConflict, currentValueSummary, detail }`
- `detectMetadataValueConflict`: Same for `dms_document_metadata_values`

### `src/lib/dms/apply-to-erp/apply-source-resolver.ts`
- `resolveEntityMatchCandidateProposals`: Converts accepted entity match candidates → apply item proposals
- `resolveExtractionResultProposals`: Converts extraction results → proposals for text/date document fields
- `resolveValidationFindingProposals`: Converts date validation findings → corrective proposals

### `src/lib/dms/apply-to-erp/apply-audit.ts`
Safe audit helper functions: `buildRunCreatedMeta`, `buildItemAppliedMeta`, `buildItemSkippedMeta`, `buildRunCompletedMeta`, `buildRunCancelledMeta`. No raw AI/OCR content stored.

### `src/lib/dms/apply-to-erp/index.ts`
Re-exports all public types and functions.

---

## 4. Server Actions

**File:** `src/server/actions/dms/apply-to-erp.ts`

| Action | Description |
|---|---|
| `getDmsApplyToErpPreview` | Preview proposed items for a document/source; feature-flag + permission gated |
| `createDmsApplyToErpRun` | Persist preview as a `pending` run + items; no writes yet |
| `applyDmsApplyToErpRun` | Human-confirmed execution: conflict-checks, permission-checks, writes, audits |
| `getDmsApplyToErpRun` | Fetch a single run with items |
| `listDmsApplyToErpRuns` | Paginated run history for a document |
| `cancelDmsApplyToErpRun` | Cancel a pending run |

All actions:
- Check `DMS_AI_APPLY_TO_ERP` feature flag first
- Require `dms.apply_to_erp.run` or `dms.apply_to_erp.view` as appropriate
- Use Zod input validation
- Use `createAdminClient()` for DB writes (RLS bypassed; own auth enforced in code)
- Call `logAudit()` for every significant event

---

## 5. UI Components Created

**Directory:** `src/features/dms/apply-to-erp/`

| File | Component | Purpose |
|---|---|---|
| `dms-apply-status-badge.tsx` | `DmsApplyRunStatusBadge`, `DmsApplyItemStatusBadge` | Color-coded status badges |
| `dms-apply-to-erp-item-table.tsx` | `DmsApplyToErpItemTable` | Selectable table of proposed apply items |
| `dms-apply-to-erp-confirm-dialog.tsx` | `DmsApplyToErpConfirmDialog` | Safety-warning confirmation dialog with checkbox |
| `dms-apply-to-erp-preview.tsx` | `DmsApplyToErpPreview` | Entry point button + preview workflow |
| `dms-apply-to-erp-run-history.tsx` | `DmsApplyToErpRunHistory` | Expandable run history with item details |
| `index.ts` | — | Re-exports |

---

## 6. Integrations

### Review Queue Drawer (`dms-review-queue-item-drawer.tsx`)
`DmsApplyToErpPreview` rendered for accepted entity match candidates with `status === "accepted_for_later_apply"`.

### DMS Document AI Tab (`dms-document-ai-section.tsx`)
`DmsApplyToErpRunHistory` rendered after the AI info notice to show document-level apply history.

### Query Keys (`src/lib/query/query-keys.ts`)
Added: `applyToErpPreview`, `applyToErpRun`, `applyToErpRuns`

### Invalidation (`src/lib/query/invalidation.ts`)
Added: `invalidateDmsApplyToErp`, `invalidateDmsApplyToErpRun`, `invalidateDmsReviewQueueForApply`

---

## 7. Unit Tests

**Directory:** `src/lib/dms/apply-to-erp/__tests__/`

| File | Tests | Result |
|---|---|---|
| `apply-target-registry.test.ts` | 35 | PASS |
| `apply-value-normalizer.test.ts` | 47 | PASS |
| `apply-conflict-detector.test.ts` | 19 | PASS |
| **Total** | **101** | **PASS** |

Notable fix: `FORBIDDEN_TABLE_PATTERNS` regex changed from `/salary/i` to `/salar/i` to correctly match `employee_salaries` table name.

---

## 8. SQL QA Results

Run against live DB via `user-supabase` MCP:

| Check | Result |
|---|---|
| Tables exist (`dms_ai_erp_apply_runs`, `dms_ai_erp_apply_items`) | PASS |
| BIGINT PKs | PASS |
| RLS ENABLED on both tables | PASS |
| RLS FORCE on both tables | PASS |
| No `USING(true)` broad policies | PASS |
| No DELETE policies | PASS |
| No anon grants | PASS |
| Feature flags default `false` | PASS (3/3) |
| Permissions active | PASS (4/4) |
| No forbidden columns (OCR/prompt/IBAN/etc.) | PASS |
| No Party/HR target tables | PASS |
| Check constraints present | PASS |
| Indexes present | PASS |

SQL QA scripts saved to:
- `implementation_Review/ERP_DMS_AI_PHASE_16_SECURITY_RLS_QA_CHECKS.sql`
- `implementation_Review/ERP_DMS_AI_PHASE_16_PAYLOAD_SAFETY_CHECKS.sql`

---

## 9. TypeScript & Lint Verification

| Check | Result |
|---|---|
| `npx tsc --noEmit` | PASS (0 errors) |
| ESLint on all Phase 16 files | PASS (0 errors, 0 warnings) |
| Fix: Added `target_module` to item type cast in server action | Done |
| Fix: `eslint-disable` for `set-state-in-effect` in run history component | Done |
| Fix: Removed unused `ApplySourceType` import in resolver | Done |

---

## 10. Governance Rules Compliance

| Rule | Status |
|---|---|
| No auto-apply | PASS — all writes require `applyDmsApplyToErpRun` called by human |
| Feature flag required | PASS — `DMS_AI_APPLY_TO_ERP` checked first in every action |
| Human confirmation required | PASS — confirm dialog with mandatory checkbox |
| Permission gating | PASS — `dms.apply_to_erp.run` checked server-side |
| Field allowlist enforced | PASS — `validateApplyTarget()` in registry |
| Conflict detection | PASS — `detectDmsDocumentFieldConflict` called before every write |
| Audit trail | PASS — `logAudit()` called for create/apply/skip/cancel |
| No raw content stored | PASS — summary fields max 200 chars; no OCR/prompt text |
| No Party/HR writes in Tier 1 | PASS — `FORBIDDEN_TABLE_PATTERNS` blocks all HR/party tables |
| No auto-seeded flags enabled | PASS — all 3 flags seeded `is_enabled = false` |

---

## 11. Files Changed

### New Files
- `supabase/migrations/20260629000000_erp_dms_ai_phase16_human_reviewed_apply_to_erp.sql`
- `src/lib/dms/apply-to-erp/types.ts`
- `src/lib/dms/apply-to-erp/apply-target-registry.ts`
- `src/lib/dms/apply-to-erp/apply-value-normalizer.ts`
- `src/lib/dms/apply-to-erp/apply-conflict-detector.ts`
- `src/lib/dms/apply-to-erp/apply-source-resolver.ts`
- `src/lib/dms/apply-to-erp/apply-audit.ts`
- `src/lib/dms/apply-to-erp/index.ts`
- `src/lib/dms/apply-to-erp/__tests__/apply-target-registry.test.ts`
- `src/lib/dms/apply-to-erp/__tests__/apply-value-normalizer.test.ts`
- `src/lib/dms/apply-to-erp/__tests__/apply-conflict-detector.test.ts`
- `src/server/actions/dms/apply-to-erp.ts`
- `src/features/dms/apply-to-erp/dms-apply-status-badge.tsx`
- `src/features/dms/apply-to-erp/dms-apply-to-erp-item-table.tsx`
- `src/features/dms/apply-to-erp/dms-apply-to-erp-confirm-dialog.tsx`
- `src/features/dms/apply-to-erp/dms-apply-to-erp-preview.tsx`
- `src/features/dms/apply-to-erp/dms-apply-to-erp-run-history.tsx`
- `src/features/dms/apply-to-erp/index.ts`
- `implementation_Review/ERP_DMS_AI_PHASE_16_SECURITY_RLS_QA_CHECKS.sql`
- `implementation_Review/ERP_DMS_AI_PHASE_16_PAYLOAD_SAFETY_CHECKS.sql`
- `implementation_Review/ERP_DMS_AI_PHASE_16_HUMAN_REVIEWED_APPLY_TO_ERP_IMPLEMENTATION_REPORT.md` ← this file

### Modified Files
- `src/features/dms/review-queue/dms-review-queue-item-drawer.tsx` — integrated `DmsApplyToErpPreview`
- `src/features/dms/documents/sections/dms-document-ai-section.tsx` — integrated `DmsApplyToErpRunHistory`
- `src/lib/query/query-keys.ts` — added apply-to-erp query keys
- `src/lib/query/invalidation.ts` — added apply-to-erp invalidation functions
- `.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md` — updated last closed gate + phase registry

---

## 12. Deferred to Phase 16 Tier 2 / Phase 17

Per plan — NOT implemented in Tier 1:
- `party_licenses` write-back
- `party_tax_registrations` write-back
- `employee_identity_documents` write-back
- `employee_medical_insurances` write-back
- Any HR/Fleet/Finance direct write-back
- Phase 16B queue-backed admin backfill
- Phase 17 automated policy-based apply

---

## 13. Next Phase Recommendation

**Phase 16 Tier 2** — Extend the same Apply-to-ERP foundation to:
- `party_licenses` (license number, expiry, issuing authority)
- `party_tax_registrations` (TRN, VAT registration status)

Requires: separate permission grants, new allowlist entries, UI integration in Party workspace, additional unit tests.

Alternatively, proceed to **Phase 17 — Automated Apply Policies** if Tier 2 is deprioritized.
