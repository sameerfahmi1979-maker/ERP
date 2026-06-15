# ERP BANK MASTER STANDARD.1 — Unify Bank Master and Remove Party Bank Type Duplication

**Phase:** ERP BANK MASTER STANDARD.1  
**Status:** CLOSED / PASS ✅  
**Date:** 2026-06-14  
**Executed by:** Cursor (AI Lead Engineer)

---

## Problem Summary

Two separate mechanisms existed for managing banks:
1. **Party Master** — users could navigate to `/admin/master-data/parties/banks` and potentially create/manage Bank parties under the `BANK` party type.
2. **Finance Basics** — `/admin/master-data/finance-basics/banks` contained the official Bank Master.

Additionally, the Party Bank Details child form used only a free-text `bank_name_text` input instead of a Finance Banks selector — meaning the `bank_id` FK column (which already existed in `party_bank_details`) was never populated.

---

## Final Design Decision

> Finance Basics Banks (`/admin/master-data/finance-basics/banks`) is the **single source of truth** for bank master data. Party Master must not create bank records. Party Bank Details must link to Finance Banks via `bank_id`.

---

## Investigation / Audit Results

### 1. BANK party type in DB
```sql
select id, type_code, type_name, is_active from party_types where upper(type_code) = 'BANK';
```
**Result: 0 rows — BANK party type does NOT exist in `party_types`.**  
No deactivation or cleanup needed.

### 2. BANK party type assignments
```sql
select count(*) from party_type_assignments join party_types ... where upper(pt.type_code) = 'BANK';
```
**Result: 0 assignments** — clean, nothing to migrate.

### 3. `/admin/master-data/parties/banks` route
- Was registered in `[typeSlug]/page.tsx` `SLUG_TYPE_MAP` as `banks: { typeCode: "BANK" }`
- Was listed in sidebar under Party Master as `"Banks"` → `/admin/master-data/parties/banks`
- Was **NOT** in workspace route registry (already clean)

### 4. `defaultType=BANK`
- `ALLOWED_DEFAULT_TYPE_CODES` in `parties-table.tsx` already excluded `BANK` (from UX FIX.1)
- `record/new/page.tsx` validation set already excluded `BANK`

### 5. `party_bank_details.bank_id` column
- Column exists in DB: `bigint, nullable` ✅
- BUT: The Party Bank Details dialog form had no Finance Bank selector — only a `bank_name_text` free-text field
- `bank_id` was never populated via the UI

### 6. Finance Basics Banks
- Route `/admin/master-data/finance-basics/banks` is active ✅
- `BankSelect` component already exists in `src/components/erp/finance-basics/bank-select.tsx` ✅
- `useBanksQuery` hook provides TanStack Query cache of Finance Banks ✅

### 7. Relationship Manager / Facility Fields
- **Not in DB schema**: `party_bank_details` does not have `relationship_manager_name`, `relationship_manager_mobile`, `relationship_manager_email`, `facility_limit`, `facility_expiry`
- These require a future DB migration — documented as follow-up **ERP BANK MASTER STANDARD.2**

---

## Files Modified

| File | Change |
|---|---|
| `src/components/layout/app-sidebar.tsx` | Removed `{ label: "Banks", icon: Landmark, path: "/admin/master-data/parties/banks" }` from Party Master section |
| `src/app/(protected)/admin/master-data/parties/[typeSlug]/page.tsx` | Removed `banks: { typeCode: "BANK", title: "Banks" }` from `SLUG_TYPE_MAP` |
| `src/features/master-data/parties/party-bank-details-tab.tsx` | Added `BankSelect` for Finance Bank selection; added read-only bank master info panel; added "+ New Bank" shortcut button; added `useBanksQuery` and `useWorkspace` imports |

## Files Created

| File | Purpose |
|---|---|
| `src/app/(protected)/admin/master-data/parties/banks/page.tsx` | Static redirect page: `/parties/banks` → `/finance-basics/banks` |
| `.cursor/rules/erp-bank-master-standard.mdc` | Cursor rule enforcing Bank Master standard |

---

## Routes Removed / Redirected

| Route | Before | After |
|---|---|---|
| `/admin/master-data/parties/banks` | Showed party list filtered by BANK type | Redirects to `/admin/master-data/finance-basics/banks` |

---

## Menu / Sidebar Changes

| Before | After |
|---|---|
| Party Master section had `"Banks"` item → `/admin/master-data/parties/banks` | Item removed. Finance Basics `"Banks"` item remains unchanged. |

---

## Workspace Registry Changes

No changes needed — workspace registry had no `parties/banks` entries (was already clean).

---

## Party Type BANK Audit

| Check | Result |
|---|---|
| `BANK` exists in `party_types` table | ❌ No — never created |
| `BANK` assignments in `party_type_assignments` | 0 records |
| Action taken | None required — no DB record to deactivate |

---

## Finance Banks Status

Finance Basics Banks remains fully active:
- Route: `/admin/master-data/finance-basics/banks` ✅
- Add/Edit/View via workspace record form ✅
- Registered in workspace route registry and sidebar under Finance Basics ✅

