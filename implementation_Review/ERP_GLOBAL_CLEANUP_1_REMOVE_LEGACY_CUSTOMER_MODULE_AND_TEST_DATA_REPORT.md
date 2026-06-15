# ERP GLOBAL CLEANUP.1 — Remove Legacy Customer Module and Safely Retire Test Customer Data

**Phase:** ERP GLOBAL CLEANUP.1  
**Status:** CLOSED / PASS ✅  
**Date:** 2026-06-14  
**Executed by:** Cursor (AI Lead Engineer)  
**Sameer note:** _"The old legacy Customer module contains only test data."_

---

## Summary

The legacy standalone Customer module has been fully retired from the active ERP system. All routes now redirect to the unified Party Master Customers filtered view. All feature files, server actions, and dev harnesses have been deleted. Five legacy database tables were confirmed safe to drop and have been dropped via migration. Two tables (`customer_categories`, `customer_statuses`) were retained because they are referenced by the active `party_customer_profiles` table used by the Party Master system.

---

## Reason for Removal

1. The Unified Party Master (Phase 002F.5A / UI.4D) replaces separate customer/vendor/subcontractor structures.
2. A Customer is now represented as a Party with the `CUSTOMER` party type.
3. The legacy Customer module contained only seeded test data.
4. Keeping both modules created confusion and duplicate maintenance overhead.
5. Active customer route: `/admin/master-data/parties/customers`

---

## Files Deleted

### Feature Files (11 files)

| File | Status |
|---|---|
| `src/features/master-data/customers/components/customers-table.tsx` | DELETED |
| `src/features/master-data/customers/components/customer-workspace-form.tsx` | DELETED |
| `src/features/master-data/customers/components/customer-form-drawer.tsx` | DELETED |
| `src/features/master-data/customers/components/customer-contacts-section.tsx` | DELETED |
| `src/features/master-data/customers/components/customer-addresses-section.tsx` | DELETED |
| `src/features/master-data/customers/components/customer-bank-details-section.tsx` | DELETED |
| `src/features/master-data/customers/hooks/use-customer-form-prefetch.ts` | DELETED |
| `src/features/master-data/customers/hooks/use-customer-child-queries.ts` | DELETED |
| `src/features/master-data/customers/customer-prefetch.ts` | DELETED |
| `src/features/master-data/customers/types.ts` | DELETED |
| `src/features/master-data/customers/validation.ts` | DELETED |

### Server Actions (4 files)

| File | Status |
|---|---|
| `src/server/actions/master-data/customers.ts` | DELETED |
| `src/server/actions/master-data/customer-contacts.ts` | DELETED |
| `src/server/actions/master-data/customer-addresses.ts` | DELETED |
| `src/server/actions/master-data/customer-bank-details.ts` | DELETED |

### Dev Harnesses (4 files, 2 directories)

| File | Status |
|---|---|
| `src/app/dev/customer-prefetch-qa/page.tsx` | DELETED |
| `src/app/dev/customer-prefetch-qa/customer-prefetch-qa-client.tsx` | DELETED |
| `src/app/dev/customer-child-qa/page.tsx` | DELETED |
| `src/app/dev/customer-child-qa/customer-child-qa-client.tsx` | DELETED |

---

## Files Modified

| File | Change |
|---|---|
| `src/app/(protected)/admin/master-data/customers/page.tsx` | Replaced with `redirect("/admin/master-data/parties/customers")` |
| `src/app/(protected)/admin/master-data/customers/record/new/page.tsx` | Replaced with `redirect("/admin/master-data/parties/customers")` |
| `src/app/(protected)/admin/master-data/customers/record/[id]/page.tsx` | Replaced with `redirect("/admin/master-data/parties/customers")` |
| `src/components/layout/app-sidebar.tsx` | Removed `"Customers (Legacy)"` entry pointing to `/admin/master-data/customers` |
| `src/lib/workspace/workspace-route-registry.ts` | Removed 3 `CUSTOMERS_LEGACY` entries (list + record/new + record/[id]) |
| `src/lib/standards/party-master-prefetch-templates.ts` | Updated stale comment reference to deleted file |
| `.cursor/ALGT_ERP_SOURCE_OF_TRUTH.md` | Updated module table, phase tracker, change log, rule #12 |
| `.cursor/rules/erp-party-master-standard.mdc` | Created (new cursor rule) |

---

## Routes Redirected

| Old Route | New Destination | Method |
|---|---|---|
| `/admin/master-data/customers` | `/admin/master-data/parties/customers` | `redirect()` in page.tsx |
| `/admin/master-data/customers/record/new` | `/admin/master-data/parties/customers` | `redirect()` in page.tsx |
| `/admin/master-data/customers/record/[id]` | `/admin/master-data/parties/customers` | `redirect()` in page.tsx |

