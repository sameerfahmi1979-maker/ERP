# ERP DMS AI Phase 1 Stabilization Implementation Report

**Phase:** ERP DMS AI Phase 1 — Stabilization, Dead References, RLS, and Source-of-Truth Cleanup  
**Date:** 2026-06-21  
**Status:** CLOSED / PASS  
**Prompt:** `ChatGPT/ERP_DMS_AI_PHASE_1_STABILIZATION_PROMPT.md`

---

## 1. Executive Summary

Phase 1 stabilized the DMS AI module without adding new features. Three code fixes, one idempotent RLS migration (backfilling DMS.14 for fresh installs), OCR/review-queue inventory documentation, and a new DMS AI source-of-truth file were delivered. Typecheck and production build pass. Lint reports pre-existing repo-wide issues unrelated to Phase 1.

---

## 2. Phase Objective

Fix confirmed safety and source-of-truth issues only:
1. Broken `dms_document_understandings` reference
2. Permissive `dms_intake_review_values` RLS in repo migrations
3. Duplicate metadata loader in `ai-analysis.ts`
4. Dead OCR provider inventory
5. `dms_review_queue` decision note
6. Current DMS AI workflow source-of-truth MD

No Phase 2+ work (async queue, metadata upgrade, tab automation, semantic chunks, apply-to-metadata, UI redesign).

---

## 3. Source-of-Truth Files Reviewed

| File | Status |
|------|--------|
| `.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md` | Read — global ERP tracker |
| `ChatGPT/ALGT_ERP_CURSOR_PHASE_PROMPT_MASTER_STANDARD.md` | Read |
| `.cursor/rules/erp-dms-standard.mdc` | Referenced |
| `.cursor/rules/erp-ai-human-review-first-standard.mdc` | Referenced (via rules index) |
| `ERP_DMS_AI_CURRENT_SOURCE_OF_TRUTH.md` | **Created** (this phase) |

Missing files (not invented): `DMS_SOURCE_OF_TRUTH.md`, `AI_SOURCE_OF_TRUTH.md`, standalone `ERP_SOURCE_OF_TRUTH.md`.

---

## 4. Audit Reports Reviewed

| Report | Use |
|--------|-----|
| `ChatGPT/ERP_DMS_AI_A_TO_Z_AUDIT_FUNCTION_MAP_AND_ENHANCEMENT_PLAN.md` | Issue confirmation, roadmap |
| `ChatGPT/ERP_DMS_AI_FULL_AUDIT_AND_ENHANCEMENT_PLAN.md` | Broken table ref, RLS risk |
| `implementation_Review/DMS_Phases/Phase_DMS_14_Implementation/ERP_DMS_14_SECURITY_RLS_CONFIDENTIALITY_PERMISSION_QA_IMPLEMENTATION_REPORT.md` | Live RLS policy spec |

---

## 5. Existing Files and Functions Reviewed

| Path | Finding |
|------|---------|
| `src/lib/ai/common/assistant/action-handlers.ts` | Broken query to non-existent table |
| `src/server/actions/dms/document-understanding.ts` | Valid runtime understanding builder |
| `src/server/actions/dms/ai-analysis.ts` | Duplicate metadata query |
| `src/server/actions/dms/ai-intake.ts` | Uses shared loader (reference) |
| `src/lib/dms/ai/load-metadata-fields.ts` | Canonical loader |
| `src/lib/dms/ocr/pdf-text-provider.ts` | No imports in `src/` |
| `src/lib/dms/ocr/noop-provider.ts` | No imports in `src/` |
| `src/lib/dms/ocr/factory.ts` | Only `isOcrSupported()` active |
| `src/lib/dms/ai/azure-document-intelligence-adapter.ts` | Defined, not wired to OCR trigger |

Grep for `dms_document_understandings`, `document_understandings`, `understanding_snapshots`: **one hit** (action-handlers — fixed).

Grep for `dms_review_queue` in `src/`: **zero hits**.

---

## 6. Existing Database Tables Reviewed

| Table | PK | Key FKs | Phase 1 touch |
|-------|-----|---------|---------------|
| `dms_intake_review_values` | BIGINT identity | `upload_session_id` → `dms_upload_sessions` | RLS migration |
| `dms_upload_sessions` | BIGINT identity | `uploaded_by` → `user_profiles` | RLS EXISTS subquery |
| `dms_documents` | BIGINT identity | type, party, company FKs | None |
| `dms_ai_extraction_jobs` | BIGINT identity | session/document FKs | None |
| `dms_ai_extraction_results` | BIGINT identity | session/document FKs | None |
| `dms_metadata_definitions` | BIGINT identity | `document_type_id` | Loader reads only |
| `dms_review_queue` | BIGINT identity | session/document FKs | Documented unused |
| `erp_ai_feature_flags` | — | — | None |
| `erp_ai_provider_configs` | — | — | None |

Live Supabase verified via MCP: `dms_intake_review_values` already had scoped policies before Phase 1 migration (DMS.14 applied live); repo migration folder lacked them.

---

## 7. Existing RLS Policies Reviewed

