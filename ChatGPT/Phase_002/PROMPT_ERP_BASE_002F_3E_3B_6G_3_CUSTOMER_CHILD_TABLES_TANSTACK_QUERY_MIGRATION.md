# PROMPT_ERP_BASE_002F_3E_3B_6G_3_CUSTOMER_CHILD_TABLES_TANSTACK_QUERY_MIGRATION

Act as Fable 5 inside Cursor.

Use deep runtime reasoning as a senior React/Next.js 16 performance engineer, TanStack Query hook architect, Supabase query optimization reviewer, ERP parent-child form architect, Safe Close regression tester, and Customer module implementation engineer.

## Phase

ERP BASE 002F.3E.3B.6G.3 — Customer Child Tables TanStack Query Migration

## Prompt Purpose

This is a controlled IMPLEMENTATION prompt.

This phase follows:

```text
3B.6G.1 — Global Parent Form Runtime Standard Document + Prefetch Utilities
3B.6G.2 — Customer Basic Tab Lookup Prefetch Wiring
```

3B.6G.1 created the global parent-form runtime standard, lookup prefetch utilities, child query keys, and child invalidation helpers.

3B.6G.2 wired Customer Basic tab lookup prefetch so Customer lookup fields stop loading one by one.

This phase must now migrate the Customer child sections from manual `useEffect + useState + reload` fetching to TanStack Query.

Current Customer child sections:

```text
CustomerContactsSection
CustomerAddressesSection
CustomerBankDetailsSection
Customer Documents placeholder / future documents section
```

The goal is to make Customer child tables:

```text
fetch only when their tab is opened
fetch only when customerId exists
use TanStack Query keyed by customerId
cache data when closing/reopening the same customer
invalidate only the affected child-table query after add/edit/delete
avoid refetching unrelated child tables
preserve existing UI and behavior
```

Do not implement new DMS.

Do not implement generic child table abstraction yet.

Do not start 3B.6G.4.

---

# 1. Immediate Required Outcome

After this phase:

```text
Customer Contacts uses TanStack Query.
Customer Addresses uses TanStack Query.
Customer Bank Details uses TanStack Query.
Each child section query is enabled only when customerId exists and the section is mounted.
Add/Edit/Delete contact invalidates only customer contacts for that customer.
Add/Edit/Delete address invalidates only customer addresses for that customer.
Add/Edit/Delete bank detail invalidates only customer bank details for that customer.
No parent customer cache or unrelated child table cache is invalidated unless required.
Child sections still stay lazy-mounted from 3B.6E.
Safe Close and Customer save behavior do not regress.
```

---

# 2. Strict Scope

## In Scope

Implement:

```text
Customer child table TanStack Query hooks
Customer contacts query hook
Customer addresses query hook
Customer bank details query hook
targeted child invalidation after child mutations
loading/error states preserved or improved
lazy-mount behavior preserved
source/runtime QA
implementation report
```

## Out of Scope

Do not implement:

```text
new Customer documents/DMS module
generic child table abstraction
vendor/subcontractor/consultant child modules
parent Customer lookup prefetch changes
drawer lazy-mount architecture changes
database migrations
schema changes
new modules
Global Search
AI
export/email
server-side entity search
virtualization
Customer final closure
```

These are future phases:

```text
3B.6G.4 — Generic Child Table Query/Invalidation Pattern
3B.6G.5 — Apply Standard to Existing Forms / Future-Ready Modules
3B.6G.6 — Runtime QA and Closure Gate
Customer Final QA phase
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
customer_documents
global_lookup_categories
global_lookup_values
```

No database changes are expected.

The report must state:

```text
Connected to live Supabase project: https://mmiefuieduzdiiwnqpie.supabase.co
No database schema changes were required for 3B.6G.3 Customer Child Tables TanStack Query Migration.
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
ERP_BASE_002F_3E_3B_6G_2_CUSTOMER_BASIC_TAB_LOOKUP_PREFETCH_WIRING_REPORT.md
ERP_BASE_002F_3E_3B_6F_GLOBAL_COMBOBOX_FORM_PERFORMANCE_RUNTIME_QA_CLOSURE_GATE_REPORT.md
ERP_BASE_002F_3E_3B_6E_LAZY_LOAD_DRAWER_TABS_AND_CHILD_SECTIONS_REPORT.md
ERP_BASE_002F_3E_3B_4C_SAFE_CLOSE_RUNTIME_INVESTIGATION_AND_FIX_REPORT.md
```

Read source:

```text
src/lib/query/query-client.ts
src/lib/query/query-keys.ts
src/lib/query/invalidation.ts
src/lib/query/form-prefetch-types.ts
src/features/master-data/customers/components/customer-form-drawer.tsx
src/features/master-data/customers/components/customer-contacts-section.tsx
src/features/master-data/customers/components/customer-addresses-section.tsx
src/features/master-data/customers/components/customer-bank-details-section.tsx
src/server/actions/master-data/customers.ts
src/features/master-data/customers/*
src/hooks/lookups/*
```

Use actual paths if different.

---

# 5. Required Source Audit Before Coding

Run:

```bash
grep -R "CustomerContactsSection" -n src
grep -R "CustomerAddressesSection" -n src
grep -R "CustomerBankDetailsSection" -n src
grep -R "getCustomerContacts" -n src
grep -R "getCustomerAddresses" -n src
grep -R "getCustomerBankDetails" -n src
grep -R "createCustomerContact" -n src
grep -R "updateCustomerContact" -n src
grep -R "deleteCustomerContact" -n src
grep -R "createCustomerAddress" -n src
grep -R "updateCustomerAddress" -n src
grep -R "deleteCustomerAddress" -n src
grep -R "createCustomerBank" -n src
grep -R "updateCustomerBank" -n src
grep -R "deleteCustomerBank" -n src
grep -R "queryKeys.child" -n src
grep -R "invalidateCustomerContacts" -n src
grep -R "invalidateCustomerAddresses" -n src
grep -R "invalidateCustomerBankDetails" -n src
```

Answer in the report:

```text
Where are customer child fetch actions defined?
Where are child mutations defined?
How are current sections loading data?
Do sections fetch on mount?
Are sections already lazy-mounted by parent tab activation?
Do queryKeys.child.customerContacts / customerAddresses / customerBankDetails exist?
Do invalidation helpers exist?
```

Do not rely only on previous reports. Verify source.

---

# 6. Required Hook Implementation

Create customer child query hooks.

Suggested file:

```text
src/features/master-data/customers/hooks/use-customer-child-queries.ts
```

or:

```text
src/hooks/customers/use-customer-child-queries.ts
```

Choose the project-conventional path.

Required hooks:

```typescript
useCustomerContactsQuery(customerId, options?)
useCustomerAddressesQuery(customerId, options?)
useCustomerBankDetailsQuery(customerId, options?)
```

Optional future-ready:

```typescript
useCustomerDocumentsQuery(customerId, options?) // only if existing actions/table are ready; otherwise defer
```

## Hook requirements

Each hook must:

```text
use TanStack Query
use existing queryKeys.child.customerContacts / customerAddresses / customerBankDetails
call existing server actions for fetch
be enabled only when customerId exists and options.enabled is true
return consistent result shape
keep existing row types or infer from actions
not throw unhandled errors
support refetch if needed
```

Recommended shape:

```typescript
{
  data,
  items,
  isLoading,
  isFetching,
  error,
  refetch
}
```

But if standard `useQuery` return is easier, do not overwrap unnecessarily. Keep it simple and typed.

## Query settings

Recommended:

```text
staleTime: 30 seconds
gcTime: 10–30 minutes
refetchOnWindowFocus: false unless needed
```

Child rows are editable and should not stay stale too long.

---

# 7. Required Component Migration

Migrate these components:

```text
CustomerContactsSection
CustomerAddressesSection
CustomerBankDetailsSection
```

## Replace current pattern

Current likely pattern:

```typescript
const [items, setItems] = useState([]);
const [isLoading, setIsLoading] = useState(false);

useEffect(() => {
  loadItems();
}, [customerId]);

async function loadItems() {
  const result = await getCustomerContacts(customerId);
  setItems(result.data);
}
```

Replace with:

```typescript
const query = useCustomerContactsQuery(customerId, {
  enabled: Boolean(customerId)
});
const contacts = query.data ?? [];
```

But because the section is already lazy-mounted, enabled can simply be customerId-based, or accept an `enabled` prop if needed.

## Preserve UI

Do not break:

```text
existing table/list layout
empty state
loading state
add/edit dialogs
delete confirmation
disabled/view mode behavior
toast messages
button labels
```

## Mutation invalidation

After successful create/update/delete:

```typescript
invalidateCustomerContacts(queryClient, customerId)
```

Do not manually call `loadContacts()` anymore.

Do the same for addresses and bank details.

## Loading state

Keep current loading UX equivalent:

```text
initial loading shows spinner/skeleton/Loading...
background fetching may not block UI
errors shown clearly
```

If current components have no error UI, add small non-blocking error message or toast only if consistent.

