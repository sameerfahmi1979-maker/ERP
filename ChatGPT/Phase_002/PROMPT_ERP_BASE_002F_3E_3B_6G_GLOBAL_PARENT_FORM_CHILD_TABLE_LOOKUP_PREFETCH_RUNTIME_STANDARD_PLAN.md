# PROMPT_ERP_BASE_002F_3E_3B_6G_GLOBAL_PARENT_FORM_CHILD_TABLE_LOOKUP_PREFETCH_RUNTIME_STANDARD

Act as Fable 5 inside Cursor.

Use your strongest deep runtime reasoning as a senior ERP architecture agent, React/Next.js 16 performance engineer, TanStack Query architect, Supabase query optimization reviewer, browser runtime profiler, enterprise form UX architect, child-table data model reviewer, Safe Close regression tester, and future-module standards designer.

## Phase

ERP BASE 002F.3E.3B.6G — Global Parent Form, Child Table, and Lookup Prefetch Runtime Standard

## Prompt Purpose

This is a controlled ARCHITECTURE + AUDIT + IMPLEMENTATION PLAN prompt.

Do **not** implement yet unless explicitly instructed after the plan is approved.

The purpose is to create a global ERP runtime standard for all current and future parent forms that contain:

```text
tabs
child tables
embedded child CRUD sections
lookup-heavy sections
combobox-heavy fields
documents/attachments sections
contact/address/bank/detail rows
future HR/Fleet/Workshop/Inventory/Project child records
```

The current Customer drawer revealed an important performance/UX issue:

```text
When opening Edit Customer, lookup fields appear one by one:
Customer Type, Industry Type, Customer Segment, Lead Source, etc.
```

This is not a functional failure, but it is not acceptable as the final enterprise ERP behavior.

We need a global rule so every current and future module opens fast and professionally.

---

# 1. Important Context

Already completed:

```text
3B.2 — Global Combobox Foundation
3B.3 — Required Field Markers + ERPFormFooter
3B.4 — Safe Close / Unsaved Changes
3B.5 — Global Form Runtime QA
3B.6A — Global Combobox/Form Performance Audit Plan
3B.6B — Global Lookup Cache and Hook Standard
3B.6C — ERPCombobox Runtime / Dirty Integration
3B.6D — Apply Optimized Hooks to Current Forms
3B.6E — Lazy-Load Drawer Tabs and Child Sections
3B.6F — Global Performance Runtime QA Closure Gate
```

Important lessons from previous phases:

```text
Source review alone is not enough.
Safe Close failed until runtime behavior was actually tested.
Do not assume; verify in real browser or realistic harness.
Do not optimize Customer only; build global ERP rules.
Do not unmount FormData-dependent fields unless save logic is safe.
```

---

# 2. The Global Runtime Standard We Need

For every ERP parent form, the app must follow this rule:

```text
Parent form opens fast.
Visible/default tab fields load first.
Lookup-heavy visible fields are prefetched/cached so they do not appear one-by-one slowly.
Hidden tabs do not load heavy child tables until opened.
Child tables fetch only when their tab is opened and parent ID exists.
Child table data uses TanStack Query cache where appropriate.
Comboboxes use cached hooks and must mark Safe Close dirty.
Save / Save & Close must not regress.
Unmounted sections must not cause FormData data loss.
Future modules must follow the same pattern automatically.
```

This must become a formal app rule and implementation blueprint, not a Customer-only patch.

---

# 3. Strict Scope

## In Scope

Create a deep technical plan for:

```text
global parent form runtime standard
lookup prefetch strategy
child table lazy fetch standard
parent record + default tab load strategy
visible-field preloading
hidden-tab lazy mount
TanStack Query child-table cache standard
FormData data-loss prevention rules
future module form architecture
Customer form as first reference implementation candidate
current modules audit
future modules rules
runtime QA strategy
implementation phase split
```

## Current modules/forms to audit

