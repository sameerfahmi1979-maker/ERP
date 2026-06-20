# ERP COMMON AI.6 — AI Search Across ERP Plan

**Phase:** ERP COMMON AI.6 — Planning  
**Date:** 2026-06-17  
**Status:** PLAN ONLY — not implemented  
**Basis:** Live DB audit, DMS.12.1/12.4/12.5 search, COMMON AI.1–AI.5 outputs, ERP AI Roadmap Phase 6.

> **PLAN ONLY — No source files changed. No migrations applied. No flags enabled.**

---

## 1. Executive Summary

**Goal:** Build a secure, permission-aware, cross-entity AI search that unifies the implemented ERP entities (organizations, branches, parties, sites, DMS documents) with the AI signal outputs from AI.1–AI.5 (risk scores, compliance findings, duplicate candidates, field suggestions), all from a single `/search` route.

**Core principle:** Search and navigate only — no write actions, no auto-resolve, no auto-update.

**Architecture:** Global keyword search (ILIKE/btree on entity name columns) → optional DMS FTS (content_tsv) → optional DMS AI intent extraction → optional DMS semantic search (pgvector HNSW) → entity and AI result groups → permission-filtered badges → `/search` route.

**Key audit findings:**
- Feature flag `AI_SEARCH` already exists (`is_enabled=true`) — **use `AI_SEARCH`, NOT `ERP_AI_SEARCH`**
- `DMS_SEMANTIC_SEARCH` already exists (`is_enabled=true`) — reuse
- Permission `ai.search.use` already exists; `ai.search.view` does **not** — recommend adding
- No `/search` or `/admin/ai/search` route exists yet
- Entity tables (owner_companies, branches, parties, work_sites) have **no FTS or trigram indexes** — ILIKE on btree columns works for small/medium datasets; optional GIN trigram indexes recommended for performance
- DMS already has: quick ILIKE, safe FTS (`content_tsv` GIN), AI intent extraction → SQL filters, HNSW semantic search
- AI.3–AI.5 results already queryable by entity via existing server actions

**Recommendation:** Implement as **one systematic phase** after plan approval. High reuse of DMS search + COMMON AI infrastructure.

---

## 2. Current Search Capability Inventory

| Capability | Location | Current behavior | Gap | Reusable for AI.6 |
|---|---|---|---|---|
| DMS quick search | `src/server/actions/dms/documents.ts` | ILIKE on `document_no, title, description` | DMS only | **Yes — reuse** |
| DMS safe FTS | `src/server/actions/dms/documents.ts` | `content_tsv` textSearch (plain) | DMS only | **Yes — reuse** |
| DMS content search | `documents.ts` mode=`content` | `dms_document_content.content_text` FTS | DMS only; never returns raw content | **Yes — reuse** |
| DMS AI search | `src/server/actions/dms/ai-search.ts` | LLM intent → structured SQL filters on DMS | DMS only; requires AI provider + `AI_SEARCH` flag | **Yes — extend** |
| DMS semantic search | `src/server/actions/dms/semantic-search.ts` | pgvector HNSW cosine similarity on `summary_embedding` | DMS only; requires embedding + `DMS_SEMANTIC_SEARCH` | **Yes — reuse** |
| DMS AI intent schema | `ai-search.ts` DmsSearchIntent | Keywords, document_type_hint, expiry_state, risk_hint, date filters | DMS-scope only | **Yes — extend to ERP entities** |
| Entity list queries | `src/server/actions/organizations.ts` etc. | Filterable ILIKE list queries | No cross-entity search | **Partial — inline simple search** |
| AI.3 duplicate counts | `getDuplicateCandidateCountForEntity` | Count by entity | No search | **Read badge** |
| AI.4 compliance counts | `getComplianceFindingCountForEntity` | Count by entity | No search | **Read badge** |
| AI.5 risk score | `getRiskScoreForEntity` | Current score for entity | No search | **Read badge** |
| Global workspace registry | `workspace-route-registry.ts` | Tab definitions | No search integration | **Optional CTA links** |
| ERPDataTable search | `erp-data-table.tsx` | Per-page search filter | Local, no cross-entity | **Not reused** |

---

## 3. Current App and DB Audit Findings

### Live DB (verified 2026-06-17 via `user-supabase`)

| Item | Finding |
|---|---|
| Feature flag `AI_SEARCH` | **is_enabled=true** — already active |
| Feature flag `ERP_AI_SEARCH` | **Does not exist** — do not create or reference |
| Feature flag `DMS_SEMANTIC_SEARCH` | is_enabled=true |
| Permission `ai.search.use` | **Exists and active** |
| Permission `ai.search.view` | **Does not exist** — recommend adding |
| `/search` route | **Does not exist** — must create |
| Entity tables FTS/trigram indexes | **None** — btree only on name columns |
| DMS indexes | content_tsv (GIN), title (trigram), ai_summary (trigram), summary_embedding (HNSW vector) |
| `erp_ai_recent_searches` | **Does not exist** — optional lightweight table |

