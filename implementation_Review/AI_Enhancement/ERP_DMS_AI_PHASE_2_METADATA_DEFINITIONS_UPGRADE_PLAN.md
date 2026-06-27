# ERP DMS AI Phase 2 — Metadata Definitions Upgrade Plan

**Document type:** Planning only — no implementation in this phase  
**Date:** 2026-06-21  
**Author:** Cursor planning agent (codebase audit)  
**Prompt:** `ChatGPT/ERP_DMS_AI_PHASE_2_METADATA_DEFINITIONS_UPGRADE_PLANNING_PROMPT.md`  
**Prerequisite:** Phase 1 closed — `ERP_DMS_AI_CURRENT_SOURCE_OF_TRUTH.md`, `implementation_Review/ERP_DMS_AI_PHASE_1_STABILIZATION_IMPLEMENTATION_REPORT.md`

---

## 1. Executive Summary

Phase 2 will upgrade `dms_metadata_definitions` from a minimal field registry into a **structured source of truth** for AI extraction, intake review, validation hints, visibility, and future ERP mapping — without breaking existing intake, analysis, or stored metadata values.

**Critical pre-existing issue discovered during planning:** Live Supabase has **both** `field_label_ar` (foundation) and a duplicate `label_ar` column (Arabic FIX.1 migration). Admin CRUD uses `field_label_*` correctly; `document-metadata-values.ts` and intake UI types incorrectly reference `label_en` / `label_ar` columns that **do not exist** on the live table. Phase 2 implementation must **normalize Arabic label columns first**, then add new metadata columns via a safe idempotent migration.

**Recommended approach:** Hybrid structure — add high-value scalar/boolean columns to the parent table, keep `options_json` and `validation_json`, add one `ai_rules_json` JSONB bucket for extensibility, **defer child rule tables** to a later phase unless mapping complexity forces them.

**Estimated implementation scope (future execution):** 1 migration file, ~8–10 source files, admin UI dialog expansion, loader + prompt + type updates, prompt version bump to `v3.2`. No apply-to-metadata, no async queue, no auto-save behavior changes.

---

## 2. Planning Scope and Non-Implementation Rule

This document is **planning only**.

| Allowed in planning phase | Forbidden until approved implementation prompt |
|---------------------------|------------------------------------------------|
| Read/analyze codebase and DB | Source code changes |
| Query live Supabase schema (read-only) | Migrations |
| Compare options and recommend structure | UI changes |
| Define acceptance criteria and test plan | Server action changes |
| Produce implementation sequence | Prompt version bump in code |

Human-review-first rules remain unchanged: AI suggests; humans approve before final save.

---

## 3. Files and Source-of-Truth Reviewed

### Found and reviewed

| File | Relevance |
|------|-----------|
| `ERP_DMS_AI_CURRENT_SOURCE_OF_TRUTH.md` | Post–Phase 1 workflow baseline |
| `implementation_Review/ERP_DMS_AI_PHASE_1_STABILIZATION_IMPLEMENTATION_REPORT.md` | Phase 1 closure, DMS.14 parity gap |
| `ChatGPT/ERP_DMS_AI_PHASE_2_METADATA_DEFINITIONS_UPGRADE_PLANNING_PROMPT.md` | This phase scope |
| `ChatGPT/ALGT_ERP_CURSOR_PHASE_PROMPT_MASTER_STANDARD.md` | Master planning standard |
| `.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md` | Global ERP tracker (referenced) |
| `docs/standards/ERP_DMS_AI_FIRST_UPLOAD_TO_FILL_WORKFLOW_STANDARD.md` | Intake workflow |
| `supabase/migrations/20260614192000_erp_dms_2_database_foundation_rls_numbering_storage_buckets.sql` | Table creation + RLS |
| `supabase/migrations/20260617100000_erp_dms_arabic_language_enhancements.sql` | Duplicate `label_ar` column |
| `supabase/migrations/20260620170000_erp_dms_metadata_hr_compliance_seed.sql` | Seed patterns |
| `src/server/actions/dms/metadata-definitions.ts` | Admin CRUD |
| `src/server/actions/dms/document-metadata-values.ts` | Values + broken column aliases |
| `src/lib/dms/ai/load-metadata-fields.ts` | Shared AI loader |
| `src/lib/dms/ai/types.ts` | `DmsAiMetadataField` |
| `src/lib/dms/ai/prompt-builders.ts` | Prompt v3.1 |
| `src/server/actions/dms/ai-intake.ts` | Intake AI + approve |
| `src/server/actions/dms/ai-analysis.ts` | Document AI analysis |
| `src/features/dms/admin/dms-metadata-definitions-table.tsx` | Admin list + form |
| `src/features/dms/intake/dms-ai-intake-metadata-section.tsx` | Intake review fields |
| `src/features/dms/intake/dms-ai-intake-review-form.tsx` | Review orchestration |
| `src/features/dms/documents/sections/dms-document-ai-section.tsx` | AI Analysis tab |
| `src/features/dms/documents/sections/dms-document-metadata-section.tsx` | Document metadata tab |
| `src/server/actions/dms/standard-file-name.ts` | Uses `field_code` from definitions |
| `src/app/(protected)/admin/dms/metadata-definitions/page.tsx` | Admin route |

