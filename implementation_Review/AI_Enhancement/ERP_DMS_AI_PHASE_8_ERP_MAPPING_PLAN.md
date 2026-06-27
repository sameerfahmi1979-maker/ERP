# ERP DMS AI Phase 8 — ERP Mapping Plan

**Date:** 2026-06-22  
**Phase:** ERP DMS AI Phase 8 — ERP Mapping  
**Status:** Planning only — no code, migration, or schema changes made  
**Preceded by:** Phase 7 — Apply History  

---

## 1. Executive Summary

Phase 8 plans how approved DMS document metadata can be mapped to ERP records in a human-review-first, permission-gated workflow. The plan is grounded in actual codebase inspection, not assumptions.

**Critical finding:** The ERP already has a rich DMS-to-HR mapping infrastructure in `src/server/actions/hr/compliance-dms-prefill.ts` and its supporting `src/lib/hr/compliance/` utilities. This system reads from `dms_ai_extraction_results.extracted_fields_json` (raw AI extraction) and `dms_document` metadata fields (title, document_no, issue_date, expiry_date). It does **not** read from `dms_document_metadata_values` (approved Phase 6 metadata). Phase 8 must bridge this gap.

**Recommended Phase 8 scope:** Mapping Registry + Read-only ERP Diff Preview (Option 2). No writes to ERP target records. Phase 9 = Apply to ERP records.

**Architecture decision:** `dms_metadata_erp_mappings` separate table (Option B). One metadata definition can map to multiple ERP target fields.

---

## 2. Planning Scope and Non-Implementation Rule

**This document is planning only.** No source code, migrations, UI files, or server actions will be created or modified.

**Phase 8 implementation will cover (if approved):**
- `dms_metadata_erp_mappings` mapping registry table + RLS
- Admin UI under DMS Admin → Metadata Definitions → ERP Mappings child tab
- Server-side allowlisted target table/field registry (TypeScript constant)
- `getDmsErpMappingPreview(documentId)` server action
- ERP Mapping Preview panel in AI Analysis tab / document record
- No writes to `employees`, `employee_identity_documents`, `employee_medical_insurances`, `party_licenses`, `party_tax_registrations`

**Phase 9 (future):** Apply to ERP records.

---

## 3. Files and Source-of-Truth Reviewed

| File | Status |
|------|--------|
| `ERP_DMS_AI_CURRENT_SOURCE_OF_TRUTH.md` | Read |
| `implementation_Review/ERP_DMS_AI_PHASE_7_APPLY_HISTORY_IMPLEMENTATION_REPORT.md` | Read |
| `ERP_DMS_AI_PHASE_7_APPLY_HISTORY_AND_ERP_MAPPING_PLAN.md` | Read (Phase 7 Part B) |
| `src/server/actions/hr/compliance-dms-prefill.ts` | Read |
| `src/lib/hr/compliance/compliance-dms-prefill.ts` | Read |
| `src/lib/hr/compliance/dms-to-identity-map.ts` | Read |
| `src/lib/hr/compliance/medical-insurance-dms-map.ts` | Referenced |
| `src/lib/hr/compliance/dependent-dms-map.ts` | Referenced |
| `src/server/actions/hr/compliance.ts` | Read (permissions, table names) |
| `src/server/actions/hr/employees.ts` | Read (employee table fields) |
| `src/server/actions/master-data/party-licenses.ts` | Read |
| `src/server/actions/master-data/party-tax-registrations.ts` | Read |
| `src/features/master-data/parties/party-types.ts` | Read (PartyLicense, PartyTaxRegistration types) |
| `src/lib/dms/dms-entity-types.ts` | Read (DMS_ENTITY_TYPES registry) |
| `src/server/actions/dms/document-links.ts` | Read (dms_document_links structure) |
| `src/server/actions/dms/ai-analysis.ts` | Read (Phase 7 apply history) |

Missing files (not found):
- `erp-dms-ai-first-upload-standard.mdc`
- `erp-ai-human-review-first-standard.mdc`
- `erp-rls-standard.mdc`
- `erp-audit-log-standard.mdc`
- `erp-hr-standard.mdc`
- `erp-party-standard.mdc`
- Fleet/asset server actions — no dedicated module found

---

## 4. Phase 1–7 Output Reviewed

| Phase | Key Output Relevant to Phase 8 |
|-------|-------------------------------|
| Phase 2 | `dms_metadata_definitions` — confirmed no ERP mapping columns; `DmsMetadataDefinitionBase` type |
| Phase 6 | `applyAiAnalysisToMetadata()` writes selected AI fields to `dms_document_metadata_values` |
| Phase 7 | `dms_ai_metadata_apply_runs` + `dms_ai_metadata_apply_items` — apply history model; pattern for ERP mapping apply runs |

---

## 5. Current DMS AI Metadata and Apply History Architecture

### Phase 6 `applyAiAnalysisToMetadata()` writes to:

```
dms_document_metadata_values (document_id, definition_id, value_*)
  ← UPSERT ON CONFLICT (document_id, definition_id)
```

### Phase 7 apply history tables:

```
dms_ai_metadata_apply_runs (id, document_id, ai_result_id, applied_by, apply_status, ...)
dms_ai_metadata_apply_items (id, apply_run_id, document_id, definition_id, field_code, ...)
```

### What is NOT yet implemented:

```
No dms_metadata_erp_mappings table
No getDmsErpMappingPreview server action
No ERP Mapping preview UI
No writes to HR/Party/Fleet/Asset from DMS metadata
```

---

## 6. Existing HR DMS Prefill Architecture Audit

### `src/server/actions/hr/compliance-dms-prefill.ts`

This is the **existing** DMS-to-HR mapping system. It:

1. **Inputs:** `dms_document_id` + `employeeId` + `kind` (`ComplianceDmsRecordKind`)
2. **Record kinds supported:** `medical_insurance`, `dependent`, `access_card`, `training_certificate`, `medical_record`
3. **Identity documents** are handled separately by `src/server/actions/hr/ai/identity-document-ai-fill.ts`
4. **Data sources** (in priority order):
   - `dms_document` level fields: `title`, `document_no`, `issue_date`, `expiry_date`
   - `dms_ai_extraction_results.extracted_fields_json` (raw AI extraction)
   - `dms_document_content` OCR text (via `loadDmsOcrSnippet`)
   - AI re-extraction via `callCommonAiStructuredCompletion` (for complex structures)
