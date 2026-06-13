# PROMPT_ERP_BASE_002F_3E_3B_6F_GLOBAL_COMBOBOX_FORM_PERFORMANCE_RUNTIME_QA_AND_CLOSURE_GATE

Act as a senior ERP runtime QA lead, browser performance engineer, React/Next.js 16 profiler, TanStack Query verification specialist, Supabase/network waterfall analyst, Safe Close regression tester, enterprise UI/UX QA reviewer, and Cursor QA engineer.

## Phase

ERP BASE 002F.3E.3B.6F — Global Combobox/Form Performance Runtime QA and Closure Gate

## Prompt Purpose

This is a controlled RUNTIME QA / CLOSURE GATE prompt.

Do not implement new functionality unless a blocking defect is found.

This phase closes the full 3B.6 performance package:

```text
3B.6A — Global Combobox and Form Runtime Performance Audit Plan
3B.6B — Global Lookup Cache and Hook Standard
3B.6C — ERPCombobox Runtime, Debounce, Dirty Integration
3B.6D — Apply Optimized Hooks to Current Forms
3B.6E — Lazy-Load Drawer Tabs and Child Sections
```

The purpose is to verify that all 3B.6 performance improvements work together in real runtime and that no global form standards regressed.

This is not Customer-only.

This must validate current implemented modules and create a closure decision for the global combobox/form performance standard.

---

# 1. Current Expected Implemented State

Treat the following as implemented and needing verification:

```text
TanStack Query provider installed and app-wrapped
Global query keys exist
Lookup hooks exist
Geography hooks exist
Finance hooks exist
Org/UOM/cost/profit hooks exist
Option mappers exist
Invalidation helpers exist
All domain lookup/master-data wrappers use ERPCombobox where applicable
No plain-Select domain lookup wrappers remain
ERPCombobox dispatches dirty signal on select/clear
Combobox-only changes trigger Safe Close
ERPDrawerSection supports lazyMount
Customer child sections are deferred until tab first activation
Audit/display-only sections are lazy-mounted
FormData-risk sections remain mounted for data safety
```

---

# 2. Strict Scope

## In Scope

Runtime QA and targeted fixes only for:

```text
global lookup cache behavior
query deduplication
combobox open/search/select behavior
combobox-only dirty tracking
Safe Close after combobox-only edit
converted wrappers
lazy-mounted drawer sections
Customer child-section fetch deferral
Save / Save & Close regression
View mode regression
layout/no horizontal scroll
static build/typecheck/lint
```

## Out of Scope

Do not implement:

```text
new modules
new database schema
database migrations
Global Search
AI
DMS
export/email
server-side entity search
full virtualization
large save-logic refactor
new master data features
full Customer module final closure
```

Those belong to later phases.

---

# 3. Mandatory Supabase Connection First

Before QA, connect to live Supabase:

```text
https://mmiefuieduzdiiwnqpie.supabase.co
```

Use the correct ERP Supabase connection/tool. Previous reports noted that one plugin Supabase connection pointed to a different weighing/industrial project, while the user Supabase connection pointed to ERP.

Verify:

```text
customers
customer_contacts
customer_addresses
customer_bank_details
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
uom_categories
units_of_measure
uom_conversions
owner_companies
branches
cost_centers
profit_centers
global_numbering_rules
```

No database changes are expected.

The report must include:

```text
Connected to live Supabase project: https://mmiefuieduzdiiwnqpie.supabase.co
No database schema changes were required for 3B.6F Global Combobox/Form Performance Runtime QA and Closure Gate.
```

