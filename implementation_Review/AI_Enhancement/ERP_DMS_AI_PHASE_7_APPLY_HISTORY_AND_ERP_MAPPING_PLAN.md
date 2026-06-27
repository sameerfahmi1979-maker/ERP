# ERP DMS AI Phase 7 — Apply History and ERP Mapping Plan

**Date:** 2026-06-22  
**Phase:** ERP DMS AI Phase 7 — AI Analysis Apply History + ERP Mapping  
**Status:** Planning only — no code, migration, or schema changes made  
**Preceded by:** Phase 6 — AI Analysis Apply-to-Metadata  

---

## 1. Executive Summary

Phase 7 plans two connected capabilities built on Phase 6's `applyAiAnalysisToMetadata` workflow:

**Part A — Apply History:** Add structured `dms_ai_metadata_apply_runs` and `dms_ai_metadata_apply_items` tables so that every Phase 6 apply operation is stored as a groupable run with per-field item rows. This enables a future "Apply History" panel in the AI Analysis tab and supports per-run rollback planning. The existing `audit_logs` remain the official audit trail; the new tables are an operational read-model.

**Part B — ERP Mapping:** Plan how DMS document metadata can be mapped to ERP module records (HR employee identity documents, medical insurance, party tax registrations, party licenses). A critical discovery is that the ERP **already has** a `compliance-dms-prefill.ts` module that reads DMS document data and prefills HR compliance records — Phase 7 must build on and extend this existing foundation rather than create a parallel system.

**Recommended Phase 7 Implementation Scope:** Apply History only (Part A). ERP Mapping remains planning/design (Part B) for Phase 8 execution, because the existing `compliance-dms-prefill.ts` module needs to be understood, extended, and formally integrated with the Phase 6 apply workflow before any new mapping infrastructure is introduced.

---

## 2. Planning Scope and Non-Implementation Rule

**This document is planning only.** No source code, migrations, UI files, or server actions will be created or modified.

**What Phase 7 implementation will cover (Part A — recommended):**
- New migration: `dms_ai_metadata_apply_runs` + `dms_ai_metadata_apply_items` tables
- RLS for both new tables
- Modify `applyAiAnalysisToMetadata()` to insert run and item rows alongside existing audit logs
- New server action `getDmsAiMetadataApplyHistory()` for document-level apply history
- Apply History UI panel in the AI Analysis tab (below the diff section)

**What Phase 7 planning will document (Part B — not implemented yet):**
- ERP mapping architecture options
- Verified target table/field names from actual codebase
- Permission model per target module
- Integration strategy with existing `compliance-dms-prefill.ts`
- Safety and human-review-first rules for ERP apply

---

## 3. Files and Source-of-Truth Reviewed

| File | Status |
|------|--------|
| `ERP_DMS_AI_CURRENT_SOURCE_OF_TRUTH.md` | Read — post Phase 6 |
| `implementation_Review/ERP_DMS_AI_PHASE_6_AI_ANALYSIS_APPLY_TO_METADATA_IMPLEMENTATION_REPORT.md` | Read |
| `ERP_DMS_AI_PHASE_6_AI_ANALYSIS_APPLY_TO_METADATA_PLAN.md` | Read |
| `src/server/actions/dms/ai-analysis.ts` | Read — `applyAiAnalysisToMetadata` confirmed |
| `src/lib/dms/metadata/metadata-diff.ts` | Read |
| `src/server/actions/audit.ts` | Read — `logAudit` signature and `audit_logs` confirmed |
| `src/server/actions/hr/compliance.ts` | Read — HR compliance tables and permissions confirmed |
| `src/server/actions/hr/compliance-dms-prefill.ts` | Read — **existing DMS-to-HR prefill architecture confirmed** |
| `src/server/actions/hr/employees.ts` | Read — HR employee table fields and permissions confirmed |
| `src/server/actions/master-data/parties.ts` | Read — party permissions confirmed |

Missing files (not found, not invented):
- `ERP_DMS_AI_A_TO_Z_AUDIT_FUNCTION_MAP_AND_ENHANCEMENT_PLAN.md`
- `ERP_DMS_AI_FULL_AUDIT_AND_ENHANCEMENT_PLAN.md`
- Fleet/assets server actions — no dedicated module found; fleet/asset tables appear to be DB-READY or PLANNED

---

## 4. Phase 1–6 Output Reviewed

| Phase | Key Outputs Relevant to Phase 7 |
|-------|----------------------------------|
| Phase 1 | `dms_ai_extraction_results` — source for AI suggestions |
| Phase 2 | `dms_metadata_definitions` — no ERP mapping columns (confirmed) |
| Phase 3 | Classification confidence; no mapping columns |
| Phase 4 | `dms_approve_runs` pattern — apply run tables can follow the same BIGINT PK pattern |
| Phase 5 | `orchestration_source` columns — pattern for FK-to-run-record linkage |
| Phase 6 | `applyAiAnalysisToMetadata()` — confirmed; logs to `audit_logs` only; no apply run tables |