### Missing (not invented)

| File | Status |
|------|--------|
| `ERP_DMS_AI_A_TO_Z_AUDIT_FUNCTION_MAP_AND_ENHANCEMENT_PLAN.md` | Not in repo (referenced in prompts) |
| `ERP_DMS_AI_FULL_AUDIT_AND_ENHANCEMENT_PLAN.md` | Not in repo |
| `ALGT_ERP_CURSOR_PHASE_PROMPT_MASTER_STANDARD_V2.md` | Not in repo (V1 exists) |
| `ALGT_ERP_UI_UX_STANDARD.md` | Not at expected path (standards under `docs/standards/`) |
| `erp-ai-human-review-first-standard.mdc` | Not found as standalone `.mdc` |

---

## 4. Phase 1 Output Reviewed

Phase 1 delivered:
- Unified `loadMetadataFieldsForDocumentType()` in intake + analysis
- Intake review RLS backfill migration
- Fixed assistant EXPLAIN_DOCUMENT (no phantom table)
- `ERP_DMS_AI_CURRENT_SOURCE_OF_TRUTH.md`

Phase 1 noted **DMS.14 full migration parity gap** (expiry reminders, notification queue, renewal requests policies missing from repo). Phase 2 implementation should address this as **Step 0** (separate migration), not mixed into metadata column migration.

---

## 5. Current Metadata Architecture

```
/admin/dms/metadata-definitions
        │
        ▼
metadata-definitions.ts (CRUD, Zod, audit)
        │
        ▼
dms_metadata_definitions ──FK──► dms_document_types
        │
        ├──► load-metadata-fields.ts ──► ai-intake.ts, ai-analysis.ts ──► prompt-builders.ts ──► OpenAI
        │
        ├──► document-metadata-values.ts ──► intake review UI, document metadata tab
        │
        └──► dms_document_metadata_values (definition_id FK, typed value columns)
```

**Two parallel type models today:**
- Admin: `field_label_en`, `field_label_ar` (matches DB foundation columns)
- Document values layer: `label_en`, `label_ar` in TypeScript + SELECT ( **mismatch with live DB** )

**AI loader** uses only: `field_code`, `field_label_en`, `field_type`, `is_required`, `is_ai_extractable`, `ai_field_hint`, `options_json` — **not** `field_label_ar`, `validation_json`.

---

## 6. Current Database Schema Audit

### Table: `dms_metadata_definitions`

**Verified on live Supabase (2026-06-21):**

| Column | Type | Nullable | Default | Notes |
|--------|------|----------|---------|-------|
| `id` | BIGINT | NO | identity | PK |
| `document_type_id` | BIGINT | NO | — | FK → `dms_document_types(id)` ON DELETE CASCADE |
| `field_code` | TEXT | NO | — | Unique per type |
| `field_label_en` | TEXT | NO | — | Canonical English label |
| `field_label_ar` | TEXT | YES | — | Foundation Arabic label |
| `field_type` | TEXT | NO | — | text, date, select, refs, etc. |
| `is_required` | BOOLEAN | NO | false | |
| `is_ai_extractable` | BOOLEAN | NO | false | |
| `ai_field_hint` | TEXT | YES | — | Used in prompts |
| `options_json` | JSONB | YES | — | Select options |
| `validation_json` | JSONB | YES | — | `{min, max, pattern, ...}` — **not in admin UI or prompts** |
| `sort_order` | INT | NO | 0 | |
| `is_active` | BOOLEAN | NO | true | Soft-active flag |
| `created_by` | BIGINT | YES | — | FK → user_profiles |
| `created_at` | TIMESTAMPTZ | NO | now() | |
| `updated_by` | BIGINT | YES | — | |
| `updated_at` | TIMESTAMPTZ | NO | now() | |
| `deleted_at` | TIMESTAMPTZ | YES | — | Soft delete |
| `label_ar` | TEXT | YES | — | **Duplicate** — Arabic FIX.1; seeds `label_ar` only |

**Constraints / indexes:**
- PK: `id`
- UNIQUE: `(document_type_id, field_code)` — `dms_metadata_definitions_type_field_uq`
- INDEX: `idx_dms_metadata_definitions_type` on `document_type_id`

**RLS:** ENABLED + FORCED  
**Policies:**
- `dms_metadata_def_select` — authenticated + (`dms.documents.view` OR system_admin)
- `dms_metadata_def_manage` — `dms.documents.manage_types` OR system_admin

### Table: `dms_document_metadata_values`

| Column | Type | Notes |
|--------|------|-------|
| `id` | BIGINT PK | |
| `document_id` | BIGINT FK | CASCADE delete |
| `definition_id` | BIGINT FK | CASCADE delete — **values survive definition deactivate, not delete** |
| `value_text/number/date/datetime/boolean/json` | typed slots | One populated per field type |
| UNIQUE | `(document_id, definition_id)` | |