5. **Does NOT read** `dms_document_metadata_values` (Phase 6 approved metadata)
6. **Output:** `ComplianceDmsPrefillResult` — a suggestions object, NOT written to DB
7. **Human review enforced:** Caller (HR compliance form) presents the suggestion; user confirms before save
8. **Permissions:** `hr.compliance.manage` or `hr.admin` (checked by calling server action)

### `src/lib/hr/compliance/dms-to-identity-map.ts`

Maps AI extraction fields → `IdentityDocumentFormState` fields.

**DMS type_code → HR identity_document_types.code** mapping (confirmed):

| DMS type_code | HR identity code |
|--------------|-----------------|
| `EMP_EMIRATES_ID`, `EMIRATES_ID`, `EID` | `EMIRATES_ID` |
| `EMP_PASSPORT`, `PASSPORT`, `PASSPORT_COPY` | `PASSPORT` |
| `EMP_VISA`, `VISA`, `RESIDENCE_VISA` | `RESIDENCE_VISA` |
| `LABOUR_CARD` | `LABOUR_CARD` |
| `WORK_PERMIT`, `EMP_WORK_PERMIT` | `WORK_PERMIT` |
| `DRIVING_LICENSE` | `DRIVING_LICENSE` |
| `CICPA_PASS` | `CICPA_PASS` |
| `HEALTH_CARD` | `HEALTH_CARD` |
| `EMPLOYMENT_CONTRACT` | `EMPLOYMENT_CONTRACT` |

### What Phase 8 must NOT duplicate

The existing `compliance-dms-prefill.ts` is the prefill-for-new-record path (used when creating new HR compliance records from a DMS document). Phase 8 targets the **update-existing-record** path using **approved `dms_document_metadata_values`** as source.

---

## 7. HR Target Table and Permission Audit

### Table: `employee_identity_documents`

**Confirmed columns** (from `EmployeeIdentityDocumentRow` in `compliance.ts`):

| Column | Type | Notes |
|--------|------|-------|
| `id` | BIGINT PK | |
| `employee_id` | BIGINT FK | → employees |
| `document_type_id` | BIGINT FK | → identity_document_types |
| `document_number` | TEXT | Target for passport_number, eid_number, document_number |
| `issue_date` | DATE | |
| `expiry_date` | DATE | |
| `issuing_authority` | TEXT | |
| `issuing_authority_party_id` | BIGINT FK | |
| `issue_country_id` | BIGINT FK | |
| `issuing_emirate_id` | BIGINT FK | |
| `issue_city_id` | BIGINT FK | |
| `status` | TEXT | |
| `verification_status` | TEXT | |
| `emirates_id_application_no` | TEXT | |
| `visa_file_number` | TEXT | |
| `uid_number` | TEXT | |
| `labour_card_number` | TEXT | |
| `work_permit_number` | TEXT | |
| `mohre_person_code` | TEXT | |
| `profession_on_document` | TEXT | |
| `sponsor_company_id` | BIGINT FK | |
| `place_of_issue` | TEXT | |
| `notes` | TEXT | |
| `dms_document_id` | BIGINT FK | → dms_documents (back-link) |

**Permission:** `hr.compliance.manage` or `hr.admin`  
**Server action:** `updateEmployeeIdentityDocument()` in `src/server/actions/hr/compliance.ts`  
**Audit:** `logAudit({ module_code: "HR", entity_name: "employee_identity_documents", ... })`

**Safe DMS metadata fields to target:**

| DMS metadata field_code | `employee_identity_documents` column |
|------------------------|--------------------------------------|
| `document_number` / `passport_number` / `emirates_id_number` | `document_number` |
| `issue_date` / `date_of_issue` | `issue_date` |
| `expiry_date` | `expiry_date` |
| `visa_file_number` | `visa_file_number` |
| `uid_number` | `uid_number` |
| `labour_card_number` | `labour_card_number` |
| `work_permit_number` | `work_permit_number` |
| `mohre_person_code` | `mohre_person_code` |
| `profession_on_document` | `profession_on_document` |
| `place_of_issue` | `place_of_issue` |

**Not safe without FK resolution:** `document_type_id`, `issuing_authority_party_id`, `issue_country_id`, `issuing_emirate_id`, `issue_city_id`, `sponsor_company_id` — these require lookup joins before write.

---

### Table: `employee_medical_insurances`

**Confirmed columns** (from `EmployeeMedicalInsuranceRow` in `compliance.ts`):

| Column | Type |
|--------|------|
| `id` | BIGINT PK |
| `employee_id` | BIGINT FK |
| `insurance_provider` | TEXT |
| `tpa` | TEXT (Third Party Administrator) |
| `policy_number` | TEXT |
| `member_id` | TEXT |
| `plan_name` | TEXT |
| `plan_class` | TEXT |
| `network_type` | TEXT |
| `effective_date` | DATE |
| `expiry_date` | DATE |
| `co_payment_percentage` | NUMERIC |
| `employee_covered` | BOOLEAN |
| `dependent_coverage_included` | BOOLEAN |

**Permission:** `hr.compliance.manage` or `hr.admin`  
**Server action:** `updateEmployeeMedicalInsurance()` in `compliance.ts`

**Safe DMS fields:**

| DMS metadata field_code | `employee_medical_insurances` column |
|------------------------|--------------------------------------|
| `policy_number` | `policy_number` |
| `insurance_provider` | `insurance_provider` |
| `effective_date` / `issue_date` | `effective_date` |
| `expiry_date` | `expiry_date` |
| `member_id` | `member_id` |
| `plan_name` | `plan_name` |
| `tpa` | `tpa` |

---

### Table: `employees` (basic fields)

**Permission:** `hr.employees.update` or `system_admin`  
**Recommendation:** Do NOT map DMS metadata to core employee record fields in Phase 8. Too many risk vectors. Defer to Phase 9+ with explicit scope definition.

---

