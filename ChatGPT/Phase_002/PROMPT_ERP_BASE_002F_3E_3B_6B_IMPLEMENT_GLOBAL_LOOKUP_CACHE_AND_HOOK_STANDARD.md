# PROMPT_ERP_BASE_002F_3E_3B_6B_IMPLEMENT_GLOBAL_LOOKUP_CACHE_AND_HOOK_STANDARD

Act as a senior ERP performance architect, Next.js 16 engineer, React runtime optimization engineer, TanStack Query implementation specialist, Supabase query optimization reviewer, enterprise combobox data-layer architect, SaaS security/RLS reviewer, and Cursor implementation engineer.

## Phase

ERP BASE 002F.3E.3B.6B — Implement Global Lookup Cache and Hook Standard

## Prompt Purpose

This is a controlled IMPLEMENTATION prompt.

Implement the global lookup cache and hook standard approved in:

```text
ERP_BASE_002F_3E_3B_6A_GLOBAL_COMBOBOX_AND_FORM_RUNTIME_PERFORMANCE_AUDIT_PLAN.md
```

This is not Customer-only.

This phase must create the shared lookup/master-data performance layer that all current and future ERP forms will use.

The purpose is to eliminate duplicated lookup queries, reduce drawer loading overhead, and prepare all future modules for fast combobox/search behavior.

Do not implement 3B.6C, 3B.6D, 3B.6E, or 3B.6F in this phase.

Do not convert all forms yet unless needed for the shared hook proof.

Do not implement drawer lazy loading yet.

Do not implement virtualization yet.

Do not implement server-side entity search yet.

---

# 1. Approved Source Plan

Read and follow:

```text
ERP_BASE_002F_3E_3B_6A_GLOBAL_COMBOBOX_AND_FORM_RUNTIME_PERFORMANCE_AUDIT_PLAN.md
```

Approved subphase sequence:

```text
3B.6B — Global Lookup Cache and Hook Standard
3B.6C — ERPCombobox Runtime, Debounce, Dirty Integration
3B.6D — Apply Optimized Hooks to Current Forms
3B.6E — Lazy-Load Drawer Tabs and Child Sections
3B.6F — Runtime Performance QA and Closure Gate
```

This prompt is only for:

```text
3B.6B
```

---

# 2. Mandatory Supabase Connection First

Before implementation, connect to live Supabase:

```text
https://mmiefuieduzdiiwnqpie.supabase.co
```

Verify the live schema and row counts for:

```text
global_lookup_categories
global_lookup_values
countries
emirates
cities
areas_zones
ports
banks
currencies
payment_terms
tax_types
cost_centers
profit_centers
uom_categories
units_of_measure
uom_conversions
owner_companies
branches
customers
roles
user_profiles
```

No schema change is expected unless absolutely required and approved by the live schema review.

Do not create migrations unless a critical missing index/function is discovered and documented first.

The implementation report must include:

```text
Connected to live Supabase project: https://mmiefuieduzdiiwnqpie.supabase.co
No database schema changes were required for 3B.6B Global Lookup Cache and Hook Standard.
```

If any table names differ from prompt names, document the live names and use the actual live schema.

---

# 3. Mandatory Documents and Reports to Read

Read standards:

```text
docs/standards/ERP_GLOBAL_CURSOR_DEVELOPMENT_AND_IMPLEMENTATION_GUIDE.md
docs/standards/ERP_GLOBAL_UI_UX_FORM_TABLE_DRAWER_DEVELOPMENT_GUIDE.md
```

Read reports:

```text
ERP_BASE_002F_3E_3B_6A_GLOBAL_COMBOBOX_AND_FORM_RUNTIME_PERFORMANCE_AUDIT_PLAN.md
ERP_BASE_002F_3E_3B_5_GLOBAL_FORM_RUNTIME_QA_AND_STANDARD_CLOSURE_GATE_REPORT.md
ERP_BASE_002F_3E_3B_4C_SAFE_CLOSE_RUNTIME_INVESTIGATION_AND_FIX_REPORT.md
ERP_BASE_002F_3E_3B_3F_CUSTOMER_SAVE_BUTTONS_FINAL_QA_FIX_REPORT.md
```

