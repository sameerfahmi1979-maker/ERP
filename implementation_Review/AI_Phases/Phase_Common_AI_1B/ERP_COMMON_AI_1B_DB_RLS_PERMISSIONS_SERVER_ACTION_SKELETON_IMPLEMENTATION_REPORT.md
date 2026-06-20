# ERP COMMON AI.1B — DB Tables, RLS, Permissions, Server Action Skeleton — Implementation Report

**Phase:** ERP COMMON AI.1B  
**Date:** 2026-06-16  
**Status:** CLOSED / PASS ✅  
**Scope:** DB tables, RLS, pilot entity permission helpers, server action skeleton  

---

## Summary

Created the database persistence foundation and server action skeleton for the Universal Internal AI Field Suggestion Engine. Two new tables with BIGINT PKs, full RLS ENABLED+FORCED, explicit pilot entity permission helper functions, and a gated server action skeleton. No AI calls, no DMS evidence loader, no UI, no target record writes.

---

## Files Created / Changed

| File | Action |
|---|---|
| `supabase/migrations/20260616190000_erp_common_ai_1b_field_suggestions_tables.sql` | **Created** — tables, RLS, helper functions |
| `src/server/actions/ai/common/field-suggestions.ts` | **Created** — server action skeleton (7 functions) |
| `src/lib/query/query-keys.ts` | **Updated** — added `ai.fieldSuggestions` + `ai.recordAiStatus` keys |
| `src/lib/query/invalidation.ts` | **Updated** — added `invalidateAiFieldSuggestions`, `invalidateAiRecordStatus`, `invalidateAllAiEntityCaches` |
| `.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md` | **Updated** — phase closure + tracker row |

---

## Migration

| Item | Value |
|---|---|
| File | `20260616190000_erp_common_ai_1b_field_suggestions_tables.sql` |
| Applied to live DB | ✅ Yes (via `user-supabase` MCP) |
| New tables | `erp_ai_field_suggestions`, `erp_ai_field_suggestion_events` |
| New DB functions | `current_user_can_view_ai_entity`, `current_user_can_manage_ai_entity` |

---

## Tables Created

### `erp_ai_field_suggestions`

| Property | Value |
|---|---|
| PK | BIGINT GENERATED ALWAYS AS IDENTITY |
| RLS | ENABLED + FORCED ✅ |
| Soft delete | `deleted_at` ✅ |
| `updated_at` trigger | `set_updated_at()` ✅ |
| Constraints | entity_type, field_type, suggestion_type, status CHECK; confidence 0–1; excerpt ≤500 chars; reason ≤1000 chars |
| Indexes | entity_status (partial), source_document (partial), generation_batch (partial), created_by (partial) |
| Unique index | `uq_erp_ai_field_suggestions_pending_field` — one pending suggestion per `entity_type + entity_id + target_table + target_field` |

### `erp_ai_field_suggestion_events` (append-only audit trail)

| Property | Value |
|---|---|
| PK | BIGINT GENERATED ALWAYS AS IDENTITY |
| RLS | ENABLED + FORCED ✅ |
| No UPDATE / DELETE policy | ✅ Append-only |
| `event_type` CHECK | `generated, accepted, rejected, applied, apply_failed, superseded, status_changed` |
| Indexes | suggestion_id, actor_user_id, created_at DESC |

### Table NOT created: `erp_ai_record_ai_status`

Deferred to UI phase if needed — keep Phase 1B minimal per prompt guidance.

---

## RLS Policies Summary

### `erp_ai_field_suggestions`

| Policy | Gate |
|---|---|
| SELECT | `ai.field_suggestions.view` + `current_user_can_view_ai_entity()` OR `ai.common.admin` OR `system_admin` |
| INSERT | `ai.field_suggestions.generate` + `current_user_can_view_ai_entity()` + `created_by = current_user_profile_id()` OR admin |
| UPDATE | `ai.field_suggestions.apply` + `current_user_can_manage_ai_entity()` OR admin |
| DELETE | No policy — soft delete via `deleted_at` only |

### `erp_ai_field_suggestion_events`

| Policy | Gate |
|---|---|
| SELECT | `ai.field_suggestions.view` + EXISTS (parent suggestion viewable) OR admin |
| INSERT | `actor_user_id = current_user_profile_id()` + relevant ai permission + EXISTS (parent viewable) OR admin |
| UPDATE | No policy — append-only |
| DELETE | No policy — append-only |

---

## Explicit Pilot Entity Permission Helper Functions

Both functions created in live DB (`SECURITY INVOKER`, `STABLE`, `LANGUAGE plpgsql`):

| Function | Purpose |
|---|---|
| `current_user_can_view_ai_entity(entity_type, entity_id)` | Checks entity view permission + entity row exists (soft-delete aware) |
| `current_user_can_manage_ai_entity(entity_type, entity_id)` | Checks entity manage permission + entity row exists |