---

## 5. Current Phase 6 Apply-to-Metadata Architecture

### What exists

**`applyAiAnalysisToMetadata(input)`** in `src/server/actions/dms/ai-analysis.ts`:
- Validates, authenticates, checks permissions
- Loads document, AI result, definitions, current metadata
- Builds diff server-side via `buildMetadataDiff()`
- Per-selection: validates, converts, upserts to `dms_document_metadata_values`
- Logs `ai_metadata_apply_started`, `ai_metadata_field_applied` (per field), `ai_metadata_apply_completed`, `ai_metadata_apply_failed` to `audit_logs`
- Inserts one `dms_document_events` row: `ai_metadata_applied`
- Updates `dms_ai_extraction_results.ai_status = "accepted"`
- Returns `{ appliedCount, skippedCount, appliedFields, skippedFields, aiResultStatus }`

### What is missing

| Gap | Impact |
|-----|--------|
| No apply run record groups per-field rows together | Cannot show "Apply Run #3 at 14:22 — 4 fields" in UI |
| `audit_logs` queries by `entity_name = 'dms_document_metadata_values'` + event filter | Complex, no native "per run" grouping |
| No way to query "what was applied in this run" without reading multiple audit rows | Makes history UI difficult |
| `audit_logs.new_values` is JSONB with truncated summaries | Not queryable for value comparisons |
| No `apply_run_id` on `dms_document_metadata_values` | Cannot trace which run changed a value |

---

## 6. Current Audit Logging Audit

### `audit_logs` table (confirmed schema from `audit.ts`)

```typescript
{
  actor_user_profile_id: number;
  owner_company_id: number | null;
  branch_id: number | null;
  module_code: string;          // "DMS"
  entity_name: string;          // "dms_document_metadata_values"
  entity_id: number | null;
  entity_reference: string;
  action: string;                // "update"
  old_values: JSONB | null;
  new_values: JSONB | null;      // contains event name, field details
  ip_address: string | null;
  user_agent: string | null;
  created_at: TIMESTAMPTZ;
}
```

### Phase 6 audit rows created per apply

For a 4-field apply operation:
1. 1 × `ai_metadata_apply_started` row
2. 4 × `ai_metadata_field_applied` rows (per field)
3. 1 × `ai_metadata_apply_completed` row
= **6 rows** in `audit_logs`

Plus: 1 × `dms_document_events` row (`ai_metadata_applied`)

### Limitations of audit-logs-only approach

| Limitation | Impact |
|-----------|--------|
| No native "run ID" groups rows | UI must infer runs from timestamp proximity |
| `new_values` is JSONB (unindexed) | Slow to query for reporting |
| `entity_name` is `dms_document_metadata_values` (not per-run) | Cannot JOIN directly |
| Values are truncated to 100 chars | Not suitable for full value comparison |
| No `skip_reason` column | Only field_code in skipped audit |
| Shared table with all modules | Scale concerns for audit history UI |

### Conclusion

`audit_logs` alone is **insufficient** for a well-designed "Apply History" UI. Dedicated apply run tables are justified and needed for Phase 7.

---

## 7. Apply History Options Compared

| Option | Description | Verdict |
|--------|-------------|---------|
| **A** — Keep audit logs only | No new tables; query `audit_logs` | Rejected — too slow, no run grouping |
| **B** — Add apply run tables only | Replace audit with new tables | Rejected — audit_logs must remain official |
| **C (Recommended)** — Hybrid | New tables as read-model; `audit_logs` stays official | Recommended |

---

## 8. Recommended Apply History Strategy

**Recommendation: Option C — Hybrid**

- `audit_logs` remains the official, immutable audit trail (unchanged)
- `dms_ai_metadata_apply_runs` + `dms_ai_metadata_apply_items` are added as an operational read-model
- `applyAiAnalysisToMetadata()` writes to both: audit logs first (non-fatal), then apply run tables
- If apply run table write fails → non-fatal; audit log is the fallback
- Apply History UI reads from `dms_ai_metadata_apply_runs` + items

**Why this is correct:**
1. `audit_logs` is append-only and tamper-evident — correct for compliance
2. Apply run tables are structured and indexed — correct for UI queries
3. Pattern matches Phase 4's `dms_approve_runs` architecture exactly

---

## 9. Proposed Apply History Database Design

### Table: `dms_ai_metadata_apply_runs`

