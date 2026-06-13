# PROMPT_ERP_BASE_002F_3E_3B_6G_4_GENERIC_CHILD_TABLE_QUERY_INVALIDATION_PATTERN

Act as Fable 5 inside Cursor.

Use deep runtime reasoning as a senior ERP architecture agent, React/Next.js 16 engineer, TanStack Query architect, Supabase/RLS reviewer, reusable hook designer, parent-child form runtime specialist, future-module standards engineer, and Cursor implementation engineer.

## Phase

ERP BASE 002F.3E.3B.6G.4 — Generic Child Table Query / Invalidation Pattern

## Prompt Purpose

This is a controlled ARCHITECTURE + IMPLEMENTATION prompt.

This phase follows:

```text
3B.6G.1 — Global Parent Form Runtime Standard Document + Prefetch Utilities
3B.6G.2 — Customer Basic Tab Lookup Prefetch Wiring
3B.6G.3 — Customer Child Tables TanStack Query Migration
```

3B.6G.3 proved the child-table runtime pattern inside Customer:

```text
CustomerContactsSection uses TanStack Query.
CustomerAddressesSection uses TanStack Query.
CustomerBankDetailsSection uses TanStack Query.
Each child query uses queryKeys.child.*
Each child mutation invalidates only its own child query.
Lazy mount is preserved.
Parent dirty state is not affected by child CRUD.
```

This phase must now extract that proven pattern into a reusable generic standard/hook so future modules do not copy/paste Customer-specific query logic.

Target future/current modules include:

```text
Vendors
Subcontractors
Consultants
Government Authorities
Recruitment Agencies
HR / Employees
Fleet / Vehicles / Equipment
Workshop / Service Jobs
Inventory / Spare Parts
Projects
Documents / DMS
Any parent form with child tables
```

This phase should create the generic child-table query/invalidation pattern and document how to use it.

Do not migrate Vendor/Subcontractor/etc. modules yet unless they already exist and migration is explicitly safe.

Do not create new modules.

Do not build DMS.

Do not start 3B.6G.5.

---

# 1. Immediate Goal

Create a reusable generic child table query/invalidation foundation based on the Customer pattern.

After this phase:

```text
There is a reusable child table query hook or factory.
There is a clear child table key standard.
There are generic invalidation helpers.
Customer child hooks can optionally use the generic helper internally.
Future modules can define child table hooks with minimal code.
The app standard document is updated if needed.
No existing Customer behavior regresses.
```

---

# 2. Strict Scope

## In Scope

Implement:

```text
generic child table query hook/factory
generic child table query result type
generic child table invalidation helpers if missing
module child table declaration pattern
optional refactor of Customer child hooks to use generic helper internally
documentation of how to create future child hooks
source-level QA
static tests
implementation report
```

## Out of Scope

Do not implement:

```text
Vendor module
Subcontractor module
Consultant module
Government Authority module
Recruitment Agency module
HR module
Fleet module
Workshop module
Inventory module
DMS/documents module
database schema changes
migrations
new child table UI screens
Customer final QA
Global Search
AI
export/email
server-side entity search
virtualization
```

Those belong to later phases.

---

# 3. Mandatory Supabase Connection First

Before implementation, connect to the live ERP Supabase project:

```text
https://mmiefuieduzdiiwnqpie.supabase.co
```

Use the correct ERP Supabase connection/tool. Previous reports found that one Supabase plugin points to an unrelated weighing/industrial project.

Verify tables relevant to generic child-table planning:

```text
customers
customer_contacts
customer_addresses
customer_bank_details
customer_documents
vendors
vendor_contacts
vendor_addresses
vendor_bank_details
vendor_documents
subcontractors
subcontractor_contacts
subcontractor_addresses
subcontractor_bank_details
subcontractor_documents
consultants
consultant_contacts
consultant_addresses
consultant_bank_details
consultant_documents
government_authorities
government_authority_contacts
government_authority_addresses
government_authority_documents
recruitment_agencies
recruitment_agency_contacts
recruitment_agency_addresses
recruitment_agency_bank_details
recruitment_agency_documents
```

If some future tables do not exist yet, document accurately.

No database changes are expected.

The report must state:

```text
Connected to live Supabase project: https://mmiefuieduzdiiwnqpie.supabase.co
No database schema changes were required for 3B.6G.4 Generic Child Table Query / Invalidation Pattern.
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
ERP_BASE_002F_3E_3B_6F_GLOBAL_COMBOBOX_FORM_PERFORMANCE_RUNTIME_QA_CLOSURE_GATE_REPORT.md
ERP_BASE_002F_3E_3B_4C_SAFE_CLOSE_RUNTIME_INVESTIGATION_AND_FIX_REPORT.md
```

Read source:

```text
src/lib/query/query-keys.ts
src/lib/query/invalidation.ts
src/lib/query/form-prefetch-types.ts
src/features/master-data/customers/hooks/use-customer-child-queries.ts
src/features/master-data/customers/components/customer-contacts-section.tsx
src/features/master-data/customers/components/customer-addresses-section.tsx
src/features/master-data/customers/components/customer-bank-details-section.tsx
src/server/actions/master-data/customer-contacts.ts
src/server/actions/master-data/customer-addresses.ts
src/server/actions/master-data/customer-bank-details.ts
src/features/master-data/customers/customer-prefetch.ts
```

Use actual paths if different.

---

# 5. Required Source Audit Before Coding

Run:

```bash
grep -R "useCustomerContactsQuery" -n src
grep -R "useCustomerAddressesQuery" -n src
grep -R "useCustomerBankDetailsQuery" -n src
grep -R "queryKeys.child" -n src
grep -R "invalidateChildTable" -n src
grep -R "invalidateCustomerContacts" -n src
grep -R "customer_contacts" -n src
grep -R "vendor_contacts" -n src
grep -R "subcontractor_contacts" -n src
grep -R "consultant_contacts" -n src
grep -R "government_authority_contacts" -n src
grep -R "recruitment_agency_contacts" -n src
grep -R "ChildTableDescriptor" -n src
```

Answer in report:

```text
What generic child-table utilities already exist?
Are queryKeys.child.* generic enough?
Are invalidation helpers generic enough?
How are Customer child hooks shaped?
Can Customer hooks be refactored to a generic helper without breaking behavior?
Which future child tables exist in DB/source?
Which future child tables are DB-only, not UI-implemented yet?
```

Do not rely on memory or previous reports only. Verify actual source.

---

# 6. Required Generic Hook Design

Create a generic child table query helper.

Suggested file:

```text
src/hooks/child-tables/use-child-table-query.ts
```

or:

```text
src/lib/query/use-child-table-query.ts
```

Choose the project-conventional path.

## Required Generic Hook

Design a reusable hook like:

```typescript
useChildTableQuery<TItem>({
  tableName,
  parentId,
  queryKey,
  fetcher,
  enabled,
  staleTime,
  gcTime,
})
```

or a factory:

```typescript
createChildTableQueryHook<TItem>({
  tableName,
  queryKeyFactory,
  fetcher,
  defaultStaleTime,
})
```

Choose the cleaner approach.

The hook/factory must:

```text
use TanStack Query
support parentId null/undefined safely
disable query if no parentId
support extra enabled option
normalize ActionResult from server actions
surface error as string or TanStack error cleanly
keep staleTime/gcTime defaults aligned with Customer child hooks
not throw unhandled errors into UI
return consistent shape or preserve useQuery result plus items
```

Recommended defaults:

```text
staleTime: 30 seconds
gcTime: 10 minutes
refetchOnWindowFocus: false
```

## Result shape

Use a standard result shape, for example:

```typescript
{
  items: TItem[]
  data: TItem[]
  isLoading: boolean
  isFetching: boolean
  error: string | null
  refetch: () => void
}
```

If returning the full TanStack query object, still provide `items` for child table UI convenience.

---

# 7. Required Generic Invalidation Pattern

Ensure helpers exist:

```typescript
invalidateChildTable(queryClient, tableName, parentId)
invalidateAllChildTables(queryClient)
```

If already exist, verify and document.

If needed, add:

```typescript
createChildInvalidator(tableName)
```

or a helper factory to generate entity-specific helpers.

Do not remove existing customer helpers.

Maintain:

```text
invalidateCustomerContacts
invalidateCustomerAddresses
invalidateCustomerBankDetails
invalidateCustomerDocuments
```

If they exist, they can internally delegate to the generic helper.

---

# 8. Customer Hook Refactor

Refactor Customer child hooks to use the generic helper only if safe.

Current hooks:

```text
useCustomerContactsQuery
useCustomerAddressesQuery
useCustomerBankDetailsQuery
```

