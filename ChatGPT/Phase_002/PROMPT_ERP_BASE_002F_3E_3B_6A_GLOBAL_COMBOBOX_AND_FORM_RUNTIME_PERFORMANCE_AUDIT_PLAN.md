# PROMPT_ERP_BASE_002F_3E_3B_6A_GLOBAL_COMBOBOX_AND_FORM_RUNTIME_PERFORMANCE_AUDIT_PLAN

Act as a senior ERP performance architect, React/Next.js runtime profiler, Supabase query optimization reviewer, enterprise form-runtime engineer, combobox/search UX specialist, browser performance tester, and Cursor technical planning engineer.

## Phase

ERP BASE 002F.3E.3B.6A — Global Combobox and Form Runtime Performance Audit Plan

## Prompt Purpose

This is a controlled AUDIT / TECHNICAL PLAN prompt.

Do not implement yet.

The purpose is to audit and design a global performance optimization plan for all ERP comboboxes, lookup fields, drawer forms, and future form standards.

This phase must NOT be Customer-only.

This phase must cover:

```text
all already implemented modules and forms
all existing ERPCombobox / LookupSelect / domain wrapper usage
all current lookup-heavy forms
all future modules and forms that will use comboboxes or searchable selects
```

The goal is to create a reusable global performance architecture so future ERP modules do not repeat slow loading, repeated queries, heavy dropdown rendering, or laggy drawer behavior.

---

# 1. Current Context

The following global UI/form foundations are already implemented and closed/accepted:

```text
3B.2 — Global Combobox Foundation
3B.3 — Required Field Markers + ERPFormFooter
3B.4 — Safe Close / Unsaved Changes
3B.4C — Runtime Safe Close deep fix
3B.5 — Global Form Runtime QA and Standard Closure Gate
```

Safe Close had a runtime issue because source-only review missed portal timing. Therefore, this performance phase must consider **real runtime behavior**, not only source code review.

---

# 2. Strict Scope

## In Scope

Audit and create a technical implementation plan for:

```text
ERPCombobox
LookupSelect
domain-specific combobox wrappers
lookup loading patterns
combobox search performance
drawer opening performance
form initial render performance
tab lazy loading
child-section lazy loading
query caching
client-side memoization
server-side lookup endpoints/actions
Supabase query efficiency
future form standards for combobox-heavy modules
```

## Current Implemented Areas to Audit

```text
Customer module
Roles
Users Add/Edit
Organizations
Branches
Numbering Rules
Geography master data
Finance Basics master data
UOM master data
Lookup Categories / Lookup Values
```

## Future Modules to Plan For

The plan must define standards for future modules such as:

```text
HR
Fleet
Workshop
Spare Parts
Inventory
Projects
Sales / CRM
Procurement
Documents
Tasks
AI Center
Any future ERP master/transaction forms
```

## Out of Scope

Do not implement code.

Do not modify schema.

Do not create migrations.

Do not apply SQL.

Do not change UI behavior unless documenting a proposed fix.

Do not start 3B.6B.

Do not optimize only Customer.

---

# 3. Mandatory Supabase Connection First

Before auditing, connect to live Supabase:

```text
https://mmiefuieduzdiiwnqpie.supabase.co
```

Verify lookup and form-related tables:

```text
customers
customer_contacts
customer_addresses
customer_bank_details
roles
user_profiles
owner_companies
branches
global_numbering_rules
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
```

No database changes are expected.

The report must include:

```text
Connected to live Supabase project: https://mmiefuieduzdiiwnqpie.supabase.co
No database changes were required for 3B.6A audit planning.
```

If any table names differ from expected, document the actual live schema names.

---

# 4. Mandatory Documents and Reports to Read

Read standards:

```text
docs/standards/ERP_GLOBAL_CURSOR_DEVELOPMENT_AND_IMPLEMENTATION_GUIDE.md
docs/standards/ERP_GLOBAL_UI_UX_FORM_TABLE_DRAWER_DEVELOPMENT_GUIDE.md
```

Read latest reports:

```text
ERP_BASE_002F_3E_3B_2D_CUSTOMER_FORM_FINAL_QA_REPORT.md
ERP_BASE_002F_3E_3B_3F_REQUIRED_FOOTER_FINAL_QA_REPORT.md
ERP_BASE_002F_3E_3B_4C_SAFE_CLOSE_RUNTIME_INVESTIGATION_AND_FIX_REPORT.md
ERP_BASE_002F_3E_3B_5_GLOBAL_FORM_RUNTIME_QA_AND_STANDARD_CLOSURE_GATE_REPORT.md
```

