# PROMPT_ERP_BASE_002F_3E_3B_6D_APPLY_OPTIMIZED_HOOKS_TO_CURRENT_FORMS

Act as a senior ERP performance implementation engineer, React/Next.js 16 runtime optimizer, TanStack Query migration specialist, ERPCombobox architect, Supabase query optimization reviewer, Safe Close regression tester, and Cursor implementation engineer.

## Phase

ERP BASE 002F.3E.3B.6D — Apply Optimized Hooks to Current Forms

## Prompt Purpose

This is a controlled IMPLEMENTATION prompt.

This phase follows:

```text
3B.6A — Global Combobox and Form Runtime Performance Audit Plan
3B.6B — Global Lookup Cache and Hook Standard
3B.6C — ERPCombobox Runtime, Debounce, Dirty Integration
```

3B.6B created the global cache/hook layer.

3B.6C fixed ERPCombobox dirty tracking globally for all wrappers using ERPCombobox.

This phase must now apply the optimized hooks and ERPCombobox standard to the remaining current forms/wrappers.

This is not a new module phase.

This is not a Customer-only phase.

The goal is to make all already implemented ERP forms use the global lookup cache and ERPCombobox runtime where applicable.

---

# 1. Main Objectives

Implement:

```text
convert remaining plain-Select wrappers to ERPCombobox
migrate remaining domain wrappers to cached hooks
wire cache invalidation helpers where safe
wire useLookupBatchQuery where useful and low-risk
remove or secure dev-only combobox harness if still present
verify combobox-only dirty tracking after converted wrappers
preserve all existing form APIs and behavior
```

Current reported state from 3B.6C:

```text
10 wrappers already benefit from ERPCombobox dirty integration
5 plain-Select wrappers still need conversion
browser harness route /dev/combobox-dirty-qa exists and must be removed or production-secured
```

---

# 2. Strict Scope

## In Scope

```text
CostCenterSelect conversion to ERPCombobox + cached hook
ProfitCenterSelect conversion to ERPCombobox + cached hook
UomCategorySelect conversion to ERPCombobox + cached hook
UnitOfMeasureSelect conversion to ERPCombobox + cached hook
OwnerCompanySelect conversion to ERPCombobox + cached hook
BranchSelect conversion to ERPCombobox + cached hook
AreaZoneSelect, PortSelect re-check and migrate to cached hooks if not already
all remaining domain wrappers still using useEffect + createClient direct fetch
useLookupBatchQuery proof wiring where low-risk
cache invalidation helper usage where low-risk and client-side mutation success exists
remove or production-secure /dev/combobox-dirty-qa harness
source/runtime QA report
```

Note: The 3B.6C report said “5 plain-Select wrappers” but listed 6 names. Do not trust the count. Verify actual source and list the exact wrappers.

## Out of Scope

Do not implement:

```text
drawer tab lazy-mount
child-section lazy loading
full runtime performance closure gate
server-side entity search
virtualization package installation unless absolutely necessary
new modules
database migrations
schema changes
Global Search
AI
DMS
export/email
large visual redesign
```

These belong to later phases:

```text
3B.6E — Lazy-Load Drawer Tabs and Child Sections
3B.6F — Runtime Performance QA and Closure Gate
future entity search phase
```

---

# 3. Mandatory Supabase Connection First

Before implementation, connect to live Supabase:

```text
https://mmiefuieduzdiiwnqpie.supabase.co
```

Verify relevant tables:

```text
cost_centers
profit_centers
uom_categories
units_of_measure
owner_companies
branches
areas_zones
ports
global_lookup_categories
global_lookup_values
countries
emirates
cities
banks
currencies
payment_terms
tax_types
```

No schema changes are expected.

The report must include:

```text
Connected to live Supabase project: https://mmiefuieduzdiiwnqpie.supabase.co
No database schema changes were required for 3B.6D Apply Optimized Hooks to Current Forms.
```

If any table names differ, document the live names and use the actual schema.

---

# 4. Mandatory Documents and Reports to Read

Read standards:

```text
docs/standards/ERP_GLOBAL_CURSOR_DEVELOPMENT_AND_IMPLEMENTATION_GUIDE.md
docs/standards/ERP_GLOBAL_UI_UX_FORM_TABLE_DRAWER_DEVELOPMENT_GUIDE.md
```

Read reports:

```text
ERP_BASE_002F_3E_3B_6A_GLOBAL_COMBOBOX_AND_FORM_RUNTIME_PERFORMANCE_AUDIT_PLAN.md
ERP_BASE_002F_3E_3B_6B_GLOBAL_LOOKUP_CACHE_AND_HOOK_STANDARD_IMPLEMENTATION_REPORT.md
ERP_BASE_002F_3E_3B_6C_ERPCOMBOBOX_RUNTIME_DEBOUNCE_DIRTY_INTEGRATION_REPORT.md
ERP_BASE_002F_3E_3B_5_GLOBAL_FORM_RUNTIME_QA_AND_STANDARD_CLOSURE_GATE_REPORT.md
ERP_BASE_002F_3E_3B_4C_SAFE_CLOSE_RUNTIME_INVESTIGATION_AND_FIX_REPORT.md
```

Read current source:

```text
src/components/erp/combobox/erp-combobox.tsx
src/components/erp/lookup-select.tsx
src/hooks/lookups/*
src/lib/query/*
src/lib/lookups/option-mappers.ts
src/lib/query/invalidation.ts
src/components/erp/**/*select*.tsx
src/features/master-data/**/components/*form*.tsx
src/features/**/components/*form*.tsx
```

Use actual paths if different.

---

# 5. Required Source Audit Before Coding

Run source searches:

```bash
grep -R "from.*select" -n src/components/erp src/features
grep -R "<Select" -n src/components/erp src/features
grep -R "SelectTrigger" -n src/components/erp src/features
grep -R "createClient" -n src/components/erp src/features
grep -R "useEffect" -n src/components/erp src/features | grep -i select
grep -R "useLookupValues" -n src
grep -R "useLookupValuesQuery" -n src
grep -R "useCountriesQuery" -n src
grep -R "useCurrenciesQuery" -n src
```

Create a before/after matrix:

```text
Wrapper | Current UI component | Current data source | Uses cached hook? | Uses ERPCombobox? | Dirty integration? | Action
```

Do not rely on previous report counts. Verify actual source.

---

# 6. Required Wrapper Conversions

Convert all remaining domain wrappers that represent lookup/master-data selection to ERPCombobox and cached hooks.

## 6.1 CostCenterSelect

Expected current issue:

```text
plain shadcn Select or direct useEffect fetch
```

Target:

```text
ERPCombobox
useCostCentersQuery(filters)
searchable label
value compatibility preserved
dirty integration automatic via ERPCombobox
```

Support existing props:

```text
value
onValueChange
disabled
placeholder
className
ownerCompanyId / branchId filters if existing
allowClear if existing or appropriate
```

## 6.2 ProfitCenterSelect

Same pattern as CostCenterSelect.

## 6.3 UomCategorySelect

Target:

```text
ERPCombobox
useUomCategoriesQuery()
```

## 6.4 UnitOfMeasureSelect

Target:

```text
ERPCombobox
useUnitsOfMeasureQuery({ categoryId? })
```

If there is also:

```text
UnitByCategorySelect
```

verify and convert if needed.

## 6.5 OwnerCompanySelect

Target:

```text
ERPCombobox
useOwnerCompaniesQuery()
```

## 6.6 BranchSelect

Target:

```text
ERPCombobox
useBranchesQuery(ownerCompanyId?)
```

## 6.7 AreaZoneSelect and PortSelect

Re-check:

```text
If already ERPCombobox but not cached hook: migrate to useAreasQuery / appropriate port hook.
If already cached and ERPCombobox: document no change.
```

If port hook does not exist yet, either create:

```text
usePortsQuery(filters?)
```

or document deferral if no current form depends on it.

---

# 7. Hook Completion Requirements

3B.6B may not have created all hooks.

If missing, implement:

```text
useCostCentersQuery
useProfitCentersQuery
useUomCategoriesQuery
useUnitsOfMeasureQuery
useOwnerCompaniesQuery
useBranchesQuery
usePortsQuery if needed
```

Use TanStack Query with query keys from `query-keys.ts`.

If query keys are missing, add them.

Use option mappers from `option-mappers.ts`.

If row mapper missing, add typed mapper.

Return consistent shape:

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

No direct Supabase query should remain inside converted wrapper components.

---

# 8. useLookupBatchQuery Proof Wiring

If low-risk, wire `useLookupBatchQuery` in one high-impact place.

Preferred target:

```text
Customer form lookup categories
```

But do not force a risky refactor.

Safe options:

## Option A — Form-level batch context

Create local batch query in Customer form and pass options into LookupSelect where supported.

Only do this if current LookupSelect can accept external options or if it can be enhanced safely.

## Option B — Defer form-level batch wiring

If LookupSelect API does not support external options, do not refactor deeply in 3B.6D.

Document:

```text
useLookupBatchQuery exists and will be wired in a later targeted form-level optimization.
```

Do not break current forms.

---

# 9. Cache Invalidation Wiring

Wire invalidation only where safe and low-risk.

Potential places:

```text
after create/update country → invalidateGeography / invalidateCountries
after create/update currency/payment term/tax type/bank → invalidateFinanceBasics or specific
after create/update UOM category/unit → invalidateUom
after create/update organization/branch → invalidateOrganizations
after create/update lookup category/value → invalidateLookupCategory / invalidateAllLookups
```

But only if mutation success handlers are client-side and have access to `useQueryClient()`.

If mutation logic is server-only and not trivial to wire, document as deferred to a targeted invalidation phase.

Do not create risky cross-layer changes.

---

# 10. Dev Harness Handling

3B.6C report says:

```text
src/app/dev/combobox-dirty-qa/page.tsx exists
```

This must be addressed.

Preferred action:

```text
remove /dev/combobox-dirty-qa route unless needed for test proof
```

If used for QA, remove after QA.

Alternative:

```text
keep it only if guarded by NODE_ENV !== "development" notFound()
and document why build route is safe
```

For this phase, preferred final state:

```text
the harness route is removed before final build
```

---

# 11. Backward Compatibility Rules

Do not break existing form API.

For every converted wrapper:

```text
keep prop names compatible
keep value type compatible
keep onValueChange behavior compatible
keep loading/disabled behavior compatible
keep placeholder behavior compatible
do not force parent form changes unless necessary
```

For null/clear behavior:

```text
if old Select did not allow clear, do not introduce clear unexpectedly unless safe
if allowClear prop exists, keep behavior
```

For disabled/read-only view mode:

```text
disabled must prevent dirty signal
```

---

# 12. Runtime QA Requirements

If authenticated ERP routes are available, test:

```text
Customer Add
Organization Add/Edit
Branch Add/Edit
Cost Center Add/Edit
Profit Center Add/Edit
UOM Unit Add/Edit
Country/Area/Port if relevant
```

If login unavailable, use a temporary dev harness with production wrappers to test converted wrappers, then remove it before final build unless dev-only guarded.

Minimum runtime proof:

```text
converted wrapper opens
search works
selection works
clear works if allowed
selection marks form dirty
outside click after combobox-only edit shows Unsaved Changes
cache prevents repeated refetch inside same session
view/disabled mode does not mark dirty
```

---

# 13. Static Tests

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
new lint errors introduced by this phase must be fixed
pre-existing unrelated lint issues may be documented
```

---

# 14. Required Implementation Report

Create:

```text
ERP_BASE_002F_3E_3B_6D_APPLY_OPTIMIZED_HOOKS_TO_CURRENT_FORMS_REPORT.md
```

Report must include:

1. Phase name.
2. Date/time.
3. Supabase connection confirmation.
4. Standards/reports reviewed.
5. Source audit before coding.
6. Wrappers converted.
7. Hooks created or completed.
8. Query keys added.
9. Option mappers added.
10. Invalidation wiring completed or deferred.
11. useLookupBatchQuery wiring completed or deferred.
12. Dev harness handling.
13. Backward compatibility verification.
14. Dirty integration verification for converted wrappers.
15. Runtime/browser QA status.
16. Static test results.
17. Known limitations.
18. Remaining work for 3B.6E/6F.
19. Final status.

Final status must be exactly one of:

```text
PASS — Optimized hooks applied to current forms successfully.
PASS WITH NOTES — Applied with non-blocking notes.
FAIL — Blocking issues remain.
BLOCKED — Could not complete due to environment/tooling/source blocker.
```

---

# 15. Closure Criteria

Do not mark PASS unless:

```text
actual remaining wrappers are verified from source
plain Select wrappers representing lookup/master data are converted or formally deferred with reason
converted wrappers use TanStack Query cached hooks
converted wrappers use ERPCombobox
combobox dirty integration works for converted wrappers
typecheck passes
build passes
current forms compile
no public wrapper API break
dev harness removed or production-secured
implementation report created
```

If browser QA is not possible:

```text
PASS WITH NOTES
```

not full clean PASS.

---

# 16. Stop Condition

After implementation, tests, and report, stop.

Do not start 3B.6E.

Wait for Sameer/Dina review.

---

# Final Instruction

Apply the optimized cached hooks to current forms/wrappers.

Convert remaining lookup/master-data plain Select wrappers to ERPCombobox.

Preserve behavior.

Remove or secure dev harness.

Run tests.

Create implementation report.

Stop.