### Other HR compliance tables (deferred)

| Table | Status |
|-------|--------|
| `employee_dependents` | Defer — dependent records require full form context (relationship, nationality, etc.) |
| `employee_access_cards` | Defer |
| `employee_training_certificates` | Defer |
| `employee_medical_records` | Defer — restricted medical data, extra permissions |

---

## 8. Party Target Table and Permission Audit

### Table: `party_licenses`

**Confirmed columns** (from `PartyLicense` type in `party-types.ts`):

| Column | Type | Notes |
|--------|------|-------|
| `id` | BIGINT PK | |
| `license_code` | TEXT | System-generated; never overwrite |
| `party_id` | BIGINT FK | |
| `license_type_id` | BIGINT FK | |
| `license_number` | TEXT | Target: trade license number, license_no |
| `license_name` | TEXT | |
| `issuing_authority_party_id` | BIGINT FK | FK — resolve separately |
| `issuing_country_id` | BIGINT FK | |
| `issuing_emirate_id` | BIGINT FK | |
| `issue_date` | DATE | |
| `expiry_date` | DATE | |
| `renewal_required` | BOOLEAN | |
| `renewal_notice_days` | INT | |
| `license_status_id` | BIGINT FK | |
| `license_activity_text` | TEXT | |
| `dms_license_document_id` | BIGINT FK | → dms_documents (back-link, Phase 6) |
| `is_primary` | BOOLEAN | |
| `is_active` | BOOLEAN | |
| `remarks` | TEXT | |

**Permission:** `master_data.parties.manage_licenses`  
**Server action:** `updatePartyLicense()` in `party-licenses.ts`

**Safe DMS fields:**

| DMS metadata field_code | `party_licenses` column |
|------------------------|-------------------------|
| `license_number` | `license_number` |
| `license_name` / `trade_name` | `license_name` |
| `issue_date` | `issue_date` |
| `expiry_date` | `expiry_date` |
| `license_activity` | `license_activity_text` |

**NOT safe without FK resolution:** `license_type_id`, `issuing_authority_party_id`, `issuing_country_id`, `issuing_emirate_id`, `license_status_id`

---

### Table: `party_tax_registrations`

**Confirmed columns** (from `PartyTaxRegistration` type in `party-types.ts`):

| Column | Type | Notes |
|--------|------|-------|
| `id` | BIGINT PK | |
| `tax_registration_code` | TEXT | System-generated; never overwrite |
| `party_id` | BIGINT FK | |
| `tax_type_id` | BIGINT FK | |
| `tax_registration_number` | TEXT | Target: TRN, VAT registration number |
| `tax_country_id` | BIGINT FK | |
| `tax_status_id` | BIGINT FK | |
| `effective_from` | DATE | |
| `effective_to` | DATE | |
| `dms_certificate_document_id` | BIGINT FK | → dms_documents (back-link, Phase 6) |
| `reverse_charge_applicable` | BOOLEAN | |
| `vat_exempt` | BOOLEAN | |
| `is_primary` | BOOLEAN | |
| `is_active` | BOOLEAN | |
| `remarks` | TEXT | |

**Permission:** `master_data.parties.manage_tax`  
**Server action:** `updatePartyTaxRegistration()` in `party-tax-registrations.ts`

**Safe DMS fields:**

| DMS metadata field_code | `party_tax_registrations` column |
|------------------------|----------------------------------|
| `tax_registration_number` / `trn_number` / `vat_number` | `tax_registration_number` |
| `effective_from` / `issue_date` | `effective_from` |
| `effective_to` / `expiry_date` | `effective_to` |

---

## 9. Fleet / Asset Target Audit

**Finding:** No fleet or asset server actions exist in `src/server/actions/`. The DMS entity types registry (`dms-entity-types.ts`) lists `vehicle`, `equipment`, `fleet_asset` as **"Roadmap 005 — future"**. No DB tables or migrations for fleet/asset were found.

**Decision:** Fleet and asset ERP mapping is **deferred**. Do not plan writes against unverified tables.

---

## 10. Current DMS Link / Owner Model Audit

### `dms_document_links` table

Confirmed columns (from `document-links.ts`):

```
id, document_id, entity_type, entity_id, link_role, is_primary, notes, linked_at, created_at
```

**`entity_type`** values are strictly enforced via `DMS_ENTITY_TYPE_CODES` enum:

```typescript
// Active entity types relevant to Phase 8:
"party"           → parties.id
"party_license"   → party_licenses.id
"party_tax_registration" → party_tax_registrations.id
"employee"        → employees.id
"employee_identity_document" → employee_identity_documents.id
"employee_medical_insurance" → employee_medical_insurances.id
"employee_dependent" → employee_dependents.id
// ... and many more
```

### Link resolution for ERP mapping

| Scenario | How target is found |
|----------|-------------------|
| Document linked to `employee` | `entity_id` = `employees.id` → resolve compliance child records |
| Document linked to `employee_identity_document` | `entity_id` = `employee_identity_documents.id` directly |
| Document linked to `employee_medical_insurance` | `entity_id` = `employee_medical_insurances.id` directly |
| Document linked to `party` | `entity_id` = `parties.id` → resolve `party_licenses` / `party_tax_registrations` |
| Document linked to `party_license` | `entity_id` = `party_licenses.id` directly |
| Document linked to `party_tax_registration` | `entity_id` = `party_tax_registrations.id` directly |

### Critical rules

- **No link = no ERP mapping preview** (cannot identify target record)
- **Multiple links of same type** = require human selection (e.g., employee has two identity documents of same type)
- **Link `is_primary`** = prefer primary link when multiple exist
- Links are human-approved (no AI auto-link in this flow)

---

## 11. Current Metadata Mapping Capability Audit

### `dms_metadata_definitions` — confirmed no ERP mapping columns

The `DmsMetadataDefinitionBase` type (from Phase 2) includes:

```typescript
field_code, field_label_en, field_label_ar, field_type, field_group,
is_required, is_active, sort_order, options_json, validation_json,
ai_rules_json, ai_keywords, ai_extraction_hint,
review_required_if_low_confidence, ai_confidence_threshold, show_in_ai_analysis
```

