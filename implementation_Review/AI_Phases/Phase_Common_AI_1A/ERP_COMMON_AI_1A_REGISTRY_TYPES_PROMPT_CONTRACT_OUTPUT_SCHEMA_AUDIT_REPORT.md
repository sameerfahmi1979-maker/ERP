# ERP COMMON AI.1A — Registry, Types, Prompt Contract, Output Schema — Audit Report

**Phase:** ERP COMMON AI.1A  
**Date:** 2026-06-16  
**Audit type:** Post-implementation audit  
**Auditor:** Cursor AI (automated verification)  
**Final decision:** **PASS WITH NOTES ✅**

---

## Scope Audited

| Item | Location |
|---|---|
| Types | `src/lib/ai/common/types.ts` |
| Constants | `src/lib/ai/common/constants.ts` |
| Non-updatable field guard | `src/lib/ai/common/non-updatable-fields.ts` |
| Registry index | `src/lib/ai/common/registry/index.ts` |
| Company registry (Stage 1) | `src/lib/ai/common/registry/company-registry.ts` |
| Party registry (Stage 1) | `src/lib/ai/common/registry/party-registry.ts` |
| Branch registry (Stage 2 stub) | `src/lib/ai/common/registry/branch-registry.ts` |
| Site registry (Stage 2 stub) | `src/lib/ai/common/registry/site-registry.ts` |
| Output schema | `src/lib/ai/common/field-suggestions/output-schema.ts` |
| Output validator | `src/lib/ai/common/field-suggestions/output-validator.ts` |
| Prompt builder | `src/lib/ai/common/field-suggestions/prompt-builder.ts` |
| Barrel | `src/lib/ai/common/index.ts` |
| Implementation report | `implementation_Review/AI_Phases/Phase_Common_AI_1A/ERP_COMMON_AI_1A_REGISTRY_TYPES_PROMPT_CONTRACT_OUTPUT_SCHEMA_IMPLEMENTATION_REPORT.md` |
| Source of truth | `.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md` |

---

## 1. Phase 1A Scope Control

**Result: PASS ✅**

| Forbidden item | Present |
|---|---|
| DB migration | ❌ None |
| `erp_ai_field_suggestions` table | ❌ None |
| `erp_ai_field_suggestion_events` table | ❌ None |
| `erp_ai_record_ai_status` table | ❌ None |
| `src/server/actions/ai/` | ❌ Does not exist |
| DMS evidence loader | ❌ None |
| OpenAI provider calls | ❌ None |
| AI Review UI | ❌ None |
| Accept/reject/apply engine | ❌ None |
| Writes to records | ❌ None |
| `ERP_AI_FORM_FILL` enabled | ❌ Still `false` in live DB |
| MCP server | ❌ None |
| Public AI API | ❌ None |
| `src/features/ai/` | ❌ Does not exist |

Negative codebase search for all Phase 1B+ identifiers: **0 matches** in `src/`.

---

## 2. Types Audit

**Result: PASS ✅**

File: `src/lib/ai/common/types.ts` — 285 lines

| Type | Present | Union values correct |
|---|---|---|
| `ErpAiEntityType` | ✅ | `"company" \| "party" \| "branch" \| "site"` ✅ |
| `ErpAiFieldType` | ✅ | `"text" \| "date" \| "number" \| "boolean" \| "fk" \| "json"` ✅ |
| `ErpAiSuggestionType` | ✅ | All 6 variants ✅ |
| `ErpAiSuggestionStatus` | ✅ | `pending \| accepted \| rejected \| superseded \| applied \| failed` ✅ |
| `ErpAiSafetyClassification` | ✅ | `business_safe \| requires_review \| restricted` ✅ |
| `ErpAiDocumentEvidenceHint` | ✅ | — |
| `ErpAiEligibleFieldRegistration` | ✅ | All required props present ✅ |
| `ErpAiEntityRegistry` | ✅ | All required props present ✅ |
| `ErpAiCurrentRecordSnapshot` | ✅ | — |
| `ErpAiDocumentEvidenceSnippet` | ✅ | — |
| `ErpAiFieldSuggestionDraft` | ✅ | — |
| `ErpAiSuggestionGenerationInput` | ✅ | — |
| `ErpAiSuggestionGenerationOutput` | ✅ | — |
| `ErpAiRegistryLookupResult` | ✅ | — |

