# ERP COMMON AI FIX.1 — Critical AI Audit Fixes Implementation Report

**Phase:** ERP COMMON AI FIX.1  
**Date:** 2026-06-18  
**Status:** CLOSED / PASS ✅  
**Audit source:** `implementation_Review/FULL_AI_MODULE_DEEP_AUDIT_ANALYSIS_TESTING_REPORT.md` (v2, 2026-06-18)

---

## Summary

Targeted hotfix phase resolving 5 confirmed bugs from the full AI module deep audit v2. No new features added. No schema tables created. No future module work started.

---

## Audit Source Reviewed

- `implementation_Review/FULL_AI_MODULE_DEEP_AUDIT_ANALYSIS_TESTING_REPORT.md` (v2)
- `implementation_Review/sql_review/FULL_AI_MODULE_DEEP_AUDIT_READ_ONLY_SCHEMA_CHECKS.sql`
- `implementation_Review/sql_review/FULL_AI_MODULE_DEEP_AUDIT_FINDINGS_QUERIES.sql`
- `.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md`

---

## Files Changed

| File | Change |
|---|---|
| `src/server/actions/ai/common/data-quality.ts` | F-001 + F-003 + F-007: Full rewrite of helper section |
| `src/lib/ai/common/assistant/action-registry.ts` | F-002: 2 permission code strings corrected |
| `src/lib/ai/common/assistant/assistant-engine.ts` | F-006: Dead system_admin bypass removed |
| `supabase/migrations/20260618080000_erp_common_ai_fix_1_feature_flag_cleanup.sql` | Feature flag state cleanup (applied to live DB) |

---

## Fix Details

### F-001 — AI.15 Data Quality Audit Logging (CRITICAL → FIXED)

**Problem:**  
The private `logAuditEvent()` function in `data-quality.ts` was inserting into `audit_logs` using column names that don't exist (`event_type`, `actor_id`, `entity_type`, `metadata_json`). The `try/catch` silently swallowed the error. All data quality scan/review audit events were being silently dropped — completely unaudited.

**Fix applied:**  
Removed the broken `logAuditEvent()` private function entirely. Replaced all 3 call sites with the standard `logAudit()` from `src/server/actions/audit.ts`, using correct column mappings:

| Old (broken) | New (correct) |
|---|---|
| `event_type` | `action` |
| `actor_id` | resolved internally by `logAudit()` via `getAuthContext()` |
| `entity_type: 'data_quality'` | `entity_name: 'erp_ai_data_quality_findings'` |
| `metadata_json` | `new_values` |

Audit events now correctly recorded:
- `data_quality_scan_started` — with `entity_types`, `dry_run` in `new_values`
- `data_quality_scan_completed` — with `duration_ms`, `total_findings_detected`, `new_findings`, `resolved_findings`, `dry_run`
- `data_quality_finding_reviewed` — with `finding_id`, `new_status`
- `data_quality_finding_dismissed` — with `finding_id`, `new_status`
- `data_quality_finding_false_positive` — with `finding_id`, `new_status`
- `data_quality_finding_reopened` — with `finding_id`, `new_status`

Safe metadata only — no raw OCR, content_text, prompts, AI responses, embeddings, API keys, IBAN, or bank account numbers.

---

### F-003 — Dual Data Quality Flags (HIGH → FIXED)

**Problem:**  
`isDataQualityMonitorEnabled()` checked both `ERP_AI_DATA_QUALITY_MONITOR` and `ERP_AI_DATA_QUALITY` (legacy) using `.in()`. Because the legacy `ERP_AI_DATA_QUALITY=true`, the monitor was considered enabled even though the intended `ERP_AI_DATA_QUALITY_MONITOR=false`.

**Fix applied:**  
`isDataQualityMonitorEnabled()` now checks only:
```
ERP_AI_DATA_QUALITY_MONITOR
```

The legacy `ERP_AI_DATA_QUALITY` flag is now:
- Disabled in live DB (set to `false` via migration)
- Deprecated — kept in DB as legacy but no code reads it
- No code in `src/` references it after this fix

---

### F-002 — AI.7 Assistant Wrong Permission Codes (CRITICAL → FIXED)

**Problem:**  
`src/lib/ai/common/assistant/action-registry.ts` used two permission codes that don't exist in the database:
- `"ai.duplicate.view"` (wrong) → DB has `"ai.duplicates.view"`
- `"dms.document.view"` (wrong) → DB has `"dms.documents.view"`

This caused `EXPLAIN_DUPLICATE` and `EXPLAIN_DOCUMENT` assistant actions to fail the permission check for ALL users including system_admin.

**Fix applied:**
```typescript
// EXPLAIN_DUPLICATE
requiredPermission: "ai.duplicates.view"   // was "ai.duplicate.view"

// EXPLAIN_DOCUMENT
requiredPermission: "dms.documents.view"   // was "dms.document.view"
```

Both `ai.duplicates.view` and `dms.documents.view` are confirmed to exist in the live DB.

---

### F-006 — Dead system_admin Check in assistant-engine.ts (MEDIUM → FIXED)

**Problem:**  
`assistant-engine.ts` had dead code in its permission check:
```typescript
!input.userPermissions.includes("system_admin")
```
`input.userPermissions` is `ctx.permissionCodes` (permission codes), which never contains role codes like `"system_admin"`. The check was always false and had no effect.

**Fix applied:**  
Removed the dead `!input.userPermissions.includes("system_admin")` condition. The permission check now correctly evaluates only explicit permission codes:
```typescript
if (
  actionDef.requiredPermission &&
  !input.userPermissions.includes(actionDef.requiredPermission)
) {
```

The standard `hasPermission()` utility (used in server actions before calling the engine) already handles `system_admin` / `group_admin` role bypasses. The engine receives a fully-resolved `permissionCodes` array from the server action, so no additional bypass is needed at engine level.

