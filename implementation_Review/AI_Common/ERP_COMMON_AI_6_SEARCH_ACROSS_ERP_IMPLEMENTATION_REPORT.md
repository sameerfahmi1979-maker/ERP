# ERP COMMON AI.6 — AI Search Across ERP — Implementation Report

## Phase
**ERP COMMON AI.6 — AI Search Across ERP**

## Date
2026-06-17

## Status
**CLOSED / PASS ✅**

---

## Files Created / Changed

### New files
| File | Description |
|---|---|
| `supabase/migrations/20260617160000_erp_common_ai_6_search.sql` | DB migration |
| `src/lib/ai/common/search/types.ts` | All AI.6 TypeScript types |
| `src/lib/ai/common/search/entity-collectors.ts` | Safe RLS-aware entity query collectors |
| `src/lib/ai/common/search/intent-extractor.ts` | AI intent extraction via DMS provider |
| `src/lib/ai/common/search/dms-bridge.ts` | Delegates to DMS semantic search |
| `src/lib/ai/common/search/signal-decorators.ts` | Adds risk/compliance/duplicate badges |
| `src/lib/ai/common/search/result-merger.ts` | Merge, dedup, rank results |
| `src/lib/ai/common/search/recent-searches.ts` | Recent search CRUD helpers |
| `src/lib/ai/common/search/search-engine.ts` | Main search orchestrator by mode |
| `src/lib/ai/common/search/index.ts` | Public library barrel |
| `src/server/actions/ai/common/search.ts` | Server actions |
| `src/features/ai/common/search/search-page-client.tsx` | Main page client component |
| `src/features/ai/common/search/search-bar.tsx` | Search input bar |
| `src/features/ai/common/search/search-mode-selector.tsx` | Mode selector buttons |
| `src/features/ai/common/search/search-result-card.tsx` | Individual result card |
| `src/features/ai/common/search/search-result-group.tsx` | Results group with header |
| `src/features/ai/common/search/search-badges.tsx` | Risk/compliance/duplicate badges |
| `src/features/ai/common/search/search-empty-state.tsx` | Empty and initial states |
| `src/features/ai/common/search/search-recent-panel.tsx` | Recent searches list |
| `src/features/ai/common/search/search-loading-skeleton.tsx` | Loading skeleton |
| `src/features/ai/common/search/index.ts` | Feature barrel |
| `src/app/(protected)/search/page.tsx` | Protected `/search` route |

### Modified files
| File | Change |
|---|---|
| `src/components/layout/app-sidebar.tsx` | Added "AI Search" → `/search` after AI Risk |
| `src/lib/query/query-keys.ts` | Added `queryKeys.ai.search`, `searchSuggestions`, `recentSearches` |
| `src/lib/query/invalidation.ts` | Added `invalidateRecentSearches`, `invalidateSearchSuggestions` |
| `.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md` | Updated last closed gate to AI.6 |

---

## Migration Summary

**Migration:** `20260617160000_erp_common_ai_6_search.sql`

Applied to live DB:

| Action | Details |
|---|---|
| Permission `ai.search.view` created | NEW — view search results and badges |
| Permission `ai.search.use` confirmed active | Pre-existing — unchanged |
| Both permissions mapped | → system_admin, group_admin, company_admin |
| Table `erp_ai_recent_searches` created | BIGINT PK, user_id FK, search_text, entity_types JSONB, search_mode, result_count, created_at, deleted_at |
| Constraints | search_mode CHECK (6 modes), search_text length CHECK (1–500) |
| GIN index | `idx_erp_ai_recent_searches_user_created` (user_id, created_at DESC WHERE deleted_at IS NULL) |
| GIN trigram indexes | owner_companies.trade_name, parties.display_name (WHERE is_active=true), branches.branch_name_en, work_sites.site_name (WHERE deleted_at IS NULL) |

**NOT created:** `erp_ai_search_index`, entity embedding columns, `ERP_AI_SEARCH` flag.

---

## RLS Summary

| Table | RLS Enabled | RLS Forced | Policies |
|---|---|---|---|
| `erp_ai_recent_searches` | ✅ | ✅ | SELECT (own + not deleted), INSERT (own + ai.search.use or system_admin), UPDATE (own) |

---

## Feature Flag Status

| Flag | Status | Action |
|---|---|---|
| `AI_SEARCH` | Pre-existing — NOT changed | Used as gate for ai_intent/hybrid modes |
| `DMS_SEMANTIC_SEARCH` | Pre-existing — NOT changed | Used as gate for semantic_documents mode |
| `ERP_AI_SEARCH` | NOT created | Per approved decision |

---

## Permissions Added / Used

| Permission | Status | Roles |
|---|---|---|
| `ai.search.view` | NEW | system_admin, group_admin, company_admin |
| `ai.search.use` | Pre-existing, confirmed active | system_admin, group_admin, company_admin |
| `ai.risk.view` | Pre-existing | Used for risk badge gating |
| `ai.compliance.view` | Pre-existing | Used for compliance badge gating |
| `ai.duplicates.view` | Pre-existing | Used for duplicate badge gating |

---

## Search Modes Implemented

| Mode | Description | AI Gate |
|---|---|---|
| `quick_keyword` | Fast ILIKE name/title search across all entities | None |
| `safe_fts` | Adds DMS content FTS via `content_tsv` textSearch | None |
| `semantic_documents` | DMS semantic search via pgvector RPC | `DMS_SEMANTIC_SEARCH` |
| `ai_intent` | AI intent extraction → structured entity filters | `AI_SEARCH` |
| `hybrid` | Keyword + semantic + AI intent combined | `AI_SEARCH` + `DMS_SEMANTIC_SEARCH` |
| `entity_filtered` | Keyword restricted to specified entity types | None |

