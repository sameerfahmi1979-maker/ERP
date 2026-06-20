# ERP BASE 002F.3E.3B.6G.5 Implementation Report
## Apply Standard to Existing Forms / Future-Ready Modules

**Phase:** ERP BASE 002F.3E.3B.6G.5  
**Date/Time:** 2026-06-12  
**Engineer:** Cursor AI Agent (Sonnet 4.6)  
**Supabase Project:** https://mmiefuieduzdiiwnqpie.supabase.co  

---

## 1. Phase Name

**ERP BASE 002F.3E.3B.6G.5 — Apply Standard to Existing Forms / Future-Ready Modules**

---

## 2. Supabase Connection

Connected to live Supabase project: https://mmiefuieduzdiiwnqpie.supabase.co

No database schema changes were required for 3B.6G.5 Apply Standard to Existing Forms / Future-Ready Modules.

### Tables Verified (all present in `public` schema)

**Current modules (all present):**
- `customers`, `customer_contacts`, `customer_addresses`, `customer_bank_details`, `customer_documents`
- `owner_companies`, `branches`, `roles`, `user_profiles`
- `global_numbering_rules`, `global_lookup_categories`, `global_lookup_values`
- `countries`, `emirates`, `cities`, `areas_zones`, `ports`
- `banks`, `currencies`, `payment_terms`, `tax_types`
- `uom_categories`, `units_of_measure`, `uom_conversions`
- `cost_centers`, `profit_centers`

**Future party-master tables (all present):**
- `vendors`, `vendor_contacts`, `vendor_addresses`, `vendor_bank_details`, `vendor_documents`
- `subcontractors`, `subcontractor_contacts`, `subcontractor_addresses`, `subcontractor_bank_details`, `subcontractor_documents`
- `consultants`, `consultant_contacts`, `consultant_addresses`, `consultant_bank_details`, `consultant_documents`
- `government_authorities`, `government_authority_contacts`, `government_authority_addresses`, `government_authority_documents`
  - ⚠️ No `government_authority_bank_details` table — confirmed absent by design
- `recruitment_agencies`, `recruitment_agency_contacts`, `recruitment_agency_addresses`, `recruitment_agency_bank_details`, `recruitment_agency_documents`

**Lookup categories verified relevant to future modules:**
- `VENDOR_TYPES` ✅, `VENDOR_CATEGORIES` ✅
- `SUBCONTRACTOR_TYPES` ✅, `SUBCONTRACTOR_CATEGORIES` ✅
- `CONSULTANT_TYPES` ✅, `CONSULTANT_CATEGORIES` ✅
- `GOVERNMENT_AUTHORITY_TYPES` ✅, `GOVERNMENT_AUTHORITY_CATEGORIES` ✅
- `RECRUITMENT_AGENCY_TYPES` ✅, `RECRUITMENT_AGENCY_CATEGORIES` ✅
- `INDUSTRY_TYPES` ✅, `PARTY_STATUS_TYPES` ✅, `ICV_STATUS_TYPES` ✅

---

## 3. Standards and Reports Reviewed

- `docs/standards/ERP_GLOBAL_PARENT_FORM_RUNTIME_STANDARD.md`
- `docs/standards/ERP_GLOBAL_CURSOR_DEVELOPMENT_AND_IMPLEMENTATION_GUIDE.md`
- `docs/standards/ERP_GLOBAL_UI_UX_FORM_TABLE_DRAWER_DEVELOPMENT_GUIDE.md`
- `ERP_BASE_002F_3E_3B_6G_1_..._REPORT.md`
- `ERP_BASE_002F_3E_3B_6G_2_..._REPORT.md`
- `ERP_BASE_002F_3E_3B_6G_3_..._REPORT.md`
- `ERP_BASE_002F_3E_3B_6G_4_..._REPORT.md`