Target:

```text
keep the public hook names and return shape unchanged
internally use generic child table helper/factory
no component changes required unless type imports need update
same query keys
same enabled behavior
same staleTime/gcTime
same error behavior
```

If refactor risk is high, leave Customer hooks as-is and document the generic helper as ready for future modules. But preferred is to refactor because it proves the generic pattern.

---

# 9. Child Table Declaration Pattern

Enhance or document `ChildTableDescriptor` from:

```text
src/lib/query/form-prefetch-types.ts
```

It should support future declarations such as:

```typescript
{
  tableName: "customer_contacts",
  parentKey: "customer_id",
  sectionId: "contacts",
  queryKey: queryKeys.child.customerContacts,
  invalidate: invalidateCustomerContacts,
}
```

Do not over-engineer.

The goal is a clear standard for future modules.

If changing types risks existing declaration, add optional fields only.

---

# 10. Future Module Pattern Documentation

Update the standard document if needed:

```text
docs/standards/ERP_GLOBAL_PARENT_FORM_RUNTIME_STANDARD.md
```

Add a short code example showing how a new module creates child hooks:

```typescript
export function useVendorContactsQuery(vendorId, options) {
  return useChildTableQuery<VendorContact>({
    tableName: "vendor_contacts",
    parentId: vendorId,
    queryKey: queryKeys.child.table("vendor_contacts", vendorId),
    fetcher: getVendorContacts,
    enabled: options?.enabled,
  });
}
```

Also include mutation invalidation example:

```typescript
invalidateChildTable(queryClient, "vendor_contacts", vendorId);
```

Keep the standard practical, not too long.

---

# 11. Runtime/Source QA Requirements

## Source QA

Verify:

```text
Customer child hooks still compile.
Customer sections still import same hooks.
Query keys are unchanged.
Invalidation helpers still target same keys.
No UI component behavior changed.
No parent dirty state affected.
No new child section fetch-on-open behavior introduced.
```

## Runtime QA if authenticated route available

Test Customer:

```text
Open Edit Customer, stay on Basic.
No child fetch.

Open Contacts.
Contacts query fires.

Add/Edit/Delete contact.
Only contacts query invalidates.

Open Location.
Addresses query fires only now.

Open Finance.
Bank details query fires only now.
```

If authenticated route unavailable, source QA and optional dev harness are acceptable, but final status should be PASS WITH NOTES unless browser verified.

---

# 12. Static Tests

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

# 13. Required Implementation Report

Create:

```text
ERP_BASE_002F_3E_3B_6G_4_GENERIC_CHILD_TABLE_QUERY_INVALIDATION_PATTERN_REPORT.md
```

Report must include:

1. Phase name.
2. Date/time.
3. Supabase connection confirmation.
4. Standards/reports reviewed.
5. Source audit findings.
6. Generic hook/factory created.
7. Generic invalidation pattern.
8. Customer hook refactor status.
9. ChildTableDescriptor updates.
10. Standard document updates.
11. Future module usage example.
12. Backward compatibility verification.
13. Runtime/browser QA status.
14. Static test results.
15. Known limitations.
16. Next phase recommendation.
17. Final status.

Final status must be exactly one of:

```text
PASS — Generic child table query/invalidation pattern implemented and verified.
PASS WITH NOTES — Implemented with non-blocking notes.
FAIL — Blocking issues remain.
BLOCKED — Could not complete due to environment/tooling/source blocker.
```

---

# 14. Closure Criteria

Do not mark PASS unless:

```text
generic child query helper/factory exists
generic invalidation pattern exists or verified
Customer hooks preserve public API
Customer hooks either use generic helper or deferral is justified
query keys unchanged
typecheck passes
build passes
standard document updated or deferral justified
report created
```

If browser/runtime QA is unavailable:

```text
PASS WITH NOTES
```

not clean PASS unless source-only is clearly sufficient and no runtime behavior changed.

---

# 15. Stop Condition

After implementation, tests, and report, stop.

Do not start 3B.6G.5.

Wait for Sameer/Dina review.

---

# Final Instruction

Extract the proven Customer child-table query pattern into a reusable generic pattern.

Keep Customer behavior unchanged.

Prepare the foundation for Vendors, Subcontractors, Consultants, Government Authorities, Recruitment Agencies, HR, Fleet, Workshop, Inventory, and other future modules.

Run tests.

Create report.

Stop.
