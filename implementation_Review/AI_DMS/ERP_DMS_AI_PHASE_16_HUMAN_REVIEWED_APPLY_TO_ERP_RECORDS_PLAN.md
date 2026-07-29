# ERP DMS AI Phase 16 — Human-Reviewed Apply-to-ERP Records Plan

**Plan created:** 2026-06-26
**Planning status:** READY FOR CHATGPT REVIEW
**Phase:** ERP DMS AI Phase 16 — Human-Reviewed Apply-to-ERP Records
**Risk level:** HIGHEST (first AI-suggested writes to ERP operational records)

---

## 1. Executive Summary

Phase 16 introduces the first human-confirmed write-back from DMS AI suggestions into ERP operational and master-data records. It closes the review loop started in Phase 13 (Validation, Entity Matching) and extends the DMS metadata apply engine from Phase 6/7.

Every write in Phase 16 must be:
- **Human selected and confirmed** — no auto-apply, no background apply
- **Permission gated** — both DMS apply permission AND target module permission required
- **Server revalidated** — target record reloaded immediately before apply
- **Field allowlisted** — only approved table/column pairs
- **Audited** — every applied item creates an audit log entry and apply history row
- **Explainable** — before/after summaries stored; no raw OCR/prompt/AI response

Phase 16 is intentionally split into two target groups with staged feature flag rollout:
- **Stage 1:** DMS document fields (entity link FKs, date/text fields) and DMS metadata values
- **Stage 2:** HR compliance records and Party license/tax records

---

## 2. Planning Scope and Non-Implementation Rule

This document is a **planning-only artifact**. It contains zero code changes, zero migrations, zero schema changes, and zero UI changes.

Cursor produced this plan by reading and analyzing actual source code and migrations. All architectural recommendations are grounded in the actual codebase state as of Phase 15 closure.

Implementation will be performed only after ChatGPT review and explicit approval from Sameer.

---

## 3. Files and Source-of-Truth Reviewed

### Source-of-truth documents read
- `ERP_DMS_AI_CURRENT_SOURCE_OF_TRUTH.md` — DMS AI phase status
- `.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md` — master ERP status

### Implementation reports read
- `implementation_Review/ERP_DMS_AI_PHASE_15_TESTING_PERFORMANCE_HARDENING_IMPLEMENTATION_REPORT.md`
- `implementation_Review/ERP_DMS_AI_PHASE_15_RUNTIME_UAT_CHECKLIST.md`
- `implementation_Review/ERP_DMS_AI_PHASE_15_PRODUCTION_READINESS_CHECKLIST.md`
- `implementation_Review/ERP_DMS_AI_PHASE_14_RUNTIME_UAT_AND_CLOSURE_REPORT.md`
- `implementation_Review/ERP_DMS_AI_PHASE_13_RUNTIME_UAT_AND_CLOSURE_REPORT.md`

### DMS AI apply/diff/history files read
- `src/lib/dms/metadata/metadata-diff.ts` — full Phase 6 diff engine including `buildMetadataDiff`, `convertAiValueForFieldType`, `serializeMetadataValue`, `summarizeMetadataValue`
- `src/server/actions/dms/ai-analysis.ts` — `applyAiAnalysisToMetadata()` (Phase 6/7 DMS metadata apply), `getDmsAiMetadataApplyHistory()`, job orchestration
- `src/lib/dms/erp-mapping/erp-mapping-targets.ts` — `ERP_MAPPING_TARGET_REGISTRY` (Phase 8 allowlist)

### Phase 13 validation/matching files read
- `src/lib/dms/validation/validation-types.ts` — `DmsValidationFindingInput`, `DmsValidationFindingStatus`, `DmsValidationFindingType`, `DmsValidationRunResult`
- `src/lib/dms/entity-matching/entity-match-types.ts` — `DmsEntityMatchCandidateInput`, `DmsEntityMatchTargetType`, `DmsEntityMatchStatus`, `MATCH_SCORE_THRESHOLDS`

### Migrations read
- `supabase/migrations/20260622130000_erp_dms_ai_phase7_apply_history.sql` — `dms_ai_metadata_apply_runs`, `dms_ai_metadata_apply_items` schema + RLS
- `supabase/migrations/20260622140000_erp_dms_ai_phase8_erp_mappings.sql` — ERP mapping config tables
- `supabase/migrations/20260626100000_erp_dms_ai_phase13_validation_matching.sql` — `dms_ai_validation_findings`, `dms_ai_entity_match_candidates` schema + RLS

### Missing files (not found, list for reference)
- `src/features/dms/documents/sections/dms-document-ai-section.tsx` — exists but not read (large; key behaviors are captured via server action inspection)
- `src/features/dms/documents/sections/dms-erp-mapping-preview-panel.tsx` — not found (may be in review only)
- `src/server/actions/dms/erp-mappings.ts` — found at path but not read in detail; ERP mapping CRUD is Phase 8 admin-only
- `src/server/actions/dms/validation.ts`, `entity-matching.ts`, `review-queue.ts` — not individually read but architecture understood from migration + types
- `src/server/actions/master-data/parties.ts`, `party-*.ts` — not read; party field allowlist derived from `ERP_MAPPING_TARGET_REGISTRY`
- `src/server/actions/hr/employees.ts`, `compliance.ts` — not read; HR target allowlist derived from `ERP_MAPPING_TARGET_REGISTRY`

---

## 4. Current Apply-Related Capabilities

### 4.1 Phase 6/7 — DMS Metadata Apply (FULLY IMPLEMENTED, ACTIVE)

**Server action:** `applyAiAnalysisToMetadata()` in `src/server/actions/dms/ai-analysis.ts`

Capabilities:
- Human selects fields from AI extraction result diff
- Confirmation flags required (`replaceExistingConfirmed`, `lowConfidenceConfirmed`)
- Server rebuilds diff immediately before apply (server revalidation)
- Upserts `dms_document_metadata_values` rows
- Creates `dms_ai_metadata_apply_runs` + `dms_ai_metadata_apply_items` records
- Writes audit log entries (`ai_metadata_field_applied`)
- Marks AI result `accepted` on success

**Verdict:** Reuse and coordinate — Phase 16 DMS metadata writes must NOT bypass this engine. Phase 16 may add a thin wrapper or orchestration layer but must not duplicate the metadata apply logic.

### 4.2 Phase 7 — Apply History Tables (FULLY IMPLEMENTED, ACTIVE)

Existing tables:
```
dms_ai_metadata_apply_runs  — per applyAiAnalysisToMetadata call
dms_ai_metadata_apply_items — per field/selection
```

These cover DMS document metadata fields only (`dms_document_metadata_values`). They are **NOT** for ERP HR or party tables.

**Phase 16 adds separate tables** for ERP record write-back to avoid confusion.

### 4.3 Phase 8 — ERP Mapping Target Registry (FULLY IMPLEMENTED, READ-ONLY)

`ERP_MAPPING_TARGET_REGISTRY` exists in `src/lib/dms/erp-mapping/erp-mapping-targets.ts`.

Current allowlisted targets (4 tables):

| Module | Target Table | Allowed Fields (column names) |
|--------|-------------|-------------------------------|
| `hr` | `employee_identity_documents` | document_number, issue_date, expiry_date, visa_file_number, uid_number, labour_card_number, work_permit_number, mohre_person_code, profession_on_document, place_of_issue, notes |
| `hr` | `employee_medical_insurances` | policy_number, insurance_provider, tpa, member_id, plan_name, plan_class, effective_date, expiry_date |
| `party` | `party_licenses` | license_number, license_name, license_activity_text, issue_date, expiry_date, remarks |
| `party` | `party_tax_registrations` | tax_registration_number, effective_from, effective_to, remarks |

**Key note:** `allow_apply_to_existing` is always false in Phase 8 (read-only preview). Phase 16 activates actual writes with `allow_apply_to_existing = true` for allowlisted fields only.

**Permission model per target:**
- `employee_identity_documents`: `hr.compliance.manage` or `hr.admin`
- `employee_medical_insurances`: `hr.compliance.manage` or `hr.admin`
- `party_licenses`: `master_data.parties.manage_licenses` or `master_data.parties.edit`
- `party_tax_registrations`: `master_data.parties.manage_tax` or `master_data.parties.edit`

### 4.4 Phase 13 — Validation Findings (FULLY IMPLEMENTED, HUMAN-REVIEW-ONLY)

Table: `dms_ai_validation_findings`

Relevant status flow for Phase 16:
- `open` → human reviews → `reviewed` (and optionally → Apply-to-ERP)
- `false_positive` → no apply
- `dismissed` → no apply
- `superseded` → no apply