**No** `target_erp_module`, `target_erp_table`, `target_erp_field`, or mapping columns.

### `ai_rules_json` cannot serve as mapping store

`ai_rules_json` is a JSONB field intended for AI extraction guidance. Using it for ERP mappings would:
- Conflate two concerns
- Be unqueryable (cannot JOIN on JSONB contents)
- Be unvalidatable by the ORM
- Make admin UI impossible

### Conclusion

A dedicated mapping table is required. `field_code` is stable enough for mapping (Phase 2 enforced unique field codes per document type).

---

## 12. ERP Mapping Architecture Options Compared

| Option | Description | Verdict |
|--------|-------------|---------|
| A — Add columns to `dms_metadata_definitions` | `target_erp_module`, `target_erp_table`, `target_erp_field` | Rejected — too rigid, one definition can't map to multiple targets, clutters definitions |
| **B — Separate `dms_metadata_erp_mappings` table** | Child table per definition → ERP target | **Recommended** |
| C — JSON in `ai_rules_json` | Store mapping rules in JSONB | Rejected — unqueryable, unsafe, no admin UI |

---

## 13. Recommended ERP Mapping Architecture

**Recommendation: Option B — `dms_metadata_erp_mappings` table**

Rationale:
1. One DMS metadata field (e.g., `expiry_date`) may map to `employee_identity_documents.expiry_date` for HR documents AND `party_licenses.expiry_date` for party documents — multiple mappings per definition needed
2. Configurable by DMS admin without code changes
3. Queryable — can join to resolve active mappings per document type
4. `is_active` enables enabling/disabling per mapping without deletion
5. `requires_confirmation` enforces human-review-first at the mapping level

---

## 14. Proposed ERP Mapping Database Design

### Table: `dms_metadata_erp_mappings`

```sql
CREATE TABLE public.dms_metadata_erp_mappings (
  id                        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  metadata_definition_id    BIGINT NOT NULL
                              REFERENCES public.dms_metadata_definitions(id) ON DELETE CASCADE,
  document_type_id          BIGINT NOT NULL
                              REFERENCES public.dms_document_types(id) ON DELETE CASCADE,
  target_module             TEXT NOT NULL,
                              -- 'hr' | 'party'  (fleet/asset deferred)
  target_entity             TEXT NOT NULL,
                              -- e.g. 'employee_identity_document' | 'party_license'
  target_table              TEXT NOT NULL,
                              -- actual DB table: 'employee_identity_documents' | 'party_licenses' etc.
  target_field              TEXT NOT NULL,
                              -- actual DB column: 'document_number' | 'expiry_date' etc.
  target_relation_field     TEXT NOT NULL,
                              -- FK to parent: 'employee_id' | 'party_id'
  target_record_strategy    TEXT NOT NULL DEFAULT 'link_exact',
                              -- 'link_exact': use dms_document_links entity_id directly
                              -- 'link_parent': use entity_id of parent (employee→look up child records)
  mapping_direction         TEXT NOT NULL DEFAULT 'dms_to_erp',
  mapping_priority          INT NOT NULL DEFAULT 10,
  is_active                 BOOLEAN NOT NULL DEFAULT TRUE,
  allow_apply_to_existing   BOOLEAN NOT NULL DEFAULT FALSE,
                              -- Phase 8: FALSE (preview only); Phase 9: TRUE
  requires_confirmation     BOOLEAN NOT NULL DEFAULT TRUE,
  requires_target_permission TEXT NOT NULL,
                              -- exact permission code: 'hr.compliance.manage' | 'master_data.parties.manage_licenses' etc.
  notes                     TEXT,
  created_by                BIGINT REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at                TIMESTAMPTZ
);

CREATE INDEX idx_dms_metadata_erp_mappings_definition
  ON public.dms_metadata_erp_mappings(metadata_definition_id);
CREATE INDEX idx_dms_metadata_erp_mappings_document_type
  ON public.dms_metadata_erp_mappings(document_type_id);
CREATE INDEX idx_dms_metadata_erp_mappings_module
  ON public.dms_metadata_erp_mappings(target_module)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_dms_metadata_erp_mappings_active
  ON public.dms_metadata_erp_mappings(is_active, document_type_id)
  WHERE deleted_at IS NULL;
```

### Column notes

| Column | Purpose |
|--------|---------|
| `target_table` | Must be from the server-side allowlist; prevents arbitrary table writes |
| `target_field` | Must be from per-table allowlist |
| `target_record_strategy` | `link_exact` = document linked directly to target child record (e.g., `entity_type='employee_identity_document'`); `link_parent` = document linked to parent (e.g., `entity_type='employee'`) and system must resolve correct child |
| `allow_apply_to_existing` | Phase 8: `FALSE` across the board; Phase 9 can set `TRUE` per mapping |
| `requires_target_permission` | Stored verbatim and verified server-side during Phase 9 apply |

### RLS

```sql
ALTER TABLE public.dms_metadata_erp_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dms_metadata_erp_mappings FORCE ROW LEVEL SECURITY;

-- SELECT: dms.documents.view or dms.admin or system_admin
CREATE POLICY "dms_erp_mappings_select_authorized" ...

-- INSERT/UPDATE: dms.admin or system_admin only
CREATE POLICY "dms_erp_mappings_admin_only" ...
```

### Phase 9 tables (plan, not for Phase 8):

```
dms_erp_mapping_apply_runs   -- one row per apply-to-ERP operation
dms_erp_mapping_apply_items  -- one row per field written to ERP
```

These follow the same pattern as Phase 7's `dms_ai_metadata_apply_runs`.

---

## 15. ERP Mapping Registry Validation Plan

All `target_table` and `target_field` values must be validated against a server-side TypeScript allowlist. This prevents a misconfigured admin from directing DMS values to arbitrary DB columns.

### Proposed allowlist constant

