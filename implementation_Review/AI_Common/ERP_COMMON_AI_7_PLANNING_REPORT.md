# ERP COMMON AI.7 — AI Assistant for Actions — Planning Report

**Phase:** ERP COMMON AI.7 — AI Assistant for Actions (PLAN ONLY)  
**Date:** 2026-06-17  
**Status:** PLANNING COMPLETE — Awaiting Sameer/ChatGPT review before implementation

---

## Files Reviewed

### Source of Truth / Standards
- `.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md` — read, confirmed AI.5/AI.6 closed
- Live DB queried via `user-supabase` (feature flags, permissions, tables)

### Source Files Reviewed
- `src/lib/ai/common/provider-bridge.ts` — callCommonAiStructuredCompletion() confirmed
- `src/lib/ai/common/search/search-engine.ts` — runErpSearch() confirmed as retrieval layer
- `src/server/actions/ai/common/search.ts` — searchAcrossErp() confirmed
- `src/server/actions/ai/common/field-suggestions.ts` — patterns confirmed
- `src/server/actions/ai/common/risk-scoring.ts` — getRiskScoreForEntity() confirmed
- `src/server/actions/ai/common/duplicate-detection.ts` — getDuplicateCandidates() confirmed
- `src/server/actions/dms/document-qa.ts` — askDmsDocumentQuestion() confirmed
- `src/lib/ai/common/` — full directory structure reviewed
- `src/features/ai/common/` — 5 feature directories confirmed (field-suggestions, duplicate-detection, compliance-checker, risk-scoring, search)

---

## DB Tables Reviewed (live)

| Table | Exists | Notes |
|---|---|---|
| `erp_ai_feature_flags` | YES | `ERP_AI_ASSISTANT` exists, enabled=true |
| `permissions` | YES | `ai.actions.prepare` + `ai.actions.execute_after_confirm` exist |
| `erp_ai_field_suggestions` | YES | BIGINT PK, RLS enabled+forced |
| `erp_ai_duplicate_candidates` | YES | BIGINT PK, RLS enabled+forced |
| `erp_ai_compliance_findings` | YES | BIGINT PK, RLS enabled+forced |
| `erp_ai_risk_scores` | YES | BIGINT PK, RLS enabled+forced |
| `erp_ai_recent_searches` | YES | BIGINT PK, RLS enabled+forced (AI.6) |
| `erp_ai_assistant_sessions` | **NO** | Must create |
| `erp_ai_assistant_messages` | **NO** | Must create |
| `erp_ai_assistant_action_drafts` | **NO** | Must create |
| `erp_ai_provider_configs` | YES | Confirmed — provider bridge available |
| `erp_ai_usage_logs` | YES | Confirmed — safe usage logging available |

---

## Main Findings

### Finding 1: Feature flag already exists and is enabled
`ERP_AI_ASSISTANT` is in `erp_ai_feature_flags` with `is_enabled=true`. 
**Implication:** Implementation must use this flag directly. Do NOT create a new flag.

### Finding 2: Action permissions pre-seeded (but assistant permissions missing)
`ai.actions.prepare` and `ai.actions.execute_after_confirm` already exist.
`ai.assistant.use`, `ai.assistant.view`, `ai.assistant.admin` are **missing** — must be added.
**Implication:** Migration must add 3 permissions and map them to admin roles.

### Finding 3: No assistant tables exist
All 3 new tables must be created in migration.
**Implication:** Full DDL required for sessions, messages, action_drafts with BIGINT PK, RLS ENABLED+FORCED.

### Finding 4: Provider bridge is already established
`callCommonAiStructuredCompletion()` in `src/lib/ai/common/provider-bridge.ts` already provides a clean, safe AI provider bridge.
**Implication:** Assistant intent extraction and response synthesis reuse this bridge directly — no new provider abstraction needed.

### Finding 5: AI.6 search is the right retrieval layer
`searchAcrossErp()` already implements keyword/FTS/semantic/intent search with permission-aware results.
**Implication:** Assistant delegates context retrieval to AI.6. No independent entity queries needed for SEARCH_ERP action.

### Finding 6: ERP_AI_ACTIONS flag exists but disabled
`ERP_AI_ACTIONS` exists with `is_enabled=false`, `requires_human_review=true`.
**Implication:** Keep this flag disabled in v1. It may be used in a future AI.7 v2 for actual action execution after human confirmation.

### Finding 7: DMS Document QA is available
`askDmsDocumentQuestion()` in `src/server/actions/dms/document-qa.ts` already provides document-level Q&A.
**Implication:** EXPLAIN_DOCUMENT can delegate to this action with confidentiality gates already applied.

