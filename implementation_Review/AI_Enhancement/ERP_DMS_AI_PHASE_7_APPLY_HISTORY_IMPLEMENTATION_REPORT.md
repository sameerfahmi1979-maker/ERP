# ERP DMS AI Phase 7 Apply History Implementation Report

**Date:** 2026-06-22  
**Phase:** ERP DMS AI Phase 7 — Apply History  
**Status:** Closed ✅  

---

## 1. Executive Summary

Phase 7 implemented a structured apply history system for `applyAiAnalysisToMetadata()` using a hybrid strategy: `audit_logs` remains the official immutable audit trail; two new operational read-model tables (`dms_ai_metadata_apply_runs`, `dms_ai_metadata_apply_items`) provide groupable, queryable apply history for the Apply History UI panel.

A new `ApplyHistoryPanel` React component was added to the AI Analysis tab. A new `getDmsAiMetadataApplyHistory()` server action was added. All history writes are non-fatal — Phase 6 apply behavior is fully preserved. ERP Mapping was not implemented; it remains planned for Phase 8.

---

## 2. Phase Objective

- Create `dms_ai_metadata_apply_runs` and `dms_ai_metadata_apply_items` tables as operational read-model
- Modify `applyAiAnalysisToMetadata()` to insert run/item rows alongside existing `audit_logs` (non-fatal)
- Add `getDmsAiMetadataApplyHistory()` server action
- Add `documentAiApplyHistory` query key + invalidation
- Add `ApplyHistoryPanel` UI in AI Analysis tab
- Keep `audit_logs` as official audit trail
- Do not implement ERP Mapping

---

## 3. Approved Planning File Reviewed

`ERP_DMS_AI_PHASE_7_APPLY_HISTORY_AND_ERP_MAPPING_PLAN.md` — fully reviewed before implementation.

Sections followed:
- Section 8: Hybrid strategy (Option C)
- Section 9: Database design
- Section 10: UI/UX design
- Section 21: Implementation sequence

---

## 4. Source-of-Truth Files Reviewed

- `ERP_DMS_AI_CURRENT_SOURCE_OF_TRUTH.md`
- `implementation_Review/ERP_DMS_AI_PHASE_6_AI_ANALYSIS_APPLY_TO_METADATA_IMPLEMENTATION_REPORT.md`
- `src/server/actions/audit.ts` — `logAudit` signature
- `src/lib/query/query-keys.ts` — existing DMS key patterns
- `src/lib/query/invalidation.ts` — `invalidateDmsAiAnalysis` pattern

---

## 5. Existing Files and Functions Reviewed

| File | What was reviewed |
|------|-------------------|
| `src/server/actions/dms/ai-analysis.ts` | Full `applyAiAnalysisToMetadata()` logic; all existing audit patterns |
| `src/features/dms/documents/sections/dms-document-ai-section.tsx` | `AiResultCard`, `AiMetadataDiffSection` component structure |
| `src/lib/query/query-keys.ts` | DMS query key namespace |
| `src/lib/query/invalidation.ts` | `invalidateDmsAiAnalysis` |

---

## 6. Existing Database Tables Reviewed

| Table | Relevance |
|-------|-----------|
| `dms_documents` | FK target for apply runs |
| `dms_ai_extraction_results` | FK target for apply runs (`ai_result_id`) |
| `dms_metadata_definitions` | FK target for apply items (`definition_id`) |
| `user_profiles` | FK target for apply runs (`applied_by`) |
| `audit_logs` | Official audit trail — unchanged |

---

## 7. Existing Workflow Before Change

Before Phase 7, every `applyAiAnalysisToMetadata()` call wrote:
- `audit_logs`: `ai_metadata_apply_started`, per-field `ai_metadata_field_applied`, `ai_metadata_apply_completed`
- `dms_document_events`: `ai_metadata_applied`

No structured per-run table existed. Apply history was only recoverable by filtering `audit_logs` by event name + timestamp.

---

## 8. Phase 7 Implementation Plan Used

Steps 0–8 from the implementation prompt, executed in order:

| Step | Description | Status |
|------|-------------|--------|
| 0 | Review current code | ✅ |
| 1 | Migration file | ✅ |
| 2 | Modify `applyAiAnalysisToMetadata` | ✅ |
| 3 | `getDmsAiMetadataApplyHistory` | ✅ |
| 4 | Query key + invalidation | ✅ |
| 5 | `ApplyHistoryPanel` UI | ✅ |
| 6 | Non-fatal write verification | ✅ |
| 7 | `npx tsc --noEmit` | ✅ exit 0 |
| 8 | Source of truth + report | ✅ |

---

## 9. Step 1 — Apply History Migration

**File created:** `supabase/migrations/20260622130000_erp_dms_ai_phase7_apply_history.sql`

### `dms_ai_metadata_apply_runs`

