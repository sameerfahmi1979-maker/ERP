# PROMPT_ERP_BASE_002F_3C_4C_FINAL_READINESS_REVIEW_MASTER_DATA_GATE

Act as a senior ERP QA lead, Supabase/PostgreSQL RLS auditor, Playwright automation engineer, Next.js runtime tester, SaaS security tester, notification-engine validation specialist, master-data governance reviewer, enterprise ERP solution architect, implementation readiness auditor, and production-readiness gate controller.

## Phase

ERP BASE 002F.3C.4C — Final Readiness Review / Master Data Gate

## Prompt Purpose

This is a FINAL READINESS REVIEW and QA GATE prompt.

Do not implement new modules.

Do not create migrations unless a critical blocking issue is found and explicitly documented.

Do not modify database schema unless a critical blocking issue is found.

Do not start ERP BASE 002F.3D.

Do not start Dynamic Sidebar / Menu Builder.

Do not start Branding.

Do not start People / Contacts / CRM.

Do not start HR, Fleet, Workshop, Inventory, Procurement, HSE, DMS, Scrap/Waste/Demolition, Accounting, or operational modules.

Your task is to review and validate that ERP BASE 002F.3C is ready to close as the shared master-data foundation.

## Required Output File

Create only this report:

```text
ERP_BASE_002F_3C_4C_FINAL_READINESS_REVIEW_MASTER_DATA_GATE_REPORT.md
```

## Current Status

The following phases are CLOSED:

```text
002F.3B — Global Lookup / Dropdown Engine
002F.3C.1 — Geography & Locations
002F.3C.1A — Geography Integration Impact Plan
002F.3C.1B.1 — Organizations / Owner Companies Geography Integration
002F.3C.1B.2 — Branches Geography Integration
002F.3C.2 — Finance Basics / Commercial Readiness
002F.3C.3 — Units & Measurements
002F.3C.4A — Sidebar Collapse and Scroll Fix
002F.3C.4B — Master Data Selects QA Fix
```

This phase should decide if the parent phase can be closed:

```text
002F.3C — Core UAE Shared Master Data
```

## Main Gate Objective

Confirm that all shared master data modules are ready for future ERP modules.

Review:

```text
Global Lookup Engine
Geography & Locations
Organizations Geography Integration
Branches Geography Integration
Finance Basics
Units & Measurements
Sidebar behavior
Reusable select components
Master data reuse rules
RLS and permissions
Audit logging
Build/type/lint state
Migration health
Browser QA readiness
Known limitations
Technical debt
```

## Critical Standing Rule

All future modules must reuse existing master data and global lookup values.

```text
No hardcoded dropdowns.
No duplicate master data tables.
No text fields where proper master data FK/select already exists, unless approved as legacy fallback.
If a needed value does not exist, add it to master data or global lookup first.
```

---

# 1. Required Source Inspection

Inspect all completed master data areas.

## Reports / Plans

Review available reports:

```text
ERP_BASE_002F_3B_FINAL_VERIFICATION_AND_FIX_REPORT.md
ERP_BASE_002F_3C_1_GEOGRAPHY_FULL_MODULE_AUDIT_AND_VALIDATION_REPORT.md
ERP_BASE_002F_3C_1A_GEOGRAPHY_INTEGRATION_IMPACT_PLAN.md
ERP_BASE_002F_3C_1B_1_ORGANIZATIONS_GEOGRAPHY_INTEGRATION_IMPLEMENTATION_REPORT.md
ERP_BASE_002F_3C_1B_2_BRANCHES_GEOGRAPHY_INTEGRATION_IMPLEMENTATION_REPORT.md
ERP_BASE_002F_3C_2_FINANCE_BASICS_IMPLEMENTATION_REPORT.md
ERP_BASE_002F_3C_3_UOM_IMPLEMENTATION_REPORT.md
ERP_BASE_002F_3C_4A_SIDEBAR_COLLAPSE_SCROLL_FIX_REPORT.md
ERP_BASE_002F_3C_4B_MASTER_DATA_SELECTS_QA_FIX_REPORT.md
ERP_FULL_IMPLEMENTATION_ROADMAP_PHASE_TRACKER.md
```

