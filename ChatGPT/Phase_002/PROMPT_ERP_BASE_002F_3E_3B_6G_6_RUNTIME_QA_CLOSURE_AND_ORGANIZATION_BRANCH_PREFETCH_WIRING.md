# PROMPT_ERP_BASE_002F_3E_3B_6G_6_RUNTIME_QA_CLOSURE_AND_ORGANIZATION_BRANCH_PREFETCH_WIRING

Act as Fable 5 inside Cursor.

Use deep runtime reasoning as a senior ERP runtime QA lead, Next.js 16 implementation engineer, TanStack Query performance specialist, Supabase network/waterfall reviewer, Organization/Branch module engineer, Customer module QA engineer, Safe Close regression tester, and enterprise closure-gate reviewer.

## Phase

ERP BASE 002F.3E.3B.6G.6 — Runtime QA Closure and Organization/Branch Prefetch Wiring

## Prompt Purpose

This is a controlled IMPLEMENTATION + RUNTIME QA + CLOSURE GATE prompt.

This phase follows:

```text
3B.6G.1 — Global Parent Form Runtime Standard Document + Prefetch Utilities
3B.6G.2 — Customer Basic Tab Lookup Prefetch Wiring
3B.6G.3 — Customer Child Tables TanStack Query Migration
3B.6G.4 — Generic Child Table Query / Invalidation Pattern
3B.6G.5 — Apply Standard to Existing Forms / Future-Ready Modules
```

3B.6G.5 created:

```text
ORGANIZATION_FORM_PREFETCH
BRANCH_FORM_PREFETCH
future party-master prefetch templates
standard document updates
```

but Organization and Branch declarations were not wired yet.

This phase must:

```text
wire Organization form prefetch
wire Branch form prefetch
run Customer runtime QA closure checks
verify global parent form runtime standard is stable
close 3B.6G with notes or pass
```

Do not start new modules.

Do not implement DMS.

Do not implement HR/Fleet/Workshop/etc.

---

# 1. Immediate Goals

After this phase:

```text
Organization list/form uses ORGANIZATION_FORM_PREFETCH.
Branch list/form uses BRANCH_FORM_PREFETCH.
Organization Add/Edit opening can prefetch countries/currencies.
Branch Add/Edit opening can prefetch countries.
Customer runtime flow is QA-checked:
- lookup prefetch
- child table lazy fetch
- child table query/invalidation pattern
- Safe Close after combobox-only edit
- Save / Save & Close
- FormData safety
3B.6G is ready to close.
```

---

# 2. Strict Scope

## In Scope

Implement / verify:

```text
Organization prefetch hook/wiring
Branch prefetch hook/wiring
runtime QA for Customer drawer
runtime/source QA for Organization and Branch prefetch
network/cache evidence where possible
removal or status decision for dev QA harness routes
static tests
closure report
```

## Out of Scope

Do not implement:

```text
Vendor module
Subcontractor module
Consultant module
Government Authority module
Recruitment Agency module
HR
Fleet
Workshop
Inventory
DMS
Global Search
AI
database migrations
schema changes
full Customer final module closure beyond 3B.6G runtime QA
large Organization/Branch refactor
server-side entity search
virtualization
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
customer_contacts
customer_addresses
customer_bank_details
owner_companies
branches
countries
currencies
payment_terms
tax_types
global_lookup_categories
global_lookup_values
```

No database changes are expected.

The report must state:

```text
Connected to live Supabase project: https://mmiefuieduzdiiwnqpie.supabase.co
No database schema changes were required for 3B.6G.6 Runtime QA Closure and Organization/Branch Prefetch Wiring.
```

