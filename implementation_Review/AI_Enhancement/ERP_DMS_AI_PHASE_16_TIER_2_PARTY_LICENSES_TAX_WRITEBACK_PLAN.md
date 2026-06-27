# ERP DMS AI Phase 16 Tier 2 — Party Licenses and Tax Registration Write-back Plan

**Gate:** ERP DMS AI Phase 16 Tier 2  
**Status:** PLANNING (not yet implemented)  
**Date:** 2026-06-26  
**Planned by:** Cursor AI (Claude Sonnet 4.6)  
**Scope:** Extend Human-Reviewed Apply-to-ERP to `party_licenses` and `party_tax_registrations`

---

## 1. Executive Summary

Phase 16 Tier 2 extends the proven Apply-to-ERP architecture from Tier 1 (DMS document fields and metadata) to Party Master child records: `party_licenses` and `party_tax_registrations`. Every write requires human selection of both the target party and the specific child row, human confirmation, dual DMS + Party permission, feature flags, conflict detection, and full audit trail.

No auto-creation of party records, licenses, or tax registrations is permitted. No HR, bank, IBAN, or direct party profile writes occur.

The core `dms_ai_erp_apply_runs` / `dms_ai_erp_apply_items` tables from Tier 1 are reused without new tables. The primary DB migration change is extending the `target_module` CHECK constraint to add `'party'`.

**Key implementation facts confirmed by inspection:**
- `party_licenses` has 24 columns; 6 are safely writable: `license_number`, `license_name`, `license_activity_text`, `issue_date`, `expiry_date`, `remarks`
- `party_tax_registrations` has 19 columns; 4 are safely writable: `tax_registration_number`, `effective_from`, `effective_to`, `remarks`
- Permissions `master_data.parties.manage_licenses` and `master_data.parties.manage_tax` already exist in the DB
- Phase 8 ERP mapping registry (`erp-mapping-targets.ts`) already defines the exact same field allowlist — Tier 2 should reuse it
- `target_module` DB CHECK constraint must be extended (`'dms_document' | 'dms_metadata'` → add `'party'`)
- Existing `apply-target-registry.test.ts` explicitly tests that `party_licenses.license_number` is **blocked** — these tests must be updated when Tier 2 adds party targets

---

## 2. Planning Scope and Non-Implementation Rule

**This is a planning document only.**

- No source code changed
- No UI modified
- No migrations applied
- No server actions added
- No schema altered

This plan must be reviewed by ChatGPT before implementation proceeds.

### Tier 2 Scope

| In Scope | Out of Scope |
|---|---|
| `party_licenses` field write-back | `parties` direct profile write-back |
| `party_tax_registrations` field write-back | `party_bank_details` write-back |
| Human-selected target party + child row | `party_contacts`, `party_addresses` write-back |
| DMS AI extraction and entity match sources | HR / payroll / salary write-back |
| Feature flags (default false) | Auto-create party, license, or tax row |
| Dual permission enforcement | Bulk apply across parties/documents |
| Conflict detection and audit trail | Background apply jobs |

---

## 3. Files and Source-of-Truth Reviewed

### Required Files Read

| File | Status | Notes |
|---|---|---|
| `.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md` | ✅ Read | Phase 16 Tier 1 confirmed LIVE PASS/CLOSED |
| `implementation_Review/ERP_DMS_AI_PHASE_16_TIER_1_RUNTIME_UAT_AND_CLOSURE_REPORT.md` | ✅ Read | All 20 UAT checks passed |
| `implementation_Review/ERP_DMS_AI_PHASE_16_HUMAN_REVIEWED_APPLY_TO_ERP_IMPLEMENTATION_REPORT.md` | ✅ Read | Implementation baseline |
| `src/lib/dms/apply-to-erp/types.ts` | ✅ Read | `ApplyTargetModule` = `"dms_document" \| "dms_metadata"` |
| `src/lib/dms/apply-to-erp/apply-target-registry.ts` | ✅ Read | Tier 1 only; party explicitly NOT in allowlist |
| `src/lib/dms/apply-to-erp/apply-conflict-detector.ts` | ✅ Read | `dms_documents` and `dms_metadata` conflict detection |
| `src/lib/dms/apply-to-erp/apply-source-resolver.ts` | ✅ Read | Entity match and validation finding sources |
| `src/lib/dms/apply-to-erp/apply-value-normalizer.ts` | ✅ Read | Date, text, bigint normalization |
| `src/lib/dms/apply-to-erp/apply-audit.ts` | ✅ Read | Audit event builders |
| `src/lib/dms/apply-to-erp/index.ts` | ✅ Read | All exports |
| `src/server/actions/dms/apply-to-erp.ts` | ✅ Read | 6 server actions; no `apply-engine.ts` (engine in server action) |
| `src/lib/dms/erp-mapping/erp-mapping-targets.ts` | ✅ Read | Phase 8 registry already defines party_licenses + party_tax fields |
| `src/server/actions/master-data/party-licenses.ts` | ✅ Read | Uses `master_data.parties.manage_licenses` permission |
| `src/server/actions/master-data/party-tax-registrations.ts` | ✅ Read | Uses `master_data.parties.manage_tax` permission |
| `src/lib/dms/apply-to-erp/__tests__/apply-target-registry.test.ts` | ✅ Read | Explicitly tests `party_licenses.license_number` as **blocked** |
| DB: `party_licenses` schema | ✅ Queried | 24 columns confirmed |
| DB: `party_tax_registrations` schema | ✅ Queried | 19 columns confirmed |
| DB: `dms_ai_erp_apply_runs` CHECK constraints | ✅ Queried | `target_module` must be extended |
| DB: permissions table | ✅ Queried | `manage_licenses` and `manage_tax` confirmed present |
| DB: feature flags | ✅ Queried | 3 Tier 1 flags present, all false |

### Missing Files (not found, not invented)

| File | Status |
|---|---|
| `implementation_Review/ERP_DMS_AI_PHASE_16_SECURITY_RLS_QA_CHECKS.sql` | Not found |
| `implementation_Review/ERP_DMS_AI_PHASE_16_PAYLOAD_SAFETY_CHECKS.sql` | Not found |
| `implementation_Review/ERP_DMS_AI_PHASE_15_RUNTIME_UAT_CHECKLIST.md` | Not found |
| `src/features/dms/apply-to-erp/*.tsx` | Not found — UI components use `src/features/dms/review-queue/` and document AI tab |

---

## 4. Phase 16 Tier 1 Reuse Analysis

### What Tier 2 reuses unchanged

| Component | Reuse decision |
|---|---|
| `dms_ai_erp_apply_runs` table | Fully reused — `target_module='party'` added via CHECK constraint extension |
| `dms_ai_erp_apply_items` table | Fully reused — no schema changes needed |
| `apply-audit.ts` | Fully reused — `buildRunCreatedMeta`, `buildItemAppliedMeta` etc. used as-is |
| `applyDmsApplyToErpRun` write contract | Reused — party write added as a new `if` branch inside item loop |
| `createDmsApplyToErpRun` | Reused — Zod schema extended to accept `targetModule: "party"` |
| `getDmsApplyToErpRun`, `listDmsApplyToErpRuns`, `cancelDmsApplyToErpRun` | Fully reused unchanged |
| `getDmsApplyToErpPreview` | Fully reused — allowlist extended to include party targets |
| `DmsApplyToErpConfirmDialog` UI | Reused — party context shown in dialog header |
| `DmsApplyToErpItemTable` UI | Reused — table already supports `targetTable` display |
| `DmsApplyToErpRunHistory` UI | Reused — filter extended to show party runs |
| Audit event types | Reused — same 5 event types (`run_created`, `item_applied`, `item_skipped`, `item_conflict`, `run_completed`) |
| Payload safety pattern | Fully reused — `proposed_value_summary` max 200 chars, no raw content |
| Unit test pattern | Reused and extended |