---

## Menu / Sidebar Changes

| Before | After |
|---|---|
| Sidebar had `"Customers (Legacy)"` item → `/admin/master-data/customers` | Item removed entirely. Active `"Customers"` item in Party Master section → `/admin/master-data/parties/customers` remains. |

---

## Workspace Route Registry Changes

Removed 3 entries:
- `route: "/admin/master-data/customers"` (moduleCode: `CUSTOMERS_LEGACY`)
- `route: "/admin/master-data/customers/record/new"` (moduleCode: `CUSTOMERS_LEGACY`)
- `route: "/admin/master-data/customers/record/"` with pattern (moduleCode: `CUSTOMERS_LEGACY`)

Active Party Master customer routes remain:
- `route: "/admin/master-data/parties/customers"` (moduleCode: `PARTY_MASTER`) — already present

---

## Server Actions Status

All 4 legacy customer server action files have been deleted. No remaining references in any active code path.

Active customer operations now use:
- `src/server/actions/master-data/parties.ts` (createParty, updateParty, getPartyById, etc.)

---

## Customer DB Dependency Audit

### Tables found in `public` schema

| Table | Dependency Check | Result |
|---|---|---|
| `customers` | Only outbound FKs to shared lookup tables (cities, countries, currencies, user_profiles, etc.) | ✅ SAFE TO DROP |
| `customer_contacts` | FK to `customers` only (no other table references it) | ✅ SAFE TO DROP |
| `customer_addresses` | FK to `customers` + shared geography | ✅ SAFE TO DROP |
| `customer_bank_details` | FK to `customers` + shared finance tables | ✅ SAFE TO DROP |
| `customer_documents` | FK to `customers` + user_profiles | ✅ SAFE TO DROP |
| `customer_categories` | Referenced by `party_customer_profiles.customer_category_id` (active Party Master FK) | ⚠️ RETAIN |
| `customer_statuses` | Referenced by `party_customer_profiles.customer_status_id` (active Party Master FK) | ⚠️ RETAIN |

### Views / Functions / Triggers depending on customer tables

None found. Dependency audit is clean for the 5 tables dropped.

### Conclusion

All 5 conditions for DB cleanup confirmed:
1. ✅ Data is test only (confirmed by Sameer)
2. ✅ No active app code references remain
3. ✅ No non-customer tables depend on `customers`, `customer_contacts`, `customer_addresses`, `customer_bank_details`, `customer_documents`
4. ✅ No views, functions, or reports depend on these tables
5. ✅ TypeScript + build pass after removing code references

---

## Customer DB Table Status

| Table | Status |
|---|---|
| `customers` | **DROPPED** (migration `20260614145000`) |
| `customer_contacts` | **DROPPED** (migration `20260614145000`) |
| `customer_addresses` | **DROPPED** (migration `20260614145000`) |
| `customer_bank_details` | **DROPPED** (migration `20260614145000`) |
| `customer_documents` | **DROPPED** (migration `20260614145000`) |
| `customer_categories` | **RETAINED** — FK from `party_customer_profiles.customer_category_id` |
| `customer_statuses` | **RETAINED** — FK from `party_customer_profiles.customer_status_id` |

---

## Migration Created

**File:** `supabase/migrations/20260614145000_drop_legacy_customer_module_tables.sql`

```sql
drop table if exists customer_documents;
drop table if exists customer_bank_details;
drop table if exists customer_addresses;
drop table if exists customer_contacts;
drop table if exists customers;
```

Applied via Supabase MCP `apply_migration` — confirmed `success: true`.

---

## Party Master Replacement Route

| Workflow | Legacy | Active |
|---|---|---|
| List customers | `/admin/master-data/customers` | `/admin/master-data/parties/customers` |
| Add customer | `/admin/master-data/customers/record/new` | `/admin/master-data/parties/record/new` (Party record with CUSTOMER type) |
| View customer | `/admin/master-data/customers/record/[id]` | `/admin/master-data/parties/record/[id]?mode=view` |
| Edit customer | `/admin/master-data/customers/record/[id]?mode=edit` | `/admin/master-data/parties/record/[id]?mode=edit` |
| Contacts / Addresses / Bank Details | Legacy `CustomerFormDrawer` child tabs | Party record workspace form tabs |

**Note:** The Party Master Add button from the Customers filtered view does not yet pre-select the CUSTOMER type automatically. This is a known follow-up improvement (Party Master pre-populate type from filtered view context).

---

## Global Reference Audit