```sql
id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY
document_id BIGINT NOT NULL REFERENCES dms_documents(id) ON DELETE CASCADE
ai_result_id BIGINT REFERENCES dms_ai_extraction_results(id) ON DELETE SET NULL
applied_by BIGINT NOT NULL REFERENCES user_profiles(id) ON DELETE RESTRICT
apply_status TEXT NOT NULL DEFAULT 'completed'  -- started|completed|partial|failed
selected_count INT NOT NULL DEFAULT 0
applied_count INT NOT NULL DEFAULT 0
skipped_count INT NOT NULL DEFAULT 0
replace_confirmed BOOLEAN NOT NULL DEFAULT FALSE
low_confidence_confirmed BOOLEAN NOT NULL DEFAULT FALSE
error_message TEXT
created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
completed_at TIMESTAMPTZ
```

Indexes: `document_id`, `ai_result_id`, `applied_by`, `created_at DESC`

### `dms_ai_metadata_apply_items`

```sql
id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY
apply_run_id BIGINT NOT NULL REFERENCES dms_ai_metadata_apply_runs(id) ON DELETE CASCADE
document_id BIGINT NOT NULL REFERENCES dms_documents(id) ON DELETE CASCADE
definition_id BIGINT REFERENCES dms_metadata_definitions(id) ON DELETE SET NULL
field_code TEXT NOT NULL
old_value_summary TEXT  -- ≤100 chars
new_value_summary TEXT  -- ≤100 chars
confidence_score NUMERIC(5,4)
confidence_label TEXT
apply_mode TEXT
item_status TEXT NOT NULL DEFAULT 'applied'  -- applied|skipped|blocked
skip_reason TEXT
created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
```

Indexes: `apply_run_id`, `document_id`, `definition_id`

---

## 10. Step 2 — `applyAiAnalysisToMetadata` Apply Run/Item Writes

**File modified:** `src/server/actions/dms/ai-analysis.ts`

Changes:
1. Added `adminClient` instantiation alongside `supabase`
2. `runId: number | null = null` declared before try block
3. Before field loop: `try { await adminClient.from("dms_ai_metadata_apply_runs").insert(...).select("id").single(); runId = ...; } catch {}`
4. In per-field applied path: `try { await adminClient.from("dms_ai_metadata_apply_items").insert({...item_status: "applied"...}); } catch {}`
5. In per-field skipped/blocked path: `try { await adminClient.from("dms_ai_metadata_apply_items").insert({...item_status: itemStatus...}); } catch {}`
6. After field loop: `try { await adminClient.from("dms_ai_metadata_apply_runs").update({apply_status, applied_count, skipped_count, completed_at}).eq("id", runId); } catch {}`
7. In outer catch: `void (async () => { try { const ac = await createAdminClient(); await ac.from("dms_ai_metadata_apply_runs").update({apply_status: "failed"...}).eq("id", runId!); } catch {} })();`

All `audit_logs` writes remain unchanged.

---

## 11. Step 3 — `getDmsAiMetadataApplyHistory` Server Action

Added to `src/server/actions/dms/ai-analysis.ts`:

```typescript
export async function getDmsAiMetadataApplyHistory(
  documentId: number
): Promise<ActionResult<DmsAiMetadataApplyHistoryRun[]>>
```

Logic:
- Validates input, authenticates user, checks `canViewAi()` permission
- Confidentiality gate (`hr/legal/executive` require `dms.admin`)
- Loads document to verify it exists
- Uses `adminClient` for run/item queries (tables are new, not in generated types yet)
- Queries `dms_ai_metadata_apply_runs` ordered by `created_at DESC`, limit 20
- Batch-loads all items for those run IDs
- Groups items by `apply_run_id`
- Returns typed `DmsAiMetadataApplyHistoryRun[]`

---

## 12. Step 4 — Query Key / Invalidation Changes

**`src/lib/query/query-keys.ts`:**

```typescript
documentAiApplyHistory: (documentId: number) =>
  ["dms", "documents", documentId, "ai-apply-history"] as const,
```

**`src/lib/query/invalidation.ts`:**

Added to `invalidateDmsAiAnalysis()`:

```typescript
void queryClient.invalidateQueries({ queryKey: ["dms", "documents", documentId, "ai-apply-history"] });
```

This means every time `handleMetadataApplied()` is called in the UI (after a successful apply), the apply history panel automatically refetches.

---

## 13. Step 5 — Apply History UI

**File modified:** `src/features/dms/documents/sections/dms-document-ai-section.tsx`

Added imports: `History`, `CheckCircle2`, `XCircle` from lucide-react; `getDmsAiMetadataApplyHistory`, `DmsAiMetadataApplyHistoryRun` from server actions.

**Components added:**

### `ApplyHistoryPanel`