Read current source files:

```text
package.json
src/app/layout.tsx
src/app/providers.tsx
src/components/erp/combobox/erp-combobox.tsx
src/components/erp/lookup-select.tsx
src/features/master-data/lookups/hooks/use-lookup-values.ts
src/server/actions/master-data/lookups.ts
src/components/erp/*-select.tsx
src/features/master-data/**/components/*form*.tsx
src/features/**/components/*form*.tsx
```

Find actual paths if they differ.

---

# 4. Implementation Goals

## Main Goals

Implement:

```text
TanStack Query provider / global query client setup
global lookup cache hooks
global master-data cache hooks
batch lookup action if needed
category ID / category values deduplication
stable query keys
cache invalidation utilities
typed option mappers
standards-ready hook APIs for current and future forms
small proof migration on low-risk wrappers
implementation report
```

## Non-Goals for this phase

Do not implement:

```text
virtualization
debounced server entity search
combobox dirty integration
drawer tab lazy-mount
child-section lazy loading
full form migration to new hooks
large UI refactors
database migrations
new modules
```

Those are for later 3B.6C–3B.6F.

---

# 5. Package Dependency Decision

The 3B.6A plan recommends **TanStack Query v5**.

Check `package.json`.

If `@tanstack/react-query` is not installed:

```bash
npm install @tanstack/react-query
```

Optionally include devtools only if already allowed by project standards; otherwise skip devtools for now.

Do not install unrelated packages.

Do not install `@tanstack/react-virtual` in this phase; virtualization belongs to 3B.6C.

---

# 6. Provider Setup

Create or update a client provider.

Expected possible paths:

```text
src/app/providers.tsx
src/components/providers/query-provider.tsx
src/lib/query/query-client.ts
```

Use actual existing project structure.

Requirements:

```text
QueryClient must be created once on client.
Wrap the app with QueryClientProvider.
Do not break existing app providers.
Set sensible defaults:
- staleTime for lookup/master data
- gcTime
- refetchOnWindowFocus default false for stable master data
- retry count reasonable
```

Recommended defaults:

```typescript
staleTime: 5 * 60 * 1000
gcTime: 30 * 60 * 1000
refetchOnWindowFocus: false
retry: 1
```

If app already has providers, integrate cleanly.

---

# 7. Global Query Key Standard

Create query key helpers.

Suggested file:

```text
src/lib/query/query-keys.ts
```

Required query keys:

```typescript
lookupCategory(categoryCode)
lookupValues(categoryCode, parentValueCode?, includeInactive?)
lookupBatch(categoryCodes, includeInactive?)
countries(includeInactive?)
currencies(includeInactive?)
emirates(countryId?, includeInactive?)
cities(emirateId?, includeInactive?)
areas(cityId?, includeInactive?)
banks(countryId?, includeInactive?)
paymentTerms(includeInactive?)
taxTypes(includeInactive?)
costCenters(ownerCompanyId?, branchId?, includeInactive?)
profitCenters(ownerCompanyId?, branchId?, includeInactive?)
uomCategories(includeInactive?)
unitsOfMeasure(categoryId?, includeInactive?)
ownerCompanies(includeInactive?)
branches(ownerCompanyId?, includeInactive?)
```

Keep keys stable and serializable.

---

# 8. Server Action Optimization

Audit current action:

```text
src/server/actions/master-data/lookups.ts
```

Current audit said:

```text
getActiveLookupValuesByCategoryCode performs 2 DB queries per call:
1. resolve category ID
2. fetch values
```

Implement optimized action(s), with the safest approach based on live schema:

## Option A — Single Category Query with Join