Fields useful for Phase 16 apply proposals:
- `finding_type` — e.g., `required_field_missing`, `expiry_in_past`, `ai_value_conflict`
- `field_code` — links to a specific metadata definition
- `current_value_summary` — what is currently stored (max 200 chars)
- `ai_value_summary` — what AI suggests (max 200 chars)
- `document_id`, `ai_result_id`, `metadata_definition_id` — source references
- `status` — must be `reviewed` or `open` with human confirmation to be eligible for apply proposal

### 4.5 Phase 13 — Entity Match Candidates (FULLY IMPLEMENTED, HUMAN-REVIEW-ONLY)

Table: `dms_ai_entity_match_candidates`

**Explicit Phase 13 comment from code:**
> "IMPORTANT: Accepting a candidate does NOT write to dms_documents owner fields. Apply-to-ERP is Phase 16. This phase is human-review-only."

Target entity types:
- `owner_company` → maps to `dms_documents.owning_company_id`
- `branch` → maps to `dms_documents.owning_branch_id`
- `party` → maps to `dms_documents.party_id`
- `employee` → maps to document link/owner (not a direct FK on dms_documents)
- `work_site` → NOT in Phase 16 scope (no current ERP write target)

Status flow for Phase 16:
- `accepted` + **final Apply confirmation** → eligible for ERP write
- `rejected` / `superseded` / `pending` → NOT eligible for ERP write

### 4.6 Phase 12 — Review Queue (FULLY IMPLEMENTED)

Table: `dms_review_queue`. Review queue items link to validation findings and entity match candidates via `validation_finding_id` and `entity_match_candidate_id` (Phase 13 extended).

Phase 16 new resolution codes needed:
```
applied_to_erp
partially_applied_to_erp
apply_conflict
apply_cancelled
```

Current `status` values: `open`, `in_review`, `resolved`, `dismissed`, `escalated`.

---

## 5. Eligible Source Types

### 5.1 `dms_ai_extraction_result_field` (via `dms_ai_extraction_results.extracted_fields_json`)

| Attribute | Value |
|-----------|-------|
| Source table | `dms_ai_extraction_results` |
| Source id | `id` (BIGINT) |
| Input values | `extracted_fields_json[field_code]` + `field_confidence_json[field_code]` |
| Required status | `ai_status NOT IN ('superseded')` |
| Required confidence/review | Human selects from diff; `requiresConfirmation = true` for changed/low_confidence |
| Eligible for Phase 16 apply | **YES** — DMS metadata values (reusing Phase 6/7 engine) AND DMS document basic fields (new) |
| ERP table apply | **YES** — when linked via `dms_metadata_erp_mappings` to an allowlisted ERP target |

### 5.2 `dms_ai_validation_finding`

| Attribute | Value |
|-----------|-------|
| Source table | `dms_ai_validation_findings` |
| Source id | `id` (BIGINT) |
| Input values | `ai_value_summary`, `field_code`, `metadata_definition_id` |
| Required status | `status IN ('open', 'reviewed')` AND human has viewed the finding |
| Required confidence/review | Validation findings require explicit human Apply confirmation; `false_positive`, `dismissed`, `superseded` are blocked |
| Eligible for Phase 16 apply | **YES** — as apply proposal for DMS metadata field corrections |
| ERP table apply | **NO** — findings reference DMS metadata definitions; ERP write is via extraction result + mapping |

### 5.3 `dms_ai_entity_match_candidate`

| Attribute | Value |
|-----------|-------|
| Source table | `dms_ai_entity_match_candidates` |
| Source id | `id` (BIGINT) |
| Input values | `target_entity_type`, `target_entity_id`, `target_display_name`, `match_score` |
| Required status | `status = 'accepted'` — but accepted status alone is NOT sufficient; final Apply confirmation required |
| Required confidence/review | Human must have already accepted candidate AND must now explicitly trigger Apply-to-ERP |
| Eligible for Phase 16 apply | **YES** — for DMS document FK fields only (`owning_company_id`, `owning_branch_id`, `party_id`) |
| ERP table apply | **NO** — candidates don't map to ERP HR/party fields; they map to DMS document owner FKs |

### 5.4 `dms_erp_mapping_preview_item` (via `dms_metadata_erp_mappings`)

| Attribute | Value |
|-----------|-------|
| Source table | `dms_metadata_erp_mappings` (admin-defined mapping config) |
| Source id | `id` (BIGINT) |
| Input values | `target_table`, `target_field`, `source_field_code`, `transformation_hint` |
| Required status | Admin-configured mapping + AI extraction result available |
| Required confidence/review | Human must explicitly confirm field-level apply via preview panel |
| Eligible for Phase 16 apply | **YES** — resolves ERP target record via Phase 8 registry + entity match candidate |
| ERP table apply | **YES** — the primary path for HR compliance and party record writes |

### 5.5 `common_ai_field_suggestion` — NOT APPLICABLE

No `common_ai_field_suggestion` table exists in the codebase. This source type is NOT applicable to Phase 16.

---

## 6. Target Table and Field Allowlist

Phase 16 defines a **new** TypeScript apply target registry file:
```
src/lib/dms/apply-to-erp/apply-target-registry.ts
```

This extends and re-uses the Phase 8 `ERP_MAPPING_TARGET_REGISTRY` for ERP HR/party targets, and adds new DMS-document-level targets.

### 6.1 Stage 1A — DMS Document Entity Link Fields (highest priority, lowest risk)

**Target:** `dms_documents` (FK fields only)

| Field | DB Column | Type | Source | Permission Required | Conflict Behavior |
|-------|-----------|------|--------|---------------------|-------------------|
| Owning Company | `owning_company_id` | BIGINT FK | `dms_ai_entity_match_candidate` (target_entity_type='owner_company') | `dms.documents.edit` | Skip if already set |
| Owning Branch | `owning_branch_id` | BIGINT FK | `dms_ai_entity_match_candidate` (target_entity_type='branch') | `dms.documents.edit` | Skip if already set |
| Party | `party_id` | BIGINT FK | `dms_ai_entity_match_candidate` (target_entity_type='party') | `dms.documents.edit` | Skip if already set |

**Normalizer:** Validate entity id exists in target table before apply. Use admin client to check `organizations`, `branches`, `parties` as applicable.

**Conflict behavior:** If the document already has a value in that FK field, the apply item requires `replaceExistingConfirmed = true`. Do not silently overwrite.

**Audit label format:** `dms_documents.owning_company_id = {entity_id} ({entity_name})`

### 6.2 Stage 1B — DMS Document Basic Fields

**Target:** `dms_documents` (text/date fields)

| Field | DB Column | Type | Source | Permission Required | Normalizer |
|-------|-----------|------|--------|---------------------|------------|
| Document Title | `title` | TEXT | AI extraction (`suggested_title`) | `dms.documents.edit` | Trim, max 200 chars |
| Description | `description` | TEXT | AI extraction (`suggested_description`) | `dms.documents.edit` | Trim, max 500 chars |
| Document Number | `document_no` | TEXT | AI extraction / validation finding | `dms.documents.edit` | Trim |
| Issue Date | `issue_date` | DATE | AI extraction (`issue_date_suggestion`) | `dms.documents.edit` | ISO 8601 YYYY-MM-DD |
| Expiry Date | `expiry_date` | DATE | AI extraction (`expiry_date_suggestion`) | `dms.documents.edit` | ISO 8601 YYYY-MM-DD; must be ≥ issue_date |

**Note on issue_date/expiry_date columns:** Verify actual column names from DB schema. The AI analysis action uses `issue_date_suggestion` and `expiry_date_suggestion` on the result record. The `dms_documents` table likely has `issue_date` and `expiry_date` — confirm existence before implementing.

### 6.3 Stage 1C — DMS Document Metadata Values (Phase 6/7 bridge)

**Target:** `dms_document_metadata_values`

Phase 16 does NOT reimplement the existing `applyAiAnalysisToMetadata()` logic. It re-exposes this from the Review Queue drawer via a coordinator wrapper that:
1. Calls the existing Phase 6/7 `applyAiAnalysisToMetadata()` action
2. Records the apply run in the NEW `dms_ai_erp_apply_runs` table with `target_module='dms_metadata'`
3. Updates the review queue item status

This is the **lowest-risk, highest-value** target for Phase 16 Stage 1.

### 6.4 Stage 2A — Party License Fields

**Target:** `party_licenses`

| Field | DB Column | Type | Required Permission | Normalizer | Notes |
|-------|-----------|------|---------------------|------------|-------|
| License Number | `license_number` | TEXT | `master_data.parties.manage_licenses` | Trim | |
| License Name | `license_name` | TEXT | `master_data.parties.manage_licenses` | Trim | |
| License Activity | `license_activity_text` | TEXT | `master_data.parties.manage_licenses` | Trim | |
| Issue Date | `issue_date` | DATE | `master_data.parties.manage_licenses` | ISO 8601 | |
| Expiry Date | `expiry_date` | DATE | `master_data.parties.manage_licenses` | ISO 8601; ≥ issue_date | |
| Remarks | `remarks` | TEXT | `master_data.parties.manage_licenses` | Trim, max 500 chars | |