```typescript
// src/lib/dms/erp-mapping/erp-mapping-targets.ts

export const ERP_MAPPING_TARGET_REGISTRY = {
  hr: {
    employee_identity_documents: {
      permission: "hr.compliance.manage",
      admin_permission: "hr.admin",
      relation_field: "employee_id",
      entity_types: ["employee_identity_document"],
      parent_entity_type: "employee",
      safe_fields: [
        "document_number", "issue_date", "expiry_date",
        "visa_file_number", "uid_number", "labour_card_number",
        "work_permit_number", "mohre_person_code",
        "profession_on_document", "place_of_issue", "notes",
      ] as const,
    },
    employee_medical_insurances: {
      permission: "hr.compliance.manage",
      admin_permission: "hr.admin",
      relation_field: "employee_id",
      entity_types: ["employee_medical_insurance"],
      parent_entity_type: "employee",
      safe_fields: [
        "policy_number", "insurance_provider", "tpa",
        "member_id", "plan_name", "plan_class",
        "effective_date", "expiry_date",
      ] as const,
    },
  },
  party: {
    party_licenses: {
      permission: "master_data.parties.manage_licenses",
      admin_permission: "master_data.parties.edit",
      relation_field: "party_id",
      entity_types: ["party_license"],
      parent_entity_type: "party",
      safe_fields: [
        "license_number", "license_name", "license_activity_text",
        "issue_date", "expiry_date", "remarks",
      ] as const,
    },
    party_tax_registrations: {
      permission: "master_data.parties.manage_tax",
      admin_permission: "master_data.parties.edit",
      relation_field: "party_id",
      entity_types: ["party_tax_registration"],
      parent_entity_type: "party",
      safe_fields: [
        "tax_registration_number",
        "effective_from", "effective_to", "remarks",
      ] as const,
    },
  },
} as const;
```

### Validation rules

1. `target_module` must be `"hr"` or `"party"` (fleet/asset deferred)
2. `target_table` must be a key of `ERP_MAPPING_TARGET_REGISTRY[target_module]`
3. `target_field` must be in `safe_fields` for that table
4. `requires_target_permission` must match the registered permission for that table
5. Field type compatibility: `TEXT` DMS fields → `TEXT` DB columns only; `DATE` → `DATE` columns only; no cross-type mapping
6. Admin UI must render a dropdown of allowed tables and fields (not free text)

---

## 16. Target Record Matching Plan

### Step 1 — Load document links

Query `dms_document_links` for the document. Get all `(entity_type, entity_id)` pairs.

### Step 2 — Map link to target table

For each active mapping rule:

```
link entity_type → target_record_strategy:
  'link_exact':  entity_id IS the target record id (e.g., entity_type='employee_identity_document', entity_id=5)
  'link_parent': entity_id is the parent id; query child table WHERE employee_id = entity_id (or party_id)
```

### Step 3 — Resolve candidate records

For `link_exact`:
- Query: `SELECT id FROM {target_table} WHERE id = entity_id AND deleted_at IS NULL`
- If found: single confirmed target
- If not found: mapping is broken (target deleted) → show warning

For `link_parent`:
- Query: `SELECT id FROM {target_table} WHERE {relation_field} = entity_id AND deleted_at IS NULL`
- If 1 result: auto-matched (still requires user confirmation in Phase 9)
- If >1 result: ambiguous → show "Multiple records found, please select" in Phase 9
- If 0 results: no existing target → show "No {entity} found for this document link" (Phase 9: offer create path)

### Step 4 — Safety rules

```
No confirmed link → no ERP mapping preview (show "Link this document to an entity first")
Multiple links of same entity type → show all; user must select in Phase 9
AI cannot auto-select among ambiguous candidates
All target selections in Phase 9 must be logged in audit
```

---

## 17. ERP Diff Workflow Plan

For the **read-only preview** (Phase 8 implementation):

```
For each active dms_metadata_erp_mappings row matching document_type_id:
  1. Load DMS metadata value: dms_document_metadata_values WHERE document_id + definition_id
  2. Resolve target ERP record from document links
  3. Load current ERP field value from target table
  4. Compare:
     - same:      DMS value == ERP value (normalized)
     - new:       ERP field is NULL / empty; DMS has a value
     - changed:   Both have values and they differ
     - no_dms_value: DMS metadata not yet set (not applicable)
     - no_target: No linked ERP record found
     - no_link:   Document has no link of required entity_type
  5. Return ERP diff row with: field_label, dms_value, erp_value, diff_status, target_record_display, confidence
```

### Preview UI status icons

| Status | Icon | Meaning |
|--------|------|---------|
| `same` | ✓ green | Already in sync |
| `new` | ⊕ blue | New value to fill |
| `changed` | ⚡ amber | Different values |
| `no_dms_value` | — gray | DMS metadata not set yet |
| `no_target` | ⊘ gray | No ERP record found via link |
| `no_link` | 🔗 warning | Document needs to be linked first |

---

## 18. Apply-to-ERP Workflow Plan

**Phase 9 only — not implemented in Phase 8.**

```
1. User opens document → AI Analysis / ERP Mapping tab
2. System loads mapping rules for document type
3. System loads DMS metadata values (approved)
4. System resolves target ERP records from document links
5. UI shows ERP diff (read/write mode — Phase 9)
6. User selects fields to apply
7. User confirms: "I confirm applying these values to [employee_identity_document #5]"
8. Server validates:
   a. DMS permission: dms.documents.edit or dms.admin
   b. Target permission: hr.compliance.manage (or mapped permission)
   c. target_table and target_field in server-side allowlist
   d. target record ID matches resolved entity from document links
   e. allow_apply_to_existing = TRUE for that mapping
9. Server writes fields to target table via existing server action (e.g., updateEmployeeIdentityDocument)
10. Server logs to audit_logs (module_code = target module)
11. Server inserts into dms_erp_mapping_apply_runs + dms_erp_mapping_apply_items
12. UI invalidates ERP record queries
```

**Important:** Phase 9 writes must go through the **existing server actions** (`updateEmployeeIdentityDocument`, `updatePartyLicense`, etc.) to preserve existing validation, audit, and RLS patterns — NOT direct SQL.

---

## 19. Permission Model Plan

### Dual permission gate (Phase 9)

Every ERP mapping apply requires **both**:

| Gate | Purpose |
|------|---------|
| DMS gate | `dms.documents.edit` OR `dms.admin` | User can edit DMS documents |
| Target gate | Table-specific permission from `ERP_MAPPING_TARGET_REGISTRY` | User can edit the target ERP record |