### Code gaps

1. No `src/lib/ai/common/search/` library folder
2. No `src/server/actions/ai/common/search.ts`
3. No `/search` page route
4. No global search bar in header/sidebar
5. No `ai.search.view` permission
6. AI intent extraction (`ai-search.ts`) is DMS-scoped only — no entity scope
7. No unified result type model across entities + AI signal tables

### Indexes gap (entity tables)

Entity name columns (trade_name, legal_name_en, display_name, branch_name_en, site_name) have btree indexes for equality/sort — but **no GIN trigram indexes for pattern search**. ILIKE on small/medium entity datasets (< ~10K rows) is acceptable via seq scan or btree prefix-scan. For production scale, GIN trigram recommended.

---

## 4. Scope for AI.6 v1

### In-scope entity types

| Entity | DB table | v1 search |
|---|---|---|
| `company` | `owner_companies` | Keyword: trade_name, legal_name_en, company_code |
| `branch` | `branches` | Keyword: branch_name_en, branch_code |
| `party` | `parties` | Keyword: display_name, legal_name_en, party_code |
| `site` | `work_sites` | Keyword: site_name, site_code |
| `dms_document` | `dms_documents` | Quick + FTS + semantic (reuse DMS stack) |
| `duplicate_candidate` | `erp_ai_duplicate_candidates` | Keyword filter by entity name / status |
| `compliance_finding` | `erp_ai_compliance_findings` | Keyword filter by finding_type / entity / status |
| `risk_score` | `erp_ai_risk_scores` | Filter by risk_level / entity / status |
| `field_suggestion` | `erp_ai_field_suggestions` | Filter by field_code / entity / conflict_detected |

### In-scope capabilities

- Global keyword search across implemented entities
- DMS FTS + semantic search reuse
- AI intent extraction → structured filters (extended to ERP entity scope)
- Risk, compliance, duplicate badges on entity results
- Permission-aware results per source
- Safe result snippets (no OCR, no content_text)
- Open record links (navigate to workspace forms)
- Recent searches (lightweight, per-user, safe text)
- Feature flag gate on AI-intensive modes

### Out of scope (v1)

- ERP entity embeddings (entity name/description vectors)
- Command palette / action execution
- Scheduled index background builds
- Employee / vehicle / equipment / finance / project / HSE entities
- Full `erp_ai_search_index` materialized table
- Trend / analytics on search queries
- External connector search (email, calendar)
- Raw content_text display (never)

---

## 5. Out of Scope / Deferred Entities

Future entity types reserved in result type enum (not implemented in v1):

`employee`, `vehicle`, `equipment`, `workshop`, `inventory`, `purchase_order`, `invoice`, `project`, `hse_incident`

---

## 6. Search Modes

| Mode | Input | Output | Tables | AI call | Cost | Risk |
|---|---|---|---|---|---|---|
| `quick_keyword` | Short text query | Entity name matches, DMS title ILIKE | owner_companies, branches, parties, work_sites, dms_documents | No | Zero | Low |
| `safe_fts` | Natural language query | DMS FTS (content_tsv) results | dms_document_content, dms_documents | No | Zero | Low |
| `ai_intent` | Natural language | Structured ERP filter JSON → query | All entity tables | Yes (1 call) | Low | Medium |
| `semantic_documents` | Natural language | DMS vector similarity results | dms_documents.summary_embedding (HNSW) | Yes (embedding) | Medium | Low |
| `hybrid` | Natural language | keyword + semantic merged | All above | Yes | Medium | Medium |
| `entity_filtered` | Entity type + text | Scoped to one entity type | Target table only | No | Zero | Low |

**Default v1:** `quick_keyword` — zero AI cost, instant response.  
**User-selectable:** `safe_fts`, `semantic_documents`, `ai_intent` (each requires feature flag checks).

---

## 7. Result Types and View Model

| Result type | Display title | Subtitle | Route | Badges | Snippet |
|---|---|---|---|---|---|
| `organization` | trade_name | company_code + status | `/admin/organizations/record/{id}` | Risk, Compliance, DuplicateCount | legal_name_en |
| `branch` | branch_name_en | branch_code + owner company | `/admin/branches/record/{id}` | Risk | — |
| `party` | display_name | party_code + party type | `/admin/master-data/parties/record/{id}` | Risk, Compliance, Duplicate | short_name or legal_name_en |
| `site` | site_name | site_code + branch | `/admin/common-master-data/work-sites/record/{id}` | Risk | — |
| `dms_document` | title or document_no | document_type + expiry | `/dms/documents/record/{id}` | RiskLevel, ComplianceOpen, DuplicateOpen | ai_summary snippet (safe, max 200 chars) |
| `duplicate_candidate` | Candidate label | entity_type + candidate_type | `/admin/ai/duplicates?entityType=&entityId=` | Status badge | — |
| `compliance_finding` | finding_type label | severity + entity label | `/admin/ai/compliance?entityType=&entityId=` | Severity badge | rule_name |
| `risk_score` | Entity label | risk_level + status | `/admin/ai/risk?entityType=&entityId=` | RiskLevel badge | top reason |
| `field_suggestion` | field_code label | entity label | `/admin/ai/...` | Conflict badge | suggested_value preview (safe) |