**Record resolution:** Requires `dms_metadata_erp_mappings` configuration linking a DMS document type field to `party_licenses`. The `party_id` must be resolved from `dms_ai_entity_match_candidates` (target_entity_type='party') before applying to child license records. The specific `party_licenses.id` (target_record_id) must be confirmed by the human reviewer — the system presents all license records for the matched party and the user selects which one to update.

### 6.5 Stage 2B — Party Tax Registration Fields

**Target:** `party_tax_registrations`

| Field | DB Column | Type | Required Permission | Normalizer |
|-------|-----------|------|---------------------|------------|
| Tax Registration Number | `tax_registration_number` | TEXT | `master_data.parties.manage_tax` | Trim |
| Effective From | `effective_from` | DATE | `master_data.parties.manage_tax` | ISO 8601 |
| Effective To | `effective_to` | DATE | `master_data.parties.manage_tax` | ISO 8601; ≥ effective_from |
| Remarks | `remarks` | TEXT | `master_data.parties.manage_tax` | Trim, max 500 chars |

**Record resolution:** Same as party_licenses — party must be resolved first, then target_record_id confirmed by human.

### 6.6 Stage 2C — HR Identity Document Fields

**Target:** `employee_identity_documents`

| Field | DB Column | Type | Required Permission | Normalizer |
|-------|-----------|------|---------------------|------------|
| Document Number | `document_number` | TEXT | `hr.compliance.manage` | Trim |
| Issue Date | `issue_date` | DATE | `hr.compliance.manage` | ISO 8601 |
| Expiry Date | `expiry_date` | DATE | `hr.compliance.manage` | ISO 8601; ≥ issue_date |
| Visa File Number | `visa_file_number` | TEXT | `hr.compliance.manage` | Trim |
| UID Number | `uid_number` | TEXT | `hr.compliance.manage` | Trim |
| Labour Card Number | `labour_card_number` | TEXT | `hr.compliance.manage` | Trim |
| Work Permit Number | `work_permit_number` | TEXT | `hr.compliance.manage` | Trim |
| MOHRE Person Code | `mohre_person_code` | TEXT | `hr.compliance.manage` | Trim |
| Profession on Document | `profession_on_document` | TEXT | `hr.compliance.manage` | Trim |
| Place of Issue | `place_of_issue` | TEXT | `hr.compliance.manage` | Trim |
| Notes | `notes` | TEXT | `hr.compliance.manage` | Trim, max 500 chars |

**Record resolution:** The `employee_id` must be resolved from `dms_ai_entity_match_candidates` (target_entity_type='employee'). The specific `employee_identity_documents.id` must be selected by the human reviewer from all identity documents for that employee.

### 6.7 Stage 2D — HR Medical Insurance Fields

**Target:** `employee_medical_insurances`

| Field | DB Column | Type | Required Permission | Normalizer |
|-------|-----------|------|---------------------|------------|
| Policy Number | `policy_number` | TEXT | `hr.compliance.manage` | Trim |
| Insurance Provider | `insurance_provider` | TEXT | `hr.compliance.manage` | Trim |
| TPA | `tpa` | TEXT | `hr.compliance.manage` | Trim |
| Member ID | `member_id` | TEXT | `hr.compliance.manage` | Trim |
| Plan Name | `plan_name` | TEXT | `hr.compliance.manage` | Trim |
| Plan Class | `plan_class` | TEXT | `hr.compliance.manage` | Trim |
| Effective Date | `effective_date` | DATE | `hr.compliance.manage` | ISO 8601 |
| Expiry Date | `expiry_date` | DATE | `hr.compliance.manage` | ISO 8601; ≥ effective_date |

**Record resolution:** Same as identity documents — employee_id from entity match candidate, specific insurance record selected by human.

### 6.8 Fields NOT in Phase 16 allowlist (must be blocked)

The following party fields from the planning prompt require DB column verification before inclusion. They are **tentatively excluded** from Phase 16 until verified:
- `parties.display_name`, `parties.legal_name_en`, `parties.legal_name_ar`, `parties.trade_name_en`, `parties.trade_name_ar` — direct party profile updates are high-risk; excluded from Phase 16, defer to Phase 17
- `parties.email`, `parties.phone` — excluded; party contact changes should go through Party Master UI
- `parties.tax_registration_number` — `party_tax_registrations.tax_registration_number` is the correct path (child table)

These may be reconsidered in Phase 17 after Phase 16 ERP apply is proven safe.

---

## 7. Forbidden Targets

The following targets must be explicitly blocked at the allowlist registry level. Any attempt to apply to these must fail with a `forbidden_target` error even if somehow passed through the UI:

```
payroll amounts (employee_payroll_records.*)
salary components (employee_salary_components.*)
salary revisions (employee_salary_revisions.*)
basic salary fields (employees.basic_salary, employees.total_salary)
payroll holds (employee_payroll_holds.*)
EOS financial calculations (employee_eos_calculations.*)
IBAN / bank account numbers (party_bank_details.iban, account_number)
facility limits (party_bank_details.facility_limit)
disciplinary narrative fields (employee_disciplinary_actions.description, narrative)
medical diagnosis fields (employee_medical_insurances.diagnosis*, coverage_details)
passwords / auth fields (user_profiles.*, auth.users.*)
user roles/permissions (user_roles.*, user_role_assignments.*, user_role_permissions.*)
audit logs (audit_logs.*)
AI usage logs (erp_ai_usage_logs.*)
feature flags (erp_ai_feature_flags.*)
numbering sequences (erp_numbering_sequences.*)
storage paths (dms_documents.storage_path, dms_document_files.storage_path)
file paths (dms_document_files.*)
raw OCR text (dms_document_files.ocr_text, dms_document_content.content_text)
semantic chunk text (dms_document_chunks.chunk_text)
vector embeddings (dms_document_chunks.embedding)
AI extraction fields (dms_ai_extraction_results.extracted_fields_json, raw_response_json)
```

Forbidden targets must be blocked server-side regardless of feature flag state.

---

## 8. Apply Proposal Data Model

### 8.1 New table: `dms_ai_erp_apply_runs`

**Purpose:** One row per human-confirmed ERP Apply-to-ERP operation. Separate from `dms_ai_metadata_apply_runs` (Phase 7, DMS metadata only).

```sql
CREATE TABLE IF NOT EXISTS public.dms_ai_erp_apply_runs (
  id                      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_code                TEXT,             -- e.g. ERPAPPLY-{id}
  source_type             TEXT NOT NULL,    -- 'extraction_result' | 'validation_finding' | 'entity_match_candidate' | 'erp_mapping_preview'
  source_id               BIGINT,
  document_id             BIGINT REFERENCES public.dms_documents(id) ON DELETE CASCADE,
  review_queue_item_id    BIGINT REFERENCES public.dms_review_queue(id) ON DELETE SET NULL,
  status                  TEXT NOT NULL DEFAULT 'pending',
                          -- 'pending' | 'confirmed' | 'in_progress' | 'completed'
                          -- | 'completed_with_warnings' | 'failed' | 'cancelled'
  target_module           TEXT NOT NULL,    -- 'dms_document' | 'dms_metadata' | 'hr' | 'party'
  target_table            TEXT NOT NULL,
  target_record_id        BIGINT,
  requested_by            BIGINT NOT NULL REFERENCES public.user_profiles(id) ON DELETE RESTRICT,
  confirmed_by            BIGINT REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  started_at              TIMESTAMPTZ,
  completed_at            TIMESTAMPTZ,
  failed_at               TIMESTAMPTZ,
  cancelled_at            TIMESTAMPTZ,
  error_message           TEXT,             -- safe, max 500 chars, no raw content
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at              TIMESTAMPTZ
);
```

**Status flow:**
```
pending → confirmed (after dialog) → in_progress → completed / completed_with_warnings / failed / cancelled
```

**Indexes needed:**
```sql
idx_dms_ai_erp_apply_runs_document_id  ON (document_id)
idx_dms_ai_erp_apply_runs_status       ON (status, created_at DESC)
idx_dms_ai_erp_apply_runs_requested_by ON (requested_by)
idx_dms_ai_erp_apply_runs_source       ON (source_type, source_id)
idx_dms_ai_erp_apply_runs_target       ON (target_module, target_table, target_record_id)
idx_dms_ai_erp_apply_runs_queue        ON (review_queue_item_id)
```

### 8.2 New table: `dms_ai_erp_apply_items`

**Purpose:** One row per field-level proposed/applied/skipped/failed item within an apply run.

