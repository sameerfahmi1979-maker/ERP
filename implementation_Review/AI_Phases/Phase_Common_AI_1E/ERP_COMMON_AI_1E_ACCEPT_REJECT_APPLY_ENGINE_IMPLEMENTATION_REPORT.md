# ERP COMMON AI.1E — Accept / Reject / Apply Engine — Implementation Report

**Phase:** ERP COMMON AI.1E  
**Date:** 2026-06-16  
**Status:** CLOSED / PASS ✅  
**Scope:** Accept/reject/apply engine for AI field suggestions — Stage 1 only, no UI  

---

## Summary

Implemented the full human-review workflow for AI field suggestions: accept, reject, apply (single + batch). Apply handlers cover all Stage 1 text/date fields for company and party. FK fields are blocked with a safe message. Party child table fields apply only when exactly one active row exists. No UI, no OpenAI calls, no auto-apply, `ERP_AI_FORM_FILL` remains `false`.

---

## Files Created / Changed

| File | Action |
|---|---|
| `src/lib/ai/common/field-suggestions/apply-handlers.ts` | **Created** — field-level DB writers for Stage 1 company/party fields |
| `src/lib/ai/common/field-suggestions/apply-engine.ts` | **Created** — apply orchestrator + status updater + event insert |
| `src/server/actions/ai/common/field-suggestions.ts` | **Updated** — 4 actions implemented: accept, reject, apply, batch accept+apply |
| `src/lib/ai/common/index.ts` | **Updated** — added apply engine + handler type exports |
| `.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md` | **Updated** — phase closure + tracker row |

**No DB migration** — code-only phase.

---

## Accept Workflow Summary

`acceptAiFieldSuggestion({ suggestionId })`:

- Requires: `ai.field_suggestions.apply` + entity manage permission
- Status check: must be `pending`
- Updates: `status=accepted`, `accepted_by`, `accepted_at`
- Inserts: `accepted` event
- Logs: `erp_ai_field_suggestion_accepted` audit event
- Does NOT write to target record

---

## Reject Workflow Summary

`rejectAiFieldSuggestion({ suggestionId, reason? })`:

- Requires: `ai.field_suggestions.view` + entity view permission
- Status check: must be `pending` or `accepted`
- Updates: `status=rejected`, `rejected_by`, `rejected_at`
- Inserts: `rejected` event with safe reason (max 300 chars)
- Logs: `erp_ai_field_suggestion_rejected` audit event
- Does NOT write to target record

---

## Apply Workflow Summary

`applyAiFieldSuggestion({ suggestionId })`:

- Requires: `ai.field_suggestions.apply` + entity manage permission
- Status check (enforced by apply engine): must be `accepted`
- Calls: `applyAiSuggestionByRegisteredHandler()` → `APPLY_HANDLER_REGISTRY[applyHandlerKey]`
- On success: `status=applied`, `applied_by`, `applied_at`, `applied` event, audit, revalidatePath
- On failure: `status=failed`, `apply_error`, `apply_failed` event, audit, no target write
- Returns: `{ targetField, status }`

---

## Batch Accept+Apply Summary

`acceptSelectedAiFieldSuggestions({ entityType, entityId, suggestionIds[] })`:

- Requires: `ai.field_suggestions.apply` + entity manage permission
- Max 50 IDs per call
- Processes sequentially — per-item results always returned
- For each ID: accepts (if pending) → applies → records outcome
- Returns: `{ appliedCount, failedCount, skippedCount, items[] }`
- Logs: `erp_ai_field_suggestions_batch_accept_apply` audit event
- Calls `revalidateEntityPath()` after completion

---

## Apply Handler Summary by Entity/Table/Field

### Company (`owner_companies`)

| Field | Handler | Type | Status |
|---|---|---|---|
| `trade_name` | `apply_owner_company_trade_name` | text, max 255 | ✅ Implemented |
| `main_activity` | `apply_owner_company_main_activity` | text, max 500 | ✅ Implemented |
| `established_date` | `apply_owner_company_established_date` | date, ISO validated | ✅ Implemented |
| `office_address_line_1` | `apply_owner_company_office_address_line_1` | text, max 255 | ✅ Implemented |
| `office_address_line_2` | `apply_owner_company_office_address_line_2` | text, max 255 | ✅ Implemented |
| `office_emirate_id` | `apply_owner_company_office_emirate_id` | FK | ❌ **Blocked** |
| `office_city_id` | `apply_owner_company_office_city_id` | FK | ❌ **Blocked** |

### Party (`parties`)