Source files read:
- `src/lib/query/form-prefetch-types.ts`
- `src/lib/query/prefetch-lookups.ts`
- `src/lib/query/query-keys.ts`
- `src/lib/query/invalidation.ts`
- `src/hooks/child-tables/use-child-table-query.ts`
- `src/features/master-data/customers/customer-prefetch.ts`
- `src/features/organizations/organization-form-dialog.tsx`
- `src/features/branches/branch-form-dialog.tsx`
- All finance-basics, geography, UOM, lookup, role, user form dialogs

---

## 4. Source Audit Results

### Lookup-heavy combobox usage

| Pattern | Files Found |
|---------|-------------|
| `LookupSelect` | customer-form-drawer, customer-addresses, customer-contacts, customer-bank-details, cost-center-form-dialog, profit-center-form-dialog, tax-type-form-dialog |
| `CountrySelect` | organization-form-dialog, branch-form-dialog, geography forms |
| `CurrencySelect` | organization-form-dialog |
| `OwnerCompanySelect` / `BranchSelect` | cost-center-form-dialog, profit-center-form-dialog |

### FormPrefetchDeclaration usage (pre-audit)

| Symbol | Files |
|--------|-------|
| `FormPrefetchDeclaration` | `form-prefetch-types.ts` (definition), `customer-prefetch.ts` |
| `CUSTOMER_FORM_PREFETCH` | `customer-prefetch.ts`, `use-customer-form-prefetch.ts` |

→ Only Customer had a declaration before this phase.

### ERPDrawerForm / ERPDrawerSection usage

Forms using the full multi-section drawer pattern:
- `customer-form-drawer.tsx` — 5 tabbed sections
- `organization-form-dialog.tsx` — 5 tabbed sections
- `branch-form-dialog.tsx` — 5 tabbed sections
- `role-detail-drawer.tsx` — sections
- `role-form-dialog.tsx` — simple drawer form

All other forms: simple `ERPDrawerForm` with a single section or modal dialog.

### new FormData usage

All active forms use `new FormData(form)` for submission. No exceptions observed. FormData safety rules (§5 of the standard) apply to all.

### Future party-master table references in src/

No existing code references `vendor_contacts`, `subcontractor_contacts`, `consultant_contacts`, `government_authority_contacts`, or `recruitment_agency_contacts` — confirming these modules are entirely un-implemented in the frontend.

---

## 5. Current Forms Compliance Matrix

| Module | Form | Lookup-heavy? | Child tables? | FormData risk? | Needs Prefetch Decl? | Compliance | Action Taken |
|--------|------|---------------|---------------|----------------|----------------------|------------|--------------|
| Customer | `customer-form-drawer.tsx` | ✅ 6 lookup + 4 master | ✅ contacts/addr/bank/docs | Yes | ✅ Already wired | **COMPLIANT** | None — reference impl |
| Organization | `organization-form-dialog.tsx` | ⚠️ geography/currency via TanStack hooks; no LookupSelect | None | Yes | Yes (masterQueries only) | **DECL-READY** | Created declaration |
| Branch | `branch-form-dialog.tsx` | ⚠️ geography via TanStack hooks; no LookupSelect | None | Yes | Yes (masterQueries only) | **DECL-READY** | Created declaration |
| Roles | role dialogs + drawer | No comboboxes | None | Yes | No | **D** | None |
| Users | add/edit dialogs | No comboboxes | None | Yes | No | **D** | None |
| Numbering Rules | dialog | No comboboxes | None | Yes | No | **D** | None |
| Geography | country/emirate/city/area/port dialogs | Cascade only | None | Yes | No — small dialogs | **D** | None |
| Finance Basics | currency/bank/payment-term dialogs | Small | None | Yes | No | **D** | None |
| Finance Basics | cost-center/profit-center dialogs | 1 LookupSelect + OwnerCo/Branch | None | Yes | No — single lookup | **D** | None |
| Finance Basics | tax-type dialog | 1 LookupSelect (treatment) | None | Yes | No — single lookup | **D** | None |
| UOM | uom-category/unit/conversion dialogs | None | None | Yes | No | **D** | None |
| Lookups | category/value dialogs | None | None | Yes | No | **D** | None |

