# PROMPT_ERP_BASE_002F_3B_IMPLEMENT_GLOBAL_LOOKUP_DROPDOWN_ENGINE

Act as a senior ERP QA lead, Supabase/PostgreSQL RLS auditor, Playwright automation engineer, Next.js runtime tester, SaaS security tester, notification-engine validation specialist, enterprise ERP solution architect, master data governance consultant, and senior Next.js/Supabase implementation engineer.

## Phase

ERP BASE 002F.3B — Global Lookup / Dropdown Engine Implementation

## Implementation Mode

This is an IMPLEMENTATION prompt.

You must implement the approved technical plan now.

Do not only analyze.

Do not only create a report.

Do not create a prototype only.

Do not skip database/RLS/permissions/UI.

Do not start any other master data phase.

## Required Reference Plan

Use the corrected technical implementation plan as the source of truth:

`ERP_BASE_002F_3B_GLOBAL_LOOKUP_DROPDOWN_ENGINE_TECHNICAL_IMPLEMENTATION_PLAN_REV1.md`

The implementation must follow that plan, with the additional corrections and guardrails in this prompt.

## Important Final Corrections To Apply During Implementation

### Correction 1 — Acceptance Criteria Are Future Checklist Items

The REV1 technical plan Section 18 used `[x]` checkboxes, but this was a planning document, not an implementation report.

During implementation report generation, do not treat those items as already completed unless you actually implemented and tested them.

In the implementation report, use accurate status markers:

- ✅ completed and tested
- ⚠️ completed with notes
- ❌ not completed
- ⏳ deferred / future enhancement

Do not claim completion without evidence.

### Correction 2 — Service Role / Dropdown Read Safety

The plan allows active lookup values to be loaded by normal valid ERP users for dropdown usage.

If service role is used to bypass restrictive RLS for form dropdown loading:

1. Service role usage must remain server-side only.
2. Never expose service role key to frontend.
3. Normal users must receive only active lookup categories/values.
4. Inactive lookup values must not be returned to normal users unless explicitly allowed and permission-checked.
5. Admin management pages still require:
   - `master_data.lookups.view`
   - `master_data.lookups.manage`
   - `master_data.lookups.lock`
6. Create/edit/deactivate/lock/export/audit actions must always enforce permissions.
7. Do not create broad unsafe write policies.
8. Do not use unrestricted public write access.
9. Follow the existing project RLS/authentication pattern after inspecting it.

## Project Context

The ERP is in BASE 002 foundation stage.

Approved implementation sequence:

1. 002F.3B — Global Lookup / Dropdown Engine
2. 002F.3C — Core UAE Shared Master Data
3. 002F.3D — Organization / Branch Completion
4. 002F.3E — People / Contacts / CRM Foundation
5. 002F.3F — HR Master Data
6. 002F.3G — Fleet / Equipment Master Data
7. 002F.3H — Workshop / Inventory / Procurement Master Data
8. 002F.3I — Basic HSE / DMS / Compliance Master Data
9. 002F.3J — Scrap / Waste / Demolition Master Data
10. 002F.3K — Master Data QA / Permissions / Readiness Gate

This prompt is only for:

**ERP BASE 002F.3B — Global Lookup / Dropdown Engine**

## Approved Scope of 002F.3B

Implement only:

1. Master Data Dashboard basic page.
2. Global Lookup Categories.
3. Global Lookup Values.
4. Locked System Values.
5. Parent/child lookup value support.
6. Active/inactive lookup values.
7. System locked values.
8. Sort order.
9. English and Arabic labels.
10. Optional color/icon/badge metadata.
11. Default value flag.
12. Effective date readiness.
13. Metadata JSON for future flexibility.
14. Reusable `LookupSelect` component.
15. Lookup loading service/server action.
16. Permissions.
17. RLS policies.
18. Audit logging.
19. Sidebar integration.
20. Export support if the existing export engine is stable.
21. Initial seed lookup categories and values.
22. Technical tests.
23. Final implementation report.

## Explicitly Out of Scope

Do not implement:

- Countries
- Emirates
- Cities
- Areas / Zones
- Ports
- Currencies
- Payment Terms
- Tax Types
- Banks
- UOM Categories
- Units of Measure
- UOM Conversions
- Owner company enhancement
- Branch enhancement
- Persons
- CRM
- HR
- Fleet
- Workshop
- Inventory
- Procurement
- HSE
- DMS
- Scrap / Waste / Demolition
- Accounting module
- Finance module
- Advanced import engine
- Hardcoded dropdown migration from existing modules

These are later phases.

## Required Implementation Deliverables