**No dynamic SQL** — explicit `CASE` mapping only:

| entity_type | View permission | Manage permission | Table |
|---|---|---|---|
| `company` | `organizations.view` | `organizations.manage` | `owner_companies` |
| `party` | `master_data.party_master.view` | `master_data.party_master.manage` | `parties` |
| `branch` | `branches.view` | `branches.manage` | `branches` |
| `site` | `common_md.work_sites.view` | `common_md.work_sites.manage` | `work_sites` |

Unregistered entity types always return `false`.

---

## Server Action Skeleton Summary

File: `src/server/actions/ai/common/field-suggestions.ts`

| Function | Status |
|---|---|
| `getAiFieldSuggestions(input)` | ✅ **Implemented** — reads `erp_ai_field_suggestions` with auth/permission gates |
| `generateAiFieldSuggestions(input)` | 🔒 **Skeleton** — all gates pass, returns "not implemented" (Phase 1D) |
| `acceptAiFieldSuggestion(input)` | 🔒 **Skeleton** — gated, returns "not implemented" (Phase 1E) |
| `rejectAiFieldSuggestion(input)` | 🔒 **Skeleton** — gated, returns "not implemented" (Phase 1E) |
| `acceptSelectedAiFieldSuggestions(input)` | 🔒 **Skeleton** — gated, returns "not implemented" (Phase 1E) |
| `applyAiFieldSuggestion(input)` | 🔒 **Skeleton** — gated, returns "not implemented" (Phase 1E) |
| `supersedeAiFieldSuggestions(input)` | 🔒 **Skeleton** — gated, returns "not implemented" (Phase 1D) |

All actions follow the pattern: `getAuthContext()` → `hasPermission()` → Zod validate → registry check → flag check → safe placeholder.

---

## Query Keys / Invalidation

Added to `src/lib/query/query-keys.ts`:
```typescript
queryKeys.ai.fieldSuggestions(entityType, entityId, status?)
queryKeys.ai.recordAiStatus(entityType, entityId)
```

Added to `src/lib/query/invalidation.ts`:
```typescript
invalidateAiFieldSuggestions(queryClient, entityType, entityId)
invalidateAiRecordStatus(queryClient, entityType, entityId)
invalidateAllAiEntityCaches(queryClient, entityType, entityId)
```

---

## Feature Flag Behavior

- `ERP_AI_FORM_FILL` remains `is_enabled = false` in live DB ✅
- `generateAiFieldSuggestions` checks flag before any generation attempt
- Read actions (`getAiFieldSuggestions`) do not require the flag

---

## What Was Explicitly Not Implemented

| Item | Status |
|---|---|
| OpenAI / AI provider calls | ❌ None |
| DMS evidence loader | ❌ Not created |
| AI Review UI | ❌ Not created |
| Target record writes | ❌ None |
| `erp_ai_record_ai_status` table | ❌ Deferred (documented) |
| accept/reject/apply business logic | ❌ Skeleton only (Phase 1E) |
| `ERP_AI_FORM_FILL` flag enabled | ❌ Remains `false` |

---

## Live DB Verification

| Check | Result |
|---|---|
| `erp_ai_field_suggestions` exists | ✅ |
| `erp_ai_field_suggestion_events` exists | ✅ |
| Both tables RLS enabled + forced | ✅ |
| `current_user_can_view_ai_entity` function exists | ✅ |
| `current_user_can_manage_ai_entity` function exists | ✅ |
| `ERP_AI_FORM_FILL` remains disabled | ✅ |
| No DMS flags altered | ✅ |
| `erp_ai_record_ai_status` does NOT exist | ✅ (deferred) |

---

## TypeScript / Build Results

| Check | Result |
|---|---|
| `npm run typecheck` | **PASS** (0 errors) |
| `npm run build` | **PASS** |

---

## Risks / Open Questions

1. **Unique pending index** — `uq_erp_ai_field_suggestions_pending_field` enforces one pending suggestion per field per entity. Phase 1D's `supersedeAiFieldSuggestions` must call supersede before inserting a new suggestion to avoid unique constraint violations.
2. **Child table apply handlers** — Party child fields (`party_tax_registrations.trn`, `party_licenses.license_number`, `party_licenses.expiry_date`) have a different `target_table` than the main entity. Phase 1E apply handlers must handle these correctly.
3. **Stage 2 entity gating** — Branch and Site generation is blocked at the skeleton level. Stage 2 will require Phase prompt approval before activation.

---

## Recommended Next Phase

**ERP COMMON AI.1C — DMS Evidence Loader from Linked Documents**

Load linked DMS documents for a given entity via `dms_document_links`, extract content snippets (AI summaries, excerpts) — capped to `ERP_COMMON_AI_MAX_EVIDENCE_CONTENT_CHARS` — and assemble `ErpAiDocumentEvidenceSnippet[]` for the prompt builder.

---

**End of Report**
