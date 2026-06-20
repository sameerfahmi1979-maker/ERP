# ERP COMMON AI.1D — Suggestion Generation and Storage — Implementation Report

**Phase:** ERP COMMON AI.1D  
**Date:** 2026-06-16  
**Status:** CLOSED / PASS ✅  
**Scope:** Full AI suggestion generation pipeline for Stage 1 entities (company + party)  

---

## Summary

Implemented the complete suggestion generation pipeline: evidence loading → current record snapshot → prompt building → AI provider call → output validation → supersede old pending → insert new pending → insert events → usage logging → audit. No UI, no accept/reject/apply, no target record writes. `ERP_AI_FORM_FILL` remains disabled (generation will return a controlled "disabled" error).

---

## Files Created / Changed

| File | Action |
|---|---|
| `src/lib/ai/common/field-suggestions/current-record-loader.ts` | **Created** — loads current field values for registered entity fields |
| `src/lib/ai/common/provider-bridge.ts` | **Created** — thin bridge to `getDmsAiProvider().callStructuredCompletion()` |
| `src/lib/ai/common/field-suggestions/persistence.ts` | **Created** — supersede + insert suggestions + events + usage log |
| `src/server/actions/ai/common/field-suggestions.ts` | **Updated** — `generateAiFieldSuggestions` fully implemented; `supersedeAiFieldSuggestions` implemented |
| `src/lib/ai/common/index.ts` | **Updated** — added provider bridge + persistence type exports |
| `.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md` | **Updated** — phase closure + tracker row |

**No DB migration** — code-only phase.

---

## Generation Flow Summary

`generateAiFieldSuggestions(input)` full pipeline:

1. Zod validate input (`entityType`, `entityId`)
2. `getAuthContext()` — get user profile + permissions
3. Feature flag check — `ERP_AI_FORM_FILL` must be enabled (returns controlled error if disabled)
4. Permission checks — `ai.field_suggestions.generate` + `dms.documents.view` + entity view permission
5. Registry lookup — `lookupCommonAiRegistry(entityType)` — must be `stage_1`
6. Stage gate — `company` or `party` only; branch/site return controlled error
7. Load DMS evidence — `loadLinkedDmsDocumentEvidence()` (1C loader)
8. Guard: if no evidence snippets → return "no linked documents" message, do not call AI
9. Load current record snapshot — `loadCurrentRecordSnapshot()` (main table fields; child table fields attempted best-effort)
10. Build prompt — `buildErpAiFieldSuggestionPrompt()` (1A prompt builder)
11. AI call — `callCommonAiStructuredCompletion()` (via `getDmsAiProvider().callStructuredCompletion()`)
12. Validate output — `validateErpAiSuggestionOutput()` (1A validator)
13. Guard: validation failure → log usage, return controlled error, no persistence
14. Supersede old pending — `supersedePendingSuggestions()` + `insertSupersededEvents()`
15. Insert new pending — `insertPendingSuggestions()`
16. Insert generated events — `insertGeneratedEvents()`
17. Log safe usage metadata — `logCommonAiUsage()` → `erp_ai_usage_logs`
18. Log safe audit event — `logAudit()` (counts only — no content)
19. Return safe `GenerationResult` — counts and IDs only; no prompt/response/evidence text

---

## Provider Usage Summary

**Provider bridge:** `src/lib/ai/common/provider-bridge.ts`

- Uses `getDmsAiProvider()` from existing `src/lib/dms/ai/factory.ts`
- Calls `provider.callStructuredCompletion(systemPrompt, userMessage)` → `DmsStructuredCompletionOutput`
- No direct OpenAI SDK import
- No direct fetch calls to OpenAI in feature code
- API key remains in `process.env[secretRef]` via existing provider config

---

## Current Record Snapshot Summary

**File:** `src/lib/ai/common/field-suggestions/current-record-loader.ts`

- Loads only registered, AI-eligible fields per entity registry
- Stage 1 only: `company` → `owner_companies`, `party` → `parties`
- Party child fields: `party_licenses` (license_number, expiry_date), `party_tax_registrations` (trn) — loaded best-effort (most recent row by `updated_at`); null if no child row
- All values serialized to string or null (no raw JSON objects passed to AI)
- No writes

---

## Evidence Loader Integration

1C `loadLinkedDmsDocumentEvidence()` called with entity context, registry, user admin status.

If `snippets.length === 0`: generation short-circuits with a safe message. No AI call.

---

## Prompt Builder Integration

1A `buildErpAiFieldSuggestionPrompt()` called with:
- `currentRecord` (from current-record-loader)
- `registeredFields` (from registry)
- `evidenceSnippets` (from 1C loader)
- `promptVersion = ERP_COMMON_AI_PROMPT_VERSION`