---

## Party Bank Details — Link Verification

| Field | DB Column | Was in UI | Now in UI |
|---|---|---|---|
| Finance Bank selector | `bank_id` (bigint, nullable FK) | ❌ Not shown | ✅ BankSelect combobox |
| Bank name (free text) | `bank_name_text` | ✅ | ✅ Shown only when no Finance Bank selected (fallback) |
| Account holder | `account_holder_name` | ✅ | ✅ |
| Account number | `account_number` | ✅ | ✅ |
| IBAN | `iban` | ✅ | ✅ |
| SWIFT code | `swift_code` | ✅ | ✅ |
| Currency | `currency_id` | ✅ | ✅ |
| Branch name | `branch_name` | ✅ | ✅ |
| Country | `country_id` | ✅ | ✅ |
| Primary flag | `is_primary` | ✅ | ✅ |
| Active flag | `is_active` | ✅ | ✅ |
| Remarks | `remarks` | ✅ | ✅ |

### Finance Bank selector behavior
- When a Finance Bank is selected via `BankSelect`, the `bank_id` is set and the `bank_name_text` is auto-populated with the bank label.
- A read-only info panel shows: bank name, bank code, short name.
- The free-text fallback field is hidden when a Finance Bank is selected.

---

## Party Bank Details UI Changes

1. **Added `BankSelect`** (Finance Bank combobox) as the primary bank identification method
2. **Added read-only bank info panel** showing bank name, code, and short name after Finance Bank selection
3. **Added "+ New Bank" shortcut button** next to the Bank selector — opens Finance Banks New Bank workspace tab without closing the current Party form
4. **Free-text `bank_name_text`** demoted to fallback — only shown when no Finance Bank is selected (for cases where the bank doesn't yet exist in Finance Banks)

---

## Relationship Manager / Contact Field Audit

Fields **NOT in DB** (not implementable without migration):
- `relationship_manager_name`
- `relationship_manager_mobile`
- `relationship_manager_email`
- `facility_limit`
- `facility_expiry`

These are documented as **ERP BANK MASTER STANDARD.2** follow-up.

---

## New Bank Shortcut Status

✅ **Implemented.** "+ New Bank" button in Party Bank Details dialog opens:
```
/admin/master-data/finance-basics/banks/record/new
```
as a new workspace tab, without closing the current Party record form. The user can create the bank, save it, return to the Party Bank Details dialog, and select the newly created bank from the Finance Bank selector.

---

## Cursor Rule Created

**File:** `.cursor/rules/erp-bank-master-standard.mdc`  
Enforces all 10 bank master rules including: Finance Basics Banks as sole source of truth, no BANK party type, `BankSelect` requirement in Party Bank Details, retired `/parties/banks` route.

---

## QA Scenarios

| Scenario | Expected | Code-verified |
|---|---|---|
| A — Open `/parties/banks` | Redirects to `/finance-basics/banks` | ✅ Static redirect page created |
| B — Open New Party, go to Party Types | BANK does not appear (type doesn't exist in DB) | ✅ Confirmed via DB audit |
| C — Open `/parties/customers`, Add Party | CUSTOMER still preselected | ✅ Unaffected |
| C — Open `/parties/vendors`, Add Party | VENDOR still preselected | ✅ Unaffected |
| D — Open `/finance-basics/banks` | Banks list works, Add Bank opens workspace form | ✅ Already active, unchanged |
| E — Open Party record, Bank Details | BankSelect shows Finance Banks | ✅ BankSelect added |
| E — Select bank | Read-only bank info panel appears | ✅ Implemented |
| F — Click "+ New Bank" | Finance Banks new record tab opens | ✅ Implemented |

---

## TypeScript / Build Results

```
npx tsc --noEmit   → Exit code 0 (PASS — 0 errors)
npx next build     → Exit code 0 (PASS — compiled in 7.8s)
```

---

## Known Limitations

1. **Party Bank Details `bank_id` was never populated historically** — existing party bank detail records have `bank_id = null` and rely on `bank_name_text` only. These are not migrated; users editing existing records can now optionally link to a Finance Bank by selecting from `BankSelect`.
2. **Relationship manager and facility fields missing from DB** — follow-up migration needed (ERP BANK MASTER STANDARD.2).
3. **No auto-refresh after "+ New Bank"** — after creating a bank in Finance Banks and returning to the Party Bank Details dialog, the user must clear and re-select the bank from `BankSelect` (the combobox re-queries on mount but does not auto-refresh while the dialog stays open). The `useBanksQuery` TanStack cache will be refreshed when the Finance Banks form saves.

---

## Next Recommended Phase

> **ERP BANK MASTER STANDARD.2** — Party Bank Relationship Field Enhancement  
> Add DB migration to add `relationship_manager_name`, `relationship_manager_mobile`, `relationship_manager_email`, `facility_limit`, `facility_expiry` to `party_bank_details`. Then surface them in the Party Bank Details child dialog.

---

*Report generated by Cursor — ERP BANK MASTER STANDARD.1 — 2026-06-14*
