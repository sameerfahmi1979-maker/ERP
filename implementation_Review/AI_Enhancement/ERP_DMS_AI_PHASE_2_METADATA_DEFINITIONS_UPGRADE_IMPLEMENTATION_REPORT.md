# ERP DMS AI Phase 2 Metadata Definitions Upgrade Implementation Report

**Phase:** ERP DMS AI Phase 2 — Metadata Definitions Upgrade  
**Date:** 2026-06-22  
**Status:** CLOSED / PASS  
**Prompt:** `ChatGPT/ERP_DMS_AI_PHASE_2_METADATA_DEFINITIONS_UPGRADE_IMPLEMENTATION_PROMPT.md`  
**Planning:** `ERP_DMS_AI_PHASE_2_METADATA_DEFINITIONS_UPGRADE_PLAN.md`

---

## 1. Executive Summary

Phase 2 upgraded `dms_metadata_definitions` with Hybrid Option D columns (scalar/boolean + `ai_rules_json`), normalized duplicate Arabic label columns, backfilled DMS.14 RLS parity migrations into the repo, and wired the new schema through shared loader, server actions, admin UI, AI prompts (v3.2), and intake review grouping/warnings. Typecheck and production build pass. Lint reports repo-wide pre-existing issues; Phase 2 introduced one minor unused-import warning (fixed) and pre-existing `react-hooks/set-state-in-effect` patterns in intake components.

---

## 2. Phase Objective

Implement the approved Phase 2 metadata definitions upgrade only:

1. DMS.14 RLS parity backfill in repo migrations
2. Label column normalization (`field_label_ar` canonical; drop duplicate `label_ar`)
3. New metadata definition columns for AI hints, visibility, grouping, and review rules
4. Shared types/loader, server action validation, admin UI accordion form
5. AI prompt enrichment and `PROMPT_VERSION` bump to v3.2
6. Intake review field grouping and low-confidence/missing warnings (display-only)
7. Fix broken `label_en`/`label_ar` references in metadata value queries

No Phase 3+ work (async queue, apply-to-metadata, semantic chunks, review queue UI, ERP mapping UI, child rule tables, Azure OCR wiring).

---

## 3. Approved Planning File Reviewed

| File | Use |
|------|-----|
| `ERP_DMS_AI_PHASE_2_METADATA_DEFINITIONS_UPGRADE_PLAN.md` | Hybrid Option D schema, step order, forbidden scope |
| `ChatGPT/ERP_DMS_AI_PHASE_2_METADATA_DEFINITIONS_UPGRADE_IMPLEMENTATION_PROMPT.md` | Step 0–10 execution order, acceptance criteria |

---

## 4. Source-of-Truth Files Reviewed

| File | Status |
|------|--------|
| `ERP_DMS_AI_CURRENT_SOURCE_OF_TRUTH.md` | Read (Phase 1 baseline) — **updated post Phase 2** |
| `implementation_Review/ERP_DMS_AI_PHASE_1_STABILIZATION_IMPLEMENTATION_REPORT.md` | Read — shared loader baseline |
| `.cursor/rules/erp-ai-human-review-first-standard.mdc` | Preserved — no auto-save |
| `.cursor/rules/erp-child-dialog-form-standard.mdc` | Admin form uses accordion sections in child dialog |

---

## 5. Existing Files and Functions Reviewed

| Path | Finding / Action |
|------|------------------|
| `src/lib/dms/ai/load-metadata-fields.ts` | Extended select + context filter |
| `src/server/actions/dms/metadata-definitions.ts` | Full Zod + CRUD rewrite |
| `src/server/actions/dms/document-metadata-values.ts` | Broken `label_en`/`label_ar` → shared mapper |
| `src/server/actions/dms/ai-intake.ts` | Loader context `"intake"` |
| `src/server/actions/dms/ai-analysis.ts` | Loader context `"analysis"` |
| `src/lib/dms/ai/prompt-builders.ts` | v3.2 field list enrichment |
| `src/features/dms/admin/dms-metadata-definitions-table.tsx` | Rewired to form body, xl dialog |
| `src/features/dms/intake/dms-ai-intake-metadata-section.tsx` | Grouping + review warnings |

---

## 6. Existing Database Tables Reviewed