`ErpAiEligibleFieldRegistration` fields audit:

| Property | Present |
|---|---|
| `entityType`, `targetTable`, `targetField`, `fieldLabel` | ✅ |
| `fieldType`, `documentTypeHints`, `isAiEligible: true` | ✅ |
| `safetyClassification`, `description?`, `validationHint?` | ✅ |
| `maxLength?`, `allowOverwrite?`, `allowClear?` | ✅ |
| `requiresExactDocumentEvidence?`, `allowForeignKeyUpdate?` | ✅ |
| `applyHandlerKey` (string reference, no DB write) | ✅ |

No real DB write handlers implemented. ✅

---

## 3. Constants Audit

**Result: PASS ✅**

| Constant | Expected | Actual |
|---|---|---|
| `ERP_COMMON_AI_PROMPT_VERSION` | `"common-ai-field-suggestions-v1.0"` | ✅ |
| `ERP_COMMON_AI_ALLOWED_ENTITY_TYPES` | `["company","party","branch","site"]` | ✅ |
| `ERP_COMMON_AI_STAGE_1_ENTITY_TYPES` | `["company","party"]` | ✅ |
| `ERP_COMMON_AI_STAGE_2_ENTITY_TYPES` | `["branch","site"]` | ✅ |
| `ERP_COMMON_AI_MAX_EVIDENCE_SNIPPET_CHARS` | `500` | ✅ |
| `ERP_COMMON_AI_MAX_REASON_CHARS` | `1000` | ✅ |
| `ERP_COMMON_AI_MAX_SUGGESTIONS_PER_RUN` | `50` | ✅ |

Additional constants beyond spec (acceptable): `MAX_EVIDENCE_SNIPPETS=10`, `MAX_EVIDENCE_CONTENT_CHARS=2000`, `MIN_PERSIST_CONFIDENCE=0.30`, `ERP_AI_FORM_FILL_FLAG`.

---

## 4. Non-Updatable Field Guard Audit

**Result: PASS WITH NOTES (F-01 fixed during audit)**

File: `src/lib/ai/common/non-updatable-fields.ts`

| Guard function | Present |
|---|---|
| `isGloballyNonUpdatableField(fieldName)` | ✅ |
| `assertAiFieldCanBeRegistered(...)` | ✅ |
| `filterNonUpdatableFields(fieldNames)` | ✅ |
| `findForbiddenFields(fieldNames)` | ✅ |

**Explicit deny list verified:**

| Field | Blocked |
|---|---|
| `id` | ✅ |
| `created_at`, `created_by`, `updated_at`, `updated_by`, `deleted_at`, `deleted_by` | ✅ |
| `party_code`, `site_code`, `branch_code`, `organization_code`, `company_code` | ✅ |
| `document_no`, `reference_no`, `reference_number`, `code`, `slug` | ✅ |

**Pattern deny list — F-01 (fixed):**

The original pattern `/^.+_number$/i` incorrectly blocked `license_number`, which is a legitimate Party field on the `party_licenses` table. Confirmed via runtime test: `license_number` matched the pattern. This would cause a runtime exception when `party-registry.ts` is first imported.

**Fix applied:** Removed `/^.+_number$/i` from `NON_UPDATABLE_PATTERNS`. The `reference_number` field it was intended to protect is already in the explicit set. Licensed business data fields like `license_number` are now correctly allowed.

**Safe field check — all registered fields pass:**

| Field | Blocked after fix |
|---|---|
| `license_number` | ✅ allowed |
| `trade_name`, `main_activity`, `established_date` | ✅ allowed |
| `primary_email`, `primary_phone`, `website` | ✅ allowed |
| `legal_name_en`, `legal_name_ar` | ✅ allowed |
| `address_line_1`, `address_line_2` | ✅ allowed |
| `trn`, `display_name` | ✅ allowed |
| `party_code`, `document_no` | ✅ blocked (correct) |

Registry calls `assertAiFieldCanBeRegistered()` at module load for all 4 registries. ✅

---

