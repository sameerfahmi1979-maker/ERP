# DMS.2A — Approval Schema Gap-Fill Implementation Report

**Phase:** DMS.2A — First sub-phase of DMS.2 (Full Approval System)  
**Date:** 2026-07-20  
**Status:** ✅ SCHEMA GAP-FILL IMPLEMENTED — READY FOR REVIEW

---

## 1. Executive Summary

DMS.2A created the full database foundation for the DMS business approval workflow. A single idempotent migration added three columns to `dms_documents`, six columns to `dms_document_approvals`, a new `action` CHECK constraint, four RLS policies, six new approval permissions, four notification templates, and an `updated_at` trigger on `dms_document_workflows`. The migration was applied to the live Supabase project and verified clean. TypeScript types were regenerated. Zero DMS-related type errors were introduced.

---

## 2. Mandatory Rules / Source Files Reviewed

| File | Status |
|---|---|
| `.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md` | Read |
| `.cursor/rules/algt-erp-source-of-truth.mdc` | Applied (always) |
| `.cursor/rules/erp-child-dialog-form-standard.mdc` | Applied (always) |
| `.cursor/rules/erp-workspace-save-close-standard.mdc` | Applied (always) |
| `implementation_Review/DMS_Module/DMS_0_EXISTING_DMS_BASELINE_AND_SCOPE_LOCK.md` | Read |
| `implementation_Review/DMS_Module/DMS_1_NOTIFICATION_SYSTEM_REVIEW_FIX_AND_CLOSURE_REPORT.md` | Read |
| `implementation_Review/DMS_Module/DMS_2_FULL_APPROVAL_SYSTEM_PLANNING_REPORT.md` | Read |
| `supabase/migrations/20260614192000_erp_dms_2_database_foundation_rls_numbering_storage_buckets.sql` | Checked |

---

## 3. Missing Rule / Source Files

| File | Status |
|---|---|
| `implementation_Review/DMS_Module/DMS_ENHANCEMENT_ANALYSIS_APPROVALS_CONFIDENTIALITY_NOTIFICATIONS.md` | Not found — not blocking; planning report is the authoritative reference. |
| `.cursorrules` | Not present in repo root — acceptable. |

---

## 4. Live DB / Schema Verification

### dms_documents (before migration)
| Column | Present |
|---|---|
| `approval_status` | ❌ Missing |
| `submitted_by` | ❌ Missing |
| `submitted_at` | ❌ Missing |
| `status` | ✅ exists (TEXT NOT NULL default 'draft') |
| `review_status` | ✅ exists (TEXT NOT NULL default 'not_required') |

### dms_document_approvals (before migration)
| Column | Present |
|---|---|
| `id`, `document_id`, `workflow_id`, `step_id` | ✅ |
| `action` | ✅ TEXT NOT NULL, **no CHECK constraint** |
| `actioned_by`, `actioned_at`, `comments`, `created_at` | ✅ |
| `submitted_by`, `submitted_at`, `reason`, `is_current`, `updated_at`, `updated_by` | ❌ All missing |

**Existing CHECK constraints on `dms_document_approvals`:** None (only FK + PK).  
**Row count before migration:** 0 — safe to add new constraints.

### dms_document_workflows triggers
No triggers present before migration.

### set_updated_at() function
Confirmed to exist in `public` schema.

### erp_notification_templates (DMS templates before migration)
Only `DMS_EXPIRY_REMINDER` and `DMS_DOCUMENT_EXPIRED` existed.

### Approval permissions
None seeded for `dms.approvals.*` before migration.

### user_profiles FK pattern
Confirmed via `dms_document_approvals_actioned_by_fkey` → `user_profiles(id) ON DELETE SET NULL`. Followed same pattern for new FKs.

---

## 5. Migration Created

**File:** `supabase/migrations/20260720150000_dms_2a_approval_schema_gap_fill.sql`

8 sections:
1. Extend `dms_documents` (3 columns + CHECK + 3 indexes)
2. Extend `dms_document_approvals` (6 columns + 6 indexes)
3. Align `dms_document_approvals.action` CHECK constraint
4. RLS policies on `dms_document_approvals` (4 policies)
5. Seed 6 approval permissions
6. Seed 4 approval notification templates
7. `set_updated_at` trigger on `dms_document_workflows`
8. Validation block (raises EXCEPTION if any object missing)

---

## 6. Migration Applied Status

**✅ APPLIED** — Applied to live Supabase project `mmiefuieduzdiiwnqpie` via `user-supabase` MCP `apply_migration` tool. Result: `{"success":true}`. Validation block ran and passed with `RAISE NOTICE 'DMS.2A VALIDATION PASSED'`.

---

## 7. dms_documents Changes