**D = Not applicable (small form, no parent-child or multi-lookup loading issue)**

---

## 6. Declarations Created

### `src/features/organizations/organization-prefetch.ts` (NEW)

```typescript
export const ORGANIZATION_FORM_PREFETCH = {
  formId: "organizations",
  lookupCategories: [] as const,
  masterQueries: [
    { queryKey: queryKeys.countries(false, false), queryFn: () => fetchCountries(false, false) },
    { queryKey: queryKeys.currencies(false), queryFn: () => fetchCurrencies(false) },
  ],
  childTables: [] as const,
} as const satisfies FormPrefetchDeclaration;
```

**Note:** `lookupCategories` is empty because the Organization form uses no `LookupSelect` fields — only TanStack-backed geography/currency comboboxes that already benefit from shared cache. The `masterQueries` declaration enables future wiring of open-time prefetch for countries and currencies.

**Wiring deferred** to a later phase because: (a) the Organizations page is a server component and requires identifying the right client table component; (b) the existing `CountrySelect`/`CurrencySelect` hooks are already cache-backed and the UX impact is low compared to the full LookupSelect problem solved for Customer.

### `src/features/branches/branch-prefetch.ts` (NEW)

```typescript
export const BRANCH_FORM_PREFETCH = {
  formId: "branches",
  lookupCategories: [] as const,
  masterQueries: [
    { queryKey: queryKeys.countries(false, false), queryFn: () => fetchCountries(false, false) },
  ],
  childTables: [] as const,
} as const satisfies FormPrefetchDeclaration;
```

Same rationale as Organization. No LookupSelect fields; only country cache warming is beneficial.

---

## 7. Templates Created

### `src/lib/standards/party-master-prefetch-templates.ts` (NEW)

This file is NOT imported by any active component. It contains templates ready to copy when implementing future party-master modules.

**Contents:**

| Export | Description |
|--------|-------------|
| `invalidateVendorContacts/Addresses/BankDetails/Documents` | Ready-to-use invalidation helpers |
| `invalidateSubcontractorContacts/…` | Same pattern for subcontractors |
| `invalidateConsultantContacts/…` | Same pattern for consultants |
| `invalidateGovernmentAuthorityContacts/Addresses/Documents` | Note: no `BankDetails` (table absent) |
| `invalidateRecruitmentAgencyContacts/…` | Same pattern |
| `VENDOR_CHILD_TABLES` | `ChildTableDescriptor[]` for all 4 vendor child tables |
| `SUBCONTRACTOR_CHILD_TABLES` | Same |
| `CONSULTANT_CHILD_TABLES` | Same |
| `GOVERNMENT_AUTHORITY_CHILD_TABLES` | 3 tables (no bank_details) |
| `RECRUITMENT_AGENCY_CHILD_TABLES` | 4 tables |
| `VENDOR_FORM_PREFETCH_TEMPLATE` | Full `FormPrefetchDeclaration` with lookup categories + master queries |
| `SUBCONTRACTOR_FORM_PREFETCH_TEMPLATE` | Same |
| `CONSULTANT_FORM_PREFETCH_TEMPLATE` | Same |
| `GOVERNMENT_AUTHORITY_FORM_PREFETCH_TEMPLATE` | Same |
| `RECRUITMENT_AGENCY_FORM_PREFETCH_TEMPLATE` | Same |

All lookup category codes were verified against live `global_lookup_categories` before inclusion.

---

## 8. Standard Document Updates

Updated: `docs/standards/ERP_GLOBAL_PARENT_FORM_RUNTIME_STANDARD.md`

**New sections added:**