If Supabase tooling points to the wrong project, do not make DB changes. Continue source/browser QA and document the mismatch clearly.

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
ERP_BASE_002F_3E_3B_6D_APPLY_OPTIMIZED_HOOKS_TO_CURRENT_FORMS_REPORT.md
ERP_BASE_002F_3E_3B_6E_LAZY_LOAD_DRAWER_TABS_AND_CHILD_SECTIONS_REPORT.md
ERP_BASE_002F_3E_3B_5_GLOBAL_FORM_RUNTIME_QA_AND_STANDARD_CLOSURE_GATE_REPORT.md
ERP_BASE_002F_3E_3B_4C_SAFE_CLOSE_RUNTIME_INVESTIGATION_AND_FIX_REPORT.md
```

Read source:

```text
src/components/layout/app-providers.tsx
src/lib/query/query-client.ts
src/lib/query/query-keys.ts
src/lib/query/invalidation.ts
src/lib/lookups/option-mappers.ts
src/hooks/lookups/*
src/components/erp/combobox/erp-combobox.tsx
src/components/erp/lookup-select.tsx
src/components/erp/**/*select*.tsx
src/components/erp/erp-drawer-form.tsx
src/hooks/use-form-dirty.ts
src/features/master-data/customers/components/customer-form-drawer.tsx
src/features/master-data/customers/components/customer-contacts-section.tsx
src/features/master-data/customers/components/customer-addresses-section.tsx
src/features/master-data/customers/components/customer-bank-details-section.tsx
```

Use actual paths if different.

---

# 5. Source Verification Before Browser QA

Run source checks:

```bash
grep -R "@tanstack/react-query" -n package.json src
grep -R "QueryClientProvider" -n src
grep -R "useQuery" -n src/hooks/lookups src/components/erp
grep -R "createClient" -n src/components/erp src/features | grep -i select
grep -R "<Select" -n src/components/erp src/features
grep -R "ERPCombobox" -n src/components/erp
grep -R "onDirtyMark" -n src/components/erp src/features
grep -R "dispatchEvent(new Event" -n src/components/erp src/hooks
grep -R "lazyMount" -n src
grep -R "CustomerContactsSection" -n src/features/master-data/customers
grep -R "CustomerAddressesSection" -n src/features/master-data/customers
grep -R "CustomerBankDetailsSection" -n src/features/master-data/customers
```

Create a source matrix:

```text
Area | Expected | Verified | Notes
```

Must verify:

```text
Query provider is present
No domain lookup wrapper uses direct createClient fetch
No plain Select domain lookup wrapper remains, except fixed enum/select UI exceptions
All relevant wrappers use ERPCombobox
ERPCombobox dirty event exists
ERPDrawerSection lazyMount exists
Customer child sections are guarded by section activation
Dev harness routes are removed or production-secured
```

---

# 6. Runtime QA Environment

## If authenticated ERP access is available

Test real ERP routes:

```text
Customer Add/Edit/View
Organization Add/Edit
Branch Add/Edit
Country Add/Edit/View
Bank Add/Edit/View
Currency Add/Edit/View
UOM Unit Add/Edit/View
Lookup Category Add/Edit/View
Numbering Rule Add/Edit/View
```

## If authenticated ERP access is not available

Use temporary dev-only QA harnesses using production components.

Allowed harnesses:

```text
/dev/performance-qa
/dev/combobox-cache-qa
/dev/lazy-section-qa
```

Only if necessary.

Harness must use real production components:

```text
ERPDrawerForm
ERPDrawerSection
ERPFormFooter
ERPCombobox
LookupSelect
CountrySelect
CurrencySelect
CostCenterSelect
OwnerCompanySelect
BranchSelect
useFormDirty
TanStack Query provider
```

Harness must be removed before final build unless explicitly guarded and documented. Preferred final state:

```text
no dev harness routes in production build output
```

Do not claim full PASS unless runtime/browser behavior is actually verified.

---

# 7. Required Runtime Test Suites

## 7.1 Combobox Cache / Dedup QA

Test:

```text
Open one form with CountrySelect.
Open another form with CountrySelect in same session.
Expected: second use is served from TanStack Query cache; no duplicate refetch inside staleTime.
```

Test same for:

```text
LookupSelect categoryCode duplicates
CountrySelect
CurrencySelect
PaymentTermSelect
TaxTypeSelect
BankSelect
OwnerCompanySelect
BranchSelect
UomCategorySelect
UnitOfMeasureSelect
CostCenterSelect
ProfitCenterSelect
```

Verify via:

```text
Network tab
console instrumentation if needed
queryClient.getQueryCache().findAll() in dev harness
```

Record:

```text
query key
first fetch count
second fetch count
dedup result
```

## 7.2 Combobox Runtime QA

For representative wrappers:

```text
LookupSelect
CountrySelect
EmirateSelect
CitySelect
AreaZoneSelect
PortSelect
CurrencySelect
PaymentTermSelect
TaxTypeSelect
BankSelect
OwnerCompanySelect
BranchSelect
CostCenterSelect
ProfitCenterSelect
UomCategorySelect
UnitOfMeasureSelect
```

Verify:

```text
opens correctly
search works
selection works
clear works if allowed
disabled state works
selected value remains visible
loading/empty states are correct
no clipping inside drawer
no horizontal scroll
```

## 7.3 Combobox Dirty / Safe Close QA

For at least:

```text
LookupSelect
CountrySelect
BranchSelect
UomCategorySelect
CostCenterSelect
```

Test:

```text
Open Add drawer.
Change only combobox value.
Do not type in text field.
Click outside drawer.
Expected: drawer stays open and Unsaved Changes dialog appears.

Click Stay on Form.
Expected: selected value remains.

Click Discard Changes.
Expected: drawer closes.

Reopen View mode.
Click outside.
Expected: closes directly, no dirty dialog.
```

## 7.4 Lazy Drawer Section QA

For Customer drawer or harness:

```text
Initial open:
- only basic/default section and always-mounted safe form sections should render
- contacts child section must not mount/fetch
- addresses child section must not mount/fetch
- bank details child section must not mount/fetch

Click Contacts:
- contacts section mounts
- contacts data fetch occurs only now

Click Location:
- addresses child section mounts/fetches only now if edit/view customer exists