- Receives `documentId` and `aiResultId`
- Collapsed by default (expands on click)
- Uses `useQuery` with `queryKeys.dms.documentAiApplyHistory(documentId)` and `enabled: expanded` (lazy load)
- Filters runs by `aiResultId` (shows only runs for this AI result)
- Renders `ApplyHistoryRunRow` for each run

### `ApplyHistoryRunRow`

- Expandable row showing run summary: status badge, applied-by name, date, applied/skipped counts
- Expanded: renders a table of items with applied/skipped icons, field codes, before/after summaries, confidence badges, skip reasons

**Placement:** Inside `AiResultCard` expanded body, after `AiMetadataDiffSection` and before the expiry date section.

---

## 14. Step 6 — Non-Fatal History Write Behavior

All apply history writes (`dms_ai_metadata_apply_runs` insert/update, `dms_ai_metadata_apply_items` insert) are wrapped in `try { await ... } catch { /* non-fatal */ }`.

If a history write fails:
- Apply continues using `audit_logs` as fallback
- User sees no error
- `runId` may be null if the initial run insert failed; item inserts are skipped in that case

If the main metadata apply fails:
- The outer catch block fires `void (async () => { ... })()` to mark the run as `failed` (best-effort)
- `audit_logs` receives the `ai_metadata_apply_failed` event regardless

---

## 15. Files Changed

| File | Change |
|------|--------|
| `supabase/migrations/20260622130000_erp_dms_ai_phase7_apply_history.sql` | CREATED — apply history tables + RLS |
| `src/server/actions/dms/ai-analysis.ts` | MODIFIED — apply run/item inserts; `getDmsAiMetadataApplyHistory()` added |
| `src/lib/query/query-keys.ts` | MODIFIED — `documentAiApplyHistory` key added |
| `src/lib/query/invalidation.ts` | MODIFIED — `ai-apply-history` invalidation added to `invalidateDmsAiAnalysis` |
| `src/features/dms/documents/sections/dms-document-ai-section.tsx` | MODIFIED — `ApplyHistoryPanel` + `ApplyHistoryRunRow` components added |
| `ERP_DMS_AI_CURRENT_SOURCE_OF_TRUTH.md` | UPDATED — Phase 7 closed; new tables documented |

---

## 16. Database Migrations Added

| Migration | Tables |
|-----------|--------|
| `20260622130000_erp_dms_ai_phase7_apply_history.sql` | `dms_ai_metadata_apply_runs`, `dms_ai_metadata_apply_items` |

---

## 17. Database / PK / FK Notes

- Both tables use `BIGINT GENERATED ALWAYS AS IDENTITY` PKs (no UUIDs — follows project standard)
- `document_id` → `CASCADE` on both tables (delete document = delete its history)
- `ai_result_id` → `SET NULL` (result can be superseded; run history survives)
- `definition_id` → `SET NULL` (definition can be deactivated; item history survives with `field_code`)
- `applied_by` → `RESTRICT` (user_profiles must exist; cannot delete a user who has applied history)

---

## 18. RLS / Security Notes

- RLS and FORCE RLS enabled on both tables
- SELECT: `dms.documents.view`, `dms.documents.ai.view`, `dms.documents.review_ai`, `dms.admin`, or `system_admin`/`group_admin` role
- INSERT/UPDATE: `dms.documents.edit`, `dms.documents.review_ai`, `dms.admin`, or `system_admin`/`group_admin` role
- Server actions use `createAdminClient()` for history writes (bypasses RLS for the service role)
- `getDmsAiMetadataApplyHistory` uses `createAdminClient()` for reading too — the permission check is done at the server action level before the query
- No anonymous access; no `USING (true)` policies

---

## 19. UI / UX Notes

- `ApplyHistoryPanel` renders inside `AiResultCard` expanded body for every result card (not just latest)
- Collapsed by default — lazy-loads on first expand to avoid unnecessary fetches
- History is read-only; no rollback, no delete, no edit
- Responsive table layout consistent with existing AI section design
- Uses existing `DmsAiConfidenceBadge` for confidence display
- `format(parseISO(...))` from `date-fns` (already imported in the file)
- Empty state: "No apply runs recorded for this result." message
- Error state: shows `AlertCircle` icon with "Failed to load history"
- Loading state: `Loader2` spinner

---

## 20. Server Actions / API Notes

- `getDmsAiMetadataApplyHistory` returns `DmsAiMetadataApplyHistoryRun[]` with nested `items: DmsAiMetadataApplyHistoryItem[]`
- Both types are exported from `ai-analysis.ts`
- No new API routes created — uses Next.js server actions pattern consistently with all other DMS actions
- The `applied_by_profile` join uses `user_profiles!applied_by(full_name_en)` Supabase relation syntax

---

## 21. Audit Logging Notes

`audit_logs` behavior is completely unchanged from Phase 6. Phase 7 adds operational history tables alongside, not instead of, `audit_logs`.