| Section | Content |
|---------|---------|
| §9 Current Module Compliance Status | Full matrix of all current modules, their compliance level and action taken |
| §10 When to Create a FormPrefetchDeclaration | Three-condition rule for when a declaration is warranted |
| §11 When NOT to Create a FormPrefetchDeclaration | Simple dialog rule, no-lookup rule |
| §12 FormData Risk Review Guide | Step-by-step procedure for evaluating lazy-mount safety |
| §13 Future Party-Master Module Template | Pointer to template file + 6-step implementation checklist |

Footer updated to reference 3B.6G.5 and its outcomes.

---

## 9. Existing Forms Changed or Not Changed

| Form | Changed? | Change |
|------|---------|--------|
| `customer-form-drawer.tsx` | No | Already compliant; no-touch |
| `organization-form-dialog.tsx` | No | Declaration only; form itself unchanged |
| `branch-form-dialog.tsx` | No | Declaration only; form itself unchanged |
| All other forms | No | No changes needed |

**No active runtime behavior was modified in this phase.**

---

## 10. FormData Risk Findings

All existing forms use `new FormData(form)` for full-payload save submissions.

Key risk items:
1. **Organization / Branch / Customer** — multi-section drawers; all non-child-table sections that contain form inputs must remain mounted at save time. The current `lazyMount` implementation is safe because sections are hidden with CSS after first mount, never removed from DOM.
2. **Customer Location / Finance tabs** — use "partial lazy-mount" pattern (3B.6E): parent inputs always mounted, embedded child CRUD lazy-mounted. This is the correct approach and must be replicated in future party-master modules.
3. **Small dialogs** (geography, finance, UOM, lookups) — all sections visible at all times; zero FormData risk.

No new FormData risks were introduced in this phase.

---

## 11. Future Party-Master Readiness

### Tables (all confirmed in live Supabase)

| Module | Parent | Contacts | Addresses | Bank Details | Documents |
|--------|--------|----------|-----------|--------------|-----------|
| Vendor | ✅ | ✅ | ✅ | ✅ | ✅ |
| Subcontractor | ✅ | ✅ | ✅ | ✅ | ✅ |
| Consultant | ✅ | ✅ | ✅ | ✅ | ✅ |
| Government Authority | ✅ | ✅ | ✅ | ⚠️ **absent** | ✅ |
| Recruitment Agency | ✅ | ✅ | ✅ | ✅ | ✅ |

⚠️ **Government Authority has no `bank_details` table.** Templates reflect this. Future implementation must NOT add a bank details section.

### Readiness checklist per module

Each future party-master module is ready to implement once:
- [ ] Copy `<ENTITY>_FORM_PREFETCH_TEMPLATE` → `src/features/master-data/<entity>/<entity>-prefetch.ts`
- [ ] Create child hooks using `useChildTableQuery` (reference: `use-customer-child-queries.ts`)
- [ ] Wire invalidation helpers (already declared in template file)
- [ ] Create server actions for parent CRUD
- [ ] Create server actions for each child table CRUD
- [ ] Wire prefetch hook into the module's list-page client component (reference: `useCustomerFormPrefetch`)
- [ ] Apply lazy-mount to documents/audit sections; partial lazy-mount to contacts/finance/location sections

---

## 12. Future Module Readiness Checklist

Modules beyond party-master:

| Module | FormPrefetchDeclaration needed? | Child tables? | Notes |
|--------|--------------------------------|---------------|-------|
| HR / Employees | Yes | Yes (employment history, dependents, documents) | No templates yet — scope for a future 3B.6G.x |
| Fleet / Vehicles / Equipment | Yes | Yes (maintenance, documents) | No templates yet |
| Workshop / Service Jobs | Yes | Yes (job lines, parts, documents) | No templates yet |
| Inventory / Spare Parts | Yes | Yes (stock movements, documents) | No templates yet |
| Projects | Yes | Yes (tasks, resources, milestones) | No templates yet |
| Procurement | Yes | Yes (PO lines, approvals) | No templates yet |
| Sales / CRM | Yes | Yes (lead activities, contacts) | No templates yet |
| Documents / DMS | Possibly | Maybe | Depends on form design |
| Tasks | No | No | Simple form expected |
| AI Center | N/A | N/A | Not a data form |

