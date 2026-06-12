# PROMPT_ERP_BASE_002F_3C_3_TECHNICAL_IMPLEMENTATION_PLAN_UNITS_MEASUREMENTS

Act as a senior ERP QA lead, Supabase/PostgreSQL RLS auditor, Playwright automation engineer, Next.js runtime tester, SaaS security tester, notification-engine validation specialist, enterprise ERP solution architect, UAE business compliance analyst, master data governance consultant, inventory/procurement/fleet/workshop UOM specialist, and senior Next.js/Supabase implementation planner.

## Phase

ERP BASE 002F.3C.3 — Units & Measurements Technical Implementation Plan

## Prompt Purpose

This prompt is for TECHNICAL IMPLEMENTATION PLANNING ONLY.

Do not implement code.

Do not create migration files.

Do not modify database schema.

Do not create UI screens.

Do not modify application source files.

Do not start implementation.

Your task is to inspect the existing ERP source code and produce a deep, detailed, implementation-ready technical plan for:

```text
ERP BASE 002F.3C.3 — Units & Measurements
```

The next step after Sameer approves your technical implementation plan will be a separate implementation prompt.

## Required Output File

Create only this markdown file:

```text
ERP_BASE_002F_3C_3_UNITS_MEASUREMENTS_TECHNICAL_IMPLEMENTATION_PLAN.md
```

This report must be complete, detailed, and implementation-ready.

## Current Project Status

The following phases are approved/closed:

```text
ERP BASE 002F.3B — Global Lookup / Dropdown Engine
ERP BASE 002F.3C.1 — Geography & Locations
ERP BASE 002F.3C.1A — Geography Integration Impact Plan
ERP BASE 002F.3C.1B.1 — Organizations / Owner Companies Geography Integration
ERP BASE 002F.3C.1B.2 — Branches Geography Integration
ERP BASE 002F.3C.2 — Finance Basics / Commercial Readiness
```

Finance Basics browser testing passed by Sameer and is approved.

Now we are planning:

```text
ERP BASE 002F.3C.3 — Units & Measurements
```

## Approved Master Data Sub-Phase Sequence

The approved sequence is:

```text
002F.3C.1 — Geography & Locations — CLOSED
002F.3C.2 — Finance Basics / Commercial Readiness — CLOSED
002F.3C.3 — Units & Measurements — CURRENT PLANNING PHASE
002F.3C.4 — Integration, Sidebar, Select Components, QA, and Readiness Review
```

Do not change this sequence unless there is a critical technical reason.

## Critical Standing Rule: Master Data First → Module Second

For this phase and all future ERP phases:

```text
All modules must reuse existing master data and global lookup values.
No hardcoded dropdowns.
No duplicate master data tables.
If a needed dropdown/value is missing, add it to the correct master data or global lookup area first.
```

This must be included in the plan, implementation sequence, and acceptance criteria.

## Critical User Context

Sameer’s ERP is UAE-based and must support:

- transport
- fleet
- workshop
- inventory
- procurement
- CRM
- scrap trading
- demolition
- waste management
- equipment rental
- weighbridge / weight-based operations later
- diesel measured in gallons
- lengths in centimeters or meters
- scrap/material weight in kg/tons
- quantities and packaging units for procurement/inventory
- future item master and stock movement
- future commercial offers and billing

Therefore UOM master data must be strong, reusable, and not hardcoded.

## Approved Scope of 002F.3C.3

Plan implementation for Units & Measurements only.

## Dedicated Tables to Plan

1. `uom_categories`
2. `units_of_measure`
3. `uom_conversions`

## Optional Lookup Categories to Evaluate

Use existing lookup engine only:

```text
global_lookup_categories
global_lookup_values
```

Evaluate whether we need:

```text
UOM_SYSTEM_TYPES
UOM_FORMULA_TYPES
UOM_ROUNDING_METHODS
```

But do not add optional lookup categories unless genuinely useful.

## Explicitly Out of Scope

Do not implement or plan detailed build for:

```text
inventory item master
stock transactions
purchase orders
sales orders
invoices
weighbridge transactions
fuel management transactions
fleet module
workshop module
CRM transactions
scrap/waste/demolition operational modules
accounting module
pricing engine
unit costing engine
barcode/packaging engine
batch/lot tracking
import engine
```

Mention future integration only.

---

# 1. Required Source Inspection

Before writing the plan, inspect the actual source code.

Review:

## Existing Master Data Foundations

```text
global_lookup_categories
global_lookup_values
countries / emirates / cities / areas_zones / ports
currencies / payment_terms / tax_types / banks / cost_centers / profit_centers
```

## Existing UI / Backend Patterns

Inspect:

```text
src/features/master-data/geography
src/features/master-data/finance-basics
src/features/master-data/lookups
src/components/erp/geography
src/components/erp/finance-basics
src/components/erp/lookup-select.tsx
src/components/layout/app-sidebar.tsx
src/app/(protected)/admin/master-data
src/server/actions/audit.ts
src/lib/rbac/check.ts
```

## Existing Foundation

Inspect:

```text
user_profiles
roles
permissions
role_permissions
audit_logs
RLS helper functions
current_user_profile_id()
current_user_has_permission()
current_user_has_permission_any_scope()
current_user_has_permission_in_company()
current_user_has_permission_in_branch()
current_user_has_role()
set_updated_at trigger
```

Use existing project conventions.

Do not invent a new architecture.

---

# 2. Required Final Report Structure

The output file must include all sections below:

1. Executive Summary
2. Scope and Non-Scope Confirmation
3. Source Code Inspection Summary
4. UOM Design Principles
5. Dedicated Table Decision Matrix
6. Database Schema Plan
7. Lookup Categories Plan
8. UAE / ALGT Business Compatibility Review
9. Permissions and Role Assignment Plan
10. RLS Policy Plan
11. Global Admin Full Access Plan
12. Audit Logging Plan
13. Server Actions / Services Plan
14. Validation Plan
15. UI / Screen Plan
16. Reusable Select Component Plan
17. Seed Data Plan
18. Sidebar / Menu Plan
19. File Creation / Modification Plan
20. Implementation Sequence Plan
21. Testing Plan
22. Risk Analysis and Mitigation
23. Acceptance Criteria
24. Future Integration Notes
25. Final Recommendation

Do not summarize critical sections.

Do not say “implementation details to be done later”.

Make it detailed enough to generate the next implementation prompt safely.

---

# 3. Required Design Decisions

The plan must answer these questions clearly:

1. Should UOM code be globally unique or unique per category?
2. How do we handle Liter under Volume and Fuel?
3. Should Fuel be its own category or a sub-use of Volume?
4. Should diesel gallons use imperial gallon or US gallon?
5. Do we need both GAL_IMP and GAL_US?
6. What is the base unit per category?
7. How are conversions calculated?
8. Should conversions be stored as factor-to-base on `units_of_measure`, or in `uom_conversions`, or both?
9. Should cross-category conversions be allowed?
10. How do we prevent duplicate/reverse conversion mistakes?
11. Should units be system/locked?
12. Which units are UAE/ALGT required now?
13. How will future inventory/procurement/fleet/workshop modules consume UOM?
14. How will UOM work with scrap/weight bridge later?
15. How do we avoid hardcoded units in future modules?

---

# 4. Recommended UOM Design Direction to Evaluate

Strongly evaluate this safer model:

## uom_categories

Stores categories like:

```text
WEIGHT
LENGTH
VOLUME
AREA
FUEL
TIME
COUNT
PACKAGING
```

## units_of_measure

Stores units inside a category.

Important recommendation:

```text
unit_code should be unique per category, not globally, unless the same unit must be globally unique.
```

Recommended unique constraint:

```text
unique(uom_category_id, unit_code)
```

This avoids conflicts if similar symbols/codes appear in different contexts.

## Base unit model

Each category should have one base unit:

```text
WEIGHT → KG
LENGTH → M
VOLUME → L
AREA → M2
FUEL → GAL_IMP or L, decision required
TIME → HOUR
COUNT → EA
PACKAGING → BOX or EA, decision required
```

The plan must recommend the best base units for UAE/ALGT.

## Conversion strategy

Recommended approach:

```text
units_of_measure.conversion_factor_to_base
```

handles normal same-category conversions.

Example:

```text
T in WEIGHT: 1000 KG
G in WEIGHT: 0.001 KG
CM in LENGTH: 0.01 M
MM in LENGTH: 0.001 M
```

Use `uom_conversions` only for:

```text
special conversions
cross-category conversions if allowed
legacy conversion exceptions
future packaging conversions
item-specific conversions later
```

The plan must clearly decide this.

---

# 5. Required Database Schema Planning

For each table include:

- purpose
- table name
- columns
- data types
- primary key
- foreign keys
- unique constraints
- check constraints
- indexes
- triggers
- seed data
- RLS summary
- permissions summary
- audit actions
- UI route
- select component
- global admin behavior

## 5.1 uom_categories

Recommended fields:

```text
id BIGINT identity PK
category_code
category_name_en
category_name_ar
description_en
description_ar
base_unit_id nullable initially or resolved after units created
is_system
is_locked
is_active
sort_order
audit/deactivation fields
```

Important:

If `base_unit_id` creates circular dependency with units, plan either:

1. Create category first, create units, then update category base_unit_id, or
2. Put `is_base_unit` on units only and skip base_unit_id on category.

Recommend safest approach.

## 5.2 units_of_measure

Recommended fields:

```text
id BIGINT identity PK
uom_category_id FK
unit_code
unit_name_en
unit_name_ar
symbol
conversion_factor_to_base
is_base_unit
decimal_places
allow_fraction
is_system
is_locked
is_active
sort_order
audit/deactivation fields
```

Rules:

```text
one base unit per category
conversion_factor_to_base > 0
base unit conversion factor = 1
unique(uom_category_id, unit_code)
```

## 5.3 uom_conversions

Recommended fields:

```text
id BIGINT identity PK
from_uom_id FK
to_uom_id FK
conversion_factor
conversion_formula_code optional
is_bidirectional
notes
is_system
is_locked
is_active
sort_order
audit/deactivation fields
```

Rules:

```text
from_uom_id <> to_uom_id
unique(from_uom_id, to_uom_id)
conversion_factor > 0 if formula is factor
avoid duplicate reverse pair if bidirectional
```

Plan whether this table is required in first implementation or can be included with minimal records.

---

# 6. Required UOM Categories and Seed Units

Plan seed data with UAE/ALGT relevance.

## WEIGHT

Base recommendation:

```text
KG
```

Required units:

```text
KG
T
G
LB
```

Optional:

```text
MT if different naming from T
```

## LENGTH

Base:

```text
M
```

Required units:

```text
M
CM
MM
KM
IN
FT
```

## VOLUME

Base:

```text
L
```

Required units:

```text
L
ML
M3
GAL_US
GAL_IMP
```

## FUEL

Decision needed:

Option A:

```text
Fuel category base = GAL_IMP because UAE diesel in user system is measured in gallons.
```

Option B:

```text
Fuel category base = L for technical conversion, while diesel operational default = GAL_IMP.
```

The plan must recommend one.

Given Sameer’s UAE fleet system uses diesel measured in gallons, strongly consider:

```text
FUEL base = GAL_IMP
include L with conversion factor
include GAL_US for clarity
```

## AREA

Base:

```text
M2
```

Required:

```text
M2
CM2
FT2
KM2
```

## TIME

Base:

```text
HOUR
```

Required:

```text
MIN
HOUR
DAY
MONTH
YEAR
```

## COUNT

Base:

```text
EA
```

Required:

```text
EA
PCS
SET
PAIR
DOZEN
```

## PACKAGING

Base decision needed.

Required units may include:

```text
BOX
BAG
BUNDLE
ROLL
DRUM
PALLET
CONTAINER
```

Plan carefully because packaging conversions may later become item-specific.

Recommendation likely:

```text
Create packaging category but do not define universal conversion factors except base = EA or PACK.
Item-specific conversions are future inventory phase.
```

---

# 7. Permissions Plan

Use:

```text
master_data.uom.view
master_data.uom.manage
master_data.uom.export
master_data.uom.audit_view
```

Role assignment:

```text
system_admin: all
group_admin: view/manage/export/audit_view
company_admin: view/export
branch_admin: view
normal users: no admin page access by default
```

Normal users may later read active units through safe select services when used in business forms.

---

# 8. RLS Plan

Use actual project RLS helpers.

Policy strategy:

## SELECT

```text
is_active = true
OR current_user_has_permission('master_data.uom.view')
```

## INSERT

```text
current_user_has_permission('master_data.uom.manage')
```

## UPDATE

```text
current_user_has_permission('master_data.uom.manage')
AND (not is_locked OR current_user_has_role('system_admin'))
```

## DELETE

```text
system_admin only
```

Do not create unsafe public write policies.

---

# 9. Server Actions Plan

Plan files/functions.

Expected file:

```text
src/features/master-data/uom/actions.ts
```

Functions:

## UOM Categories

```text
getUomCategories
getUomCategoryById
createUomCategory
updateUomCategory
deleteUomCategory
toggleUomCategoryStatus
toggleUomCategoryLock
exportUomCategories
getActiveUomCategoriesForSelect
```

## Units of Measure

```text
getUnitsOfMeasure
getUnitOfMeasureById
createUnitOfMeasure
updateUnitOfMeasure
deleteUnitOfMeasure
toggleUnitOfMeasureStatus
toggleUnitOfMeasureLock
exportUnitsOfMeasure
getActiveUnitsForSelect
getActiveUnitsByCategoryForSelect
```

## UOM Conversions

```text
getUomConversions
getUomConversionById
createUomConversion
updateUomConversion
deleteUomConversion
toggleUomConversionStatus
toggleUomConversionLock
exportUomConversions
calculateUomConversion if safe/planning only
```

