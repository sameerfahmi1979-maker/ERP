# PROMPT_ERP_BASE_002F_3E_3B_6G_3B_CUSTOMER_CONTACTS_LOADING_INVESTIGATION_AND_FIX

Act as Fable 5 inside Cursor.

Use deep runtime reasoning as a senior React/Next.js 16 runtime debugger, TanStack Query performance engineer, Supabase server-action profiler, Customer child-table architect, browser network waterfall analyst, ERP UX reviewer, and Safe Close regression tester.

## Phase

ERP BASE 002F.3E.3B.6G.3B — Customer Contacts Loading Investigation and Fix

## Prompt Purpose

This is a controlled INVESTIGATION + TARGETED FIX prompt.

Before starting:

```text
ERP BASE 002F.3E.3B.7 — Customer Module Final QA and Closure
```

the user manually observed:

```text
In Customer Edit, the Contacts section still takes time to load.
```

This may mean:

```text
the Customer child table TanStack Query migration is not fully effective
the Contacts tab is fetching too late or too slowly
the contact child section still waits on lookup data
the contact server action is slow
the child query is not cached correctly
the section is lazy-loaded correctly but needs better UX/loading/prefetch
the previous plan was implemented but not enough for professional ERP behavior
```

Do not assume the previous report is correct.

Investigate the real runtime path and fix the issue if it is a blocking or important UX/performance defect.

---

# 1. Immediate Goal

When the user opens Customer Edit and clicks Contacts:

```text
Contacts tab should feel fast and professional.
If data is cached, it should show almost instantly.
If data is cold, loading should be clear and quick.
It should not feel like the section is stuck or slowly loading unnecessarily.
```

Expected behavior:

```text
Customer drawer opens fast.
Contacts query does not run until Contacts tab opens.
When Contacts tab opens, contacts fetch runs once.
Closing/reopening same customer within cache time should use cached contacts.
Adding/editing/deleting contact invalidates only contacts query.
Lookup fields inside contact add/edit dialogs should not delay the Contacts list unnecessarily.
```

---

# 2. Strict Scope

## In Scope

Investigate and fix:

```text
Customer Contacts tab loading delay
CustomerContactsSection TanStack Query hook behavior
customer_contacts server action performance
contacts query key / staleTime / gcTime
loading UX
contact lookup fields if they delay section
contact child query caching
targeted invalidation
runtime/browser proof
```

Also compare, if useful:

```text
CustomerAddressesSection
CustomerBankDetailsSection
```

because they use the same pattern.

## Out of Scope

Do not implement:

```text
DMS
Customer final QA closure
new modules
vendor/subcontractor modules
database migrations
schema changes
major redesign
Global Search
AI
export/email
server-side entity search
virtualization
large generic abstraction
```

Do not start 3B.7 until this issue is solved or formally classified as non-blocking.

---

# 3. Mandatory Supabase Connection First

Before investigation, connect to live ERP Supabase:

```text
https://mmiefuieduzdiiwnqpie.supabase.co
```

Use the correct ERP Supabase connection/tool.

Verify:

```text
customers
customer_contacts
customer_addresses
customer_bank_details
global_lookup_categories
global_lookup_values
```

No database schema changes are expected.

Report must state:

```text
Connected to live Supabase project: https://mmiefuieduzdiiwnqpie.supabase.co
No database schema changes were required for Customer Contacts loading investigation/fix.
```

If Supabase connection is wrong/unavailable, continue source/runtime investigation and document it.

---

# 4. Mandatory Documents / Reports to Read

Read standards:

```text
docs/standards/ERP_GLOBAL_PARENT_FORM_RUNTIME_STANDARD.md
docs/standards/ERP_GLOBAL_UI_UX_FORM_TABLE_DRAWER_DEVELOPMENT_GUIDE.md
docs/standards/ERP_GLOBAL_CURSOR_DEVELOPMENT_AND_IMPLEMENTATION_GUIDE.md
```

Read reports:

```text
ERP_BASE_002F_3E_3B_6G_3_CUSTOMER_CHILD_TABLES_TANSTACK_QUERY_MIGRATION_REPORT.md
ERP_BASE_002F_3E_3B_6G_4_GENERIC_CHILD_TABLE_QUERY_INVALIDATION_PATTERN_REPORT.md
ERP_BASE_002F_3E_3B_6G_6_RUNTIME_QA_CLOSURE_ORGANIZATION_BRANCH_PREFETCH_WIRING_REPORT.md
ERP_BASE_002F_3E_3B_6G_2_CUSTOMER_BASIC_TAB_LOOKUP_PREFETCH_WIRING_REPORT.md
```

Read source:

```text
src/features/master-data/customers/components/customer-form-drawer.tsx
src/features/master-data/customers/components/customer-contacts-section.tsx
src/features/master-data/customers/hooks/use-customer-child-queries.ts
src/hooks/child-tables/use-child-table-query.ts
src/server/actions/master-data/customer-contacts.ts
src/lib/query/query-keys.ts
src/lib/query/invalidation.ts
src/components/erp/lookup-select.tsx
src/features/master-data/customers/components/customer-addresses-section.tsx
src/features/master-data/customers/components/customer-bank-details-section.tsx
```

---

# 5. Required Investigation

Run source searches:

```bash
grep -R "CustomerContactsSection" -n src
grep -R "useCustomerContactsQuery" -n src
grep -R "getCustomerContacts" -n src
grep -R "customer_contacts" -n src
grep -R "CONTACT_TYPES" -n src
grep -R "COMMUNICATION_PREFERENCE_TYPES" -n src
grep -R "LookupSelect" -n src/features/master-data/customers/components/customer-contacts-section.tsx
grep -R "queryKeys.child.customerContacts" -n src
grep -R "invalidateCustomerContacts" -n src
grep -R "staleTime" -n src/hooks/child-tables src/features/master-data/customers
```