You must create or modify all required files.

At minimum, produce:

1. Database migration file.
2. Server actions/services.
3. TypeScript types and validation schemas.
4. React hooks.
5. Reusable `LookupSelect` component.
6. Lookup Categories table and drawer form.
7. Lookup Values table and drawer form.
8. Master Data Dashboard page.
9. Lookup Categories page.
10. Lookup Values page.
11. Locked System Values page.
12. Sidebar/menu integration.
13. Permission seed.
14. RLS policies.
15. Audit logging.
16. Seed lookup categories and values.
17. Build/typecheck/lint/test verification.
18. Implementation report.

## Required Implementation Report

Create this file after implementation:

`ERP_BASE_002F_3B_GLOBAL_LOOKUP_DROPDOWN_ENGINE_IMPLEMENTATION_REPORT.md`

The report must include:

1. Phase name.
2. Date.
3. Summary of implementation.
4. Confirmation that this was implementation, not planning.
5. Files created.
6. Files modified.
7. Database migration created.
8. Tables created.
9. Constraints created.
10. Indexes created.
11. Triggers created.
12. Functions created.
13. Seed categories created.
14. Seed values created.
15. Permissions created.
16. Role assignments created.
17. RLS policies created.
18. Audit logging implemented.
19. Admin pages created.
20. Sidebar/menu changes.
21. Reusable LookupSelect component.
22. Export implementation status.
23. Import placeholder status.
24. Service role / dropdown read safety explanation.
25. Tests performed.
26. RLS/security validation.
27. Known limitations.
28. Deferred items.
29. Final status.

At the end, write one of:

- PASS — ERP BASE 002F.3B is implemented and ready for Sameer review.
- PASS WITH NOTES — Implemented but minor non-blocking notes remain.
- FAIL — Must correct before review.

Do not proceed to 002F.3C automatically.

---

# 1. Source Inspection Before Implementation

Before making changes, inspect and confirm:

## Database / Supabase

- Existing migrations.
- Existing BIGINT PK pattern.
- Existing `set_updated_at()` trigger.
- Existing `user_profiles`, `roles`, `permissions`, `role_permissions`.
- Existing RLS helper functions.
- Existing RLS policy style.
- Existing audit log table.
- Existing permission seed style.
- Existing numbering engine migration.
- Existing organization/branch migrations.

## Frontend / Next.js

- Existing admin route structure.
- Existing protected route structure.
- Existing sidebar/menu implementation.
- Existing ERP drawer form component.
- Existing ERP data table component.
- Existing ERP page header component.
- Existing export menu component.
- Existing server actions pattern.
- Existing Zod validation pattern.
- Existing numbering module implementation.
- Existing organization/branch implementation.

Follow existing project conventions wherever they exist.

Do not invent a different architecture if the project already has a pattern.

---

# 2. Database Migration Requirements

Create a migration file using the project naming convention, for example:

`supabase/migrations/YYYYMMDDHHMMSS_erp_base_002f3b_global_lookup_engine.sql`

## 2.1 Table: global_lookup_categories

Create table:

`public.global_lookup_categories`

Required fields:

- id BIGINT generated by default as identity primary key
- category_code text not null unique
- category_name_en text not null
- category_name_ar text
- description text
- module_code text
- category_scope text default 'GLOBAL'
- supports_hierarchy boolean default false
- supports_color boolean default false
- supports_icon boolean default false
- supports_effective_dates boolean default false
- supports_metadata boolean default true
- is_system boolean default false
- is_locked boolean default false
- is_active boolean default true
- sort_order integer default 0
- created_at timestamptz default now()
- created_by bigint references user_profiles(id) if compatible
- updated_at timestamptz default now()
- updated_by bigint references user_profiles(id) if compatible
- deactivated_at timestamptz
- deactivated_by bigint references user_profiles(id) if compatible
- deactivation_reason text

Required constraints:

- category_code uppercase
- category_code format `^[A-Z0-9_]+$`
- category_scope allowed values: GLOBAL, COMPANY, BRANCH, MODULE
- deactivation consistency if practical
- unique category_code

Required indexes:

- category_code
- module_code
- is_active
- is_system
- is_locked
- sort_order

Required trigger:

- updated_at trigger using existing `set_updated_at()` function.

Required comments:

- Add table and important column comments.

## 2.2 Table: global_lookup_values

Create table:

`public.global_lookup_values`

Required fields:

- id BIGINT generated by default as identity primary key
- category_id bigint not null references global_lookup_categories(id) on delete restrict
- value_code text not null
- value_label_en text not null
- value_label_ar text
- description text
- parent_value_id bigint references global_lookup_values(id) on delete restrict
- color_hex text
- icon_name text
- badge_variant text
- sort_order integer default 0
- is_default boolean default false
- is_system boolean default false
- is_locked boolean default false
- is_active boolean default true
- effective_from date
- effective_to date
- metadata_json jsonb default '{}'::jsonb
- created_at timestamptz default now()
- created_by bigint references user_profiles(id) if compatible
- updated_at timestamptz default now()
- updated_by bigint references user_profiles(id) if compatible
- deactivated_at timestamptz
- deactivated_by bigint references user_profiles(id) if compatible
- deactivation_reason text

Required constraints:

- unique(category_id, value_code)
- value_code uppercase
- value_code format `^[A-Z0-9_]+$`
- direct self-parent is not allowed
- parent value must belong to same category
- color_hex valid format if provided
- effective_to >= effective_from
- deactivation consistency if practical

Required indexes:

- category_id
- parent_value_id where not null
- is_active
- is_system
- is_locked
- is_default
- effective_from/effective_to
- category_id + sort_order

Required trigger:

- updated_at trigger using existing `set_updated_at()` function.

Required validation function:

- Create a function/trigger to ensure `parent_value_id` belongs to the same category.
- Prevent direct self-reference.
- Deep circular reference prevention can be deferred but must be documented.

## 2.3 Do Not Create These Tables Now

Do not create now:

- global_lookup_usage_map
- global_lookup_import_batches

Document them as future enhancements only.

---

# 3. Seed Lookup Categories and Values

Seed only foundation categories and values.

Do not seed hundreds of values.

Seed these categories:

1. STATUS_TYPES
2. PRIORITY_LEVELS
3. APPROVAL_STATUS_TYPES
4. RECORD_VISIBILITY_TYPES
5. YES_NO_TYPES
6. PHONE_TYPES
7. EMAIL_TYPES
8. ADDRESS_TYPES
9. GENDER_TYPES
10. RELATIONSHIP_TYPES
11. DOCUMENT_STATUS_TYPES
12. RISK_LEVELS
13. SEVERITY_LEVELS

All seed categories and values should be:

- is_system = true
- is_locked = true
- is_active = true

Use idempotent insert patterns:

- `ON CONFLICT DO NOTHING`
- or equivalent safe seed logic.

Seed English and Arabic labels where available.

Use color/badge metadata for status/priority/risk/severity values where appropriate.

Do not seed geography values such as emirates/cities in this phase.

Do not seed module-specific HR/Fleet/CRM/HSE values beyond foundation proof categories listed above.

---

# 4. Permissions Requirements

Add exactly these 7 permissions:

```text
master_data.dashboard.view
master_data.lookups.view
master_data.lookups.manage
master_data.lookups.lock
master_data.lookups.import
master_data.lookups.export
master_data.lookups.audit_view
```

Use the existing permissions table pattern.

Assign permissions:

## system_admin

All 7 permissions.

## group_admin

- master_data.dashboard.view
- master_data.lookups.view
- master_data.lookups.manage
- master_data.lookups.export
- master_data.lookups.audit_view

## company_admin

- master_data.dashboard.view
- master_data.lookups.view
- master_data.lookups.export

## branch_admin

- master_data.lookups.view

If role codes differ in the existing system, inspect and map correctly.

Do not create broad role grants to normal users.

Normal users can load active lookup values through the safe form dropdown service, but they should not access master data admin pages unless given permissions.

---

# 5. RLS Requirements

Enable RLS on:

- global_lookup_categories
- global_lookup_values

Follow existing project RLS style.

The REV1 plan found the project uses `TO authenticated`; however, verify this again before implementation.

If the source confirms `TO authenticated`, use it.

If existing source requires another custom/anon pattern, follow that pattern safely.

## Admin Page RLS

Admin management access:

- SELECT for users with `master_data.lookups.view`
- INSERT for users with `master_data.lookups.manage`
- UPDATE for users with `master_data.lookups.manage`
- UPDATE locked rows only if user has `master_data.lookups.lock`
- DELETE blocked completely

## Normal Dropdown Read Access

Normal valid ERP users must be able to load active lookup values in forms.

Implement this safely.

Preferred approach:

- Use a server action/service function that validates the user is a valid ERP user.
- Return only active lookup categories/values for normal form usage.
- Keep service role server-side only if used.
- Never expose service role key to frontend.
- Do not return inactive values to normal users.
- Do not return management metadata unnecessarily to normal users.

Admin pages still require `master_data.lookups.view`.

Write operations still require manage/lock permissions.