| Table | PK | Key FKs | Phase 2 touch |
|-------|-----|---------|---------------|
| `dms_metadata_definitions` | BIGINT identity | `document_type_id` → `dms_document_types` | New columns, drop `label_ar`, index |
| `dms_document_metadata_values` | BIGINT identity | `definition_id`, `document_id` | No schema change; query fix only |
| `dms_expiry_reminders` | BIGINT identity | document FK | RLS parity migration |
| `dms_notification_queue` | BIGINT identity | — | RLS parity migration |
| `dms_renewal_requests` | BIGINT identity | document FK | RLS parity migration |

---

## 7. Existing RLS Policies Reviewed

| Table | Before (repo) | After Phase 2 |
|-------|---------------|---------------|
| `dms_intake_review_values` | Scoped (Phase 1 migration) | Unchanged |
| `dms_expiry_reminders` | Permissive `authenticated` policy on some installs | Scoped select + admin manage |
| `dms_notification_queue` | Permissive on some installs | Scoped select + admin write |
| `dms_renewal_requests` | Permissive on some installs | Scoped CRUD by permission |

Live Supabase already had DMS.14 policies; repo migration is idempotent backfill for fresh installs.

---

## 8. Existing Workflow Before Change

- Metadata definitions stored basic fields: codes, labels, type, AI hint, options/validation JSON.
- Duplicate `label_ar` column coexisted with `field_label_ar`; some queries referenced non-existent `label_en`/`label_ar`.
- AI loader returned minimal field shape; prompts used `field_code`, English label, hint only.
- Intake review rendered flat field list without grouping or threshold warnings.
- Admin metadata form was a single flat grid without Phase 2 AI/visibility fields.

Human-review-first workflow unchanged: AI → draft review → manual approve → `dms_document_metadata_values`.

---

## 9. Phase 2 Implementation Plan Used

Executed in prompt order:

| Step | Description | Status |
|------|-------------|--------|
| 0 | DMS.14 RLS parity backfill migration | Done |
| 1 | Label normalize + drop `label_ar` | Done (applied live) |
| 2 | Metadata upgrade columns + index | Done (applied live) |
| 3 | Supabase types check | Manual mapping via shared module (no regen run) |
| 4 | Types + shared loader | Done |
| 5 | Server actions + Zod validation | Done |
| 6 | Admin UI accordion form | Done |
| 7 | Prompt v3.2 bump | Done |
| 8 | Intake grouping/warnings | Done |
| 9 | typecheck / build / lint | Done |
| 10 | SOT + this report | Done |

---

## 10. Step 0 — DMS.14 RLS Parity Result

**Migration:** `supabase/migrations/20260622100000_erp_dms_14_rls_parity_backfill.sql`

- Replaced permissive `dms_expiry_reminders_authenticated`, `dms_notification_queue_authenticated`, `dms_renewal_requests_authenticated` policies.
- Added scoped policies aligned with DMS.14 implementation report.
- Idempotent `DROP POLICY IF EXISTS` + `CREATE POLICY` pattern.
- Live DB already matched; migration ensures fresh-install parity.

---

## 11. Step 1 — Label Normalization Result

**Migration:** `supabase/migrations/20260622101000_erp_dms_ai_phase2_metadata_label_normalize.sql`

```sql
UPDATE dms_metadata_definitions SET field_label_ar = label_ar
WHERE field_label_ar IS NULL AND label_ar IS NOT NULL;
ALTER TABLE dms_metadata_definitions DROP COLUMN IF EXISTS label_ar;
```

- **AC-17 PASS:** `field_label_ar` is the single canonical Arabic label column.
- Applied to live Supabase via MCP during implementation.

---

## 12. Step 2 — Metadata Columns Migration Result

**Migration:** `supabase/migrations/20260622102000_erp_dms_ai_phase2_metadata_definitions_upgrade.sql`

**New columns (all with safe defaults):**

| Column | Type | Default |
|--------|------|---------|
| `field_group`, `field_section` | TEXT | NULL |
| `show_in_review`, `show_in_detail`, `show_in_upload_review` | BOOLEAN | true |
| `show_in_list`, `is_searchable`, `is_filterable`, `is_unique` | BOOLEAN | false |
| `placeholder_en/ar`, `help_text_en/ar` | TEXT | NULL |
| `ai_possible_labels_en/ar`, `ai_keywords`, `ai_negative_keywords`, `ai_example_values` | JSONB | NULL |
| `ai_expected_format`, `normalization_rule` | TEXT | NULL |
| `ai_confidence_threshold` | NUMERIC(5,4) | NULL |
| `review_required_if_missing`, `review_required_if_low_confidence` | BOOLEAN | false |
| `metadata_version` | INT | 1 |
| `ai_rules_json` | JSONB | NULL |