---

# 8. Lazy Mount Must Remain

Do not undo 3B.6E.

Verify in `customer-form-drawer.tsx`:

```text
CustomerContactsSection mounts only when contacts tab first activated.
CustomerAddressesSection mounts only when location tab first activated.
CustomerBankDetailsSection mounts only when finance tab first activated.
```

Do not make them mount on drawer open again.

Report must confirm:

```text
child query cannot fire before section mount
child query cannot fire without customerId
```

---

# 9. Query Invalidation Rules

Use existing helpers from:

```text
src/lib/query/invalidation.ts
```

Expected helpers:

```typescript
invalidateCustomerContacts(queryClient, customerId)
invalidateCustomerAddresses(queryClient, customerId)
invalidateCustomerBankDetails(queryClient, customerId)
```

If missing, add them according to 3B.6G.1 standard.

Use `useQueryClient()` inside child components.

After mutation success:

```text
close child dialog if applicable
show success toast as before
invalidate only that child query
do not invalidate all customers
do not invalidate all child tables
do not reload unrelated child sections
```

---

# 10. Runtime / Browser QA Requirements

If authenticated Customer route is available, test real route:

## 10.1 Edit Customer Initial Open

```text
Open Customer Edit.
Stay on Basic tab.
Expected:
- Contacts query does not fire.
- Addresses query does not fire.
- Bank Details query does not fire.
```

## 10.2 Contacts Tab

```text
Click Contacts tab.
Expected:
- Contacts query fires only now.
- Contacts data renders.
- Switch away/back: no repeated full fetch unless stale/refetch intended.
```

## 10.3 Addresses and Bank Details Tabs

```text
Click Location tab.
Expected:
- Addresses query fires only now.

Click Finance tab.
Expected:
- Bank Details query fires only now.
```

## 10.4 Mutation Invalidation

```text
Add contact.
Expected:
- only customer_contacts query invalidates/refetches.
- addresses/bank queries do not refetch.

Edit/delete contact:
- same targeted invalidation.

Repeat for addresses and bank details if possible.
```

## 10.5 Add Mode

```text
Open Add Customer.
Expected:
- child queries do not run because no customerId.
- child tabs show Save parent first or equivalent placeholder.
```

If authenticated route unavailable, create temporary dev-only harness using production hooks/actions or mocked parent id and query cache inspector. Remove harness before final build unless production-guarded and documented.

---

# 11. Safe Close and Parent Dirty Rules

Child table edits should generally not mark the parent Customer form dirty because child rows save independently.

Required behavior:

```text
Opening Contacts tab should not mark parent form dirty.
Adding/editing/deleting a contact should not make parent form show Unsaved Changes unless parent field changed.
Changing parent form field still marks dirty.
Combobox-only parent edit still marks dirty.
Safe Close still works for parent dirty state.
```

Verify source behavior and document.

Do not introduce a parent `markDirty` call in child sections.

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
ERP_BASE_002F_3E_3B_6G_3_CUSTOMER_CHILD_TABLES_TANSTACK_QUERY_MIGRATION_REPORT.md
```

Report must include:

1. Phase name.
2. Date/time.
3. Supabase connection confirmation.
4. Standards/reports reviewed.
5. Source audit findings.
6. Hooks created.
7. Components migrated.
8. Query keys used.
9. Invalidation helpers used.
10. Lazy mount preservation.
11. Child fetch behavior.
12. Mutation invalidation behavior.
13. Parent dirty/Safe Close behavior.
14. Runtime/browser QA result.
15. Static test results.
16. Known limitations.
17. Next phase recommendation.
18. Final status.

Final status must be exactly one of:

```text
PASS — Customer child tables migrated to TanStack Query and browser/runtime verified.
PASS WITH NOTES — Implemented with non-blocking notes.
FAIL — Blocking issues remain.
BLOCKED — Could not complete due to environment/tooling/source blocker.
```

---

# 14. Closure Criteria

Do not mark PASS unless:

```text
contacts use TanStack Query
addresses use TanStack Query
bank details use TanStack Query
queries use child query keys
queries are enabled only when customerId exists
sections remain lazy-mounted
mutations invalidate only relevant child query
manual reload functions removed or no longer used
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

# 15. Stop Condition

After implementation, tests, and report, stop.

Do not start 3B.6G.4.

Wait for Sameer/Dina review.

---

# Final Instruction

Migrate Customer child tables to TanStack Query.

Keep lazy loading.

Use child query keys and targeted invalidation.

Do not change parent Customer save behavior.

Run tests.

Create report.

Stop.
