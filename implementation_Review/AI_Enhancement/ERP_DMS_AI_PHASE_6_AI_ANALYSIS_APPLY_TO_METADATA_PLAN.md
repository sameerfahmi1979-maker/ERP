# ERP DMS AI Phase 6 — AI Analysis Apply-to-Metadata Plan

**Date:** 2026-06-22  
**Phase:** ERP DMS AI Phase 6 — AI Analysis Apply-to-Metadata  
**Status:** Planning only — no code, migration, or schema changes made  
**Preceded by:** Phase 5 — Single and Batch Upload Orchestration Unification  

---

## 1. Executive Summary

Phase 6 adds a human-controlled "Apply to Metadata" workflow inside the AI Analysis tab of an approved DMS document. After running AI Analysis, users see a side-by-side diff of current approved metadata values versus AI-suggested values. They select specific fields to apply, confirm (especially for replacements and low-confidence values), and the server writes only the selected fields to `dms_document_metadata_values`. Every field change is fully audited with before/after values.

Key constraints inherited from all prior phases:
- Human approval is the **only** authorization point. No auto-apply.
- AI suggestions are **never** written without explicit user confirmation.
- The Phase 4 approval saga and all intake flows remain untouched.
- No new database tables are required (recommendation: Option C — no migration).

---

## 2. Planning Scope and Non-Implementation Rule

**This document is planning only.** No source code, migrations, UI files, or server actions will be created or modified during this planning phase.

**What Phase 6 will implement:**
- A new server action `applyAiAnalysisToMetadata()` in `src/server/actions/dms/ai-analysis.ts`
- A new pure utility module `src/lib/dms/metadata/metadata-diff.ts`
- UI additions inside `src/features/dms/documents/sections/dms-document-ai-section.tsx`
- Enhanced audit logging for per-field before/after values

**What Phase 6 will NOT implement:** See Section 27.

---

## 3. Files and Source-of-Truth Reviewed

| File | Status |
|------|--------|
| `ERP_DMS_AI_CURRENT_SOURCE_OF_TRUTH.md` | Read — post Phase 5 |
| `implementation_Review/ERP_DMS_AI_PHASE_5_SINGLE_BATCH_ORCHESTRATION_UNIFICATION_IMPLEMENTATION_REPORT.md` | Read |
| `implementation_Review/ERP_DMS_AI_PHASE_4_TRANSACTIONAL_APPROVE_SAVE_IMPLEMENTATION_REPORT.md` | Read |
| `src/server/actions/dms/ai-analysis.ts` | Read — full |
| `src/server/actions/dms/document-metadata-values.ts` | Read — full |
| `src/lib/dms/metadata/metadata-definition-shared.ts` | Read — full |
| `src/features/dms/documents/sections/dms-document-ai-section.tsx` | Read — full |
| `src/features/dms/documents/sections/dms-document-metadata-section.tsx` | Read — full |
| `src/features/dms/documents/dms-document-record-form.tsx` | Read — full |
| `src/lib/dms/ai/types.ts` | Read — top section |

Missing files (not found, not invented):
- `ERP_DMS_AI_A_TO_Z_AUDIT_FUNCTION_MAP_AND_ENHANCEMENT_PLAN.md`
- `ERP_DMS_AI_FULL_AUDIT_AND_ENHANCEMENT_PLAN.md`
- `erp-dms-ai-first-upload-standard.mdc`
- `erp-ai-human-review-first-standard.mdc`
- `erp-dms-standard.mdc`

---

## 4. Phase 1–5 Output Reviewed

| Phase | Key Outputs Relevant to Phase 6 |
|-------|----------------------------------|
| Phase 1 | Stable AI intake; `dms_ai_extraction_results` populated; `extracted_fields_json` and `field_confidence_json` confirmed present |
| Phase 2 | `dms_metadata_definitions` has `ai_confidence_threshold`, `review_required_if_low_confidence`, `is_ai_extractable`, `options_json`, `validation_json`, `field_type`; `loadMetadataFieldsForDocumentType(context)` exists with `"analysis"` context |
| Phase 3 | Classification confidence, alternatives, classification evidence stored in results |
| Phase 4 | `dms_document_metadata_values` upsert exists via `saveDmsDocumentMetadataValues()`; unique constraint `(document_id, definition_id)` confirmed |
| Phase 5 | Orchestration post-approval; does not affect metadata writing path |

---

## 5. Current AI Analysis Architecture

### Trigger
`runDmsAiAnalysisForDocument({ documentId, jobType, forceRun })` in `src/server/actions/dms/ai-analysis.ts`.

One call does everything: downloads all document files, extracts text and images, calls the configured AI provider, stores job + result.

### Stored Result Shape (`dms_ai_extraction_results`)

| Column | Type | Content |
|--------|------|---------|
| `id` | BIGINT PK | Result ID |
| `job_id` | FK | Parent job |
| `document_id` | FK (SET NULL on doc delete) | The document analyzed |
| `ai_status` | TEXT | `pending_review` / `accepted` / `rejected` / `superseded` |
| `extracted_fields_json` | JSONB | `{ fieldCode: "value_string", ... }` — flat record |
| `field_confidence_json` | JSONB | `{ fieldCode: { score: 0.92, label: "high", source_snippet: "..." } }` |
| `suggested_document_type_id` | FK | AI's type suggestion |
| `classification_confidence` | TEXT | `high` / `medium` / `low` / `needs_manual_review` |
| `classification_score` | FLOAT | 0.0–1.0 |
| `expiry_date_suggestion` | TEXT | Suggested expiry date string |
| `suggested_title` | TEXT | |
| `suggested_description` | TEXT | |
| `suggested_links_json` | JSONB | Array of link suggestions |
| `raw_response_json` | JSONB | Sanitized AI response metadata (no content) |

**Key observation:** `extracted_fields_json` stores all field values as **strings** (even numbers, dates, booleans). The TypeScript type `DmsExtractedField.value` is typed as `string`. Conversion to the target `field_type` must happen during the apply step.

