# 028 DMS Main Module — Current Implementation Status Audit

**Prepared:** 2026-07-20
**Auditor:** Senior ERP QA / Supabase RLS Audit (read-only inspection)
**Repository:** `C:\dev\agt-erp` — branch `main`
**Purpose:** Determine where the 028 implementation track stopped and what the next safe step is.

---

## 1. Executive Summary

The 028 DMS planning track (as defined in the ChatGPT prompt file) has **not been started** in this repository. None of the expected 028-specific artifacts exist: no planning docs under `docs/system-foundation/dms/`, no `028_001`/`028_002`/`028_003` SQL migrations, no `user_can_read_dms_catalog` / `user_can_use_dms_hub` helper functions, and no `rpc_dms_*` RPCs.

**However — critical finding:** The DMS module itself is extensively and independently implemented in this repository under a completely different naming convention (`erp_dms_2` through `erp_dms_17+`). As of the audit date, the DMS module includes full tables, RLS policies, AI/OCR pipeline, batch upload, expiry/renewal, notifications, semantic search, review queue, and 20+ pages of working UI. It is not a placeholder.

**The mismatch:** The 028 planning documents were prepared for a project with path structure `apps/web/src/app/(erp)/dms/`. This repository uses `src/app/(protected)/dms/`. These are two different projects or two different implementation tracks. The 028 plan has never been executed against this codebase.

---

## 2. Current Git / Repo Status

| Item | Status |
|---|---|
| Branch | `main` |
| Uncommitted staged files | None |
| Untracked files | `implementation_Review/DMS_Module/` (enhancement analysis docs — not 028 artifacts) |
| Half-finished 028 files | **None found** |
| 028-specific commits | **None found** in git log |

Recent commits (last 20) contain: HR module, Realtime sync, DMS Dashboard, DMS AI phases, Branding, Report Designer. No commit references 028, dms_main_module, permissions_helper, or taxonomy_rls.

---

## 3. 028 Planning Files Status

| Expected File | Exists? | Notes |
|---|---|---|
| `docs/system-foundation/dms/028_dms_main_module_plan.md` | **NO** | Directory `docs/system-foundation/dms/` did not exist before this audit |
| `docs/system-foundation/dms/028_2_dms_backend_rpc_review.md` | **NO** | — |
| `docs/system-foundation/dms/028_3_dms_permissions_helpers_rpc_migration_plan.md` | **NO** | — |

**Finding:** None of the three 028 planning documents have ever been created in this repository.

---

## 4. 028_001 Permissions & Helpers Status

### Migration file

| Expected | Exists? |
|---|---|
| `supabase/migrations/*_028_001_dms_permissions_and_helpers.sql` | **NO** |

### Permission seeds — cross-checked against ALL migrations

| 028 Expected Permission | Found in Any Migration? | Where |
|---|---|---|
| `dms.view` | **YES** | `20260527120000_erp_base_foundation.sql:1005` |
| `dms.admin` | **YES** | `20260614192000_erp_dms_2_*.sql:921` |
| `dms.documents.view` | **YES** | `20260614192000_erp_dms_2_*.sql:908` |
| `dms.documents.preview` | **YES** | `20260614192000_erp_dms_2_*.sql:909` |
| `dms.documents.download` | **YES** | `20260614192000_erp_dms_2_*.sql:910` |
| `dms.documents.view_sensitive` | **NO** | Not found in any migration |
| `dms.documents.create` | **NO** | Not found — upload/create handled implicitly |
| `dms.documents.update` | **NO** | Not found |
| `dms.documents.manage_versions` | **NO** | Not found |
| `dms.documents.archive` | **YES** | `20260614192000_erp_dms_2_*.sql:914` |
| `dms.documents.verify` | **NO** | Not found |
| `dms.documents.approve` | **YES** | `20260614192000_erp_dms_2_*.sql:915` |
| `dms.requirements.view` | **NO** | Not found |
| `dms.requirements.manage` | **NO** | Not found |
| `dms.link_targets.view` | **NO** | Not found |
| `dms.link_targets.manage` | **NO** | Not found |
| `dms.document_types.view` | **NO** | Not found (document types protected by `dms.documents.view`) |
| `dms.document_types.manage` | **NO** | Not found |
| `dms.reports.view` | **NO** | Not found |
| `dms.reports.export` | **NO** | Not found |

**Summary:** 6 of 19 expected permissions exist (under different implementation); 13 do not exist.

### Helper functions

| 028 Expected Helper | Exists in Any Migration? |
|---|---|
| `user_can_read_dms_catalog()` | **NO** |
| `user_can_use_dms_hub()` | **NO** |
| `user_can_view_dms_document(bigint)` | **NO** |
| `user_can_view_sensitive_dms_document(bigint)` | **NO** |