### Confirmed permission matrix

| Target table | DMS permission | ERP permission |
|--------------|----------------|----------------|
| `employee_identity_documents` | `dms.documents.edit` / `dms.admin` | `hr.compliance.manage` / `hr.admin` |
| `employee_medical_insurances` | `dms.documents.edit` / `dms.admin` | `hr.compliance.manage` / `hr.admin` |
| `party_licenses` | `dms.documents.edit` / `dms.admin` | `master_data.parties.manage_licenses` |
| `party_tax_registrations` | `dms.documents.edit` / `dms.admin` | `master_data.parties.manage_tax` |

### Phase 8 preview-only

Phase 8 requires only: `dms.documents.view` OR `dms.admin` to see the preview. The ERP target permissions are **shown** in the UI (e.g., "Requires `hr.compliance.manage` to apply") but not enforced in Phase 8.

---

## 20. ERP Mapping Audit Plan

### Phase 8 (preview only)

```
dms_erp_mapping_previewed  — when user opens the ERP mapping preview panel
  payload: { document_id, document_type_id, mapping_count, entity_types_found }
```

### Phase 9 (apply)

```
dms_erp_mapping_apply_started     — before first field write
dms_erp_mapping_field_applied     — per field written to ERP
dms_erp_mapping_field_skipped     — per skipped field
dms_erp_mapping_apply_completed   — after all fields
dms_erp_mapping_apply_failed      — on error
```

**Required fields in each Phase 9 audit entry:**

```
dms_document_id, metadata_definition_id, mapping_id
dms_metadata_value_summary (≤100 chars)
target_module, target_table, target_record_id, target_field
old_target_value_summary (≤100 chars), new_target_value_summary (≤100 chars)
applied_by, timestamp
confirmation_flags: { replace_confirmed, target_record_confirmed }
```

**Never logged:** raw OCR text, AI prompts, raw AI response, full document content.

---

## 21. Integration with Existing HR Compliance DMS Prefill

### Current state

`compliance-dms-prefill.ts` solves **prefill for creating new HR compliance records** from DMS documents. It:
- Reads from `dms_ai_extraction_results` (raw AI extraction, not approved metadata)
- Reads from document-level fields (`title`, `document_no`, `issue_date`, `expiry_date`)
- Does NOT read `dms_document_metadata_values`
- Returns suggestions only (no DB write)
- Is invoked when a user clicks "Prefill from DMS" in an HR compliance form

### Phase 8 relationship

Phase 8 solves **update of existing HR compliance records** from **approved DMS metadata** (`dms_document_metadata_values`). These are two distinct workflows:

| Aspect | Existing prefill | Phase 8 ERP mapping |
|--------|-----------------|---------------------|
| Source | `extracted_fields_json` (raw AI) | `dms_document_metadata_values` (approved Phase 6 metadata) |
| Target | New record form pre-population | Existing ERP record comparison/update |
| Triggered by | HR user creating a new compliance record | DMS user reviewing document with active mappings |
| Writes | No (suggestion only) | No in Phase 8; Yes in Phase 9 |

### Integration decision

**Do NOT replace or merge `compliance-dms-prefill.ts` in Phase 8.** The two systems serve different workflows and must coexist:

1. `compliance-dms-prefill.ts` → "Create HR compliance record prefilled from DMS document"
2. Phase 8 ERP mapping → "Compare/update existing HR compliance record from approved DMS metadata"

**Phase 9 can optionally unify** the source layer (prefer `dms_document_metadata_values` over raw `extracted_fields_json`) once the approved metadata is consistently populated.

### Shared utilities to reuse

Phase 8 can reuse from `lib/hr/compliance/`:
- `normalizeDateValue()` — date normalization for display/comparison
- `DMS_TYPE_TO_HR_IDENTITY_CODE` mapping — to determine which `document_type_id` to look for in `employee_identity_documents`
- `pickStringField()` — field extraction helper

---

## 22. UI / UX Options and Recommendation

### Option A — Admin Mapping Registry Only
Configure mappings in DMS Admin. No document-level UI.

### Option B — Registry + Read-only ERP Diff Preview
Admin registry + document record shows DMS metadata vs ERP field values.

### Option C — Full Apply to ERP
Registry + preview + apply.

### Recommendation: **Option B for Phase 8 / Option C for Phase 9**

#### Phase 8 UI locations

**1. DMS Admin → Metadata Definitions → per-definition "ERP Mappings" child tab**

Uses `ERPChildDialogForm` pattern (per ERP child dialog standard). Displays a list of active mappings per definition; allows admin to add/edit/delete mappings.

Form fields (mapping create/edit):
- Target module (dropdown: HR / Party)
- Target table (dropdown, filtered by module, from allowlist)
- Target field (dropdown, filtered by table, from allowlist)
- Target record strategy (`link_exact` / `link_parent`)
- Mapping priority (number)
- Requires confirmation (checkbox, always true for now)
- Required permission (read-only, auto-populated from allowlist)
- Notes

**2. Document Record → AI Analysis tab → "ERP Mapping Preview" section**

New collapsible section below Apply History (Phase 7). Renders:
- If no active mappings for document type: "No ERP mappings configured for this document type"
- If no document links: "Link this document to an entity to enable ERP mapping preview"
- If mappings exist: read-only diff table

**ERP Mapping Preview table columns:**
- Field label (DMS metadata definition label)
- DMS value (from `dms_document_metadata_values`)
- ERP record (target record display name + link)
- ERP current value
- Status badge (same / new / changed / no_dms_value / no_target)
- Required permission (shown when user lacks it)

No Apply button in Phase 8.

---

## 23. RLS / Security Plan

### `dms_metadata_erp_mappings`

```sql
-- SELECT: dms.documents.view, dms.admin, system_admin
-- INSERT/UPDATE/DELETE: dms.admin, system_admin only
-- No anonymous access
-- FORCE ROW LEVEL SECURITY
```

### Phase 9 apply tables