### Permissions
- `canViewAi`: `dms.documents.ai.view | dms.documents.view | dms.documents.review_ai | dms.admin`
- `canRunAi`: `dms.documents.ai.run | dms.documents.review_ai | dms.admin`
- Write metadata: `dms.documents.edit | dms.admin` (confirmed in `saveDmsDocumentMetadataValues`)

### What is currently NOT present
- No "Apply to Metadata" button or action anywhere in the codebase
- `ai_status` is set to `pending_review` and never changed to `accepted` by any existing UI action
- The info text in the AI tab explicitly says: *"Accept and apply suggestions in the DMS.11 AI Review Queue (coming next)"* — Phase 6 is that feature

---

## 6. Current Approved Metadata Storage Audit

### Table: `dms_document_metadata_values`

- One row per `(document_id, definition_id)` combination (UNIQUE constraint enforced)
- Typed value columns: `value_text TEXT`, `value_number NUMERIC`, `value_date DATE`, `value_datetime TIMESTAMPTZ`, `value_boolean BOOLEAN`, `value_json JSONB`
- Additional columns: `updated_by`, `updated_at`, `deleted_at` (soft delete capable)

### Server action: `saveDmsDocumentMetadataValues(documentId, values)`

- Requires `dms.documents.edit | dms.admin`
- Does a **bulk upsert** on `(document_id, definition_id)` conflict target
- Writes ALL definitions in one call (even unchanged ones)
- Audit log: only records a count (`"count": N`) — **no per-field before/after values**
- Emits one `dms_document_events` row with `event_type = "metadata_updated"`
- **Gap identified:** The existing `saveDmsDocumentMetadataValues` is not suitable for Phase 6 because it overwrites all fields at once and doesn't log individual field changes. Phase 6 needs a new action that applies only selected fields and records granular before/after audit.

### Metadata Definition: `DmsMetadataDefinitionBase`

Relevant fields for Phase 6 apply logic:

| Field | Use in Phase 6 |
|-------|---------------|
| `field_type` | Determines which typed value column to write and how to convert AI string value |
| `field_code` | Used to match against `extracted_fields_json` keys |
| `is_active` | Must be `true` to apply |
| `is_ai_extractable` | Should be `true` for AI-suggested fields |
| `options_json` | For `select`/`multiselect` fields — must validate AI value is in allowed options |
| `validation_json` | Pattern/min/max rules — server must validate before write |
| `ai_confidence_threshold` | Per-field threshold — if AI score < threshold, flag for warning |
| `review_required_if_low_confidence` | If true and confidence is low → require explicit confirmation |
| `is_unique` | If true → need to check no other document already has this value |
| `metadata_version` | For optimistic concurrency (see Section 20) |

---

## 7. Current Document Metadata UI Audit

### `DmsDocumentMetadataSection`

- Loads `dms_metadata_definitions` for the document's `document_type_id`
- Loads `dms_document_metadata_values` for the document
- Renders each field as a type-aware input (text, number, date, select, boolean, textarea, json)
- Has a single "Save Metadata" button that saves all fields via `saveDmsDocumentMetadataValues`
- Available in "edit" and "view" modes (`isViewing` prop disables inputs in view mode)
- Query keys: `queryKeys.dms.documentMetadata(documentId)` and `queryKeys.dms.documentMetadataDefs(documentTypeId)`

### What must remain unchanged

- The manual metadata editing flow must not be touched
- `saveDmsDocumentMetadataValues` must not be replaced for manual editing
- The "Save Metadata" button must keep working as-is

### What will be added (planned, not implemented now)

- The metadata tab will not change
- After a successful `applyAiAnalysisToMetadata` call, Phase 6 will invalidate `queryKeys.dms.documentMetadata(documentId)` to refresh the metadata tab's displayed values

---

## 8. Current AI Analysis UI Audit

### `DmsDocumentAiSection`

Current state:
- **Header**: AI status badge + "Run AI Analysis" / "Re-run AI Analysis" button (if `canRun`)
- **No results**: Placeholder with instructions
- **Latest result card (`AiResultCard`)**: Shows classification, suggested fields table, expiry, links, warnings
- **History**: Collapsed list of previous results
- **Info notice**: "Results are suggestions only. Accept them in DMS.11." — will be updated

### `AiResultCard` — Extracted Fields Display

Current: Read-only table showing `fieldCode | Suggested Value | Confidence | Source`.

Missing for Phase 6:
- No "Current Approved Value" column
- No checkboxes
- No "Apply Selected" button
- No diff state (same / new / changed / conflict)
- No confirmation dialog

### Why it is currently view-only

1. `ai_status` is always `pending_review` — nothing can change it to `accepted`
2. No `applyAiAnalysisToMetadata` server action exists
3. No client-side selection state
4. The feature was explicitly deferred to "DMS.11 AI Review Queue"

### Where Apply Selected should go

In `AiResultCard`, below the extracted fields table, when `canApplyMetadata` prop is true and result is `pending_review`:
- New `AiMetadataDiffTable` component showing diff rows
- "Apply Selected Fields" button (primary, disabled if no selection)
- Confirmation dialog using `AlertDialog` (existing pattern from workspace rules)

---

## 9. Problems and Gaps Confirmed

| # | Gap | Severity |
|---|-----|----------|
| G1 | No `applyAiAnalysisToMetadata` server action exists | Blocking |
| G2 | No diff/comparison logic exists | Blocking |
| G3 | `extracted_fields_json` values are all strings — need type conversion on apply | Blocking |
| G4 | `saveDmsDocumentMetadataValues` logs only count, not per-field before/after | Blocking |
| G5 | No per-field apply confirmation UI — existing info text says "DMS.11 coming next" | Blocking |
| G6 | `options_json` validation not done server-side on AI value apply | Risk |
| G7 | `ai_status` never changes from `pending_review` to `accepted` | UX gap |
| G8 | No field-level concurrency guard if metadata changed after UI loaded | Risk |
| G9 | `is_unique` check not implemented for AI apply path | Risk |
| G10 | No way to see current value alongside AI value in AI Analysis tab | UX gap |

---

## 10. Target Apply-to-Metadata Workflow

