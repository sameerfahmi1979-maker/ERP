# ERP GLOBAL CLEANUP.2 — Delete Legacy Dead Form-Dialog Files
## Implementation Report

**Phase:** ERP GLOBAL CLEANUP.2  
**Status:** CLOSED / PASS ✅  
**Date:** 2026-06-14  

---

## Reason for Cleanup

After the workspace record form conversion phases (UI.4E.1 through UI.4G), the main Add/Edit/View CRUD forms for all ERP modules were migrated from sliding form-dialog components to `ERPRecordWorkspaceForm` workspace record tabs.

The old `*-form-dialog.tsx` files remained in the codebase but were no longer imported anywhere. Their presence created risk:

- Future agents/developers might accidentally import them and reintroduce the old sliding dialog behavior.
- The codebase was larger and harder to navigate with dead code.
- The `*-form-dialog.tsx` pattern is explicitly forbidden for main CRUD forms going forward.

---

## Audit Method

For each candidate file, a global search was run for:
- The exact filename (e.g., `bank-form-dialog`)
- The exported component name (e.g., `BankFormDialog`)

A file was classified DELETE only if the search returned **only the file itself** — zero references from any other file.

---

## Candidate File Audit Matrix

| File | Exported Component | Import Count | Classification | Action | Reason |
|------|--------------------|--------------|----------------|--------|--------|
| `src/features/users/user-edit-dialog.tsx` | `UserEditDialog` | 0 | **DELETE** | Deleted | Zero imports. Users module uses `user-workspace-form.tsx`. Uses legacy `ERPDrawerForm`. |
| `src/features/master-data/finance-basics/components/bank-form-dialog.tsx` | `BankFormDialog` | 0 | **DELETE** | Deleted | Zero imports. Finance Banks uses workspace form. |
| `src/features/master-data/finance-basics/components/currency-form-dialog.tsx` | `CurrencyFormDialog` | 0 | **DELETE** | Deleted | Zero imports. |
| `src/features/master-data/finance-basics/components/cost-center-form-dialog.tsx` | `CostCenterFormDialog` | 0 | **DELETE** | Deleted | Zero imports. |
| `src/features/master-data/finance-basics/components/profit-center-form-dialog.tsx` | `ProfitCenterFormDialog` | 0 | **DELETE** | Deleted | Zero imports. |
| `src/features/master-data/finance-basics/components/payment-term-form-dialog.tsx` | `PaymentTermFormDialog` | 0 | **DELETE** | Deleted | Zero imports. |
| `src/features/master-data/finance-basics/components/tax-type-form-dialog.tsx` | `TaxTypeFormDialog` | 0 | **DELETE** | Deleted | Zero imports. |
| `src/features/master-data/geography/components/city-form-dialog.tsx` | `CityFormDialog` | 0 | **DELETE** | Deleted | Zero imports. Geography uses workspace forms. |
| `src/features/master-data/geography/components/country-form-dialog.tsx` | `CountryFormDialog` | 0 | **DELETE** | Deleted | Zero imports. |
| `src/features/master-data/geography/components/emirate-form-dialog.tsx` | `EmirateFormDialog` | 0 | **DELETE** | Deleted | Zero imports. |
| `src/features/master-data/geography/components/area-form-dialog.tsx` | `AreaFormDialog` | 0 | **DELETE** | Deleted | Zero imports. |
| `src/features/master-data/geography/components/port-form-dialog.tsx` | `PortFormDialog` | 0 | **DELETE** | Deleted | Zero imports. |
| `src/features/numbering/components/numbering-rule-form-dialog.tsx` | `NumberingRuleFormDialog` | 0 | **DELETE** | Deleted | Zero imports. Numbering uses workspace form. |
| `src/features/roles/role-form-dialog.tsx` | `RoleFormDialog` | 0 | **DELETE** | Deleted | Zero imports. Roles uses workspace form. |
| `src/features/branches/branch-form-dialog.tsx` | `BranchFormDialog` | 0 | **DELETE** | Deleted | Zero imports. Branches uses workspace form. |
| `src/features/organizations/organization-form-dialog.tsx` | `OrganizationFormDialog` | 0 | **DELETE** | Deleted | Zero imports. Organizations uses workspace form. |
| `src/features/master-data/lookups/components/category-form-dialog.tsx` | `CategoryFormDialog` | 0 | **DELETE** | Deleted | Zero imports. Lookups uses workspace form. |
| `src/features/master-data/lookups/components/value-form-dialog.tsx` | `ValueFormDialog` | 0 | **DELETE** | Deleted | Zero imports. |
| `src/features/master-data/uom/components/uom-category-form-dialog.tsx` | `UomCategoryFormDialog` | 0 | **DELETE** | Deleted | Zero imports. UOM uses workspace forms. |
| `src/features/master-data/uom/components/conversion-form-dialog.tsx` | `ConversionFormDialog` | 0 | **DELETE** | Deleted | Zero imports. |
| `src/features/master-data/uom/components/unit-form-dialog.tsx` | `UnitFormDialog` | 0 | **DELETE** | Deleted | Zero imports. Extra candidate found during glob scan. |