### Permission gate per result type

| Result type | Required permission |
|---|---|
| organization | `organizations.view` OR system_admin |
| branch | `branches.view` OR system_admin |
| party | `master_data.party_master.view` OR system_admin |
| site | `common_md.work_sites.view` OR system_admin |
| dms_document | `dms.documents.view` |
| duplicate_candidate | `ai.duplicates.view` OR `ai.common.admin` |
| compliance_finding | `ai.compliance.view` OR `ai.common.admin` |
| risk_score | `ai.risk.view` OR `ai.common.admin` |
| field_suggestion | `ai.common.view` OR `ai.common.admin` |

---

## 8. Deterministic / Keyword Search Design

### Entity keyword search

Each entity type queried independently using Supabase RLS client (user-scoped):

```
owner_companies: ILIKE on trade_name, legal_name_en, company_code (OR)
branches: ILIKE on branch_name_en, branch_code (OR)
parties: ILIKE on display_name, legal_name_en, party_code, trade_name_en (OR)
work_sites: ILIKE on site_name, site_code (OR)
dms_documents: quick ILIKE on title, document_no (existing mode)
```

Limit per entity type: **10 results** (configurable, default 10, max 25).  
Total max result count per search: **100** (10 entities × 10 rows each).  
All queries run in parallel via Promise.allSettled.

### DMS FTS

Reuse existing `safe_fts` mode from `documents.ts`:
- `content_tsv` textSearch (plain, simple config)
- excludes confidential docs for non-admin
- limit 15

### AI signal tables keyword/filter

`erp_ai_duplicate_candidates`: filter by entity_type, entity_id from entity hits, or by keyword match on entity label via join.  
`erp_ai_compliance_findings`: filter by entity_type, entity_id.  
`erp_ai_risk_scores`: filter by risk_level, entity_type.  
`erp_ai_field_suggestions`: filter by entity_type, entity_id, conflict_detected=true.

These are secondary results shown when an entity row is found — not primary text search targets.

---

## 9. AI Intent Search Design

### Extended ERP intent schema

The existing `DmsSearchIntent` (in `ai-search.ts`) is DMS-document scoped. AI.6 defines a new `ErpSearchIntent`:

```typescript
interface ErpSearchIntent {
  query: string;                    // cleaned original query
  entityTypes: ErpSearchEntityType[];  // e.g. ["party", "dms_document"]
  keywords: string[];               // extracted search terms
  riskLevel?: "low" | "medium" | "high" | "critical";
  complianceStatus?: "open" | "critical" | "high";
  hasDuplicates?: boolean;
  expiryState?: "expired" | "expiring_soon";
  status?: string;                  // active, inactive, non_compliant, etc.
  dateFrom?: string | null;
  dateTo?: string | null;
  documentTypeHint?: string | null;
  confidentialityMax?: string | null;
}
```

Intent extraction uses existing provider layer (same as `ai-search.ts`). System prompt instructs model to output only the `ErpSearchIntent` JSON — no free-form text. Zod validates output.

### Query examples → intent

```
"show parties with high risk" → entityTypes:["party"], riskLevel:"high"
"expired trade licenses" → entityTypes:["dms_document"], expiryState:"expired", documentTypeHint:"trade_license"
"companies with open compliance issues" → entityTypes:["company"], complianceStatus:"open"
"find Alliance" → entityTypes:[], keywords:["Alliance"]  (fallback to keyword)
"documents about VAT certificate" → entityTypes:["dms_document"], keywords:["VAT","certificate"]
"duplicate party conflicts" → entityTypes:["party"], hasDuplicates:true
```

### AI call rules

- Gated by `AI_SEARCH` flag (already enabled) AND `ai.search.use` permission
- Use `getDmsAiProvider("DEFAULT_DMS_EXTRACTOR")` from existing factory
- Skip gracefully if provider not configured — fall back to keyword mode
- Max 1 AI call per search query (intent extraction only)
- Semantic search (embedding) = separate 1 call
- No AI call for `quick_keyword` or `entity_filtered` modes
- Do not log prompt text, raw response, or query content

---

## 10. Semantic Search Design

### v1 scope: DMS documents only