```
1. User opens document (approved or active status).
2. User opens AI Analysis tab.
3. User clicks "Run AI Analysis" or sees latest result.
4. User expands the latest result card.
5. System shows AiMetadataDiffTable:
   - For each field in extracted_fields_json:
     - Current approved value (from dms_document_metadata_values)
     - AI suggested value (from extracted_fields_json)
     - Confidence badge
     - Diff state: NEW / SAME / CHANGED / CONFLICT / LOW_CONFIDENCE / INVALID
     - Checkbox (unchecked by default for CHANGED/CONFLICT; optional for NEW)
6. User reviews the diff, checks fields to apply.
7. User clicks "Apply Selected Fields" (disabled if 0 checked).
8. System detects if any checked field:
   - Has CHANGED state → show replacement warning in confirmation dialog
   - Has LOW_CONFIDENCE state → show low-confidence warning in confirmation dialog
9. AlertDialog confirmation appears:
   - Lists what will be changed
   - Checkboxes: "I confirm replacement of existing values" (if any replacements)
   - "I confirm accepting low-confidence values" (if any low-confidence)
   - Primary: "Apply Selected" / Secondary: "Cancel"
10. Server action applyAiAnalysisToMetadata() called.
11. Server validates: permissions, document state, definitions, field types, options, uniqueness.
12. Server reads current metadata values (server-side re-read for freshness).
13. Server applies only selected valid fields (upsert per field).
14. Server writes per-field audit log rows with before/after.
15. Server marks ai_result ai_status = "accepted" (if any fields applied).
16. UI invalidates: documentAiStatus, documentAiResults, documentMetadata queries.
17. UI shows result summary: "X field(s) applied, Y skipped".
```

---

## 11. Apply Modes and Safety Model

### Options Compared

| Mode | Description | Verdict |
|------|-------------|---------|
| A — Fill Missing Only | Apply only where current value is empty | Too restrictive — misses AI corrections of wrong data |
| B — Replace Selected | Apply selected, always replace if confirmed | Covers all cases but needs clear UX differentiation |
| C — Side-by-Side Draft | Save as review draft, not approved metadata | Adds complexity, another status layer, deferred to future |
| **D — Hybrid (Recommended)** | Fill missing fields directly; replace existing only after explicit per-category confirmation | Balances safety and usability |

### Recommended: Mode D — Hybrid

**Default behaviour:**
- `NEW` fields (no current value) → pre-checked, no special warning
- `SAME` fields (AI agrees with current) → excluded from diff (not shown or shown greyed out)
- `CHANGED` fields (AI differs from current) → unchecked by default, requires "confirm replacement" checkbox in dialog
- `CONFLICT` fields (AI value fails validation) → excluded from apply (shown as blocked with tooltip)
- `LOW_CONFIDENCE` fields (score < threshold) → shown with warning badge; requires "confirm low-confidence" checkbox if selected
- `INVALID` fields (field_type conversion fails, options_json mismatch) → blocked from apply

**Apply modes exposed to server:**
- `fill_missing_only` — backend-enforced; only applies to rows where no current value exists
- `replace_selected` — backend-enforced; requires `confirmation.replaceExistingConfirmed = true`

---

## 12. Diff and Comparison Logic Plan

### New file: `src/lib/dms/metadata/metadata-diff.ts`

**Purpose:** Pure TypeScript utility — no Supabase, no server imports. Compares AI result with current metadata and returns a diff array.

**Types:**

```typescript
export type MetadataDiffState =
  | "new"          // no current value, AI has a value
  | "same"         // AI value matches current value (after normalization)
  | "changed"      // AI value differs from current value
  | "conflict"     // AI value fails validation (invalid option, bad type)
  | "low_confidence" // AI score < definition.ai_confidence_threshold
  | "no_ai_value"  // AI returned no value for this field
  | "not_extractable"; // definition.is_ai_extractable = false

export type MetadataDiffRow = {
  definitionId: number;
  fieldCode: string;
  fieldLabelEn: string;
  fieldType: string;
  fieldGroup: string | null;
  isRequired: boolean;
  currentValueRaw: string | null;      // serialized current value
  aiValueRaw: string | null;           // AI string from extracted_fields_json
  aiValueConverted: unknown | null;     // type-converted AI value
  confidenceScore: number | null;
  confidenceLabel: string | null;
  sourceSnippet: string | null;
  diffState: MetadataDiffState;
  validationError: string | null;      // why CONFLICT
  requiresConfirmation: boolean;       // CHANGED or LOW_CONFIDENCE
  canApply: boolean;                   // false for CONFLICT, INVALID, NO_AI_VALUE
};
```

**Logic:**

```
buildMetadataDiff(
  definitions: DmsMetadataDefinitionBase[],
  currentValues: DmsMetadataValueRow[],
  extractedFieldsJson: Record<string, unknown>,
  fieldConfidenceJson: Record<string, { score: number; label: string; source_snippet: string | null }> | null
): MetadataDiffRow[]
```

For each definition where `is_ai_extractable = true`:
1. Look up current value row from `currentValues` by `definition.id`
2. Look up AI value from `extractedFieldsJson[definition.field_code]`
3. If no AI value → `no_ai_value`
4. Try to convert AI string value to `field_type`
5. If conversion fails → `conflict` with `validationError`
6. If `field_type === "select"` → check value is in `options_json.values[]`; if not → `conflict`
7. Normalize current value and AI value for comparison (trim, lowercase dates, etc.)
8. If AI value = current value → `same`
9. If current value is empty → `new`
10. If AI value ≠ current value → `changed`
11. Apply confidence threshold: if confidence score < `definition.ai_confidence_threshold` → `low_confidence` (override `new` or `changed`)

**Value type conversion map:**

| `field_type` | `extracted_fields_json` raw | Target column | Conversion |
|---|---|---|---|
| `text`, `textarea`, `url`, `email`, `phone` | string | `value_text` | trim |
| `select` | string | `value_text` | validate against `options_json.values` |
| `multiselect` | comma-separated or JSON array string | `value_json` | parse array |
| `number`, `currency` | string (numeric) | `value_number` | `parseFloat`, reject NaN |
| `date` | string (ISO date) | `value_date` | parse as date, reject invalid |
| `datetime` | string (ISO timestamp) | `value_datetime` | parse as timestamp, reject invalid |
| `boolean` | `"true"` / `"false"` / `"yes"` / `"no"` | `value_boolean` | map to boolean, reject other |
| `json` | JSON string or object | `value_json` | `JSON.parse` if string, reject invalid |