---

# 6. Audit Requirements

Use existing audit log pattern.

Log:

## Category actions

- create_category
- update_category
- activate_category
- deactivate_category
- lock_category
- unlock_category

## Value actions

- create_value
- update_value
- activate_value
- deactivate_value
- lock_value
- unlock_value
- set_default_value
- reorder_values

## Export

- export_lookups if existing audit/export pattern supports it.

Do not fake audit if existing helper is unavailable; instead implement compatible audit or document limitation clearly.

---

# 7. Server Actions / Services Requirements

Create server actions following existing project style.

Suggested file:

`src/server/actions/master-data/lookups.ts`

or follow the existing folder convention.

Required actions:

## Categories

- listLookupCategories
- getLookupCategoryById
- createLookupCategory
- updateLookupCategory
- toggleLookupCategoryStatus
- toggleLookupCategoryLock

## Values

- listLookupValues
- getLookupValueById
- createLookupValue
- updateLookupValue
- toggleLookupValueStatus
- toggleLookupValueLock
- setDefaultLookupValue
- reorderLookupValues

## Form Dropdown Service

- getActiveLookupValuesByCategoryCode
- or adapt `listLookupValues` safely for this use

Must:

- authenticate user
- return only active values for normal users
- support categoryCode
- support parentValueCode filtering
- support English/Arabic labels
- order by sort_order
- use cache/revalidation strategy if project supports it

## Export

- exportLookupData if existing export engine supports it.

## Import Placeholder

- importLookupData should either not exist or return “Future enhancement” safely.
- UI must not show an active import workflow.

For every mutation:

- validate input
- check permissions
- respect locked rows
- log audit
- revalidate relevant pages

---

# 8. TypeScript Types and Validation

Create files following project convention, likely:

- `src/features/master-data/lookups/types.ts`
- `src/features/master-data/lookups/validation.ts`
- `src/features/master-data/lookups/lib.ts`

Required types:

- LookupCategory
- LookupValue
- CreateLookupCategoryInput
- UpdateLookupCategoryInput
- CreateLookupValueInput
- UpdateLookupValueInput

Required Zod validation:

## Category validation

- category_code required
- category_code uppercase
- category_code only A-Z, 0-9, underscore
- category_name_en required
- category_name_ar optional
- category_scope enum
- module_code optional
- sort_order integer
- category_code immutable on update

## Value validation

- category_id required
- value_code required
- value_code uppercase
- value_code only A-Z, 0-9, underscore
- value_label_en required
- value_label_ar optional
- color_hex valid if provided
- effective_to after effective_from
- value_code and category_id immutable on update
- parent value same category checked server-side/database-side

---

# 9. React Hooks and LookupSelect

Create reusable lookup component.

Suggested files:

- `src/components/erp/lookup-select.tsx`
- `src/features/master-data/lookups/hooks/use-lookup-values.ts`
- `src/features/master-data/lookups/hooks/use-lookup-categories.ts`

If the project does not use React Query/SWR, do not add a new dependency without checking. Use existing project data-fetching pattern.

If React Query/TanStack Query exists, use it.

If not, use a lightweight hook with useEffect/useState and server action.

## LookupSelect Required Props

- categoryCode
- value
- onValueChange
- placeholder
- disabled
- required
- includeInactive
- parentValueCode
- language
- showCode
- showColor
- allowClear
- className
- name
- error

## Required Behavior

- load active values by category code
- show loading state
- show error state
- show empty state
- sort by sort_order
- support English label by default
- support Arabic label readiness
- support color badge
- support parent/child filtering
- do not require master_data.lookups.view for normal form dropdown usage
- do not expose inactive values unless permission allows

---

# 10. UI Pages and Components

Use existing ERP UI patterns.

Use:

- ERPPageHeader
- ERPDataTable
- ERPDrawerForm
- ERPDrawerSectionNav
- ERPDrawerBody
- ERPDrawerSection
- ERPFieldGrid
- ERPDrawerFooter
- ERPExportMenu if stable

## 10.1 Master Data Dashboard

Route:

`/admin/master-data`

Permission:

`master_data.dashboard.view`

Cards:

- total lookup categories
- total lookup values
- active values
- inactive values
- locked system values
- recently updated values

Quick links:

- Lookup Categories
- Lookup Values
- Locked System Values

Do not overbuild dashboard.

## 10.2 Lookup Categories Page

Route:

`/admin/master-data/lookups/categories`

Permission:

`master_data.lookups.view`

Features:

- table
- search
- filters:
  - active/inactive
  - system/custom
  - locked/unlocked
  - module_code