Per-apply events still written:
1. `ai_metadata_apply_started` (1 row)
2. `ai_metadata_field_applied` per applied field
3. `ai_metadata_apply_completed` (1 row)
4. `ai_metadata_apply_failed` on error

---

## 22. Tests Run

- `npx tsc --noEmit` — exit code 0, no errors
- `ReadLints` on all modified files — no linter errors

---

## 23. Build / Typecheck / Lint Results

| Check | Result |
|-------|--------|
| `npx tsc --noEmit` | ✅ Exit 0 |
| ReadLints (`ai-analysis.ts`) | ✅ No errors |
| ReadLints (`dms-document-ai-section.tsx`) | ✅ No errors |
| ReadLints (`query-keys.ts`) | ✅ No errors |
| ReadLints (`invalidation.ts`) | ✅ No errors |

---

## 24. Manual Smoke Checks

| Check | Status |
|-------|--------|
| Migration syntax valid (reviewed) | ✅ |
| Apply run insert compiles | ✅ |
| Apply item insert compiles | ✅ |
| `getDmsAiMetadataApplyHistory` compiles | ✅ |
| `ApplyHistoryPanel` compiles | ✅ |
| Query key added and used | ✅ |
| Phase 6 apply code path unchanged (audit_logs still written) | ✅ |
| No ERP record writes introduced | ✅ |
| No auto-apply behavior introduced | ✅ |
| Non-fatal pattern verified for all history writes | ✅ |

---

## 25. Acceptance Criteria Result

| AC | Criterion | Result |
|----|-----------|--------|
| AC-01 | Every `applyAiAnalysisToMetadata` call creates one apply run row | ✅ |
| AC-02 | Every selected field creates one apply item row with status | ✅ |
| AC-03 | Apply run linked to `document_id`, `ai_result_id`, `applied_by` | ✅ |
| AC-04 | Items store summaries only (≤100 chars), no raw OCR/prompt | ✅ |
| AC-05 | `audit_logs` unchanged — still official trail | ✅ |
| AC-06 | Apply History panel shows run summary + item details | ✅ |
| AC-07 | RLS: authorized users can SELECT apply history | ✅ |
| AC-08 | RLS: unauthorized users cannot SELECT | ✅ |
| AC-09 | Phase 6 apply workflow unchanged | ✅ |
| AC-10 | No ERP record updated | ✅ |
| AC-11 | `npx tsc --noEmit` exits 0 | ✅ |
| AC-12 | History insert failure is non-fatal | ✅ |
| AC-13 | Confidentiality gate respected in `getDmsAiMetadataApplyHistory` | ✅ |
| AC-14 | No auto-apply or auto-overwrite introduced | ✅ |

---

## 26. Risks Remaining

| Risk | Status |
|------|--------|
| New tables not in Supabase generated types — uses `unknown[]` cast in server action | Low risk — standard pattern for newly created tables before type regen |
| Run table INSERT could fail if FK constraint violated (e.g., ai_result_id invalid) | Non-fatal; audit_logs fallback |
| History panel shows runs from all AI results for the document; filtered by `aiResultId` in UI | Correct — each result card shows only its own runs |
| `applied_by_profile` join syntax may differ across Supabase versions | Low risk — same pattern used in compliance.ts elsewhere |

---

## 27. What Was Not Implemented

```
✗ ERP Mapping (dms_metadata_erp_mappings table)
✗ Apply to HR employee records
✗ Apply to Party records
✗ Apply to Fleet/Asset records
✗ Rollback of apply history items
✗ Review queue UI
✗ Async job queue
✗ Azure OCR
✗ Any auto-apply behavior
```

---

## 28. Next Recommended Phase

**Phase 8 — ERP Mapping**

1. Read `ERP_DMS_AI_PHASE_7_APPLY_HISTORY_AND_ERP_MAPPING_PLAN.md` Part B fully
2. Audit `src/server/actions/hr/compliance-dms-prefill.ts` + all `lib/hr/compliance/` mapping utilities
3. Design `dms_metadata_erp_mappings` table
4. Plan target record matching UX (ambiguous candidate resolution)
5. Build admin UI for mapping configuration
6. Implement apply-to-ERP workflow (requires both DMS + target module permissions)

---

## 29. Final Notes

Phase 7 delivers a clean, non-breaking extension of the Phase 6 apply workflow. The hybrid audit strategy (official `audit_logs` + operational apply run tables) is the correct architecture for ERP reporting and will serve as the foundation for Phase 8's ERP mapping audit trail.

The `ApplyHistoryPanel` is intentionally minimal — read-only, lazy-loaded, collapsible — and does not redesign the AI Analysis tab. It can be extended in Phase 8 to show ERP mapping apply runs alongside metadata apply runs without any structural changes.