---

## 13. Validation Plan

Server-side validation in `applyAiAnalysisToMetadata()` must run before any write:

### Pre-apply guards (block entire apply)

| Check | Action on Fail |
|-------|---------------|
| User is authenticated | Return 401 |
| User has `dms.documents.edit` OR `dms.admin` | Return 403 |
| Document exists and `deleted_at IS NULL` | Return "Document not found" |
| Document status is not `deleted` or `archived` | Return "Document is not editable" |
| AI result exists and belongs to this document | Return "AI result not found" |
| AI result `document_id = documentId` | Return "AI result mismatch" |
| AI result `ai_status != "superseded"` | Return "AI result is superseded" |
| Document `document_type_id` matches definitions' `document_type_id` | Return "Document type mismatch" |
| Confidentiality gate: confidential docs require `dms.admin` | Return 403 |
| At least 1 selection provided | Return "No fields selected" |

### Per-field validation (block individual field)

| Check | Action on Fail |
|-------|---------------|
| `definition_id` found in loaded definitions | Skip field with warning |
| Definition `is_active = true` | Skip field with warning |
| Definition `document_type_id` matches document's type | Skip field with warning |
| AI value is not null/empty | Skip field |
| `field_type` conversion succeeds | Skip field with "invalid value" warning |
| `options_json` validation passes for select/multiselect | Skip field with "invalid option" warning |
| `validation_json` pattern/min/max passes | Skip field with "validation failed" warning |
| `is_unique = true` → check no other non-deleted doc has same value | Skip with "unique constraint" warning |
| If `applyMode = "fill_missing_only"` → skip if current value exists | Skip silently |
| If `applyMode = "replace_selected"` AND current value exists → require `confirmation.replaceExistingConfirmed = true` | Return error if confirmation missing |
| Low confidence (score < threshold) AND `review_required_if_low_confidence = true` → require `confirmation.lowConfidenceConfirmed = true` | Return error if confirmation missing |

### Concurrency guard

Before the upsert write, re-read the current `updated_at` for each `dms_document_metadata_values` row. If the current DB value's `updated_at` is newer than the `expectedUpdatedAt` sent by the client (optional), return a conflict error requiring the user to refresh.

---

## 14. Database / Migration Options Compared

### Option A — No migration

**Approach:** Use existing tables only:
- `dms_ai_extraction_results` — source of AI suggestions
- `dms_document_metadata_values` — target of approved writes
- `audit_logs` — for granular before/after
- `dms_document_events` — for apply events

**Pros:** Fast to implement. No schema risk. Fully backward compatible.

**Cons:** Detailed per-apply-run reporting requires filtering `audit_logs` by `entity_name = "dms_document_metadata_values"`. No separate "apply run" concept.

### Option B — Add apply run tables

**Tables proposed:**
- `dms_ai_metadata_apply_runs(id, document_id, ai_result_id, applied_by, applied_at, applied_count, skipped_count, apply_mode, confirmation_flags)`
- `dms_ai_metadata_apply_items(id, run_id, definition_id, field_code, old_value_summary, new_value_summary, confidence, was_applied, skip_reason)`

**Pros:** Full traceability per apply run. Easy to build an "apply history" view later. Better for audit reporting.

**Cons:** 2 new tables, 2 new RLS policies, more schema maintenance. Schema is overkill for Phase 6 scope.

### Option C — Hybrid (store in `audit_logs`, plan tables for Phase 7+)

Use `audit_logs` with a rich `new_values` payload that includes `field_code`, `old_value_summary`, `new_value_summary`, `confidence`, `apply_mode`, `ai_result_id`. No new tables. Reserve the apply run tables for a later phase if reporting is needed.

---

## 15. Recommended Database Strategy

**Recommendation: Option C — No new tables in Phase 6.**

**Rationale:**
1. `audit_logs.new_values` (JSONB) already supports rich per-field detail
2. The existing `dms_document_events` table covers the apply event at the document level
3. Adding new tables increases RLS surface and migration complexity for what is primarily a UI/logic change
4. Phase 7 can add `dms_ai_metadata_apply_runs` if reporting demands it

**What the audit_logs payload will contain per-field:**

```json
{
  "event": "ai_metadata_field_applied",
  "document_id": 45,
  "ai_result_id": 12,
  "field_code": "issue_number",
  "definition_id": 8,
  "old_value_summary": null,
  "new_value_summary": "TRN-2026-00123",
  "confidence_score": 0.91,
  "confidence_label": "high",
  "apply_mode": "fill_missing_only"
}
```

No OCR text, prompts, or raw AI content is stored in audit.

---

## 16. Proposed Server Action Changes

### New action: `applyAiAnalysisToMetadata(input)`

**File:** `src/server/actions/dms/ai-analysis.ts` (append to existing file)

**Input type:**
```typescript
type ApplyAiMetadataInput = {
  documentId: number;
  aiResultId: number;
  selections: Array<{
    definitionId: number;
    fieldCode: string;
    applyMode: "fill_missing_only" | "replace_selected";
  }>;
  confirmation: {
    replaceExistingConfirmed: boolean;
    lowConfidenceConfirmed: boolean;
  };
};
```

**Output type:**
```typescript
type ApplyAiMetadataResult = {
  appliedCount: number;
  skippedCount: number;
  appliedFields: string[];   // field_codes that were applied
  skippedFields: Array<{ fieldCode: string; reason: string }>;
  aiResultStatus: string;    // new ai_status on the result
};
```