**Total deleted: 21 files**

### Additional Scans — No Additional Candidates Found

A glob scan for `*-form-dialog.tsx` across all of `src/features/` confirmed 20 files (all in the list above, excluding `user-edit-dialog.tsx` which matched `*-dialog.tsx` pattern). All were classified DELETE and removed.

---

## Files Confirmed Kept (Not Deleted)

| File | Reason |
|------|--------|
| `src/components/erp/erp-child-dialog-form.tsx` | Active — global standard for all child forms |
| `src/components/erp/unsaved-changes-dialog.tsx` | Active — dirty-state confirmation dialog |
| `src/components/ui/dialog.tsx` | Active — Base UI Dialog wrapper |
| `src/features/users/add-user-dialog.tsx` | **FALSE POSITIVE** — not a form dialog; it is a router `<Button>` that navigates to the new user workspace form |
| `src/features/users/assign-role-dialog.tsx` | Active — uses `ERPChildDialogForm`; called from `user-workspace-form.tsx` |
| All `src/features/master-data/parties/*-tab.tsx` | Active — Party Master child form tabs (ERPChildDialogForm) |
| All `src/features/master-data/parties/admin/*-admin-table.tsx` | Active — Party admin modals (ERPChildDialogForm) |
| All `*-workspace-form.tsx` | Active — workspace record forms for all modules |

---

## Global Import Audit Result

After deletion, a global search for `form-dialog` and `FormDialog` across all of `src/features/` returned **zero matches**. No stale imports or references remain.

No barrel (`index.ts`) files referenced any of the deleted dialog files.

---

## Cursor Rules Updated

| File | Change |
|------|--------|
| `.cursor/rules/erp-record-workspace-form-standard.mdc` | Added Rule 15: Legacy `*-form-dialog.tsx` files deleted. Do NOT create new ones. Main CRUD → `ERPRecordWorkspaceForm`. |
| `.cursor/rules/erp-child-dialog-form-standard.mdc` | Added CLEANUP.2 Note: Do NOT import deleted legacy form-dialog components. Only `ERPChildDialogForm` for child forms. |

---

## QA Scenarios — Source-Level Verification

### Scenario A — Main forms still use workspace forms
All modules verified to have active `*-workspace-form.tsx` files. No workspace form depends on any deleted dialog file. ✅

### Scenario B — Child forms still intact
All Party child tab files (`party-contacts-tab.tsx`, `party-addresses-tab.tsx`, etc.) are untouched and use `ERPChildDialogForm`. ✅

### Scenario C — No stale imports
Global grep for `form-dialog` / `FormDialog` in `src/features/` returns zero matches after cleanup. ✅

### Scenario D — Build
```
npx tsc --noEmit  → Exit code: 0 ✅
npx next build    → Exit code: 0 ✅
```

---

## Acceptance Criteria

| # | Criterion | Result |
|---|-----------|--------|
| 1 | Every candidate legacy form-dialog file audited | ✅ 21 files (20 from prompt list + 1 extra found) |
| 2 | Every deleted file has zero active imports | ✅ |
| 3 | Active workspace forms remain intact | ✅ |
| 4 | Active ERPChildDialogForm child forms remain intact | ✅ |
| 5 | No main CRUD route depends on deleted files | ✅ |
| 6 | Cursor rules updated | ✅ |
| 7 | Source of Truth updated | ✅ |
| 8 | TypeScript passes | ✅ |
| 9 | Next build passes | ✅ |
| 10 | Implementation report generated | ✅ |

**All 10 acceptance criteria: PASS**

---

## Known Limitations

None. All dead code was cleanly removed with no side effects.

---

## Next Recommended Phase

The codebase is now clean of legacy form-dialog dead code. The next recommended phases based on outstanding ERP work:

1. **Party Document Types Admin Screen** — No UI exists to manage `party_document_types` table. Add an admin screen under Party Admin Masters.
2. **Party Master UX FIX.2** — Further UX improvements to Party Master (e.g., bulk type assignment, relationship management).
3. **Next ERP module** — Per the ERP roadmap in `ALGT_ERP_SOURCE_OF_TRUTH.md`.