If file names differ, locate the equivalent reports.

## Source Folders

Inspect:

```text
src/features/master-data/lookups
src/features/master-data/geography
src/features/master-data/finance-basics
src/features/master-data/uom
src/features/organizations
src/features/branches
src/components/erp/geography
src/components/erp/finance-basics
src/components/erp/uom
src/components/erp/lookup-select.tsx
src/components/layout/app-sidebar.tsx
src/server/actions/audit.ts
src/lib/rbac/check.ts
src/types/database.ts
supabase/migrations
```

---

# 2. Required Report Structure

The report must include:

1. Phase name
2. Date
3. Executive summary
4. Gate decision: PASS / PASS WITH NOTES / FAIL
5. Files and reports reviewed
6. Master data module status summary
7. Database and migration health review
8. RLS and permissions review
9. Audit logging review
10. Reusable select components review
11. Master data reuse compliance review
12. Sidebar/navigation readiness review
13. Dynamic lookup system review
14. Browser QA result / checklist
15. Typecheck result
16. Lint result
17. Build result
18. Known limitations and accepted technical debt
19. Blocking issues, if any
20. Readiness for next phase
21. Recommended next phase
22. Final closure recommendation

---

# 3. Master Data Module Status Summary

Review and summarize:

## Global Lookups

```text
global_lookup_categories
global_lookup_values
LookupSelect
Lookup Categories page
Lookup Values page
Locked System Values page
```

## Geography

```text
countries
emirates / regions / governorates
cities
areas_zones
ports
CountrySelect
EmirateSelect
CitySelect
AreaZoneSelect
PortSelect
```

## Organizations / Branches Geography

```text
owner_companies geography FK fields
organization form cascading selects
branches geography selects / interim behavior
legacy fallback behavior
```

## Finance Basics

```text
currencies
payment_terms
tax_types
banks
cost_centers
profit_centers
finance select components
```

## UOM

```text
uom_categories
units_of_measure
uom_conversions
UomCategorySelect
UnitOfMeasureSelect
UnitByCategorySelect
```

For each module, state:

```text
Status
Routes
Tables
Select components
Known notes
Ready for future modules: Yes/No
```

---

# 4. Database and Migration Health Review

Review:

```text
BIGINT PK/FK consistency
user_profiles audit fields
set_updated_at triggers
is_active / is_locked / is_system fields
deactivation fields
unique constraints
indexes
seed data
migration history
MCP chunked migration notes
duplicate tables
unused tables
```

Specifically document:

```text
Finance Basics migration was applied via MCP chunks.
UOM migration was applied via MCP chunks if applicable.
Whether this blocks future migration work.
Recommended action if migration history repair is needed.
```

---

# 5. RLS and Permissions Review

Review permissions:

```text
master_data.lookups.*
master_data.geography.*
master_data.finance_basics.*
master_data.uom.*
organizations.*
branches.*
```

Verify role behavior:

```text
system_admin full access
group_admin manage where approved
company_admin view/export where approved
branch_admin view where approved
normal users blocked from admin pages unless allowed
active select data readable where needed
```

Confirm:

```text
RLS enabled on all master data tables
delete restricted to system_admin where intended
locked records protected
system records protected where intended
```

---

# 6. Audit Logging Review