```text
Customer
Organizations
Branches
Roles
Users
Numbering Rules
Geography
Finance Basics
UOM
Lookup Categories / Lookup Values
```

## Future modules to plan for

```text
HR / Employees
Fleet / Vehicles / Equipment
Workshop / Service Jobs
Spare Parts / Inventory
Projects
Procurement
Sales / CRM
Documents / DMS
Tasks
AI Center
```

## Out of Scope

Do not implement code now.

Do not create migrations.

Do not modify database schema.

Do not create new modules.

Do not start Customer final QA.

Do not build DMS.

Do not build Global Search.

Do not build AI Center.

Do not do a visual redesign.

---

# 4. Mandatory Supabase Connection First

Connect to the live ERP Supabase project:

```text
https://mmiefuieduzdiiwnqpie.supabase.co
```

Use the correct ERP Supabase connection/tool. Previous work found one Supabase plugin was connected to a different weighing/industrial system. Use the actual ERP project.

Verify current tables relevant to parent/child/runtime forms:

```text
customers
customer_contacts
customer_addresses
customer_bank_details
owner_companies
branches
roles
user_profiles
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
uom_categories
units_of_measure
uom_conversions
cost_centers
profit_centers
```

No database changes are expected.

Report must state:

```text
Connected to live Supabase project: https://mmiefuieduzdiiwnqpie.supabase.co
No database schema changes were made for 3B.6G planning.
```

If Supabase connection is unavailable or wrong, continue source audit but document it clearly.

---