## 5. Registry Audit

**Result: PASS ✅**

File: `src/lib/ai/common/registry/index.ts`

| Export | Present |
|---|---|
| `COMMON_AI_ENTITY_REGISTRIES` | ✅ |
| `getCommonAiEntityRegistry(entityType)` | ✅ |
| `getCommonAiEligibleFields(entityType)` | ✅ |
| `lookupCommonAiRegistry(entityType)` | ✅ (additional — useful for server actions) |
| `isCommonAiEntityType(value)` | ✅ |
| `validateCommonAiRegistry()` | ✅ |

Validation rules confirmed:
- Allowed entity types only ✅
- All fields isAiEligible=true ✅
- FK fields exempt from global non-updatable check if `allowForeignKeyUpdate: true` ✅
- Duplicate `targetTable.targetField` key rejected ✅
- Stage 2 stubs clearly marked ✅
- No DB queries ✅
- No OpenAI calls ✅
- `validateCommonAiRegistry()` called at module import ✅

---

## 6. Stage 1 Registry Checks

### Company Registry

**Result: PASS ✅**

| Field | Expected | Actual |
|---|---|---|
| `entityType` | `"company"` | ✅ |
| `entityLabel` | `"Organization"` | ✅ |
| `targetTable` | `"owner_companies"` | ✅ |
| `idField` | `"id"` | ✅ |
| `displayField` | `"trade_name"` | ✅ |
| `viewPermission` | `"organizations.view"` | ✅ |
| `managePermission` | `"organizations.manage"` | ✅ |
| `stage` | `"stage_1"` | ✅ |

Registered fields (7): `trade_name`, `main_activity`, `established_date`, `office_address_line_1`, `office_address_line_2`, `office_emirate_id` (fk/requires_review), `office_city_id` (fk/requires_review).

FK fields (`office_emirate_id`, `office_city_id`): `fieldType=fk`, `safetyClassification=requires_review`, `allowForeignKeyUpdate=true` ✅

Correctly excluded: `id`, `organization_code`, `company_code`, `document_no`, `created_at`, `updated_at`, `deleted_at`, `compliance_status` ✅

### Party Registry

**Result: PASS ✅**

| Field | Expected | Actual |
|---|---|---|
| `entityType` | `"party"` | ✅ |
| `entityLabel` | `"Party"` | ✅ |
| `targetTable` | `"parties"` | ✅ |
| `idField` | `"id"` | ✅ |
| `displayField` | `"display_name"` | ✅ |
| `viewPermission` | `"master_data.party_master.view"` | ✅ |
| `managePermission` | `"master_data.party_master.manage"` | ✅ |
| `stage` | `"stage_1"` | ✅ |

Registered fields (9): `display_name`, `legal_name_en`, `legal_name_ar`, `primary_email` (requires_review), `primary_phone` (requires_review), `website` on `parties`; `party_tax_registrations.trn` (requires_review), `party_licenses.license_number` (requires_review), `party_licenses.expiry_date` (requires_review).

Child table fields: correctly marked `safetyClassification=requires_review`, all have `applyHandlerKey`, no actual DB write handlers. ✅

Correctly excluded: `id`, `party_code`, `created_at`, `updated_at`, `deleted_at`. ✅

---

## 7. Stage 2 Stub Registry Checks

### Branch Registry

**Result: PASS ✅**

| Field | Expected | Actual |
|---|---|---|
| `entityType` | `"branch"` | ✅ |
| `stage` | `"stage_2_stub"` | ✅ |
| `viewPermission` | `"branches.view"` | ✅ |
| `managePermission` | `"branches.manage"` | ✅ |

Fields: `legal_branch_name`, `trade_license_branch_ref`, `opening_date` ✅

Clearly marked as not active for generation ("STUB ONLY" in header comment). ✅  
`lookupCommonAiRegistry("branch").isActiveStage` = `false`. ✅

### Site Registry

**Result: PASS ✅**

| Field | Expected | Actual |
|---|---|---|
| `entityType` | `"site"` | ✅ |
| `stage` | `"stage_2_stub"` | ✅ |
| `viewPermission` | `"common_md.work_sites.view"` | ✅ |
| `managePermission` | `"common_md.work_sites.manage"` | ✅ |

