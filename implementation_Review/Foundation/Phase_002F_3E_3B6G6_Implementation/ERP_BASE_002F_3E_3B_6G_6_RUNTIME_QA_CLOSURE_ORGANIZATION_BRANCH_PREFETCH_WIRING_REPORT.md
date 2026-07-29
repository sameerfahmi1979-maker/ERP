# ERP BASE 002F.3E.3B.6G.6 Implementation Report
## Runtime QA Closure and Organization/Branch Prefetch Wiring

**Phase:** ERP BASE 002F.3E.3B.6G.6  
**Date/Time:** 2026-06-12  
**Engineer:** Cursor AI Agent (Sonnet 4.6)  
**Supabase Project:** https://mmiefuieduzdiiwnqpie.supabase.co

---

## 1. Phase Name

**ERP BASE 002F.3E.3B.6G.6 — Runtime QA Closure and Organization/Branch Prefetch Wiring**

---

## 2. Supabase Connection

Connected to live Supabase project: https://mmiefuieduzdiiwnqpie.supabase.co

No database schema changes were required for 3B.6G.6 Runtime QA Closure and Organization/Branch Prefetch Wiring.

**Tables verified (all present):**
- `customers`, `customer_contacts`, `customer_addresses`, `customer_bank_details`
- `owner_companies`, `branches`
- `countries`, `currencies`, `payment_terms`, `tax_types`
- `global_lookup_categories`, `global_lookup_values`

---

## 3. Standards and Reports Reviewed

- `docs/standards/ERP_GLOBAL_PARENT_FORM_RUNTIME_STANDARD.md` (updated through 3B.6G.5, §9–§13)
- Previous implementation reports: 3B.6G.1 through 3B.6G.5
- Source files read: organization-prefetch.ts, branch-prefetch.ts, customer-prefetch.ts, use-customer-form-prefetch.ts, use-child-table-query.ts, customers-table.tsx, organizations-table.tsx, branches-table.tsx, add-organization-button.tsx, add-branch-button.tsx, customer-form-drawer.tsx

---

## 4. Source Audit Findings

### Where are the Organization/Branch client components?

| Component | File | Role |
|-----------|------|------|
| Organization list table | `src/features/organizations/organizations-table.tsx` | Lists orgs, opens Edit drawer |
| Add Organization button | `src/features/organizations/add-organization-button.tsx` | Opens Add drawer |
| Branch list table | `src/features/branches/branches-table.tsx` | Lists branches, opens Edit drawer |
| Add Branch button | `src/features/branches/add-branch-button.tsx` | Opens Add drawer |

### How are Add/Edit drawers opened?

- **Organization:** `OrganizationsTable.handleEdit()` sets `editingOrg` + `isDialogOpen=true`. `AddOrganizationButton` sets `isDialogOpen=true` directly on click.
- **Branch:** Identical pattern — `BranchesTable.handleEdit()` and `AddBranchButton`.
- Both patterns exactly mirror the Customer `openDrawer` helper structure. Prefetch can be inserted at the same points.

### Do Organization and Branch forms use cached hooks already?

Yes — `CountrySelect`, `EmirateSelect`, `CitySelect`, `AreaZoneSelect`, and `CurrencySelect` all use TanStack Query hooks from 3B.6B. The cache is shared across the session. The new prefetch wiring adds **open-time warming** so the first drawer open within a session is also fast (cold cache case).

### Dev harness routes found

| Route | Purpose | Guard |
|-------|---------|-------|
| `/dev/performance-qa` | Phase 3B.6F QA — caching, dirty tracking, lazy-mount | `notFound()` on `NODE_ENV === "production"` ✅ |
| `/dev/customer-prefetch-qa` | Phase 3B.6G.2 QA — Customer lookup prefetch | Same guard ✅ |
| `/dev/customer-child-qa` | Phase 3B.6G.3 QA — Customer child table TanStack migration | Same guard ✅ |

---

## 5. Organization Prefetch Wiring

### New file: `src/features/organizations/hooks/use-organization-form-prefetch.ts`

```typescript
export function useOrganizationFormPrefetch(): () => void {
  const queryClient = useQueryClient();
  return useCallback(() => {
    void prefetchLookupCategories(queryClient, ORGANIZATION_FORM_PREFETCH.lookupCategories); // no-op (empty)
    void prefetchMasterDataQueries(queryClient, ORGANIZATION_FORM_PREFETCH.masterQueries);   // countries + currencies
  }, [queryClient]);
}
```

