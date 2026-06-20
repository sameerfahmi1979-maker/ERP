# ERP COMMON AI.1A — Registry, Types, Prompt Contract, Output Schema — Implementation Report

**Phase:** ERP COMMON AI.1A  
**Date:** 2026-06-16  
**Status:** CLOSED / PASS ✅  
**Scope:** Code-only TypeScript foundation — no DB, no UI, no server actions, no OpenAI calls  

---

## Summary

Implemented the TypeScript registry foundation for the Universal Internal AI Field Suggestion Engine. This phase defines all types, constants, entity registries, output schema, validator, and prompt contract builder. No database tables, server actions, UI, or AI calls were created.

---

## Files Created

| File | Description |
|---|---|
| `src/lib/ai/common/types.ts` | All core TypeScript types for the engine |
| `src/lib/ai/common/constants.ts` | Prompt version, entity type lists, caps |
| `src/lib/ai/common/non-updatable-fields.ts` | Non-updatable field guard + assertion |
| `src/lib/ai/common/registry/index.ts` | Registry map, lookup functions, validation |
| `src/lib/ai/common/registry/company-registry.ts` | Stage 1 — Organization/owner_companies |
| `src/lib/ai/common/registry/party-registry.ts` | Stage 1 — Party/parties |
| `src/lib/ai/common/registry/branch-registry.ts` | Stage 2 stub — Branch |
| `src/lib/ai/common/registry/site-registry.ts` | Stage 2 stub — Work Site |
| `src/lib/ai/common/field-suggestions/output-schema.ts` | Zod schema for AI output validation |
| `src/lib/ai/common/field-suggestions/output-validator.ts` | Full output validation and sanitization |
| `src/lib/ai/common/field-suggestions/prompt-builder.ts` | System + user prompt builders (no AI call) |
| `src/lib/ai/common/index.ts` | Barrel exports for all Common AI foundation |

---

## Scope Summary

This is a **types/registry/schema/prompt-contract only** phase. No runtime code interacts with the database or any AI provider.

---

## Registry Entities

### Stage 1 — Active for Generation

**Company (`owner_companies`)**
- `viewPermission`: `organizations.view`
- `managePermission`: `organizations.manage`
- Registered fields: `trade_name`, `main_activity`, `established_date`, `office_address_line_1`, `office_address_line_2`, `office_emirate_id` (fk/requires_review), `office_city_id` (fk/requires_review)
- Document hints: TRADE_LICENSE, VAT_CERTIFICATE, TRN_CERTIFICATE, POWER_OF_ATTORNEY, UTILITY_BILL

**Party (`parties` + child tables)**
- `viewPermission`: `master_data.party_master.view`
- `managePermission`: `master_data.party_master.manage`
- Registered fields on `parties`: `display_name`, `legal_name_en`, `legal_name_ar`, `primary_email`, `primary_phone`, `website`
- Registered child fields: `party_tax_registrations.trn`, `party_licenses.license_number`, `party_licenses.expiry_date`
- Document hints: TRADE_LICENSE, VAT_CERTIFICATE, TRN_CERTIFICATE, POWER_OF_ATTORNEY

### Stage 2 Stubs — Not Yet Active

**Branch (`branches`)** — `stage: "stage_2_stub"`
- Fields: `legal_branch_name`, `trade_license_branch_ref`, `opening_date`
- Will be activated after Stage 1 UAT passes.

**Work Site (`work_sites`)** — `stage: "stage_2_stub"`
- Fields: `site_name`, `address_line_1`, `address_line_2`, `access_restrictions`
- `site_code` is NOT registered (globally forbidden).

---

## Non-Updatable Field Guard

`src/lib/ai/common/non-updatable-fields.ts` enforces:

- Named global denials: `id`, all audit columns, `party_code`, `site_code`, `document_no`, `reference_no`, `code`, etc.
- Pattern denials: `*_code`, `*_no`, `*_number`, `audit_*`, `meta_*`
- FK denial unless `allowForeignKeyUpdate: true` + `requires_review`
- Status field denial unless `allowStatusUpdate: true`

