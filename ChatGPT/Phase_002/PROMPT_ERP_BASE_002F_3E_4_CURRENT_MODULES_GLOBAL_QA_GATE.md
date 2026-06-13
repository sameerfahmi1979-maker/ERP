# PROMPT_ERP_BASE_002F_3E_4_CURRENT_MODULES_GLOBAL_QA_GATE

Act as Fable 5 inside Cursor.

Use deep runtime reasoning as a senior ERP QA lead, Next.js 16 runtime tester, Supabase/RLS reviewer, enterprise UI/UX auditor, TanStack Query performance reviewer, Safe Close regression tester, permissions reviewer, and closure-gate engineer.

## Phase

ERP BASE 002F.3E.4 — Current Modules Global QA Gate

## Prompt Purpose

This is a controlled GLOBAL QA / CLOSURE GATE prompt.

Do not implement new modules.

Do not implement new features unless a blocking defect is found.

The Customer module has now been closed with notes and is the reference implementation.

This phase must verify all currently implemented modules together and decide whether the current ERP foundation is stable enough to proceed to the next business module / party-master module.

This is a global QA gate for the implemented base modules.

---

# 1. Current Modules in Scope

Audit and QA these implemented modules:

```text
Admin/System
Users
Roles
Organizations
Branches
Global Numbering Rules
Global Lookup Categories / Lookup Values
Geography Master Data
Finance Basics Master Data
UOM / Units Master Data
Customer Module
Global Form Runtime
Global Combobox / Lookup Runtime
Global Parent Form Runtime Standard
Safe Close / Unsaved Changes
RequiredLabel / ERPFormFooter
App navigation / sidebar access
Permissions / route access
```

If source reveals additional already-implemented modules, include them in the audit and report.

---

# 2. Strict Scope

## In Scope

Verify:

```text
module list pages
add/edit/view drawers/dialogs
forms and required fields
ERPCombobox / LookupSelect behavior
Save / Save & Close
Safe Close / Unsaved Changes
numbering rules
lookup and master data cache
child table runtime standard where applicable
permissions and RLS
navigation/sidebar access
route protection
build/typecheck/lint
dev harness status
known technical debt
closure readiness
```

## Out of Scope