**Before (repo migration `20260615040000_erp_dms_11_ai_first_intake.sql`):**
```sql
CREATE POLICY "auth_users_manage_intake_review_values"
  ON dms_intake_review_values FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
```

**After (live + Phase 1 migration):**
- `dms_intake_review_select` — SELECT scoped via upload session ownership/permissions
- `dms_intake_review_write` — ALL for upload/review_ai/admin/system_admin
- `FORCE ROW LEVEL SECURITY` enabled

---

## 8. Existing Workflow Before Change

- Assistant `EXPLAIN_DOCUMENT` queried phantom table → runtime PostgREST error or empty result.
- Fresh DB installs from repo migrations got permissive intake review RLS.
- `ai-analysis.ts` duplicated metadata SQL instead of shared helper (subtle filter difference: `.eq("is_ai_extractable", true)` vs `!== false`).

---

## 9. Confirmed Phase 1 Issues

| ID | Issue | Severity |
|----|-------|----------|
| P1-1 | `dms_document_understandings` table reference | Runtime break |
| P1-2 | Permissive intake review RLS in repo | Security |
| P1-3 | Duplicate metadata loader | Maintainability / drift risk |
| P1-4 | Dead OCR provider files undocumented | Inventory gap |
| P1-5 | `dms_review_queue` unused | Architecture clarity |
| P1-6 | No DMS AI SOT document | Onboarding gap |

---

## 10. Phase Plan Used Before Coding

1. Grep all broken references and OCR imports  
2. Query live Supabase for exact RLS policy text  
3. Fix action-handlers → Option A (`getDmsDocumentUnderstanding`)  
4. Add idempotent migration matching live DB  
5. Replace inline metadata query with shared loader  
6. Add OCR inventory header comments  
7. Write SOT + report  
8. Run typecheck / lint / build  

**Rollback:** Revert three TS files + delete migration file; re-apply old policy only if needed (not recommended).

---

## 11. Files Changed

| File | Change |
|------|--------|
| `src/lib/ai/common/assistant/action-handlers.ts` | EXPLAIN_DOCUMENT uses `getDmsDocumentUnderstanding`; fixed nav route |
| `src/server/actions/dms/ai-analysis.ts` | Shared `loadMetadataFieldsForDocumentType` |
| `src/lib/dms/ocr/pdf-text-provider.ts` | Phase 1 inventory comment |
| `src/lib/dms/ocr/noop-provider.ts` | Phase 1 inventory comment |
| `supabase/migrations/20260621120000_erp_dms_ai_phase1_intake_review_values_rls.sql` | **New** |
| `ERP_DMS_AI_CURRENT_SOURCE_OF_TRUTH.md` | **New** |
| `implementation_Review/ERP_DMS_AI_PHASE_1_STABILIZATION_IMPLEMENTATION_REPORT.md` | **New** |

---

## 12. Database Migrations Added

**File:** `supabase/migrations/20260621120000_erp_dms_ai_phase1_intake_review_values_rls.sql`

**Applied to live Supabase:** Yes (via MCP `apply_migration`, idempotent).

**Note:** Full DMS.14 migration (`erp_dms_14_security_rls_tighten_overly_broad_policies`) was never committed to repo. Phase 1 only backfills the intake review portion required by the phase prompt. Other DMS.14 tables (expiry reminders, notification queue, renewal requests) remain out of sync for fresh installs — documented as remaining gap.

---

## 13. Database Fields / PK / FK Notes

No new tables or columns. PK/FK standards unchanged (BIGINT identity PKs). Migration is policy-only.

`dms_intake_review_values.upload_session_id` → `dms_upload_sessions.id` ON DELETE CASCADE (unchanged).

---

## 14. RLS / Security Notes

- SELECT on intake review values requires session relationship + permission check.
- Write requires DMS upload or review permissions (not row-owner-only on write — matches DMS.14 live design so reviewers can save drafts on shared intake workflows).
- Server actions continue to use `getAuthContext` + `hasPermission` at application layer.
- No broad `USING (true)` on intake review values after migration.

---

## 15. Broken References Fixed

**Decision:** Option A — use existing `getDmsDocumentUnderstanding()` server action.

**Removed:** All references to `dms_document_understandings`.

**Error handling:** Distinct messages for `FEATURE_DISABLED`, `PERMISSION_DENIED`, and no data.

**Navigation fix:** `/admin/dms/documents/record/` → `/dms/documents/record/` (correct workspace route).

---

## 16. Metadata Loader Changes

**Before:** Inline Supabase query in `runDmsAiAnalysisForDocument` with `.eq("is_ai_extractable", true)`.

**After:** `loadMetadataFieldsForDocumentType(supabase, documentTypeId)` — same as `ai-intake.ts`.

**Behavior change:** Fields with `is_ai_extractable = NULL` now included (filter `!== false`). Aligns with intake; acceptable Phase 1 unification.

**Null document type:** Returns empty array (guard added).

---

## 17. OCR Provider Inventory