Answer with evidence:

```text
Does CustomerContactsSection mount only when Contacts tab opens?
Does useCustomerContactsQuery run only after customerId exists?
Does the query key match the standard?
Does the query use staleTime/gcTime correctly?
Does closing and reopening same customer reuse cache?
Does add/edit/delete invalidate only contacts?
Does the contact section itself wait on LookupSelect values?
Are contact types / communication preferences fetched only when opening add/edit contact dialog?
Is the server action selecting too many columns or doing unnecessary joins?
Is RLS/permission check causing delay?
```

---

# 6. Runtime / Browser Investigation

If authenticated app is available, test real Customer route:

```text
Open Customer Edit.
Open DevTools Network.
Stay on Basic tab.
Confirm no customer_contacts request/action fires.

Click Contacts.
Measure:
- time until Contacts list appears
- number of network calls
- whether lookup categories are loaded at same time
- whether request repeats when switching away/back
- whether request repeats after closing/reopening same customer
```

If login is unavailable, use existing dev harness:

```text
/dev/customer-child-qa
```

or create a temporary focused harness using production hooks. Keep it production-guarded and document.

The investigation must classify the issue:

```text
BUG — previous plan not implemented correctly / cache not used / repeated fetch
PERFORMANCE GAP — plan works but cold first fetch needs prefetch/loading UX
NORMAL — only cold network latency, warm cache is fast and UI acceptable
```

Do not call it normal without runtime/source proof.

---

# 7. Possible Fix Options

Choose the correct minimal fix based on evidence.

## Option A — Query Hook / Cache Issue

If contacts still refetch unnecessarily:

```text
fix query key
fix enabled condition
fix staleTime/gcTime
fix cache invalidation
fix component remount behavior
```

## Option B — Server Action Slow

If `getCustomerContacts` is slow:

```text
inspect action
remove unnecessary selects
avoid joins if not needed
ensure ordered query is simple
ensure permission check is not repeated excessively if avoidable
do not weaken security
```

## Option C — Contact Lookups Delay List

If Contact section loads list plus lookup fields immediately:

```text
ensure contact type / communication preference lookups load only inside add/edit contact dialog
or prefetch them when Contacts tab opens
do not block contact list on lookup data
```

## Option D — Cold Fetch Acceptable but UX Poor

If cold fetch is normal but feels slow:

```text
improve loading skeleton / section-level placeholder
show cached previous data while refetching
avoid full blocking spinner on background refetch
show "Loading contacts..." clearly
```

## Option E — Need Section Prefetch on Tab Hover / Pre-Activation

If business wants contacts instant when tab clicked:

```text
consider prefetching contacts when user hovers/focuses Contacts tab
or when Customer Edit drawer opens after short idle delay
but do not fetch immediately if it violates the child lazy-load standard unless approved
```

Prefer not to break the lazy-load rule unless justified.

---

# 8. Rules For Fixing

If fixing, preserve:

```text
Customer child table lazy mount
query enabled only when customerId exists
targeted invalidation
parent dirty state isolation
Safe Close
Save / Save & Close
existing UI layout
```

Do not introduce:

```text
child fetch on initial drawer open unless explicitly justified
unrelated parent cache invalidation
parent dirty state from child CRUD
new DB schema
```

---

# 9. Required Tests

Run:

```bash
npm run typecheck
npm run lint
npm run build
```

If you modify runtime code, also test/harness:

```text
Contacts fetch only on tab open
Contacts cached on switch away/back
Contact mutation invalidates only contacts
No addresses/bank refetch on contact mutation
Add mode no contacts fetch without customerId
```

---

# 10. Required Report

Create:

```text
ERP_BASE_002F_3E_3B_6G_3B_CUSTOMER_CONTACTS_LOADING_INVESTIGATION_AND_FIX_REPORT.md
```

Report must include:

1. Phase name.
2. Date/time.
3. Supabase connection confirmation.
4. Standards/reports reviewed.
5. User-reported issue.
6. Source investigation findings.
7. Runtime/browser/harness findings.
8. Root cause classification: BUG / PERFORMANCE GAP / NORMAL.
9. Files inspected.
10. Files modified.
11. Fix implemented, if any.
12. Contact query/cache behavior.
13. Contact mutation invalidation behavior.
14. Addresses/bank comparison if checked.
15. Safe Close / parent dirty regression.
16. Static test results.
17. Manual QA instructions for Sameer.
18. Final status.

Final status must be exactly one of:

```text
PASS — Contacts loading issue fixed and verified.
PASS WITH NOTES — Investigation completed with non-blocking notes.
FAIL — Contacts loading still has blocking issue.
BLOCKED — Could not complete due to environment/tooling blocker.
```

---

# 11. Closure Criteria

Do not proceed to 3B.7 until:

```text
Customer Contacts loading is investigated.
If it is a bug, it is fixed.
If it is normal cold latency, it is documented with proof.
If UX can be improved safely, it is improved.
typecheck passes.
build passes.
report created.
```

If browser QA is not available:

```text
PASS WITH NOTES
```

not clean PASS.

---

# 12. Stop Condition

After investigation, fix if needed, tests, and report, stop.

Do not start 3B.7.

Wait for Sameer/Dina review.

---

# Final Instruction

Investigate why Customer Contacts still feels slow.

Do not assume the plan worked.

Find the real cause.

Fix it if needed.

Create the report.

Stop.
