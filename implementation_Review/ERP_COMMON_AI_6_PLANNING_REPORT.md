# ERP COMMON AI.6 — AI Search Across ERP Planning Report

**Phase:** ERP COMMON AI.6 — Planning  
**Date:** 2026-06-17  
**Status:** PLAN ONLY — awaiting Sameer/ChatGPT review and approval

---

## Files Reviewed

### Source code

- `src/server/actions/dms/ai-search.ts` — DMS AI intent extraction (reusable pattern)
- `src/server/actions/dms/semantic-search.ts` — DMS pgvector HNSW semantic search (reusable)
- `src/server/actions/dms/documents.ts` — DMS quick/FTS/content search modes
- `src/server/actions/ai/common/compliance-checker.ts` — AI.4 pattern (reference)
- `src/server/actions/ai/common/risk-scoring.ts` — AI.5 pattern (reference)
- `src/components/layout/app-sidebar.tsx` — sidebar (no /search link yet)
- `src/lib/query/query-keys.ts` — query key registry
- `src/lib/workspace/workspace-route-registry.ts` — no /search registered yet
- `src/lib/ai/common/` — AI.1–AI.5 lib folders (all present)

### Planning and implementation reports

- `implementation_Review/ERP_COMMON_AI_5_RISK_SCORING_PLAN.md`
- `implementation_Review/AI_Phases/Phase_Common_AI_5/ERP_COMMON_AI_5_RISK_SCORING_IMPLEMENTATION_REPORT.md`
- `implementation_Review/AI_Phases/Phase_Common_AI_4/ERP_COMMON_AI_4_COMPLIANCE_CHECKER_IMPLEMENTATION_REPORT.md`
- `implementation_Review/ERP_AI_ROADMAP_AND_COMMON_AI_FOUNDATION_PLAN.md`

---

## DB Tables Reviewed (via user-supabase)

| Table | Status |
|---|---|
| `owner_companies` | Active, btree indexes, no trigram/FTS |
| `branches` | Active, btree indexes, no trigram/FTS |
| `parties` | Active, btree on display_name + legal_name_en |
| `work_sites` | Active, btree, no trigram |
| `dms_documents` | Active, GIN content_tsv, trigram title, HNSW vector |
| `dms_document_content` | Active, GIN FTS on content_text |
| `erp_ai_duplicate_candidates` | Active, 0 rows (flag off) |
| `erp_ai_compliance_findings` | Active, 0 rows (flag off) |
| `erp_ai_risk_scores` | Active, 0 rows (flag off) |
| `erp_ai_field_suggestions` | Active, 0 rows |
| `erp_ai_recent_searches` | **Does not exist** — must create |
| `erp_ai_feature_flags` | `AI_SEARCH=true`, `DMS_SEMANTIC_SEARCH=true` |
| `permissions` | `ai.search.use` exists; **`ai.search.view` missing** |

---

## Main Findings

| # | Finding | Impact |
|---|---|---|
| 1 | Feature flag is `AI_SEARCH` (not `ERP_AI_SEARCH`) — already `is_enabled=true` | **Implementation must use `AI_SEARCH`** — no new flag needed |
| 2 | `DMS_SEMANTIC_SEARCH` is `is_enabled=true` | Semantic search mode ready day 1 |
| 3 | `ai.search.use` exists; `ai.search.view` missing | **Add `ai.search.view` in migration** |
| 4 | No FTS/trigram indexes on entity tables | ILIKE acceptable for v1 scale; optional GIN trigram in migration |
| 5 | DMS already has complete search stack | High reuse — no DMS search code needs rewriting |
| 6 | `/search` route does not exist | Must create route + page + feature components |
| 7 | `erp_ai_recent_searches` does not exist | Create lightweight table in migration |
| 8 | AI intent (`ai-search.ts`) is DMS-only scope | Extend to `ErpSearchIntent` for cross-entity use |
| 9 | AI.3–AI.5 signal tables all exist and are queryable | Badge decoration straightforward |
| 10 | AI provider configured (from SETTINGS.1) | AI intent + semantic search ready without new config |