```sql
CREATE TABLE public.dms_ai_metadata_apply_runs (
  id                       BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  document_id              BIGINT NOT NULL REFERENCES dms_documents(id) ON DELETE CASCADE,
  ai_result_id             BIGINT REFERENCES dms_ai_extraction_results(id) ON DELETE SET NULL,
  applied_by               BIGINT NOT NULL REFERENCES user_profiles(id) ON DELETE RESTRICT,
  apply_status             TEXT NOT NULL DEFAULT 'completed',
                            -- 'completed' | 'partial' | 'failed'
  selected_count           INT NOT NULL DEFAULT 0,
  applied_count            INT NOT NULL DEFAULT 0,
  skipped_count            INT NOT NULL DEFAULT 0,
  replace_confirmed        BOOLEAN NOT NULL DEFAULT FALSE,
  low_confidence_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
  error_message            TEXT NULL,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at             TIMESTAMPTZ NULL
);

CREATE INDEX idx_dms_ai_metadata_apply_runs_document_id
  ON dms_ai_metadata_apply_runs(document_id);
CREATE INDEX idx_dms_ai_metadata_apply_runs_applied_by
  ON dms_ai_metadata_apply_runs(applied_by);
CREATE INDEX idx_dms_ai_metadata_apply_runs_created_at
  ON dms_ai_metadata_apply_runs(created_at DESC);
```

### Table: `dms_ai_metadata_apply_items`

```sql
CREATE TABLE public.dms_ai_metadata_apply_items (
  id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  apply_run_id      BIGINT NOT NULL REFERENCES dms_ai_metadata_apply_runs(id) ON DELETE CASCADE,
  document_id       BIGINT NOT NULL REFERENCES dms_documents(id) ON DELETE CASCADE,
  definition_id     BIGINT REFERENCES dms_metadata_definitions(id) ON DELETE SET NULL,
  field_code        TEXT NOT NULL,
  old_value_summary TEXT NULL,     -- max 100 chars; null means no previous value
  new_value_summary TEXT NULL,     -- max 100 chars; null means skipped
  confidence_score  NUMERIC(5,4) NULL,
  confidence_label  TEXT NULL,
  apply_mode        TEXT NULL,     -- 'fill_missing_only' | 'replace_selected'
  item_status       TEXT NOT NULL DEFAULT 'applied',
                    -- 'applied' | 'skipped' | 'blocked'
  skip_reason       TEXT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_dms_ai_metadata_apply_items_run_id
  ON dms_ai_metadata_apply_items(apply_run_id);
CREATE INDEX idx_dms_ai_metadata_apply_items_document_id
  ON dms_ai_metadata_apply_items(document_id);
CREATE INDEX idx_dms_ai_metadata_apply_items_definition_id
  ON dms_ai_metadata_apply_items(definition_id);
```

### RLS Policies (planned)

**`dms_ai_metadata_apply_runs`:**

```sql
-- SELECT: user is dms.documents.view or dms.admin or system_admin
CREATE POLICY "authorized users can view apply runs"
  ON dms_ai_metadata_apply_runs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_permission_cache
      WHERE user_id = auth.uid()
      AND permission_code IN ('dms.documents.view','dms.admin')
    )
  );

-- INSERT/UPDATE: server-side only (use admin client or service role in action)
-- No direct client insert policy needed.
```

**`dms_ai_metadata_apply_items`:** Same SELECT policy pattern; no direct client insert.

### FK Cascade rules rationale

| FK | Rule | Reason |
|----|------|--------|
| `dms_documents.id` → runs | CASCADE | Run is meaningless without document; clean up on purge |
| `dms_ai_extraction_results.id` → runs | SET NULL | AI result can be superseded; run history should survive |
| `dms_metadata_definitions.id` → items | SET NULL | Definition could be deactivated/deleted; item history survives |
| `dms_documents.id` → items | CASCADE | Redundant safety (run cascade already cleans items) |

### `applyAiAnalysisToMetadata` modification plan

Modify the server action to:
1. Insert a `dms_ai_metadata_apply_runs` row **before** the per-field loop → get `runId`
2. After each field: insert a `dms_ai_metadata_apply_items` row (applied or skipped)
3. After all fields: update the run row with `apply_status`, `applied_count`, `skipped_count`, `completed_at`
4. If the run table insert fails → log warning, continue (non-fatal; audit_logs already written)

The existing `audit_logs` writes remain unchanged.

### New server action: `getDmsAiMetadataApplyHistory(documentId)`

```typescript
type ApplyRunRow = {
  id: number;
  document_id: number;
  ai_result_id: number | null;
  applied_by: number;
  apply_status: string;
  selected_count: number;
  applied_count: number;
  skipped_count: number;
  replace_confirmed: boolean;
  low_confidence_confirmed: boolean;
  created_at: string;
  completed_at: string | null;
  applied_by_profile?: { full_name_en: string } | null;
  items?: ApplyRunItemRow[];
};
```

Location: append to `src/server/actions/dms/ai-analysis.ts`

Permission: `canViewAi()` (same as `getDmsAiAnalysisStatus`)

---

## 10. Proposed Apply History UI / UX Design

### Location

Inside `AiResultCard` (expanded state), below the "Apply to Metadata" section (Phase 6 diff table):

- Section header: "Apply History" with `History` icon
- Show only if `result.ai_status === "accepted"` OR `runs.length > 0`
- Load runs lazily when section is expanded (TanStack Query)
- Query key: `queryKeys.dms.documentAiApplyHistory(documentId)` — new key to add

### Layout