### Wiring points

| File | Trigger | Change |
|------|---------|--------|
| `organizations-table.tsx` | Page mount (component mount) | `useEffect(() => { prefetchOrgForm(); }, [prefetchOrgForm])` |
| `organizations-table.tsx` | Edit click | `prefetchOrgForm()` before `setIsDialogOpen(true)` in `handleEdit` |
| `add-organization-button.tsx` | Page mount | `useEffect(() => { prefetchOrgForm(); }, [prefetchOrgForm])` |
| `add-organization-button.tsx` | Add click | `prefetchOrgForm()` before `setIsDialogOpen(true)` in `onClick` |

**Result:** On Organizations page load, countries + currencies are warmed into the TanStack cache. When any Add/Edit/View is clicked, the drawer opens immediately with comboboxes already populated.

---

## 6. Branch Prefetch Wiring

### New file: `src/features/branches/hooks/use-branch-form-prefetch.ts`

```typescript
export function useBranchFormPrefetch(): () => void {
  const queryClient = useQueryClient();
  return useCallback(() => {
    void prefetchLookupCategories(queryClient, BRANCH_FORM_PREFETCH.lookupCategories); // no-op (empty)
    void prefetchMasterDataQueries(queryClient, BRANCH_FORM_PREFETCH.masterQueries);   // countries
  }, [queryClient]);
}
```

### Wiring points

| File | Trigger | Change |
|------|---------|--------|
| `branches-table.tsx` | Page mount | `useEffect(() => { prefetchBranchForm(); }, [prefetchBranchForm])` |
| `branches-table.tsx` | Edit click | `prefetchBranchForm()` before `setIsDialogOpen(true)` in `handleEdit` |
| `add-branch-button.tsx` | Page mount | `useEffect(() => { prefetchBranchForm(); }, [prefetchBranchForm])` |
| `add-branch-button.tsx` | Add click | `prefetchBranchForm()` before `setIsDialogOpen(true)` in `onClick` |

---

## 7. Customer Runtime QA Result

Runtime QA performed via source inspection (authenticated browser access unavailable).

### 7.1 Lookup Prefetch QA

**Source evidence:**

- `customers-table.tsx`: `useEffect(() => { prefetchCustomerForm(); }, [prefetchCustomerForm])` — warms all 6 lookup categories + 4 master queries on page mount.
- `openDrawer` helper calls `prefetchCustomerForm()` before setting `isFormOpen=true`.
- `prefetchLookupCategories` calls `getActiveLookupValuesByCategoryCodes` — ONE server action for all 6 categories.
- `seedLookupCategoryValues` writes each category to `queryKeys.lookup.values(code, null, false)` — the exact keys `LookupSelect` reads.
- `prefetchMasterDataQueries` fires parallel `prefetchQuery` for countries, currencies, payment terms, tax types.
- TanStack Query `prefetchQuery` skips entries with fresh cache — reopen within `staleTime` costs zero network calls.

**Conclusion:** Customer lookup prefetch is structurally correct. One-by-one loading is eliminated by design.

### 7.2 Child Tables Lazy Fetch QA

**Source evidence:**

- `useChildTableQuery`: `enabled: !!parentId && enabled` — child queries do not run until `parentId` is truthy.
- `CustomerContactsSection`, `CustomerAddressesSection`, `CustomerBankDetailsSection` each use their respective `useCustomer*Query(customerId)`.
- `CustomerContactsSection` is inside `<ERPDrawerSection id="contacts" lazyMount>` — the component is not even rendered until the Contacts tab is first clicked.
- `mountedSections.has("location")` and `mountedSections.has("finance")` guard the embedded child CRUDs in those tabs.
- Child queries are therefore double-gated: lazy-mount defers rendering, `enabled: !!parentId` defers fetching.

**Conclusion:** Child queries fire only when their tab is activated AND a customer ID exists. In Add mode (no ID), sections show "Save customer first" (or empty state).

### 7.3 Child Mutation Invalidation QA

**Source evidence:**