| Column | Type | Nullable | Constraint | Index |
|---|---|---|---|---|
| `approval_status` | TEXT | YES | CHECK IN (pending_approval, approved, rejected, withdrawn) OR NULL | `idx_dms_documents_approval_status` (partial) |
| `submitted_by` | BIGINT | YES | FK → `user_profiles(id)` ON DELETE SET NULL | `idx_dms_documents_submitted_by` (partial) |
| `submitted_at` | TIMESTAMPTZ | YES | — | `idx_dms_documents_submitted_at` (partial DESC) |

Existing `status` and `review_status` columns: **untouched**.

---

## 8. dms_document_approvals Changes

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `submitted_by` | BIGINT | YES | — | FK → `user_profiles(id)` ON DELETE SET NULL |
| `submitted_at` | TIMESTAMPTZ | YES | — | When approval was submitted |
| `reason` | TEXT | YES | — | Required by server action for `rejected`; server-enforced |
| `is_current` | BOOLEAN | NOT NULL | `false` | Marks active/pending approval row |
| `updated_at` | TIMESTAMPTZ | YES | `now()` | Auto-maintained by trigger (future) |
| `updated_by` | BIGINT | YES | — | FK → `user_profiles(id)` ON DELETE SET NULL |

Indexes added: `idx_dms_approvals_document_id`, `idx_dms_approvals_document_current` (partial), `idx_dms_approvals_submitted_by`, `idx_dms_approvals_actioned_by`, `idx_dms_approvals_action`, `idx_dms_approvals_submitted_at`.

---

## 9. Action Constraint Alignment

**Situation:** No existing CHECK constraint on `dms_document_approvals.action` (confirmed from live DB). Table had 0 rows.

**Resolution:** New CHECK constraint added:
```sql
CONSTRAINT dms_document_approvals_action_chk
CHECK (action IN ('submitted','approved','rejected','withdrawn','returned','escalated'))
```

Constraint is TEXT-based (no DB ENUM). Old planning report values (`approved`, `rejected`, `returned`, `escalated`) all preserved plus new required values (`submitted`, `withdrawn`). No existing data was affected (0 rows). No old constraint was dropped.

---

## 10. RLS Policy Changes

All four old `dms_approvals_*` policies dropped (IF EXISTS — none existed) and recreated:

| Policy | Operation | Rule Summary |
|---|---|---|
| `dms_approvals_select` | SELECT | `dms.admin` OR `dms.approvals.admin` OR `dms.approvals.view` OR `dms.approvals.history.view` OR `dms.documents.approve` OR `system_admin` OR own submitted/actioned rows |
| `dms_approvals_insert` | INSERT | `dms.admin` OR `dms.approvals.admin` OR `dms.approvals.submit` OR `dms.approvals.act` OR `dms.approvals.withdraw` OR `dms.documents.approve` OR `system_admin` |
| `dms_approvals_update` | UPDATE | `dms.admin` OR `dms.approvals.admin` OR `dms.approvals.act` OR `dms.approvals.withdraw` OR `dms.documents.approve` OR `system_admin` |
| `dms_approvals_delete` | DELETE | `dms.admin` OR `dms.approvals.admin` OR `system_admin` |

- Uses `current_user_has_permission()` and `current_user_has_role()` — both confirmed to exist from prior DMS migrations.
- `anon` denied (all policies require `auth.uid() IS NOT NULL`).
- No broad `USING (true)` policy.
- No service_role exposed in frontend.

---

## 11. Permission Seeds

All 6 seeded idempotently with `ON CONFLICT (permission_code) DO UPDATE`:

| Permission Code | Action | Description |
|---|---|---|
| `dms.approvals.view` | view | View approval queue and pending requests |
| `dms.approvals.submit` | create | Submit documents for approval |
| `dms.approvals.act` | approve | Approve or reject pending documents |
| `dms.approvals.withdraw` | manage | Withdraw a pending approval request |
| `dms.approvals.admin` | admin | Full administration of approval workflows |
| `dms.approvals.history.view` | view | View full approval audit history |

Existing `dms.documents.approve` permission: **preserved and untouched**.  
Role grants: **not assigned** in this phase — deferred to DMS.2B or admin configuration, consistent with project pattern.

---

## 12. Notification Template Seeds

All 4 seeded with `ON CONFLICT (template_code) DO NOTHING`:

| Template Code | Severity | In-App | Email |
|---|---|---|---|
| `DMS_APPROVAL_REQUESTED` | info | ✅ | ✅ |
| `DMS_APPROVED` | info | ✅ | ✅ |
| `DMS_REJECTED` | urgent | ✅ | ✅ |
| `DMS_APPROVAL_WITHDRAWN` | warning | ✅ | ❌ |

Variables used across templates: `document_no`, `title`, `document_type`, `actor_name`, `action_date`, `action_url`, `comments_or_reason`.

Note: `erp_notification_templates` does not have a `variable_schema` column — omitted (confirmed from live schema). Templates follow the same pattern as `DMS_EXPIRY_REMINDER`.