### What Tier 2 must extend

| Component | Extension needed |
|---|---|
| `types.ts` — `ApplyTargetModule` | Add `"party"` |
| `types.ts` — `ApplySourceType` | No change — `extraction_result` and `entity_match_candidate` already cover Tier 2 |
| `apply-target-registry.ts` | Add `party_licenses` and `party_tax_registrations` targets |
| `apply-value-normalizer.ts` | Add TRN partial masking (`maskTrnSummary`); add license number summary truncation |
| `apply-conflict-detector.ts` | Add `detectPartyLicenseFieldConflict` and `detectPartyTaxFieldConflict` |
| `apply-source-resolver.ts` | Add party child row proposal resolver for extraction_result source |
| `apply-to-erp.ts` server action | Add Tier 2 sub-flag checks; extend write loop; add `getPartyApplyTargetRows` action |
| `CreateRunInputSchema` Zod | Extend `targetModule` enum to include `"party"` |
| `apply-target-registry.test.ts` | Update tests: `party_licenses.license_number` changes from **blocked** to **allowed** |
| `apply-conflict-detector.test.ts` | Add party record conflict detection tests |
| DB migration | Extend `target_module` CHECK; seed 3 new flags |
| UI — party target selector | New `DmsPartyTargetSelector` component (party + child row picker) |

### What Tier 2 must NOT touch

| Component | Reason |
|---|---|
| `dms_ai_erp_apply_runs` / `dms_ai_erp_apply_items` tables themselves | No new columns needed — party context derivable from target record |
| Tier 1 allowlisted targets (`dms_documents`, `dms_document_metadata_values`) | Must not be removed or modified |
| `DMS_AI_APPLY_TO_ERP`, `DMS_AI_APPLY_TO_ERP_DMS_METADATA`, `DMS_AI_APPLY_TO_ERP_ENTITY_LINKS` flags | Must not be modified |
| `parties` table, `party_bank_details`, HR tables | Must remain forbidden |

---

## 5. Party License Schema Verification

**Live schema — `party_licenses` (24 columns verified):**

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | BIGINT | NO | PK — not writable by apply |
| `license_code` | TEXT | NO | System-generated — **FORBIDDEN for apply** |
| `party_id` | BIGINT | NO | FK to parties — not writable by apply (parent identifier) |
| `license_type_id` | BIGINT | NO | FK — not writable by apply |
| `license_number` | TEXT | NO | **ALLOWED for apply** (text) |
| `license_name` | TEXT | YES | **ALLOWED for apply** (text) |
| `issuing_authority_party_id` | BIGINT | YES | FK — not writable by apply |
| `issuing_country_id` | BIGINT | YES | FK — not writable by apply |
| `issuing_emirate_id` | BIGINT | YES | FK — not writable by apply |
| `issue_date` | DATE | YES | **ALLOWED for apply** (date) |
| `expiry_date` | DATE | YES | **ALLOWED for apply** (date) |
| `renewal_required` | BOOLEAN | NO | System-managed — **FORBIDDEN for apply** |
| `renewal_notice_days` | INTEGER | YES | System-managed — **FORBIDDEN for apply** |
| `license_status_id` | BIGINT | NO | FK — not writable by apply |
| `license_activity_text` | TEXT | YES | **ALLOWED for apply** (text) |
| `license_document_id` | BIGINT | YES | Legacy FK — not writable by apply |
| `is_primary` | BOOLEAN | NO | User-managed flag — not writable by apply |
| `is_active` | BOOLEAN | NO | System-managed flag — not writable by apply |
| `remarks` | TEXT | YES | **ALLOWED for apply** (text) |
| `created_at` | TIMESTAMPTZ | NO | System — not writable |
| `created_by` | BIGINT | YES | System — not writable |
| `updated_at` | TIMESTAMPTZ | NO | System — not writable |
| `updated_by` | BIGINT | YES | System — updated by apply |
| `dms_license_document_id` | BIGINT | YES | DMS FK — not writable by apply |

### Tier 2 Party License Apply Targets

| Field | Value Type | Replaceable | Permission | Normalizer | Conflict Rule | Audit Label |
|---|---|---|---|---|---|---|
| `license_number` | text | true | `master_data.parties.manage_licenses` | text; trim; max 200 chars | replaceable=true; existing value prompts confirmation | License Number |
| `license_name` | text | true | `master_data.parties.manage_licenses` | text; trim; max 200 chars | replaceable=true | License Name |
| `license_activity_text` | text | true | `master_data.parties.manage_licenses` | text; trim; max 500 chars | replaceable=true | License Activity |
| `issue_date` | date | true | `master_data.parties.manage_licenses` | ISO YYYY-MM-DD; must ≤ expiry_date | replaceable=true | Issue Date |
| `expiry_date` | date | true | `master_data.parties.manage_licenses` | ISO YYYY-MM-DD; must ≥ issue_date | replaceable=true | Expiry Date |
| `remarks` | text | true | `master_data.parties.manage_licenses` | text; trim; max 1000 chars | replaceable=true | Remarks |

**Audit summary masking for `license_number`:** Show as-is for now (not classified as sensitive); future phases may apply partial masking if legally required.

**Source:** Phase 8 `erp-mapping-targets.ts` (`party.party_licenses`) — verified to match live schema.

---

## 6. Party Tax Registration Schema Verification

**Live schema — `party_tax_registrations` (19 columns verified):**

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | BIGINT | NO | PK — not writable by apply |
| `tax_registration_code` | TEXT | NO | System-generated — **FORBIDDEN for apply** |
| `party_id` | BIGINT | NO | FK to parties — not writable by apply (parent identifier) |
| `tax_type_id` | BIGINT | NO | FK — not writable by apply |
| `tax_registration_number` | TEXT | NO | **ALLOWED for apply** (text) — **apply partial mask in summary** |
| `tax_country_id` | BIGINT | YES | FK — not writable by apply |
| `tax_status_id` | BIGINT | NO | FK — not writable by apply |
| `effective_from` | DATE | YES | **ALLOWED for apply** (date) |
| `effective_to` | DATE | YES | **ALLOWED for apply** (date) |
| `certificate_document_id` | BIGINT | YES | Legacy FK — not writable by apply |
| `reverse_charge_applicable` | BOOLEAN | NO | Accounting flag — not writable by apply |
| `vat_exempt` | BOOLEAN | NO | Accounting flag — not writable by apply |
| `is_primary` | BOOLEAN | NO | User-managed — not writable by apply |
| `is_active` | BOOLEAN | NO | System-managed — not writable by apply |
| `remarks` | TEXT | YES | **ALLOWED for apply** (text) |
| `created_at` | TIMESTAMPTZ | NO | System — not writable |
| `created_by` | BIGINT | YES | System — not writable |
| `updated_at` | TIMESTAMPTZ | NO | System — not writable |
| `updated_by` | BIGINT | YES | System — updated by apply |
| `dms_certificate_document_id` | BIGINT | YES | DMS FK — not writable by apply |

### Tier 2 Party Tax Registration Apply Targets