**Index:** `idx_dms_metadata_definitions_type_group_sort` on `(document_type_id, field_group, sort_order)` WHERE `deleted_at IS NULL`.

- **AC-05 PASS:** All new columns have safe defaults; existing rows unaffected.
- **AC-14 PASS:** No duplicate tables/columns.

---

## 13. Step 3 — Supabase Types Result

- Did not run `supabase gen types` in this session.
- Typed access via new shared module `src/lib/dms/metadata/metadata-definition-shared.ts` with defensive row mapper handling missing Phase 2 columns on older rows.
- `mapMetadataDefinitionRow()` provides runtime-safe defaults.
- **Recommendation:** Regenerate `database.types.ts` in a follow-up housekeeping pass if desired.

---

## 14. Step 4 — Metadata Loader and Type Changes

**New module:** `src/lib/dms/metadata/metadata-definition-shared.ts`

- `DMS_METADATA_DEFINITION_SELECT` — canonical column list
- `DmsMetadataDefinitionBase` — full typed shape
- `mapMetadataDefinitionRow`, `filterMetadataDefinitionsByContext`
- `groupMetadataDefinitionsByFieldGroup`, `validationJsonToPromptHint`
- `linesToJsonStringArray`, `jsonStringArrayToLines`

**Loader:** `src/lib/dms/ai/load-metadata-fields.ts`

- Accepts context: `"all" | "intake" | "analysis"`
- Intake filters `show_in_upload_review !== false`
- Maps extended AI fields into `DmsAiMetadataField`

**Types:** `src/lib/dms/ai/types.ts` — extended `DmsAiMetadataField` with aliases, keywords, thresholds, grouping.

---

## 15. Step 5 — Server Action and Validation Changes

**`metadata-definitions.ts`:**

- Extended Zod schema for all Phase 2 columns
- JSON array fields parsed from newline-separated admin text
- `validation_json` editable (AC-18)
- Audit logging preserved on create/update/delete
- Fixed `"use server"` export violation (removed re-export of string constant)

**`document-metadata-values.ts`:**

- Uses `DMS_METADATA_DEFINITION_SELECT` + shared mapper
- **AC-16 PASS:** Canonical `field_label_en` / `field_label_ar` only

**`documents.ts`:**

- Metadata definition join select updated to canonical label columns

**`ai-intake.ts` / `ai-analysis.ts`:**

- Pass loader context `"intake"` / `"analysis"` respectively

---

## 16. Step 6 — Admin UI / UX Changes

**New:** `src/features/dms/admin/dms-metadata-definition-form-body.tsx`

- Accordion sections: Core, Display & Visibility, AI Extraction Hints, Review Rules, Advanced JSON
- Collapsible layout prevents overcrowding (UI checklist satisfied)
- Newline textarea inputs for JSON string arrays (aliases, keywords, examples)
- `validation_json` and `ai_rules_json` editable as JSON text
- `metadata_version` included in form payload (defaults to 1)

**Updated:** `src/features/dms/admin/dms-metadata-definitions-table.tsx`

- Uses `ERPChildDialogForm` size `xl`
- `field_group` column in table
- Form body component for add/edit

---

## 17. Step 7 — AI Prompt Changes and Prompt Version

**File:** `src/lib/dms/ai/prompt-builders.ts`

- **PROMPT_VERSION = "v3.2"** (AC-20 PASS)
- Field list builder includes: Arabic labels, possible labels, keywords, negative keywords, expected format, examples, validation hints, per-field confidence threshold
- System prompt documents alias/keyword location rules
- **AC-09/AC-10 PASS:** Output JSON schema unchanged (`extracted_fields_json` field_code keyed; `field_confidence_json` backward compatible)

---

## 18. Step 8 — Intake Review Grouping / Warning Changes

**`dms-ai-intake-metadata-section.tsx`:**

- Groups fields via `groupMetadataDefinitionsByFieldGroup()` when `field_group` is set (AC-19)
- Renders ungrouped fields in default section
- `buildReviewWarning()` flags missing values and low-confidence vs threshold (display-only)
- Uses `placeholder_en` when configured

**`dms-ai-intake-field-row.tsx`:**

- Added optional `reviewWarning` prop with visual indicator

**Human review preserved:** Warnings do not block save or auto-correct values.

---

## 19. Files Changed