### Duplicate column problem

| Column | Source | Used by |
|--------|--------|---------|
| `field_label_ar` | DMS.2 foundation | Admin CRUD, seeds |
| `label_ar` | DMS ARABIC FIX.1 | Seeded independently; **not used by admin or loader** |

**Safest correction (Phase 2 Step 1):**
1. Backfill `field_label_ar = COALESCE(field_label_ar, label_ar)` where `field_label_ar` is null
2. Drop column `label_ar` after backfill (or deprecate with comment — prefer drop after backfill to avoid triple confusion)
3. Fix all TS/SQL to use `field_label_en` / `field_label_ar` only
4. Map UI types `label_en` → alias in application layer OR rename TS fields to match DB

---

## 7. Current RLS and Security Audit

Metadata definitions are **admin-managed master data**, not row-owner scoped.

| Operation | Policy | Permission |
|-----------|--------|------------|
| SELECT | `dms_metadata_def_select` | Any authenticated user with `dms.documents.view` |
| INSERT/UPDATE/DELETE | `dms_metadata_def_manage` | `dms.documents.manage_types` or system_admin |
| Hard delete | Server action gate | Requires `dms.admin` + no existing values |

**Phase 2 impact:** Adding columns does not require new RLS policies. New JSONB columns must not store secrets or raw document content. AI rules JSON contains hints only.

**Values table RLS:** Inherited from document access patterns; definition changes must not expose values cross-tenant (single-tenant ERP — document FK chain sufficient).

---

## 8. Current Metadata Admin UI Audit

**Route:** `/admin/dms/metadata-definitions`  
**Component:** `dms-metadata-definitions-table.tsx`  
**Dialog:** `ERPChildDialogForm` size `lg`

### List columns
Document type, field code, label (EN + AR display), field type, sort order, required badge, AI icon, status, edit/deactivate actions.

### Create/edit form fields (today)
| Field | Supported |
|-------|-----------|
| document_type_id | Yes (locked on edit) |
| field_code | Yes |
| field_label_en | Yes |
| field_label_ar | Yes |
| field_type | Yes (ALLOWED_FIELD_TYPES) |
| sort_order | Yes |
| options_json | Yes (select/multi_select only, raw JSON textarea) |
| ai_field_hint | Yes |
| is_required / is_ai_extractable / is_active | Switches |
| validation_json | **No** |

### UX gaps for Phase 2
- No validation_json editor
- No field grouping/sections
- No visibility toggles
- No AI alias/keyword/threshold fields
- No help text / placeholders
- Form will become crowded without **internal section tabs or accordion**
- List could show `field_group`, confidence threshold indicator

### Unchanged in Phase 2 (keep)
- ERPDataTable list pattern, filters, export
- ERPChildDialogForm (expand to `xl` if needed)
- Permission gates (`dms.documents.manage_types`)
- Soft deactivate vs hard delete rules

---

## 9. Current Metadata Loader Audit

**File:** `src/lib/dms/ai/load-metadata-fields.ts`

| Aspect | Current behavior |
|--------|------------------|
| Input | `supabase`, `documentTypeId: number` |
| Output | `DmsAiMetadataField[]` |
| SELECT columns | 7 fields (no Arabic label, no validation) |
| Filters | `document_type_id`, `is_active = true`, post-filter `is_ai_extractable !== false` |
| Order | `sort_order ASC` |
| NULL `is_ai_extractable` | Included (treated as extractable) |
| Error handling | None — returns `[]` if query fails silently via empty data |
| Callers | `ai-intake.ts`, `ai-analysis.ts` |

### Phase 2 extension plan
- Select new columns after migration
- Extend `DmsAiMetadataField` type (backward compatible — new fields optional)
- Optional: filter by `show_in_upload_review !== false` for intake-only loader variant (defer single loader with flag parameter)
- Include `field_label_ar`, `validation_json` summary, AI alias fields in prompt mapping
- Do **not** change filter semantics for `is_ai_extractable` without explicit migration note

---

## 10. Current AI Prompt Usage Audit

**File:** `src/lib/dms/ai/prompt-builders.ts`  
**Version:** `PROMPT_VERSION = "v3.1"`

### Metadata in prompt (`buildCombinedPrompt` fieldList)
```
- {fieldCode} ({fieldType}): {labelEn} [hint: {aiFieldHint}] [required]
```

### Not used today
| Capability | Status |
|------------|--------|
| `field_label_ar` | Not passed |
| `options_json` | Not passed |
| `validation_json` | Not passed |
| Per-field confidence threshold | Global score bands only (`confidenceLabelFromScore`) |
| Aliases / keywords / negative keywords | Not available |
| Examples / expected format | Not available |
| Normalization rules | Not available |

### Output compatibility
- `extracted_fields_json`: `{ [field_code]: string }`
- `field_confidence_json`: `{ [field_code]: { score, label, source_snippet } }`
- AI must not invent field_codes (prompt rule exists)