Do not build:

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
Projects
DMS
Global Search
AI Center
Export/email new work
database migrations
new schema
major UI redesign
```

If a blocking bug is found, fix only if it is directly related to current module stability.

---

# 3. Mandatory Supabase Connection First

Before QA, connect to the live ERP Supabase project:

```text
https://mmiefuieduzdiiwnqpie.supabase.co
```

Use the correct ERP Supabase connection/tool. Previous reports found that one Supabase plugin points to an unrelated weighing/industrial project.

Verify at minimum:

```text
user_profiles
roles
permissions
role_permissions
user_roles
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
uom_categories
units_of_measure
uom_conversions
cost_centers
profit_centers
customers
customer_contacts
customer_addresses
customer_bank_details
customer_documents
```

No database schema changes are expected.

The report must state:

```text
Connected to live Supabase project: https://mmiefuieduzdiiwnqpie.supabase.co
No database schema changes were required for ERP BASE 002F.3E.4 Current Modules Global QA Gate.
```

If any table names differ, document actual live names.

If Supabase connection is wrong/unavailable, continue source QA and document clearly.

---

# 4. Mandatory Documents and Reports to Read

Read standards:

```text
docs/standards/ERP_GLOBAL_CURSOR_DEVELOPMENT_AND_IMPLEMENTATION_GUIDE.md
docs/standards/ERP_GLOBAL_UI_UX_FORM_TABLE_DRAWER_DEVELOPMENT_GUIDE.md
docs/standards/ERP_GLOBAL_PARENT_FORM_RUNTIME_STANDARD.md
```

Read latest closure reports:

```text
ERP_BASE_002F_3E_3B_7_CUSTOMER_MODULE_FINAL_QA_AND_CLOSURE_REPORT.md
ERP_BASE_002F_3E_3B_6G_6_RUNTIME_QA_CLOSURE_ORGANIZATION_BRANCH_PREFETCH_WIRING_REPORT.md
ERP_BASE_002F_3E_3B_6G_5_APPLY_STANDARD_TO_EXISTING_FORMS_FUTURE_READY_MODULES_REPORT.md
ERP_BASE_002F_3E_3B_6F_GLOBAL_COMBOBOX_FORM_PERFORMANCE_RUNTIME_QA_CLOSURE_GATE_REPORT.md
ERP_BASE_002F_3E_3B_5_GLOBAL_FORM_RUNTIME_QA_AND_STANDARD_CLOSURE_GATE_REPORT.md
ERP_BASE_002F_3E_3B_4C_SAFE_CLOSE_RUNTIME_INVESTIGATION_AND_FIX_REPORT.md
ERP_BASE_002F_3E_3B_3F_REQUIRED_FOOTER_FINAL_QA_REPORT.md
ERP_BASE_002F_3E_3B_2D_CUSTOMER_FORM_FINAL_QA_REPORT.md
```

Also read current roadmap/tracker if present:

```text
ERP_FULL_IMPLEMENTATION_ROADMAP_PHASE_TRACKER.md
ERP_BASE_FULL_PHASE_STATUS_TRACKER.md
ERP_BASE_SYSTEM_PHASES_LIST.md
```

Read source broadly:

```text
src/app/(protected)/**
src/components/erp/**
src/components/layout/**
src/features/**
src/server/actions/**
src/lib/query/**
src/hooks/**
```

Use actual paths if different.

---

# 5. Required Source Audit

Run source searches:

```bash
grep -R "ERPDrawerForm" -n src/features src/components
grep -R "ERPFormFooter" -n src/features src/components
grep -R "RequiredLabel" -n src/features src/components
grep -R "useFormDirty" -n src/features src/components
grep -R "ERPCombobox" -n src/features src/components
grep -R "LookupSelect" -n src/features src/components
grep -R "createClient" -n src/features src/components src/server
grep -R "global_numbering" -n src
grep -R "generateNextReference" -n src
grep -R "hasPermission" -n src
grep -R "getAuthContext" -n src
grep -R "revalidatePath" -n src/server/actions
grep -R "/dev/" -n src/app
grep -R "TODO\|FIXME\|placeholder\|future" -n src/features src/components | head -200
```

Create a module inventory:

```text
Module | Routes | List Component | Form Component | Server Actions | Status
```

---

# 6. Global QA Areas

## 6.1 Navigation / Sidebar / Routing

Verify:

```text
all current module routes are accessible from sidebar/menu if intended
no dead menu links
protected routes require login
current module pages load without runtime errors
dashboard/login redirect works
manual multi-open/sidebar behavior not regressed
```

## 6.2 List Pages

For every implemented module list page:

```text
data loads
empty state works
search/filter if implemented works
actions menu works
add button works if allowed
view/edit buttons work if allowed
status badges correct
no broken columns
no console/runtime errors
```

## 6.3 Forms / Drawer Standard

For each implemented form:

```text
Add/Edit footer: Cancel | Save | Save & Close
View footer: Close only
Required fields show *
Save keeps open
Save & Close closes
Safe Close works on dirty text edit
Safe Close works on combobox-only edit
View mode does not mark dirty
no horizontal scroll
footer sticky
layout consistent
```

## 6.4 Combobox / Lookup Runtime

Verify:

```text
all lookup/master-data selectors use ERPCombobox or documented enum Select exception
cached hooks are used
no direct Supabase fetch in domain selectors
combobox search/select/clear works
combobox dirty event works
dependent comboboxes behave correctly
```

## 6.5 Numbering

Verify:

```text
global numbering rules page works
numbering rule add/edit/view works
customer numbering works
customer contact numbering works
organization/branch numbering if implemented works
code fields read-only where required
no manual typing for auto-generated codes
no duplicate creation from repeated Save
```

## 6.6 Permissions / RLS / Server Actions

Verify:

```text
server actions use getAuthContext where required
server actions use hasPermission where required
mutations are permission-checked server-side
UI buttons are hidden/disabled based on permissions where implemented
RLS enabled on current module tables
no unauthorized client-side direct mutation path
system_admin-only actions protected
```

## 6.7 Query Cache / Runtime Performance

Verify:

```text
TanStack Query provider exists
lookup hooks use query keys
Customer prefetch works by source/harness
Organization/Branch prefetch wiring exists
Customer child tables use TanStack Query
child queries are lazy
query invalidation is targeted
dev harness routes are guarded or removed
```

## 6.8 FormData Safety

Verify:

```text
no lazy unmount of FormData-dependent fields
save without visiting all tabs does not wipe hidden tab data
customer fixed after Add → Save child sections unlock
organization/branch multi-section forms remain mounted due FormData risk
```

## 6.9 Dev Harness / Production Readiness

Audit dev routes:

```text
/dev/performance-qa
/dev/customer-prefetch-qa
/dev/customer-child-qa
any other /dev route
```

Decide:

```text
remove now
or retain guarded for manual QA
```

Before production deployment, they must be deleted. For this gate, at minimum confirm they return `notFound()` in production and document.

---

# 7. Runtime QA

If authenticated browser route is available, test real app for:

```text
Customer Add/Edit/View
Organization Add/Edit
Branch Add/Edit
Role Add/Edit/View
Numbering Rule Add/Edit/View
Country Add/Edit/View
Bank Add/Edit/View
UOM Unit Add/Edit/View
Lookup Category Add/Edit/View
```

If no authenticated browser session is available, use:

```text
source QA
existing dev harnesses
static build/typecheck
manual QA checklist for Sameer/Dina
```

If browser QA is unavailable, final status should be:

```text
PASS WITH NOTES
```

not clean PASS.

---

# 8. Bug Handling

Blocking bugs to fix in this phase:

```text
current module page fails to build/load
Save broken
Save & Close broken
Safe Close broken
form data loss risk
wrong query invalidation causing stale or wrong data
permission bypass
numbering duplicate/incorrect generation
typecheck/build failure
dead critical route
```

Non-blocking notes:

```text
browser auth unavailable
minor visual spacing
future placeholder tabs
DMS placeholder
sales owner picker missing
pre-existing lint
dev harness retained but guarded
```

Fix blocking bugs only. Document every fix.

---

# 9. Static Tests

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

# 10. Required Matrices

## 10.1 Module Inventory Matrix

```text
Module | Route | List | Add | Edit | View | Server Actions | Status
```

## 10.2 Form Standard Matrix

```text
Form | RequiredLabel | ERPFormFooter | Save | Save&Close | SafeClose | Combobox Dirty | Layout | Status
```

## 10.3 Permissions Matrix

```text
Module | View Permission | Manage Permission | Server Checked | UI Checked | RLS | Status
```

## 10.4 Runtime Performance Matrix

```text
Area | Cache/Prefetch | Lazy Loading | Invalidation | Status
```

## 10.5 Issues Matrix

```text
Issue | Severity | Fixed/Deferred | Notes
```

---

# 11. Required Report

Create:

```text
ERP_BASE_002F_3E_4_CURRENT_MODULES_GLOBAL_QA_GATE_REPORT.md
```

Report must include:

1. Phase name.
2. Date/time.
3. Supabase connection confirmation.
4. Standards/reports reviewed.
5. Module inventory.
6. Source audit findings.
7. Navigation/sidebar QA.
8. List page QA.
9. Form standard QA.
10. Combobox/cache QA.
11. Numbering QA.
12. Permissions/RLS QA.
13. Runtime performance QA.
14. FormData safety QA.
15. Dev harness status.
16. Bugs found.
17. Bugs fixed.
18. Bugs deferred.
19. Static test results.
20. Closure recommendation.
21. Final status.

Final status must be exactly one of:

```text
PASS — Current modules global QA gate passed and base can proceed.
PASS WITH NOTES — Gate passed with non-blocking notes.
FAIL — Blocking issues found; do not proceed.
BLOCKED — QA could not complete due to environment/tooling blocker.
```

---

# 12. Closure Criteria

Do not mark PASS unless:

```text
current modules inventoried
Customer module remains closed with notes
organization/branch modules not broken
global form runtime standards verified
numbering verified
permissions/RLS verified by source/Supabase
typecheck passes
build passes
no blocking bugs remain
report created
```

If browser QA is not possible:

```text
PASS WITH NOTES
```

not full clean PASS.

---

# 13. Stop Condition

After QA, targeted fixes if needed, tests, and report, stop.

Do not start the next module.

Wait for Sameer/Dina review.

---

# Final Instruction

Run the Current Modules Global QA Gate.

Verify all implemented base modules together.

Fix blocking defects only.

Create closure report.

Stop.