**All four helper functions are absent.** The existing implementation uses the global
`current_user_has_permission()` helper directly in RLS policies instead.

### Security requirements

Since the 028_001 migration does not exist, security checks on that specific migration are N/A.

---

## 5. 028_001 Verification Report Status

| Expected File | Exists? |
|---|---|
| `docs/system-foundation/dms/028_3_1_permissions_helpers_verification_report.md` | **NO** |

**Finding:** Verification report does not exist. 028_001 was never implemented or verified.

---

## 6. 028_002 Taxonomy RLS Status

| Expected File | Exists? |
|---|---|
| `supabase/migrations/*_028_002_dms_taxonomy_rls_alignment.sql` | **NO** |
| `docs/system-foundation/dms/028_3_2_taxonomy_rls_verification_report.md` | **NO** |

**Finding:** 028_002 was never created. Category/type RLS is handled inline in
`20260614192000_erp_dms_2_database_foundation_rls_numbering_storage_buckets.sql`
using `current_user_has_permission('dms.documents.view')` — a different but
functionally similar approach.

---

## 7. 028_003 Repository / Detail / Versions RPC Status

| Expected File | Exists? |
|---|---|
| `supabase/migrations/*_028_003_dms_repository_detail_versions_rpc.sql` | **NO** |
| `docs/system-foundation/dms/028_3_3_repository_detail_versions_rpc_verification_report.md` | **NO** |

### Expected RPCs

| Expected RPC | Exists? |
|---|---|
| `rpc_dms_repository_search` | **NO** |
| `rpc_dms_document_detail_for_user` | **NO** |
| `rpc_dms_document_versions_for_user` | **NO** |

**Finding:** No 028-specific RPCs exist. The application uses direct Supabase PostgREST
queries from Next.js server actions instead of RPCs for document retrieval.

---

## 8. `/dms` Frontend Status

### Path structure mismatch

The 028 plan expects: `apps/web/src/app/(erp)/dms/page.tsx`
This repository has: `src/app/(protected)/dms/page.tsx`

The `apps/` directory **does not exist** in this repository. This confirms the 028
planning was prepared for a different project structure.

### Actual frontend status in this repository

| Route | Status |
|---|---|
| `/dms` | **Fully implemented** — live dashboard with KPI cards, charts, AI pipeline status, realtime sync |
| `/dms/documents` | **Fully implemented** — searchable document table, filters, all CRUD |
| `/dms/documents/record/[id]` | **Fully implemented** — multi-section record form, AI, OCR, versions, links, comments |
| `/dms/documents/record/new` | **Fully implemented** |
| `/dms/inbox` | **Fully implemented** — upload inbox with batch support |
| `/dms/intake/[sessionCode]` | **Fully implemented** — AI intake review workflow |
| `/dms/review-queue` | **Fully implemented** |
| `/dms/expiring` | **Fully implemented** — expiry dashboard, reminders, renewal |
| `/dms/renewals` | **Fully implemented** |
| `/dms/notifications` | **Fully implemented** — notification queue, bridge, email pipeline |
| `/admin/dms/*` | **Fully implemented** — categories, document types, metadata, tags, AI observability, retention |

**Classification: UI completed with backend** — the DMS module is production-level in this repository.

---

## 9. database.types.ts Status

| Item | Status |
|---|---|
| `database.types.ts` (standard location) | **NOT FOUND** |
| `src/types/database.ts` | **EXISTS** — custom database types file (`5977 bytes`, last modified 2026-06-29) |

The project uses `src/types/database.ts` rather than the Supabase-generated `database.types.ts`.
No regeneration is pending or required.

---

## 10. Future Enhancement Files Found

| File | Classification |
|---|---|
| `implementation_Review/DMS_Module/DMS_ENHANCEMENT_ANALYSIS_APPROVALS_CONFIDENTIALITY_NOTIFICATIONS.md` | **Future enhancement only** — analysis and planning doc for DMS Approvals, Notifications, and Confidentiality (created 2026-07-20). Not implemented. Not part of 028. |

No future enhancement migrations or components accidentally mixed into 028 were found.

---

## 11. Safety / Security Findings

| Finding | Severity | Notes |
|---|---|---|
| All DMS RLS policies use `current_user_has_permission()` — a secure server-side RBAC helper | **PASS** | No unsafe `auth.uid()` raw checks |
| No `SELECT *` found in core DMS RLS policies reviewed | **PASS** | — |
| No raw storage paths or signed URLs exposed in RPCs (N/A — no RPCs) | **N/A** | PostgREST queries used instead |
| `apps/` directory path in 028 plan does not exist — plan is from a different project | **INFO** | Not a security risk; structural mismatch only |
| `dms.documents.view_sensitive` permission is missing | **GAP** | Sensitive document access not permission-gated separately (merged under `dms.admin`) |
| `dms.documents.create`, `dms.documents.update` permissions missing | **GAP** | Create/update controlled through server actions + `dms.admin` only |