For this phase, conversion calculation can be basic and master-data-level only.

---

# 10. UI Plan

Routes:

```text
/admin/master-data/uom/categories
/admin/master-data/uom/units
/admin/master-data/uom/conversions
```

Menu:

```text
Master Data
└── Units & Measurements
    ├── UOM Categories
    ├── Units of Measure
    └── UOM Conversions
```

Pages must follow existing patterns:

```text
ERPPageHeader
ERPDataTable
ERPDrawerForm
status badges
system/locked badges
row actions
delete confirmation
export if available
```

Forms:

## UOM Category form

Fields:

```text
category_code
category_name_en
category_name_ar
description
status/system/locked/sort
```

## Unit form

Fields:

```text
category
unit_code
unit_name_en
unit_name_ar
symbol
conversion_factor_to_base
is_base_unit
decimal_places
allow_fraction
description
status/system/locked/sort
```

## Conversion form

Fields:

```text
from_uom
to_uom
conversion_factor
formula code if used
is_bidirectional
notes
status/system/locked/sort
```

---

# 11. Reusable Select Components Plan

Create:

```text
UomCategorySelect
UnitOfMeasureSelect
UnitByCategorySelect
UomConversionSelect if needed
```

Expected files:

```text
src/components/erp/uom/uom-category-select.tsx
src/components/erp/uom/unit-of-measure-select.tsx
src/components/erp/uom/unit-by-category-select.tsx
src/components/erp/uom/index.ts
```

Components must:

1. Load active records.
2. Show name/code/symbol, not ID.
3. Support preselected value in edit mode.
4. Support filters by category.
5. Support disabled/loading/empty/error states.
6. Not expose service role key.

---

# 12. Future Integration Notes Required

Explain how UOM supports:

```text
Inventory item master
Procurement quantity
Purchase orders
Goods receipt
Stock movements
Workshop job cards
Fleet fuel management
Diesel gallons
Weighbridge weight tickets
Scrap trading by kg/ton
Demolition material quantities
Equipment rental time units
CRM quotations
Billing line items
```

Include examples:

```text
Scrap weight: KG / T
Diesel: GAL_IMP
Pipe length: M / CM
Concrete volume: M3
Manpower/equipment rental: HOUR / DAY / MONTH
Inventory count: EA / PCS / BOX
```

---

# 13. Testing Plan

Include:

## Database tests

- tables created
- constraints work
- one base unit per category
- conversion factor validation
- unique unit per category
- RLS enabled
- permissions seeded
- seed data inserted

## UI tests

- all pages load
- add/edit/view drawers work
- lock/unlock works
- delete system_admin only
- category filter works
- selected units display name/symbol, not ID

## Conversion tests

- 1 T = 1000 KG
- 1 KG = 1000 G
- 1 M = 100 CM
- 1 M3 = 1000 L
- 1 GAL_IMP = 4.54609 L
- 1 GAL_US = 3.78541 L
- HOUR/DAY conversion

## Build tests

```text
npm run typecheck
npm run lint
npm run build
npm test if available
```

---

# 14. Risk Analysis

Include risks:

```text
wrong gallon standard
duplicate unit codes
confusing Volume vs Fuel units
packaging conversions incorrectly treated as universal
conversion rounding errors
RLS too strict
RLS too loose
hardcoded units in future modules
deleting system units
base unit not enforced
conversion cycles
future item-specific packaging conversions
```

For each risk include impact, likelihood, mitigation.

---

# 15. Acceptance Criteria

Use future checkboxes:

```text
[ ] Technical plan approved
[ ] BIGINT PK/FK planned
[ ] user_profiles audit fields planned
[ ] actual RLS helpers planned
[ ] one main migration recommended
[ ] no hardcoded units
[ ] UOM categories planned
[ ] units planned
[ ] conversions planned
[ ] seed data planned
[ ] permissions planned
[ ] RLS planned
[ ] UI pages planned
[ ] select components planned
[ ] future modules must reuse UOM
[ ] implementation prompt name recommended
```

---

# 16. Final Recommendation

End with:

```text
READY FOR SAMEER REVIEW — Units & Measurements technical plan complete.
```

or:

```text
NEEDS USER DECISION — Specific decisions required before implementation.
```

or:

```text
BLOCKED — Could not inspect source or determine safe UOM plan.
```

If ready, recommend next prompt:

```text
PROMPT_ERP_BASE_002F_3C_3_IMPLEMENT_UNITS_MEASUREMENTS.md
```

## Final Instruction

Create only:

```text
ERP_BASE_002F_3C_3_UNITS_MEASUREMENTS_TECHNICAL_IMPLEMENTATION_PLAN.md
```

Do not implement.
Do not create migrations.
Do not modify app files.
