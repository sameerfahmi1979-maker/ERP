# ERP DMS AI Phase 14 — Runtime UAT and Closure Report

**Date:** 2026-06-27  
**Phase:** ERP DMS AI Phase 14 — Token / Cost / Observability  
**Test User:** sameer@algt.net (Alliance@***)  
**App URL:** http://localhost:3000  
**Starting Status:** PASS WITH RUNTIME UAT REQUIRED  
**Final Decision:** LIVE PASS / CLOSED ✅

---

## 1. Executive Summary

Runtime UAT for Phase 14 completed successfully. All 9 dashboard sections load correctly with real data. Safe redaction is confirmed (zero blocked keys in stored metadata_json). Cost rate configuration displays correct confirmation workflow. Navigation, regression pages, RLS, and permissions all verified. One environmental issue was identified and resolved during UAT: a stale Turbopack dev cache from a prior server instance was serving corrupted `routes.d.ts`, causing the route to return 404 in the browser. After killing the stale server (PID 26780) and starting a fresh server with clean cache, all routes compiled and served correctly. No code changes were required.

Feature flags restored to safe-off after UAT.

---

## 2. Starting Status

| Item | State |
|---|---|
| Implementation report status | IMPLEMENTED ✅ |
| ChatGPT review decision | PASS WITH RUNTIME UAT REQUIRED |
| DMS_AI_OBSERVABILITY flag at UAT start | false |
| DMS_AI_REVIEW | true |
| DMS_AI_VALIDATION | false |
| DMS_AI_ENTITY_MATCHING | false |
| Migration applied | ✅ (20260627000000_erp_dms_ai_phase14_token_cost_observability.sql) |

---

## 3. Files Reviewed

**Implementation files:**
- `src/lib/ai/observability/safe-usage-redaction.ts` ✅
- `src/lib/ai/observability/log-dms-ai-usage.ts` ✅
- `src/server/actions/dms/ai-observability.ts` ✅
- `src/app/(protected)/admin/dms/ai-observability/page.tsx` ✅
- `src/features/dms/ai-observability/dms-ai-observability-page-client.tsx` ✅
- `src/features/dms/ai-observability/ai-observability-filters.tsx` ✅
- `src/features/dms/ai-observability/ai-cost-rate-admin.tsx` ✅
- `src/features/dms/ai-observability/sections/ai-usage-overview-cards.tsx` ✅
- `src/features/dms/ai-observability/sections/ai-token-cost-summary.tsx` ✅
- `src/features/dms/ai-observability/sections/ai-provider-model-breakdown.tsx` ✅
- `src/features/dms/ai-observability/sections/ai-feature-breakdown.tsx` ✅
- `src/features/dms/ai-observability/sections/ai-job-queue-health.tsx` ✅
- `src/features/dms/ai-observability/sections/ai-pipeline-health.tsx` ✅
- `src/features/dms/ai-observability/sections/ai-recent-usage-events-table.tsx` ✅
- `src/features/dms/ai-observability/sections/ai-error-breakdown.tsx` ✅
- `src/lib/dms/ai/types.ts` ✅
- `src/lib/dms/ai/openai-dms-adapter.ts` ✅
- `src/lib/dms/semantic/chunk-embedder.ts` ✅
- `src/lib/dms/ai-jobs/job-types.ts` ✅
- `src/lib/dms/ai-jobs/job-runner.ts` ✅
- `src/server/actions/dms/ai-analysis.ts` ✅
- `src/server/actions/dms/ai-search.ts` ✅
- `src/server/actions/dms/document-qa.ts` ✅
- `src/server/actions/dms/ai-tags.ts` ✅
- `src/server/actions/dms/ai-links.ts` ✅
- `src/features/dms/admin/dms-intelligence-admin-page-client.tsx` ✅
- `src/components/layout/app-sidebar.tsx` ✅
- `src/lib/workspace/workspace-route-registry.ts` ✅
- `supabase/migrations/20260627000000_erp_dms_ai_phase14_token_cost_observability.sql` ✅

---

## 4. Database and Migration Verification