No DMS.1 HR templates seeded here. No DMS.3 confidentiality templates seeded here.

---

## 13. Updated_at Trigger Review

**`dms_document_workflows`:** No trigger existed before migration. `set_updated_at()` function confirmed in `public` schema.

Trigger created:
```sql
CREATE TRIGGER set_dms_document_workflows_updated_at
  BEFORE UPDATE ON public.dms_document_workflows
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
```

`dms_approve_runs` table: **untouched** (AI intake only — not part of DMS.2A scope).

---

## 14. Validation Block Results

The migration included a comprehensive `DO $$` validation block that checked:
- All 3 new columns on `dms_documents` ✅
- All 6 new columns on `dms_document_approvals` ✅
- `dms_document_approvals_action_chk` constraint ✅
- `dms_documents_approval_status_chk` constraint ✅
- All 6 new approval permissions ✅
- All 4 new notification templates ✅
- `set_dms_document_workflows_updated_at` trigger ✅

Validation raised `NOTICE 'DMS.2A VALIDATION PASSED'` — no exceptions.

---

## 15. Type Regeneration Status

**✅ COMPLETED.**

Command used:
```powershell
npx supabase gen types typescript --project-id mmiefuieduzdiiwnqpie 2>$null | Out-File src/types/database.ts -Encoding utf8
```

New columns confirmed in generated types:
- `dms_documents`: `approval_status`, `submitted_by`, `submitted_at` ✅
- `dms_document_approvals`: `is_current`, `reason`, `submitted_at`, `submitted_by`, `updated_at`, `updated_by` + FK entries ✅

**DMS-related TypeScript errors:** 0

---

## 16. Files Created

| File | Purpose |
|---|---|
| `supabase/migrations/20260720150000_dms_2a_approval_schema_gap_fill.sql` | DMS.2A migration |
| `implementation_Review/DMS_Module/DMS_2A_SCHEMA_GAP_FILL_IMPLEMENTATION_REPORT.md` | This report |

---

## 17. Files Modified

| File | Change |
|---|---|
| `src/types/database.ts` | Regenerated with new approval columns |

---

## 18. Build / Typecheck / Lint Results

| Check | Result | Notes |
|---|---|---|
| `npx tsc --noEmit` | Exits with pre-existing errors | 0 DMS-related errors. All errors are pre-existing in `audit/`, `branches/`, `permissions/`, `roles/` features — no DMS or approval-related errors introduced. |
| DMS-specific typecheck | ✅ PASS | `npx tsc --noEmit 2>&1 \| Where-Object { $_ -match "dms" }` → 0 results |
| Migration syntax | ✅ PASS | Applied successfully via MCP |
| No destructive drops | ✅ PASS | Only DROP IF EXISTS for RLS policies (none existed), no table drops, no data drops |
| No database ENUM created | ✅ PASS | All constraints use TEXT + CHECK |
| `dms_approve_runs` untouched | ✅ PASS | Not referenced in migration |
| Old 028 objects | ✅ PASS | None created |

---

## 19. Remaining Risks / Follow-Ups

| Risk / Item | Severity | Action |
|---|---|---|
| `dms_document_approvals.updated_at` has no trigger | Low | `set_updated_at()` could be attached in DMS.2B; not critical for schema phase |
| Role grants for approval permissions not assigned | Low | Deferred to admin RBAC configuration or DMS.2B |
| `reason` NOT NULL constraint for rejected action | Low | Enforced at server action level in DMS.2B (not DB constraint, to avoid blocking migration) |
| `is_current` uniqueness (only one active row per document) | Low | Enforced at server action level in DMS.2B using transaction-safe UPDATE + INSERT |
| Pre-existing TS errors in non-DMS features | Info | Pre-existing, not introduced by DMS.2A |

---

## 20. DMS.2B Readiness

DMS.2B (server actions) is now unblocked. The schema provides:

- ✅ `dms_documents.approval_status` — for status filtering and transitions
- ✅ `dms_documents.submitted_by/submitted_at` — for queue display and audit
- ✅ `dms_document_approvals.is_current` — for active request tracking
- ✅ `dms_document_approvals.reason` — for rejection reason capture
- ✅ `dms_document_approvals.submitted_by/submitted_at` — for timeline display
- ✅ `action` CHECK constraint — blocks invalid action values at DB level
- ✅ 6 permissions — can be checked in server action guards immediately
- ✅ 4 notification templates — can be used in approval workflow notifications
- ✅ RLS policies — approval rows protected with permission-gated access

**DMS.2B can proceed.** Recommended implementation order: `submitForApproval`, `approveDocument`, `rejectDocument`, `withdrawApproval` server actions, each with permission guard + `is_current` management + `erp_notifications` dispatch.

---

## 21. Final Decision

**DMS.2A SCHEMA GAP-FILL IMPLEMENTED — READY FOR REVIEW**
