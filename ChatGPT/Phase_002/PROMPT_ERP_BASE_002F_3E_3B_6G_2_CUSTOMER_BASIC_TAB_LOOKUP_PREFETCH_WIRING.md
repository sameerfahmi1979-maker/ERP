# PROMPT_ERP_BASE_002F_3E_3B_6G_2_CUSTOMER_BASIC_TAB_LOOKUP_PREFETCH_WIRING

Act as Fable 5 inside Cursor.

Use deep runtime reasoning as a senior React/Next.js 16 performance engineer, TanStack Query architect, Supabase server-action optimizer, ERP combobox runtime debugger, browser network waterfall analyst, Safe Close regression tester, and Customer module implementation engineer.

## Phase

ERP BASE 002F.3E.3B.6G.2 — Customer Basic Tab Lookup Prefetch Wiring

## Prompt Purpose

This is a controlled IMPLEMENTATION prompt.

This phase follows the approved foundation:

```text
3B.6G.1 — Global Parent Form Runtime Standard Document + Prefetch Utilities
```

3B.6G.1 created:

```text
docs/standards/ERP_GLOBAL_PARENT_FORM_RUNTIME_STANDARD.md
src/lib/query/prefetch-lookups.ts
src/lib/query/form-prefetch-types.ts
src/lib/lookups/master-data-fetchers.ts
src/features/master-data/customers/customer-prefetch.ts
queryKeys.child.*
child invalidation helpers
```

This phase must wire the Customer module to use the new prefetch utilities so Customer Basic tab lookup fields do not appear one by one.

The user-observed issue:

```text
When opening Edit Customer, the fields load one by one:
Customer Type, Industry Type, Customer Segment, Lead Source, Status, etc.
```

This phase must fix that at runtime by prefetching the Customer Basic tab lookup data and seeding the individual LookupSelect query keys before or during Customer drawer open.

---

# 1. Immediate Goal

When the user goes to Customer menu and clicks Add/Edit Customer:

```text
Customer Type
Industry Type
Customer Segment
Lead Source
Status
ICV Status if used early
```

should not visibly load one by one.

They should come from seeded TanStack Query cache after one batch server action.

Expected runtime behavior:

```text
Open Customer Add/Edit drawer.
Default/basic tab lookup comboboxes should populate together or already be ready.
Network should show one batched lookup action instead of six sequential category actions.
Opening the drawer again within staleTime should show lookup values instantly from cache.
```

---

# 2. Strict Scope

## In Scope

Implement:

```text
Customer form lookup prefetch wiring
use CUSTOMER_FORM_PREFETCH declaration
call prefetchLookupCategories for customer lookup categories
call prefetchMasterDataQueries for Customer master lists where appropriate
seed individual LookupSelect query keys
ensure Customer drawer uses warmed cache
network/runtime QA or harness QA
keep Safe Close / dirty tracking working
keep Save / Save & Close behavior working
implementation report
```

## Out of Scope

Do not implement:

```text
Customer child table TanStack Query migration
generic child table hook
new modules
database schema changes
database migrations
Global Search
AI
DMS
export/email
server-side entity search
virtualization
large Customer save refactor
full Customer final QA closure
```

Those are later phases:

```text
3B.6G.3 — Customer Child Tables TanStack Query Migration
3B.6G.4 — Generic Child Table Query/Invalidation Pattern
3B.6G.5 — Apply Standard to Existing Forms / Future-Ready Modules
3B.6G.6 — Runtime QA and Closure Gate
```

---

# 3. Mandatory Supabase Connection First

Before implementation, connect to the live ERP Supabase project:

```text
https://mmiefuieduzdiiwnqpie.supabase.co
```

Use the correct ERP Supabase connection/tool. Previous reports found that one Supabase plugin points to an unrelated weighing/industrial project.

Verify:

```text
customers
global_lookup_categories
global_lookup_values
countries
currencies
payment_terms
tax_types
```

Verify that these Customer lookup category codes exist and are active:

```text
CUSTOMER_TYPES
INDUSTRY_TYPES
CUSTOMER_SEGMENTS
CRM_LEAD_SOURCES
PARTY_STATUS_TYPES
ICV_STATUS_TYPES
```

No database changes are expected.

The report must state:

```text
Connected to live Supabase project: https://mmiefuieduzdiiwnqpie.supabase.co
No database schema changes were required for 3B.6G.2 Customer Basic Tab Lookup Prefetch Wiring.
```

If Supabase connection is wrong/unavailable, continue source implementation and document the issue clearly.

---

# 4. Mandatory Documents and Reports to Read

Read standards:

```text
docs/standards/ERP_GLOBAL_CURSOR_DEVELOPMENT_AND_IMPLEMENTATION_GUIDE.md
docs/standards/ERP_GLOBAL_UI_UX_FORM_TABLE_DRAWER_DEVELOPMENT_GUIDE.md
docs/standards/ERP_GLOBAL_PARENT_FORM_RUNTIME_STANDARD.md
```

Read reports:

```text
ERP_BASE_002F_3E_3B_6G_GLOBAL_PARENT_FORM_CHILD_TABLE_LOOKUP_PREFETCH_RUNTIME_STANDARD_PLAN.md
ERP_BASE_002F_3E_3B_6G_1_GLOBAL_PARENT_FORM_RUNTIME_STANDARD_AND_PREFETCH_UTILITIES_REPORT.md
ERP_BASE_002F_3E_3B_6F_GLOBAL_COMBOBOX_FORM_PERFORMANCE_RUNTIME_QA_CLOSURE_GATE_REPORT.md
ERP_BASE_002F_3E_3B_6D_APPLY_OPTIMIZED_HOOKS_TO_CURRENT_FORMS_REPORT.md
ERP_BASE_002F_3E_3B_6C_ERPCOMBOBOX_RUNTIME_DEBOUNCE_DIRTY_INTEGRATION_REPORT.md
ERP_BASE_002F_3E_3B_4C_SAFE_CLOSE_RUNTIME_INVESTIGATION_AND_FIX_REPORT.md
```

Read source:

```text
src/features/master-data/customers/customer-prefetch.ts
src/lib/query/prefetch-lookups.ts
src/lib/query/form-prefetch-types.ts
src/lib/lookups/master-data-fetchers.ts
src/hooks/lookups/use-lookup-queries.ts
src/components/erp/lookup-select.tsx
src/components/erp/combobox/erp-combobox.tsx
src/features/master-data/customers/components/customer-form-drawer.tsx
src/features/master-data/customers/*
src/features/master-data/customers/page.tsx
src/features/master-data/customers/components/*
src/app/**/customers*
```

Use actual paths if different.

---

# 5. Required Source Audit Before Coding

Run:

```bash
grep -R "CUSTOMER_FORM_PREFETCH" -n src
grep -R "prefetchLookupCategories" -n src
grep -R "prefetchMasterDataQueries" -n src
grep -R "CustomerFormDrawer" -n src
grep -R "customer-form-drawer" -n src
grep -R "LookupSelect" -n src/features/master-data/customers
grep -R "CUSTOMER_TYPES" -n src
grep -R "INDUSTRY_TYPES" -n src
grep -R "CUSTOMER_SEGMENTS" -n src
grep -R "CRM_LEAD_SOURCES" -n src
grep -R "PARTY_STATUS_TYPES" -n src
grep -R "ICV_STATUS_TYPES" -n src
grep -R "useQueryClient" -n src/features/master-data/customers
```

Answer:

```text
Where is Customer list/page component?
Where is Add/Edit drawer opened?
Can prefetch be triggered on Customers page mount?
Can prefetch be triggered before opening drawer?
Can prefetch be triggered when Add/Edit button clicked?
Does CustomerFormDrawer already have QueryClient access?
Does CUSTOMER_FORM_PREFETCH contain the exact category codes used by Customer form?
```

---

# 6. Required Implementation Strategy

Use the approved standard.

## Preferred Strategy

Implement both:

```text
A. Warm Customer form lookups on Customers page mount.
B. Also prefetch immediately when Add/Edit drawer is requested, before/while opening, as a fallback.
```

Reason:

```text
Page mount warms cache before the user clicks Add/Edit.
Click-time prefetch covers direct navigation or cold cache.
Both use the same utility and are safe because TanStack Query deduplicates and skips fresh cache.
```

## Important

Do not delay drawer opening too long.

Recommended behavior:

```text
Start prefetch and open drawer immediately OR use a tiny non-blocking startTransition.
The lookup cache will fill quickly and all LookupSelects should read seeded individual keys.
```

If you choose to await prefetch before opening drawer, justify it only if it produces noticeably better UX and does not freeze UI.

Preferred:

```text
fire-and-forget prefetch on page mount
fire-and-forget prefetch on add/edit click
drawer opens immediately
```

---

# 7. Implementation Requirements

## 7.1 Use CUSTOMER_FORM_PREFETCH

Use:

```typescript
CUSTOMER_FORM_PREFETCH.lookupCategories
CUSTOMER_FORM_PREFETCH.masterQueries
```

Do not hardcode category lists again in the page unless unavoidable.

## 7.2 Use prefetchLookupCategories

Call:

```typescript
await prefetchLookupCategories(queryClient, CUSTOMER_FORM_PREFETCH.lookupCategories)
```

or fire-and-forget:

```typescript
void prefetchLookupCategories(queryClient, CUSTOMER_FORM_PREFETCH.lookupCategories)
```

depending on chosen UX.

This utility must seed the individual keys used by LookupSelect.

## 7.3 Use prefetchMasterDataQueries

Call:

```typescript
void prefetchMasterDataQueries(queryClient, CUSTOMER_FORM_PREFETCH.masterQueries)
```

This should warm:

```text
countries
currencies
payment terms
tax types
```

and any other master queries declared in Customer prefetch declaration.

## 7.4 Add Small Customer Prefetch Hook if Useful

If clean, create:

```text
src/features/master-data/customers/use-customer-form-prefetch.ts
```

or:

```text
src/features/master-data/customers/hooks/use-customer-form-prefetch.ts
```

Hook idea:

```typescript
export function useCustomerFormPrefetch() {
  const queryClient = useQueryClient();

  return useCallback(() => {
    void prefetchLookupCategories(queryClient, CUSTOMER_FORM_PREFETCH.lookupCategories);
    void prefetchMasterDataQueries(queryClient, CUSTOMER_FORM_PREFETCH.masterQueries);
  }, [queryClient]);
}
```

Optional:

```typescript
prefetchCustomerFormData()
```

Return metadata only if needed.

## 7.5 Trigger Locations

Find the Customer page/list component and wire:

```text
on page mount: prefetch Customer form lookups
on Add Customer click: prefetch then open
on Edit Customer click: prefetch then open
on View Customer click: prefetch optional, because view also shows labels
```

Do not break current open drawer behavior.

Do not add visible loading blocker unless necessary.

---

# 8. Runtime / Network QA Requirements

If authenticated ERP route is available, test real Customer route.

Minimum tests:

## 8.1 Cold Load

```text
Clear browser cache / hard refresh.
Open Customer menu.
Open DevTools network.
Click Edit Customer.
Expected:
- one batched lookup action for customer categories
- no six sequential category server actions
- fields no longer visibly populate one by one
```

## 8.2 Warm Cache

```text
Close drawer.
Open Edit Customer again.
Expected:
- customer lookup fields render instantly
- no lookup network calls inside staleTime
```

## 8.3 Add Customer

```text
Click Add Customer.
Expected:
- same prefetch behavior
- Customer Type / Industry / Segment / Lead Source / Status ready together
```

## 8.4 Safe Close Regression

```text
Change only Customer Type combobox.
Click outside drawer.
Expected:
- Unsaved Changes dialog appears
```

## 8.5 Save Regression

```text
Save keeps open.
Save & Close closes.
No duplicate customer on repeated Save after Add.
```

If authenticated route is unavailable, create a temporary dev-only harness using:

```text
Customer prefetch declaration
prefetchLookupCategories
prefetchMasterDataQueries
LookupSelect for the 6 Customer categories
CountrySelect / CurrencySelect / PaymentTermSelect / TaxTypeSelect
Query cache inspector
```

Remove harness before final build unless guarded and documented.

---

# 9. Performance / Query Evidence Required

The report must include evidence.

At minimum:

```text
Before expected: 6 individual lookup category actions
After expected: 1 batch category action and seeded individual keys
```

If browser network unavailable, use source-level proof:

```text
prefetchLookupCategories called with 6 categories
seedLookupCategoryValues writes queryKeys.lookup.values for each code
LookupSelect reads those same keys
```

But if no runtime QA, final status must be:

```text
PASS WITH NOTES
```

not clean PASS.

If runtime QA proves it, status may be:

```text
PASS
```

---

# 10. Avoid These Mistakes

Do not:

```text
only call useLookupBatchQuery without seeding individual keys
create a different query key shape
hardcode category codes in multiple places
block drawer open for too long
break Add/Edit/View behavior
refetch on every render
call prefetch inside render body
use useEffect without stable dependencies
turn this into child table migration
```

---

# 11. Static Tests

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

# 12. Required Implementation Report

Create:

```text
ERP_BASE_002F_3E_3B_6G_2_CUSTOMER_BASIC_TAB_LOOKUP_PREFETCH_WIRING_REPORT.md
```

Report must include:

1. Phase name.
2. Date/time.
3. Supabase connection confirmation.
4. Standards/reports reviewed.
5. Source audit findings.
6. Files modified.
7. Customer prefetch hook/logic implemented.
8. Trigger points added.
9. Query key seeding explanation.
10. Runtime/network QA result.
11. Cold load result.
12. Warm cache result.
13. Add/Edit/View behavior result.
14. Safe Close regression result.
15. Save/Save & Close regression result.
16. Static test results.
17. Known limitations.
18. Next phase recommendation.
19. Final status.

Final status must be exactly one of:

```text
PASS — Customer lookup prefetch wiring implemented and browser/runtime verified.
PASS WITH NOTES — Implemented with non-blocking notes.
FAIL — Blocking issues remain.
BLOCKED — Could not complete due to environment/tooling/source blocker.
```

---

# 13. Closure Criteria

Do not mark PASS unless:

```text
Customer uses CUSTOMER_FORM_PREFETCH
Customer calls prefetchLookupCategories
Customer calls prefetchMasterDataQueries
batch results seed individual LookupSelect keys
Customer Add/Edit drawer behavior is not broken
typecheck passes
build passes
report created
```

If browser/runtime QA is not available:

```text
PASS WITH NOTES
```

not clean PASS.

---

# 14. Stop Condition

After implementation, tests, and report, stop.

Do not start 3B.6G.3.

Wait for Sameer/Dina review.

---

# Final Instruction

Wire Customer Basic tab lookup prefetch using the 3B.6G.1 utilities.

Fix the one-by-one Customer lookup loading.

Do not migrate child tables yet.

Run tests.

Create report.

Stop.