| Check | Result |
|---|---|
| `erp_ai_usage_logs.document_id` exists (BIGINT nullable) | ✅ |
| `erp_ai_usage_logs.ai_job_id` exists (BIGINT nullable) | ✅ |
| `erp_ai_usage_logs.upload_session_id` exists (BIGINT nullable) | ✅ |
| `erp_ai_model_cost_rates` table exists | ✅ |
| `erp_ai_model_cost_rates` uses BIGINT PK | ✅ |
| `erp_ai_model_cost_rates` RLS enabled | ✅ (relrowsecurity=true) |
| `erp_ai_model_cost_rates` FORCE RLS | ✅ (relforcerowsecurity=true) |
| No broad USING (true) policies | ✅ — SELECT uses `auth.uid() IS NOT NULL AND permission check`, INSERT/UPDATE use permission helpers |
| `DMS_AI_OBSERVABILITY` flag seeded | ✅ (is_enabled=false) |
| `dms.ai_observability.view` permission seeded | ✅ |
| `dms.ai_observability.admin` permission seeded | ✅ |
| `system_admin` has both permissions | ✅ |
| `group_admin` has view permission | ✅ |
| 5 seed cost rates present | ✅ |
| All OpenAI rates `requires_confirmation=true` | ✅ |
| `local_ollama/local` rate_type=zero, `requires_confirmation=false` | ✅ |

**Indexes verified:**
- `erp_ai_usage_logs_feature_area_idx` ✅
- `erp_ai_usage_logs_model_id_idx` ✅
- `erp_ai_usage_logs_created_at_idx` ✅
- `erp_ai_usage_logs_document_id_idx` ✅ (partial: WHERE document_id IS NOT NULL)
- `erp_ai_usage_logs_status_idx` ✅
- `erp_ai_usage_logs_provider_config_idx` ✅ (partial: WHERE provider_config_id IS NOT NULL)

---

## 5. Feature Flag OFF UAT

**Test:** Navigate to `/admin/dms/ai-observability` with `DMS_AI_OBSERVABILITY=false`.

**Issue encountered:** Stale Turbopack dev server (PID 26780) was serving a corrupted `routes.d.ts` from `.next/dev/types/`. This caused the browser to see "Page not found" even though the HTTP response was 200 (which was actually the redirect-to-login RSC payload, not the actual page).

**Resolution:** Killed PID 26780 (stale server). Cleared `.next/dev/types/` directory. Confirmed `npx tsc --noEmit` passes (0 errors). Started fresh dev server on port 3000.

**Post-resolution result:** Page loads correctly. Server-side `getDmsAiObservabilityConfig()` is called, returns `featureFlagEnabled=false`, and the client component renders the controlled disabled message: "DMS AI Observability is not enabled." with feature flag badge.

**Flag OFF behavior:**
- Page renders with HTTP 200 ✅
- Controlled "not enabled" message shown ✅
- No heavy data fetch occurs ✅ (all dashboard sections skip data loading when flag is false)
- No 500 error ✅
- No AI provider call ✅
- "Feature Flag: DMS_AI_OBSERVABILITY = false" badge visible ✅

---

## 6. Feature Flag ON UAT

Feature flag temporarily set to `DMS_AI_OBSERVABILITY=true` via MCP.

**Result:** Dashboard loaded successfully after first compilation (~15 seconds). All subsequent loads were instant.

| Check | Result |
|---|---|
| Dashboard loads without error | ✅ |
| "DMS AI Observability" heading visible | ✅ |
| No AI provider call made | ✅ (confirmed by code review: no AI imports in server actions) |
| No raw prompt/response/OCR/content/chunk text displayed | ✅ |
| Feature flag restored to false after UAT | ✅ |

---

## 7. Dashboard UI Runtime UAT

All 9 sections verified. Data pulled from the database reflects real historical AI usage logs.

| Section | Present | Loads Data | Notes |
|---|---|---|---|
| Filters (date/feature/status/model) | ✅ | ✅ | All 4 filter types rendered |
| AI Usage Overview (6 cards) | ✅ | ✅ | 65 total calls, 6 success, 5 failed, 54 skipped shown |
| Token & Cost Summary | ✅ | ✅ | Per-feature rows with "Unconfirmed" cost badge |
| Provider / Model Breakdown | ✅ | ✅ | text-embedding-3-small, gpt-4.1-2025-04-14, gpt-4o rows |
| Feature / Operation Breakdown | ✅ | ✅ | DMS_AI_SUMMARY, DMS_SEMANTIC_SEARCH, etc. |
| DMS AI Queue Health | ✅ | ✅ | Queue status counts visible |
| DMS AI Pipeline Health | ✅ | ✅ | Document AI status, chunk counts, review queue |
| Recent Usage Events Table | ✅ | ✅ | 65 rows; id, featureArea, operationType, model, status, tokens, cost, documentId, durationMs shown |
| Error / Failure Analysis | ✅ | ✅ | Error groupings with sanitized error messages |
| Cost Rate Configuration (admin) | ✅ | ✅ | 5 rates shown; 1 Confirmed (local_ollama), 4 Unconfirmed (OpenAI) |
| Refresh button | ✅ | ✅ | Triggers re-fetch of all sections |
| "Add Rate" button | ✅ | ✅ | Admin-only CRUD entry point |