Prompt is built in memory and passed to AI — never logged or stored.

---

## Output Validation Summary

1A `validateErpAiSuggestionOutput(rawJson, registry)` called immediately on AI response:
- Strips code fences, parses JSON safely
- Validates against Zod schema
- Filters to registered AI-eligible fields only
- Rejects globally non-updatable fields
- Caps `sourceExcerpt` (500 chars) and `aiReason` (1000 chars)
- On validation failure: no persistence, safe error returned

---

## Supersede-Before-Insert Summary

`supersedePendingSuggestions(entityType, entityId, userProfileId)`:
- UPDATE `status = 'superseded'` on all pending rows for the entity
- Must run BEFORE insert to avoid unique pending index violation
- Inserts `superseded` events for each affected row

---

## Persistence Summary

`insertPendingSuggestions()`:
- Batch ID: `Date.now()` (epoch ms as BIGINT) — no migration needed
- Maps all validated suggestion drafts to DB row format
- `source_excerpt` ≤ 500 chars, `ai_reason` ≤ 1000 chars (capped + DB constraints)
- `status = 'pending'`
- `created_by = userProfileId`
- `prompt_version = ERP_COMMON_AI_PROMPT_VERSION`

`insertGeneratedEvents()`:
- `event_type = 'generated'`
- `event_data_json`: `promptVersion, suggestionType, confidenceScore, sourceDocumentId, sourceFileId` only
- No prompt/evidence/OCR/raw response in events

---

## Usage Logging Summary

`logCommonAiUsage()` → `erp_ai_usage_logs`:

| Field | Value |
|---|---|
| `feature_area` | `ERP_AI_FIELD_SUGGESTIONS` |
| `operation_type` | `generate_field_suggestions` |
| `model_id` | from provider |
| `status` | `complete` / `failed` / `failed_validation` |
| `input_token_count` | from provider response |
| `output_token_count` | from provider response |
| `duration_ms` | end-to-end |
| `metadata_json` | `entity_type, entity_id, suggestion_count, prompt_version` |

Never logged: prompt, raw response, evidence, OCR, field values.

---

## Audit Logging Summary

`logAudit()` → `audit_logs`:

| Field | Value |
|---|---|
| `module_code` | `AI` |
| `action` | `erp_ai_field_suggestions_generated` |
| `entity_name` | `erp_ai_field_suggestions` |
| `new_values` | `entityType, entityId, suggestionCount, supersededCount, linkedDocumentCount, skippedConfidentialCount, promptVersion, generationBatchId` |

---

## Feature Flag Behavior

- `ERP_AI_FORM_FILL` remains `is_enabled = false` in live DB ✅
- `generateAiFieldSuggestions` returns `"Common AI form fill is not yet enabled..."` when flag is off
- Read actions (`getAiFieldSuggestions`) work without the flag

---

## What Was Explicitly Not Implemented

| Item | Status |
|---|---|
| accept/reject/apply business logic | ❌ Phase 1E skeleton remains |
| Target ERP record writes | ❌ None |
| UI / AI Review tab | ❌ None |
| Branch/Site generation | ❌ Blocked (stage_2_stub gate) |
| `ERP_AI_FORM_FILL` enabled | ❌ Remains `false` |
| DB migration | ❌ None (batch ID uses epoch ms) |
| Evidence snippets returned to client | ❌ Never — counts only |
| Raw AI response returned | ❌ Never |
| Prompt logged | ❌ Never |

---

## TypeScript / Build Results

| Check | Result |
|---|---|
| `npm run typecheck` | **PASS** (0 errors) |
| `npm run build` | **PASS** |

Initial typecheck had 1 error (Supabase query type cast) — fixed.

---

## Risks / Open Questions

1. **Batch ID**: Uses `Date.now()` as BIGINT batch ID. Multiple rapid calls could get the same ms batch ID. Phase 1F/UAT can replace with a DB sequence if needed.
2. **Party child table current values**: `party_licenses` uses `ORDER BY updated_at DESC LIMIT 1` — gets the most recently updated license. If a party has multiple licenses, only one is captured. Apply handler in Phase 1E must handle the correct child row.
3. **Flag gate**: `ERP_AI_FORM_FILL` must be explicitly enabled for live generation. This is intentional — DO NOT enable without Sameer UAT approval.
4. **N+1 queries in evidence loader**: Inherited from Phase 1C — addressed in Phase 1F optimization if needed.

---

## Recommended Next Phase

**ERP COMMON AI.1E — Accept / Reject / Apply Engine**

Implement business logic for accepting, rejecting, and applying validated suggestions to target ERP records using the registered `applyHandlerKey` for each field.

---

**End of Report**