### Phase 2 prompt plan
- Enrich fieldList lines with Arabic label, aliases, keywords, format, examples (truncated)
- Include safe subset of `validation_json` (pattern, min, max, date rules) as hints
- Bump to **v3.2** only when implementation ships
- Keep JSON output schema unchanged for backward compatibility

---

## 11. Current AI Intake Review Usage Audit

**Files:** `dms-ai-intake-review-form.tsx`, `dms-ai-intake-metadata-section.tsx`, `ai-intake.ts`

| Behavior | How definitions are used |
|----------|-------------------------|
| Field list | `getMetadataDefinitionsForType(documentTypeId)` — **broken column names** |
| Display order | `sort_order` from definitions |
| Labels | `def.label_en` in UI (should be `field_label_en`) |
| Required indicator | `def.is_required` |
| AI values | `extracted_fields_json[field_code]` |
| Confidence | `field_confidence_json[field_code]` → badges via `DmsAiIntakeFieldRow` |
| Document type change | Reloads definitions for new type |
| Approve & save | Maps `definition_id` → typed value columns in `dms_document_metadata_values` |
| Standard file name | Uses extracted fields + metadata definitions by `field_code` |

### Phase 2 UI improvements (future)
- Group fields by `field_group` / `field_section`
- Hide fields where `show_in_upload_review = false`
- Show `help_text_*`, placeholders
- Flag fields failing `review_required_if_missing` or low confidence vs `ai_confidence_threshold`
- Show Arabic labels when locale/RTL context (optional Phase 2 stretch)

---

## 12. Current AI Analysis Usage Audit

**Files:** `ai-analysis.ts`, `dms-document-ai-section.tsx`

| Behavior | Definitions usage |
|----------|-------------------|
| Run analysis | `loadMetadataFieldsForDocumentType` for current document type |
| Display results | Reads `dms_ai_extraction_results` — field codes only |
| Apply to metadata | **Not implemented** (Phase 10) |
| Human review | Results shown as suggestions; user cannot auto-apply |

Phase 2 prepares definition richness so Phase 10 apply-to-metadata can:
- Match extracted values to definitions by `field_code`
- Respect `review_required_if_*` flags
- Use ERP mapping columns when added

---

## 13. Current Metadata Values Storage Audit

**Storage model:** One row per (document, definition) with typed columns.

| Concern | Current behavior | Phase 2 risk |
|---------|------------------|--------------|
| FK | `definition_id` → definitions.id | Deactivating definition keeps values |
| Delete definition | Blocked if values exist | Safe |
| Change field_code | Unique constraint per type; **breaks AI JSON keys** for historical results | Avoid field_code rename without migration tool |
| Change field_type | Values may become invalid in UI | Validation engine should warn, not auto-delete |
| New columns on definitions | No impact on value rows | Safe |

**Data preservation rule:** Phase 2 adds columns with defaults only — no destructive ALTER on values table.

---

## 14. Problems and Gaps Confirmed

| ID | Problem | Severity |
|----|---------|----------|
| GAP-1 | Duplicate `label_ar` vs `field_label_ar` | High — data drift |
| GAP-2 | `document-metadata-values.ts` selects non-existent `label_en`/`label_ar` | High — runtime query errors |
| GAP-3 | Arabic labels not in AI prompts | Medium |
| GAP-4 | `validation_json` exists but unused in UI and prompts | Medium |
| GAP-5 | No field grouping in admin or intake | Medium — UX |
| GAP-6 | No per-field confidence threshold | Medium |
| GAP-7 | No AI aliases/keywords for extraction | Medium |
| GAP-8 | No visibility flags for list/review/detail | Low–Medium |
| GAP-9 | No ERP mapping columns | Low (future phases) |
| GAP-10 | Admin form lacks validation_json editor | Medium |
| GAP-11 | Intake loader vs document loader inconsistency (different queries) | Medium — unify in Phase 2 |
| GAP-12 | DMS.14 repo migration parity | Security — unrelated but should precede implementation |

---

## 15. Metadata Upgrade Options Compared

### Option A — Wide parent table only
Add all proposed columns to `dms_metadata_definitions`.

| Pros | Cons |
|------|------|
| Simple queries, one JOIN | Wide table (~40+ columns eventually) |
| Easy RLS | Admin form complexity |
| Matches current pattern | Many nullable columns |

### Option B — Child rule tables
`dms_metadata_field_ai_rules`, `_validation_rules`, `_mapping_rules`

| Pros | Cons |
|------|------|
| Normalized | Extra RLS, joins, CRUD |
| Good for many rules per field | Overkill for Phase 2 |
| | Admin UI much heavier |

### Option C — JSONB rule columns only
`ai_rules_json`, `validation_rules_json`, `mapping_rules_json`

| Pros | Cons |
|------|------|
| Flexible schema | Harder to index/filter |
| Faster to ship | Validation of JSON shape in app |
| | Weaker admin UX without schema |