```sql
CREATE TABLE IF NOT EXISTS public.dms_ai_erp_apply_items (
  id                      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  apply_run_id            BIGINT NOT NULL REFERENCES public.dms_ai_erp_apply_runs(id) ON DELETE CASCADE,
  source_type             TEXT NOT NULL,
  source_id               BIGINT,
  source_field_code       TEXT,
  target_table            TEXT NOT NULL,
  target_field            TEXT NOT NULL,
  target_record_id        BIGINT,
  target_display_label    TEXT,
  current_value_summary   TEXT,             -- max 200 chars, never raw OCR
  proposed_value_summary  TEXT,             -- max 200 chars
  applied_value_summary   TEXT,             -- max 200 chars
  value_type              TEXT,             -- 'text' | 'date' | 'number' | 'boolean'
  confidence              NUMERIC(5,4),
  status                  TEXT NOT NULL DEFAULT 'proposed',
                          -- 'proposed' | 'applied' | 'skipped' | 'conflict' | 'failed' | 'forbidden'
  skip_reason             TEXT,             -- max 200 chars
  failure_reason          TEXT,             -- max 200 chars
  requires_confirmation   BOOLEAN NOT NULL DEFAULT TRUE,
  confirmed               BOOLEAN NOT NULL DEFAULT FALSE,
  applied_at              TIMESTAMPTZ,
  applied_by              BIGINT REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Indexes needed:**
```sql
idx_dms_ai_erp_apply_items_run_id      ON (apply_run_id)
idx_dms_ai_erp_apply_items_target      ON (target_table, target_field, target_record_id)
idx_dms_ai_erp_apply_items_status      ON (status)
```

### 8.3 Design principles for new tables

- **BIGINT PKs and FKs only** — no UUIDs
- **No raw content columns** — no ocr_text, content_text, chunk_text, raw_response, prompt
- **Value summaries max 200 chars** — enforced at application layer
- **Error messages max 500 chars** — sanitized before storage
- **Soft-delete only** on apply runs if needed — no physical DELETE
- **No DELETE RLS policies** — runs are append-only history

### 8.4 What NOT to store in new tables

```
raw OCR text
AI prompt text
full AI response JSON
IBAN or salary amounts
medical diagnosis text
full document content
embedding vectors
```

---

## 9. Apply Engine Architecture

### 9.1 New library files

```
src/lib/dms/apply-to-erp/types.ts
src/lib/dms/apply-to-erp/apply-target-registry.ts
src/lib/dms/apply-to-erp/apply-source-resolver.ts
src/lib/dms/apply-to-erp/apply-value-normalizer.ts
src/lib/dms/apply-to-erp/apply-conflict-detector.ts
src/lib/dms/apply-to-erp/apply-engine.ts
src/lib/dms/apply-to-erp/apply-audit.ts
src/lib/dms/apply-to-erp/index.ts
```

### 9.2 File responsibilities

**`types.ts`**
- `ApplySourceType` — `'extraction_result' | 'validation_finding' | 'entity_match_candidate' | 'erp_mapping_preview'`
- `ApplyTargetModule` — `'dms_document' | 'dms_metadata' | 'hr' | 'party'`
- `ApplyItemStatus` — `'proposed' | 'applied' | 'skipped' | 'conflict' | 'failed' | 'forbidden'`
- `ApplyRunInput`, `ApplyItemProposal`, `ApplyRunResult`, `ApplyItemResult`
- `ApplyConflict` — describes why an item was blocked

**`apply-target-registry.ts`**
- Imports and extends `ERP_MAPPING_TARGET_REGISTRY` from Phase 8
- Adds DMS document targets (`dms_document_entity_links`, `dms_document_basic_fields`)
- Exports `APPLY_TARGET_REGISTRY` with full allowlist
- Exports `validateApplyTarget(module, table, field)` — returns `{valid, reason, config, fieldMeta}`
- Exports `isForbiddenTarget(table, field)` — returns true for forbidden list
- Exports `getTargetPermissions(module, table)` — returns `{dmsPermission, targetPermission}`

**`apply-source-resolver.ts`**
- `resolveExtractionResultProposals(resultId, documentId)` — reads extraction result, maps fields to allowlisted targets via `dms_metadata_erp_mappings`, returns `ApplyItemProposal[]`
- `resolveValidationFindingProposals(findingId, documentId)` — reads finding, returns DMS metadata proposals
- `resolveEntityMatchProposals(candidateId, documentId)` — reads accepted candidate, returns dms_document FK proposals
- `resolveErpMappingProposals(mappingConfigId, documentId, resultId)` — reads mapping config + result, returns ERP HR/party proposals

**`apply-value-normalizer.ts`**
- `normalizeApplyValue(rawValue, valueType, targetTable, targetField)` — normalizes, validates type, applies constraints (e.g., date ≥ date)
- `buildValueSummary(value, valueType)` — max 200 chars, never raw content
- Reuses `convertAiValueForFieldType` from Phase 6 for type conversion

**`apply-conflict-detector.ts`**
- `detectConflict(supabase, targetTable, targetRecordId, targetField, proposedValue, lastSeenAt)` — reloads current value, compares, returns conflict reason or null
- Handles: record deleted, field changed since preview, RLS denies
- `detectEntityLinkConflict(supabase, documentId, field, proposedEntityId)` — specific to FK fields

**`apply-engine.ts`**
- `createApplyRun(input)` — creates apply run record + proposed items, does NOT write target records
- `executeApplyRun(runId, confirmedItemIds, confirmedBy)` — writes target records for selected confirmed items
  - For each item: reload target record, run conflict detector, call target-specific writer, record result
  - Partial apply allowed — safe items apply, conflict items skip
  - Returns `ApplyRunResult` with full item statuses
- `cancelApplyRun(runId, cancelledBy)` — marks run cancelled, items not applied

**`apply-audit.ts`**
- `writeApplyAuditEntry(event, applyRunId, applyItemId, context)` — wraps `logAudit()` from `src/server/actions/audit.ts`
- `writeDocumentEvent(documentId, event, userId, meta)` — wraps the existing helper
- Audit event codes: `dms_apply_to_erp_preview_created`, `dms_apply_to_erp_run_created`, `dms_apply_to_erp_item_applied`, `dms_apply_to_erp_item_skipped`, `dms_apply_to_erp_item_conflict`, `dms_apply_to_erp_run_completed`, `dms_apply_to_erp_run_cancelled`

**`index.ts`**
- Re-exports public API: registry, engine functions, types

### 9.3 Target-specific writers (inside `apply-engine.ts` or separate private helpers)

Each writer uses the appropriate Supabase client pattern:
- **DMS document fields**: `supabase.from('dms_documents').update({field: value}).eq('id', docId)` — uses user client for RLS enforcement
- **DMS metadata values**: calls existing `applyAiAnalysisToMetadata()` action (not duplicated)
- **HR compliance records**: `supabase.from('employee_identity_documents').update({field: value}).eq('id', recordId).eq('employee_id', employeeId)` — double-check FK guard
- **Party records**: `supabase.from('party_licenses').update({field: value}).eq('id', recordId).eq('party_id', partyId)` — double-check FK guard

Writers must:
1. Re-read current record immediately before update (conflict detection)
2. Use `updated_at` optimistic concurrency where available
3. Return before/after summaries for audit

### 9.4 New server actions file

```
src/server/actions/dms/apply-to-erp.ts
```

Actions:
```typescript
getDmsApplyToErpPreview(sourceType, sourceId, documentId)
  → ApplyItemProposal[]   // read-only; no target record writes

createDmsApplyToErpRun(input: CreateApplyRunInput)
  → { run_id, items }     // creates run + items records; no target writes

applyDmsApplyToErpRun(runId, confirmedItemIds, confirmation)
  → ApplyRunResult        // executes writes for selected/confirmed items

getDmsApplyToErpRun(id)
  → DmsErpApplyRun        // read-only; includes items

listDmsApplyToErpRuns(filters)
  → DmsErpApplyRun[]      // paginated

cancelDmsApplyToErpRun(runId)
  → { cancelled: boolean }