| Field | Value Type | Replaceable | Permission | Normalizer | Conflict Rule | Audit Label |
|---|---|---|---|---|---|---|
| `tax_registration_number` | text | true | `master_data.parties.manage_tax` | text; trim; max 50 chars; **mask middle 50% in summary** | replaceable=true | Tax Registration Number |
| `effective_from` | date | true | `master_data.parties.manage_tax` | ISO YYYY-MM-DD; must ≤ effective_to | replaceable=true | Effective From |
| `effective_to` | date | true | `master_data.parties.manage_tax` | ISO YYYY-MM-DD; must ≥ effective_from | replaceable=true | Effective To |
| `remarks` | text | true | `master_data.parties.manage_tax` | text; trim; max 1000 chars | replaceable=true | Remarks |

**Audit summary masking for `tax_registration_number`:**  
`maskTrnSummary(value)` — show first 4 chars + `****` + last 4 chars. Example: `"100123456700003"` → `"1001****0003"`. This is applied in `buildValueSummary` override for TRN fields.

**Source:** Phase 8 `erp-mapping-targets.ts` (`party.party_tax_registrations`) — verified to match live schema. Live TRN metadata definition at `dms_metadata_definitions.field_code = 'trn'` (id=9, label "TRN Number") confirms field exists in DMS extraction pipeline.

---

## 7. Target Party and Child Row Resolution Strategy

### Party Resolution (who the party is)

**Step 1 — Derive party_id context from one of:**

| Source | How party_id is obtained |
|---|---|
| `dms_documents.party_id` | Document already linked to a party (preferred; trust verified by Tier 1) |
| Accepted `dms_ai_entity_match_candidate` with `target_entity_type='party'` | `candidate.target_entity_id` = party_id |
| Human selection in UI via `DmsPartyTargetSelector` | User picks a party manually |

**Priority:** document `party_id` → accepted entity match candidate → human selection.

**Server-side rule:** `party_id` must be verified to exist in the `parties` table before preview is built.

### Child Row Resolution (which license or tax record to update)

**Rule: Never auto-select. Always require explicit human selection.**

**Step 2 — Load candidate child rows:**

New server action `getPartyApplyTargetRows(documentId, partyId, targetKind)`:
- `targetKind: "party_licenses" | "party_tax_registrations"`
- Returns list of child rows for the given `partyId`
- Each row includes display fields for human selection:
  - For `party_licenses`: `id`, `license_code`, `license_number`, `license_name`, `issue_date`, `expiry_date`, `license_status_id`
  - For `party_tax_registrations`: `id`, `tax_registration_code`, `tax_registration_number`, `tax_type_id`, `effective_from`, `effective_to`, `tax_status_id`

**Step 3 — Human selects the target row:**

| Case | UI behavior | Apply behavior |
|---|---|---|
| 0 rows exist | Show "No existing {license/tax} record. Create it manually in Party Master first." | No apply run created |
| 1 row exists | Pre-select but still show row details; require explicit user confirmation | Apply proceeds after confirmation |
| 2+ rows exist | Show `DmsPartyChildRowSelector` with all rows listed | Require user selection before preview enabled |

**Step 4 — Server-side verification at apply time:**

Before writing any field, the server must verify:
1. `party_licenses.id` (or `party_tax_registrations.id`) = `target_record_id` in apply item
2. The child row's `party_id` matches the `party_id` context passed during preview
3. The child row has not been deleted since preview
4. The child row is still active (`is_active = true`)
5. The child row belongs to the same party as the document's party context

If any check fails → `conflict` status, item skipped, reason logged.

---

## 8. Eligible Source Types and Mapping Strategy

### Eligible source types for Tier 2

| Source Type | Use case | Notes |
|---|---|---|
| `extraction_result` | DMS AI extracted `license_number`, `expiry_date`, etc. from document OCR | Primary path |
| `entity_match_candidate` | Party match already accepted → party_id known | Used for party context, not field values |
| `validation_finding` | AI flagged expired license date → propose update | Secondary path |

### DMS Metadata → Party Field Mapping

The following DMS `dms_metadata_definitions` field codes map to party child fields:

| DMS Metadata Field Code | Observed in DB | Maps to | Target Table |
|---|---|---|---|
| `license_number` | ✅ ids 1, 105 | `party_licenses.license_number` | `party_licenses` |
| `issue_date` | ✅ multiple ids | `party_licenses.issue_date` | `party_licenses` |
| `expiry_date` | ✅ multiple ids | `party_licenses.expiry_date` | `party_licenses` |
| `trn` | ✅ id 9 | `party_tax_registrations.tax_registration_number` | `party_tax_registrations` |

The ERP mapping registry in `src/lib/dms/erp-mapping/erp-mapping-targets.ts` already encodes these mappings for Phase 8. The Tier 2 apply source resolver should reference this registry for field mapping decisions.

### Source-to-apply flow (recommended)

```text
1. Document has accepted entity_match_candidate → party_id known
2. DMS extraction result has license_number, expiry_date → proposed values known
3. User navigates to Apply-to-ERP panel in Review Queue or AI tab
4. UI calls getPartyApplyTargetRows(documentId, partyId, "party_licenses")
5. User selects which party_licenses row to update
6. getDmsApplyToErpPreview() builds proposals mapped to selected row
7. User reviews items in DmsApplyToErpPreview (with party + child row context header)
8. createDmsApplyToErpRun() creates history (no write)
9. User confirms in DmsApplyToErpConfirmDialog (with Party label)
10. applyDmsApplyToErpRun() server-reloads child row, conflict-checks, writes
```

---

## 9. Feature Flags

### Tier 2 new flags (seed in migration, all default false)

| Flag | Default | Description |
|---|---|---|
| `DMS_AI_APPLY_TO_ERP_PARTY` | `false` | Master sub-flag: gate all Party write-back |
| `DMS_AI_APPLY_TO_ERP_PARTY_LICENSES` | `false` | Enable `party_licenses` write-back |
| `DMS_AI_APPLY_TO_ERP_PARTY_TAX` | `false` | Enable `party_tax_registrations` write-back |

### Full flag chain required for each operation

**Party License apply:**
```
DMS_AI_APPLY_TO_ERP = true        (master — Tier 1)
AND DMS_AI_APPLY_TO_ERP_PARTY = true   (Tier 2 party master gate)
AND DMS_AI_APPLY_TO_ERP_PARTY_LICENSES = true  (license-specific)
```

**Party Tax apply:**
```
DMS_AI_APPLY_TO_ERP = true
AND DMS_AI_APPLY_TO_ERP_PARTY = true
AND DMS_AI_APPLY_TO_ERP_PARTY_TAX = true
```

### Flags NOT changed by Tier 2

```
DMS_AI_APPLY_TO_ERP_DMS_METADATA    (unchanged)
DMS_AI_APPLY_TO_ERP_ENTITY_LINKS    (unchanged)
DMS_AI_REVIEW                       (unchanged)
DMS_AI_JOB_QUEUE                    (unchanged)
DMS_AI_OBSERVABILITY                (unchanged)
DMS_AI_VALIDATION                   (unchanged)
DMS_AI_ENTITY_MATCHING              (unchanged)
```

---

## 10. Permission Model

### Permissions verified in live DB

