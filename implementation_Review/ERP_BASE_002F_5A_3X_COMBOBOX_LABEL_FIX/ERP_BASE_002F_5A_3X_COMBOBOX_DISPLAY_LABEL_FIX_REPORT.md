# ERP BASE 002F.5A.3X — Party Module Combobox Display Label Fix
**Date:** 2026-06-14  
**Phase:** 002F.5A.3X (hot-fix)  
**Status:** COMPLETE

---

## Root Cause

Shadcn/Radix `<Select>` resolves its display text (`SelectValue`) from the `textValue` of
`SelectItem` elements **at the time they are mounted**. When `SelectItem` elements haven't
been rendered yet (e.g. async data still loading), Radix falls back to displaying the raw
`value` string — the numeric database ID ("1", "2", etc.).

`ERPCombobox` avoids this completely: it derives `selectedOption` via a `.find()` on the
live `options` array on every render, so it always resolves the correct label the moment
options become available.

---

## Fields Fixed (11 selects across 5 files)

| File | Field | Before | After |
|------|-------|--------|-------|
| `party-form-drawer.tsx` | Party Nature | `<Select>` | `ERPCombobox` |
| `party-form-drawer.tsx` | Party Status | `<Select>` | `ERPCombobox` |
| `party-licenses-tab.tsx` | License Type | `<Select>` | `ERPCombobox` |
| `party-licenses-tab.tsx` | License Status | `<Select>` | `ERPCombobox` |
| `party-contacts-tab.tsx` | Department | `<Select>` | `ERPCombobox` |
| `party-contacts-tab.tsx` | Contact Role | `<Select>` | `ERPCombobox` |
| `party-addresses-tab.tsx` | Address Type | `<Select>` | `ERPCombobox` |
| `party-documents-tab.tsx` | Document Type | `<Select>` | `ERPCombobox` |
| `party-documents-tab.tsx` | Document Status | `<Select>` | `ERPCombobox` |
| `party-tax-finance-tab.tsx` | Default Payment Method | `<Select>` | `ERPCombobox` |
| `party-tax-finance-tab.tsx` | Tax Status | `<Select>` | `ERPCombobox` |

---

## Fields Already Correct (no change needed)

| Component | Reason |
|-----------|--------|
| `CountrySelect`, `EmirateSelect`, `CitySelect`, `AreaZoneSelect` | Already backed by `ERPCombobox` via geography hooks |
| `CurrencySelect`, `PaymentTermSelect`, `TaxTypeSelect` | Already backed by `ERPCombobox` via finance-basics |
| `PartySelect` | Already backed by `ERPCombobox` with `showCode=true` displaying `party_code - display_name` |
| Bank name | Uses free-text `Input` (`bank_name_text`), not a select — no change needed |
| Services category | Already uses `ERPCombobox` in `party-services-tab.tsx` |
| Note type | Already uses `ERPCombobox` in `party-notes-tab.tsx` |
| Party Types tab | Uses custom checkbox list (no Select involved) |

---

## Changes Per File

### `party-form-drawer.tsx`
- Removed: `Select, SelectContent, SelectItem, SelectTrigger, SelectValue` imports
- Added: `ERPCombobox` import
- Converted: Party Nature and Party Status selects

### `party-licenses-tab.tsx`
- Removed: `Select` imports
- Added: `ERPCombobox` import  
- Converted: License Type and License Status selects

### `party-contacts-tab.tsx`
- Removed: `Select` imports
- Added: `ERPCombobox` import
- Converted: Department and Contact Role selects (both with `allowClear`)

### `party-addresses-tab.tsx`
- Removed: `Select` imports
- Added: `ERPCombobox` import
- Converted: Address Type select

### `party-documents-tab.tsx`
- Removed: `Select` imports
- Added: `ERPCombobox` import
- Converted: Document Type and Document Status selects

### `party-tax-finance-tab.tsx`
- Removed: `Select` imports
- Added: `ERPCombobox` import
- Converted: Default Payment Method (with `allowClear`) and Tax Status selects

---

## Build Results

- `npx tsc --noEmit` → **0 errors**
- `npx next build` → **✓ Compiled successfully**

---

## Acceptance

- All combobox fields in Party Basic Information, Licenses, Tax & Finance, Contacts, Addresses, Documents show human-readable names after selection
- No raw IDs displayed in any combobox trigger
- Saved/edit-loaded records resolve labels correctly once options arrive in cache (prefetch ensures near-instant availability)
- No database schema changes
- Legacy Customer module untouched