```

**Apply rule:**
- `getDmsApplyToErpPreview` → read-only, no writes, only resolves proposals
- `createDmsApplyToErpRun` → stores proposed items, no target record writes
- `applyDmsApplyToErpRun` → only writes when `confirmedItemIds` explicitly listed + confirmation dialog flags present
- All actions check: feature flag, DMS apply permission, target module permission, field allowlist
- Server reloads target record immediately before each item write

---

## 10. Review Queue Integration

### 10.1 Review Queue Drawer — Apply-to-ERP Panel

The DMS Review Queue item drawer (`src/features/dms/review-queue/dms-review-queue-item-drawer.tsx`) gains a new **Apply-to-ERP** section for eligible review types:

| Review Type | Apply Eligible | Apply Source |
|-------------|---------------|--------------|
| `ai_analysis_metadata_review` | YES (Stage 1C) | `extraction_result` via Phase 6/7 engine |
| `ai_value_conflict` | YES (Stage 1C) | `validation_finding` → metadata apply |
| `entity_owner_match` | YES (Stage 1A) | `entity_match_candidate` → document FK |
| `entity_party_match` | YES (Stage 1A) | `entity_match_candidate` → document FK |
| `entity_employee_match` | Stage 2C only | `entity_match_candidate` → HR identity doc |
| `validation_expiry_issue` | YES (Stage 1B) | `validation_finding` → document date field |
| `validation_data_conflict` | Stage 2+ only | `erp_mapping_preview` → ERP HR/party |

### 10.2 New resolution codes for `dms_review_queue.status`

The Phase 13 migration already defines resolution_code as a free-text column. Phase 16 adds these application-layer resolution codes:

```
applied_to_erp            — all proposed items applied successfully
partially_applied_to_erp  — some items applied, some skipped/conflict
apply_conflict            — no items applied; all blocked by conflict
apply_cancelled           — user cancelled the apply run
```

**Rule:** Review queue item status must NOT be set to `resolved` until apply run reaches `completed`, `completed_with_warnings`, or `failed`.

### 10.3 Pre-conditions for Apply-to-ERP button in Review Queue

All must be true:
1. Feature flag `DMS_AI_APPLY_TO_ERP` = true
2. User has `dms.apply_to_erp.run` permission
3. Review queue item is in `open` or `in_review` status (not `resolved` / `dismissed`)
4. Source item (finding/candidate) is in applicable status
5. Target module feature flag is also true (e.g., `DMS_AI_APPLY_TO_ERP_DMS_METADATA`, `DMS_AI_APPLY_TO_ERP_PARTY`)

### 10.4 Apply flow from Review Queue

```
1. User opens Review Queue item drawer
2. System shows Apply-to-ERP Preview panel (read-only)
3. Preview shows: source AI data, target field, current value, proposed value, confidence badge
4. User selects which items to apply (checkbox per field)
5. User clicks "Apply Selected" → confirmation dialog opens
6. User reads warning + confirms → createDmsApplyToErpRun() called
7. Confirmation dialog closes, run status shown
8. User clicks "Confirm Apply" → applyDmsApplyToErpRun() called
9. Results shown: applied/skipped/conflict per item
10. Review queue item updated with resolution code
```

---

## 11. UI / UX Plan

### 11.1 New UI components

```
src/features/dms/apply-to-erp/dms-apply-to-erp-preview.tsx
src/features/dms/apply-to-erp/dms-apply-to-erp-confirm-dialog.tsx
src/features/dms/apply-to-erp/dms-apply-to-erp-item-table.tsx
src/features/dms/apply-to-erp/dms-apply-to-erp-run-history.tsx
src/features/dms/apply-to-erp/dms-apply-status-badge.tsx
```

### 11.2 UI locations

1. **DMS Review Queue item drawer** — primary entry point; shows Preview panel and Apply button for eligible queue items
2. **DMS Document AI Analysis tab** — secondary entry point; shows Apply-to-ERP option after analysis results are reviewed
3. **DMS Document ERP Mapping Preview panel** — shows current ERP mapping preview with Apply button (when feature flag enabled)
4. **DMS Document Apply History section** — shows all `dms_ai_erp_apply_runs` for this document, with per-item status

### 11.3 `dms-apply-to-erp-preview.tsx`

Displays before Apply confirmation:
- Source document (title, number, type)
- Source AI result/finding/candidate (linked)
- Target record (table, record label, FK path)
- Per-field table:
  - Field name (human label)
  - Current value (gray if empty)
  - Proposed value (highlighted)
  - Confidence badge (high/medium/low)
  - Risk badge (conflict if current ≠ empty)
  - Checkbox (checked by default for non-conflict fields)
- Human responsibility warning banner

### 11.4 `dms-apply-to-erp-confirm-dialog.tsx`

Uses `ERPChildDialogForm` (standard child dialog pattern). Shows:
- Warning: "You are about to write AI-suggested values to ERP records. This action creates a permanent audit entry."
- Summary of selected fields
- Confirmation checkbox: "I have reviewed each selected field and confirm they are correct"
- Permission display: which permissions are being exercised
- Submit: "Apply to ERP" (primary, destructive variant)
- Cancel: "Cancel" (outline)

### 11.5 `dms-apply-to-erp-item-table.tsx`

Table showing all items in an apply run:
- Field | Current Value | Proposed Value | Confidence | Status badge | Applied At
- Status badges: Applied (green), Skipped (gray), Conflict (red), Failed (red), Forbidden (red)

### 11.6 `dms-apply-to-erp-run-history.tsx`

Collapsible history section per document showing past apply runs:
- Run date, applied by, status, applied count / skipped count
- Expandable: shows item table for each run

### 11.7 `dms-apply-status-badge.tsx`

Small status badge component reused across all apply UI surfaces.

### 11.8 Forbidden UI elements

The following UI patterns must NOT be implemented:
```
"Apply All" button without field-level review
Auto Apply on confidence threshold
"Accept and Apply" in a single click
"Merge" action
"Create Party Automatically"
"Link Automatically"
"Delete Source Document"
Any action that bypasses the confirmation dialog
```

---

## 12. Permission Model

### 12.1 New DMS Apply-to-ERP permissions

| Permission Code | Scope |
|----------------|-------|
| `dms.apply_to_erp.view` | View apply history and preview |
| `dms.apply_to_erp.preview` | Run preview (no target writes) |
| `dms.apply_to_erp.run` | Create and execute apply runs |
| `dms.apply_to_erp.admin` | Cancel other users' runs; view all run history |

### 12.2 Target module permissions (must ALSO be present)

| Target | Required Permission |
|--------|---------------------|
| `dms_documents` (FK + basic fields) | `dms.documents.edit` |
| `dms_document_metadata_values` | `dms.documents.edit` or `dms.documents.review_ai` |
| `party_licenses` | `master_data.parties.manage_licenses` |
| `party_tax_registrations` | `master_data.parties.manage_tax` |
| `employee_identity_documents` | `hr.compliance.manage` |
| `employee_medical_insurances` | `hr.compliance.manage` |

### 12.3 Dual permission requirement

**Apply requires BOTH:**
1. DMS apply permission (`dms.apply_to_erp.run`)
2. Target module mutation permission (from table above)

If either is missing:
- Preview still shows the field (with locked icon)
- Apply button for that item is disabled with tooltip "Insufficient permissions for [target module]"
- Other items with valid permissions can still be applied

### 12.4 Permission seeding in migration

New permissions must be seeded in the Phase 16 migration and granted to `system_admin` and `group_admin` roles by default. Users with `dms.admin` role are implicitly granted `dms.apply_to_erp.run` but still need the target module permission.

---

## 13. Feature Flags and Rollout Plan

### 13.1 New feature flags

All default to `false` (disabled until operator enables):

| Flag Code | Description | Rollout Stage |
|-----------|-------------|---------------|
| `DMS_AI_APPLY_TO_ERP` | Master gate — controls all Phase 16 apply UI | Stage 1 |
| `DMS_AI_APPLY_TO_ERP_DMS_METADATA` | DMS document metadata values write-back | Stage 1 (first to enable) |
| `DMS_AI_APPLY_TO_ERP_ENTITY_LINKS` | DMS document FK fields (owning_company_id, party_id, etc.) | Stage 1 |
| `DMS_AI_APPLY_TO_ERP_PARTY` | Party license and tax registration fields | Stage 2 |
| `DMS_AI_APPLY_TO_ERP_HR` | HR compliance record fields | Stage 2 |

### 13.2 Recommended rollout sequence

```
Step 1: Enable DMS_AI_APPLY_TO_ERP (master)
        → Apply-to-ERP UI visible but all sub-flags still off
        → Preview panels appear; Apply buttons show "not enabled"

Step 2: Enable DMS_AI_APPLY_TO_ERP_DMS_METADATA
        → DMS metadata value apply becomes live
        → Monitor audit log for 1-2 weeks

Step 3: Enable DMS_AI_APPLY_TO_ERP_ENTITY_LINKS
        → Document FK field apply becomes live
        → Monitor for incorrect party/company linking

Step 4: Enable DMS_AI_APPLY_TO_ERP_PARTY
        → Party license/tax apply becomes live
        → Requires operator confirmation; higher risk

Step 5: Enable DMS_AI_APPLY_TO_ERP_HR
        → HR compliance apply becomes live
        → Highest risk; requires HR admin sign-off