```sql
-- dms_erp_mapping_apply_runs / dms_erp_mapping_apply_items
-- SELECT: same as dms_metadata_erp_mappings
-- INSERT: requires both DMS and target module permission (server-side enforced before admin client write)
```

### Additional server-side validation (RLS alone is insufficient)

- `target_table` verified against `ERP_MAPPING_TARGET_REGISTRY` before any query
- `target_field` verified against per-table allowlist
- Target record ID verified via document links before Phase 9 write
- Dual permission check before Phase 9 write

---

## 24. Backward Compatibility Plan

| Feature | Impact |
|---------|--------|
| Phase 6 Apply-to-Metadata | No impact — new tables/UI only |
| Phase 7 Apply History | No impact |
| Manual metadata editing | No impact |
| HR compliance DMS prefill | No impact — not modified; coexists |
| AI Analysis run/re-run | No impact |
| Document links | Read-only use; not modified |
| Orchestration | No impact |
| Tag/link suggestions | No impact |

---

## 25. Recommended Phase 8 Implementation Scope

**Recommendation: Option 2 — Mapping Registry + Read-only ERP Diff Preview**

### Rationale

1. Writing to ERP records has high risk: wrong target record, permission edge cases, data integrity. Showing a preview first allows users to validate mapping quality before any writes.
2. Admin UI for mapping configuration is a pre-requisite for any apply workflow — can't apply without valid mappings.
3. The read-only diff is zero-risk to existing data — it only reads.
4. This scope is achievable in one focused phase without the full apply-to-ERP plumbing.
5. Phase 9 can add the Apply button with confidence once mappings are validated by real users.

### Phase 8 scope summary

```
✓ dms_metadata_erp_mappings migration + RLS
✓ ERP mapping target registry TypeScript constant
✓ getDmsErpMappings (admin CRUD) server action
✓ getDmsErpMappingPreview(documentId) server action
✓ Admin UI: Metadata Definitions → ERP Mappings child tab
✓ Document AI Analysis tab: ERP Mapping Preview panel (read-only)
✓ Source of truth update
✓ Implementation report
✗ No writes to HR/Party records
✗ No dms_erp_mapping_apply_runs tables (Phase 9)
```

---

## 26. Implementation Sequence for Future Phase 8 Execution

```
Step 0: Review Phase 8 plan + Phase 7 report + compliance-dms-prefill.ts in depth
Step 1: Create erp-mapping-targets.ts — server-side TypeScript allowlist constant
Step 2: Migration — dms_metadata_erp_mappings + RLS
Step 3: Server actions — getDmsErpMappings, createDmsErpMapping, updateDmsErpMapping, deleteDmsErpMapping
Step 4: Server action — getDmsErpMappingPreview(documentId)
Step 5: Query keys for mapping registry and preview
Step 6: Admin UI — DMS Admin → Metadata Definitions → ERP Mappings child tab
Step 7: Document AI Analysis tab — ErpMappingPreviewPanel (read-only, below ApplyHistoryPanel)
Step 8: Typecheck (npx tsc --noEmit) — must exit 0
Step 9: Update source of truth + create implementation report
```

---

## 27. Acceptance Criteria for Future Implementation

| AC | Criterion |
|----|-----------|
| AC-01 | ERP mapping architecture uses verified actual ERP table/field names (no invented columns) |
| AC-02 | Mapping rules validated against `ERP_MAPPING_TARGET_REGISTRY` server-side allowlist |
| AC-03 | Mapping registry supports multiple mappings per metadata definition |
| AC-04 | Mapping registry is admin-managed only (`dms.admin` / `system_admin`) |
| AC-05 | Document ERP mapping preview shows DMS metadata value vs current ERP value side-by-side |
| AC-06 | Preview requires a confirmed DMS document link to a target entity |
| AC-07 | Ambiguous targets (multiple candidate records) are shown as requiring human selection (Phase 9) |
| AC-08 | No ERP record is updated in Phase 8 |
| AC-09 | Existing HR compliance DMS prefill is not broken or duplicated |
| AC-10 | Required permissions per target are documented and shown in preview |
| AC-11 | RLS protects `dms_metadata_erp_mappings` — admin-only write, viewer read |
| AC-12 | `npx tsc --noEmit` exits 0 after implementation |

---

## 28. Full Test Plan

### TC-01 — Mapping registry validates target table
- **Purpose:** Verify server-side allowlist blocks invalid tables
- **Steps:** Attempt to create a mapping with `target_table = "employees"` (not in allowlist for field writes)
- **Expected:** Validation error: "target_table not in allowed registry"
- **Risk:** AC-02

---

### TC-02 — Mapping registry rejects unknown target table
- **Steps:** `target_table = "some_random_table"` in create mapping
- **Expected:** Validation error
- **Risk:** AC-02

---

### TC-03 — Mapping registry rejects unknown target field
- **Steps:** `target_table = "party_licenses"`, `target_field = "license_code"` (system-generated, not in safe_fields)
- **Expected:** Validation error: "target_field not in allowed fields for party_licenses"
- **Risk:** AC-02

---

### TC-04 — Metadata definition can have multiple mappings
- **Setup:** `expiry_date` definition; create mappings to both `employee_identity_documents.expiry_date` and `party_licenses.expiry_date`
- **Expected:** Both mappings active; returned by `getDmsErpMappings(definitionId)`
- **Risk:** AC-03

---

### TC-05 — Document with employee link shows HR mapping preview
- **Setup:** Document linked to `employee_identity_document #5`; document type has `expiry_date` mapping to `employee_identity_documents`
- **Steps:** `getDmsErpMappingPreview(documentId)`
- **Expected:** Preview row shows DMS `expiry_date` vs `employee_identity_documents.expiry_date` value
- **Risk:** AC-05, AC-06

---

### TC-06 — Document with party link shows Party mapping preview
- **Setup:** Document linked to `party_license #7`; document type has `license_number` mapping to `party_licenses`
- **Expected:** Preview row shows DMS `license_number` vs `party_licenses.license_number`
- **Risk:** AC-05

---

### TC-07 — Document with no link shows no-target warning
- **Setup:** Document with no `dms_document_links`
- **Expected:** Preview shows "Link this document to an entity to enable ERP mapping preview"
- **Risk:** AC-06