Reuse `semanticSearchDmsDocuments` from `semantic-search.ts`:
- Embed user query (1 AI call)
- HNSW cosine similarity on `dms_documents.summary_embedding`
- Return top 10-15 DMS document results with similarity score
- Exclude confidential docs for non-admin
- Flag: `DMS_SEMANTIC_SEARCH` (already enabled)

### v2 deferred: entity embeddings

Do NOT embed entity names/descriptions in v1. Entity embeddings require:
- New embedding pipeline for owner_companies, parties, branches, sites
- Incremental update strategy (on save)
- Separate vector column + HNSW index per entity table
- Higher cost, complexity, staleness risk

Defer to AI.6 v2 after v1 UAT.

### Semantic search result integration

Semantic results show as DMS document cards with a similarity score badge. They appear in a separate "Semantic Matches" section or merged into DMS document results, sorted by similarity DESC.

---

## 11. Search Index / Database Impact Review

### Decision: No `erp_ai_search_index` table in v1

**Justification:**
- Entity tables are small (< 10K rows typical ERP deployment)
- ILIKE on btree columns acceptable for v1 scale
- DMS already has GIN indexes for FTS + HNSW for semantic
- Adding a materialized index adds maintenance cost, staleness risk, sync complexity
- Live queries with parallel Promise.allSettled is simpler and always fresh

**Optional GIN trigram indexes recommended (migration):**

If entity name search performance is inadequate, add:

```sql
CREATE INDEX idx_owner_companies_trade_name_trgm ON public.owner_companies USING gin (trade_name gin_trgm_ops) WHERE deleted_at IS NULL;
CREATE INDEX idx_parties_display_name_trgm ON public.parties USING gin (display_name gin_trgm_ops) WHERE deleted_at IS NULL;
CREATE INDEX idx_branches_branch_name_en_trgm ON public.branches USING gin (branch_name_en gin_trgm_ops) WHERE deleted_at IS NULL;
CREATE INDEX idx_work_sites_site_name_trgm ON public.work_sites USING gin (site_name gin_trgm_ops) WHERE deleted_at IS NULL;
```

These are **safe additive-only** — no existing index removed.

### `erp_ai_recent_searches` (optional lightweight table)

Recommend: **Yes, create in v1** — very low cost, high UX value.

Columns: `id BIGINT PK, user_id BIGINT, search_text TEXT, entity_types JSONB, result_count INT, created_at TIMESTAMPTZ, deleted_at TIMESTAMPTZ`  
Limit: max 20 per user (LRU trim on insert)  
RLS: user sees only own rows  
No sensitive data — just the search text the user typed (not AI response)

### Roadmap reconciliation

| Roadmap artifact | AI.6 v1 decision |
|---|---|
| `erp_ai_search_index` | **Not created** — live queries sufficient |
| `erp_ai_search_logs` | **Not created** — recent searches table only |
| Entity embeddings | **Deferred v2** |
| Command palette | **Deferred AI.7** |

---

## 12. SQL Review — Recommended / Optional

See:
- `implementation_Review/sql_review/ERP_COMMON_AI_6_SCHEMA_REVIEW.sql` (read-only audit)
- `implementation_Review/sql_review/ERP_COMMON_AI_6_OPTIONAL_MIGRATION_REVIEW.sql` (proposed DDL)

**Migration required?** Yes — minimal.  
**Contents:** `ai.search.view` permission, optional GIN trigram indexes, `erp_ai_recent_searches` table.

---

## 13. RLS / Permission / Confidentiality Design

### Permissions

| Action | Permission |
|---|---|
| Use search (keyword + AI intent) | `ai.search.use` (exists) |
| View search results + recent searches | `ai.search.view` (recommend adding) |
| Admin search over AI signal tables | `ai.common.admin` OR `system_admin` |
| View entity results | Entity-specific view perms (organizations.view, master_data.party_master.view, etc.) |

`ai.search.view` — map to at minimum: `system_admin`, `group_admin`, `company_admin`.  
`ai.search.use` — existing; confirm role mapping (add `company_admin` if not mapped).

### RLS

- Entity table queries: use **user Supabase client** (`createClient()`) — RLS naturally scoped
- DMS document queries: use user client — existing DMS RLS applies
- AI signal tables (AI.3–AI.5): use **admin client** with explicit `hasPermission()` checks in server action before query — then filter by entity IDs already returned from entity search (avoids broad admin scans)
- Recent searches: user client, RLS policy for `user_id = current_user_profile_id()`

### Confidential DMS documents

- For `confidentiality_level IN ('hr', 'legal', 'executive')`: exclude from snippet / ai_summary return for non-admin
- Admin/system_admin: may see document_no + type but still no OCR/content_text
- Consistent with existing `ai-search.ts` behavior

### No raw content returned

`content_text` never returned in any search result. `ai_summary` limited to 200-char safe snippet.

---

## 14. Feature Flag Design

