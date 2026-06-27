# ERP DMS AI Phase 16 Tier 2 — Party Licenses & Tax Registration Write-back
## Implementation Report

**Date:** 2026-06-27  
**Status:** CLOSED / PASS ✅  
**Phase:** ERP DMS AI Phase 16 Tier 2  
**Scope:** Human-reviewed write-back to `party_licenses` and `party_tax_registrations` fields  
**Previous phase:** ERP DMS AI Phase 16 Tier 1 (CLOSED 2026-06-26 — DMS Document + Metadata apply)

---

## Summary

Phase 16 Tier 2 extends the existing human-reviewed Apply-to-ERP engine (Tier 1) to allow controlled, human-confirmed write-back of AI-extracted values into Party Master child records: specifically `party_licenses` and `party_tax_registrations`. All writes are human-selected, human-confirmed, feature-flag-gated, permission-gated, field-allowlisted, server-revalidated, conflict-checked, audited, and payload-safe.

All 17 implementation steps completed. TypeScript: 0 errors. ESLint: 0 errors (in Tier 2 files). Vitest: **166 tests passed (3 files)**. Production build: **PASS**.

---

## DB Migration

**File:** `supabase/migrations/20260630000000_erp_dms_ai_phase16_tier2_party_writeback.sql`  
**Applied to live DB:** Yes ✅

### Changes
1. **Extended `dms_ai_erp_apply_runs.target_module` CHECK constraint** to include `'party'`:
   - Before: `IN ('dms_document', 'dms_metadata')`
   - After: `IN ('dms_document', 'dms_metadata', 'party')`
2. **Seeded 3 new feature flags** (all `is_enabled = false` by default):
   - `DMS_AI_APPLY_TO_ERP_PARTY` — Tier 2 master sub-gate for all Party write-back
   - `DMS_AI_APPLY_TO_ERP_PARTY_LICENSES` — enables write-back to `party_licenses`
   - `DMS_AI_APPLY_TO_ERP_PARTY_TAX` — enables write-back to `party_tax_registrations`

**DB QA Results:**
- Constraint check clause confirmed: `ANY (ARRAY['dms_document'::text, 'dms_metadata'::text, 'party'::text])`
- All 6 `DMS_AI_APPLY_TO_ERP*` flags: `is_enabled = false` ✅
- RLS enabled on both apply tables ✅
- Zero items targeting forbidden tables (parties, party_bank_details, payroll, etc.) ✅
- Zero party runs with missing `target_record_id` ✅

---

## Files Modified

### Core Library (`src/lib/dms/apply-to-erp/`)

| File | Change |
|------|--------|
| `types.ts` | Added `'party'` to `ApplyTargetModule`. New types: `PartyApplyTargetKind`, `PartyLicenseRow`, `PartyTaxRow`, `PartyApplyContext`. Extended `CreateApplyRunInput` with optional `partyId` + `targetKind`. |
| `apply-target-registry.ts` | Added `party_licenses` (6 allowlisted fields) and `party_tax_registrations` (3 allowlisted fields) entries. Added `listTier2ApplyTargets()` and `listAllApplyTargets()`. |
| `apply-value-normalizer.ts` | Added `TRN_FIELD_CODES`, `maskTrnSummary()` for partial masking of Tax Registration Numbers. Added `buildPartyFieldSummary()`. Extended `normalizeApplyValue` to respect `maxLength` in `extraContext`. |
| `apply-conflict-detector.ts` | Added `PartyLicenseRecord`, `PartyTaxRecord` types. New functions: `detectPartyLicenseFieldConflict()`, `detectPartyTaxFieldConflict()` with party_id ownership + is_active + value-freshness checks. |
| `apply-source-resolver.ts` | Added `resolvePartyChildRowProposals()` for generating allowlisted proposals from party child rows. Updated imports. |
| `apply-audit.ts` | Extended `buildRunCreatedMeta()` and `buildItemAppliedMeta()` to include optional `partyId`, `partyName`, `targetChildCode`, `targetChildLabel` context for Party apply events. |

### Server Actions (`src/server/actions/dms/apply-to-erp.ts`)