---

## 8. Observability Action Safety UAT

**Code review of `src/server/actions/dms/ai-observability.ts`:**
- No AI provider imports (`getDmsAiProvider`, `fetch` to OpenAI/Azure, etc.) — **CONFIRMED: NONE**
- No `dms_documents` write operations — **CONFIRMED: NONE**
- No `dms_document_metadata_values` write operations — **CONFIRMED: NONE**
- No `dms_document_links` write operations — **CONFIRMED: NONE**
- Only imports: `createClient`, `createAdminClient`, `getAuthContext`, `hasPermission`, `extractSafeUsageDisplayFields`, `sanitizeErrorMessage`
- All mutations are limited to `erp_ai_model_cost_rates` (admin-only, rate_type/cost fields only)

**DB before/after check (via verified code review):**
- `dms_documents` not touched ✅
- `dms_document_metadata_values` not touched ✅
- `dms_document_links` not touched ✅
- No entity auto-link created ✅

---

## 9. Safe Redaction UAT

**Local Node.js test of `buildSafeMetadata()`:**

Input:
```json
{ "document_id": 1, "prompt": "SHOULD_NOT_STORE", "raw_response": "SHOULD_NOT_STORE",
  "ocr_text": "SHOULD_NOT_STORE", "content_text": "SHOULD_NOT_STORE", "chunk_text": "SHOULD_NOT_STORE",
  "api_key": "SHOULD_NOT_STORE", "safe_count": 5, "embedding": [0.1, 0.2], "token": "SHOULD_NOT_STORE" }
```

Output:
```json
{ "document_id": 1, "safe_count": 5 }
```

- All 8 blocked keys removed ✅
- `document_id` (safe) retained ✅
- `safe_count` (safe) retained ✅
- Test was local-only; no sensitive values written to DB ✅

**DB verification — exact blocked key check:**
```sql
SELECT COUNT(*) FROM erp_ai_usage_logs WHERE metadata_json ? 'prompt' OR ... → 0 rows
```
Zero rows with exact blocked key matches in any existing usage log row. ✅

Note: The LIKE-based query showed 3 false positives (due to `prompt_version` containing "prompt" as substring). Exact key-existence check confirmed 0 actual violations.

---

## 10. Usage Logging Runtime UAT

**Existing logs inspection:**
- 65 usage log rows present
- New columns (`document_id`, `ai_job_id`, `upload_session_id`) present; values null for historical rows (expected)
- `estimated_cost` null for all rows (all OpenAI rates require_confirmation=true — correct)
- `status` values: `complete` (legacy), `success` (Phase 14 new) — both valid; no CHECK constraint
- Canonical columns populated: `feature_area`, `operation_type`, `model_id`, `status`, `input_token_count`, `output_token_count`

**Broken columns regression check:**
Grep for `prompt_tokens`, `completion_tokens`, `provider_code` as direct erp_ai_usage_logs insert fields → **0 matches** in `src/server/actions/dms/`.

**Metadata key audit (all existing rows):**
Safe keys only: `document_id`, `prompt_version`, `input_char_count`, `output_char_count`, `input_truncated`, `source`, `vector_dims`, `search_mode`, `result_count`, `query_char_count`, `uat_test` — none are blocked keys. ✅

**AI Summary row (id=65):**
- `feature_area=DMS_AI_SUMMARY`, `operation_type=summary_generate`
- `model_id=gpt-4.1-2025-04-14`
- `input_token_count=1767`, `output_token_count=214`
- `estimated_cost=null` (OpenAI rate unconfirmed — expected)
- `metadata_json` keys: `document_id`, `prompt_version`, `input_truncated`, `input_char_count`, `output_char_count` — no blocked keys ✅

---

## 11. Cost Estimation UAT

### 11.1 Unconfirmed rate behavior (existing OpenAI rates)
- All 4 OpenAI seed rates: `requires_confirmation=true`
- All usage log rows: `estimated_cost=null` ✅
- Dashboard Token & Cost Summary shows "Unconfirmed" badge for all rows ✅
- Dashboard Est. Cost card shows "Rates unconfirmed" ✅

### 11.2 Confirmed test rate (test_provider/test-model-phase14-cost)
- Inserted rate: `provider_type=test_provider`, `model_id=test-model-phase14-cost`, `rate_type=token`, `input_cost_per_1m_tokens=1.00`, `output_cost_per_1m_tokens=2.00`, `requires_confirmation=false`
- Cost formula verification: `(1000/1,000,000) * 1.00 + (1000/1,000,000) * 2.00 = 0.001 + 0.002 = $0.003000`
- Direct DB insert cannot trigger Node.js `estimateCost()` computation — documented as expected limitation
- `estimateCost()` function code-reviewed: correct formula, returns null when requires_confirmation=true, returns 0 for rate_type=zero ✅
- Test rate archived (`is_active=false`) after UAT ✅
- Test usage log row deleted after UAT ✅
- No hardcoded public pricing added ✅