Confirm audit coverage for:

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
Lookups
Geography
Finance Basics
UOM
Organizations
Branches
```

If any gaps exist, classify:

```text
Blocking
Non-blocking
Deferred
```

---

# 7. Reusable Select Components Review

Verify these exist and work / compile:

```text
CountrySelect
EmirateSelect
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
OwnerCompanySelect
BranchSelect
```

For each, verify:

```text
loads active records
supports edit-mode preselection
shows name/code/symbol, not ID
uses safe client/server query
does not expose service role key
handles loading/error/empty states
```

---

# 8. Master Data Reuse Compliance Review

Search completed modules for hardcoded dropdowns or text inputs where master data exists.

Search:

```text
country
emirate
region
city
area
zone
port
currency
payment term
tax type
bank
cost center
profit center
unit
uom
kg
ton
liter
gallon
box
each
payment method
bank type
tax treatment
status
type
category
```

Classify:

```text
Compliant
Fixed
Accepted legacy fallback
Deferred with reason
Blocking issue
```

Known accepted item:

```text
owner_companies.default_currency remains text but UI uses CurrencySelect and stores currency_code.
```

---

# 9. Sidebar / Navigation Readiness Review

Confirm:

```text
sidebar collapsed by default
active group auto-expands
accordion behavior works
sidebar independent scroll works
active route highlight works
all current menu items visible
no menu loss
```

Document any deferred items:

```text
dynamic sidebar/menu builder belongs to 002F.3D.1
role-based menu visibility deferred
mobile sidebar redesign deferred
localStorage persistence deferred
```

---

# 10. Browser QA Checklist

Run or prepare final QA checklist for the following.

## Lookups

```text
lookup categories
lookup values
locked system values
```

## Geography

```text
countries
regions/emirates
cities
areas/zones
ports
```

## Organizations / Branches

```text
organizations
branches
```

## Finance Basics

```text
currencies
payment terms
tax types
banks
cost centers
profit centers
```

## UOM

```text
uom categories
units of measure
uom conversions
```

For each:

```text
page loads
table loads
add
edit
view
activate/deactivate
lock/unlock where applicable
delete system_admin only
selects show names not IDs
no console errors
```

If manual browser testing is not fully performed, clearly state what was build-verified vs browser-verified.

---

# 11. Build / Type / Lint Requirements

Run:

```text
npm run typecheck
npm run lint
npm run build
npm test if available
```

If lint/typecheck has unrelated legacy or generated-file issues, separate:

```text
002F.3C master data errors:
Legacy unrelated errors:
Generated-file issues:
```

All 002F.3C blocking errors must be fixed or marked FAIL.

---

# 12. Known Limitations and Accepted Technical Debt

Review and classify known issues.

Expected possible items:

```text
Finance Basics migration applied via MCP chunks
UOM migration applied via MCP chunks
owner_companies.default_currency remains text with CurrencySelect UI
branches geography integration may be interim or text-based
role-based sidebar menu visibility deferred to 002F.3D.1
dynamic sidebar/menu builder deferred to 002F.3D.1
branding/favicon/logos deferred to 002F.3D.2
letterheads/PDF/email templates deferred to 002F.3D.3
full operational modules not started
```

For each item:

```text
Accepted / Needs fix / Blocking / Deferred
```

---

# 13. Gate Decision Rules

## PASS

Use PASS if:

```text
No blocking issues remain.
All master data modules compile/build.
RLS/permissions are acceptable.
Select components are available.
Known limitations are acceptable/deferred.
The system is ready to close 002F.3C.
```

## PASS WITH NOTES

Use PASS WITH NOTES if:

```text
Minor non-blocking technical debt exists.
Manual browser QA is partial but no blocking issue found.
```

## FAIL

Use FAIL if:

```text
Build/typecheck fails due to 002F.3C code.
RLS/security issue is found.
Major master data select issue remains.
Sidebar/navigation blocks use.
Any critical master data table/page is broken.
```

---

# 14. Required Final Recommendation

The report must clearly state:

```text
Can 002F.3C be closed?
Is the system ready for 002F.3D?
What is the next recommended phase?
```

Expected next phase after 002F.3C closure:

```text
002F.3D.1A — Dynamic Sidebar / Menu Builder Technical Plan
```

Then:

```text
002F.3D.2 — App Branding, Identity, Favicon, Logos
002F.3D.3 — Letterheads, Print/PDF, and Email Templates
```

## Final Status Line

At the end write exactly one:

```text
PASS — ERP BASE 002F.3C Core UAE Shared Master Data is ready to close.
PASS WITH NOTES — ERP BASE 002F.3C Core UAE Shared Master Data is acceptable with minor non-blocking notes.
FAIL — ERP BASE 002F.3C Core UAE Shared Master Data requires correction before closure.
```

## Final Instruction

Review and report only.

Do not start 002F.3D.

Do not implement new modules.

Create only:

```text
ERP_BASE_002F_3C_4C_FINAL_READINESS_REVIEW_MASTER_DATA_GATE_REPORT.md
```