### Option D — Hybrid (recommended)
Scalar/boolean/high-query columns on parent + `ai_rules_json` for extensibility + keep existing `validation_json`/`options_json`.

| Pros | Cons |
|------|------|
| Balance of queryability and flexibility | Must document JSON schemas |
| Incremental admin UI sections | Some duplication between column and JSON |
| Aligns with Phase 1 loader pattern | |
| Defer child tables | |

**Recommendation:** **Option D (Hybrid)**

---

## 16. Recommended Phase 2 Metadata Structure

### Step 0 — Column normalization (mandatory first migration)
- Backfill and drop duplicate `label_ar`
- Fix application column names to `field_label_en` / `field_label_ar`

### Step 1 — New parent table columns

| Column | Type | Default | Phase 2 |
|--------|------|---------|---------|
| `field_group` | TEXT | NULL | **Yes** — e.g. "Identity", "Dates", "Financial" |
| `field_section` | TEXT | NULL | **Yes** — sub-section within group |
| `show_in_review` | BOOLEAN | true | **Yes** |
| `show_in_detail` | BOOLEAN | true | **Yes** |
| `show_in_list` | BOOLEAN | false | **Yes** |
| `show_in_upload_review` | BOOLEAN | true | **Yes** |
| `is_searchable` | BOOLEAN | false | **Yes** |
| `is_filterable` | BOOLEAN | false | **Yes** |
| `is_unique` | BOOLEAN | false | **Yes** — plan validation only |
| `placeholder_en` | TEXT | NULL | **Yes** |
| `placeholder_ar` | TEXT | NULL | **Yes** |
| `help_text_en` | TEXT | NULL | **Yes** |
| `help_text_ar` | TEXT | NULL | **Yes** |
| `ai_possible_labels_en` | JSONB | NULL | **Yes** — `string[]` |
| `ai_possible_labels_ar` | JSONB | NULL | **Yes** — `string[]` |
| `ai_keywords` | JSONB | NULL | **Yes** — `string[]` |
| `ai_negative_keywords` | JSONB | NULL | **Yes** — `string[]` |
| `ai_expected_format` | TEXT | NULL | **Yes** — e.g. "784-YYYY-NNNNNNN-N" |
| `ai_example_values` | JSONB | NULL | **Yes** — `string[]` |
| `ai_confidence_threshold` | NUMERIC(5,4) | NULL | **Yes** — per-field; NULL = use global bands |
| `normalization_rule` | TEXT | NULL | **Yes** — enum-like: `trim`, `uppercase`, `date_iso`, `phone_uae`, etc. |
| `review_required_if_missing` | BOOLEAN | false | **Yes** |
| `review_required_if_low_confidence` | BOOLEAN | false | **Yes** |
| `metadata_version` | INT | 1 | **Yes** — increment on admin breaking edits |
| `ai_rules_json` | JSONB | NULL | **Yes** — overflow / future keys |

### Deferred to Phase 10/13 (plan columns, optional stub migration)

| Column | Defer reason |
|--------|--------------|
| `target_erp_module` | Apply-to-metadata not in Phase 2 |
| `target_erp_entity` | Same |
| `target_erp_table` | Same |
| `target_erp_field` | Same |
| `target_relation_field` | Same |
| `mapping_priority` | Same |
| `allow_apply_to_existing` | Same |
| `requires_approval_before_save` | Same |

**Recommendation:** Add ERP mapping columns as **nullable TEXT stubs in a separate Phase 10 migration** when apply-to-metadata is implemented — avoids empty admin clutter in Phase 2.

### Child tables
**Defer** all child rule tables to Phase 13+ unless mapping requirements exceed JSONB capacity.

### Keep unchanged
`options_json`, `validation_json`, existing PK/FK, soft delete pattern, unique `(document_type_id, field_code)`.

---

## 17. Proposed Database Migration Plan

### Migration 0 (pre-requisite — separate file)
**Name:** `20260622xxxxxx_erp_dms_14_rls_parity_backfill.sql`  
Backfill DMS.14 policies for `dms_expiry_reminders`, `dms_notification_queue`, `dms_renewal_requests` (copy from live DB / DMS.14 report).  
**Run before** metadata migration on fresh installs.

### Migration 1 — Label normalization
**Name:** `20260622xxxxxx_erp_dms_ai_phase2_metadata_label_normalize.sql`

```sql
-- Backfill field_label_ar from label_ar where missing
UPDATE dms_metadata_definitions
SET field_label_ar = label_ar
WHERE field_label_ar IS NULL AND label_ar IS NOT NULL;

-- Drop duplicate column
ALTER TABLE dms_metadata_definitions DROP COLUMN IF EXISTS label_ar;
```

### Migration 2 — Metadata upgrade columns
**Name:** `20260622xxxxxx_erp_dms_ai_phase2_metadata_definitions_upgrade.sql`