| Flag | Status | Use in AI.6 |
|---|---|---|
| `AI_SEARCH` | **is_enabled=true** — exists | Gate AI intent extraction mode |
| `DMS_SEMANTIC_SEARCH` | is_enabled=true | Gate semantic search mode |
| `ERP_AI_SEARCH` | **Does not exist** | Do NOT create |

Feature flag behavior:
- `AI_SEARCH=false`: AI intent extraction returns FEATURE_DISABLED; keyword mode still works
- `DMS_SEMANTIC_SEARCH=false`: semantic results hidden; keyword/FTS still works
- All read/keyword modes always work regardless of AI flags

No new flag needed in v1 — reuse `AI_SEARCH` and `DMS_SEMANTIC_SEARCH`.

---

## 15. Server Action Design

**File:** `src/server/actions/ai/common/search.ts`

| Action | Purpose | Permission gate |
|---|---|---|
| `searchAcrossErp({ query, mode, entityTypes?, filters? })` | Main unified search | `ai.search.use` |
| `extractErpSearchIntent({ query })` | AI intent → ErpSearchIntent JSON | `ai.search.use` + AI_SEARCH flag |
| `getErpSearchSuggestions({ query })` | Fast autocomplete from entity names | `ai.search.use` |
| `getRecentSearches()` | User recent searches list | `ai.search.use` |
| `saveRecentSearch({ text, entityTypes, resultCount })` | Save after search | `ai.search.use` |
| `clearRecentSearches()` | Clear user history | `ai.search.use` |

### `searchAcrossErp` input schema

```typescript
z.object({
  query: z.string().min(1).max(500),
  mode: z.enum(["quick_keyword", "safe_fts", "ai_intent", "semantic_documents", "hybrid", "entity_filtered"]).default("quick_keyword"),
  entityTypes: z.array(z.enum(["company", "party", "branch", "site", "dms_document", ...])).optional(),
  riskLevel: z.enum(["none", "low", "medium", "high", "critical"]).optional(),
  page: z.number().int().min(1).max(10).optional(),
  limit: z.number().int().min(1).max(25).optional(),
  includeAiSignals: z.boolean().optional(), // include risk/compliance/duplicate badges
})
```

### Safe output DTO

```typescript
interface ErpSearchResult {
  resultType: ErpSearchResultType;
  entityType: string;
  entityId: number;
  title: string;
  subtitle?: string;
  snippet?: string;          // AI summary snippet only, max 200 chars, no OCR
  route: string;
  badges: {
    riskLevel?: string;
    riskScore?: number;
    complianceOpenCount?: number;
    duplicateOpenCount?: number;
    isStale?: boolean;
  };
  score?: number;            // semantic similarity
  isConfidential?: boolean;  // content redacted
}
```

### Audit events

```
erp_search_performed
erp_search_intent_extracted
```

Safe metadata only: mode, entity_types, result_count, ai_intent_used, semantic_used (no query text in logs).

---

## 16. Search Engine Design

**Folder:** `src/lib/ai/common/search/`

```
types.ts              — ErpSearchEntityType, ErpSearchIntent, ErpSearchResult, ErpSearchMode, ErpSearchFilters
entity-collectors.ts  — queryCompanies, queryBranches, queryParties, querySites, queryDmsDocuments (return safe DTOs)
intent-extractor.ts   — extractErpIntent(query) → ErpSearchIntent (wraps DMS AI provider)
dms-bridge.ts         — unify DMS quick/fts/semantic results → ErpSearchResult[]
signal-decorators.ts  — attach risk/compliance/duplicate badges to entity results (server-side)
result-merger.ts      — merge + rank results from multiple sources; dedup by (entityType, entityId)
search-engine.ts      — orchestrate: parallel collect → decorate signals → merge → cap → safe DTOs
recent-searches.ts    — upsert/load/clear user recent searches
index.ts
```

**Design principles:**
- `entity-collectors.ts`: pure Supabase client queries, RLS-scoped, return safe fields only
- `intent-extractor.ts`: wraps existing `getDmsAiProvider`; validates output with Zod; fallback to keyword
- `signal-decorators.ts`: after entity results known, batch-fetch AI.3/AI.4/AI.5 counts by entity IDs; use admin client with prior permission check
- `result-merger.ts`: dedup, sort by relevance (semantic score → compliance critical → high risk → keyword match)
- All: no raw OCR/content/prompts in any output

---

## 17. UI / UX Design

### Route: `/search`

**Why `/search` not `/admin/ai/search`:**
- Search is useful to all users with `ai.search.use` permission, not just admins
- `/admin/` implies system admin scope
- Mirror best-practice SaaS search (e.g. `/search` in Linear, GitHub)

**Page:** `src/app/(protected)/search/page.tsx`  
**Client component:** `src/features/ai/common/search/search-page-client.tsx`

### UI components