```

### 13.3 Flag check behavior

Each flag is checked server-side on every action call. If a flag is disabled after preview was shown:
- `applyDmsApplyToErpRun` → returns `feature_flag_disabled` error for affected items
- Affected items receive status `failed` with `failure_reason = 'feature_flag_disabled'`
- Other items (different target module) can still apply if their flag is enabled

---

## 14. Audit and History Plan

### 14.1 Audit event codes

| Event Code | When Fired |
|------------|-----------|
| `dms_apply_to_erp_preview_created` | When user opens Apply-to-ERP preview (optional, lightweight) |
| `dms_apply_to_erp_run_created` | When `createDmsApplyToErpRun()` is called |
| `dms_apply_to_erp_item_applied` | For each successfully applied item |
| `dms_apply_to_erp_item_skipped` | For each skipped item (fill_missing_only mode) |
| `dms_apply_to_erp_item_conflict` | For each conflicting item blocked |
| `dms_apply_to_erp_run_completed` | When run reaches completed/completed_with_warnings |
| `dms_apply_to_erp_run_cancelled` | When run is cancelled |

### 14.2 Audit log entry structure (per item applied)

Safe fields to include in `new_values` JSON:
```json
{
  "event": "dms_apply_to_erp_item_applied",
  "apply_run_id": 123,
  "apply_item_id": 456,
  "source_type": "entity_match_candidate",
  "source_id": 789,
  "target_module": "party",
  "target_table": "party_licenses",
  "target_field": "expiry_date",
  "target_record_id": 42,
  "before_summary": "2024-03-01",
  "after_summary": "2025-03-01",
  "confidence": 0.92,
  "confirmed_by": 7
}
```

### 14.3 What must NOT be in audit log entries

```
raw_ocr_text
raw_ai_response
prompt_text
full_extracted_fields_json
embedding vectors
IBAN / bank account numbers
salary amounts
medical diagnosis text
```

### 14.4 Review queue audit trail

The `dms_review_queue` item must be updated with:
- `resolution_code` (one of the new codes above)
- `resolved_by` and `resolved_at`
- Only after apply run reaches a terminal status

---

## 15. Conflict Detection and Server Revalidation

### 15.1 Conflict cases and behaviors

| Conflict Case | Detection Method | Behavior |
|---------------|-----------------|----------|
| Target record deleted | Re-read returns null | Skip item, status = `conflict`, reason = `target_record_not_found` |
| Target field changed since preview | Re-read current value ≠ preview current_value_summary | Skip item, status = `conflict`, reason = `target_field_changed` |
| Target record RLS denies access | Supabase returns error/null on re-read | Skip item, status = `conflict`, reason = `access_denied` |
| Source item status changed (dismissed/superseded) | Re-read source status before apply | Skip item, status = `conflict`, reason = `source_dismissed` |
| Review queue item already resolved | Re-read queue item status | Skip apply, return error `queue_item_already_resolved` |
| Feature flag disabled after preview | Check flag before each item | Skip item, status = `failed`, reason = `feature_flag_disabled` |
| Field not in allowlist (registry check) | `validateApplyTarget()` fails | Skip item, status = `forbidden` |
| Value fails normalizer/validator | `normalizeApplyValue()` returns error | Skip item, status = `failed`, reason = validation error |
| Date ordering constraint violated | Normalizer cross-field check | Skip item, status = `failed`, reason = `date_order_violation` |

### 15.2 Partial apply behavior

- Safe items apply even when other items conflict
- At least 1 item must succeed for run to reach `completed_with_warnings`
- If ALL items conflict/fail → run status = `failed`
- Successful items in a partial run are permanent (no auto-rollback)

### 15.3 Optimistic concurrency for date-stamped records

For records with `updated_at`:
- Preview captures `updated_at` from the current record
- Apply re-reads and compares `updated_at`
- If `updated_at` has advanced → conflict

For records without `updated_at`:
- Apply re-reads and compares current field value against `current_value_summary`
- If different → conflict

---

## 16. Rollback / Correction Strategy

### 16.1 No automatic rollback

Phase 16 does **NOT** implement automatic rollback. Once a write is made to an ERP record, it is permanent unless the user manually corrects it through the normal ERP UI.

### 16.2 Before/After audit trail enables manual reversal

Every applied item stores:
- `current_value_summary` — what the value was before apply
- `applied_value_summary` — what was written
- `target_table`, `target_field`, `target_record_id` — precisely what was changed
- `apply_run_id`, `apply_item_id` — traceable to the full run history
- `confirmed_by`, `applied_at` — who applied and when

This allows a user or admin to find the original value and manually restore it via the ERP form.

### 16.3 Future phase reversal (Phase 17+)

A future phase may add a "Propose Reversal" feature that pre-fills an ERP form with the before-value for the user to review and save. This is explicitly NOT in Phase 16 scope.

### 16.4 Partial apply — no compensation

If a run partially fails:
- Successful items remain applied
- Failed items are NOT reversed
- Run status = `completed_with_warnings`
- UI shows the conflict report clearly
- User must manually review failed items

---

## 17. Data Safety and Privacy Plan

### 17.1 Content stored in apply tables

```
ALLOWED (summaries only):
  current_value_summary     max 200 chars
  proposed_value_summary    max 200 chars
  applied_value_summary     max 200 chars
  skip_reason               max 200 chars
  failure_reason            max 200 chars
  error_message             max 500 chars
  target_display_label      max 200 chars

FORBIDDEN (must never appear):
  raw OCR text
  raw AI response JSON
  prompt text
  full extracted_fields_json
  embedding vectors
  IBAN numbers
  salary amounts
  medical diagnosis content
```

### 17.2 Sensitive field blocking

The `isForbiddenTarget(table, field)` function in `apply-target-registry.ts` must block:
- Any `*salary*`, `*payroll*`, `*iban*`, `*account_number*`, `*secret*`, `*password*`, `*key*` field patterns
- The explicit forbidden table list from Section 7
- Any field not present in the explicit allowlist

### 17.3 Audit log redaction

The `apply-audit.ts` module must use the existing `buildSafeMetadata()` function from `src/lib/ai/observability/safe-usage-redaction.ts` before writing audit values. This ensures that if a proposed value accidentally contains a sensitive key name, it is stripped before storage.

### 17.4 Value summary masking for sensitive-adjacent fields

For fields that may carry semi-sensitive data (document numbers, TRN, UID numbers):
- Show first 4 and last 4 characters in summary, mask middle: `A123****5678`
- This applies to `document_number`, `uid_number`, `tax_registration_number`

---

## 18. Migration Plan

### 18.1 Migration file

```
supabase/migrations/20260629000000_erp_dms_ai_phase16_human_reviewed_apply_to_erp.sql
```

### 18.2 Migration sections

```sql
-- SECTION 1: Create dms_ai_erp_apply_runs
-- SECTION 2: Create dms_ai_erp_apply_items
-- SECTION 3: Indexes
-- SECTION 4: RLS — ENABLE + FORCE on both tables
-- SECTION 5: RLS policies (SELECT, INSERT, UPDATE — no DELETE)
-- SECTION 6: Seed feature flags (5 new flags, default false)
-- SECTION 7: Seed permissions (4 new dms.apply_to_erp.* codes)
-- SECTION 8: Grant permissions to system_admin and group_admin
-- SECTION 9: Seed comments on new tables/columns
```

### 18.3 Migration safety rules

- **BIGINT PKs and FKs only** — no UUIDs
- **No raw content columns** — no ocr_text, content_text, chunk_text, raw_response_json, prompt
- **No broad RLS policies** — no `USING (true)`, no anon access
- **No DELETE policies** — runs and items are append-only history (soft-delete via deleted_at on runs only)
- **Idempotent** — `IF NOT EXISTS`, `ON CONFLICT DO NOTHING` throughout
- **Feature flags default false**
- **Additive only** — no existing tables, columns, or policies removed

### 18.4 RLS policy design for new tables

Pattern: same as Phase 7 `dms_ai_metadata_apply_runs` policies. SELECT: `dms.apply_to_erp.view` or `dms.documents.view` or system/group admin. INSERT/UPDATE: `dms.apply_to_erp.run` or system/group admin. No DELETE policy.

Server-side writes use `createAdminClient()` (bypasses RLS). User-facing reads use the user client (RLS enforced).

---

## 19. Server Action Plan

### 19.1 New server actions file

```
src/server/actions/dms/apply-to-erp.ts
```

### 19.2 Action signatures and responsibilities

```typescript
// Preview: resolves proposals from source. No writes. Permission check: dms.apply_to_erp.preview
getDmsApplyToErpPreview(input: {
  sourceType: ApplySourceType;
  sourceId: number;
  documentId: number;
}): Promise<ActionResult<ApplyItemProposal[]>>