```
Apply History (3 runs)
─────────────────────────────────────────────────────
  ▸ Run #3 — Jun 22, 2026 14:22 — Ahmed Al-Rashidi — 4 applied, 1 skipped
    ✓ issue_number     "—" → "TRN-2026-00123"   (high confidence)
    ✓ expiry_date      "—" → "2027-06-22"        (medium confidence)
    ✓ issuing_authority "—" → "MOHRE"            (high confidence)
    ✓ document_type    "—" → "Work Permit"       (high confidence)
    ✗ policy_number    skipped: fill_missing_only, field has existing value

  ▸ Run #2 — Jun 22, 2026 11:05 — System — 1 applied, 0 skipped
  ...
```

- Expandable rows per run
- Per-item: `✓` (applied) / `✗` (skipped) / `⊘` (blocked) icon + field code + before/after summary + confidence badge
- Skipped items show `skip_reason`
- Applied by: user name from joined profile
- No editing — history is read-only

---

## 11. Current Metadata Mapping Capability Audit

### `dms_metadata_definitions` — ERP mapping columns

**Confirmed:** No ERP mapping columns exist currently. The `DmsMetadataDefinitionBase` type (from Phase 2) contains AI guidance columns (`ai_rules_json`, `ai_keywords`, etc.) but **no** `target_erp_module`, `target_erp_table`, `target_erp_field`, or similar.

`ai_rules_json` (JSONB) **could** temporarily store mapping rules but this approach is rejected for Phase 7 — it makes rules hard to validate, query, or admin-manage.

### Existing DMS-to-HR mapping infrastructure (critical finding)

**`src/server/actions/hr/compliance-dms-prefill.ts`** already implements a sophisticated DMS-to-HR-compliance mapping:

| Existing capability | Notes |
|--------------------|-------|
| Reads DMS document metadata (title, document_no, issue_date, expiry_date) | Not Phase 6 AI metadata — reads document-level fields |
| Prefills HR compliance records: `medical_insurance`, `dependent`, `access_card`, `training_certificate`, `identity_document`, `medical_record` | Uses hardcoded field mappings per `ComplianceDmsRecordKind` |
| Reads OCR text from `dms_document_content` | Via `loadDmsOcrSnippet` |
| Reads latest AI extraction from `dms_ai_extraction_results` | Via `loadLatestDmsExtraction` |
| Maps fields via `dms-to-identity-map.ts`, `medical-insurance-dms-map.ts`, `dependent-dms-map.ts` | Hardcoded mapping logic in lib files |
| Returns prefill suggestions (not auto-saved) | Human-review-first already |

**Phase 7 ERP Mapping must build on this existing foundation, not create a parallel system.**

Key architecture distinction:
- **Existing (`compliance-dms-prefill.ts`)**: DMS document metadata → HR compliance prefill suggestions (already implemented, hardcoded mappings)
- **Phase 7 planned**: DMS AI metadata (`dms_document_metadata_values`) → ERP target fields (configurable mappings via `dms_metadata_erp_mappings` table)

---

## 12. ERP Target Module and Table Audit

### HR — Employee Profile

| Target | Table | Key fields | Permission |
|--------|-------|-----------|-----------|
| Employee record | `employees` | `full_name_en`, `date_of_birth`, `nationality_id`, `mobile_number`, `personal_email` | `hr.employees.update` |
| Identity documents | `employee_identity_documents` | `document_number`, `issue_date`, `expiry_date`, `document_type_id`, `issuing_authority`, `visa_file_number`, `emirates_id_application_no`, `uid_number`, `labour_card_number`, `work_permit_number`, `mohre_person_code` | `hr.compliance.manage` or `hr.admin` |
| Medical insurance | `employee_medical_insurances` | `insurance_provider`, `policy_number`, `member_id`, `plan_name`, `effective_date`, `expiry_date`, `tpa` | `hr.compliance.manage` |
| Dependents | `employee_dependents` (implied by `ComplianceDmsRecordKind.dependent`) | `dependent_name_en`, `passport_expiry` and others | `hr.compliance.manage` |

### HR — Write patterns (confirmed from `compliance.ts`)

- All HR compliance writes use `createAdminClient()` (bypasses RLS) with permission check first
- Pattern: `if (!hasPermission(ctx, "hr.compliance.manage") && !hasPermission(ctx, "hr.admin"))` → reject
- Audit: `logAudit({ module_code: "HR", ... })`

### Party Master

| Target | Table | Key fields | Permission |
|--------|-------|-----------|-----------|
| Party record | `parties` | `display_name`, `email`, `mobile`, `website` | `master_data.parties.edit` |
| Tax registrations | `party_tax_registrations` | `registration_number`, `registration_date`, `expiry_date`, `dms_certificate_document_id` | `master_data.parties.edit` |
| Licenses | `party_licenses` | `license_number`, `issue_date`, `expiry_date`, `dms_license_document_id` | `master_data.parties.edit` |

### Fleet / Assets