If Supabase query supports selecting values through category relationship cleanly, implement single action query.

## Option B — Batch Category Resolution

If join is messy, implement:

```typescript
getLookupValuesByCategoryCodes(categoryCodes: string[])
```

This should:

```text
fetch categories for all requested codes once
fetch values for all category ids once
group values by categoryCode
return typed response
```

This is preferred for Customer forms with many lookup categories.

Do not remove old action unless fully migrated; preserve backward compatibility.

## Required server actions

At minimum provide:

```typescript
getActiveLookupValuesByCategoryCodeCachedCompatible(categoryCode)
getActiveLookupValuesByCategoryCodes(categoryCodes)
```

Name appropriately for project style.

Return types must be stable and typed.

Add error handling consistent with existing server actions.

---

# 9. Client Hook Layer

Create global hooks.

Suggested path:

```text
src/hooks/lookups/
```

Required hooks:

```typescript
useLookupValuesQuery(categoryCode, options?)
useLookupBatchQuery(categoryCodes, options?)
useCountriesQuery(options?)
useCurrenciesQuery(options?)
useEmiratesQuery(countryId?, options?)
useCitiesQuery(emirateId?, options?)
useAreasQuery(cityId?, options?)
useBanksQuery(countryId?, options?)
usePaymentTermsQuery(options?)
useTaxTypesQuery(options?)
useCostCentersQuery(filters?)
useProfitCentersQuery(filters?)
useUomCategoriesQuery(options?)
useUnitsOfMeasureQuery(filters?)
useOwnerCompaniesQuery(options?)
useBranchesQuery(ownerCompanyId?, options?)
```

If implementing all master hooks is too much for one phase, implement the core pattern and at minimum:

```text
useLookupValuesQuery
useLookupBatchQuery
useCountriesQuery
useCurrenciesQuery
usePaymentTermsQuery
useTaxTypesQuery
useEmiratesQuery
useCitiesQuery
useAreasQuery
useBanksQuery
```

Then document remaining hooks as planned for 3B.6D.

## Hook Requirements

Each hook must:

```text
use TanStack Query
use stable query keys
return loading/error/options/data shape consistently
support enabled option
support includeInactive where useful
map rows into ERPCombobox options where appropriate
avoid direct Supabase calls inside form components
respect RLS and current user session
```

Suggested return shape:

```typescript
{
  data,
  options,
  isLoading,
  isFetching,
  error,
  refetch
}
```

---

# 10. Option Mapping Utilities

Create typed utilities:

```text
src/lib/lookups/option-mappers.ts
```

or similar.

Utilities should convert common rows into:

```typescript
ERPComboboxOption
```

Examples:

```typescript
mapLookupValueToOption(row)
mapCountryToOption(row)
mapCurrencyToOption(row)
mapBankToOption(row)
mapGenericCodeNameToOption(row)
```

Rules:

```text
value must be stable string
label must be human-readable
searchText should include code + name where useful
metadata can include id/code if existing type allows
```

Do not create inconsistent option shapes per wrapper.

---

# 11. Invalidation Utilities

Create cache invalidation helpers.

Suggested path:

```text
src/lib/query/invalidation.ts
```

Must support:

```typescript
invalidateLookupCategory(queryClient, categoryCode)
invalidateAllLookups(queryClient)
invalidateCountries(queryClient)
invalidateGeography(queryClient)
invalidateFinanceBasics(queryClient)
invalidateUom(queryClient)
invalidateOrganizations(queryClient)
```

This is important because future master data create/edit forms must refresh cached comboboxes after changes.

Do not necessarily wire every mutation in this phase unless low-risk.

At minimum, implement helpers and document which current server actions should call them or which client success handlers should invalidate.

---

# 12. Proof Migration

This phase must include a small proof migration to prove the new cache hooks work, but avoid large migration.

Recommended proof targets:

```text
LookupSelect
CountrySelect
CurrencySelect
PaymentTermSelect
TaxTypeSelect
```