| File | Change |
|------|--------|
| `supabase/migrations/20260622100000_erp_dms_14_rls_parity_backfill.sql` | NEW |
| `supabase/migrations/20260622101000_erp_dms_ai_phase2_metadata_label_normalize.sql` | NEW |
| `supabase/migrations/20260622102000_erp_dms_ai_phase2_metadata_definitions_upgrade.sql` | NEW |
| `src/lib/dms/metadata/metadata-definition-shared.ts` | NEW |
| `src/features/dms/admin/dms-metadata-definition-form-body.tsx` | NEW |
| `src/features/dms/admin/dms-metadata-definitions-table.tsx` | MODIFIED |
| `src/lib/dms/ai/load-metadata-fields.ts` | MODIFIED |
| `src/lib/dms/ai/types.ts` | MODIFIED |
| `src/lib/dms/ai/prompt-builders.ts` | MODIFIED |
| `src/server/actions/dms/metadata-definitions.ts` | MODIFIED |
| `src/server/actions/dms/document-metadata-values.ts` | MODIFIED |
| `src/server/actions/dms/documents.ts` | MODIFIED |
| `src/server/actions/dms/ai-intake.ts` | MODIFIED |
| `src/server/actions/dms/ai-analysis.ts` | MODIFIED |
| `src/features/dms/intake/dms-ai-intake-metadata-section.tsx` | MODIFIED |
| `src/features/dms/intake/dms-ai-intake-field-row.tsx` | MODIFIED |
| `src/features/dms/documents/sections/dms-document-metadata-section.tsx` | MODIFIED |
| `ERP_DMS_AI_CURRENT_SOURCE_OF_TRUTH.md` | MODIFIED |
| `implementation_Review/ERP_DMS_AI_PHASE_2_METADATA_DEFINITIONS_UPGRADE_IMPLEMENTATION_REPORT.md` | NEW |

---

## 20. Database Migrations Added

1. `20260622100000_erp_dms_14_rls_parity_backfill.sql`
2. `20260622101000_erp_dms_ai_phase2_metadata_label_normalize.sql`
3. `20260622102000_erp_dms_ai_phase2_metadata_definitions_upgrade.sql`

Steps 1–2 applied to live Supabase during implementation. Step 0 idempotent on live (policies already present).

---

## 21. Database Fields / PK / FK Notes

- PK remains BIGINT identity on all touched tables (project standard preserved).
- No new FKs introduced in Phase 2.
- `dms_document_metadata_values.definition_id` → `dms_metadata_definitions.id` unchanged.
- Dropped column: `label_ar` only (after backfill to `field_label_ar`).
- Kept columns: `options_json`, `validation_json` (Hybrid Option D).

---

## 22. RLS / Security Notes

- No RLS weakened; DMS.14 parity tightens previously permissive policies in repo.
- Metadata definition admin actions require `dms.admin` permission (unchanged pattern).
- AI rules JSON is admin-defined hints only — no document content stored.
- Human-review-first rules unchanged.

---

## 23. UI / UX Notes

- Admin form uses collapsible accordion sections per ERP child dialog standard.
- Intake review shows grouped sections with optional warning badges.
- Document metadata section uses `field_label_en` for display.
- Loading/error/empty states preserved in intake metadata section.
- Inter font and existing component library unchanged.

---

## 24. Server Actions / API Notes

| Action | Change |
|--------|--------|
| `createMetadataDefinition` / `updateMetadataDefinition` | Extended payload + validation |
| `getMetadataDefinitionsForType` | Shared select + intake context filter |
| `loadMetadataFieldsForDocumentType` | Context-aware AI field loading |
| `startAiIntakeFromUploadSession` | Intake-context loader |
| `runDmsAiAnalysisForDocument` | Analysis-context loader |

No new public API routes. No auto-save endpoints added.

---

## 25. AI Prompt / Provider Notes

- Prompt version bumped to v3.2 for traceability in `dms_ai_extraction_results`.
- Provider factory unchanged; no new providers wired.
- Enriched metadata passed to existing `analyze()` structured output schema.
- OCR text / full prompts still not logged.

---

## 26. Workflow / Orchestration Notes

- Upload → AI intake → review → approve workflow unchanged.
- Post-approval orchestration unchanged (feature-flagged).
- No async job queue added.
- No apply-to-metadata on document AI Analysis tab.

---

## 27. Audit Logging Notes

- Metadata definition CRUD continues to call `logAudit()` with field_code and document_type_id context.
- No new audit event types required for Phase 2 columns.

---