**Finding:** No dedicated fleet or asset server actions found in `src/server/actions/`. Fleet and assets are either:
1. DB-READY (tables exist but module not implemented)
2. Handled within another module

**Decision for Phase 7:** Fleet and asset ERP mapping must be deferred until the fleet/asset module is confirmed active. Do not plan against unverified tables.

---

## 13. ERP Mapping Architecture Options Compared

| Option | Description | Verdict |
|--------|-------------|---------|
| A — Add mapping columns to `dms_metadata_definitions` | `target_erp_module`, `target_erp_field`, etc. | Rejected — too rigid; one field may map to multiple targets; clutters the definitions table |
| B — Separate mapping table `dms_metadata_erp_mappings` (Recommended) | Child table per definition → target | Recommended — flexible, multiple targets, admin-manageable |
| C — Store mapping in `ai_rules_json` | Reuse existing JSONB column | Rejected — unvalidatable, unqueryable, not admin-friendly |

---

## 14. Recommended ERP Mapping Architecture

**Recommendation: Option B — `dms_metadata_erp_mappings` table**

### Proposed table: `dms_metadata_erp_mappings`

```sql
CREATE TABLE public.dms_metadata_erp_mappings (
  id                          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  metadata_definition_id      BIGINT NOT NULL REFERENCES dms_metadata_definitions(id) ON DELETE CASCADE,
  document_type_id            BIGINT NOT NULL REFERENCES dms_document_types(id) ON DELETE CASCADE,
  target_module               TEXT NOT NULL,  -- 'hr' | 'party' | 'fleet' | 'asset'
  target_entity               TEXT NOT NULL,  -- 'employee_identity_document' | 'party_tax_registration' | etc.
  target_table                TEXT NOT NULL,  -- actual DB table name
  target_field                TEXT NOT NULL,  -- actual DB column name
  target_relation_field       TEXT NULL,      -- FK field for matching target record (e.g., 'employee_id')
  mapping_direction           TEXT NOT NULL DEFAULT 'dms_to_erp',
  mapping_priority            INT NOT NULL DEFAULT 10,
  is_active                   BOOLEAN NOT NULL DEFAULT TRUE,
  allow_apply_to_existing     BOOLEAN NOT NULL DEFAULT FALSE,
  requires_approval_before_save BOOLEAN NOT NULL DEFAULT TRUE,
  notes                       TEXT NULL,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by                  BIGINT NULL REFERENCES user_profiles(id) ON DELETE SET NULL,
  deleted_at                  TIMESTAMPTZ NULL
);

CREATE INDEX idx_dms_metadata_erp_mappings_definition
  ON dms_metadata_erp_mappings(metadata_definition_id);
CREATE INDEX idx_dms_metadata_erp_mappings_module
  ON dms_metadata_erp_mappings(target_module);
```

**Admin UI:** Managed under DMS Admin → Metadata Definitions → per-field "ERP Mappings" child tab. Not in Phase 7 scope but planned for Phase 8.

### Why separate table

1. One DMS metadata field (e.g., `expiry_date`) may map to `employee_identity_documents.expiry_date` for HR documents AND `party_licenses.expiry_date` for party documents
2. Mappings are configurable by DMS admin without code changes
3. `is_active` allows enabling/disabling per mapping
4. `requires_approval_before_save` enforces the human-review-first gate per mapping rule

---

## 15. Owner / Target Record Matching Plan

Before a DMS metadata value can be written to an ERP target record, the system must identify which ERP record to update.

### Source of target record identity

| Document context | How target is found |
|-----------------|-------------------|
| Document linked to an employee via `dms_document_links(entity_type='employee')` | `entity_id` = `employees.id` |
| Document linked to a party via `dms_document_links(entity_type='party')` | `entity_id` = `parties.id` |
| Document created in intake with `entity_type` context | Same `entity_id` pattern |
| No link | Cannot map — requires manual selection |

### When multiple compliance records exist for the same employee

A single employee may have multiple `employee_identity_documents` rows (e.g., two passports, old and new). The system cannot auto-select the correct one.

**Required safeguard:**
- Show all candidate records for user selection
- Never auto-select if ambiguous
- Score candidates by expiry_date similarity, document_type match
- Require human selection from a list

### Target matching flow

```
1. Load document links for document.
2. For each link:
   a. Determine entity_type + entity_id.
   b. For each active mapping (dms_metadata_erp_mappings for this document_type):
      c. Resolve candidate ERP records via entity_id + target_entity.
      d. If 1 candidate → mark as auto-matched (still requires human confirm).
      e. If >1 candidates → mark as ambiguous, require manual selection.
      f. If 0 candidates → offer to create new (Phase 8+ only).
3. User reviews candidate list.
4. User selects exact target record.
5. System stores user's selection.
6. Apply proceeds only after selection confirmed.
```

---

## 16. ERP Mapping Workflow Plan

The full ERP mapping apply workflow (Phase 8) will follow this sequence:

```
1. User opens an approved document with document links (employee, party, etc.).
2. User opens AI Analysis tab.
3. System detects available ERP mappings for this document's type.
4. "Apply to ERP" button appears (separate from "Apply to Metadata").
5. User clicks "Apply to ERP".
6. System loads ERP mapping rules for this document type.
7. System loads current document metadata values.
8. System resolves candidate ERP target records from document links.
9. If ambiguous candidates: user must select exact target record.
10. UI shows ERP diff: DMS metadata value vs current ERP field value.
11. User selects fields to apply to ERP.
12. Confirmation dialog with:
    - "I confirm overwriting the existing ERP value" (for changes)
    - "I confirm applying to this specific employee/party record"
13. Server validates:
    - DMS permission (dms.documents.edit or dms.admin)
    - Target module permission (hr.compliance.manage for HR, master_data.parties.edit for party)
    - ERP record belongs to same entity linked to document
    - Field type compatibility
14. Server writes selected fields to target ERP table.
15. Server logs before/after to audit_logs (module_code = target module, e.g., "HR").
16. DMS document remains the source-of-truth reference; DMS metadata NOT changed.
```

---

## 17. ERP Mapping Permissions Plan

Applying DMS metadata to ERP records requires **both** DMS permission AND the target module's write permission.

### Permission matrix (confirmed from codebase)

| Target | Required DMS permission | Required ERP permission |
|--------|------------------------|------------------------|
| `employee_identity_documents` | `dms.documents.edit` OR `dms.admin` | `hr.compliance.manage` OR `hr.admin` |
| `employee_medical_insurances` | `dms.documents.edit` OR `dms.admin` | `hr.compliance.manage` OR `hr.admin` |
| `employee_dependents` (implied) | `dms.documents.edit` OR `dms.admin` | `hr.compliance.manage` OR `hr.admin` |
| `employees` (basic fields) | `dms.documents.edit` OR `dms.admin` | `hr.employees.update` OR system_admin |
| `party_tax_registrations` | `dms.documents.edit` OR `dms.admin` | `master_data.parties.edit` |
| `party_licenses` | `dms.documents.edit` OR `dms.admin` | `master_data.parties.edit` |
| Fleet/assets | Deferred | Deferred |

**Medical records** additionally require `hr.medical.manage` — these should be deferred or require extra flag.

---

## 18. ERP Mapping Audit Plan

When ERP mapping apply is implemented (Phase 8), the following audit events must be logged:

| Event | When | module_code |
|-------|------|------------|
| `dms_erp_mapping_apply_started` | Before first field write | "DMS" |
| `dms_erp_mapping_field_applied` | Per field written to ERP | Target module (e.g., "HR") |
| `dms_erp_mapping_field_skipped` | Per field skipped | "DMS" |
| `dms_erp_mapping_apply_completed` | After all fields | "DMS" |
| `dms_erp_mapping_apply_failed` | On error | "DMS" |

Audit payload must include:
- `dms_document_id`
- `dms_metadata_definition_id`
- `source_ai_result_id` (if mapping from Phase 6 apply result)
- `target_module`, `target_table`, `target_record_id`, `target_field`
- `old_value_summary` (≤100 chars), `new_value_summary` (≤100 chars)
- `applied_by`, `timestamp`
- `confirmation_flags`

Not logged: raw OCR, AI prompt, full document content.

---

## 19. Data Safety and Human-Review-First Rules

Phase 7 (and Phase 8 ERP Mapping) must preserve these non-negotiable rules:

```
✗ AI cannot apply to ERP records automatically.
✗ AI cannot overwrite HR/Party records without human confirmation.
✗ AI cannot create ERP records (employees, parties) from document metadata.
✗ AI cannot merge ERP records.
✗ AI cannot delete ERP records.
✗ AI cannot bypass target module permissions.
✗ AI cannot bypass DMS review or confidentiality gates.
✗ Applying to ERP never modifies dms_document_metadata_values (DMS metadata is source-of-truth, not target).
✗ Target record selection must be human-confirmed when ambiguous.
✗ Apply run history tables are append-only — no delete/update by application.
✓ Every ERP field write must have an audit_logs entry under the target module.
✓ DMS document link must exist before ERP mapping is offered.
✓ User must have BOTH DMS permission AND target module permission.
```

---

## 20. Recommended Phase 7 Implementation Scope

**Recommendation: Option 1 — Apply History Only**

### Rationale

1. **Apply History (Part A)** is a small, focused migration + server action + UI addition. Zero risk to existing workflows. High value immediately.

2. **ERP Mapping (Part B)** requires careful design because:
   - `compliance-dms-prefill.ts` already partially solves this for HR — must be integrated, not duplicated
   - Fleet/asset modules are not confirmed active — do not plan against unverified tables
   - Target record matching (ambiguous candidates) is a complex UX problem
   - Permission model requires coordination with HR and Party module owners
   - Recommended for Phase 8 after ChatGPT architecture review

3. Implementing ERP mapping foundations (the `dms_metadata_erp_mappings` table) without the apply workflow would add schema complexity with no user value. Better to plan and implement the full mapping workflow together in Phase 8.