| Reference | Classification |
|---|---|
| `CustomerWorkspaceForm` | REMOVED — file deleted |
| `CustomerFormDrawer` | REMOVED — file deleted |
| `CustomersTable` | REMOVED — file deleted |
| `customer-workspace-form` | REMOVED — file deleted |
| `customer-form-drawer` | REMOVED — file deleted |
| `customers-table` | REMOVED — file deleted |
| `customer-prefetch` | REMOVED — file deleted |
| `use-customer-form-prefetch` | REMOVED — file deleted |
| `use-customer-child-queries` | REMOVED — file deleted |
| `getCustomers` / `createCustomer` / `updateCustomer` / `deleteCustomer` / `getCustomerById` | REMOVED — server action files deleted |
| `master-data/customers` in sidebar | REMOVED — entry deleted from app-sidebar.tsx |
| `master-data/customers` in registry | REMOVED — 3 entries removed from workspace-route-registry.ts |
| `master-data/customers` route pages | REDIRECT ONLY — 3 pages redirect to party master |
| `customer_contacts` DB table | DB MIGRATION ONLY — dropped |
| `customer_addresses` DB table | DB MIGRATION ONLY — dropped |
| `customer_bank_details` DB table | DB MIGRATION ONLY — dropped |
| `customer_documents` DB table | DB MIGRATION ONLY — dropped |
| `customers` DB table | DB MIGRATION ONLY — dropped |
| `customer_categories` DB table | LEGACY TABLE RETAINED — FK from party_customer_profiles |
| `customer_statuses` DB table | LEGACY TABLE RETAINED — FK from party_customer_profiles |
| `party-master-prefetch-templates.ts` comment | FALSE POSITIVE — comment only, updated |
| `src/app/(protected)/admin/master-data/customers/` route dir | REDIRECT ONLY — page files kept with redirect |

---

## QA Scenarios

| Scenario | Expected | Verified |
|---|---|---|
| A — Open `/admin/master-data/customers` | Redirects to `/admin/master-data/parties/customers` | ✅ Route replaced with redirect() |
| B — Open `/admin/master-data/customers/record/new` | Redirects to `/admin/master-data/parties/customers` | ✅ Route replaced with redirect() |
| B — Open `/admin/master-data/customers/record/1?mode=edit` | Redirects to `/admin/master-data/parties/customers` | ✅ Route replaced with redirect() |
| C — Sidebar has no legacy Customer route | No `Customers (Legacy)` entry in sidebar | ✅ Entry removed from app-sidebar.tsx |
| C — Active Customers link in sidebar points to Party Master | `/admin/master-data/parties/customers` | ✅ Already correct, unchanged |
| D — Add Customer workflow via Party Master | Use Party record form | ✅ Verified via source — party-workspace-form remains active |
| E — Legacy customer tables no longer exist | Confirmed via DB migration | ✅ Migration applied; 5 tables dropped |
| E — App build still passes | TypeScript + Next.js build pass | ✅ Exit code 0 |

---

## TypeScript / Build Results

```
npx tsc --noEmit   → Exit code 0 (PASS — 0 errors)
npx next build     → Exit code 0 (PASS — compiled successfully in 8.0s)
```

Note: `.next/types/validator.ts` contained stale references to the deleted dev harness pages. Clearing `.next/types/` before running `tsc` resolved this (the stale cache was not part of source code).

---

## Known Limitations

1. **Party Master Add from filtered view does not pre-select party type.** Opening "Add" from `/admin/master-data/parties/customers` creates a generic New Party form without pre-selecting `CUSTOMER` type. This is a usability improvement, not a blocker. Tracked as follow-up.
2. **`customer_categories` and `customer_statuses` remain in DB** — these are required by `party_customer_profiles` and will only be droppable if Party Master is migrated off them.
3. **Legacy customer route directory remains** — `src/app/(protected)/admin/master-data/customers/` is retained with redirect pages to ensure bookmarks and old workspace tabs resolve gracefully rather than 404.

---

## Cursor Rule Created

**File:** `.cursor/rules/erp-party-master-standard.mdc`

Enforces:
- Customer functionality must use Party Master
- Active customer route is `/admin/master-data/parties/customers`
- Do not build against deleted customer feature files
- Do not create new server actions against dropped customer tables
- `customer_categories` and `customer_statuses` are retained for Party Master use

---

## Next Recommended Phase

> **ERP GLOBAL UI.4F Browser QA** — The `PASS WITH NOTES` gate from UI.4F requires Sameer to complete the manual browser QA checklist documented in `implementation_Review/ERP_GLOBAL_UI_4F_RUNTIME_QA_AND_PERFORMANCE_GATE_REPORT.md`.

After browser QA is confirmed, suggested next phases:
- **Party Master Add from filtered view → auto-preselect party type** (small UX improvement)
- **ERP GLOBAL CLEANUP.2** — Retire other legacy standalone party modules (vendors, subcontractors, consultants, etc.) following the same pattern as CLEANUP.1

---

*Report generated by Cursor — ERP GLOBAL CLEANUP.1 — 2026-06-14*