If Supabase connection is wrong/unavailable, continue source implementation and document clearly.

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
ERP_BASE_002F_3E_3B_6G_2_CUSTOMER_BASIC_TAB_LOOKUP_PREFETCH_WIRING_REPORT.md
ERP_BASE_002F_3E_3B_6G_3_CUSTOMER_CHILD_TABLES_TANSTACK_QUERY_MIGRATION_REPORT.md
ERP_BASE_002F_3E_3B_6G_4_GENERIC_CHILD_TABLE_QUERY_INVALIDATION_PATTERN_REPORT.md
ERP_BASE_002F_3E_3B_6G_5_APPLY_STANDARD_TO_EXISTING_FORMS_FUTURE_READY_MODULES_REPORT.md
ERP_BASE_002F_3E_3B_6F_GLOBAL_COMBOBOX_FORM_PERFORMANCE_RUNTIME_QA_CLOSURE_GATE_REPORT.md
ERP_BASE_002F_3E_3B_4C_SAFE_CLOSE_RUNTIME_INVESTIGATION_AND_FIX_REPORT.md
```

Read source:

```text
src/features/organizations/organization-prefetch.ts
src/features/branches/branch-prefetch.ts
src/features/master-data/customers/customer-prefetch.ts
src/features/master-data/customers/hooks/use-customer-form-prefetch.ts
src/features/master-data/customers/hooks/use-customer-child-queries.ts
src/lib/query/prefetch-lookups.ts
src/lib/query/query-keys.ts
src/lib/query/invalidation.ts
src/hooks/child-tables/use-child-table-query.ts
src/features/organizations/*
src/features/branches/*
src/app/**/organizations*
src/app/**/branches*
src/app/**/customers*
```

Use actual paths if different.

---

# 5. Required Source Audit Before Coding

Run:

```bash
grep -R "ORGANIZATION_FORM_PREFETCH" -n src
grep -R "BRANCH_FORM_PREFETCH" -n src
grep -R "organization-prefetch" -n src
grep -R "branch-prefetch" -n src
grep -R "useCustomerFormPrefetch" -n src
grep -R "prefetchLookupCategories" -n src/features src/app
grep -R "prefetchMasterDataQueries" -n src/features src/app
grep -R "Organization" -n src/features/organizations src/app | head -100
grep -R "Branch" -n src/features/branches src/app | head -100
grep -R "CustomerFormDrawer" -n src/features/master-data/customers src/app
grep -R "/dev/" -n src/app
```

Answer in the report:

```text
Where is Organization list/page client component?
Where is Branch list/page client component?
How are Organization Add/Edit drawers opened?
How are Branch Add/Edit drawers opened?
Can prefetch be wired on page mount and Add/Edit click like Customer?
Do Organization and Branch forms use cached hooks already?
Which dev harness routes exist?
```

---

# 6. Organization Prefetch Wiring

Find Organization list/table client component.

Create a hook if useful:

```text
src/features/organizations/hooks/use-organization-form-prefetch.ts
```

or use existing module path.

Hook pattern:

```typescript
export function useOrganizationFormPrefetch() {
  const queryClient = useQueryClient();

  return useCallback(() => {
    void prefetchLookupCategories(queryClient, ORGANIZATION_FORM_PREFETCH.lookupCategories);
    void prefetchMasterDataQueries(queryClient, ORGANIZATION_FORM_PREFETCH.masterQueries);
  }, [queryClient]);
}
```

Note:

```text
ORGANIZATION_FORM_PREFETCH.lookupCategories may be empty.
This is okay; prefetchLookupCategories should no-op on empty arrays.
Master queries should warm countries/currencies.
```

Wire triggers:

```text
on Organization page/list mount
on Add Organization click
on Edit Organization click
on View Organization click if view uses lookup labels
```

Do not delay drawer opening.

Use fire-and-forget prefetch.

Preserve current Add/Edit/View behavior.

---

# 7. Branch Prefetch Wiring

Find Branch list/table client component.

Create hook if useful:

```text
src/features/branches/hooks/use-branch-form-prefetch.ts
```

Hook pattern:

```typescript
export function useBranchFormPrefetch() {
  const queryClient = useQueryClient();

  return useCallback(() => {
    void prefetchLookupCategories(queryClient, BRANCH_FORM_PREFETCH.lookupCategories);
    void prefetchMasterDataQueries(queryClient, BRANCH_FORM_PREFETCH.masterQueries);
  }, [queryClient]);
}
```

Wire triggers:

```text
on Branch page/list mount
on Add Branch click
on Edit Branch click
on View Branch click if view uses lookup labels
```

Do not delay drawer opening.

Preserve current behavior.

---

# 8. Customer Runtime QA Closure

Verify Customer behavior after 3B.6G.2 and 3B.6G.3.

If authenticated route is available, test real app.

If not, use existing dev harnesses or create minimal temporary harness, but document and remove/guard before final build.

## 8.1 Customer Lookup Prefetch QA

Test:

```text
Open Customer list.
Open Add/Edit Customer.
Expected:
- Customer Basic tab lookup values do not load one by one.
- One batch lookup action seeds individual query keys.
- Reopen within staleTime uses cache.
```

## 8.2 Customer Child Tables QA

Test:

```text
Open Customer Edit.
Stay on Basic tab.
Expected:
- contacts query does not fire
- addresses query does not fire
- bank details query does not fire