Party-master modules (Vendor/Subcontractor/Consultant/GovernmentAuthority/RecruitmentAgency) have templates ready in `src/lib/standards/party-master-prefetch-templates.ts`.

---

## 13. Static Test Results

| Test | Command | Result |
|------|---------|--------|
| TypeScript typecheck | `npx tsc --noEmit` | **PASS** — 0 errors |
| ESLint | `npm run lint` | 138 problems (60 errors, 78 warnings) — **ALL PRE-EXISTING**, 0 new errors introduced by this phase |
| Production build | `npm run build` | **PASS** — clean build, all routes compiled |
| New file lint check | `ReadLints` on 3 new files | **PASS** — 0 linter errors |

---

## 14. Known Limitations

1. **Organization and Branch declarations are wired as declaration-only.** Prefetch is not triggered on page mount because both pages are server components; the client table component would need a `useEffect` wrapping the prefetch hook (like `useCustomerFormPrefetch`). This is a very small change deferred to avoid scope creep.
2. **Legacy Supabase calls in Organization/Branch forms.** Both forms still use raw `createClient()` calls for resolving currency code → id, emirate id → name text, and city/area text fields. These are a separate concern from the prefetch standard (they handle legacy "text column" field sync, not lookup combobox data). This technical debt is documented but out of scope for 3B.6G.5.
3. **No `government_authority_bank_details` table.** Confirmed absent in live DB. Template `GOVERNMENT_AUTHORITY_CHILD_TABLES` correctly excludes it.
4. **Party-master templates are not runtime-verified.** They are structurally correct (no TS errors, all imports resolve) but have not been executed against real data — no server actions exist yet for Vendor/Subcontractor etc.
5. **Lint errors (138 pre-existing).** None were introduced by this phase. The majority are in `src/server/actions/master-data/lookups.ts` (`no-explicit-any`) and `UIUX_Design/` prototype files. These are tracked for a separate cleanup phase.

---

## 15. Next Phase Recommendation

**3B.6G.6 — Customer Final QA Closure + Organization/Branch Prefetch Wiring**

Suggested scope:
1. Wire `ORGANIZATION_FORM_PREFETCH` into the OrganizationsTable client component (very small change, mirrors `useCustomerFormPrefetch`).
2. Wire `BRANCH_FORM_PREFETCH` into the BranchesTable client component (same pattern).
3. Perform formal Customer drawer runtime QA: open-time batch lookup, child table lazy-fetch, Safe Close, Save & Close regression, FormData safety test.
4. Optional: clean up legacy Supabase calls in Organization/Branch forms to resolve currency/emirate text via cached hooks instead of raw client calls.

This is a low-risk, high-value phase that completes the 3B.6G performance optimization arc.

---

## 16. Final Status

**PASS WITH NOTES**

### Closure criteria verification

| Criteria | Status |
|----------|--------|
| Current forms audited | ✅ All 12 modules audited |
| Future party-master table readiness reviewed | ✅ 5 modules, all tables confirmed |
| Standard document updated | ✅ §9–§13 added |
| Declaration files created (Org/Branch) | ✅ |
| Future-ready template file created | ✅ `party-master-prefetch-templates.ts` |
| TypeScript typecheck passes | ✅ 0 errors |
| Production build passes | ✅ Clean |
| Report created | ✅ This document |

### Notes (non-blocking)

- Organization and Branch prefetch declarations exist but are not yet wired into page-mount prefetch — deferred to 3B.6G.6.
- Legacy raw Supabase calls in Organization/Branch forms for text-column sync are documented technical debt, not a runtime standard compliance blocker.
- Pre-existing lint errors (138) are not introduced by this phase.