Fields: `site_name`, `address_line_1`, `address_line_2`, `access_restrictions` ✅

`site_code` is NOT registered. ✅  
Clearly marked as stub. ✅

---

## 8. Output Schema Audit

**Result: PASS ✅**

File: `src/lib/ai/common/field-suggestions/output-schema.ts`

All required schema fields present with correct constraints:

| Field | Present | Cap |
|---|---|---|
| `entityType` (enum validated) | ✅ | — |
| `entityId` (int, positive) | ✅ | — |
| `promptVersion` | ✅ | max 100 |
| `suggestions[]` | ✅ | max 50 |
| `targetField` | ✅ | max 100 |
| `fieldLabel` | ✅ | max 255 |
| `fieldType` (enum) | ✅ | — |
| `currentValue` (nullable) | ✅ | max 2000 |
| `suggestedValue` (nullable) | ✅ | max 2000 |
| `suggestedValueJson` (optional) | ✅ | — |
| `suggestionType` (enum) | ✅ | — |
| `confidenceScore` (0–1) | ✅ | `min(0).max(1)` |
| `sourceDocumentId` (optional) | ✅ | — |
| `sourceFileId` (optional) | ✅ | — |
| `sourceDocumentType` (optional) | ✅ | max 100 |
| `sourceExcerpt` (optional) | ✅ | **max 500** ✅ |
| `aiReason` (optional) | ✅ | **max 1000** ✅ |

Exports verified: `ErpAiFieldSuggestionOutputSchema`, `ErpAiSuggestionGenerationOutputSchema`, `ErpAiSuggestionGenerationOutputFromSchema` ✅

---

## 9. Output Validator Audit

**Result: PASS ✅**

File: `src/lib/ai/common/field-suggestions/output-validator.ts`

| Function | Present |
|---|---|
| `validateErpAiSuggestionOutput(raw, registry)` | ✅ |
| `sanitizeAiSuggestionDraft(raw)` | ✅ |
| `filterSuggestionsToRegisteredFields(suggestions, registry)` | ✅ |

Behavior verified:

| Rule | Implemented |
|---|---|
| Strips markdown code fences | ✅ `stripCodeFences()` |
| Parses JSON safely (try/catch) | ✅ |
| Validates with Zod `safeParse` | ✅ |
| Filters to registered AI-eligible fields only | ✅ |
| Rejects unknown/unregistered target fields | ✅ |
| Rejects globally non-updatable fields | ✅ `isGloballyNonUpdatableField()` |
| Truncates `sourceExcerpt` to 500 chars | ✅ |
| Truncates `aiReason` to 1000 chars | ✅ |
| Does not throw raw AI response in errors | ✅ — only issue count/path shown |
| Does not call DB | ✅ |
| Does not call OpenAI | ✅ |

---

## 10. Prompt Builder Audit

**Result: PASS ✅**

File: `src/lib/ai/common/field-suggestions/prompt-builder.ts`

| Export | Present |
|---|---|
| `buildErpAiFieldSuggestionSystemPrompt()` | ✅ |
| `buildErpAiFieldSuggestionUserPrompt(input)` | ✅ |
| `buildErpAiFieldSuggestionPrompt(input)` | ✅ |

Prompt contract rules verified in system prompt:

| Rule | Implemented |
|---|---|
| Output strict JSON only | ✅ Rule 1 |
| Use only linked document evidence | ✅ Rule 2 |
| Never invent values | ✅ Rule 2 |
| Mark uncertain as `needs_human_review` | ✅ Rule 2 |
| Suggest only registered fields | ✅ Rule 3 |
| Never suggest IDs, codes, numbering, audit fields | ✅ Rule 3 |
| Include sourceDocumentId when available | ✅ Rule 5 |
| Keep sourceExcerpt short (max 500 chars) | ✅ Rule 5 |
| Confidence score rules (4 tiers) | ✅ Rule 4 |
| UAE context | ✅ Rule 7 |
| Suggestion type definitions | ✅ Rule 6 |

Does not read DB: ✅  
Does not call OpenAI: ✅  
Does not log prompt content: ✅ (no console.log, no logAudit in this file)  
Uses sanitized input only: ✅