---

## 21. Implementation Sequence for Future Phase 7 Execution

```
Step 0: Review this plan + Phase 6 implementation report
Step 1: Write migration — dms_ai_metadata_apply_runs + dms_ai_metadata_apply_items + RLS
Step 2: Modify applyAiAnalysisToMetadata() to insert run + item rows (non-fatal)
Step 3: Add getDmsAiMetadataApplyHistory() server action + query key
Step 4: Add ApplyHistoryPanel component to AiMetadataDiffSection
Step 5: Wire query invalidation (invalidate apply history after new apply)
Step 6: Typecheck (npx tsc --noEmit) — must pass clean
Step 7: Update source of truth + create implementation report
```

---

## 22. Acceptance Criteria for Future Implementation

| AC | Criterion |
|----|-----------|
| AC-01 | Every `applyAiAnalysisToMetadata` call creates one `dms_ai_metadata_apply_runs` row |
| AC-02 | Every selected field (applied or skipped) creates one `dms_ai_metadata_apply_items` row |
| AC-03 | Apply run row is linked to `document_id`, `ai_result_id`, `applied_by` |
| AC-04 | Apply items store `old_value_summary`/`new_value_summary` (≤100 chars); no raw content |
| AC-05 | Existing `audit_logs` writes remain unchanged and are still the official audit trail |
| AC-06 | Apply History panel in AI Analysis tab shows run summary and per-item details |
| AC-07 | RLS allows `dms.documents.view` or `dms.admin` to SELECT from apply run tables |
| AC-08 | Phase 6 apply workflow continues to work after modification |
| AC-09 | No ERP record is updated in Phase 7 |
| AC-10 | `npx tsc --noEmit` exits 0 after implementation |
| AC-11 | Apply run table insert failure is non-fatal (audit_logs fallback used) |
| AC-12 | `getDmsAiMetadataApplyHistory` respects confidentiality gate |

---

## 23. Full Test Plan

### TC-01 — Apply run created on successful apply
- **Purpose:** Verify run row is inserted
- **Setup:** Document with metadata definitions; AI result with extracted fields; user has apply permission
- **Steps:** Call `applyAiAnalysisToMetadata` with 3 fields; check DB
- **Expected:** 1 row in `dms_ai_metadata_apply_runs` with `apply_status = 'completed'`, `applied_count = 3`
- **DB state:** `dms_ai_metadata_apply_runs` has new row; `dms_ai_metadata_apply_items` has 3 rows
- **Risk:** AC-01

---

### TC-02 — Apply items created (applied + skipped)
- **Purpose:** Verify item rows for both applied and skipped fields
- **Setup:** 3 fields selected; 2 apply, 1 skipped (fill_missing_only, has value)
- **Expected:** 3 `dms_ai_metadata_apply_items` rows; 2 with `item_status = 'applied'`, 1 with `item_status = 'skipped'`, `skip_reason` populated
- **Risk:** AC-02

---

### TC-03 — Audit logs still written
- **Purpose:** Verify existing audit_logs behavior unchanged
- **Steps:** Apply 2 fields; check `audit_logs`
- **Expected:** `ai_metadata_apply_started`, 2 × `ai_metadata_field_applied`, `ai_metadata_apply_completed` rows still present
- **Risk:** AC-05

---

### TC-04 — Apply history visible to authorized user
- **Purpose:** Verify SELECT RLS
- **Setup:** User with `dms.documents.view`
- **Steps:** Call `getDmsAiMetadataApplyHistory(documentId)`
- **Expected:** Returns run rows for that document
- **Risk:** AC-07

---

### TC-05 — Apply history hidden from unauthorized user
- **Purpose:** Verify SELECT RLS blocks unauthorized access
- **Setup:** User without any DMS permission
- **Steps:** Call `getDmsAiMetadataApplyHistory(documentId)` directly
- **Expected:** Returns empty or permission error
- **Risk:** AC-07

---

### TC-06 — Confidential document apply history gate
- **Purpose:** Verify confidential documents require dms.admin for history
- **Setup:** Document with `confidentiality_level = 'hr'`; user has `dms.documents.view` but not `dms.admin`
- **Expected:** History request blocked with permission error
- **Risk:** AC-12

---

### TC-07 — Apply run insert failure is non-fatal
- **Purpose:** Verify Phase 6 apply still succeeds even if run table write fails
- **Setup:** Simulate DB failure on `dms_ai_metadata_apply_runs` insert (e.g., table temporarily unavailable)
- **Expected:** Apply returns success; `dms_document_metadata_values` updated; `audit_logs` written; warning logged
- **Risk:** AC-08, AC-11

---

### TC-08 — Old Phase 6 apply flow still works
- **Purpose:** Regression check
- **Steps:** Full apply flow as in Phase 6 — select fields, confirm, apply
- **Expected:** No change in behavior from user's perspective; apply works normally; new run/item rows appear as bonus
- **Risk:** AC-08

---