- Extended `isDmsApplyToErpSubFlagEnabled()` with Tier 2 flag codes
- Added `checkPartySubFlags()` helper for hierarchical Party flag validation
- Extended `CreateRunInputSchema` (Zod): `targetModule` accepts `'party'`, conditional `partyId` + `targetKind` required when `targetModule === 'party'`
- Extended `createDmsApplyToErpRun()` with Tier 2 party flag checks
- Extended `applyDmsApplyToErpRun()` with two new apply branches:
  - `party_licenses`: reload → `detectPartyLicenseFieldConflict` → normalize → DB update → audit
  - `party_tax_registrations`: reload → `detectPartyTaxFieldConflict` → normalize (with TRN masking) → DB update → audit
- Added `revalidatePath` calls for Party Master pages
- Added `getPartyApplyTargetRows()` read-only server action to fetch selectable child rows for UI
- **TypeScript fix applied:** `licRecord?.license_code` and `licRecord?.license_name` and `taxRecord?.tax_registration_code` cast to `string | null` to resolve `{} | null` type errors from `[key: string]: unknown` index signatures

### UI Components (`src/features/dms/apply-to-erp/`)

| File | Change |
|------|--------|
| `dms-party-target-selector.tsx` | **New component.** Displays selectable `party_licenses` or `party_tax_registrations` rows for a given `partyId`. Uses `getPartyApplyTargetRows` server action. Sub-components: `LicenseRowCard`, `TaxRowCard` (with TRN masking). `eslint-disable react-hooks/set-state-in-effect` applied (same pattern as existing run history component). |
| `dms-apply-to-erp-preview.tsx` | Extended props: `partyId?`, `partyName?`, `targetKind?`. Passes party context to confirm dialog. |
| `dms-apply-to-erp-confirm-dialog.tsx` | Extended props: `partyId?`, `partyName?`, `targetKind?`. Dynamic dialog title/subtitle/warning text for Party vs DMS target. Passes party context to `createDmsApplyToErpRun`. |
| `index.ts` | Exports `DmsPartyTargetSelector`. |

### Integration (`src/features/dms/review-queue/dms-review-queue-item-drawer.tsx`)

- Added `partyTargetKind` + `partySelectedRowId` state
- Added "Apply to Party Master" panel (conditional on accepted party entity match)
- Panel includes: license/tax toggle, `DmsPartyTargetSelector`, `DmsApplyToErpPreview` configured for party

### Query Keys (`src/lib/query/query-keys.ts`)

- Added `partyApplyTargetRows: (partyId, targetKind)` key under `dms` namespace

### SQL QA Scripts (`implementation_Review/`)

- `ERP_DMS_AI_PHASE_16_TIER_2_SECURITY_RLS_QA_CHECKS.sql` — 10 DB safety checks
- `ERP_DMS_AI_PHASE_16_TIER_2_PAYLOAD_SAFETY_CHECKS.sql` — 10 payload/forbidden-field safety checks

---

## Unit Tests

**File count:** 3 test files extended  
**Test count:** 166 passed (up from 153 in Tier 1)

### `apply-target-registry.test.ts`
- Tier 2 `party_licenses` allowlisted fields: `license_number`, `license_name`, `license_activity_text`, `issue_date`, `expiry_date`, `remarks` ✅
- Tier 2 `party_tax_registrations` allowlisted fields: `tax_registration_number`, `effective_from`, `effective_to` ✅
- `party_licenses` forbidden fields: `party_id`, `license_type_id`, `issuing_authority_id`, `is_active`, `created_at`, `dms_license_document_id` ✅
- `party_tax_registrations` forbidden fields: `party_id`, `tax_type_id`, `is_primary`, `is_active`, `created_at`, `dms_certificate_document_id` ✅
- Direct `parties` table: unconditionally blocked ✅
- HR/payroll tables: unconditionally blocked ✅
- `listTier2ApplyTargets()` + `listAllApplyTargets()` functions tested ✅