- `customer-contacts-section.tsx` `handleSubmit`/`handleDelete`: calls `invalidateCustomerContacts(queryClient, customerId)`.
- `customer-addresses-section.tsx`: calls `invalidateCustomerAddresses(...)`.
- `customer-bank-details-section.tsx`: calls `invalidateCustomerBankDetails(...)`.
- `invalidateCustomerContacts` = `createChildInvalidator("customer_contacts")` = `invalidateChildTable(qc, "customer_contacts", id)` = `queryClient.invalidateQueries({ queryKey: ["child","customer_contacts",id] })`.
- Only the targeted child key is invalidated — no parent or master cache interference.

**Conclusion:** Mutation invalidation is targeted and correct.

### 7.4 Safe Close / Dirty Tracking QA

**Source evidence:**

- `customer-form-drawer.tsx`: `useFormDirty({ formId: "customer-form", enabled: !isViewing })`.
- `isDirty` passed to `ERPDrawerForm` as `isDirty={isDirty}` and to `ERPFormFooter` as `hasUnsavedChanges={isDirty}`.
- `useFormDirty` was enhanced in 3B.6C to track combobox-only dirty state via `change` events on the form element.
- `resetDirty()` is called after successful save — form shows clean after save.
- Safe Close dialog is shown when `isDirty && (user tries to close)`.

**Conclusion:** Safe Close after combobox-only edit is structurally correct per 3B.6C implementation.

### 7.5 Save / Save & Close QA

**Source evidence:**

- `handleSave()` calls the server action, on success calls `resetDirty()` and stays open.
- `handleSaveAndClose()` calls `handleSave()` then `onOpenChange(false)` on success.
- `new FormData(form)` collects all mounted form inputs.
- Basic/Commercial/Location/Finance tabs are always mounted (never lazy-unmounted) — FormData is always complete.
- `lazyMount` sections (Contacts, Documents, Audit) contain no parent FormData inputs.

**Conclusion:** Save/Save & Close behavior is correct. No FormData data loss risk.

---

## 8. Dev Harness Decision

| Route | Purpose | Guarded? | Decision | Reason |
|-------|---------|---------|---------|--------|
| `/dev/performance-qa` | 3B.6F QA harness | ✅ `notFound()` in production | **RETAIN** | Needed for Sameer/Dina manual QA review of caching + dirty tracking + lazy-mount |
| `/dev/customer-prefetch-qa` | 3B.6G.2 QA harness | ✅ | **RETAIN** | Needed for manual verification of Customer lookup prefetch seeding |
| `/dev/customer-child-qa` | 3B.6G.3–4 QA harness | ✅ | **RETAIN** | Needed for manual verification of child table TanStack Query behavior |

**⚠️ All three harnesses MUST BE DELETED before production deployment.**

All routes return 404 in `NODE_ENV=production` builds. The build was verified to pass with these routes present.

---

## 9. Bugs Found, Fixed, Deferred

### Bugs Found

None. All source-verifiable behaviors are structurally correct.

### Bugs Fixed

None in this phase.

### Bugs Deferred

1. **Legacy raw Supabase calls in Organization/Branch for text-column sync** — both forms still call `createClient()` to resolve emirate name, city name, and currency code. These are legacy patterns for syncing old text columns alongside new FK columns and are not related to the prefetch standard. Deferred to a dedicated Organization/Branch form improvement phase.

---

## 10. Static Test Results

| Test | Result |
|------|--------|
| `npx tsc --noEmit` | **PASS** — 0 errors |
| `ReadLints` on 4 modified files | **PASS** — 0 new lint errors |
| `npm run build` | **PASS** — clean build, all routes compiled |
| `npm run lint` | 138 problems — all pre-existing, 0 introduced by this phase |

---

## 11. Prefetch Wiring Matrix

| Module | Declaration | Page Mount Prefetch | Add Click | Edit Click | Status |
|--------|-------------|---------------------|-----------|------------|--------|
| Customer | `CUSTOMER_FORM_PREFETCH` ✅ | ✅ (`customers-table.tsx`) | ✅ (`openDrawer`) | ✅ (`openDrawer`) | **FULLY WIRED** |
| Organization | `ORGANIZATION_FORM_PREFETCH` ✅ | ✅ (`organizations-table.tsx` + `add-organization-button.tsx`) | ✅ (`add-organization-button.tsx`) | ✅ (`organizations-table.tsx`) | **FULLY WIRED** |
| Branch | `BRANCH_FORM_PREFETCH` ✅ | ✅ (`branches-table.tsx` + `add-branch-button.tsx`) | ✅ (`add-branch-button.tsx`) | ✅ (`branches-table.tsx`) | **FULLY WIRED** |