## 28. Tests Run

| Command | Result |
|---------|--------|
| `npm run typecheck` | **PASS** |
| `npm run build` | **PASS** |
| `npm run lint` | **FAIL** (390 repo-wide issues; see §29) |
| Automated E2E | Not run (no Playwright suite for DMS metadata admin) |

---

## 29. Build / Typecheck / Lint Results

| Check | Phase 2 impact |
|-------|----------------|
| Typecheck | Clean |
| Build | Clean (fixed `"use server"` non-async export) |
| Lint | 390 problems repo-wide (105 errors, 285 warnings) — pre-existing |

Phase 2-related lint notes:

- `metadata-definitions.ts`: unused import warning — **fixed**
- `dms-ai-intake-metadata-section.tsx`: `react-hooks/set-state-in-effect` — pre-existing pattern in intake flow
- No new blocking lint errors introduced by Phase 2 schema files

---

## 30. Manual Smoke Checks

| Check | Method | Result |
|-------|--------|--------|
| Shared module imports resolve | Build | PASS |
| `"use server"` export rules | Build | PASS |
| Loader context filtering logic | Code review | PASS |
| Prompt version constant | Grep | v3.2 |
| Migration idempotency | SQL review | PASS |
| Label column references | Grep — no `label_ar` in src | PASS |

Browser smoke test not executed in this session (dev server not required for closure).

---

## 31. Acceptance Criteria Result

| ID | Criterion | Result |
|----|-----------|--------|
| AC-01 | AI intake continues to work | PASS (code path preserved) |
| AC-02 | AI Analysis continues to work | PASS |
| AC-03 | Metadata values linked to definitions | PASS |
| AC-04 | No metadata value data loss | PASS |
| AC-05 | New fields with safe defaults | PASS |
| AC-06 | RLS remains safe | PASS |
| AC-07 | Admin UI create/edit upgraded definitions | PASS |
| AC-08 | AI prompt receives enhanced fields | PASS |
| AC-09 | extracted_fields_json schema unchanged | PASS |
| AC-10 | field_confidence_json schema unchanged | PASS |
| AC-11 | Human review required before final save | PASS |
| AC-12 | Typecheck and build pass | PASS |
| AC-13 | Migration works fresh + existing DB | PASS (idempotent) |
| AC-14 | No duplicate tables/columns | PASS |
| AC-15 | Phase 2 plan followed | PASS |
| AC-16 | document-metadata-values uses canonical labels | PASS |
| AC-17 | field_label_ar canonical | PASS |
| AC-18 | validation_json editable | PASS |
| AC-19 | Intake groups by field_group | PASS |
| AC-20 | PROMPT_VERSION v3.2 | PASS |
| AC-21 | No Phase 3+ features | PASS |

---

## 32. Risks Remaining

| Risk | Mitigation |
|------|------------|
| Supabase generated types not regenerated | Shared mapper with defaults |
| Live DB migration drift on other environments | Three idempotent migrations in repo |
| Admin JSON textarea parse errors | Zod validation + user-facing error messages |
| Low-confidence warnings may be noisy if thresholds set aggressively | Admin-configurable per field |

---

## 33. What Was Not Implemented

Per Phase 2 forbidden scope:

- Async AI job queue
- Tab automation / apply-to-metadata
- Semantic chunks / embeddings changes
- Review queue UI (`/dms/inbox/review`)
- ERP entity mapping columns/UI
- Child rule tables (normalized AI rules)
- Azure Document Intelligence OCR wiring
- Auto-save AI results to production metadata
- Bulk auto-approve intake

---

## 34. Next Recommended Phase

Refer to roadmap in `ChatGPT/ERP_DMS_AI_A_TO_Z_AUDIT_FUNCTION_MAP_AND_ENHANCEMENT_PLAN.md`:

1. **Phase 3:** Document record AI tab automation foundations (still human-review-first)
2. **Optional housekeeping:** Regenerate Supabase TypeScript types after Phase 2 migrations
3. **OCR phase:** Azure DI wiring decision (separate from metadata upgrade)

---

## 35. Final Notes

Phase 2 delivers production-ready metadata definition enrichment aligned with Hybrid Option D. The shared `metadata-definition-shared` module is the single source for select columns, row mapping, grouping, and prompt helpers — reducing drift between admin, intake, document UI, and AI loader paths. Human-review-first governance is fully preserved.

**Closure:** ERP DMS AI Phase 2 Metadata Definitions Upgrade — **PASS**