- Add all Step 1 columns with `ADD COLUMN IF NOT EXISTS`
- All new booleans: `NOT NULL DEFAULT` appropriate value
- All new text/json: nullable
- `metadata_version`: `NOT NULL DEFAULT 1`
- Optional index: `(document_type_id, field_group, sort_order)` for grouped UI — justify if list queries slow
- **No DROP** of existing columns
- **No NOT NULL** without default on existing rows

### Backfill logic
- Existing rows get visibility defaults (show in review/detail/upload = true, list/search/filter = false)
- `metadata_version = 1` for all existing
- No change to `dms_document_metadata_values`

### Rollback
- Reverse migration can drop new columns (data loss for new fields only)
- Label normalization rollback would re-add `label_ar` — avoid after production use

### Generated types
Regenerate Supabase TypeScript types after migration (`generate_typescript_types` MCP or CLI).

---

## 18. Proposed Server Action and Type Changes

| File | Current role | Planned change | Risk |
|------|--------------|----------------|------|
| `metadata-definitions.ts` | CRUD + Zod | Extend schema with new fields; audit log new_values | Low |
| `document-metadata-values.ts` | Load/save values | **Fix** SELECT to `field_label_en/ar`; unify type with admin row | **High if skipped** |
| `load-metadata-fields.ts` | AI loader | Select + map new AI fields | Medium |
| `types.ts` | `DmsAiMetadataField` | Add optional properties | Low — backward compatible |
| `prompt-builders.ts` | Build prompts | Enrich fieldList; bump v3.2 | Medium — test extraction quality |
| `ai-intake.ts` | Intake pipeline | No logic change; benefits from loader | Low |
| `ai-analysis.ts` | Analysis pipeline | Same | Low |

### Zod validation (metadata-definitions.ts)
- `ai_possible_labels_*`, `ai_keywords`, etc.: `z.array(z.string()).nullable()` or JSON string parse in UI
- `ai_confidence_threshold`: `z.number().min(0).max(1).nullable()`
- `field_group`/`field_section`: max length 100

---

## 19. Proposed Metadata Loader Changes

1. Expand SELECT list with new columns (single query).
2. Map to extended `DmsAiMetadataField`:

```typescript
// Illustrative — implement in Phase 2 execution
export interface DmsAiMetadataField {
  fieldCode: string;
  labelEn: string;
  labelAr?: string | null;
  fieldType: string;
  isRequired: boolean;
  aiFieldHint: string | null;
  optionsJson: unknown | null;
  validationJson?: unknown | null;
  aiPossibleLabelsEn?: string[] | null;
  aiPossibleLabelsAr?: string[] | null;
  aiKeywords?: string[] | null;
  aiNegativeKeywords?: string[] | null;
  aiExpectedFormat?: string | null;
  aiExampleValues?: string[] | null;
  aiConfidenceThreshold?: number | null;
  normalizationRule?: string | null;
  fieldGroup?: string | null;
  fieldSection?: string | null;
}
```

3. Add optional parameter `context: 'intake' | 'analysis' | 'all'` to filter visibility flags (default `'all'` for backward compatibility, `'intake'` filters `show_in_upload_review`).

4. Shared helper used by **both** AI loader and document-metadata-values (eliminate GAP-11):

```text
src/lib/dms/metadata/load-metadata-definitions.ts  (new shared module — proposed)
```

---

## 20. Proposed AI Prompt Changes

When implementation occurs:

1. **fieldList enrichment** — each line includes:
   - English + Arabic labels
   - Aliases (EN/AR) if present
   - Keywords / negative keywords (truncated)
   - Expected format + 1–2 examples
   - Validation hints from `validation_json` (pattern, min, max)
   - Per-field confidence threshold note
   - `[required]` flag unchanged

2. **System prompt addendum** (minimal):
   - "Use ai_keywords and aliases to locate values; ignore ai_negative_keywords contexts."
   - "Normalize dates to YYYY-MM-DD per field expected_format."

3. **Do not change** output JSON schema.

4. **PROMPT_VERSION:** `v3.2` when shipped.

5. **Post-processing:** Optional normalization pass using `normalization_rule` on extracted values before storing in `extracted_fields_json` (server-side, not LLM) — Phase 2 implementation candidate.

---

## 21. Proposed Admin UI / UX Changes

**Component:** `dms-metadata-definitions-table.tsx` — expand dialog to `size="xl"`.

**Layout:** Vertical **accordion sections** inside `ERPChildDialogForm` body (matches ERP patterns, avoids nested dialogs):

| Section | Fields |
|---------|--------|
| Basic | type, code, labels EN/AR, field type, sort, group, section, required, active |
| Visibility | show_in_* toggles, searchable, filterable |
| AI Extraction | is_ai_extractable, hint, aliases, keywords, format, examples, threshold, normalization |
| Validation & Review | validation_json editor (structured mini-form + JSON fallback), review_required_* |
| Advanced | ai_rules_json (monospace textarea, optional) |

**List table additions:**
- `field_group` column (optional, hideable)
- Tooltip on AI icon showing threshold if set

**Keep:**
- ERPDataTable, filters, export, permission gates
- field_code immutable on edit
- options_json textarea for select types