All 4 registries call `assertAiFieldCanBeRegistered()` at module load — misconfigured fields throw immediately.

---

## Output Schema

`src/lib/ai/common/field-suggestions/output-schema.ts` provides:

- `ErpAiFieldSuggestionOutputSchema` — single suggestion validation
- `ErpAiSuggestionGenerationOutputSchema` — full generation output
- Enforced caps: `sourceExcerpt` ≤ 500 chars, `aiReason` ≤ 1000 chars, `confidenceScore` clamped 0–1, max 50 suggestions
- All enum types validated (entityType, fieldType, suggestionType)

---

## Output Validator

`src/lib/ai/common/field-suggestions/output-validator.ts`:

- Strips code fences and parses JSON safely
- Validates against Zod schema
- Filters to registered AI-eligible fields only
- Rejects globally non-updatable fields
- Sanitizes string lengths
- Never throws raw AI response in error messages
- Exports: `validateErpAiSuggestionOutput`, `sanitizeAiSuggestionDraft`, `filterSuggestionsToRegisteredFields`

---

## Prompt Builder Contract

`src/lib/ai/common/field-suggestions/prompt-builder.ts`:

- System prompt: role definition, output format rules, evidence rules, field rules, confidence scoring, UAE context, limits
- User prompt: current record state, registered fields, evidence snippets
- Never calls AI, never reads DB, never logs prompt content
- Exports: `buildErpAiFieldSuggestionSystemPrompt`, `buildErpAiFieldSuggestionUserPrompt`, `buildErpAiFieldSuggestionPrompt`
- Prompt version: `common-ai-field-suggestions-v1.0`

---

## What Was Explicitly Not Implemented

| Item | Status |
|---|---|
| DB migration / new tables | ❌ None |
| `erp_ai_field_suggestions` table | ❌ Not created |
| `erp_ai_field_suggestion_events` table | ❌ Not created |
| `erp_ai_record_ai_status` table | ❌ Not created |
| Server actions under `src/server/actions/ai/` | ❌ Not created |
| DMS evidence loader | ❌ Not implemented |
| OpenAI calls | ❌ None |
| AI Review UI / tab | ❌ Not created |
| Accept / reject / apply engine | ❌ Not implemented |
| Writes to organization / party / branch / site records | ❌ None |
| `ERP_AI_FORM_FILL` flag enabled | ❌ Remains false |
| MCP server | ❌ None |
| Public API routes | ❌ None |

---

## TypeScript / Build Results

| Check | Result |
|---|---|
| `npm run typecheck` | **PASS** (0 errors) |
| `npm run build` | **PASS** |

Initial typecheck had 4 errors (missing `allowForeignKeyUpdate` on type, entity type cast, registry field cast) — all fixed before final pass.

---

## Risks / Open Questions

1. **applyHandlerKey resolution** — handler strings are defined but handlers don't exist yet; Phase 1E will implement them.
2. **Child table writes for Party** — `party_tax_registrations.trn` and `party_licenses.*` require apply handlers that locate/create the correct child row. Phase 1E must handle this carefully.
3. **FK field resolution** — `office_emirate_id` and `office_city_id` use `suggestedValue` as the emirate/city name string; the Phase 1E apply handler must resolve this to a DB ID via a lookup query.
4. **Stage 2 activation** — Branch and Site registries are stubs. They must not be used for generation until `stage` is changed to `"stage_1"` in a future Phase prompt.

---

## Recommended Next Phase

**ERP COMMON AI.1B — DB Tables, RLS, Permissions, Server Action Skeleton**

Create `erp_ai_field_suggestions` and `erp_ai_field_suggestion_events` tables with RLS, and a server action skeleton (auth/permission gates, no AI call yet).

---

**End of Report**