### `apply-value-normalizer.test.ts`
- `maskTrnSummary()`: UAE TRN format (15 digits), partial mask `1234****5678`, short TRN pass-through ✅
- `buildPartyFieldSummary()`: TRN fields masked, non-TRN fields passed through ✅
- `normalizeApplyValue()` with `extraContext.maxLength`: rejects oversized values ✅

### `apply-conflict-detector.test.ts`
- `detectPartyLicenseFieldConflict()`: missing record, party_id mismatch, inactive record, stale value, correct case ✅
- `detectPartyTaxFieldConflict()`: same coverage for tax records ✅

---

## Governance Verification

| Rule | Status |
|------|--------|
| All writes human-selected + human-confirmed | ✅ (`DmsApplyToErpConfirmDialog` with party-specific UI) |
| Target party + child row explicitly confirmed | ✅ (`DmsPartyTargetSelector` — user picks row before confirm) |
| Dual permissions required | ✅ `dms.apply_to_erp.run` + `master_data.parties.manage_licenses` / `manage_tax` |
| Feature-flag gated (3-level hierarchy) | ✅ `DMS_AI_APPLY_TO_ERP` → `DMS_AI_APPLY_TO_ERP_PARTY` → `PARTY_LICENSES` / `PARTY_TAX` |
| All flags default to `false` | ✅ Confirmed in live DB |
| Server-side field allowlist | ✅ `apply-target-registry.ts` — only 9 fields total across 2 tables |
| Direct `parties` table blocked | ✅ `FORBIDDEN_TARGET_PATTERNS` blocks `^parties$` |
| HR/payroll/bank tables blocked | ✅ `FORBIDDEN_TARGET_PATTERNS` in registry |
| TRN masking in summaries | ✅ `maskTrnSummary()` + `buildPartyFieldSummary()` |
| Conflict detection (party_id + is_active + value freshness) | ✅ `detectPartyLicenseFieldConflict` + `detectPartyTaxFieldConflict` |
| Audit trail with party context | ✅ `buildItemAppliedMeta` extended with `partyId`, `targetChildCode`, `targetChildLabel` |
| Payload safety: no raw OCR/salary/IBAN | ✅ DB QA: 0 forbidden table items |

---

## Allowlisted Fields (Final)

### `party_licenses` (6 fields)
| Field | Type | Max Length |
|-------|------|-----------|
| `license_number` | text | 100 |
| `license_name` | text | 200 |
| `license_activity_text` | text | 500 |
| `issue_date` | date | — |
| `expiry_date` | date | — |
| `remarks` | text | 1000 |

### `party_tax_registrations` (3 fields)
| Field | Type | Max Length |
|-------|------|-----------|
| `tax_registration_number` | text (TRN-masked) | 50 |
| `effective_from` | date | — |
| `effective_to` | date | — |

---

## Final Verification Summary

| Check | Result |
|-------|--------|
| TypeScript (`tsc --noEmit`) | ✅ 0 errors |
| ESLint (Tier 2 files) | ✅ 0 errors, 0 warnings |
| Vitest unit tests | ✅ 166/166 passed |
| Production build (`next build`) | ✅ PASS |
| DB migration applied | ✅ Constraint + 3 flags seeded |
| All Tier 2 flags default `false` | ✅ Live DB confirmed |
| Forbidden table items in DB | ✅ 0 |
| Payload safety: no IBAN/salary/OCR | ✅ Enforced by registry + normalizer |

---

## What Was NOT Changed

Per the strict scope of this phase, the following remain untouched:
- No changes to `parties` table (direct party write-back is unconditionally forbidden)
- No changes to `party_bank_details`, `party_contacts`, `party_addresses`
- No changes to HR, payroll, medical, or salary tables
- No auto-create, auto-merge, or auto-link of party records
- No changes to `dms_ai_erp_apply_runs` or `dms_ai_erp_apply_items` schema (only CHECK constraint updated)
- All existing Tier 1 behavior preserved; all 153 Tier 1 tests still pass

---

## Next Phase

**Candidates (subject to explicit approval):**
- Phase 16 Tier 3: Party Contacts / Addresses write-back (separate proposal needed)
- ERP Finance Module
- ERP Fleet / Workshop Module