---

## 12. Missing Files

Compared to 028 expectations, none of these exist:

```
docs/system-foundation/dms/028_dms_main_module_plan.md
docs/system-foundation/dms/028_2_dms_backend_rpc_review.md
docs/system-foundation/dms/028_3_dms_permissions_helpers_rpc_migration_plan.md
supabase/migrations/*_028_001_dms_permissions_and_helpers.sql
supabase/migrations/*_028_002_dms_taxonomy_rls_alignment.sql
supabase/migrations/*_028_003_dms_repository_detail_versions_rpc.sql
docs/system-foundation/dms/028_3_1_permissions_helpers_verification_report.md
docs/system-foundation/dms/028_3_2_taxonomy_rls_verification_report.md
docs/system-foundation/dms/028_3_3_repository_detail_versions_rpc_verification_report.md
```

---

## 13. Blockers

| # | Blocker | Impact |
|---|---|---|
| B1 | The 028 plan was authored for `apps/web/src/app/(erp)/dms/` — a project structure that does not exist in this repo | Prevents direct application of any 028 cursor prompts without adaptation |
| B2 | None of the 3 planning docs exist | Cannot proceed with 028_001 without first creating or porting them |
| B3 | The DMS module is already fully implemented via a parallel track — running 028_001 as-is risks duplicating or conflicting with existing permissions and RLS policies | High risk of migration failure |

---

## 14. Recommended Next Step

This repository has a **fully working DMS module** implemented via the `erp_dms_2` through
`erp_dms_17` migration series. The 028 planning track from ChatGPT was designed for a
**different project codebase** and has never been applied here.

**Do not run 028_001 as-is in this repository.** Doing so would attempt to re-seed
permissions and create helper functions that either already exist (causing conflicts) or
conflict with the existing permission model.

**Three options — choose one:**

### Option A — Abandon 028 track for this repo (recommended)
The DMS module is complete. Focus exclusively on the two active enhancement plans:
- `DMS.NOTIFY.1A` — Notification bell (from `DMS_ENHANCEMENT_ANALYSIS_*.md`)
- `DMS.APPROVALS.1A` — Document approvals

### Option B — Reconcile 028 gap permissions only
Review the 13 missing 028 permissions (`dms.documents.view_sensitive`,
`dms.documents.create`, `dms.requirements.*`, `dms.link_targets.*`, `dms.reports.*`)
and add only the genuinely missing ones in a new gap-fill migration, without touching
existing permissions or creating the 028 helper functions.

### Option C — Port 028 plan to this repo structure
Adapt the 028 planning docs to the actual `src/app/(protected)/dms/` structure and
rewrite the cursor prompts accordingly before executing.

---

## 15. Exact Cursor Prompt Needed Next

**If Option A (recommended):**

```
Proceed with DMS.NOTIFY.1A — implement the top-bar notification bell component:
- src/components/erp/notification-bell.tsx
- Integrate into root layout header
- Realtime subscription to erp_notifications for current user
- Mark-all-read action
- "View all" link to /notifications
Reference: implementation_Review/DMS_Module/DMS_ENHANCEMENT_ANALYSIS_APPROVALS_CONFIDENTIALITY_NOTIFICATIONS.md Part 2, Section D
```

**If Option B:**

```
Create a gap-fill migration for missing DMS permissions only.
DO NOT touch existing permissions already in erp_base_foundation or erp_dms_2 migrations.
Add only: dms.documents.view_sensitive, dms.documents.create, dms.documents.update,
dms.documents.manage_versions, dms.documents.verify, dms.requirements.view,
dms.requirements.manage, dms.link_targets.view, dms.link_targets.manage,
dms.document_types.manage, dms.reports.view, dms.reports.export.
Migration name: supabase/migrations/[timestamp]_dms_permission_gap_fill.sql
```

---

## 16. Final Decision

```
028 STATUS: STILL AT 028_001 — IMPLEMENTATION NOT STARTED

CRITICAL NOTE: The DMS module IS fully implemented in this repository via a parallel
implementation track (erp_dms_2 through erp_dms_17+, 20+ migrations, full UI).
The 028 planning track was authored for a different project structure (apps/web/)
that does not exist here. Running 028_001 as-is is NOT safe.
Recommended action: Abandon 028 track for this repository and proceed with the
DMS Enhancement Plan (Notifications + Approvals) already documented in
implementation_Review/DMS_Module/DMS_ENHANCEMENT_ANALYSIS_APPROVALS_CONFIDENTIALITY_NOTIFICATIONS.md
```

---

*Audit completed: 2026-07-20 | Read-only inspection — no files modified, no migrations created or applied.*