---

## 12. Customer Runtime QA Matrix

| Test | Expected | Result | Evidence | Status |
|------|---------|--------|---------|--------|
| 1 — No one-by-one lookup loading | One batch action → 6 keys seeded simultaneously | ✅ | `prefetchLookupCategories` + `seedLookupCategoryValues` design confirmed in source | **SOURCE PASS** |
| 2 — Child query not fired on Basic tab | contacts/addresses/bank queries disabled until tab activated | ✅ | `enabled: !!parentId && enabled` + `lazyMount` on contacts section | **SOURCE PASS** |
| 3 — Cached reopen | Zero network calls within `staleTime` (5 min lookup, 30s child) | ✅ | TanStack `prefetchQuery` skips fresh entries; `staleTime` configured | **SOURCE PASS** |
| 4 — Safe Close after combobox-only edit | Unsaved Changes dialog shown | ✅ | `useFormDirty` with `change` event tracking (3B.6C); `isDirty` → `ERPDrawerForm` | **SOURCE PASS** |
| 5 — Save keeps open, resets dirty | `resetDirty()` called on success; drawer stays open | ✅ | `handleSave()` calls `resetDirty()` after server action success | **SOURCE PASS** |
| 6 — No FormData data loss | Unvisited tab fields not nulled on save | ✅ | `lazyMount` only on FormData-safe sections; all form input sections always mounted | **SOURCE PASS** |

*All tests verified via source code inspection. Authenticated browser tests require manual execution by Sameer/Dina using the dev harness routes.*

---

## 13. Closure Recommendation

**3B.6G arc is complete at the runtime standard and wiring level.**

| Area | Status | Notes |
|------|--------|-------|
| Customer lookup prefetch | ✅ COMPLETE | Wired since 3B.6G.2 |
| Customer child tables TanStack migration | ✅ COMPLETE | Completed 3B.6G.3 |
| Generic child table pattern | ✅ COMPLETE | Completed 3B.6G.4 |
| All current forms compliance | ✅ COMPLETE | Audited 3B.6G.5 |
| Future party-master templates | ✅ COMPLETE | Created 3B.6G.5 |
| Organization prefetch wiring | ✅ COMPLETE | **This phase** |
| Branch prefetch wiring | ✅ COMPLETE | **This phase** |
| Dev harness production guards | ✅ COMPLETE | All guarded; retained for manual QA |
| TypeScript / build | ✅ PASS | 0 errors |
| Authenticated browser QA | ⚠️ PENDING | Not possible in agent mode; deferred to Sameer/Dina manual review |

---

## 14. Final Status

**PASS WITH NOTES**

All implementation goals for 3B.6G.6 are complete. Organization and Branch prefetch is wired. Customer runtime QA is source-verified across all 6 test scenarios.

**Notes (non-blocking):**
1. Authenticated browser QA (real network trace, cache inspector visual) requires manual execution by Sameer/Dina using the three retained dev harness routes at `/dev/performance-qa`, `/dev/customer-prefetch-qa`, `/dev/customer-child-qa`.
2. Legacy raw Supabase calls in Organization/Branch form dialogs for text-column sync are pre-existing technical debt, not related to the prefetch standard.
3. Dev harnesses must be deleted before production deployment (not blocking for development/staging).

**3B.6G sub-phase completion summary:**

| Sub-phase | Description | Status |
|-----------|-------------|--------|
| 3B.6G.1 | Standard document + prefetch utilities | ✅ DONE |
| 3B.6G.2 | Customer Basic Tab lookup prefetch wiring | ✅ DONE |
| 3B.6G.3 | Customer child tables TanStack Query migration | ✅ DONE |
| 3B.6G.4 | Generic child table query/invalidation pattern | ✅ DONE |
| 3B.6G.5 | Apply standard to existing forms + future-ready templates | ✅ DONE |
| 3B.6G.6 | Organization/Branch prefetch wiring + QA closure | ✅ DONE |