Click Contacts:
- contacts query fires only now

Click Location:
- addresses query fires only now

Click Finance:
- bank details query fires only now
```

## 8.3 Customer Child Mutation QA

If possible:

```text
Add/Edit/Delete contact:
- only contacts query invalidates/refetches

Add/Edit/Delete address:
- only addresses query invalidates/refetches

Add/Edit/Delete bank detail:
- only bank details query invalidates/refetches
```

## 8.4 Safe Close QA

Test:

```text
Change only Customer Type combobox.
Click outside.
Expected:
- Unsaved Changes dialog appears.

Click Stay on Form.
Expected:
- drawer remains open and selected value remains.

Click Discard Changes.
Expected:
- drawer closes.
```

## 8.5 Save QA

Test or source-verify:

```text
Save keeps open and resets dirty.
Save & Close closes after success.
Repeated Save after Add does not create duplicate customer.
Saving without visiting Location/Finance/Compliance does not null data.
```

---

# 9. Dev Harness Handling

Previous phases may have dev harnesses:

```text
/dev/performance-qa
/dev/customer-prefetch-qa
/dev/customer-child-qa
```

Audit and decide:

## Preferred

Remove all dev harness routes if runtime QA is done or if production deployment is near.

## Alternative

Keep only if:

```text
guarded by NODE_ENV production notFound()
documented in report
needed for Sameer/Dina manual review
```

The report must clearly list:

```text
which dev harness routes exist
which are removed
which are retained and why
production guard status
```

If retained, mark as:

```text
must delete before production deployment
```

---

# 10. Bug Handling Rules

If blocking bug found:

```text
fix only if directly related to prefetch/runtime standard
run tests again
document before/after
```

Blocking examples:

```text
Organization/Branch Add/Edit stops opening
Customer prefetch broken
Customer child queries fire immediately before tab activation
Safe Close after combobox-only edit fails
typecheck/build fails
```

Non-blocking examples:

```text
authenticated route unavailable
minor loading visual
dev harness retained with guard
pre-existing lint
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

# 12. Required Matrices

## 12.1 Prefetch Wiring Matrix

```text
Module | Declaration | Page Mount Prefetch | Add Click | Edit Click | View Click | Status
```

Rows:

```text
Customer
Organization
Branch
```

## 12.2 Customer Runtime QA Matrix

```text
Test | Expected | Result | Evidence | Status
```

## 12.3 Dev Harness Matrix

```text
Route | Purpose | Guarded? | Removed? | Keep/Delete Decision
```

## 12.4 Closure Matrix

```text
Area | Pass/Notes/Fail | Notes
```

---

# 13. Required Report

Create:

```text
ERP_BASE_002F_3E_3B_6G_6_RUNTIME_QA_CLOSURE_ORGANIZATION_BRANCH_PREFETCH_WIRING_REPORT.md
```

Report must include:

1. Phase name.
2. Date/time.
3. Supabase connection confirmation.
4. Standards/reports reviewed.
5. Source audit findings.
6. Organization prefetch wiring.
7. Branch prefetch wiring.
8. Customer runtime QA result.
9. Dev harness handling.
10. Bugs found.
11. Bugs fixed.
12. Bugs deferred.
13. Static test results.
14. Prefetch wiring matrix.
15. Customer runtime QA matrix.
16. Closure recommendation.
17. Final status.

Final status must be exactly one of:

```text
PASS — Runtime QA and Organization/Branch prefetch wiring completed and verified.
PASS WITH NOTES — Completed with non-blocking notes.
FAIL — Blocking issues remain.
BLOCKED — Could not complete due to environment/tooling/source blocker.
```

---

# 14. Closure Criteria

Do not mark PASS unless:

```text
Organization prefetch wired or formally deferred with justified reason
Branch prefetch wired or formally deferred with justified reason
Customer runtime QA completed by real app or harness/source with notes
Customer child lazy/query behavior verified
Safe Close after combobox-only edit verified or source-proven
typecheck passes
build passes
report created
```

If browser runtime QA is not possible:

```text
PASS WITH NOTES
```

not full clean PASS.

---

# 15. Stop Condition

After implementation, QA, tests, and report, stop.

Do not start Customer final QA.

Wait for Sameer/Dina review.

---

# Final Instruction

Wire Organization and Branch prefetch.

Run Customer runtime closure QA.

Handle dev harnesses.

Run tests.

Create closure report.

Stop.