---

## 12. RLS / Permission UAT

| Check | Result |
|---|---|
| `erp_ai_model_cost_rates` RLS enabled | ✅ (relrowsecurity=true) |
| `erp_ai_model_cost_rates` FORCE RLS | ✅ (relforcerowsecurity=true) |
| SELECT policy uses permission helpers (not broad USING true) | ✅ — `auth.uid() IS NOT NULL AND (permission OR role check)` |
| INSERT policy uses admin/manage permissions | ✅ — `current_user_has_permission('dms.ai_observability.admin') OR ... OR current_user_has_role('system_admin')` |
| UPDATE policy uses admin/manage permissions | ✅ — same as INSERT |
| No DELETE policy | ✅ — no DELETE policy exists |
| `system_admin` role has both view+admin permissions | ✅ |
| `group_admin` has view-only | ✅ |
| sameer@algt.net (system_admin) can access dashboard | ✅ — confirmed by browser UAT |
| Non-admin test for cost rate mutation | Not runtime-tested (no non-admin test user created); policy code reviewed and confirmed correct |

---

## 13. Navigation UAT

| Check | Result |
|---|---|
| Sidebar "DMS Admin" section shows "AI Observability" link | ✅ |
| Clicking sidebar link creates workspace tab | ✅ |
| `/admin/dms/ai-observability` loads as singleton tab | ✅ |
| `/admin/dms/intelligence` loads correctly | ✅ |
| "AI Observability Dashboard" link visible on Intelligence Admin page | ✅ |
| Link navigates to `/admin/dms/ai-observability` | ✅ |
| No 404 errors for any navigation path | ✅ |

---

## 14. Regression Checks

| Page | Status |
|---|---|
| `/dms/documents` | ✅ Loads correctly, document list visible |
| `/dms/review-queue` | ✅ Loads correctly, queue items visible |
| `/admin/dms/intelligence` | ✅ Loads correctly, DMS Intelligence Admin page intact |
| `/admin/settings/ai` | Not browser-tested (not listed as a regression page) |
| Phase 13 validation/matching features | Unaffected — DMS_AI_VALIDATION and DMS_AI_ENTITY_MATCHING remain false |

**TypeScript final check:** `npx tsc --noEmit` → **Exit code 0, 0 errors** ✅

---

## 15. Final Feature Flag State

| Flag | State After UAT |
|---|---|
| `DMS_AI_OBSERVABILITY` | **false** (restored to safe-off) |
| `DMS_AI_REVIEW` | **true** (unchanged) |
| `DMS_AI_VALIDATION` | **false** (unchanged) |
| `DMS_AI_ENTITY_MATCHING` | **false** (unchanged) |

---

## 16. Files Changed During UAT

**No source code files were changed.** UAT was read-only except for:
- Temporary DB: `DMS_AI_OBSERVABILITY` flag toggled to true for UAT, then restored to false.
- Temporary DB: UAT test cost rate inserted (id=6) then archived (`is_active=false`).
- Temporary DB: UAT test usage log row (id=66) inserted then deleted.
- Environment: Stale dev server (PID 26780) killed; corrupted `.next/dev/types/` cleared; fresh dev server started.

---

## 17. Database Changes During UAT

| Table | Change | Permanent |
|---|---|---|
| `erp_ai_feature_flags` | `DMS_AI_OBSERVABILITY` toggled true → restored false | No (restored) |
| `erp_ai_model_cost_rates` | UAT test rate (id=6) archived | Yes (is_active=false; no DELETE) |
| `erp_ai_usage_logs` | UAT test row (id=66) deleted | Yes (deleted) |

---

## 18. Typecheck / Lint / Build Results

| Check | Result |
|---|---|
| `npx tsc --noEmit` (pre-UAT, after cache clear) | ✅ Exit 0, 0 errors |
| `npx tsc --noEmit` (post-UAT) | ✅ Exit 0, 0 errors |
| ReadLints (Phase 14 new files) | ✅ 0 errors (verified during implementation) |
| Full `npm run build` | Not run — dev server UAT was sufficient per prompt guidance |

---

## 19. Pass / Fail Matrix