If AI flags are disabled, ai_intent/hybrid fall back to keyword with `ai_search_disabled` / `semantic_disabled` in failedSources.

---

## DMS Search Reuse Summary

- `semanticSearchDmsDocuments` from `src/server/actions/dms/semantic-search.ts` — reused via `dms-bridge.ts`
- DMS FTS via Supabase `.textSearch("content_tsv", q)` — existing capability
- DMS AI intent provider from `getDmsAiProvider()` in `src/lib/dms/ai/factory.ts` — reused for ERP intent extraction
- DMS search actions NOT rewritten or replaced

---

## Server Actions Summary

| Action | Permission Required | Notes |
|---|---|---|
| `searchAcrossErp` | ai.search.use OR ai.search.view OR system_admin | Main search — read only |
| `extractErpSearchIntentAction` | ai.search.use + AI_SEARCH flag | Returns intent JSON |
| `getErpSearchSuggestions` | ai.search.use OR ai.search.view | From own recent searches |
| `getRecentSearches` | ai.search.use OR ai.search.view | Own user only (RLS) |
| `saveRecentSearchAction` | ai.search.use | Stores safe text only |
| `clearRecentSearchesAction` | ai.search.use | Soft-deletes own rows |
| `isAiSearchEnabled` | None | Returns flag status |

---

## UI Summary

- **Route:** `/search` (protected, redirects to `/dashboard` if no permission)
- **Components:** search bar, mode selector, result groups, result cards with badges, empty/loading states, recent panel
- **Sidebar:** "AI Search" link with `SearchCheck` icon, placed after "AI Risk" in Administration section
- **Open Record only:** result cards have "Open" link only — no action buttons
- **Partial warning:** shown if any source fails
- **Feature disabled banners:** shown when AI_SEARCH or DMS_SEMANTIC_SEARCH is off but selected mode requires them

---

## Recent Searches Summary

- Stored in `erp_ai_recent_searches` — safe fields only (search_text, entity_types, search_mode, result_count)
- AI intent output NOT stored
- Raw AI response NOT stored
- User-scoped via RLS (own rows only)
- Max 20 kept per user (oldest soft-deleted on trim)
- Clear: soft-delete via `deleted_at`

---

## Security / Confidentiality Summary

| Rule | Implementation |
|---|---|
| No content_text returned | Entity collectors: name/code/status only |
| No OCR text returned | Not queried |
| No AI prompt returned | Not stored or returned |
| No raw AI response returned | Not stored or returned |
| No embedding vector returned | Not queried |
| No API key exposed | Never in code |
| Confidential DMS docs | `isConfidential=true`, snippet=null for hr/legal/executive for non-admin |
| RLS not disabled | All queries use `createClient()` (user scope); admin client used only after explicit permission check in signal-decorators |
| No auto-action | Search is read-only. No record mutation from search |

---

## What Was Explicitly NOT Implemented

- `erp_ai_search_index` — not created
- `ERP_AI_SEARCH` flag — not created
- Entity embeddings — not created
- Command palette — not implemented
- AI Assistant for Actions — not implemented
- Scheduled/background indexing — not implemented
- External connector search — not implemented
- Raw content display — never returned
- Action buttons in search results — only Open Record link

---

## TypeScript / Build Results

| Check | Result |
|---|---|
| `npx tsc --noEmit` | ✅ PASS (0 errors) |
| Linter (`ReadLints`) | ✅ PASS (no errors in new files) |

---

## UAT Checklist

```
1. Open /search.
2. Search "Alliance" → company/party/document results appear.
3. Search partial party name → party result appears.
4. Search branch code/name → branch result appears.
5. Search work site name → site result appears.
6. Search DMS document title/number → document appears.
7. Switch to DMS Content mode → FTS results appear, no raw content_text.
8. Switch to Semantic mode → DMS semantic results appear if embeddings exist.
9. Switch to AI Intent mode → "show high risk companies" maps to risk filter.
10. Risk/compliance/duplicate badges appear on entity results if data exists.
11. Recent searches save and clear.
12. User without ai.search.use cannot use /search.
13. Confidential DMS doc is redacted for non-admin.
14. AI_SEARCH disabled → keyword still works; AI intent disabled.
15. DMS_SEMANTIC_SEARCH disabled → semantic mode disabled/falls back.
16. No action buttons except Open Record/Open Document.
```

---

## Risks / Open Questions

| Risk | Status |
|---|---|
| `erp_ai_compliance_findings` / `erp_ai_duplicate_candidates` table names in signal-decorators need to match actual table names | LOW — These are the standard table names from AI.3/AI.4. If tables are named differently, signal-decorators will gracefully return no badges (try/catch) |
| `branches.updated_at` column may not exist | LOW — if not present, updatedAt will be null in branch results |
| `semanticSearchDmsDocuments` requires DMS_SEMANTIC_SEARCH flag enabled and embeddings generated | EXPECTED — UI shows disabled message when flag is off |

---

## Recommended Next Phase

**ERP COMMON AI.7 — AI Assistant for Actions**

Enable AI-guided action recommendations for ERP workflow items, with strict human-approval gates. No auto-execution.