Read current global component files:

```text
src/components/erp/erp-combobox.tsx
src/components/erp/lookup-select.tsx
src/components/erp/erp-drawer-form.tsx
src/components/erp/erp-form-footer.tsx
src/hooks/use-form-dirty.ts
```

Search for actual wrapper names and component locations if paths differ.

---

# 5. Required Source Audit

Run source searches and document results.

Use commands such as:

```bash
grep -R "ERPCombobox" -n src
grep -R "LookupSelect" -n src
grep -R "UomCategorySelect" -n src
grep -R "Select" -n src/features src/components
grep -R "useEffect" -n src/features src/components/erp
grep -R "get.*Lookup" -n src
grep -R "global_lookup_values" -n src
grep -R "supabase" -n src/features src/lib
```

Audit:

```text
all forms using ERPCombobox
all forms using LookupSelect
all forms using domain wrappers
all remaining plain Select usage
all lookup fetch functions
all duplicate lookup queries
all forms loading many lists on drawer open
all tab/child-section components loading data immediately
all server actions or client queries used for lookups
```

---

# 6. Performance Questions to Answer

The audit plan must answer:

## 6.1 Combobox Runtime

```text
Does each combobox load all options immediately?
Does it fetch on mount?
Does it fetch each time drawer opens?
Does it fetch per field separately?
Does search happen client-side or server-side?
Does typing search cause repeated un-debounced queries?
Are large lookup lists virtualized or limited?
Does the dropdown render all 250 countries / 278 lookup values at once?
```

## 6.2 Query Efficiency

```text
Are repeated Supabase queries happening for the same lookup data?
Are lookup tables cached globally?
Are server actions reused?
Are lookups filtered by category efficiently?
Are indexes needed for future large lookup tables?
Are RLS policies causing slow queries?
Are count queries unnecessary?
```

## 6.3 Drawer Opening Speed

```text
Does drawer open immediately or wait for lookup data?
Do child sections load when tab is hidden?
Does Customer drawer load contacts/addresses/banks immediately?
Do tabs lazy-load their content?
Do large forms create too many components on initial render?
Do combobox dropdowns initialize heavy state before use?
```

## 6.4 React Rendering

```text
Do forms re-render excessively when one combobox changes?
Are option arrays memoized?
Are callbacks memoized where needed?
Are lookup hooks stable?
Are field components unnecessarily recreated?
Are combobox popovers rendered only when open?
```

## 6.5 Future Module Readiness

```text
Can HR forms reuse the same lookup cache?
Can Fleet/Workshop/Inventory forms use the same combobox performance pattern?
Is there a standard rule for small enum vs large lookup?
Is there a rule for client-side vs server-side search?
Is there a global way to prefetch frequently used lookups?
```

---

# 7. Required Performance Architecture Plan

The report must propose a global architecture.

At minimum design:

## 7.1 Global Lookup Data Layer

Propose one of:

```text
global lookup cache hook
React Query / TanStack Query
Next.js cache/server action cache
SWR-style cache
Supabase query cache wrapper
custom lightweight cache
```

Decision must consider current project stack.

Plan must define:

```text
cache keys
stale time
refresh behavior
manual invalidation when master data changes
tenant/company/branch scoping
permission/RLS considerations
```

## 7.2 Combobox Loading Strategy

Define rules:

```text
small static enum lists: local constants, no DB fetch
small master lists: preloaded cached lists
medium lists: cached + client-side search
large lists: server-side search with debounce and limit
dependent lists: lazy fetch based on parent selection
```

Examples:

```text
Country list: cached globally
Emirate/City/Area: dependent lazy load by parent
Customer Type/Status: cached lookup by category
Bank list: cached or server-search if large
Inventory Item future: server-side search
Employee future: server-side search
Vehicle future: server-side search
```

## 7.3 Debounce and Search Standard

Define:

```text
minimum search length
debounce delay
max results
loading state
empty state
keyboard behavior
clear behavior
```

## 7.4 Drawer Runtime Standard

Define:

```text
drawer opens first, data loads progressively
do not block drawer open on non-critical lookup data
show skeleton/loading for sections if needed
tabs lazy-load content only when first opened
child tables lazy-load when their tab opens
do not fetch child records until record id exists
```

## 7.5 Combobox Dirty Tracking Standard

The 3B.5 report documented:

```text
combobox-only edits may not trigger useFormDirty
```

This phase must include a plan to fix it globally.

Plan must define:

```text
ERPCombobox must call markDirty or emit a standard change/input event
LookupSelect must integrate with form dirty context
domain wrappers must propagate dirty events
no per-form manual workaround unless unavoidable
```

## 7.6 Future Development Rule

Define a standard for future forms:

```text
Every new combobox must use approved global wrappers.
Every lookup field must use cached lookup hooks.
No direct Supabase lookup fetch inside form body.
No repeated lookup fetch on every drawer open unless justified.
Large searchable records must use server-side search.
Combobox changes must mark form dirty.
```

---

# 8. Required Audit Matrices

The report must include these matrices.

## 8.1 Current Combobox/Lookup Usage Matrix

Columns:

```text
Module | Form | Field | Component Used | Data Source | Loads On | Search Type | Option Size | Performance Risk | Recommendation
```

## 8.2 Plain Select Exception Matrix

Columns:

```text
Module | Form | Field | Why Plain Select Exists | Keep / Convert | Recommendation
```

## 8.3 Query Duplication Matrix

Columns:

```text
Lookup/Data | Current Fetch Locations | Duplicate Query Risk | Cache Candidate | Priority
```

## 8.4 Drawer Load Matrix

Columns:

```text
Form | Lookup Count | Child Sections | Loads Children Immediately? | Runtime Risk | Recommendation
```

## 8.5 Future Module Standard Matrix

Columns:

```text
Future Module | Expected Lookup Types | Recommended Loading Pattern | Notes
```

---

# 9. Required Implementation Phase Split

At the end, propose implementation subphases.

Recommended split:

```text
3B.6B — Implement Global Lookup Cache and Lookup Hook Standard
3B.6C — Optimize ERPCombobox / LookupSelect Runtime, Debounce, Dirty Integration
3B.6D — Apply Optimized Lookup Hooks to Current Forms
3B.6E — Lazy Load Drawer Tabs and Child Sections
3B.6F — Runtime Performance QA and Closure Gate
```

Adjust if audit suggests better split.

Do not implement these now.

---

# 10. Testing Plan for Future Implementation

Define how 3B.6 implementation will be tested.

Must include:

```text
browser runtime timing
drawer open speed
combobox open speed
combobox search speed
network request count before/after
duplicate query count before/after
safe close still works after combobox-only edits
typecheck/lint/build
```

Suggested targets:

```text
drawer opens visually under 300ms when possible
combobox opens under 150ms for cached data
search response under 300ms for medium data
large server search returns max 50 results
no duplicate lookup fetches per same category in one drawer session
```

Targets can be adjusted based on actual findings.

---

# 11. Required Report

Create:

```text
ERP_BASE_002F_3E_3B_6A_GLOBAL_COMBOBOX_AND_FORM_RUNTIME_PERFORMANCE_AUDIT_PLAN.md
```

Report must include:

1. Phase name.
2. Date/time.
3. Supabase connection confirmation.
4. Standards/reports reviewed.
5. Source files inspected.
6. Current combobox/lookup usage audit.
7. Plain Select exception audit.
8. Query duplication audit.
9. Drawer/form load audit.
10. React rendering risk audit.
11. Combobox dirty tracking gap plan.
12. Global performance architecture proposal.
13. Future module/form performance standard.
14. Implementation subphase plan.
15. Future testing plan.
16. Risks and assumptions.
17. Final recommendation.

Final status must be exactly one of:

```text
PASS — Audit and performance optimization plan completed.
PASS WITH NOTES — Audit completed with non-blocking unknowns.
FAIL — Audit incomplete or missing major areas.
BLOCKED — Audit could not be completed due to missing source/access.
```

---

# 12. Stop Condition

After producing the audit/plan report, stop.

Do not implement 3B.6B.

Wait for Sameer/Dina review.

---

# Final Instruction

Audit the full current ERP combobox/form runtime performance.

Design the global optimization plan for current and future modules.

Do not make this Customer-only.

Do not implement yet.

Create the audit/plan report and stop.