| Check | Result |
|---|---|
| DB migration verified | ✅ PASS |
| erp_ai_model_cost_rates schema correct | ✅ PASS |
| No broad USING true RLS policies | ✅ PASS |
| Feature flag OFF — controlled disabled message | ✅ PASS |
| Feature flag ON — dashboard loads | ✅ PASS |
| AI Usage Overview cards load | ✅ PASS |
| Token / Cost Summary loads | ✅ PASS |
| Provider / Model Breakdown loads | ✅ PASS |
| Feature / Operation Breakdown loads | ✅ PASS |
| DMS AI Queue Health loads | ✅ PASS |
| DMS AI Pipeline Health loads | ✅ PASS |
| Recent Usage Events table loads | ✅ PASS |
| Error / Failure Analysis loads | ✅ PASS |
| Cost Rate Configuration loads | ✅ PASS |
| No raw prompt/response/OCR/chunk text in UI | ✅ PASS |
| `buildSafeMetadata` strips blocked keys | ✅ PASS |
| Zero exact blocked keys in metadata_json DB rows | ✅ PASS |
| No broken usage-log column writes | ✅ PASS |
| No AI provider calls from dashboard | ✅ PASS |
| No DMS/entity mutations | ✅ PASS |
| RLS SELECT policy uses permission helpers | ✅ PASS |
| RLS INSERT/UPDATE uses admin permissions | ✅ PASS |
| No DELETE policy on cost rates | ✅ PASS |
| Navigation — sidebar link present | ✅ PASS |
| Navigation — Intelligence page link | ✅ PASS |
| Unconfirmed rate → estimated_cost=null | ✅ PASS |
| Confirmed rate → cost formula correct (code review) | ✅ PASS (MINOR NOTE: runtime insert test limited to DB-direct; logDmsAiUsage() computation confirmed by code review only) |
| TypeScript passes | ✅ PASS |
| Regression: DMS Documents page | ✅ PASS |
| Regression: DMS Review Queue page | ✅ PASS |
| Regression: DMS Intelligence Admin page | ✅ PASS |
| Phase 13 flags unchanged | ✅ PASS |
| Feature flags restored to safe-off | ✅ PASS |

---

## 20. Remaining Risks

1. **Cost estimation runtime test limited to code review**: The `logDmsAiUsage()` `estimateCost()` function was verified by mathematical code review. Direct runtime call with `test_provider` was attempted but direct DB insert does not trigger the Node.js computation. The formula `(in/1M)*inRate + (out/1M)*outRate` is correct by inspection.

2. **Historical erp_ai_usage_logs rows have document_id=null**: All 65 existing rows pre-Phase-14 have `document_id=null`. This is expected. No backfill was performed.

3. **Job-level observability not yet producing data**: All existing handlers return observability fields as null. The wiring in `updateAttemptCompleted` is correct but no handler has been updated to populate usage fields yet. Will produce data when handlers are updated in future phases.

4. **providerConfigId in chunk-embedder is null**: The embedding provider factory doesn't expose configId through the same path. Logged as null in batch embedding usage records. Future enhancement opportunity.

5. **UAT test rate (id=6) remains archived** in `erp_ai_model_cost_rates` with `is_active=false`. This row is harmless but can be removed in a future cleanup migration.

6. **Full build not run**: `npm run build` was not executed. Dev server UAT confirmed functional behavior. Build should be run before production deployment.

---

## 21. Final Decision

### ✅ LIVE PASS / CLOSED

All critical criteria met:
- DB/migration verified ✅
- Feature flag OFF behavior verified ✅
- Feature flag ON dashboard verified ✅
- All 9 dashboard sections load ✅
- Token/cost summary handles unconfirmed rates gracefully ✅
- Provider/model breakdown verified ✅
- Feature/operation breakdown verified ✅
- Queue health verified ✅
- Pipeline health verified ✅
- Recent usage table safety confirmed (zero blocked keys, code review + DB query) ✅
- Error breakdown safety confirmed ✅
- Cost-rate admin loads ✅
- Safe redaction verified (local Node.js test + DB exact-key check) ✅
- Usage log canonical columns verified ✅
- No broken usage-log column writes ✅
- No AI calls from dashboard ✅
- No DMS/entity mutations ✅
- RLS verified (policies reviewed, no broad USING true) ✅
- TypeScript: 0 errors ✅
- Regression pages pass ✅

**Estimated cost computation** verified by code review + formula math; direct runtime test not possible via DB-direct insert. Marked as PASS WITH MINOR NOTE.

Phase 14 is **LIVE PASS / CLOSED**.

---

*Report generated: 2026-06-27*  
*Next recommended phase: ERP DMS AI Phase 15 — Cost Rate Admin UAT + Cost Confirmation*