---

## Whether One-Phase Implementation is Recommended

**Yes — one systematic phase** is recommended after plan approval.

Justification:
- High reuse of existing DMS search stack and COMMON AI patterns
- No complex migrations (minimal: 1 permission, 1 table, optional indexes)
- Parallel query design is clean and independently testable
- Scope is well-bounded: search-only, no write paths, no new AI training
- AI.3–AI.5 badge data is read-only (count queries)
- Mirrors AI.4 / AI.5 implementation complexity (moderate)

---

## Whether Migration is Recommended

**Yes — minimal migration required.**

| Item | Required? | Risk |
|---|---|---|
| `ai.search.view` permission | **Required** | Low (INSERT only) |
| Role mappings for ai.search.view + ai.search.use | **Required** | Low |
| `erp_ai_recent_searches` table + RLS | **Required** | Low |
| GIN trigram indexes on entity names | Optional (performance) | Very low (additive only) |

Migration file: `supabase/migrations/<timestamp>_erp_common_ai_6_search.sql`

---

## Whether Search Index Table is Recommended

**No — `erp_ai_search_index` is NOT recommended in v1.**

Reasons:
- Entity dataset size is small/medium (typical ERP < 10K rows per type)
- Live parallel ILIKE queries are acceptable at this scale
- DMS already has GIN FTS + HNSW vector (no index needed there)
- Materialized index adds: build time, staleness risk, update triggers on every entity mutation, maintenance complexity
- v1 goal is correctness and UX, not maximum search throughput

Deferred to AI.6 v2 if entity scale requires it (deferred trigger on UAT performance test).

---

## Biggest Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| AI_SEARCH flag name confusion (`ERP_AI_SEARCH` vs `AI_SEARCH`) | Low (already documented) | Plan and implementation prompt both specify `AI_SEARCH` |
| Missing `ai.search.view` permission breaks view queries | High if not added | Added in migration |
| ILIKE performance on large entity tables | Low for current scale | Optional GIN trigram indexes ready |
| AI intent hallucination returns invalid filters | Medium | Zod validation + fallback to keyword |
| Confidential DMS document leak | Low (DMS RLS + existing checks) | User client + explicit confidentiality_level filter |
| DMS semantic search unavailable (no embeddings) | Low (DMS_SEMANTIC_SEARCH=true, 17 docs) | Graceful fallback to FTS |
| Parallel query latency | Low | Promise.allSettled with 10-row cap per source + debounce 350ms |

---

## Recommended Next Action

1. **Sameer and ChatGPT review:** `implementation_Review/ERP_COMMON_AI_6_SEARCH_ACROSS_ERP_PLAN.md`
2. **Sameer and ChatGPT review:** `implementation_Review/sql_review/ERP_COMMON_AI_6_SCHEMA_REVIEW.sql` (run against live DB)
3. **Sameer and ChatGPT review:** `implementation_Review/sql_review/ERP_COMMON_AI_6_OPTIONAL_MIGRATION_REVIEW.sql`
4. **Approve answers to design questions:**
   - Confirm `/search` is the preferred route (vs `/admin/ai/search`)
   - Confirm `erp_ai_recent_searches` table is desired
   - Confirm GIN trigram indexes should be included in v1 migration or deferred
   - Confirm `company_admin` should receive `ai.search.use` and `ai.search.view`
5. **Issue implementation prompt** after plan approval

---

## Plan Output Files Created

```
implementation_Review/ERP_COMMON_AI_6_SEARCH_ACROSS_ERP_PLAN.md
implementation_Review/sql_review/ERP_COMMON_AI_6_SCHEMA_REVIEW.sql
implementation_Review/sql_review/ERP_COMMON_AI_6_OPTIONAL_MIGRATION_REVIEW.sql
implementation_Review/ERP_COMMON_AI_6_PLANNING_REPORT.md
```

No implementation performed.  
No migrations applied.  
No source files modified.  
No feature flags changed.