Click Finance:
- bank details child section mounts/fetches only now if edit/view customer exists

Switch away/back:
- section remains mounted
- no repeated fetch unless intended
```

Verify via:

```text
console logs
network tab
mock harness counters
source inspection if real route unavailable
```

## 7.5 Save / Save & Close Regression QA

Verify:

```text
Save keeps drawer open
Save resets dirty
Save & Close closes only after successful save
View mode footer Close only
Required markers still present
Safe Close still works after text edit
Safe Close still works after combobox-only edit
```

## 7.6 Layout QA

Verify:

```text
drawer width stable
footer sticky
section nav stable
combobox popover visible
confirmation dialog above drawer
vertical scroll only
no horizontal scroll
```

---

# 8. Network / Performance Measurements

Capture before/after if possible.

At minimum record current post-optimization observations:

```text
Customer Add drawer initial network requests
Customer Edit drawer initial child-section requests
CountrySelect repeated fetch behavior
LookupSelect repeated category behavior
CurrencySelect repeated fetch behavior
OwnerCompany/Branch repeated fetch behavior
```

Suggested targets from 3B.6A:

```text
drawer shell visually opens under 300ms where possible
cached combobox opens under 150ms
no duplicate same lookup fetch within staleTime
Customer child sections do not fetch before tab activation
```

If exact timings cannot be measured, provide qualitative result:

```text
verified by network request count
verified by query cache entries
not measured due environment limitation
```

---

# 9. Bug Handling Rules

If a blocking bug is found:

```text
fix it only if directly related to 3B.6 performance/runtime standards
run tests again
document before/after
```

Blocking examples:

```text
wrapper does not open
selection broken
combobox-only Safe Close still fails
converted wrapper returns wrong value type
Customer child sections still fetch immediately
build/typecheck failure
```

Non-blocking examples:

```text
browser route unavailable due no login
minor spacing issue
large-list virtualization not implemented
server-side entity search not implemented
```

If a bug is outside scope, document for future phase.

---

# 10. Static Tests

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
new lint errors introduced by any fixes in this phase must be fixed
pre-existing unrelated lint issues may be documented
```

---

# 11. Required QA Matrices

## 11.1 Wrapper Runtime Matrix

```text
Wrapper | Cached Hook | ERPCombobox | Opens | Search | Select | Clear | Dirty | Disabled/View | Status
```

## 11.2 Query Cache Matrix

```text
Data | Query Key | First Fetch | Second Use | Dedup OK | Notes
```

## 11.3 Lazy Section Matrix

```text
Form | Section | Initial Mount? | Mount On Activation? | Fetch Deferred? | Re-fetch? | Status
```

## 11.4 Regression Matrix

```text
Form/Test | Footer | Save | Save & Close | Safe Close Text | Safe Close Combobox | View Close | Layout | Status
```

---

# 12. Required Report

Create:

```text
ERP_BASE_002F_3E_3B_6F_GLOBAL_COMBOBOX_FORM_PERFORMANCE_RUNTIME_QA_CLOSURE_GATE_REPORT.md
```

Report must include:

1. Phase name.
2. Date/time.
3. Supabase connection confirmation.
4. Standards/reports reviewed.
5. Source verification results.
6. Runtime/browser environment.
7. Harness use/removal status if applicable.
8. Wrapper runtime matrix.
9. Query cache/dedup matrix.
10. Lazy section QA matrix.
11. Save/Safe Close regression matrix.
12. Network/performance observations.
13. Bugs found.
14. Bugs fixed.
15. Bugs deferred.
16. Static test results.
17. Closure recommendation.
18. Final status.

Final status must be exactly one of:

```text
PASS — Global combobox/form performance runtime QA passed and 3B.6 can close.
PASS WITH NOTES — Runtime QA passed with non-blocking notes.
FAIL — Blocking issues found; 3B.6 cannot close.
BLOCKED — QA could not complete due to environment/tooling blocker.
```

---

# 13. Closure Criteria

Do not mark PASS unless:

```text
source verification confirms implemented architecture
runtime/browser or harness QA verifies wrappers
query cache/dedup behavior verified
combobox-only dirty Safe Close verified
lazy section behavior verified
Save / Save & Close not regressed
typecheck passes
build passes
no dev harness route remains in production build unless guarded/documented
no blocking bugs remain
```

If authenticated routes are unavailable but dev harness proves shared runtime:

```text
PASS WITH NOTES
```

If combobox-only Safe Close fails:

```text
FAIL
```

If Customer child sections still fetch immediately before tab activation:

```text
FAIL
```

---

# 14. Stop Condition

After QA, targeted fixes if needed, tests, and report, stop.

Do not start Customer final QA.

Wait for Sameer/Dina review.

---

# Final Instruction

Run the global performance/runtime closure gate for 3B.6.

Verify cache, comboboxes, dirty Safe Close, lazy sections, save behavior, and layout.

Fix blocking bugs only.

Create closure gate report.

Stop.