| Permission Code | Status | Use |
|---|---|---|
| `dms.apply_to_erp.preview` | ✅ exists (Tier 1) | Required for preview |
| `dms.apply_to_erp.run` | ✅ exists (Tier 1) | Required for createRun and apply |
| `dms.apply_to_erp.admin` | ✅ exists (Tier 1) | Admin override |
| `master_data.parties.manage_licenses` | ✅ exists in DB | Required for license write-back |
| `master_data.parties.manage_tax` | ✅ exists in DB | Required for tax write-back |
| `master_data.parties.edit` | ✅ exists in DB | Admin fallback for both |
| `master_data.parties.view` | ✅ exists in DB | Required for party row resolution |

**No new permissions need to be seeded.** All required permissions already exist.

### Dual permission requirement

**For `party_licenses` write:**
```
dms.apply_to_erp.run
AND master_data.parties.manage_licenses
(OR master_data.parties.edit as admin override)
(OR system_admin)
```

**For `party_tax_registrations` write:**
```
dms.apply_to_erp.run
AND master_data.parties.manage_tax
(OR master_data.parties.edit as admin override)
(OR system_admin)
```

### If target permission missing

```
preview: show item with locked/disabled state + tooltip "requires master_data.parties.manage_licenses"
createRun: item included but flagged as permission_required
applyRun: item skipped with status="failed", failure_reason="insufficient target permission"
server returns ActionResult with errorCode="permission_denied" for the item
```

---

## 11. Apply Target Registry Extension

### File to extend

```
src/lib/dms/apply-to-erp/apply-target-registry.ts
```

### New entries to add to `APPLY_TARGET_REGISTRY`

```typescript
"party_licenses": {
  targetModule:    "party",
  targetTable:     "party_licenses",
  tableLabel:      "Party License",
  permission:      "master_data.parties.manage_licenses",
  adminPermission: "master_data.parties.edit",
  fields: [
    { column: "license_number",        label: "License Number",    valueType: "text",  permission: "master_data.parties.manage_licenses", replaceable: true,  maxLength: 200  },
    { column: "license_name",          label: "License Name",      valueType: "text",  permission: "master_data.parties.manage_licenses", replaceable: true,  maxLength: 200  },
    { column: "license_activity_text", label: "License Activity",  valueType: "text",  permission: "master_data.parties.manage_licenses", replaceable: true,  maxLength: 500  },
    { column: "issue_date",            label: "Issue Date",        valueType: "date",  permission: "master_data.parties.manage_licenses", replaceable: true,  maxLength: null },
    { column: "expiry_date",           label: "Expiry Date",       valueType: "date",  permission: "master_data.parties.manage_licenses", replaceable: true,  maxLength: null },
    { column: "remarks",               label: "Remarks",           valueType: "text",  permission: "master_data.parties.manage_licenses", replaceable: true,  maxLength: 1000 },
  ],
},

"party_tax_registrations": {
  targetModule:    "party",
  targetTable:     "party_tax_registrations",
  tableLabel:      "Party Tax Registration",
  permission:      "master_data.parties.manage_tax",
  adminPermission: "master_data.parties.edit",
  fields: [
    { column: "tax_registration_number", label: "Tax Reg. Number", valueType: "text", permission: "master_data.parties.manage_tax", replaceable: true, maxLength: 50   },
    { column: "effective_from",          label: "Effective From",  valueType: "date", permission: "master_data.parties.manage_tax", replaceable: true, maxLength: null },
    { column: "effective_to",            label: "Effective To",    valueType: "date", permission: "master_data.parties.manage_tax", replaceable: true, maxLength: null },
    { column: "remarks",                 label: "Remarks",         valueType: "text", permission: "master_data.parties.manage_tax", replaceable: true, maxLength: 1000 },
  ],
},
```

### Forbidden patterns already blocking dangerous Party fields

The existing `FORBIDDEN_TABLE_PATTERNS` and `FORBIDDEN_FIELD_PATTERNS` already block:
- `bank_detail` pattern → blocks `party_bank_details`
- `iban` pattern → blocks IBAN fields
- `salary` and `payroll` patterns → blocks HR fields
- `disciplinar` pattern → blocks disciplinary tables
- `medical_diagnosis` pattern → blocks HR medical fields

No new forbidden patterns are required for Tier 2.

### Important: Update `listTier1ApplyTargets()` or rename function

The function `listTier1ApplyTargets()` is named for Tier 1. Consider:
- Option A: Rename to `listAllApplyTargets()` (preferred for clarity)
- Option B: Keep name; add `listTier2ApplyTargets()` returning only party targets
- Recommendation: **Option A — rename** with a deprecation note in the comment. The function just iterates `APPLY_TARGET_REGISTRY`, which now includes Tier 2 entries.

---

## 12. Apply Engine Extension

### No `apply-engine.ts` file exists

The apply engine logic is embedded directly in `applyDmsApplyToErpRun()` in `src/server/actions/dms/apply-to-erp.ts`. Tier 2 should extend the item loop inside that function.

### Extension to `apply-to-erp.ts` item processing loop

Current structure inside `applyDmsApplyToErpRun`:

```
for each confirmed item:
  1. forbidden check
  2. allowlist check
  3. target permission check
  4. sub-flag check
  5. if target_table === 'dms_documents' → handle dms_document write
  6. else → skip gracefully (metadata goes via Phase 6/7)
```

Tier 2 extends step 5 to add two new branches:

```
  5a. if target_table === 'dms_documents' → existing dms_document write
  5b. else if target_table === 'party_licenses' → NEW party license write
  5c. else if target_table === 'party_tax_registrations' → NEW party tax write
  5d. else → skip gracefully (metadata via Phase 6/7)
```

### New `apply-conflict-detector.ts` functions required

```typescript
// party_licenses conflict detection
export type PartyLicenseRecord = {
  id: number; party_id: number; license_number: string | null;
  license_name: string | null; license_activity_text: string | null;
  issue_date: string | null; expiry_date: string | null;
  remarks: string | null; deleted_at?: string | null;
  is_active: boolean;
};

export function detectPartyLicenseFieldConflict(
  currentLicense: PartyLicenseRecord | null,
  targetField: keyof PartyLicenseRecord,
  previewCurrentValue: string | null,
  replaceExistingConfirmed: boolean,
  expectedPartyId: number
): ConflictDetectionResult;
```

```typescript
// party_tax_registrations conflict detection
export type PartyTaxRecord = {
  id: number; party_id: number;
  tax_registration_number: string | null;
  effective_from: string | null; effective_to: string | null;
  remarks: string | null; is_active: boolean;
};

export function detectPartyTaxFieldConflict(
  currentTax: PartyTaxRecord | null,
  targetField: keyof PartyTaxRecord,
  previewCurrentValue: string | null,
  replaceExistingConfirmed: boolean,
  expectedPartyId: number
): ConflictDetectionResult;
```