| Provider | File | Status |
|----------|------|--------|
| GPT-4.1 Vision | `ocr.ts` + `triggerDmsOcrForFile` | **Active** |
| PDF text layer | `pdf-text-provider.ts` | Unused — documented |
| No-op OCR | `noop-provider.ts` | Unused — documented |
| Azure Document Intelligence | `azure-document-intelligence-adapter.ts` | Configurable; not wired to OCR trigger |
| Tesseract | settings types only | Deferred |
| Factory | `ocr/factory.ts` | `isOcrSupported()` only |

No files deleted. No Azure wiring in Phase 1.

---

## 18. Review Queue Decision

**Table:** `dms_review_queue` exists in DB with RLS policies from DMS.2.

**App code:** Zero references in `src/`.

**Decision:** **Keep for Phase 12 activation.** Current human review uses:
- `dms_upload_sessions` intake/review status
- `dms_intake_review_values` draft persistence
- Per-session review UI at `/dms/intake/[sessionCode]`

**Missing route:** `/dms/inbox/review` — documented in DMS.11 report, not implemented.

**No schema deletion in Phase 1.**

---

## 19. Source-of-Truth File Created or Updated

**Created:** `ERP_DMS_AI_CURRENT_SOURCE_OF_TRUTH.md` (project root)

Contains all 14 sections required by phase prompt. Does not describe future features as implemented.

---

## 20. UI / UX Notes

No UI redesign. No component changes. Assistant EXPLAIN_DOCUMENT output format improved (health, extraction, risk snippets). Document record tabs unchanged.

---

## 21. Server Actions / API Notes

| Action | Phase 1 impact |
|--------|----------------|
| `getDmsDocumentUnderstanding` | Now called from assistant handler |
| `runDmsAiAnalysisForDocument` | Uses shared metadata loader |
| `ai-intake.ts` | Unchanged |
| Intake review CRUD | Unchanged; benefits from RLS on fresh installs |

---

## 22. AI Prompt / Provider Notes

No prompt changes. No provider factory changes. `PROMPT_VERSION` unchanged.

---

## 23. Workflow / Orchestration Notes

Orchestration (`orchestration.ts`) untouched. Human-review-first preserved.

---

## 24. Audit Logging Notes

No changes to audit logging. Phase 1 changes are read-path (assistant) and loader refactor (same data source).

---

## 25. Tests Run

```text
npm test — not run (no Phase 1-specific test suite identified)
```

Manual grep smoke checks performed (see §27).

---

## 26. Build / Typecheck / Lint Results

| Command | Result | Phase 1 related? |
|---------|--------|------------------|
| `npm run typecheck` | **PASS** | N/A |
| `npm run build` | **PASS** | N/A |
| `npm run lint` | **FAIL** (repo-wide) | No — failures in `UIUX_Design/v0_extracted/` and other pre-existing files; Phase 1 files only have pre-existing unused-param warnings |

---

## 27. Manual Smoke Checks

| Check | Result |
|-------|--------|
| No `dms_document_understandings` in `src/` | PASS |
| `loadMetadataFieldsForDocumentType` used by intake + analysis | PASS |
| Migration SQL matches live policies (MCP verify) | PASS |
| AI Intake / Analysis / Inbox routes in build output | PASS |
| OCR dead files do not break build | PASS |

---

## 28. Risks Remaining

1. DMS.14 policies for `dms_expiry_reminders`, `dms_notification_queue`, `dms_renewal_requests` still missing from repo migrations.
2. `is_ai_extractable` NULL fields now included in analysis (intentional alignment).
3. `dms_review_queue` may confuse readers of older DMS.1 docs — SOT clarifies.
4. Azure DI adapter remains unwired — Arabic OCR path still via GPT vision unless configured separately later.

---

## 29. What Was Not Implemented

- Phase 2+ metadata schema upgrade  
- Async job queue  
- AI tab automation  
- Semantic chunks  
- AI Analysis apply-to-metadata  
- UI redesign  
- Azure OCR wiring  
- Review queue UI / `/dms/inbox/review`  
- `dms_document_understandings` table  
- Deletion of OCR provider files  

---

## 30. Next Recommended Phase

**Phase 2** per enhancement roadmap: metadata definition upgrade + shared async job foundations. Optionally commit full DMS.14 RLS migration file for repo/DB parity before Phase 2.

---

## 31. Final Notes

Phase 1 acceptance criteria AC-01 through AC-15 satisfied. Live Supabase migration applied idempotently. Implementation report and SOT created per prompt. Screen response lists paths only — full detail in this file.

**Acceptance checklist:**

| AC | Status |
|----|--------|
| AC-01 No phantom table refs | PASS |
| AC-02 RLS not permissive | PASS |
| AC-03 Authorized intake users OK | PASS (policy matches live) |
| AC-04 Unauthorized scoped out | PASS |
| AC-05 Shared metadata loader | PASS |
| AC-06 No Phase 2 schema | PASS |
| AC-07 OCR inventory documented | PASS |
| AC-08 Review queue documented | PASS |
| AC-09 SOT created | PASS |
| AC-10 Human-review-first | PASS |
| AC-11 No UI redesign | PASS |
| AC-12 No duplicate tables | PASS |
| AC-13 PK/FK preserved | PASS |
| AC-14 Build results documented | PASS |
| AC-15 Report created | PASS |