```
search-page-client.tsx      — main page orchestrator
search-bar.tsx              — input + mode selector + filter panel toggle
search-result-card.tsx      — entity result card with badges
search-result-group.tsx     — grouped by entity type (collapsible)
search-badges.tsx           — risk/compliance/duplicate badge row
search-empty-state.tsx      — no results / feature disabled / no permission
search-recent-panel.tsx     — recent searches chips
search-mode-selector.tsx    — quick/fts/semantic/ai tabs
search-loading-skeleton.tsx — placeholder while loading
index.ts
```

### UI features

- Search bar (hero, centered on empty state)
- Mode tabs: Keyword | DMS Content | Semantic | AI Intent
- Entity type filter chips: All / Companies / Branches / Parties / Sites / Documents / AI Signals
- Result groups: one expandable section per entity type, sorted by result count
- Entity card: title, subtitle, badges (risk level + badge, compliance count, duplicate count), "Open Record" button
- DMS document card: title, type, expiry, risk badge, safe ai_summary snippet, "Open Document"
- AI signal card: finding type, severity/level, entity label, "View in AI Admin"
- Recent searches: chips, click to re-run, X to dismiss
- Feature disabled banner: "AI search is in review mode — keyword search is always available"
- Permission denied per source: gray out entity type with "No permission" badge

### Sidebar / header

Add "AI Search" to sidebar under Administration after "AI Risk":

```typescript
{ label: "AI Search", icon: Search, path: "/search" }
```

Also optionally add a header search icon (keyboard shortcut `/`) for quick access — deferred to v1.1 unless trivial.

---

## 18. Recent Searches / Search History Design

### Decision: Create `erp_ai_recent_searches` in v1

Low cost, high UX value. Stores per-user safe text only.

### Schema

```sql
CREATE TABLE public.erp_ai_recent_searches (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id       BIGINT NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  search_text   TEXT NOT NULL,
  entity_types  JSONB NOT NULL DEFAULT '[]'::jsonb,
  result_count  INT NOT NULL DEFAULT 0,
  search_mode   TEXT NOT NULL DEFAULT 'quick_keyword',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at    TIMESTAMPTZ
);
```

- Max 20 rows per user — trim oldest `deleted_at IS NULL` rows on insert beyond 20
- RLS: user sees only own rows; insert own rows only
- `clearRecentSearches`: soft delete all (set `deleted_at=now()`)
- No raw AI output, no full response text stored

---

## 19. Integration with AI.2 Understanding

AI.2 (`document-understanding.ts`) already shows entity risk via the `entityRisk` block added in AI.5.

**AI.6 integration:**
- Document Understanding section shows a "Related Search" suggestion: "Find more documents for [entity]" → `/search?q=entity_name&entityType=dms_document`
- No calculation or AI run triggered from search results
- Read-only link from AI.2 section to `/search` with pre-filled filters

---

## 20. Integration with AI.3 Duplicate Detection

`erp_ai_duplicate_candidates` rows surfaced in search results when:
1. An entity search result has pending duplicates → badge count shown
2. Direct search for "duplicate" or intent `hasDuplicates:true` → returns candidate rows as result type

Link to `/admin/ai/duplicates?entityType=&entityId=`.  
No merge/resolve actions from search.

---

## 21. Integration with AI.4 Compliance Checker

`erp_ai_compliance_findings` rows surfaced when:
1. Entity result has open compliance findings → badge count shown
2. Intent `complianceStatus:"open"` → returns finding rows as result type

Link to `/admin/ai/compliance?entityType=&entityId=`.  
No resolve/waive actions from search.

---

## 22. Integration with AI.5 Risk Scoring

`erp_ai_risk_scores` rows surfaced when:
1. Entity result has an active risk score → risk badge with level shown
2. Intent `riskLevel:"high"` → filters entity search results to those with high/critical scores (join via entity_type + entity_id)

For AI.5 filter: query `erp_ai_risk_scores` WHERE risk_level IN (intent.riskLevel) AND status NOT IN ('failed', 'superseded') → collect entity_ids → filter entity search to those IDs.

Link to `/admin/ai/risk?entityType=&entityId=`.  
No review/calculate actions from search.

---

## 23. Audit and Logging Design

- `logAudit()` for `erp_search_performed` (mode, entity_types, result_count — no query text)
- `logAudit()` for `erp_search_intent_extracted` (intent_entity_types, has_risk_filter, has_expiry_filter — no raw query or response)
- Never log: search query text, OCR, content_text, AI prompt, raw AI response, API keys
- `erp_ai_usage_logs` if AI calls made (feature_area=`AI_SEARCH`, operation=`intent_extract` or `embed_query`)
- Recent searches stored per-user — no aggregate search analytics in v1

---

## 24. Performance and Cost Control