**Sequence:**
1. Validate input schema (zod)
2. Auth check + permission check (`dms.documents.edit | dms.admin`)
3. Load document (check deleted_at, confidentiality)
4. Confidentiality gate
5. Load AI result by `aiResultId` — verify `document_id = documentId`, not superseded
6. Load metadata definitions for `document.document_type_id` (context: "analysis")
7. Load current metadata values for document
8. Build `MetadataDiff` server-side (call `buildMetadataDiff()`)
9. For each selection:
   a. Find matching diff row by `definitionId`
   b. Run all per-field validations (see Section 13)
   c. Check concurrency (optional `expectedUpdatedAt`)
   d. If `canApply = false` → add to skipped list
   e. If `applyMode = "fill_missing_only"` and current value exists → skip
   f. If `changed/low_confidence` and confirmation missing → return error (do not partial-apply)
10. Begin sequential upserts (one per field):
    - Capture old value (from current metadata loaded in step 7)
    - Upsert the new value to `dms_document_metadata_values`
    - Log per-field audit event
11. After all fields:
    - Log one `dms_document_events` row: `ai_metadata_applied`, count summary
    - Log one `audit_logs` row: overall apply run summary
    - If `appliedCount > 0`: update `dms_ai_extraction_results.ai_status = "accepted"`, `reviewed_by`, `reviewed_at`
12. Revalidate: `/dms/documents/record/${documentId}`
13. Return `ApplyAiMetadataResult`

**Important:** The action must be idempotent-safe — if called twice for the same fields on the same result, the second call will still produce valid results (same values re-upserted, audit logged again).

### Modified action: `saveDmsDocumentMetadataValues` (no change)

This action is NOT modified. The apply action is separate and does selective upserts with per-field audit.

---

## 17. Proposed UI / UX Changes

### File: `src/features/dms/documents/sections/dms-document-ai-section.tsx`

**Minimal changes — no full redesign.**

#### New component: `AiMetadataDiffTable`

Rendered inside `AiResultCard` when:
- `result.ai_status === "pending_review"`
- `extracted_fields_json` has entries
- `canApplyMetadata` prop is true (new prop on `DmsDocumentAiSection`)

**Props:**
```typescript
{
  documentId: number;
  aiResultId: number;
  diffRows: MetadataDiffRow[];
  onApplied: () => void; // invalidates queries
}
```

**Layout:** Below the existing "Suggested Field Values" read-only table, a new section "Apply Suggestions to Metadata" appears.

**Table columns:**
| Column | Notes |
|--------|-------|
| ☐ Checkbox | Checked = selected for apply. Disabled if `canApply = false` |
| Field | `field_label_en` (+ `field_group` badge) |
| Current Value | Current approved value or "—" if empty |
| AI Suggestion | AI value string |
| Confidence | `DmsAiConfidenceBadge` |
| Status | `DiffStateBadge`: NEW / CHANGED / SAME / CONFLICT / LOW CONF |

**`DiffStateBadge` colours:**
- `new` → green "New"
- `same` → grey "Unchanged" (row greyed out, checkbox hidden)
- `changed` → amber "Replace"
- `conflict` → red "Invalid" (checkbox disabled)
- `low_confidence` → orange "Low Confidence"
- `no_ai_value` → grey "No Suggestion" (row greyed out)

**Row behaviour:**
- `same` / `no_ai_value` rows are shown as greyed, no checkbox
- `conflict` / `not_extractable` rows shown with disabled checkbox and tooltip
- `new` rows pre-checked by default
- `changed` / `low_confidence` rows unchecked by default

**Footer:**
- "Apply Selected Fields" button (primary variant, disabled if 0 rows checked)
- Count badge: "X selected"

#### Confirmation Dialog

Before calling the server action, show `AlertDialog` (existing `alert-dialog` component from shadcn):

**Title:** "Apply Selected Metadata"

**Body:**
```
You are about to apply {N} AI-suggested field value(s) to this document's metadata.

[If any CHANGED rows selected]
⚠ {M} field(s) will replace existing approved values.

[If any LOW_CONFIDENCE rows selected]  
⚠ {P} field(s) have low confidence scores.
```

**Checkboxes:**
- "I confirm replacement of {M} existing field value(s)" — shown only if replacements exist
- "I confirm applying {P} low-confidence value(s)" — shown only if low-confidence exist

**Buttons:**
- "Apply Selected" (enabled only when all required confirmations checked)
- "Cancel"

#### New prop on `DmsDocumentAiSection`

```typescript
canApplyMetadata?: boolean;
```

Wired from `dms-document-record-form.tsx`:
```tsx
canApplyMetadata={
  !isViewing &&
  (hasPermission("dms.documents.edit") || hasPermission("dms.admin") || ...)
}
```

#### Query invalidation after apply

After successful `applyAiAnalysisToMetadata()`:
1. `invalidateDmsAiAnalysis(queryClient, documentId)` — refreshes AI status and results
2. `queryClient.invalidateQueries(queryKeys.dms.documentMetadata(documentId))` — refreshes metadata tab

#### Info notice update

Current text:
> "Accept and apply suggestions in the DMS.11 AI Review Queue (coming next)"

Updated text (Phase 6):
> "AI results are suggestions only. Use 'Apply Selected Fields' below to write selected values to metadata with your confirmation."

---

## 18. Audit Logging Plan

### Events to log

| Event | When | Entity | payload keys |
|-------|------|--------|-------------|
| `ai_metadata_apply_started` | Before first field write | `dms_documents` | `document_id, ai_result_id, selected_count` |
| `ai_metadata_field_applied` | Per field applied | `dms_document_metadata_values` | `document_id, ai_result_id, field_code, definition_id, old_value_summary, new_value_summary, confidence_score, confidence_label, apply_mode` |
| `ai_metadata_field_skipped` | Per field skipped | `dms_document_metadata_values` | `document_id, ai_result_id, field_code, skip_reason` |
| `ai_metadata_apply_completed` | After all fields | `dms_documents` | `document_id, ai_result_id, applied_count, skipped_count, replace_confirmed, low_confidence_confirmed` |
| `ai_metadata_apply_failed` | On server error | `dms_documents` | `document_id, ai_result_id, safe_error_message` |

### Value summarization rules (for before/after)

Values stored in audit are **summaries**, not raw values:

| field_type | Summary format |
|---|---|
| `text`, `textarea` | Truncate to 100 chars |
| `date` | ISO date string |
| `datetime` | ISO datetime string |
| `number`, `currency` | Number as string |
| `boolean` | `"true"` / `"false"` |
| `select` | Option value as string |
| `multiselect` | First 3 values joined, `+N more` |
| `json` | `[json]` (not logged) |

### What must NOT be logged

- OCR text
- AI prompt text
- Raw AI response
- Full document content
- Full JSON values for `json` field_type (use `[json]` placeholder)

---

## 19. RLS / Security Impact Plan

### No new tables → no new RLS policies

Phase 6 uses only existing tables which already have RLS:
- `dms_document_metadata_values` — existing RLS (write guarded by `dms.documents.edit` in server action)
- `dms_ai_extraction_results` — existing RLS (update guarded by `canAdminAi`)
- `dms_document_events` — insert allowed for authenticated
- `audit_logs` — insert only

### Permission model for `applyAiAnalysisToMetadata`

Required permission: **`dms.documents.edit` OR `dms.documents.review_ai` OR `dms.admin` OR `system_admin`**

Rationale: Writing metadata requires the same permission as manual metadata edit (`dms.documents.edit`). Users with `review_ai` but not `edit` should also be able to apply AI metadata as part of their review workflow.

The server action uses `createClient()` (user context with RLS) — no service role needed since all operations are on tables with appropriate RLS for authenticated users.

### Confidentiality gate

Confidential documents (`hr`, `legal`, `executive`) require `dms.admin` to view AI results (already enforced in `getDmsAiAnalysisStatus`). Phase 6 inherits this: if user cannot view AI results on a confidential document, they cannot apply them.

### What is not affected

- RLS on `dms_documents` unchanged
- RLS on `dms_metadata_definitions` unchanged (read-only in UI)
- `purge_dms_document` RPC (Phase 6 has no impact on hard delete)

---

## 20. Conflict and Concurrency Plan

### Problem

Between when the UI loads the metadata diff and when the user clicks "Apply Selected", another user could have manually updated the same metadata fields.

### Approach

**Lightweight optimistic concurrency using `updated_at`:**

1. When building the diff on the client, record the `updated_at` timestamp of each current metadata value row.
2. Pass `expectedUpdatedAt: string | null` per selection to the server (optional field in selection).
3. On the server, before writing each field:
   - Re-read the current `dms_document_metadata_values` row for `(document_id, definition_id)`
   - If `expectedUpdatedAt` is provided and the current DB row's `updated_at` is **newer**, return a field-level conflict error
4. If conflict detected → return error requiring the user to refresh the diff

**Stale AI result handling:**

If the AI result used for the diff is older than 24 hours (configurable):
- Show a "Stale Analysis" warning badge in the diff table
- Do not block apply (user can still proceed with warning)

**Document type change after analysis:**

