# PROMPT_ERP_BASE_002F_3C_4_TECHNICAL_PLAN_INTEGRATION_SIDEBAR_SELECTS_QA_READINESS

Act as a senior ERP QA lead, Supabase/PostgreSQL RLS auditor, Playwright automation engineer, Next.js runtime tester, SaaS security tester, notification-engine validation specialist, enterprise ERP solution architect, master data governance consultant, senior Next.js/Supabase implementation planner, and enterprise UI/UX navigation reviewer.

## Phase

ERP BASE 002F.3C.4 — Integration, Sidebar, Select Components, QA, and Readiness Review

## Prompt Purpose

This prompt is for TECHNICAL PLANNING ONLY.

Do not implement code.

Do not create migrations.

Do not modify database schema.

Do not modify UI files.

Do not modify server actions.

Do not start implementation.

Your task is to inspect the completed ERP BASE 002F.3C master data foundation and produce a detailed technical readiness and integration plan for 002F.3C.4.

## Required Output File

Create only this markdown report:

```text
ERP_BASE_002F_3C_4_INTEGRATION_SIDEBAR_SELECTS_QA_READINESS_PLAN.md
```

## Current Project Status

The following phases are approved and closed:

```text
002F.3C.1 — Geography & Locations
002F.3C.1A — Geography Integration Impact Plan
002F.3C.1B.1 — Organizations / Owner Companies Geography Integration
002F.3C.1B.2 — Branches Geography Integration
002F.3C.2 — Finance Basics / Commercial Readiness
002F.3C.3 — Units & Measurements
```

Now we are planning:

```text
002F.3C.4 — Integration, Sidebar, Select Components, QA, and Readiness Review
```

## Critical Objective

This phase must verify that all completed master data modules work together as one integrated ERP foundation before moving to the next ERP stage.

This phase must review:

```text
Geography & Locations
Organizations Geography Integration
Branches Geography Integration
Finance Basics
Units & Measurements
Global Lookup Engine
Sidebar / Navigation
Reusable select components
RLS / permissions
Audit logging
Master data reuse rules
Build/type/lint stability
Browser QA readiness
```

## Critical Standing Rule: Master Data First → Module Second

All future modules must reuse master data and global lookups.

No future module should hardcode:

```text
countries
regions/emirates/governorates
cities
areas/zones
ports
currencies
payment terms
tax types
banks
cost centers
profit centers
UOM categories
units of measure
payment methods
tax treatment types
bank types
cost/profit center types
status/type/category dropdowns
```

If a required value does not exist, it must be added to the correct master data or lookup system first.

---

# 1. Mandatory Sidebar UX Requirement

Sameer reported that the sidebar has become long and difficult to use.

The plan must include a dedicated sidebar UX review and fix plan.

## Required Sidebar Behavior

When the user logs in or refreshes the application:

```text
Main sidebar menus should be collapsed by default.
```

The sidebar must also have its own vertical scrollbar:

```text
The side menu should be scrollable independently from the main page content.
```

Reason:

```text
The sidebar has become long.
The user currently needs to manually close each open menu to reach lower menu items.
This is not acceptable for enterprise ERP navigation.
```

## Sidebar Requirements to Plan

The plan must define how to implement:

1. Main menu groups collapsed by default on login.
2. Main menu groups collapsed by default on browser refresh.
3. Sidebar should preserve active route visibility if practical.
4. If the current route is inside a collapsed group, either:
   - auto-open only the active group, or
   - keep all collapsed but highlight active route through breadcrumb/page header.
5. Sidebar must have vertical scroll.
6. Sidebar scroll must not scroll the entire page.
7. Sidebar height should respect viewport height.
8. Sidebar should support many modules without layout breaking.
9. User should not need to close unrelated menu groups to reach the target menu.
10. If localStorage currently keeps menus open, plan whether to:
    - reset on login/refresh, or
    - add a setting to remember menu state, or
    - default all closed and open only active group.
11. The plan must recommend the best enterprise behavior.

## Recommended Behavior to Evaluate

Preferred recommendation:

```text
On login / refresh:
- all top-level groups collapsed by default
- the active current page group may auto-expand only if needed for context
- sidebar has independent vertical scrollbar
- user can expand one group at a time if accordion behavior is preferred
```

The plan must decide whether to use:

```text
A. All groups collapsed by default
B. Active group expanded only
C. Accordion mode: opening one group closes others
D. Persist user preference in localStorage
E. Combination of active group + scroll + localStorage
```

Recommend the safest UX approach for enterprise ERP.

---

# 2. Required Source Inspection

Inspect the actual project source.

## Sidebar / Layout

Inspect:

```text
src/components/layout/app-sidebar.tsx
src/components/layout
src/app/(protected)/layout.tsx
src/app/(protected)/admin
sidebar state management files if any
localStorage sidebar persistence if any
```

Search for:

```text
sidebar
collapse
expanded
accordion
openMenus
localStorage
navGroups
scroll
overflow
ScrollArea
height
vh
```

## Completed Master Data Modules

Inspect:

```text
src/features/master-data/geography
src/features/master-data/finance-basics
src/features/master-data/uom
src/features/master-data/lookups
src/components/erp/geography
src/components/erp/finance-basics
src/components/erp/uom
src/components/erp/lookup-select.tsx
```

## Current Routes

Inspect all routes under:

```text
src/app/(protected)/admin/master-data
src/app/(protected)/admin/organizations
src/app/(protected)/admin/branches
```

## Backend / Security

Inspect:

```text
supabase/migrations
src/lib/rbac/check.ts
src/server/actions/audit.ts
src/types/database.ts
```

---

# 3. Required Report Structure

The output report must include all sections below:

1. Executive Summary
2. Scope and Non-Scope Confirmation
3. Source Inspection Summary
4. Master Data Module Inventory
5. Sidebar / Navigation UX Review
6. Sidebar Collapse and Scroll Plan
7. Reusable Select Component Inventory
8. Master Data Reuse Compliance Review
9. Cross-Module Integration Review
10. Database / Migration Health Review
11. RLS / Permission / Role Review
12. Audit Logging Review
13. Dynamic Lookup System Review
14. Browser QA Plan
15. Typecheck / Lint / Build Plan
16. Known Issues and Technical Debt
17. Recommended Fix Phasing
18. Acceptance Criteria
19. Final Recommendation
20. Next Prompt Name After Approval

Do not leave any section generic.

---

# 4. Section Details

## 1. Executive Summary

Include:

- purpose of 002F.3C.4
- why it is needed after Geography, Finance Basics, and UOM
- what will be reviewed
- what problems it should catch before future modules
- summary of sidebar issue and required UX improvement
- readiness status

## 2. Scope and Non-Scope Confirmation

### In Scope

```text
Sidebar collapse/default state
Sidebar independent scrollbar
Master data integration review
Reusable select component review
Dynamic lookup review
RLS/permission review
Audit review
Browser QA plan
Typecheck/lint/build plan
Readiness review
Focused implementation recommendations
```

### Out of Scope

```text
New business modules
CRM
Inventory
Procurement
HR
Fleet
Workshop
Accounting
Operational transactions
Changing approved database designs unless issue is found
Large redesign of the ERP UI
```

## 3. Source Inspection Summary

Create a table:

```text
Area inspected | Files/tables inspected | Findings | Impact | Recommendation
```

Include:

```text
Sidebar
Geography
Organizations
Branches
Finance Basics
UOM
Global Lookups
RLS
Permissions
Audit
Select components
Routes
Build/lint state
```

## 4. Master Data Module Inventory

List all completed master data modules and their tables/routes/select components.

Include:

### Geography

```text
countries
emirates as regions/governorates
cities
areas_zones
ports
```

### Finance Basics

```text
currencies
payment_terms
tax_types
banks
cost_centers
profit_centers
```

### UOM

```text
uom_categories
units_of_measure
uom_conversions
```

### Global Lookup

```text
global_lookup_categories
global_lookup_values
```

### Organizations/Branches Integration

```text
owner_companies geography FK fields
branches geography FK fields
legacy fallback behavior
```

## 5. Sidebar / Navigation UX Review

Analyze:

1. Current sidebar group behavior.
2. Whether menus stay expanded after refresh.
3. Whether localStorage stores expanded state.
4. Whether active route group auto-expands.
5. Whether sidebar has scroll.
6. Whether long menus overflow.
7. Whether mobile/responsive sidebar works.
8. Whether nested groups are too deep.
9. Whether role-based visibility affects menu length.
10. Whether user can reach bottom menu without closing sections.

## 6. Sidebar Collapse and Scroll Plan

This is mandatory.

Provide exact technical plan for:

```text
Collapsed-by-default behavior
Active group handling
Independent sidebar scrolling
Accordion vs multi-open behavior
LocalStorage behavior
Role-based menu rendering
Mobile behavior
Accessibility
Testing
```

Recommended decision must be clear.

Preferred recommendation:

```text
Use accordion-style top-level menu groups.
On login/refresh, all groups collapsed except active route group.
Only one top-level group open at a time.
Sidebar body has overflow-y-auto and max height calc(100vh - header/footer).
Nested groups can scroll inside sidebar.
```

But Cursor should inspect the actual code and recommend safest implementation.

## 7. Reusable Select Component Inventory

Inventory all reusable select components:

```text
CountrySelect
EmirateSelect / RegionSelect concept
CitySelect
AreaZoneSelect
PortSelect
CurrencySelect
PaymentTermSelect
TaxTypeSelect
BankSelect
CostCenterSelect
ProfitCenterSelect
UomCategorySelect
UnitOfMeasureSelect
UnitByCategorySelect
LookupSelect
```

For each component provide:

```text
Component | Source table/lookup | Filters | Active-only behavior | Edit-mode preselection | Displays name not ID | Future modules that must use it
```

## 8. Master Data Reuse Compliance Review

Check whether any completed forms still use hardcoded dropdowns or text inputs where master data exists.

Search for hardcoded:

```text
country
emirate
city
area
currency
payment term
tax type
bank
cost center
profit center
unit
kg
ton
liter
gallon
status
type
category
```

Classify findings:

```text
Compliant
Needs fix now
Defer with reason
```

## 9. Cross-Module Integration Review

Verify that:

1. Organizations use Geography master data.
2. Branches use Geography master data.
3. Finance forms use Geography and Lookup master data where applicable.
4. UOM forms use UOM categories/units properly.
5. Future modules have select components available.
6. No hardcoded values remain in completed master data forms where master data exists.

## 10. Database / Migration Health Review

Review:

```text
migration files
remote/local migration history notes
BIGINT consistency
user_profiles audit consistency
duplicate tables
unused tables
seed data integrity
constraints
indexes
triggers
RLS enabled
```

Specifically check:

```text
Finance Basics migration was applied via MCP chunks and may need migration history repair.
```

The plan must recommend how to handle migration history before future phases.

## 11. RLS / Permission / Role Review

Review permissions:

```text
master_data.geography.*
master_data.finance_basics.*
master_data.uom.*
master_data.lookups.*
organizations.*
branches.*
```

Check:

```text
system_admin full access
group_admin manage where approved
company_admin view/export where approved
branch_admin view where approved
normal users blocked from admin pages
active select data readable where needed
```

## 12. Audit Logging Review

Check audit for:

```text
create
update
activate
deactivate
lock
unlock
delete
```

Across:

```text
Geography
Finance Basics
UOM
Organizations geography integration
Branches geography integration
Lookups
```

Identify gaps.

## 13. Dynamic Lookup System Review

Confirm again:

```text
Lookup Categories dynamic
Lookup Values dynamic
Locked System Values dynamic
LookupSelect dynamic
revalidation works
new values appear after save/refresh
```

Also verify newly added Finance/UOM-related lookup categories are visible.

## 14. Browser QA Plan

Create QA checklist for all completed master data modules.

Include:

### Sidebar QA

```text
refresh app
login
all menus collapsed or active group only
sidebar scroll works
bottom menus reachable
accordion behavior works
active page highlighted
mobile sidebar works
```

### Module QA

For each module:

```text
page loads
table loads
add/edit/view
activate/deactivate
lock/unlock
delete system_admin only
selects show names not IDs
RLS/permissions
no console errors
```

## 15. Typecheck / Lint / Build Plan

Plan:

```text
npm run typecheck
npm run lint
npm run build
npm test if available
```

Need to separate:

```text
Current module errors
Legacy unrelated errors
```

## 16. Known Issues and Technical Debt

Expected items may include:

```text
full repo lint has unrelated legacy issues
finance migration history repair may be needed
some export server actions are client-side only
some org/branch select components may need reusable versions
cost/profit center branch_id depends on branch integration
browser QA pending for some modules
```

Cursor must verify actual list.

## 17. Recommended Fix Phasing

Recommend whether 002F.3C.4 should be implemented as:

```text
002F.3C.4A — Sidebar UX collapse/scroll fix
002F.3C.4B — Select component consistency fix
002F.3C.4C — Cross-module QA/RLS/audit readiness
```

or one combined implementation.

Preferred:

```text
Start with 002F.3C.4A Sidebar UX fix because it directly affects user navigation.
Then perform QA/readiness fixes.
```

## 18. Acceptance Criteria

Use future checkboxes:

```text
[ ] Sidebar collapsed by default on login/refresh
[ ] Sidebar has independent vertical scroll
[ ] User can reach bottom menus without closing other menus
[ ] Active route behavior defined and working
[ ] All master data select components inventoried
[ ] No hardcoded dropdowns where master data exists
[ ] Geography/Finance/UOM/Lookup integration verified
[ ] RLS permissions reviewed
[ ] Audit logging reviewed
[ ] Migration health reviewed
[ ] Typecheck/lint/build plan complete
[ ] Browser QA checklist complete
[ ] Next implementation prompt recommended
```

## 19. Final Recommendation

Clearly state:

```text
Is the system ready for 002F.3C.4 implementation?
What should be implemented first?
Is sidebar fix required before future modules?
Any user decisions needed?
```

## 20. Next Prompt Name After Approval

Recommend exact next prompt name.

Examples:

```text
PROMPT_ERP_BASE_002F_3C_4A_IMPLEMENT_SIDEBAR_COLLAPSE_SCROLL_FIX.md
PROMPT_ERP_BASE_002F_3C_4B_MASTER_DATA_SELECTS_QA_FIX.md
PROMPT_ERP_BASE_002F_3C_4C_FINAL_READINESS_REVIEW.md
```

## Final Status

At the end write one of:

```text
READY FOR SAMEER REVIEW — 002F.3C.4 technical plan complete.
NEEDS USER DECISION — Specific decisions required before implementation.
BLOCKED — Could not inspect source or determine safe 002F.3C.4 plan.
```

## Final Instruction

Create only:

```text
ERP_BASE_002F_3C_4_INTEGRATION_SIDEBAR_SELECTS_QA_READINESS_PLAN.md
```

Do not implement anything.