### TC-09 — ERP mapping does not write any target ERP record
- **Purpose:** Verify Phase 7 does not inadvertently implement ERP apply
- **Steps:** Search codebase for any HR/Party update calls in new Phase 7 files
- **Expected:** None found; zero writes to `employees`, `employee_identity_documents`, `parties`, etc.
- **Risk:** AC-09

---

### TC-10 — Target module permission check design (ERP mapping planning)
- **Purpose:** Verify ERP mapping permission model is documented
- **Steps:** Review plan Section 17 and verify permission codes match actual codebase
- **Expected:** `hr.compliance.manage`, `hr.admin`, `master_data.parties.edit` confirmed against `compliance.ts` and `parties.ts`
- **Risk:** AC-12

---

### TC-11 — Apply history UI shows run summary
- **Purpose:** Verify UI renders run rows
- **Setup:** Document with 2 previous apply runs
- **Steps:** Open AI Analysis tab; expand latest result; scroll to Apply History section
- **Expected:** 2 run entries visible with summary (applied count, by whom, when); expandable to show item rows
- **Risk:** AC-06

---

### TC-12 — Typecheck
- **Steps:** `npx tsc --noEmit`
- **Expected:** Exit code 0
- **Risk:** AC-10

---

### TC-13 — Lint
- **Steps:** `npm run lint`
- **Expected:** No new errors

---

### TC-14 — Build
- **Steps:** `npm run build`
- **Expected:** No errors

---

## 24. Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Run table insert fails on high-concurrency apply | Low | Apply silently loses run row | Wrap in try/catch; audit_logs fallback; non-fatal |
| `dms_ai_metadata_apply_items.definition_id` becomes null if definition deleted | Low | Items lose field type context | `SET NULL` FK; `field_code` still present for identification |
| Apply History UI query is slow on large documents | Low | Poor UX | Index on `(document_id, created_at DESC)`; paginate runs |
| ERP mapping plan based on `compliance-dms-prefill.ts` becomes outdated if that module changes | Medium | Plan misaligned | Note dependency; re-audit `compliance-dms-prefill.ts` at start of Phase 8 |
| Fleet/asset tables not found — mapping cannot be planned | Confirmed | Phase 7 scope correct | Explicitly deferred; do not invent tables |
| Medical record mapping requires extra permission (`hr.medical.manage`) | Medium | Unauthorized access risk | Explicitly require `hr.medical.manage` for that target entity |
| `createAndApplyDmsTagSuggestion` (Tags fix from Phase 6) creates tags without admin approval | Low | Tag proliferation | Document as known gap; not Phase 7 scope |

---

## 25. What Must Not Be Implemented in Phase 7

```
✗ Auto-apply to ERP records (HR, Party, Fleet, Asset)
✗ Write to employee_identity_documents, employee_medical_insurances, employees, parties, party_tax_registrations, party_licenses
✗ Create HR/Party records from AI
✗ Bulk apply without per-field review
✗ ERP mapping UI that writes target ERP records
✗ dms_metadata_erp_mappings table (Phase 8)
✗ Async job queue
✗ Semantic chunks
✗ Azure OCR wiring
✗ OCR history
✗ Review queue UI
✗ Auto-overwrite approved document metadata
✗ Major UI redesign
✗ Any rollback functionality for apply history items
```

---

## 26. Recommended Next Cursor Implementation Prompt

```
ERP_DMS_AI_PHASE_7_APPLY_HISTORY_IMPLEMENTATION_PROMPT.md
```

The implementation prompt should:
1. Reference this plan (Section 21 — Implementation Sequence)
2. Specify the migration file name pattern: `20260622XXXXXX_erp_dms_ai_phase7_apply_history.sql`
3. Reference `src/server/actions/dms/ai-analysis.ts` (modify `applyAiAnalysisToMetadata`, add `getDmsAiMetadataApplyHistory`)
4. Reference `src/features/dms/documents/sections/dms-document-ai-section.tsx` (add `ApplyHistoryPanel`)
5. Add new query key: `queryKeys.dms.documentAiApplyHistory(documentId)`
6. Require `npx tsc --noEmit` passes before reporting completion
7. Explicitly forbid any ERP module writes

---

## 27. Final Recommendation

**Phase 7 should implement Apply History only (Part A).** The two new tables are a natural extension of the Phase 4 `dms_approve_runs` pattern. Implementation risk is low: the only code change is adding non-fatal inserts to an existing action and a new read-only query + UI panel.

**ERP Mapping (Part B) should be Phase 8.** The discovery of the existing `compliance-dms-prefill.ts` module changes the architecture significantly — Phase 8 must study and extend this module rather than building a parallel system. The `dms_metadata_erp_mappings` table, target record matching UI, and per-module permission gating are all correct in design but too complex to implement before the existing mapping foundation is fully understood.

**The most important Phase 8 prerequisite:** Read and document `compliance-dms-prefill.ts` + all its `lib/hr/compliance/` dependencies fully before planning Phase 8's ERP mapping database design.