---

## 11. Barrel Export Audit

**Result: PASS ✅**

File: `src/lib/ai/common/index.ts`

Exports: all 14 types, all constants, 4 guard functions, 6 registry functions. ✅

Future phase import paths work:
- `@/lib/ai/common` — barrel ✅
- `@/lib/ai/common/registry` — registry index ✅
- `@/lib/ai/common/field-suggestions/output-schema` — schema ✅
- `@/lib/ai/common/field-suggestions/output-validator` — validator ✅
- `@/lib/ai/common/field-suggestions/prompt-builder` — builder ✅

No circular imports — types.ts and constants.ts are pure leaf modules with no cross-dependencies. ✅

---

## 12. Negative Audit

**Result: PASS ✅**

Codebase search against all Phase 1B+ identifiers in `src/`: **0 matches**

```
erp_ai_field_suggestions      — 0 matches
erp_ai_field_suggestion_events — 0 matches
erp_ai_record_ai_status       — 0 matches
generateAiFieldSuggestions     — 0 matches
acceptAiFieldSuggestion        — 0 matches
rejectAiFieldSuggestion        — 0 matches
applyAiFieldSuggestion         — 0 matches
loadLinkedDocumentEvidence      — 0 matches
evidence-loader.ts             — does not exist
AiFieldSuggestionsPanel        — 0 matches
src/server/actions/ai/         — does not exist
src/features/ai/               — does not exist
```

---

## 13. Feature Flag Audit

**Result: PASS ✅**

Live DB (via `user-supabase`): `ERP_AI_FORM_FILL` — `is_enabled = false` ✅

Not enabled during Phase 1A. ✅

---

## 14. TypeScript / Build Audit

**Result: PASS ✅**

| Check | Result |
|---|---|
| `npm run typecheck` (post-fix) | **PASS** (0 errors) |
| `npm run build` (at implementation) | **PASS** |

---

## 15. Security / Scope Result

| Check | Result |
|---|---|
| No DB mutations | ✅ |
| No OpenAI calls | ✅ |
| No server actions created | ✅ |
| No client-side DB access | ✅ |
| No UUID PKs | ✅ |
| No ERP feature flag enabled | ✅ |
| All Phase 1B+ artifacts absent | ✅ |

---

## Findings

| # | Finding | Severity | Action |
|---|---|---|---|
| **F-01** | `/^.+_number$/i` pattern in `NON_UPDATABLE_PATTERNS` incorrectly blocked `license_number` on `party_licenses`, causing a runtime throw when the party registry module loads | **Bug — Fixed** | Pattern removed from `NON_UPDATABLE_PATTERNS`; `reference_number` remains protected by explicit set |
| F-02 | `entityType` cast via `as import("../types").ErpAiEntityType` in `output-validator.ts` line 143 — a minor workaround for Zod v4 enum type resolution | Info | Acceptable — Zod 4 enum schema resolves to `string` union; cast is safe and constrained by prior `isCommonAiEntityType` check |
| F-03 | `lookupCommonAiRegistry` is exported from barrel but not in the audit spec — it is an additional useful utility | Info | Acceptable addition for Phase 1D server actions |

---

## Issues Found

**F-01** (Fixed): `license_number` pattern blocking — described above. Fixed by removing `/^.+_number$/i` from `NON_UPDATABLE_PATTERNS`. All other registered fields verified safe.

No other blocking issues found.

---

## Required Fixes

All fixed during this audit. Phase 1A is clean.

---

## Final Audit Decision

**PASS WITH NOTES ✅**

Phase 1A is complete and correctly implemented. One latent runtime bug (F-01) was found and fixed during the audit. The fix is minimal, within audit scope, and does not implement any Phase 1B artifacts. All 18 acceptance criteria from the implementation prompt are met.

---

## Recommended Next Phase

**ERP COMMON AI.1B — DB Tables, RLS, Permissions, Server Action Skeleton**

Create `erp_ai_field_suggestions` and `erp_ai_field_suggestion_events` tables with BIGINT PKs, RLS ENABLED+FORCED, and a server action skeleton with auth/permission/feature-flag gates.

---

**End of Audit Report**