// Create run: stores proposed items + run record. No target record writes.
// Permission: dms.apply_to_erp.run
createDmsApplyToErpRun(input: {
  sourceType: ApplySourceType;
  sourceId: number;
  documentId: number;
  reviewQueueItemId?: number;
  targetModule: ApplyTargetModule;
  targetTable: string;
  targetRecordId: number;
  selectedItems: Array<{ sourceFieldCode: string; targetField: string; }>;
}): Promise<ActionResult<{ runId: number; items: ApplyItemProposal[] }>>

// Execute: writes target records for confirmed items.
// Permission: dms.apply_to_erp.run + target module permission
// Requires: explicit confirmedItemIds list + confirmation flags
applyDmsApplyToErpRun(input: {
  runId: number;
  confirmedItemIds: number[];
  confirmation: {
    replaceExistingConfirmed: boolean;
    humanReviewConfirmed: boolean;  // new — explicit human review
  };
}): Promise<ActionResult<ApplyRunResult>>

// Read run with items
getDmsApplyToErpRun(runId: number): Promise<ActionResult<DmsErpApplyRun>>

// List with filters
listDmsApplyToErpRuns(filters: {
  documentId?: number;
  targetModule?: string;
  status?: string;
  requestedBy?: number;
  limit?: number;
  offset?: number;
}): Promise<ActionResult<{ runs: DmsErpApplyRun[]; total: number }>>

// Cancel (own runs) or any run (admin)
cancelDmsApplyToErpRun(runId: number): Promise<ActionResult<{ cancelled: boolean }>>
```

### 19.3 Zod validation requirements

Every action input must be validated with Zod:
- `runId` must be positive integer
- `confirmedItemIds` must be non-empty array of positive integers
- `targetTable` must be in `APPLY_TARGET_REGISTRY` (string enum)
- `targetField` must be in the allowlisted fields for `targetTable`
- `sourceType` must be valid enum value

### 19.4 Error response codes

All server actions must return typed error codes (not just string messages):
```typescript
type ApplyErrorCode =
  | 'not_authenticated'
  | 'permission_denied'
  | 'feature_flag_disabled'
  | 'invalid_input'
  | 'run_not_found'
  | 'run_not_in_pending_state'
  | 'source_not_found'
  | 'source_dismissed'
  | 'target_forbidden'
  | 'target_not_allowlisted'
  | 'target_record_not_found'
  | 'target_field_conflict'
  | 'no_items_applied';
```

---

## 20. Test and UAT Plan

### 20.1 Unit tests (Vitest)

```
src/lib/dms/apply-to-erp/__tests__/apply-target-registry.test.ts
  - validateApplyTarget returns valid for all allowlisted targets
  - validateApplyTarget returns invalid for forbidden targets
  - isForbiddenTarget blocks payroll, salary, IBAN, password fields
  - listAllowedTargets returns correct count

src/lib/dms/apply-to-erp/__tests__/apply-value-normalizer.test.ts
  - normalizeApplyValue converts dates to ISO 8601
  - normalizeApplyValue rejects expiry_date < issue_date
  - buildValueSummary truncates to 200 chars
  - normalizeApplyValue strips raw content patterns

src/lib/dms/apply-to-erp/__tests__/apply-conflict-detector.test.ts
  - detectConflict returns conflict when record deleted
  - detectConflict returns null when value unchanged
  - detectConflict returns conflict when value changed
```

### 20.2 Positive UAT scenarios

```
F01: Feature flag off → Apply-to-ERP UI not visible
F02: Feature flag DMS_AI_APPLY_TO_ERP on → master UI visible; sub-flags still off
F03: Enable DMS_AI_APPLY_TO_ERP_DMS_METADATA → metadata apply button appears
F04: Preview extraction result → proposals shown, no target record written
F05: Create apply run → run record created, items created, no target write
F06: Apply selected DMS metadata item → metadata value updated, audit log created, apply run completed
F07: Apply dms_documents.party_id from accepted entity match candidate → FK updated, run history recorded
F08: Apply party_licenses.expiry_date → field updated, audit entry created
F09: Apply run history visible in Document AI tab
F10: Review queue item resolved with resolution_code after apply completes
```

### 20.3 Negative (security/safety) UAT scenarios

```
N01: Try applying a payroll field → server returns target_forbidden error
N02: Try applying with only DMS permission but missing hr.compliance.manage → item locked, disabled
N03: Try applying after review queue item dismissed → source_dismissed error
N04: Try applying stale preview (target value changed) → target_field_conflict, item skipped
N05: Try applying when DMS_AI_APPLY_TO_ERP_HR flag is disabled → feature_flag_disabled error
N06: Try auto-applying (no confirmed_item_ids) → validation error, no writes
N07: Check audit log: no raw content in any entry
N08: Check apply items table: no raw content in any column
N09: RLS verify: anon cannot read dms_ai_erp_apply_runs or dms_ai_erp_apply_items
N10: Accepted entity match candidate without final Apply confirmation → no write occurs
```

### 20.4 Build / TypeScript / lint checks

```
npm run typecheck   → 0 errors
npm run build       → 0 errors
npm run lint        → 0 errors
npm run test        → all unit tests pass
```

### 20.5 Playwright E2E scenarios

```
E01: Log in; navigate to /dms/documents; open document with AI result; Apply-to-ERP panel not visible (flag off)
E02: Enable flag; reload; Apply-to-ERP preview panel appears
E03: Click "Apply Selected"; confirmation dialog appears
E04: Cancel dialog; no run record created
E05: Confirm apply; success toast; run history shows "completed"
E06: Navigate to Review Queue; open item; Apply-to-ERP panel visible for eligible type
```

---

## 21. Performance and Index Plan

### 21.1 Expected query patterns

```sql
-- Most common: load apply runs for a document
SELECT * FROM dms_ai_erp_apply_runs WHERE document_id = $1 ORDER BY created_at DESC LIMIT 20;
-- Index: idx_dms_ai_erp_apply_runs_document_id

-- Load items for a run
SELECT * FROM dms_ai_erp_apply_items WHERE apply_run_id = $1;
-- Index: idx_dms_ai_erp_apply_items_run_id (covering)

-- Admin: list all runs by status
SELECT * FROM dms_ai_erp_apply_runs WHERE status = 'completed' ORDER BY created_at DESC LIMIT 50;
-- Index: idx_dms_ai_erp_apply_runs_status