**Avoid:**
- Nested Button in DropdownMenuTrigger (workspace rule)
- shadcn Select for async lookups (use ERPCombobox if entity refs added later)

---

## 22. Proposed Validation and Review Behavior

Phase 2 **plans data structures**; full validation engine can be Phase 2 implementation or Phase 2.1.

| Rule | Data source | Behavior |
|------|-------------|----------|
| Required field empty | `is_required` | Warning badge in intake; block approve optional (configurable — default **warn**, not block) |
| Low confidence | `ai_confidence_threshold` vs score | Flag if `review_required_if_low_confidence` |
| Missing required | `review_required_if_missing` | Flag in review UI |
| Regex/date/number | `validation_json` | Client + server validate on approve |
| Unique value | `is_unique` | Check duplicate values per type on approve (server query) |
| Select mismatch | `options_json` | Reject values not in options on save |
| Field type mismatch | `field_type` | Coerce or warn |

**Human-review-first:** Flags are **warnings** unless business rules later add hard blocks. Approve remains human-initiated.

**Storage for review flags:** Use intake UI state + optional extension to `dms_intake_review_values.review_status` — no schema change required in Phase 2.

---

## 23. Proposed Future ERP Mapping Support

For Phase 10 (apply-to-metadata) and Phase 13 (cross-module sync):

| Field | Purpose |
|-------|---------|
| `target_erp_module` | e.g. HR, PARTY_MASTER |
| `target_erp_entity` | e.g. employee, party |
| `target_erp_table` | e.g. employees |
| `target_erp_field` | e.g. passport_number |
| `target_relation_field` | FK field on target |
| `mapping_priority` | When multiple defs map same target |
| `allow_apply_to_existing` | Overwrite guard |
| `requires_approval_before_save` | Extra approval gate |

**Phase 2 plan decision:** Document schema in this plan; **do not migrate or UI in Phase 2**. Implement alongside Phase 10 apply-to-metadata prompt.

---

## 24. RLS / Security Impact Plan

| Change | RLS impact |
|--------|------------|
| New columns on definitions | None — same policies |
| ai_rules_json content | Admin-only write; no PII in rules |
| is_searchable/is_filterable | Future search must respect document confidentiality (server-side, existing gates) |
| Label column drop | None |

No broadening of `USING (true)` policies.

Server actions continue `getAuthContext` + `hasPermission`.

---

## 25. Audit Logging Impact Plan

Extend audit `new_values` in `metadata-definitions.ts` to include new fields on create/update.

Suggested actions (existing pattern):
- `DMS_METADATA_FIELD_CREATED`
- `DMS_METADATA_FIELD_UPDATED`
- Add `DMS_METADATA_FIELD_VERSION_BUMP` when `metadata_version` incremented intentionally

Do not log full `ai_rules_json` if it ever contains document-derived data (admin-defined only).

---

## 26. Backward Compatibility and Data Preservation Plan

| Rule | Implementation |
|------|----------------|
| AC-03/04 | Never delete `dms_document_metadata_values`; FK unchanged |
| Existing AI results | Old `extracted_fields_json` keys remain valid field_codes |
| Loader | New fields optional — old code paths work if migration not applied (feature detect columns) |
| Admin | Old rows show defaults for new toggles |
| Prompt | v3.2 backward compatible output schema |
| field_code rename | **Forbidden** in Phase 2 without explicit migration tool |

---

## 27. DMS.14 Migration Parity Pre-Check

**Status:** Live DB fixed; repo missing full `erp_dms_14_security_rls_tighten_overly_broad_policies` migration.

| Table | Repo status | Recommendation |
|-------|-------------|----------------|
| `dms_intake_review_values` | Phase 1 backfill exists | Done |
| `dms_expiry_reminders` | Permissive policy in DMS.8 migration | **Step 0** backfill before Phase 2 |
| `dms_notification_queue` | Permissive in DMS.8 | **Step 0** |
| `dms_renewal_requests` | Permissive in DMS.8 | **Step 0** |

**Decision:** Handle in **separate migration before Phase 2 metadata work** — not unrelated, reduces security drift on fresh installs. Does not block planning approval.

---

## 28. Implementation Sequence for Future Phase 2 Execution

| Step | Task | Depends on |
|------|------|------------|
| 0 | DMS.14 RLS parity migration | — |
| 1 | Label normalization migration + fix `document-metadata-values.ts` | Step 0 |
| 2 | Metadata columns migration | Step 1 |
| 3 | Regenerate Supabase types | Step 2 |
| 4 | Extend `DmsAiMetadataField` + shared loader module | Step 3 |
| 5 | Update `metadata-definitions.ts` Zod + CRUD | Step 3 |
| 6 | Admin UI accordion sections | Step 5 |
| 7 | Update `prompt-builders.ts` → v3.2 | Step 4 |
| 8 | Intake review UI grouping + flags | Step 4, 6 |
| 9 | Optional: normalization post-process in intake/analysis | Step 7 |
| 10 | Manual QA + typecheck/lint/build | All |
| 11 | Implementation report + SOT update | Step 10 |