### Finding 8: All AI.3/AI.4/AI.5 read actions available
- `getDuplicateCandidates()` → EXPLAIN_DUPLICATE
- Compliance findings read → EXPLAIN_COMPLIANCE  
- `getRiskScoreForEntity()` → EXPLAIN_RISK
**Implication:** All explain actions can reuse existing server actions. No new DB queries needed.

---

## Whether One-Phase Implementation is Recommended

**YES — one implementation phase is recommended.**

Rationale:
- All foundations are in place (provider bridge, search, AI.1–AI.6)
- Scope is limited to read/explain/draft-only actions
- No novel DB patterns needed (follows AI.1–AI.6 table patterns exactly)
- 3 new tables are straightforward with established RLS patterns
- AI calls are capped at max 2 per message

---

## Whether Migration is Recommended

**YES** — Migration required for:
1. 3 new permissions (`ai.assistant.use`, `ai.assistant.view`, `ai.assistant.admin`)
2. Role permission mappings for system_admin, group_admin, company_admin
3. 3 new tables (`erp_ai_assistant_sessions`, `erp_ai_assistant_messages`, `erp_ai_assistant_action_drafts`)
4. Indexes and RLS policies

Feature flag `ERP_AI_ASSISTANT` already exists — NOT created again.

---

## Whether Assistant Messages Should Be Persisted

**YES — messages should be persisted**, with strict constraints:
- `message_text` capped at 4000 chars
- No raw AI prompt text stored
- No raw AI response text stored
- No OCR text, content_text, or sensitive values stored
- Only sanitized, human-readable conversation text

Rationale: Session history is critical for audit trail, admin oversight, and session resume capability.

---

## Whether Action Drafts Should Be Stored

**YES — action drafts should be stored** in `erp_ai_assistant_action_drafts`.
- Draft lifecycle: draft → reviewed → accepted_for_manual_action / dismissed / superseded
- `draft_payload_json` must contain final human-readable content only
- Drafts are the mechanism by which assistant output is handed off to the human

---

## What Action Registry Should v1 Support

| Action Code | Safety Class | Can Mutate DB? |
|---|---|---|
| SEARCH_ERP | read_only | No |
| OPEN_RECORD | navigation | No |
| EXPLAIN_RISK | read_only | No |
| EXPLAIN_COMPLIANCE | read_only | No |
| EXPLAIN_DUPLICATE | read_only | No |
| EXPLAIN_DOCUMENT | read_only | No |
| PREPARE_FIELD_UPDATE_DRAFT | draft_only | Yes (draft table only) |
| PREPARE_EMAIL_DRAFT_TEXT | draft_only | Yes (draft table only) |
| PREPARE_RENEWAL_NOTE | draft_only | Yes (draft table only) |
| SHOW_NEXT_ACTIONS | read_only | No |

10 actions total in v1. All mutations are limited to saving to `erp_ai_assistant_action_drafts`.

---

## Biggest Risks

| Risk | Impact | Mitigation in Plan |
|---|---|---|
| AI generates unsafe mutation proposals | High | Blocked action registry; Zod-validated intent JSON |
| Draft payload leaks sensitive content | High | Content rules enforced at engine level; no raw AI response stored |
| Token cost escalation | Medium | Max 2 AI calls/message; context capped at 5 search results |
| Users mistake drafts for executed actions | Medium | All outputs labeled "AI draft — requires human review" |
| Intent misclassification → wrong action | Medium | Fallback to SEARCH_ERP; confidence level shown |
| Session message overflow | Low | Max 50 messages; archive prompt |

---

## Recommended Next Action

**Sameer/ChatGPT review this plan and the SQL review files, then approve the implementation prompt.**

Files for review:
- `implementation_Review/ERP_COMMON_AI_7_ASSISTANT_FOR_ACTIONS_PLAN.md`
- `implementation_Review/sql_review/ERP_COMMON_AI_7_SCHEMA_REVIEW.sql`
- `implementation_Review/sql_review/ERP_COMMON_AI_7_OPTIONAL_MIGRATION_REVIEW.sql`
- This report: `implementation_Review/ERP_COMMON_AI_7_PLANNING_REPORT.md`

Key questions for Sameer to confirm:
1. Approve 10-action v1 registry (see plan Section 8)
2. Confirm `/assistant` as the route (not `/admin/ai/assistant`)
3. Confirm `ERP_AI_ASSISTANT` as the correct flag (already enabled)
4. Confirm `ai.assistant.use` / `ai.assistant.view` / `ai.assistant.admin` as the new permissions
5. Approve message persistence (sanitized text, no raw AI content)
6. Approve 3-table DB design (sessions + messages + action_drafts)
7. Confirm max 2 AI calls per message is acceptable cost
8. Approve sidebar placement: Administration → AI Assistant (after AI Search)