- add category
- view category
- edit category
- deactivate/reactivate
- lock/unlock
- export if stable

Drawer sections:

1. Basic Information
2. Scope and Behavior
3. Status and Governance
4. Audit Information

## 10.3 Lookup Values Page

Route:

`/admin/master-data/lookups/values`

Permission:

`master_data.lookups.view`

Features:

- category selector/filter
- table
- search
- filters:
  - category
  - active/inactive
  - system/custom
  - locked/unlocked
  - parent value
  - default
- add value
- view value
- edit value
- deactivate/reactivate
- lock/unlock
- set default
- reorder values if practical
- export if stable

Drawer sections:

1. Basic Information
2. Hierarchy and Display
3. Effective Dates and Metadata
4. Status and Governance
5. Audit Information

## 10.4 Locked System Values Page

Route:

`/admin/master-data/lookups/system`

Permission:

`master_data.lookups.view`

Purpose:

- filtered view of system/locked categories and values
- warning banner
- read-only for normal admins
- edit only with lock permission if allowed

---

# 11. Sidebar / Menu Integration

Modify existing sidebar/menu configuration.

Add only these active menu items now:

```text
Administration
└── Master Data
    ├── Master Data Dashboard
    └── Global Lookups
        ├── Lookup Categories
        ├── Lookup Values
        └── Locked System Values
```

Do not add all future master data groups yet.

Future groups remain planned but hidden/not implemented.

Sidebar visibility:

- Master Data group visible only if user has a relevant master_data permission.
- Lookup menu visible only if user has `master_data.lookups.view`.
- Add/edit buttons visible only if user has manage permission.
- Lock/unlock visible only if user has lock permission.
- Export visible only if user has export permission.
- Import hidden/disabled as future enhancement.

---

# 12. Export / Import

## Export

Implement if existing export engine is stable.

Export:

- lookup categories
- lookup values
- filtered results if table export supports it

Respect permission:

`master_data.lookups.export`

If export engine integration is not stable, document it and leave as future.

## Import

Do not implement full import.

Seed permission:

`master_data.lookups.import`

UI:

- hidden or disabled
- label: Future enhancement
- no active upload flow

Implementation report must confirm import is not implemented.

---

# 13. Testing Requirements

Run and report:

## Database tests

- migration applies
- tables exist
- constraints work
- indexes exist
- triggers work
- seed data exists
- RLS enabled
- RLS policies created

## Permission tests

- system_admin permissions
- group_admin permissions
- company_admin permissions
- branch_admin permissions
- user without permission blocked from admin pages
- normal valid ERP user can load active dropdown values in forms

## RLS tests

- admin read allowed with view permission
- write blocked without manage
- locked row update blocked without lock
- delete blocked
- normal dropdown service returns only active values

## UI tests

- dashboard loads
- categories page loads
- values page loads
- locked system values page loads
- add/edit/view drawer works
- filters work
- search works
- set default works
- deactivate/reactivate works
- lock/unlock works
- LookupSelect loads values
- LookupSelect works for normal user
- import button hidden/disabled
- export works if implemented

## Build tests

Run available commands:

- npm run typecheck
- npm run lint
- npm run build
- npm test if available
- Playwright if available

If any command is unavailable or fails due to pre-existing unrelated issues, document clearly.

---

# 14. Known Limitations To Document

Document these in the implementation report:

1. Deep circular hierarchy detection is not implemented unless safely added.
2. Import is future-only placeholder.
3. Usage tracking table is not implemented.
4. Existing hardcoded dropdowns are not migrated yet.
5. Countries/Emirates/UOM/Finance/CRM/HR/Fleet/HSE/Scrap are later phases.

---

# 15. Implementation Acceptance Criteria

Use accurate status markers in the final report.

Do not use `[x]` unless actually completed.

Final report must confirm:

- database migration completed
- tables created
- seed data created
- permissions created
- role permissions assigned
- RLS policies implemented
- audit logging implemented
- dashboard created
- categories page created
- values page created
- locked values page created
- LookupSelect created
- sidebar integrated
- export implemented or clearly deferred
- import clearly deferred
- tests run
- security reviewed

---

# 16. Final Implementation Report Status

At the end of the report, write:

```text
ERP BASE 002F.3B is ready for Sameer review.
```

Then status:

- PASS
- PASS WITH NOTES
- FAIL

Do not proceed to 002F.3C automatically.

Wait for Sameer review and approval.

## Final Instruction

Implement ERP BASE 002F.3B now according to this prompt and the corrected REV1 technical plan.

Generate the required implementation report.

Do not start 002F.3C.