Reason:

```text
These are common, high-impact, and will prove cache hooks.
```

If converting these wrappers is safe, do it.

If conversion risk is high, convert only:

```text
LookupSelect
CountrySelect
```

and document remaining conversions for 3B.6D.

## Important

Do not change the public API of wrappers unless unavoidable.

Existing forms should continue to compile without modification.

---

# 13. Backward Compatibility

Existing wrappers and forms must continue to work.

Do not break:

```text
Customer form
Organization form
Branch form
Geography forms
Finance forms
UOM forms
Lookup forms
Safe Close dirty tracking
Save / Save & Close
RequiredLabel
ERPFormFooter
```

If changing LookupSelect or wrappers affects props, update all usages or keep compatibility layer.

---

# 14. Performance Acceptance Targets for This Phase

This phase is foundational, not full performance closure.

Targets:

```text
same lookup category should dedupe through TanStack Query
same countries/currencies lists should cache across form opens
Customer Add open should no longer refetch converted proof wrappers repeatedly within same session
batch lookup action should reduce multiple category calls when used
no visible regression in combobox UI
typecheck passes
build passes
```

Browser runtime measurement is optional in this phase but recommended for proof wrappers.

---

# 15. Testing Requirements

Run:

```bash
npm run typecheck
npm run lint
npm run build
```

Rules:

```text
typecheck must pass
build must pass
lint must be run
if new lint errors from this phase are introduced, fix them
pre-existing unrelated lint issues may be documented
```

## Browser / Runtime QA

If authenticated browser is available, test:

```text
Customer Add drawer
Organization Add/Edit
Branch Add/Edit
Country Add/Edit
Bank Add/Edit
Currency Add/Edit
```

If authenticated routes are not available, use a temporary dev harness using production wrappers and remove it before final build unless explicitly documented dev-only.

Runtime checks:

```text
combobox opens
search works
selection works
cached reopen does not refetch same data repeatedly
safe close still works after selecting values or typing
```

---

# 16. Required Implementation Report

Create:

```text
ERP_BASE_002F_3E_3B_6B_GLOBAL_LOOKUP_CACHE_AND_HOOK_STANDARD_IMPLEMENTATION_REPORT.md
```

Report must include:

1. Phase name.
2. Date/time.
3. Supabase connection confirmation.
4. Standards/reports reviewed.
5. Packages added.
6. Provider setup.
7. Query key standard.
8. Server actions added/optimized.
9. Hooks created.
10. Option mapping utilities.
11. Invalidation utilities.
12. Proof wrappers migrated.
13. Backward compatibility verification.
14. Performance improvements expected.
15. Runtime/browser QA status.
16. Static test results.
17. Known limitations.
18. Remaining work for 3B.6C/6D/6E/6F.
19. Final status.

Final status must be exactly one of:

```text
PASS — Global lookup cache and hook standard implemented successfully.
PASS WITH NOTES — Implemented with non-blocking notes.
FAIL — Implementation has blocking issues.
BLOCKED — Could not implement due to environment/tooling/source blockers.
```

---

# 17. Closure Criteria

Do not mark PASS unless:

```text
TanStack Query provider is installed/configured
global query keys exist
core lookup hooks exist
core master-data hooks exist or missing ones are explicitly deferred
LookupSelect and at least one high-impact domain wrapper use cached hooks
typecheck passes
build passes
no current form is broken
report is generated
```

If browser QA is not possible:

```text
PASS WITH NOTES
```

not full clean PASS.

---

# 18. Stop Condition

After implementation, tests, and report, stop.

Do not start 3B.6C.

Wait for Sameer/Dina review.

---

# Final Instruction

Implement the global lookup cache and hook standard.

Use TanStack Query if not already installed.

Optimize lookup value fetching and create reusable cached hooks.

Migrate only safe proof wrappers.

Run tests.

Create implementation report.

Stop.