If `document.document_type_id` was changed after the AI result was generated (detectable by checking if the result's `suggested_document_type_id` differs from the current type):
- The definition lookup will be for the current type
- Fields that don't belong to the current type's definitions → skipped with warning

---

## 21. Backward Compatibility Plan

| Scenario | Behaviour |
|----------|-----------|
| Old AI results without `field_confidence_json` | `confidence_score = null`, `confidence_label = null`, `diffState` uses AI threshold default; LOW_CONFIDENCE not triggered |
| Old AI results with `extracted_fields_json` but no matching definition | Field shown as `no_ai_value` / excluded from apply |
| `show_in_detail = false` definitions | Still shown in diff if `is_ai_extractable = true` (Phase 6 uses "analysis" context which returns all active definitions) |
| Intake approval flow | Completely untouched — applies only to existing approved documents |
| `saveDmsDocumentMetadataValues` (manual edit) | Unchanged — Phase 6 adds a new action, does not modify this |
| Phase 4 saga | Unchanged |
| Phase 5 orchestration | Unchanged |
| `ai_status = "superseded"` results | Not eligible for apply — UI hides apply section on superseded results |

---

## 22. Future Phase Compatibility

Phase 6 must not implement these, but plan must be compatible:

| Feature | Compatibility plan |
|---------|-------------------|
| Review queue activation | `ai_status = "accepted"` set by Phase 6 is a prerequisite; review queue can filter by this status |
| Semantic chunks | No impact |
| Async job queue | `applyAiAnalysisToMetadata` runs synchronously; can be queued later if needed |
| ERP mapping (HR/Party) | Phase 6 writes only to `dms_document_metadata_values`; ERP mapping targets different tables — separate future phase |
| Document metadata history | `dms_document_metadata_value_history` table (future) can be populated by re-reading `audit_logs` retrospectively |
| HR compliance prefill | Not in Phase 6 scope |
| Bulk apply without review | Explicitly forbidden (see Section 27) |

---

## 23. Implementation Sequence for Future Phase 6 Execution

```
Step 0: Review this plan + source of truth
Step 1: Implement metadata-diff.ts (pure utility — no server imports)
Step 2: Implement applyAiAnalysisToMetadata() server action
Step 3: Add canApplyMetadata prop to DmsDocumentAiSection + DmsDocumentRecordForm wiring
Step 4: Implement AiMetadataDiffTable component with checkboxes and DiffStateBadge
Step 5: Implement confirmation AlertDialog with required-confirmation checkboxes
Step 6: Connect apply button to server action + handle result summary
Step 7: Query invalidation after apply (metadata + AI status)
Step 8: Update info notice text
Step 9: Typecheck (npx tsc --noEmit) — must pass clean
Step 10: Update source of truth + create implementation report
```

Each step must be completed before the next. Do not skip typecheck.

---

## 24. Acceptance Criteria for Future Implementation

| AC | Criterion |
|----|-----------|
| AC-01 | AI Analysis suggestions are shown side-by-side with current approved metadata in a diff table |
| AC-02 | User can select specific fields to apply via checkboxes |
| AC-03 | Missing metadata (NEW state) can be filled after user confirmation |
| AC-04 | Existing metadata (CHANGED state) can be replaced only after explicit "I confirm replacement" checkbox in dialog |
| AC-05 | Low-confidence suggestions require "I confirm low-confidence" checkbox if selected |
| AC-06 | Server validates selected fields against active metadata definitions for the document's current type |
| AC-07 | Server validates field type conversion and allowed `options_json` values |
| AC-08 | Server writes only selected approved fields to `dms_document_metadata_values` (not all fields) |
| AC-09 | No AI suggestion is applied automatically — user must click Apply Selected and confirm |
| AC-10 | `audit_logs` records per-field before/after value summaries for every applied field |
| AC-11 | Unauthorized users (`!edit && !review_ai && !admin`) cannot call `applyAiAnalysisToMetadata` |
| AC-12 | Confidential document gates are respected (confidential docs require `dms.admin`) |
| AC-13 | Existing intake approve flow (`runApproveAiIntakeSaga`) is unchanged |
| AC-14 | Existing `runDmsAiAnalysisForDocument` still works and can be re-run |
| AC-15 | `npx tsc --noEmit` exits 0 after implementation |

---

## 25. Full Test Plan

### TC-01 — Apply fill missing (happy path)
- **Purpose:** Verify a NEW field suggestion is applied successfully
- **Setup:** Document with type T, definition D1 with no current value; AI result with `extracted_fields_json.D1_code = "value1"`, confidence 0.90
- **Steps:** Open AI Analysis tab, expand result, see D1 as NEW (pre-checked), click Apply, confirm dialog, submit
- **Expected result:** `dms_document_metadata_values` has row `(doc, D1, value_text="value1")`; audit log has `ai_metadata_field_applied`; AI result `ai_status = "accepted"`; metadata tab refreshes
- **DB state:** Upsert row present
- **UI state:** D1 row shows "Applied" or disappears from diff; metadata tab shows new value
- **Risk covered:** G1, G3, G4

---

### TC-02 — Replace existing value with confirmation
- **Purpose:** Verify CHANGED field requires and respects confirmation
- **Setup:** D2 already has `value_text = "old"`, AI suggests `"new"`, confidence 0.85
- **Steps:** Check D2, click Apply, dialog appears with "I confirm replacement" checkbox unchecked, try to apply without checking → disabled; check it → apply succeeds
- **Expected result:** Value updated to "new"; before value "old" in audit
- **Risk covered:** G6, G8

---

### TC-03 — Block apply without replacement confirmation
- **Purpose:** Verify CHANGED field cannot be applied without confirmation
- **Setup:** D3 has current value; AI suggests replacement; client sends `replaceExistingConfirmed = false`
- **Steps:** Call `applyAiAnalysisToMetadata` directly with `replaceExistingConfirmed = false`
- **Expected result:** Server returns error; no DB write; no audit
- **Risk covered:** AC-04

---

### TC-04 — Low confidence warning and confirmation
- **Purpose:** Verify low-confidence field requires extra confirmation
- **Setup:** D4 has `ai_confidence_threshold = 0.70`, `review_required_if_low_confidence = true`; AI suggests with score 0.55
- **Steps:** D4 shown as LOW_CONFIDENCE; user checks it; dialog shows "I confirm low-confidence" checkbox; user confirms; apply
- **Expected result:** Value applied; audit note shows `confidence_score: 0.55, confidence_label: "low"`
- **Risk covered:** G6, AC-05

---

### TC-05 — Invalid select option blocked
- **Purpose:** Verify AI value not in `options_json.values` is blocked
- **Setup:** D5 is `field_type = "select"`, `options_json.values = ["A","B","C"]`; AI suggests `"X"`
- **Steps:** D5 shown as CONFLICT with "Invalid option" tooltip; checkbox disabled
- **Expected result:** D5 cannot be selected for apply; server-side would also block it
- **Risk covered:** G6, AC-07

---

### TC-06 — Invalid date format blocked
- **Purpose:** Verify non-parseable date string from AI is blocked
- **Setup:** D6 is `field_type = "date"`; AI suggests `"not a date"`
- **Steps:** D6 shown as CONFLICT
- **Expected result:** D6 blocked from apply; validation error in diff row
- **Risk covered:** G3, AC-07

---

### TC-07 — Unknown field_code skipped
- **Purpose:** Verify AI value for field not in definitions is ignored
- **Setup:** AI result has `extracted_fields_json.UNKNOWN_FIELD = "x"` with no matching definition
- **Steps:** Open diff — UNKNOWN_FIELD not shown (or shown as not-extractable, non-applicable)
- **Expected result:** No row for UNKNOWN_FIELD in diff; server silently skips it
- **Risk covered:** G6

---

### TC-08 — AI result belongs to different document
- **Purpose:** Verify `applyAiAnalysisToMetadata` rejects mismatched result
- **Setup:** Call action with `documentId = 1`, `aiResultId` that belongs to document 2
- **Expected result:** Server returns error "AI result not found or mismatch"
- **Risk covered:** AC-12

---

### TC-09 — Inactive definition skipped
- **Purpose:** Verify definition with `is_active = false` is skipped
- **Setup:** D7 has `is_active = false`; AI result has value for D7
- **Expected result:** D7 not shown in diff; skipped by server
- **Risk covered:** AC-06

---

### TC-10 — Document type changed after analysis
- **Purpose:** Verify fields for old type are safely skipped
- **Setup:** AI result generated when doc type was T1; doc type changed to T2; T2 has different definitions
- **Expected result:** Only fields matching T2 definitions shown in diff; T1-specific fields skipped with warning
- **Risk covered:** Section 20

---

### TC-11 — Concurrency conflict
- **Purpose:** Verify stale UI load blocks overwrite
- **Setup:** UI loads diff with `expectedUpdatedAt = "2026-06-22T10:00:00Z"` for D8; another user updates D8 at `"2026-06-22T10:05:00Z"` before apply
- **Expected result:** Server returns conflict error for D8; user must refresh
- **Risk covered:** Section 20

---

### TC-12 — Unauthorized user blocked
- **Purpose:** Verify user without edit permission cannot apply
- **Setup:** User has `dms.documents.view` only
- **Expected result:** Server returns 403; "Apply" button not shown in UI (`canApplyMetadata = false`)
- **Risk covered:** AC-11

---

### TC-13 — Confidential document gate
- **Purpose:** Verify `hr`/`legal`/`executive` document requires `dms.admin`
- **Setup:** Document with `confidentiality_level = "hr"`; user has `dms.documents.edit` but not `dms.admin`
- **Expected result:** Server returns error; AI Analysis tab already blocked by existing `getDmsAiAnalysisStatus` check
- **Risk covered:** AC-12

---

### TC-14 — apply fill_missing_only respects mode
- **Purpose:** Verify fill_missing mode does not overwrite existing values
- **Setup:** D9 has current value "existing"; AI suggests "new"; user submits with `applyMode = "fill_missing_only"`
- **Expected result:** D9 skipped (not overwritten); no DB write for D9
- **Risk covered:** Section 11

---

### TC-15 — Audit log before/after
- **Purpose:** Verify audit records correct before/after values
- **Setup:** D10 has `value_text = "before"`; AI suggests `"after"`; user applies
- **Expected result:** `audit_logs.new_values.old_value_summary = "before"`, `new_value_summary = "after"`
- **Risk covered:** AC-10

---

### TC-16 — Metadata tab refresh after apply
- **Purpose:** Verify metadata tab shows updated values after apply
- **Steps:** Apply D1; switch to Metadata tab
- **Expected result:** Metadata tab shows "value1" for D1 (TanStack query invalidated)
- **Risk covered:** UX requirement

---

### TC-17 — Old AI result without field_confidence_json
- **Purpose:** Verify backward compatibility for older results
- **Setup:** AI result with `field_confidence_json = null`
- **Expected result:** Diff still builds; `confidenceScore = null`, LOW_CONFIDENCE state not triggered
- **Risk covered:** Section 21

---

### TC-18 — Typecheck
- **Purpose:** Ensure no TypeScript errors after implementation
- **Steps:** `npx tsc --noEmit`
- **Expected result:** Exit code 0

---

### TC-19 — Lint
- **Purpose:** Ensure no ESLint errors
- **Steps:** `npm run lint` (if configured)

---

### TC-20 — No auto-apply
- **Purpose:** Verify AI analysis alone does not write to metadata
- **Steps:** Run `runDmsAiAnalysisForDocument`; check `dms_document_metadata_values`
- **Expected result:** No new rows in `dms_document_metadata_values` from AI analysis alone
- **Risk covered:** AC-09

---

## 26. Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| AI string value conversion to typed field fails at runtime | Medium | Field blocked from apply | Robust `convertAiValueForFieldType()` helper with clear error message |
| `options_json` has non-standard format in older definitions | Low | Validation false negative | Defensive parsing with fallback to "no options" |
| User applies same result twice (idempotent) | Low | Duplicate audit entries | Acceptable — values same, audit shows two entries; plan: check if value unchanged before write |
| `is_unique` check race condition | Very Low | Duplicate unique values | Server upsert is atomic; unique constraint at DB level would catch it |
| `extracted_fields_json` key case mismatch (e.g., camelCase vs snake_case) | Low | Fields not matched | Normalize both keys to lowercase snake_case during diff build |
| Type mismatch between `DmsExtractedField.value` (string) and definitions expecting non-string | High | Apply blocked without clear message | Detailed error message in `MetadataDiffRow.validationError` shown in UI |
| Very large `extracted_fields_json` (100+ fields) | Very Low | Slow diff UI | Limit diff display to `is_ai_extractable = true` definitions only |

---

## 27. What Must Not Be Implemented in Phase 6

```
✗ Auto-apply AI suggestions (any automatic write to metadata without user action)
✗ Auto-overwrite approved metadata without confirmation dialog
✗ Apply to HR employee records
✗ Apply to party/vendor/customer records
✗ Apply to fleet/assets records
✗ ERP mapping UI or logic
✗ Semantic chunks
✗ Async job queue
✗ Review queue UI (dms_review_queue activation)
✗ Azure OCR wiring
✗ OCR history
✗ Page-level OCR
✗ Bulk approve without per-field selection
✗ Bulk apply without review and confirmation
✗ Major UI redesign (new pages, new tabs, new workspace sections)
✗ New external queue
✗ New AI provider
✗ New background worker
✗ Document metadata history table
✗ ERP field mapping apply logic
✗ HR compliance prefill
```

---

## 28. Recommended Next Cursor Implementation Prompt

```
ERP_DMS_AI_PHASE_6_AI_ANALYSIS_APPLY_TO_METADATA_IMPLEMENTATION_PROMPT.md
```

The implementation prompt should follow the 10-step sequence in Section 23 and include:
- Full scope reference to this plan
- References to `src/server/actions/dms/ai-analysis.ts` (add action here)
- Reference to `src/lib/dms/metadata/metadata-diff.ts` (new file)
- Reference to `src/features/dms/documents/sections/dms-document-ai-section.tsx` (UI additions)
- Reference to `src/features/dms/documents/dms-document-record-form.tsx` (canApplyMetadata prop)
- Strict prohibition on modifying `saveDmsDocumentMetadataValues` or the intake saga
- Requirement: `npx tsc --noEmit` must exit 0 before reporting completion

---

## 29. Final Recommendation

Phase 6 is well-scoped and buildable with **zero database schema changes**. The entire feature lives in:

1. **One new utility file** (`metadata-diff.ts`) — pure TypeScript, testable in isolation
2. **One new server action** (`applyAiAnalysisToMetadata`) — appended to the existing AI analysis action file
3. **UI additions** to the existing `AiResultCard` component — new diff table + apply button + confirmation dialog
4. **One new prop** on `DmsDocumentAiSection` (`canApplyMetadata`)

The risk profile is low because:
- No existing actions are modified
- No schema migrations are needed
- The Phase 4 approval saga is untouched
- The human-review-first contract is preserved at every layer (UI, action, audit)

The biggest implementation risk is the **string-to-typed-value conversion** for `extracted_fields_json` values. This must be implemented defensively, and any conversion failure must block the field from apply with a clear error message — never silently apply a corrupted value.

**Recommended confidence:** High. This plan is ready for implementation after ChatGPT review.