| Control | Value |
|---|---|
| Max results per entity type | 10 (configurable 1–25) |
| Max total results per search | 100 |
| Parallel entity queries | Yes — Promise.allSettled |
| Debounce client-side | 350ms before firing query |
| Semantic search | Only when mode=semantic or hybrid |
| AI intent extraction | Only when mode=ai_intent or hybrid; 1 call max |
| Embedding calls | 1 per semantic search |
| AI intent call | 1 per query (no repeat on same query within 60s TTL cache) |
| Recent searches trim | Max 20 rows per user |
| Max linked doc signals | Signal batch query by entity IDs (IN clause cap: 100 IDs) |

---

## 25. Error Handling and Partial Results

- Per-source try/catch in parallel queries — one source failure does not abort search
- Return `partialResults: true` flag if any source failed
- Failed source: show "Some results could not be loaded" in UI
- Feature disabled → keyword mode still works; show info banner
- AI provider unavailable → keyword mode + semantic mode disabled; show info
- No permission for source → omit result group silently (don't show 403 to user)
- Confidential document → show in results with `isConfidential: true`; no snippet/summary

---

## 26. Testing and UAT Plan

1. With `AI_SEARCH=true` (already), open `/search` and confirm page renders
2. Type "Alliance" → expect party/company/document results
3. Type short partial name → expect ILIKE matches
4. Switch to "DMS Content" mode → confirm FTS results from content_tsv
5. Switch to "Semantic" mode → embed query, confirm vector results
6. Switch to "AI Intent" → send "show high risk companies" → intent extracted, companies with risk_level=high returned
7. Search "expired documents" → intent or keyword → DMS docs with expired expiry_date
8. Search for a company with AI.5 score → risk badge appears on result card
9. User without `ai.search.use` → /search returns 403 / denied state
10. Search returns DMS doc with `confidentiality_level=hr` → non-admin sees redacted card, admin sees type+doc_no
11. Recent searches: run 3 searches → appear in recent panel → clear → gone
12. AI provider not configured → keyword/FTS mode works; semantic/intent show "AI not configured" banner
13. All entity types return results or graceful empty state
14. `feature disabled` banner for semantic/intent if flags off
15. TypeScript PASS + Build PASS

---

## 27. Risks and Mitigations

| Risk | Mitigation |
|---|---|
| No FTS indexes on entity tables | ILIKE acceptable for v1; optional GIN trigram indexes in migration |
| AI intent hallucination | Zod validation on intent JSON; fallback to keyword if intent invalid |
| High AI call cost | Only 1 intent call per query; semantic only on explicit request; TTL cache |
| Search latency | Promise.allSettled parallel; 10-row cap per source; debounce 350ms |
| Confidential content leak | User client RLS + explicit confidentiality_level filter; no ai_summary for restricted docs |
| Duplicate entity results | Dedup by (entity_type, entity_id) in result-merger |
| Permission confusion | Per-source permission check; result groups hidden if no permission |
| `ERP_AI_SEARCH` confusion | Plan clearly documents: use `AI_SEARCH` only |
| `ai.search.view` missing | Add in migration; gate view actions on it |
| Stale search results | Live queries always fresh; no cached index |

---

## 28. Implementation File Plan

### New files

```
src/lib/ai/common/search/types.ts
src/lib/ai/common/search/entity-collectors.ts
src/lib/ai/common/search/intent-extractor.ts
src/lib/ai/common/search/dms-bridge.ts
src/lib/ai/common/search/signal-decorators.ts
src/lib/ai/common/search/result-merger.ts
src/lib/ai/common/search/search-engine.ts
src/lib/ai/common/search/recent-searches.ts
src/lib/ai/common/search/index.ts
src/server/actions/ai/common/search.ts
src/features/ai/common/search/search-page-client.tsx
src/features/ai/common/search/search-bar.tsx
src/features/ai/common/search/search-result-card.tsx
src/features/ai/common/search/search-result-group.tsx
src/features/ai/common/search/search-badges.tsx
src/features/ai/common/search/search-empty-state.tsx
src/features/ai/common/search/search-recent-panel.tsx
src/features/ai/common/search/search-mode-selector.tsx
src/features/ai/common/search/search-loading-skeleton.tsx
src/features/ai/common/search/index.ts
src/app/(protected)/search/page.tsx
supabase/migrations/<timestamp>_erp_common_ai_6_search.sql
implementation_Review/AI_Phases/Phase_Common_AI_6/ERP_COMMON_AI_6_SEARCH_ACROSS_ERP_IMPLEMENTATION_REPORT.md
```

### Modified files

```
src/components/layout/app-sidebar.tsx  — add AI Search link
src/lib/query/query-keys.ts            — add ai.search keys
src/lib/query/invalidation.ts          — add search invalidation helpers
.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md   — update after implementation
```

---

## 29. Exact Step-by-Step Cursor Implementation Sequence

1. Apply migration (`ai.search.view` permission + role mappings + optional GIN trigram indexes + `erp_ai_recent_searches`)
2. Verify live DB via schema review queries
3. Create `src/lib/ai/common/search/` library (types → entity-collectors → intent-extractor → dms-bridge → signal-decorators → result-merger → search-engine → recent-searches → index)
4. Create server actions (`src/server/actions/ai/common/search.ts`) with permission + flag gates + Zod + audit
5. Add query keys + invalidation helpers
6. Create `src/app/(protected)/search/page.tsx`
7. Create feature components in `src/features/ai/common/search/`
8. Add sidebar link after "AI Risk"
9. Run TypeScript check + build
10. Implementation report + SOT update

---

## 30. Acceptance Criteria

1. Migration applied: `erp_ai_recent_searches` with RLS ENABLED+FORCED; `ai.search.view` added and mapped
2. `AI_SEARCH` flag used; `ERP_AI_SEARCH` not created
3. `/search` route exists and renders
4. Keyword search returns results from companies, parties, branches, sites, DMS docs
5. DMS FTS results available in `safe_fts` mode
6. Semantic search results in `semantic_documents` mode (gated by DMS_SEMANTIC_SEARCH)
7. AI intent extraction maps natural language to entity filters (gated by AI_SEARCH)
8. Risk/compliance/duplicate badges shown on entity result cards
9. No write/action buttons in search results
10. Confidential DMS documents redacted for non-admin
11. No raw content_text/OCR/prompt/AI response returned
12. Recent searches: save/load/clear functional
13. Partial source failures do not abort search
14. Sidebar "AI Search" link navigates to `/search`
15. TypeScript PASS + Build PASS
16. SOT updated; implementation report created

---

## 31. Rollback Plan

1. Remove `/search` route from sidebar nav — users lose access without DB change
2. `AI_SEARCH` flag already exists — set `is_enabled=false` to disable AI intent mode
3. Disable `DMS_SEMANTIC_SEARCH` flag to disable semantic mode
4. Keyword mode uses live queries — no DB side effect
5. `erp_ai_recent_searches`: soft-delete all rows via admin SQL; table harmless if left
6. Drop tables only in dedicated cleanup migration after soak period
7. GIN trigram indexes: `DROP INDEX` safely (additive only, no schema dependency)
8. DMS search and entity lists unaffected (separate routes/actions)

---

## 32. Handoff Summary

### Design question answers

| # | Question | Answer |
|---|---|---|
| 1 | Can AI.6 be one phase safely? | **Yes** — reuses DMS + COMMON AI infrastructure; clean parallel query design |
| 2 | Actual feature flag name? | **`AI_SEARCH`** (is_enabled=true) — NOT `ERP_AI_SEARCH` |
| 3 | `ai.search` permissions seeded? | `ai.search.use` exists; **`ai.search.view` missing** — add in migration |
| 4 | Search index table needed? | **No** in v1 — live queries + optional GIN trigram indexes sufficient |
| 5 | Recent searches stored? | **Yes** — `erp_ai_recent_searches` (lightweight, per-user, soft-delete) |
| 6 | Semantic search DMS-only? | **Yes** in v1 — entity embeddings deferred |
| 7 | AI intent → filters? | `ErpSearchIntent` JSON (Zod-validated) → entity type filter + field filters |
| 8 | RLS/module permission enforcement? | User client for entities (RLS natural); admin client + manual perms for AI signal tables |
| 9 | Confidential DMS redaction? | No snippet/summary for hr/legal/executive for non-admin; document_no visible to admin only |
| 10 | UI location? | **`/search`** — global route for all users with `ai.search.use` |
| 11 | Global or admin route? | **Global `/search`** — not admin-only |
| 12 | Risk/compliance/duplicate badges? | Batch-fetched after entity results; shown per card |
| 13 | Partial search failure handling? | partialResults flag + per-source silent fail; UI shows "some results unavailable" |
| 14 | AI/search cost control? | 1 intent call max; 1 embedding call max; keyword mode free; debounce 350ms |
| 15 | AI.6 v2 deferrals? | Entity embeddings, command palette, action assistant, scheduled indexing |

**Next step:** Sameer/ChatGPT review this plan + SQL review files → approve implementation prompt.

---

## Appendix: Feature Flag Name Correction

Live DB has `AI_SEARCH` (is_enabled=true). There is no `ERP_AI_SEARCH` in the DB. Implementation must use `AI_SEARCH` to avoid creating a duplicate/conflicting flag.

## Appendix: DMS Search Boundary

DMS document search remains authoritative within `dms_documents`, `dms_document_content`, and the `summary_embedding` column. AI.6 **delegates** DMS document search to existing DMS actions — it does not replace them. DMS-scoped AI search (`ai-search.ts`) continues to operate as-is for DMS-only search flows.