| Field | Handler | Type | Status |
|---|---|---|---|
| `display_name` | `apply_party_display_name` | text, max 255 | ✅ Implemented |
| `legal_name_en` | `apply_party_legal_name_en` | text, max 255 | ✅ Implemented |
| `legal_name_ar` | `apply_party_legal_name_ar` | text, max 255 | ✅ Implemented |
| `primary_email` | `apply_party_primary_email` | email validated, max 255 | ✅ Implemented |
| `primary_phone` | `apply_party_primary_phone` | text, max 50 | ✅ Implemented |
| `website` | `apply_party_website` | text, max 500 | ✅ Implemented |

### Party child: `party_tax_registrations`

| Field | Handler | Status |
|---|---|---|
| `trn` | `apply_party_tax_registration_trn` | ✅ One-row-only rule |

### Party child: `party_licenses`

| Field | Handler | Status |
|---|---|---|
| `license_number` | `apply_party_license_license_number` | ✅ One-row-only rule |
| `expiry_date` | `apply_party_license_expiry_date` | ✅ One-row-only rule |

---

## FK Handling Decision

FK fields (`office_emirate_id`, `office_city_id`) are **blocked** in Phase 1E. Reason: numeric ID resolution requires a safe lookup from a text name (what AI produces) to a DB ID. This is deferred to Phase 1F+ to avoid unsafe guessing.

When FK apply is attempted, handler returns:
> "FK field cannot be applied automatically in Phase 1E. Numeric ID resolution requires manual selection. Please update this field manually."

---

## Party Child Table Handling Decision

For `party_tax_registrations.trn`, `party_licenses.license_number`, `party_licenses.expiry_date`:

- Apply succeeds only if the party has **exactly one active** child row (no new row creation).
- If zero rows: returns `"requires manual creation"` failure.
- If multiple rows: returns `"requires manual selection"` failure.

This avoids guessing the correct child row.

---

## Events / Audit Summary

| Lifecycle event | DB event_type | Audit action |
|---|---|---|
| Accept | `accepted` | `erp_ai_field_suggestion_accepted` |
| Reject | `rejected` | `erp_ai_field_suggestion_rejected` |
| Apply success | `applied` | `erp_ai_field_suggestion_applied` |
| Apply failure | `apply_failed` | `erp_ai_field_suggestion_apply_failed` |
| Batch accept+apply | per-item + batch summary | `erp_ai_field_suggestions_batch_accept_apply` |

Event `event_data_json` contains: `fieldLabel`, `targetTable`, `targetField`, `oldStatus`, `newStatus`, `safeMessage`, `applyHandlerKey`. Never contains: prompt, OCR, evidence, raw AI response.

---

## Permission / RLS Behavior

| Operation | Permissions required |
|---|---|
| Accept | `ai.field_suggestions.apply` + entity manage |
| Reject | `ai.field_suggestions.view` + entity view |
| Apply | `ai.field_suggestions.apply` + entity manage |
| Batch accept+apply | `ai.field_suggestions.apply` + entity manage |

Target record writes use `createClient()` (user-scoped). No `createAdminClient()` bypass.

---

## Revalidation

After successful apply:
- Company: `revalidatePath("/admin/organizations")` + `revalidatePath("/admin/organizations/record/[id]")`
- Party: `revalidatePath("/admin/master-data/parties")` + `revalidatePath("/admin/master-data/parties/record/[id]")`

---

## What Was Explicitly Not Implemented

| Item | Status |
|---|---|
| UI / AI Review tab | ❌ None |
| OpenAI calls | ❌ None |
| Auto-apply | ❌ None |
| Branch/Site apply | ❌ Blocked at registry/stage gate |
| FK apply resolution | ❌ Blocked (safe error returned) |
| `ERP_AI_FORM_FILL` enabled | ❌ Remains `false` |
| New child row creation | ❌ None (one-row-only rule) |

---

## TypeScript / Build Results

| Check | Result |
|---|---|
| `npm run typecheck` | **PASS** (0 errors) |
| `npm run build` | **PASS** |

Initial typecheck had 2 errors (Supabase query type casts) — fixed.

---

## Risks / Open Questions

1. **FK apply (Phase 1F+)**: `office_emirate_id` and `office_city_id` require text→ID lookup. Phase 1F or UAT will add a lookup step matching the AI-suggested emirate/city name against the `emirates` / `cities` tables.
2. **Party child multi-row**: If a party has multiple trade licenses (e.g., in different emirates), the one-row-only guard will fail. Phase 1F may add a "select which child row to update" UI.
3. **updated_at pattern**: Apply handlers write `updated_at` directly. The `set_updated_at()` DB trigger fires on UPDATE anyway — harmless.
4. **Batch revalidation**: `revalidatePath` may not fire correctly in non-request contexts. The `try/catch` makes it non-fatal.

---

## Recommended Next Phase

**ERP COMMON AI.1F — UI Panel and Pilot Integration**

Build the AI suggestions review panel inside Organization and Party workspace record forms: display pending suggestions with confidence badges, accept/reject/apply buttons, evidence document previews (document ID + title only).

---

**End of Report**