Additional conflict cases unique to Tier 2 (beyond Tier 1's stale-value check):
- `party_id` mismatch → `{ conflict: true, reason: "child row no longer belongs to expected party" }`
- `is_active = false` → `{ conflict: true, reason: "target record is inactive" }`

### `apply-value-normalizer.ts` additions

```typescript
// New: TRN partial masking for audit summaries
export function maskTrnSummary(value: string): string {
  if (value.length <= 8) return "****";
  return value.slice(0, 4) + "****" + value.slice(-4);
}

// Extended SENSITIVE_FIELD_CODES (add "tax_registration_number")
```

**Note:** `tax_registration_number` values in `proposed_value_summary` and `applied_value_summary` columns must be masked. The `buildValueSummary` call site in the server action must check `item.target_field === "tax_registration_number"` and apply `maskTrnSummary`.

### `apply-source-resolver.ts` additions

Add a new `resolvePartyChildRowProposals()` function:
- Input: `extraction_result` pre-built items + `partyId` + `targetChildRecordId`
- Validates each proposal against the party target registry
- Sets `targetRecordId = targetChildRecordId` on each item
- Returns `ApplyItemProposal[]` with party context in `targetDisplayLabel`

### Types extension (`types.ts`)

```typescript
// Current:
export type ApplyTargetModule =
  | "dms_document"
  | "dms_metadata";
  // Phase 17+: "hr" | "party"

// Tier 2 change:
export type ApplyTargetModule =
  | "dms_document"
  | "dms_metadata"
  | "party";
  // Phase 17+: "hr"
```

---

## 13. UI / UX Plan

### New component required

**`DmsPartyTargetSelector`** (`src/components/dms/apply-to-erp/dms-party-target-selector.tsx`):
- Props: `documentId`, `partyId`, `targetKind: "party_licenses" | "party_tax_registrations"`, `onRowSelected`
- Displays party name + type
- Calls `getPartyApplyTargetRows()` to load candidate child rows
- Shows 0-row empty state with message and "Open Party Master" link
- Shows 1+ row selector with `license_code` / `tax_registration_code`, dates, status badge
- Requires explicit row selection click before preview panel activates
- **Does not show Add, Create, or New buttons**

### Existing components reused (with props extension)

| Component | Extension |
|---|---|
| `DmsApplyToErpPreview` | Add optional `partyContext?: { partyId: number; partyName: string; childTable: string; childCode: string }` prop; render party context header above item table |
| `DmsApplyToErpConfirmDialog` | Add `targetContext` in dialog header — "Apply to: [Party Name] → [License Code]" |
| `DmsApplyToErpItemTable` | No change — `targetTable` column already shows the table name |
| `DmsApplyToErpRunHistory` | Add `target_module` filter ("All / DMS / Party") |

### UI integration locations

| Location | Component update | What changes |
|---|---|---|
| DMS Review Queue Drawer | `dms-review-queue-item-drawer.tsx` | Add "Party Write-back" section below entity match section; shows `DmsPartyTargetSelector` when `DMS_AI_APPLY_TO_ERP_PARTY=true` |
| DMS Document AI Tab | `dms-document-ai-tab.tsx` | Add "Party Write-back" panel if document has `party_id` and Tier 2 flags enabled |
| Party Workspace → Licenses Tab | `party-licenses-tab.tsx` | Optional: show apply run history rows where `target_table='party_licenses' AND target_record_id=license.id` |
| Party Workspace → Tax Tab | `party-tax-registrations-tab.tsx` | Optional: show apply run history rows where `target_table='party_tax_registrations' AND target_record_id=tax.id` |

### Allowed button language

```
Preview Party Apply
Apply Selected to Party License
Apply Selected to Party Tax Registration
Confirm Party Write-back
```

### Forbidden button language

```
Auto Update Party
Auto Create License
Auto Create Tax Registration
Apply All
Merge Party
Link Party Automatically
```

---

## 14. Audit and History Plan

### Audit events (same as Tier 1, reused)

| Event | When | Key new_values for Tier 2 |
|---|---|---|
| `dms_apply_to_erp_run_created` | createDmsApplyToErpRun | `run_id`, `document_id`, `source_type`, `target_module="party"`, `target_table`, `item_count` |
| `dms_apply_to_erp_item_applied` | applyDmsApplyToErpRun (each write) | `item_id`, `run_id`, `target_table`, `target_field`, `target_record_id`, `applied_value_summary` (masked for TRN) |
| `dms_apply_to_erp_item_skipped` | skipped/conflict | `item_id`, `run_id`, `target_table`, `target_field`, `reason`, `status` |
| `dms_apply_to_erp_item_conflict` | conflict detected | Same as skipped |
| `dms_apply_to_erp_run_completed` | run finalized | `run_id`, `final_status`, `applied_count`, `skipped_count`, `conflict_count`, `failed_count` |

### Extend `buildRunCreatedMeta` to include `party_id` context

When `target_module = "party"`, derive `party_id` from the target child row and include it in the run created meta:

```typescript
// Extend buildRunCreatedMeta opts:
party_id?: number | null;    // party context for Tier 2
```

### Do not log

```
raw OCR text
raw AI response
prompt text
full document content
IBAN / account numbers
full party profile / financial data
```

---

## 15. Conflict Detection and Server Revalidation

### Tier 2 conflict cases

| Scenario | Conflict Reason | Behavior |
|---|---|---|
| Target child row deleted | "party license/tax row not found" | `conflict` — skip item |
| Target `party_id` ≠ expected party | "child row no longer belongs to expected party" | `conflict` — skip entire run |
| Target row `is_active = false` | "target record is inactive" | `conflict` — skip item |
| Target field changed since preview | "field value changed since preview" | `conflict` — skip item |
| Feature flag disabled after preview | "sub-feature flag not enabled" | `skipped` |
| DMS apply permission revoked | "insufficient dms.apply_to_erp.run permission" | `failed` |
| Party target permission revoked | "insufficient master_data.parties.manage_licenses" | `failed` |
| Value fails normalizer | "normalization error" | `failed` |
| Date order invalid (`expiry < issue`) | "expiry_date is before issue_date" | `failed` |
| Source AI result superseded | Not checked at apply time (apply still proceeds with user's confirmed values) | n/a |

### Server revalidation sequence (before every write)

```
1. Reload party_licenses / party_tax_registrations row from DB using admin client
2. Verify row exists → else conflict
3. Verify row.party_id === expected partyId → else conflict
4. Verify row.is_active === true → else conflict
5. Run detectPartyLicenseFieldConflict / detectPartyTaxFieldConflict
6. Normalize proposed value → else failed
7. Additional date order check for date fields
8. Write field with updated_by + updated_at
9. Log audit item_applied event
```

---

## 16. Data Safety and Privacy Plan

### Party write tables — no unsafe columns

`dms_ai_erp_apply_runs` and `dms_ai_erp_apply_items` have no raw content columns. Tier 2 must maintain this.

### Summary safety rules

| Rule | Enforcement |
|---|---|
| `proposed_value_summary` max 200 chars | `truncateSummary()` in normalizer |
| `current_value_summary` max 200 chars | `truncateSummary()` at preview build time |
| `applied_value_summary` max 200 chars | `truncateSummary()` in apply loop |
| `error_message` / `failure_reason` max 500 chars | Explicit slice in server action |
| `tax_registration_number` masked in summary | `maskTrnSummary()` — show `"1001****0003"` |
| `license_number` not masked (not classified as sensitive) | Show as-is; truncate to 200 chars |
| No raw OCR/AI content | Never stored; payload passes through `truncateSummary` |

### Forbidden content in any apply table or audit log

```
raw_ocr_text
full_document_content
chunk_text
embedding_vector
ai_prompt
ai_raw_response
iban
account_number
bank_details
salary / payroll / wage
medical_diagnosis
```

### No Party profile data in apply tables

The `parties` table profile (`commercial_register`, `vat_number`, `capital`, etc.) must not appear in apply item summaries.

---

## 17. Migration Plan

### Migration file

```
supabase/migrations/20260630000000_erp_dms_ai_phase16_tier2_party_writeback.sql
```

### Required changes

#### 1. Extend `target_module` CHECK constraint (CRITICAL — required)

```sql
-- Drop existing CHECK constraint on dms_ai_erp_apply_runs.target_module
ALTER TABLE dms_ai_erp_apply_runs
  DROP CONSTRAINT IF EXISTS dms_ai_erp_apply_runs_target_module_check;

-- Recreate with 'party' added
ALTER TABLE dms_ai_erp_apply_runs
  ADD CONSTRAINT dms_ai_erp_apply_runs_target_module_check
  CHECK (target_module = ANY (ARRAY[
    'dms_document'::text,
    'dms_metadata'::text,
    'party'::text
  ]));
```

**Prerequisite:** Identify the exact constraint name via `information_schema.table_constraints` before migration. The current constraint name is visible from the check clause inspection.

#### 2. Seed 3 new feature flags

```sql
INSERT INTO erp_ai_feature_flags (feature_code, is_enabled, label, description)
VALUES
  ('DMS_AI_APPLY_TO_ERP_PARTY',         false, 'Apply to ERP: Party (Master Sub-Gate)', 'Tier 2 master gate for all Party write-back. Requires DMS_AI_APPLY_TO_ERP=true.'),
  ('DMS_AI_APPLY_TO_ERP_PARTY_LICENSES',false, 'Apply to ERP: Party Licenses',         'Enable write-back to party_licenses fields. Requires DMS_AI_APPLY_TO_ERP_PARTY=true.'),
  ('DMS_AI_APPLY_TO_ERP_PARTY_TAX',     false, 'Apply to ERP: Party Tax Registrations','Enable write-back to party_tax_registrations fields. Requires DMS_AI_APPLY_TO_ERP_PARTY=true.')
ON CONFLICT (feature_code) DO NOTHING;
```

#### 3. No new permissions needed

`master_data.parties.manage_licenses` and `master_data.parties.manage_tax` are already seeded in the `permissions` table. No permission inserts needed.

#### 4. No new tables needed

`dms_ai_erp_apply_runs` and `dms_ai_erp_apply_items` from Tier 1 are sufficient.

#### 5. No indexes needed

Tier 2 queries use the same `apply_run_id`, `target_table`, and `document_id` indexes already created by Tier 1 migration.

#### 6. Optional: Add `party_id` column to `dms_ai_erp_apply_runs`

**Decision: Not recommended.** The `party_id` can be derived at apply time from the target child row (`party_licenses.party_id` or `party_tax_registrations.party_id`). Adding a column would require a schema change and complicate the Tier 1 RLS policy. Store `party_id` in the audit log `new_values` JSON only.

If a `party_id` column is desired for filtering/display in the future, it should be nullable with no FK constraint to avoid breaking Tier 1 runs.

### Migration must be additive and idempotent

```sql
-- All inserts use ON CONFLICT DO NOTHING
-- Constraint DROP uses IF EXISTS
-- No data migrations
-- No Party table alterations
-- No RLS policy changes (existing policies cover the new target_module='party' runs)
```

---

## 18. Server Action Plan

### `src/server/actions/dms/apply-to-erp.ts` changes

#### A. New action: `getPartyApplyTargetRows`

```typescript
/**
 * READ-ONLY: Load party child rows for human selection.
 * Returns candidate rows for user to pick from before creating an apply run.
 */
export async function getPartyApplyTargetRows(
  documentId: number,
  partyId: number,
  targetKind: "party_licenses" | "party_tax_registrations"
): Promise<ActionResult<PartyTargetRow[]>>
```

Validation:
- User must have `master_data.parties.view` (or manage_licenses/manage_tax)
- `DMS_AI_APPLY_TO_ERP=true` AND `DMS_AI_APPLY_TO_ERP_PARTY=true`
- Verify `partyId` exists in `parties` table
- Verify `documentId` exists in `dms_documents` AND `document.party_id === partyId` (or accepted entity match)

Returns: list of child rows with display-safe fields only (no raw OCR, no confidential data).

#### B. Extend `isDmsApplyToErpSubFlagEnabled` parameter

Change from enum to accept Tier 2 flag codes:

```typescript
async function isDmsApplyToErpSubFlagEnabled(
  flagCode:
    | "DMS_AI_APPLY_TO_ERP_DMS_METADATA"
    | "DMS_AI_APPLY_TO_ERP_ENTITY_LINKS"
    | "DMS_AI_APPLY_TO_ERP_PARTY"       // new
    | "DMS_AI_APPLY_TO_ERP_PARTY_LICENSES"  // new
    | "DMS_AI_APPLY_TO_ERP_PARTY_TAX"   // new
): Promise<boolean>
```

#### C. Extend `CreateRunInputSchema` Zod

```typescript
const CreateRunInputSchema = z.object({
  // existing fields...
  targetModule: z.enum(["dms_document", "dms_metadata", "party"]),  // add "party"
  // add optional Tier 2 party context:
  partyId: z.number().int().positive().nullable().optional(),       // new
  // ...rest unchanged
});
```

#### D. Extend item write loop in `applyDmsApplyToErpRun`

Sub-flag check extension:
```typescript
if (item.target_module === "dms_metadata" || item.target_table === "dms_document_metadata_values") {
  subFlagOk = await isDmsApplyToErpSubFlagEnabled("DMS_AI_APPLY_TO_ERP_DMS_METADATA");
} else if (item.target_table === "dms_documents") {
  subFlagOk = await isDmsApplyToErpSubFlagEnabled("DMS_AI_APPLY_TO_ERP_ENTITY_LINKS");
} else if (item.target_table === "party_licenses") {
  const partyFlagOk = await isDmsApplyToErpSubFlagEnabled("DMS_AI_APPLY_TO_ERP_PARTY");
  const licFlagOk   = await isDmsApplyToErpSubFlagEnabled("DMS_AI_APPLY_TO_ERP_PARTY_LICENSES");
  subFlagOk = partyFlagOk && licFlagOk;
} else if (item.target_table === "party_tax_registrations") {
  const partyFlagOk = await isDmsApplyToErpSubFlagEnabled("DMS_AI_APPLY_TO_ERP_PARTY");
  const taxFlagOk   = await isDmsApplyToErpSubFlagEnabled("DMS_AI_APPLY_TO_ERP_PARTY_TAX");
  subFlagOk = partyFlagOk && taxFlagOk;
}
```

Party write branch (after existing dms_documents branch):
```typescript
} else if (item.target_table === "party_licenses" && item.target_record_id) {
  // 1. Reload party_licenses row
  // 2. Verify party_id matches run's partyId context
  // 3. Verify is_active
  // 4. detectPartyLicenseFieldConflict(...)
  // 5. normalizeApplyValue(...)
  // 6. if target_field === "tax_registration_number" → maskTrnSummary for summary
  // 7. UPDATE party_licenses SET [field]=val, updated_by=userId, updated_at=now WHERE id=...
  // 8. update apply item status="applied"
  // 9. logAudit(buildItemAppliedMeta(...))
  // 10. revalidatePath("/admin/master-data/parties")

} else if (item.target_table === "party_tax_registrations" && item.target_record_id) {
  // same pattern as party_licenses
```

#### E. Revalidation paths to add

```typescript
// After party write:
revalidatePath("/admin/master-data/parties");
revalidatePath(`/admin/master-data/parties/record/${partyId}`);
```

---

## 19. Test and UAT Plan

### Unit tests (extend existing files)

**File: `apply-target-registry.test.ts`**

```
IMPORTANT: Existing tests at lines 58-60 assert that party_licenses.license_number
is BLOCKED. These must be updated when Tier 2 adds party targets to the allowlist.

Existing test must change from:
  "blocks party_licenses.license_number" → pass (blocked)
To:
  "allows party_licenses.license_number" → pass (allowed)

New tests to add:
  - party_licenses.license_number → allowed
  - party_licenses.license_name → allowed
  - party_licenses.license_activity_text → allowed
  - party_licenses.issue_date → allowed
  - party_licenses.expiry_date → allowed
  - party_licenses.remarks → allowed
  - party_licenses.license_code → blocked (system-generated)
  - party_licenses.party_id → blocked (FK parent)
  - party_licenses.is_active → blocked (not in allowlist)
  - party_tax_registrations.tax_registration_number → allowed
  - party_tax_registrations.effective_from → allowed
  - party_tax_registrations.effective_to → allowed
  - party_tax_registrations.remarks → allowed
  - party_tax_registrations.tax_registration_code → blocked
  - party_tax_registrations.reverse_charge_applicable → blocked (not in allowlist)
  - parties.name_en → blocked (direct parties table)
  - party_bank_details.iban → blocked (forbidden pattern)
  - HR tables → blocked
```

**File: `apply-conflict-detector.test.ts`**

```
New tests:
  - detectPartyLicenseFieldConflict: null record → conflict
  - detectPartyLicenseFieldConflict: party_id mismatch → conflict
  - detectPartyLicenseFieldConflict: is_active=false → conflict
  - detectPartyLicenseFieldConflict: field changed since preview → conflict
  - detectPartyLicenseFieldConflict: existing value + replaceExistingConfirmed=false → conflict
  - detectPartyLicenseFieldConflict: existing value + replaceExistingConfirmed=true → no conflict
  - detectPartyTaxFieldConflict: same scenarios
```

**File: `apply-value-normalizer.test.ts`**

```
New tests:
  - maskTrnSummary("100123456700003") → "1001****0003"
  - maskTrnSummary("ABCD") → "****" (short TRN)
  - maskTrnSummary("12345678") → "1234****5678" (exactly 8 chars)
```

### Runtime UAT plan

| Step | Action | Expected Result |
|---|---|---|
| Flags all off | Open Review Queue, look for Party Apply panel | No Party Apply UI visible |
| Master flag on, party off | Enable `DMS_AI_APPLY_TO_ERP=true` only | Party Apply panel absent |
| Master + party flag on, sub-flags off | Enable `DMS_AI_APPLY_TO_ERP_PARTY=true` | Party panel visible, but no license/tax targets |
| License flag on | Enable `DMS_AI_APPLY_TO_ERP_PARTY_LICENSES=true` | License apply preview available |
| Load target rows | Call `getPartyApplyTargetRows(docId, partyId, "party_licenses")` | Returns list of licenses for party |
| No child rows | Party has no licenses | Shows "No license records — create in Party Master" |
| 1+ child rows | Party has licenses | Shows row selector |
| Select row + preview | User selects license row, preview loads | Proposals shown with party + license context header |
| Create run | `createDmsApplyToErpRun()` with `targetModule="party"` | Run created, `target_module='party'` in DB, no party_licenses write |
| Confirm + apply | User checks confirm + clicks Apply | `party_licenses` field updated, audit log created |
| DB verify | Query `party_licenses` row | Field value updated, `updated_by` set |
| Audit log verify | Query `audit_logs WHERE action LIKE 'dms_apply%'` | 3 safe entries, no raw content |
| Tax flag on | Enable `DMS_AI_APPLY_TO_ERP_PARTY_TAX=true` | Tax apply preview available |
| Tax apply flow | Same flow for `party_tax_registrations` | `tax_registration_number` masked in summary |
| Wrong party child row | Force `target_record_id` to a license from a different party | Conflict detected, item skipped |
| No child row auto-create | No "Add License" button available | No auto-creation possible |
| Forbidden target | Try to apply to `parties.name_en` | Server blocks — forbidden/not-allowlisted |
| Payload safety | Query apply tables for raw OCR/IBAN columns | 0 rows (no such columns) |
| RLS verify | RLS already covers `dms_ai_erp_apply_runs/items` (Tier 1) | No new RLS changes needed |
| Restore flags | Set all Tier 2 flags to `false` | All 5 apply flags false |
| Regression | Load DMS documents, review queue, AI settings | No errors, Tier 1 behavior unchanged |

Use **synthetic** UAT data — create a test party with a test license/tax registration explicitly.

---

## 20. Performance and Index Plan

### No new indexes required

The existing Tier 1 migration already created:
```sql
CREATE INDEX idx_dms_ai_erp_apply_runs_document_id ON dms_ai_erp_apply_runs(document_id);
CREATE INDEX idx_dms_ai_erp_apply_runs_status       ON dms_ai_erp_apply_runs(status);
CREATE INDEX idx_dms_ai_erp_apply_items_run_id       ON dms_ai_erp_apply_items(apply_run_id);
CREATE INDEX idx_dms_ai_erp_apply_items_target_table ON dms_ai_erp_apply_items(target_table);
```

Tier 2 queries will use:
- `apply_run_id` index for item loads ✓
- `target_table` index for party filter ✓
- `document_id` index for history queries ✓

### Potential future index

If Party Workspace apply history tab is implemented:
```sql
CREATE INDEX idx_dms_ai_erp_apply_items_target_record_id
  ON dms_ai_erp_apply_items(target_record_id)
  WHERE target_table IN ('party_licenses', 'party_tax_registrations');
```
This is optional for Phase 16 Tier 2; include only if Party history tab is part of this phase.

---

## 21. Recommended Tier 2 Implementation Scope

### Must-have (Phase 16 Tier 2)

- [ ] Migration: extend `target_module` CHECK + seed 3 flags
- [ ] `types.ts`: add `"party"` to `ApplyTargetModule`
- [ ] `apply-target-registry.ts`: add `party_licenses` and `party_tax_registrations`
- [ ] `apply-value-normalizer.ts`: add `maskTrnSummary()`
- [ ] `apply-conflict-detector.ts`: add `detectPartyLicenseFieldConflict` and `detectPartyTaxFieldConflict`
- [ ] `apply-to-erp.ts`: add `getPartyApplyTargetRows`, extend `CreateRunInputSchema`, extend apply loop
- [ ] `DmsPartyTargetSelector` component
- [ ] `DmsApplyToErpPreview` party context props
- [ ] Review Queue drawer party write-back section
- [ ] Unit tests update + new tests
- [ ] Runtime UAT

### Nice-to-have (may defer to Phase 16 Tier 2B)

- [ ] Party Workspace Licenses tab apply history display
- [ ] Party Workspace Tax tab apply history display
- [ ] DMS Document AI tab party write-back panel (secondary to Review Queue)

---

## 22. Implementation Sequence for Future Tier 2 Execution

```
Step 1:  Run migration: extend target_module CHECK, seed 3 flags
Step 2:  Extend types.ts (ApplyTargetModule + "party")
Step 3:  Extend apply-target-registry.ts (add party_licenses + party_tax_registrations)
Step 4:  Extend apply-value-normalizer.ts (maskTrnSummary + SENSITIVE_FIELD_CODES update)
Step 5:  Extend apply-conflict-detector.ts (party record conflict functions)
Step 6:  Extend apply-source-resolver.ts (party child row proposals)
Step 7:  Update apply-to-erp.ts server action (getPartyApplyTargetRows + write loop)
Step 8:  Update apply-audit.ts buildRunCreatedMeta (add optional party_id)
Step 9:  Update existing unit tests (apply-target-registry.test.ts lines 58-60)
Step 10: Add new unit tests (party conflict, TRN masking, party registry)
Step 11: Build DmsPartyTargetSelector component
Step 12: Update DmsApplyToErpPreview, DmsApplyToErpConfirmDialog
Step 13: Extend DmsApplyToErpRunHistory filter
Step 14: Update Review Queue drawer (party section)
Step 15: TypeScript check + ESLint + unit tests pass
Step 16: Enable Tier 2 flags in dev, run runtime UAT
Step 17: Restore flags false
Step 18: Create closure implementation report
Step 19: Update ALGT_ERP_SOURCE_OF_TRUTH.md
```

---

## 23. Acceptance Criteria for Future Implementation

| AC | Criterion | Test |
|---|---|---|
| AC-01 | Tier 2 feature flags default false | DB query: `is_enabled = false` for all 3 new flags |
| AC-02 | Party write requires master + party + specific license/tax flag | Server action returns `feature_flag_disabled` without all 3 |
| AC-03 | Apply target registry allows only verified `party_licenses` and `party_tax_registrations` fields | Unit test: allowlisted fields pass; others blocked |
| AC-04 | `parties` direct profile fields remain forbidden | Unit test: `parties.name_en` blocked |
| AC-05 | `party_bank_details` and IBAN/account fields remain forbidden | Unit test: `party_bank_details.iban` blocked by forbidden pattern |
| AC-06 | HR/payroll/salary fields remain forbidden | Unit test: all HR table patterns blocked |
| AC-07 | Target party must be explicitly resolved and confirmed | `getPartyApplyTargetRows` requires `partyId`; server verifies party exists |
| AC-08 | Target child row must be explicitly selected and confirmed | `target_record_id` must be present in create run input; no auto-select |
| AC-09 | No automatic child row creation | No `insertPartyLicense` / `insertPartyTaxRegistration` calls in apply path |
| AC-10 | Create run creates history only, no Party write | DB: `party_licenses` unchanged after `createDmsApplyToErpRun` |
| AC-11 | Apply run requires human confirmation and confirmed item IDs | `humanReviewConfirmed: true` enforced by Zod + server |
| AC-12 | Apply requires both DMS apply permission and target Party permission | Server action checks both; fails on missing either |
| AC-13 | Server reloads target child row before every write | Code review: `SELECT ... WHERE id=...` before every `UPDATE` |
| AC-14 | Stale/conflicting fields are skipped, not overwritten | Runtime UAT: force conflict scenario |
| AC-15 | Every applied item creates audit log and apply item history | DB: `audit_logs` and `dms_ai_erp_apply_items` rows created |
| AC-16 | No raw OCR/content/prompt/AI response stored | SQL QA: forbidden column names absent from apply tables |
| AC-17 | TypeScript/build/test pass | `tsc --noEmit` 0 errors; `vitest run` 0 failures |
| AC-18 | Runtime UAT proves no HR/payroll/bank/direct party profile writes | UAT: query these tables pre/post apply |

---

## 24. Risks and Mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| `target_module` CHECK constraint name not known at migration time | Medium | Query `information_schema.table_constraints` before DROP — include exact constraint name in migration script |
| Party has many licenses — UI list too long | Low | Limit `getPartyApplyTargetRows` to 50 rows ordered by `is_primary DESC, created_at DESC`; add search/filter |
| `license_number` text value proposed by AI is wrong format | Low | `normalizeApplyValue()` enforces maxLength; additional format validation can be added per license type |
| Concurrent apply runs on same party_licenses row | Low | Conflict detector reloads live row; second run will detect stale value and skip |
| Existing Tier 1 tests fail after registry update | High | `apply-target-registry.test.ts` lines 58-60 assert party_licenses is blocked — **must update before commit** |
| Party row deleted between preview and apply | Low | `detectPartyLicenseFieldConflict(null, ...)` → `{ conflict: true }` — item skipped cleanly |
| `is_active=false` license silently accepted | Medium | Conflict detector explicitly checks `is_active` → conflict |
| TRN masking insufficient | Low | `maskTrnSummary` masks middle chars; real value still written to DB (masking is for audit summaries only) |

---

## 25. What Must Not Be Implemented in Tier 2

```
Auto-create party records
Auto-create party license rows
Auto-create party tax registration rows
Auto-select target child row (even when only 1 row exists — always require user confirmation)
Direct parties table profile write-back (parties.name_en, parties.commercial_register, etc.)
Party bank details write-back (party_bank_details.*)
IBAN or account number write-back
HR compliance write-back (employee_identity_documents, employee_medical_insurances, etc.)
Payroll or salary write-back
Medical diagnosis write-back
Auto-merge duplicate parties
Auto-link documents to parties
Bulk apply across multiple parties or documents
Background apply job (no queue-based party write)
One-click Apply All without field-level review
Accept and Apply in a single click
Raw OCR / content / prompt / AI response storage in apply tables or audit logs
```

---

## 26. Corrected Roadmap After Tier 2

```
Phase 9    — Async AI Job Queue / Workflow Runner              CLOSED
Phase 10A  — OCR Pipeline Upgrade / Azure OCR Wiring          CLOSED
Phase 10B  — Queue-backed Admin OCR Backfill                   CLOSED
Phase 11   — Semantic Chunking and Embeddings                  CLOSED
Phase 12   — Review Queue Activation                           CLOSED
Phase 13   — Validation, Conflict Detection, Owner Matching    CLOSED / LIVE PASS
Phase 14   — Token / Cost / Observability                      CLOSED / LIVE PASS
Phase 15   — Testing, Performance, Hardening                   CLOSED / LIVE PASS
Phase 16.1 — Human-Reviewed Apply-to-ERP Tier 1                CLOSED / LIVE PASS
Phase 16.2 — Party Licenses and Tax Registration Write-back    → NEXT (this plan)
Phase 17   — (TBD by Sameer/Dina: HR Write-back / Semantic Search / AI Summaries)
```

---

## 27. Recommended Next Cursor Implementation Prompt

After this plan is reviewed and approved by ChatGPT, the Cursor implementation prompt should instruct Cursor to:

1. Confirm Phase 16 Tier 2 plan is approved before touching any code.
2. Read this planning file in full before implementing.
3. Implement in the exact order defined in Section 22 (Implementation Sequence).
4. Run `tsc --noEmit` and `vitest run` after each step to catch regressions early.
5. Update `apply-target-registry.test.ts` lines 58-60 in Step 9 before committing.
6. Enable Tier 2 feature flags for UAT only — restore to false after UAT.
7. Create implementation report + update ALGT_ERP_SOURCE_OF_TRUTH.md after UAT closure.

---

## 28. Final Recommendation

**Proceed with Phase 16 Tier 2 implementation** after ChatGPT review of this plan.

The Tier 1 apply architecture is clean, proven, and well-tested. Extending it to Party child records is a natural and minimal-risk next step. The key risks are:
1. The existing unit test that asserts `party_licenses.license_number` is **blocked** must be updated.
2. The `target_module` DB CHECK constraint must be extended in the migration.
3. The `ApplyTargetModule` type must be extended.
4. The dual-permission enforcement (DMS apply + party manage) must be strictly implemented.

All field allowlists are backed by the live DB schema and the Phase 8 ERP mapping registry, which already defines these exact targets. No guesswork or invention was needed.