**Parallel safe:** Steps 5–6 can proceed after Step 3; Step 7–8 need loader (Step 4).

---

## 29. Acceptance Criteria for Future Implementation

| ID | Criterion |
|----|-----------|
| AC-01 | Existing AI intake continues to work |
| AC-02 | Existing AI Analysis continues to work |
| AC-03 | Existing metadata values remain linked to definitions |
| AC-04 | No metadata value data loss |
| AC-05 | New fields added with safe defaults |
| AC-06 | RLS remains safe |
| AC-07 | Admin UI creates/edits upgraded definitions |
| AC-08 | AI prompt receives enhanced fields where implemented |
| AC-09 | `extracted_fields_json` schema unchanged |
| AC-10 | `field_confidence_json` schema unchanged |
| AC-11 | Human review required before final save |
| AC-12 | typecheck + build pass |
| AC-13 | Migration works fresh + existing DB |
| AC-14 | No duplicate tables/columns (`label_ar` removed) |
| AC-15 | Plan reviewed before implementation (this document) |

**Additional Phase 2-specific:**
| AC-16 | `document-metadata-values` queries use correct column names |
| AC-17 | `field_label_ar` single canonical Arabic column |
| AC-18 | Admin validation_json editable |
| AC-19 | Intake groups fields when `field_group` set |

---

## 30. Test Plan for Future Implementation

### Automated
- `npm run typecheck`
- `npm run lint` (document pre-existing unrelated failures)
- `npm run build`

### Metadata admin
- Create field with all new AI columns populated
- Edit field — verify `metadata_version` increment strategy
- Deactivate field — values on documents remain
- Delete blocked when values exist
- Reorder within document type

### AI intake
- Upload → AI fill → review shows grouped fields
- Arabic alias improves extraction (manual test with Emirates ID)
- Low confidence flagged when below threshold
- Required missing flagged
- Approve & save persists typed values
- Standard file naming still resolves `field_code`

### AI Analysis
- Run analysis on document with upgraded type definitions
- Results display unchanged structure
- Shared loader returns same fields as intake

### Migration
- Apply on fresh DB from migrations folder
- Apply on existing DB with `label_ar` data — verify backfill
- Verify RLS policies unchanged for definitions

### Security
- User without `manage_types` cannot edit definitions
- Uploader can complete intake with read-only definition access

### Regression
- Document metadata tab loads (fixes column bug)
- HR compliance prefill still reads `extracted_fields_json`

---

## 31. Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Label column bug breaks intake metadata tab | Step 1 priority fix |
| Prompt token bloat from aliases | Truncate lists; max 5 aliases per field in prompt |
| Admin form too complex | Accordion + xl dialog; sensible defaults |
| field_code rename breaks historical AI JSON | Document immutability; admin UI disable code edit |
| Wide table maintenance | Hybrid JSON overflow; defer child tables |
| Over-automation of validation blocks upload | Default warn-only; human approve |
| DMS.14 gap on fresh install | Step 0 migration |

---

## 32. What Must Not Be Implemented in Phase 2

- Async AI job queue (Phase 3+)
- AI tab automation (Phase 4+)
- Apply-to-metadata on document record (Phase 10)
- Semantic chunks (Phase 5+)
- `dms_review_queue` wiring (Phase 12)
- ERP mapping UI and apply logic (Phase 10/13)
- Child rule tables (unless explicitly approved later)
- Auto-save AI results to production metadata
- Auto-approve intake
- UI redesign outside metadata admin + intake grouping
- Drop/rename existing columns except duplicate `label_ar`

---

## 33. Recommended Next Cursor Implementation Prompt

After ChatGPT review of this plan, create:

```text
ChatGPT/ERP_DMS_AI_PHASE_2_METADATA_DEFINITIONS_UPGRADE_IMPLEMENTATION_PROMPT.md
```

Implementation prompt should:
1. Reference this plan as mandatory input
2. Enforce Step 0 → Step 11 sequence
3. Require implementation report `ERP_DMS_AI_PHASE_2_METADATA_DEFINITIONS_UPGRADE_IMPLEMENTATION_REPORT.md`
4. Update `ERP_DMS_AI_CURRENT_SOURCE_OF_TRUTH.md`
5. Include explicit task: fix `document-metadata-values.ts` column names before feature work
6. Set PROMPT_VERSION bump to v3.2 as acceptance gate
7. Forbid Phase 3+ scope

---

## 34. Final Recommendation

Proceed with **Hybrid Option D** after **label normalization** and **DMS.14 Step 0**.

Phase 2 implementation should be a **focused metadata definition upgrade**: richer AI hints, visibility, grouping, validation exposure, and review flags — while preserving JSON output compatibility and human-review-first governance.

The highest-risk item is not new columns but the **existing `label_en`/`label_ar` vs `field_label_*` mismatch** — fix this first in implementation.

Approve this plan in ChatGPT before generating the implementation prompt or writing any code.

---

*End of Phase 2 planning document.*