---

### TC-08 — Ambiguous HR target shows manual selection required
- **Setup:** Document linked to `employee` (not specific child); employee has 2 `employee_identity_documents`
- **Expected:** Preview shows "2 identity documents found — select target in Phase 9 apply"
- **Risk:** AC-07

---

### TC-09 — User without DMS permission cannot view preview
- **Setup:** User with no DMS permissions
- **Steps:** `getDmsErpMappingPreview(documentId)` called
- **Expected:** Permission denied
- **Risk:** AC-11

---

### TC-10 — User without target permission sees preview but cannot apply
- **Setup:** User with `dms.documents.view` but no `hr.compliance.manage`
- **Expected:** Preview renders; required permission shown as "Requires hr.compliance.manage to apply"; no apply button (Phase 8 has no apply anyway)
- **Risk:** AC-10

---

### TC-11 — Existing compliance-dms-prefill still works
- **Setup:** HR compliance form with a DMS document
- **Steps:** Click "Prefill from DMS"
- **Expected:** Prefill works exactly as before; no change to `compliance-dms-prefill.ts`
- **Risk:** AC-09

---

### TC-12 — No ERP write occurs
- **Steps:** Search codebase for any HR/Party update calls in new Phase 8 files
- **Expected:** Zero writes to `employee_identity_documents`, `party_licenses`, `party_tax_registrations`, `employees`
- **Risk:** AC-08

---

### TC-13 — Mapping registry INSERT requires dms.admin
- **Setup:** User with `dms.documents.edit` only (not admin)
- **Steps:** Call `createDmsErpMapping()`
- **Expected:** Permission denied
- **Risk:** AC-04, AC-11

---

### TC-14 — Typecheck
- **Steps:** `npx tsc --noEmit`
- **Expected:** Exit code 0
- **Risk:** AC-12

---

### TC-15 — Lint
- **Steps:** `npm run lint`
- **Expected:** No new errors

---

### TC-16 — Build
- **Steps:** `npm run build`
- **Expected:** No errors

---

## 29. Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Admin creates mapping to a column that exists but is a FK (e.g., `document_type_id`) — writing raw text fails | Medium | DB error or silent wrong value | `safe_fields` allowlist excludes all FK columns |
| DMS metadata value for a date field is stored as text with wrong format | Low | Preview shows mismatched values | Normalize using `normalizeDateValue()` from `dms-to-identity-map.ts` |
| `link_parent` strategy finds >1 child record of same type — ambiguous | Medium | Preview shows wrong target | Show all candidates; Phase 9 requires explicit user selection |
| `getDmsErpMappingPreview` is slow on documents with many mappings and links | Low | Poor UX | Batch-load all target records in one query; add `staleTime: 30s` |
| Phase 9 inadvertently skips the `allow_apply_to_existing` guard | Low | Overwrites ERP data without admin config | Server validates `allow_apply_to_existing = TRUE` before any write |
| `compliance-dms-prefill.ts` is updated in a future refactor and diverges from Phase 8 | Medium | Duplicate systems | Note dependency; sync in Phase 9 |
| New `dms_metadata_erp_mappings` rows not in Supabase generated types | Confirmed | TypeScript cast needed | Use `unknown[]` cast pattern (same as Phase 7) until type regen |

---

## 30. What Must Not Be Implemented in Phase 8

```
✗ Auto-apply to ERP records
✗ Write to employee_identity_documents
✗ Write to employee_medical_insurances
✗ Write to party_licenses
✗ Write to party_tax_registrations
✗ Write to employees
✗ Create HR/Party/Fleet/Asset records from DMS metadata
✗ Bulk apply without review
✗ Bypass target module permissions
✗ Replace compliance-dms-prefill.ts without migration plan
✗ dms_erp_mapping_apply_runs / dms_erp_mapping_apply_items tables (Phase 9)
✗ Async job queue
✗ Semantic chunks
✗ Azure OCR wiring
✗ OCR history
✗ Review queue UI
✗ Auto-overwrite approved metadata
✗ Major UI redesign
✗ Fleet / asset mapping (unverified tables)
```

---

## 31. Recommended Next Cursor Implementation Prompt

```
ERP_DMS_AI_PHASE_8_ERP_MAPPING_IMPLEMENTATION_PROMPT.md
```

The implementation prompt should:
1. Reference this plan (Section 26 — Implementation Sequence)
2. Reference `src/lib/dms/erp-mapping/erp-mapping-targets.ts` (new file to create — Section 15)
3. Reference migration name pattern: `20260622XXXXXX_erp_dms_ai_phase8_erp_mappings.sql`
4. Reference new server actions file: `src/server/actions/dms/erp-mappings.ts`
5. Reference UI changes: `src/features/dms/admin/dms-metadata-definitions-table.tsx` + new child dialog + new preview panel in `dms-document-ai-section.tsx`
6. Explicitly reference `ERP_MAPPING_TARGET_REGISTRY` as the server-side safety gate
7. Require `npx tsc --noEmit` exits 0 before reporting completion
8. Explicitly forbid any ERP module writes
9. Note: use `unknown[]` cast for Supabase queries on new tables (types not regenerated)

---

## 32. Final Recommendation

**Phase 8 = Mapping Registry + Read-only ERP Diff Preview.**

This is the correct staged approach because:

1. **Mapping quality must be validated in production** before any writes. A misconfigured mapping (wrong target field, wrong relation field) would corrupt ERP data. Read-only preview allows validation at zero risk.

2. **The existing `compliance-dms-prefill.ts` already solves the create-new-record path.** Phase 8 solves the update-existing-record path using approved metadata. These are complementary, not competing.

3. **The `ERP_MAPPING_TARGET_REGISTRY` allowlist is the critical safety mechanism.** It must be reviewed and approved by architecture review before Phase 9 implements any writes. The registry is the most important deliverable of Phase 8.

4. **Admin UI for mapping configuration is zero-write, zero-risk.** It is the necessary foundation before Phase 9 can proceed.

5. **Phase 9 can then implement apply-to-ERP** with confidence, knowing mappings have been validated, permissions are correct, and the read-model (preview) has been user-tested.