# 5. Mandatory Files and Reports to Read

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
ERP_BASE_002F_3E_3B_6F_GLOBAL_COMBOBOX_FORM_PERFORMANCE_RUNTIME_QA_CLOSURE_GATE_REPORT.md
ERP_BASE_002F_3E_3B_4C_SAFE_CLOSE_RUNTIME_INVESTIGATION_AND_FIX_REPORT.md
ERP_BASE_002F_3E_3B_5_GLOBAL_FORM_RUNTIME_QA_AND_STANDARD_CLOSURE_GATE_REPORT.md
```

Read source files:

```text
src/components/erp/erp-drawer-form.tsx
src/components/erp/erp-form-footer.tsx
src/components/erp/combobox/erp-combobox.tsx
src/components/erp/lookup-select.tsx
src/hooks/use-form-dirty.ts
src/hooks/lookups/*
src/lib/query/*
src/lib/lookups/option-mappers.ts
src/lib/query/invalidation.ts
src/features/master-data/customers/components/customer-form-drawer.tsx
src/features/master-data/customers/components/customer-contacts-section.tsx
src/features/master-data/customers/components/customer-addresses-section.tsx
src/features/master-data/customers/components/customer-bank-details-section.tsx
src/features/**/components/*form*.tsx
```

Use actual paths if different.

---

# 6. Required Source Audit

Run source searches:

```bash
grep -R "ERPDrawerForm" -n src/features src/components
grep -R "ERPDrawerSection" -n src/features src/components
grep -R "lazyMount" -n src
grep -R "useQuery" -n src/hooks src/features src/components
grep -R "useEffect" -n src/features | grep -E "Contacts|Addresses|Bank|load|get|fetch"
grep -R "new FormData" -n src/features src/components
grep -R "customer_contacts" -n src
grep -R "customer_addresses" -n src
grep -R "customer_bank_details" -n src
grep -R "LookupSelect" -n src/features src/components
grep -R "CountrySelect" -n src/features src/components
grep -R "useLookupBatchQuery" -n src
grep -R "prefetchQuery" -n src
grep -R "queryClient" -n src
```

Create audit matrices.

---

# 7. Key Questions to Answer

## 7.1 Parent form open behavior

For Customer and all current forms:

```text
What loads before drawer opens?
What loads immediately after drawer opens?
Which queries are triggered by visible fields?
Which queries are triggered by hidden tabs?
Which fields appear one by one?
Can lookup data be prefetched before opening?
Can drawer open with skeleton until Basic tab lookups are ready?
Can cache be warmed on row hover/click/Edit button click?
```

## 7.2 Lookup prefetch

Answer:

```text
Which lookup categories does Customer Basic tab need?
Can we batch prefetch these categories using useLookupBatchQuery?
Can Customer Type / Industry / Segment / Lead Source / Status / ICV Status load together?
Can Country / Currency / Payment Term / Tax Type be prefetched together through queryClient.prefetchQuery?
Should prefetch happen when Customer menu loads, row list loads, or when user clicks Edit?
```

## 7.3 Child table runtime

For Customer:

```text
contacts: fetch trigger?
addresses: fetch trigger?
bank details: fetch trigger?
documents placeholder: heavy or light?
Are child records fetched only when tab opens?
Do they use manual useState/server actions or TanStack Query?
Should child sections use TanStack Query by parent id?
Should child data remain cached after closing/reopening drawer?
Should cache invalidate after adding/editing/deleting child row?
```

## 7.4 FormData risk

For all forms:

```text
Which sections contain uncontrolled FormData fields?
Which sections can safely lazy-mount?
Which sections must remain mounted until save logic is refactored?
Is save logic patch-style or full payload overwrite?
Could unmounted fields become null?
```

## 7.5 Future modules rule

For future HR/Fleet/Workshop/Inventory forms:

```text
How should parent record load?
How should child tables load?
How should documents/attachments load?
How should lookup-heavy fields be prefetched?
How should entity search fields behave?
How should Safe Close work with lazy child tables?
```

---

# 8. Required Global Architecture Proposal

Design a standard named:

```text
Global Parent Form Runtime Standard
```

It must define:

## 8.1 Parent Form Opening Phases

Recommended phases:

```text
Phase A — Open shell immediately
Phase B — Load parent record if edit/view
Phase C — Prefetch default/visible tab lookups
Phase D — Render default tab when essential lookups are ready
Phase E — Lazy-load non-visible tabs
Phase F — Lazy-fetch child tables only when tab opens and parent id exists
```

Define when to show:

```text
drawer skeleton
field skeleton
combobox loading
disabled child sections
empty placeholders
```

## 8.2 Lookup prefetch standard

Define rules:

```text
Default/Basic tab lookups must be prefetched together.
Common lookup categories can be batch-prefetched.
Master lists use TanStack Query cached hooks.
Dependent lookups load after parent selection.
Entity search fields use future server-search standard.
```

For Customer, propose exact categories:

```text
CUSTOMER_TYPES
CUSTOMER_INDUSTRY_TYPES
CUSTOMER_SEGMENTS
CUSTOMER_LEAD_SOURCES
PARTY_STATUS_TYPES
ICV_STATUS_TYPES
```

Adjust exact category codes based on actual source.

## 8.3 Child table standard

Define:

```text
Child table does not fetch until tab first opens.
Child table requires parent id.
Add mode child tab shows Save parent first.
Edit/View mode child table uses TanStack Query keyed by parent id.
Child create/update/delete invalidates only that child query.
Child tables preserve local row state while drawer remains open.
```

## 8.4 Lazy mount standard

Define:

```text
Safe-to-lazy sections:
- child tables
- documents/attachments placeholder
- audit/display-only sections
- sections with fully controlled state or patch-safe save logic

Unsafe-to-lazy sections:
- uncontrolled FormData sections that overwrite missing values
```

## 8.5 Cache/prefetch standard

Define:

```text
queryClient.prefetchQuery on drawer open or row action
staleTime rules
child table cache keys
lookup batch keys
invalidation rules
```

## 8.6 Future module standard

Define a checklist every future module must follow:

```text
parent form sections classification
lookup category declaration
child tables declaration
prefetch list
lazy-mount safe/unsafe sections
child query keys
mutation invalidation
runtime QA checklist
```

---

# 9. Required Current Module Audit Matrix

Produce these matrices.

## 9.1 Current Parent/Child Forms Matrix

Columns:

```text
Module | Parent Form | Child Tables/Sections | Current Fetch Pattern | Current Risk | Recommended Standard
```

Include at minimum:

```text
Customer
Organization
Branch
Numbering Rule
Geography forms
Finance forms
UOM forms
Lookup forms
```

## 9.2 Customer Lookup Prefetch Matrix

Columns:

```text
Field | Current Component | Lookup Category/Table | Current Load Pattern | Prefetch Method | Priority
```

## 9.3 Child Table Runtime Matrix

Columns:

```text
Child Section | Parent ID Required | Current Fetch | Proposed Query Key | Proposed Invalidations | Lazy Rule
```

## 9.4 FormData Lazy Safety Matrix

Columns:

```text
Form | Section | Has FormData Inputs? | Lazy Safe? | Reason | Required Future Refactor
```

## 9.5 Future Module Rule Matrix

Columns:

```text
Future Module | Parent Form | Expected Child Tables | Lookup Prefetch Need | Child Query Strategy | Notes
```

---

# 10. Required Implementation Split

At the end propose implementation phases.

Recommended:

```text
3B.6G.1 — Global Parent Form Runtime Standard Document + Utility Interfaces
3B.6G.2 — Customer Basic Tab Lookup Prefetch and Batch Lookup Wiring
3B.6G.3 — Customer Child Tables TanStack Query Migration
3B.6G.4 — Generic Child Table Query/Invalidation Pattern
3B.6G.5 — Apply Standard to Existing Forms with Child/Heavy Sections
3B.6G.6 — Runtime QA and Closure Gate
```

Adjust if source audit suggests better.

Do not implement in this phase.

---

# 11. Required Testing Strategy

Define future tests:

```text
Customer edit opens without one-by-one lookup loading.
Customer Basic tab fields render together or with clean skeleton.
Customer child tables do not fetch until tab opens.
Reopening same customer uses cache.
Adding/editing/deleting contact invalidates only contacts query.
Safe Close works after lookup-only edit and child-table interaction.
Save/Save & Close no regression.
No data loss from unmounted sections.
```

Include performance targets:

```text
drawer shell visible <300ms
Basic lookup batch ready <500ms on cold load where possible
warm-cache edit open feels instant
child tab fetch only on activation
no duplicate lookup category fetch inside one drawer session
```

---

# 12. Required Report

Create:

```text
ERP_BASE_002F_3E_3B_6G_GLOBAL_PARENT_FORM_CHILD_TABLE_LOOKUP_PREFETCH_RUNTIME_STANDARD_PLAN.md
```

Report must include:

1. Phase name.
2. Date/time.
3. Supabase connection confirmation.
4. Standards/reports reviewed.
5. Source files inspected.
6. Current issue explanation.
7. Current module audit.
8. Customer lookup prefetch analysis.
9. Child table runtime analysis.
10. FormData lazy safety analysis.
11. Global Parent Form Runtime Standard.
12. Future module rule/checklist.
13. Implementation phase split.
14. Runtime testing strategy.
15. Risks and assumptions.
16. Final recommendation.
17. Final status.

Final status must be exactly one of:

```text
PASS — Global parent form / child table / lookup prefetch runtime standard plan completed.
PASS WITH NOTES — Plan completed with non-blocking unknowns.
FAIL — Plan incomplete or missing major areas.
BLOCKED — Could not complete due to missing source/access.
```

---

# 13. Stop Condition

After writing the plan report, stop.

Do not implement code.

Do not start 3B.6G.1.

Wait for Sameer/Dina review.

---

# Final Instruction

Use Fable 5 deep reasoning.

Do not patch Customer only.

Create the global app rule for parent forms, child tables, lookup prefetch, and future modules.

Produce the plan report.

Stop.