-- Source lookup: find all apply runs for a specific extraction result
SELECT * FROM dms_ai_erp_apply_runs WHERE source_type = 'extraction_result' AND source_id = $1;
-- Index: idx_dms_ai_erp_apply_runs_source
```

### 21.2 Expected table sizes

- `dms_ai_erp_apply_runs`: Low volume initially (one per human Apply action); expect <1000/month
- `dms_ai_erp_apply_items`: Max 10-15 items per run; expect <15,000/month at full scale
- No partitioning needed in Phase 16

### 21.3 No performance bottlenecks expected

Apply runs are infrequent human-triggered operations. No background jobs. No bulk insert patterns. All queries are simple point lookups or small-range scans.

---

## 22. Recommended Phase 16 Implementation Scope

Phase 16 is intentionally limited to the following, in order of decreasing priority and increasing risk:

### Tier 1 — Must implement (lowest risk, highest value)
1. New apply engine library (`src/lib/dms/apply-to-erp/`)
2. New server actions (`src/server/actions/dms/apply-to-erp.ts`)
3. Database migration (`dms_ai_erp_apply_runs`, `dms_ai_erp_apply_items`, feature flags, permissions)
4. Apply UI components (preview, confirm dialog, status badge, item table)
5. DMS metadata values write-back via Review Queue drawer (bridges Phase 6/7 engine)
6. DMS document entity link fields (`owning_company_id`, `owning_branch_id`, `party_id`) from accepted entity match candidates
7. DMS document basic fields (`issue_date`, `expiry_date`, `document_no`, `title`, `description`)

### Tier 2 — Implement if Tier 1 is stable
8. Party license fields write-back via ERP mapping preview
9. Party tax registration fields write-back

### Tier 3 — Implement only after Tier 2 UAT is clean
10. HR identity document fields write-back
11. HR medical insurance fields write-back

### Explicitly out of Phase 16 scope
- `parties` direct profile fields (defer to Phase 17)
- Job handler observability columns (deferred from Phase 15)
- Auto-reversal/undo functionality
- Bulk apply (apply to multiple documents at once)

---

## 23. Implementation Sequence for Future Phase 16 Execution

```
Step 0:  Read this plan, all referenced files, and Phase 15 reports
Step 1:  Verify DB schema for dms_documents FK columns (owning_company_id, party_id, etc.)
Step 2:  Create apply engine library (types.ts, apply-target-registry.ts, apply-value-normalizer.ts)
Step 3:  Create apply-conflict-detector.ts and apply-audit.ts
Step 4:  Create apply-source-resolver.ts (for extraction_result, entity_match_candidate)
Step 5:  Create apply-engine.ts (createApplyRun, executeApplyRun)
Step 6:  Create server actions file (apply-to-erp.ts) with all 6 actions
Step 7:  Write Phase 16 database migration (runs/items tables, RLS, flags, permissions)
Step 8:  Apply migration; verify RLS; verify table structure
Step 9:  Create unit tests for registry, normalizer, conflict detector
Step 10: Run unit tests (npm run test) — all must pass
Step 11: Create UI components (preview, confirm dialog, status badge, item table)
Step 12: Wire Review Queue drawer to Apply-to-ERP preview panel
Step 13: Wire DMS Document AI tab to Apply-to-ERP entry point
Step 14: Wire DMS Document Apply History section to run history component
Step 15: npm run typecheck + npm run build + npm run lint — all must pass
Step 16: Enable DMS_AI_APPLY_TO_ERP feature flag (master)
Step 17: Enable DMS_AI_APPLY_TO_ERP_DMS_METADATA — test DMS metadata apply flow
Step 18: Enable DMS_AI_APPLY_TO_ERP_ENTITY_LINKS — test document FK apply flow
Step 19: Browser UAT — run positive and negative scenarios
Step 20: SQL RLS audit (same pattern as Phase 15 security QA checks)
Step 21: Payload safety check (no raw content in apply tables)
Step 22: Enable DMS_AI_APPLY_TO_ERP_PARTY (if Tier 1 UAT clean)
Step 23: Browser UAT for party fields
Step 24: Create implementation report, update SOT documents
Step 25: Restore all flags to safe-off state if needed for staging
```

---

## 24. Acceptance Criteria for Future Implementation

| Code | Criterion |
|------|-----------|
| AC-01 | Apply-to-ERP feature flags default false in migration |
| AC-02 | Apply target registry allows only explicitly approved table/field combinations |
| AC-03 | Forbidden fields (payroll, IBAN, salary, password, audit logs) cannot be previewed or applied |
| AC-04 | `getDmsApplyToErpPreview()` creates no target record writes |
| AC-05 | `applyDmsApplyToErpRun()` requires explicit human confirmation flags and non-empty confirmedItemIds |
| AC-06 | Apply requires both `dms.apply_to_erp.run` AND target module mutation permission |
| AC-07 | Server reloads target record immediately before each item write |
| AC-08 | Stale/conflicting fields are skipped with conflict status, not overwritten |
| AC-09 | Every applied item creates an audit log entry AND an apply_items row |
| AC-10 | Review queue item is updated with resolution_code only after apply run reaches terminal status |
| AC-11 | Accepted entity match candidate (status='accepted') still requires final `applyDmsApplyToErpRun()` confirmation |
| AC-12 | No auto-create, auto-merge, auto-link, auto-delete, or auto-approve implemented anywhere |
| AC-13 | No raw OCR/content/prompt/AI response stored in `dms_ai_erp_apply_runs` or `dms_ai_erp_apply_items` |
| AC-14 | RLS enabled and forced on both new tables; no broad policies; no anon access; no DELETE policy |
| AC-15 | `npm run typecheck` + `npm run build` + `npm run test` all pass with 0 errors |

---

## 25. Risks and Mitigations

| Risk | Severity | Mitigation |
|------|----------|-----------|
| User applies AI suggestion to wrong ERP record | HIGH | Require human to select target record explicitly (not auto-resolved); show current + proposed value clearly |
| Entity match candidate accepted but entity is wrong | HIGH | Apply still requires final confirmation with "I have reviewed" checkbox; conflict detection if party_id already set |
| Date field overwrites valid expiry with AI-extracted expiry | MEDIUM | Conflict detection: if field already has value, require replaceExistingConfirmed=true |
| Party license record ID ambiguity (multiple licenses per party) | MEDIUM | User must select which license record to update; no auto-selection |
| HR compliance write with wrong employee | HIGH | Employee entity ID must be validated against entity_match_candidate; user confirms identity |
| Stale preview: target changed between preview and apply | MEDIUM | Server conflict detector re-reads record immediately before write; automatic skip |
| Feature flag disabled mid-session | LOW | Server-side flag check on every action call; clear error returned |
| Raw content leaks into apply tables via value summary | MEDIUM | buildValueSummary() truncates to 200 chars; buildSafeMetadata() strips sensitive keys from audit |
| Partial apply leaves ERP in inconsistent state | MEDIUM | Apply is field-level, not transaction-level; each field is independent; UI clearly shows what was and was not applied |
| User applies ERP mapping without entity match context | MEDIUM | ERP mapping write requires target_record_id to be confirmed by human; no auto-resolution |

---

## 26. What Must Not Be Implemented in Phase 16

The following are explicitly prohibited from Phase 16:

```
Auto-apply based on AI confidence threshold
Background apply jobs (no queue-based apply)
Auto-linking party/employee/company to a document
Auto-creating party records from AI suggestions
Auto-merging duplicate records
Auto-deleting documents or files
Auto-approving intake or review queue items
Payroll/IBAN/salary field writes
Medical diagnosis field writes
User role/permission writes
Feature flag writes via apply flow
Audit log edits
AI usage log edits
Raw prompt/response/OCR/content/chunk text storage in apply tables
One-click "Apply All" without field-level review
"Accept and Apply" in a single click from Review Queue
Any apply that bypasses the confirmation dialog
Automatic rollback/undo of previous applies
Bulk apply across multiple documents
```

---

## 27. Corrected Roadmap After Phase 16

```text
Phase 9   — Async AI Job Queue / Workflow Runner              CLOSED
Phase 10A — OCR Pipeline Upgrade / Azure OCR Wiring          CLOSED
Phase 10B — Queue-backed Admin OCR Backfill                  CLOSED
Phase 11  — Semantic Chunking and Embeddings                 CLOSED
Phase 12  — Review Queue Activation                          CLOSED
Phase 13  — Validation, Conflict Detection, Owner Matching   CLOSED / LIVE PASS
Phase 14  — Token / Cost / Observability                     CLOSED / LIVE PASS
Phase 15  — Testing, Performance, Hardening                  CLOSED / LIVE PASS
Phase 16  — Human-Reviewed Apply-to-ERP Records              NEXT / HIGH-RISK
Phase 17  — (Recommended) Party Profile Direct Apply         PLANNED
Phase 18  — (Recommended) Batch Document Review Workflow     PLANNED
Phase 19  — (Recommended) Apply Reversal Proposal            PLANNED
```

---

## 28. Recommended Next Cursor Implementation Prompt

After ChatGPT reviews and approves this plan, the implementation prompt should instruct Cursor to:

```
1. Read this plan file in full.
2. Read ERP_DMS_AI_CURRENT_SOURCE_OF_TRUTH.md and .cursor/ALGT_ERP_SOURCE_OF_TRUTH.md.
3. Read src/lib/dms/erp-mapping/erp-mapping-targets.ts (Phase 8 registry to reuse).
4. Read src/server/actions/dms/ai-analysis.ts (applyAiAnalysisToMetadata — DO NOT DUPLICATE).
5. Read supabase/migrations/20260622130000_erp_dms_ai_phase7_apply_history.sql (RLS pattern to follow).
6. Execute Steps 0-25 from the Implementation Sequence in this plan, in order.
7. Do not implement Tier 3 (HR compliance) unless Tiers 1 and 2 are clean.
8. After completing all steps, create implementation_Review/ERP_DMS_AI_PHASE_16_HUMAN_REVIEWED_APPLY_TO_ERP_IMPLEMENTATION_REPORT.md.
9. Update ERP_DMS_AI_CURRENT_SOURCE_OF_TRUTH.md and .cursor/ALGT_ERP_SOURCE_OF_TRUTH.md.
10. Restore all feature flags to false (safe-off) at end of implementation.
```

---

## 29. Final Recommendation

Phase 16 is the highest-risk DMS AI phase to date because it is the first phase that writes AI-reviewed data into ERP operational records. The plan above is designed to minimize risk through:

1. **Staged feature flag rollout** — each target module enabled independently
2. **Dual permission requirement** — both DMS and target module permissions required
3. **Explicit human confirmation dialog** — no implicit or automatic applies
4. **Server revalidation** — target record reloaded immediately before every write
5. **Field-level allowlist** — only ~40 approved fields across 6 tables
6. **Explicit forbidden list** — payroll, salary, IBAN, medical, auth, and all system fields blocked
7. **Full audit trail** — every applied item audited with before/after summaries
8. **No raw content storage** — summaries only, max 200 chars
9. **Partial apply with full reporting** — safe items apply; conflict items skip with reasons
10. **Coordination with Phase 6/7** — DMS metadata apply reuses the proven engine

The recommended implementation order is Tier 1 first (DMS document fields + DMS metadata bridge), stabilize for 1-2 weeks, then Tier 2 (party fields), then Tier 3 (HR compliance).

This plan is ready for ChatGPT review.