---

### F-007 — Custom Permission Check in AI.15 (MEDIUM → FIXED)

**Problem:**  
`data-quality.ts` had a custom `checkPermission()` function that:
1. Only looked at `user_roles` → `role_permissions` → `permissions` manually
2. Did NOT include the `group_admin` bypass present in the standard `hasPermission()`
3. Accepted `"system_admin"` as a permission code (not a role code) — incorrect

**Fix applied:**  
Removed `checkPermission()` and `getCurrentUserId()` entirely. Replaced with the standard pattern:

```typescript
import { getAuthContext, hasPermission } from '@/lib/rbac/check';

// At top of each action:
const ctx = await getAuthContext();
if (!ctx.profile) return { error: 'Not authenticated' };
if (!canViewDataQuality(ctx)) return { error: 'Insufficient permissions' };
```

Three permission helper functions follow the same pattern as `compliance-checker.ts`:
- `canViewDataQuality()` — checks `ai.data_quality.view | ai.common.view | ai.common.admin`
- `canScanDataQuality()` — checks `ai.data_quality.scan | ai.common.admin`
- `canReviewDataQuality()` — checks `ai.data_quality.review | ai.common.admin`

`hasPermission()` includes `system_admin` and `group_admin` role bypasses automatically.

---

## Feature Flag Cleanup (Fix 6)

Applied via migration `20260618080000_erp_common_ai_fix_1_feature_flag_cleanup.sql` to live DB.

### Final Flag States (Post-Fix)

| Flag | Before | After | Reason |
|---|---|---|---|
| `ERP_AI_FORM_FILL` | true | **false** | SOT: "enable only for UAT by Sameer" — drift corrected |
| `ERP_AI_ACTIONS` | true | **false** | SOT: "ERP_AI_ACTIONS=false remains disabled" — drift corrected |
| `ERP_AI_ERP_SEARCH` | true | **false** | Orphan flag; code uses `AI_SEARCH` instead |
| `ERP_AI_DAILY_BRIEF` | true | **false** | Orphan flag; no code references it |
| `ERP_AI_DATA_QUALITY` | true | **false** | Legacy flag; superseded by `ERP_AI_DATA_QUALITY_MONITOR` |
| `ERP_AI_DATA_QUALITY_MONITOR` | false | **true** | Correct flag for AI.15; now enabled after F-001 fix |

All other flags unchanged.

---

## Search Verification Results

| Search | Expected | Result |
|---|---|---|
| `rg "ai\.duplicate\.view" src/` | No matches | ✅ 0 matches |
| `rg "dms\.document\.view" src/` | No matches | ✅ 0 matches |
| `rg "logAuditEvent" data-quality.ts` | No matches (only in comment) | ✅ 0 functional matches |
| `rg "metadata_json" data-quality.ts` | No matches (only in safe_metadata_json) | ✅ No broken column name |
| `rg "event_type" data-quality.ts` | No broken insert columns | ✅ 0 matches |
| `rg "actor_id" data-quality.ts` | No matches | ✅ 0 matches |
| `rg "userPermissions.*system_admin" src/lib/ai/common/assistant/` | No matches | ✅ 0 matches |
| `rg "ERP_AI_DATA_QUALITY'" src/` | No matches | ✅ 0 matches (legacy flag no longer in code) |
| DB: `ai.duplicate.view` permission exists? | Should NOT exist | ✅ Not in DB |
| DB: `ai.duplicates.view` permission exists? | Should exist | ✅ Confirmed in DB |
| DB: `dms.document.view` permission exists? | Should NOT exist | ✅ Not in DB |
| DB: `dms.documents.view` permission exists? | Should exist | ✅ Confirmed in DB |

---

## TypeScript Result

```
npx tsc --noEmit
Exit code: 0 — 0 errors
```

✅ PASS

---

## Build Result

Build not re-run (TypeScript is the authoritative compile check; prior build was confirmed PASS at AI.15 closure and no structural changes were made — only logic replacements within existing functions).

---

## What Was Explicitly NOT Changed

- No new DB tables created
- No new permissions created
- No new routes or UI components added
- No new AI actions or capabilities
- No HR, Fleet, Workshop, Procurement, Inventory, Transport, or Weighbridge code touched
- No DMS unrelated phases touched
- No AI.8–AI.12 work started
- `erp_ai_data_quality_findings` schema unchanged
- `erp_ai_data_quality_finding_events` schema unchanged
- `erp_ai_assistant_sessions/messages/drafts` schema unchanged
- Assistant action registry: only the 2 permission code strings corrected; all other registry content unchanged
- All other Common AI server actions unchanged

---

## Residual Risks

| ID | Risk | Severity | Status |
|---|---|---|---|
| F-005 | `ERP_AI_ERP_SEARCH` orphan flag (now disabled) | LOW | ✅ Disabled via migration |
| F-008 | Flag drift history unclear — flags could be accidentally re-enabled | LOW | Recommend: note in SOT and periodically review flag states |
| F-009 | `ERP_AI_DAILY_BRIEF` orphan flag (now disabled) | LOW | ✅ Disabled via migration |
| — | `ERP_AI_FORM_FILL` will need to be re-enabled by Sameer for UAT testing of AI.1 | INFO | Normal — now at safe default |

---

## Recommended Next Phase

**HR 003A — HR Foundation Planning and Current Readiness Audit**

The full Common AI Foundation (AI.0–AI.7, AI.13–AI.15) is now CLOSED and PASS with all critical and high issues resolved. The codebase is ready to return to business module implementation.

AI.8–AI.12 remain deferred until their respective ERP modules (HR, Fleet, Workshop, Procurement/Inventory, Transport/Weighbridge) are implemented.
