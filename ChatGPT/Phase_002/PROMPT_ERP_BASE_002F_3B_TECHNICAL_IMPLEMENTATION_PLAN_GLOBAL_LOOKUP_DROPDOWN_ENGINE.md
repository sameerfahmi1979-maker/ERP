# PROMPT_ERP_BASE_002F_3B_TECHNICAL_IMPLEMENTATION_PLAN_GLOBAL_LOOKUP_DROPDOWN_ENGINE

Act as a senior ERP QA lead, Supabase/PostgreSQL RLS auditor, Playwright automation engineer, Next.js runtime tester, SaaS security tester, notification-engine validation specialist, enterprise ERP solution architect, master data governance consultant, and senior Next.js/Supabase implementation planner.

## Phase

ERP BASE 002F.3B — Global Lookup / Dropdown Engine Technical Implementation Plan

## Prompt Purpose

This prompt is for **technical implementation planning only**.

Do not implement code.

Do not create migration files.

Do not modify database schema.

Do not create UI screens.

Do not change existing source files.

Do not start coding.

Your task is to inspect the existing ERP source code and produce a deep, detailed, implementation-ready technical plan for ERP BASE 002F.3B.

The next step after Sameer approves your technical implementation plan will be a separate implementation prompt.

## Required Output File

Create only this markdown file:

`ERP_BASE_002F_3B_GLOBAL_LOOKUP_DROPDOWN_ENGINE_TECHNICAL_IMPLEMENTATION_PLAN.md`

This file must be detailed enough that implementation can be done smoothly, safely, and fully in the next prompt.

## Project Context

The ERP is in the BASE 002 foundation stage.

The approved master data implementation sequence is:

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

This phase must focus only on:

**ERP BASE 002F.3B — Global Lookup / Dropdown Engine**

## Important User Decisions

Sameer confirmed:

1. Do not implement the accounting module now.
2. Finance Basics only will be implemented later.
3. HSE will be basic only later.
4. CRM will be implemented later.
5. Master data will be implemented in phases.
6. Master data sidebar/menu must be hierarchical and professional.
7. Master data must be UAE-compatible.
8. Master data must integrate with the roles and permissions module.
9. Every master data screen must have permissions and RLS.
10. Future autonumbering must use the existing ERP BASE 002F.2 Global Numbering System.
11. Normal document numbers must remain simple like EMP-0001, PO-0001, INV-0001.

## Current ERP Foundation To Inspect

Before writing the technical plan, inspect the existing source code and identify actual files, patterns, and constraints.

Inspect:

### Database / Supabase

- Existing Supabase migration files.
- Existing table naming convention.
- Existing BIGINT PK strategy.
- Existing audit fields.
- Existing RLS policy style.
- Existing permission tables and seed patterns.
- Existing role/permission assignment patterns.
- Existing audit log table and helper functions.
- Existing updated_at triggers.
- Existing owner_companies and branches tables.
- Existing global numbering tables.
- Existing user_profiles / roles / permissions tables.
- Existing helper functions such as current_user_has_permission or similar.

### Frontend / Next.js

- Admin route structure.
- Protected route structure.
- Sidebar/menu implementation.
- Existing admin settings pages.
- Existing numbering rules page.
- Existing organization and branch pages.
- Existing user/role/permission pages.
- Existing global ERPDrawerForm component.
- Existing ERPDataTable component.
- Existing ERPPageHeader component.
- Existing ERPExportMenu component.
- Existing StatusBadge component.
- Existing Select/dropdown components.
- Existing form validation patterns.
- Existing Zod schemas.
- Existing server actions patterns.
- Existing Supabase client usage.

### Existing Hardcoded Dropdowns

Search for hardcoded dropdowns/constants that 002F.3B must prepare to replace later, such as:

- active / inactive / suspended
- status arrays
- priority arrays
- approval statuses
- gender
- emirates
- phone types
- email types
- address types
- risk/severity levels
- document statuses
- any select options hardcoded in components

Do not migrate them yet in this phase unless needed as seed values for the lookup engine foundation. Just document them and plan their future migration.

## Scope of 002F.3B

This phase should plan implementation for:

1. Master Data Dashboard basic page.
2. Global Lookup Categories table.
3. Global Lookup Values table.
4. Locked System Values view/filter.
5. Parent/child lookup value support.
6. Active/inactive lookup values.
7. System locked values.
8. Sort order.
9. English and Arabic labels.
10. Optional color/icon/badge metadata.
11. Default value flag.
12. Effective date readiness.
13. Metadata JSON for future flexibility.
14. Reusable LookupSelect component.
15. Lookup loading service/server action.
16. Permissions.
17. RLS policies.
18. Audit logging.
19. Sidebar integration.
20. Export support if global export engine is stable.
21. Initial seed lookup categories and values.
22. Technical tests.
23. Implementation report requirements.

## Out of Scope for 002F.3B

Do not implement or plan detailed screens for these yet:

- Countries
- Emirates
- Cities
- Areas
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
- Scrap/Waste/Demolition

You may seed basic lookup categories that will be used later, but do not implement the dedicated master data tables for those later phases.

## Required Technical Plan Sections

Your output file must include all sections below.

---

# 1. Executive Summary

Include:

- Purpose of 002F.3B.
- Why lookup/dropdown engine is the first master data implementation phase.
- What this phase will implement.
- What this phase will not implement.
- How this phase supports future master data phases.
- Readiness status for implementation.

---

# 2. Existing Source Code Inspection Summary

Create a table:

| Area | Files/Tables Inspected | Current Pattern Found | Impact on 002F.3B |
|---|---|---|---|

Include at least:

- migrations
- permissions
- RLS
- audit logs
- sidebar
- admin routes
- drawer forms
- data tables
- export menu
- server actions
- Zod validation
- Supabase client pattern
- numbering page
- organization/branch pages

---

# 3. Proposed Database Schema Plan

Plan the database schema in deep detail.

## 3.1 Table: global_lookup_categories

Define:

- Purpose
- Columns
- Data types
- Defaults
- Required fields
- Unique constraints
- Check constraints
- Indexes
- Foreign keys
- Audit fields
- Soft delete / deactivate strategy
- System locked behavior
- RLS strategy
- Seed data approach
- Usage examples

Required fields to consider:

- id BIGINT generated by default as identity primary key
- category_code text not null unique
- category_name_en text not null
- category_name_ar text
- description text
- module_code text
- category_scope text
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
- created_by bigint
- updated_at timestamptz default now()
- updated_by bigint
- deactivated_at timestamptz
- deactivated_by bigint
- deactivation_reason text

Plan whether `category_code` should be uppercase and immutable after creation.

## 3.2 Table: global_lookup_values

Define:

- Purpose
- Columns
- Data types
- Defaults
- Required fields
- Unique constraints
- Check constraints
- Indexes
- Foreign keys
- Audit fields
- Soft delete / deactivate strategy
- System locked behavior
- Parent/child behavior
- Default value behavior
- Sort order behavior
- RLS strategy
- Seed data approach
- Usage examples

Required fields to consider:

- id BIGINT generated by default as identity primary key
- category_id bigint not null references global_lookup_categories(id)
- value_code text not null
- value_label_en text not null
- value_label_ar text
- parent_value_id bigint references global_lookup_values(id)
- description text
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
- created_by bigint
- updated_at timestamptz default now()
- updated_by bigint
- deactivated_at timestamptz
- deactivated_by bigint
- deactivation_reason text

Required constraints:

- unique(category_id, value_code)
- prevent parent_value_id from referencing itself
- if parent_value_id is set, parent must belong to the same category
- only one default active value per category if practical
- check color_hex format if used
- value_code uppercase recommended

## 3.3 Optional Table: global_lookup_usage_map

Decide if it should be implemented now or planned for later.

If planned now, define:

- entity_table_name
- entity_column_name
- lookup_category_code
- lookup_value_id
- usage_count strategy
- impact analysis before deactivation

If too complex, mark for later and explain.

## 3.4 Optional Table: global_lookup_import_batches

Decide if it should be implemented now or later.

If planned later, explain that import permissions may exist now but import UI can be future-ready.

---

# 4. Required Seed Lookup Categories and Values

Plan the initial seed data for 002F.3B.

Do not seed hundreds of values.

Seed only the foundation values required to prove the engine works and support upcoming phases.

Recommended seed categories:

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

For each category, list:

- category_code
- category_name_en
- module_code
- supports_hierarchy
- supports_color
- is_system
- is_locked
- seed values
- color/badge suggestions
- sort order

Example:

STATUS_TYPES:
- ACTIVE
- INACTIVE
- SUSPENDED
- ARCHIVED

PRIORITY_LEVELS:
- CRITICAL
- HIGH
- MEDIUM
- LOW

APPROVAL_STATUS_TYPES:
- DRAFT
- PENDING_APPROVAL
- APPROVED
- REJECTED
- CANCELLED

YES_NO_TYPES:
- YES
- NO

PHONE_TYPES:
- MOBILE
- OFFICE
- HOME
- FAX
- WHATSAPP

EMAIL_TYPES:
- WORK
- PERSONAL
- BILLING
- SUPPORT

ADDRESS_TYPES:
- HEAD_OFFICE
- BRANCH
- WAREHOUSE
- YARD
- BILLING
- SHIPPING
- SITE

DOCUMENT_STATUS_TYPES:
- DRAFT
- ACTIVE
- EXPIRED
- ARCHIVED
- SUPERSEDED

Do not seed UAE geography in this phase unless it is only as lookup proof. Dedicated geography comes in 002F.3C.

---

# 5. Permissions Plan

Plan the exact permissions that must be added to the existing permissions module.

Required permissions for this phase:

- master_data.dashboard.view
- master_data.lookups.view
- master_data.lookups.manage
- master_data.lookups.import
- master_data.lookups.export
- master_data.lookups.audit_view

For each permission define:

- permission_code
- module_code
- action_code
- display_name
- description
- is_system_permission
- is_visible
- default roles to assign
- whether it is required for sidebar visibility
- whether it is required for server actions

Default role assignment plan:

- system_admin: all permissions
- group_admin: view, manage, export, audit_view
- company_admin: view, export, maybe manage if approved
- branch_admin: view only by default
- normal users: no access unless assigned

If existing role names differ, map to actual roles found in the database/source.

---

# 6. RLS Policy Plan

Create a detailed RLS strategy.

For `global_lookup_categories`:

- SELECT policy
- INSERT policy
- UPDATE policy
- DELETE policy or deactivate-only policy
- locked/system row protection

For `global_lookup_values`:

- SELECT policy
- INSERT policy
- UPDATE policy
- DELETE policy or deactivate-only policy
- locked/system row protection
- parent/child protection

Important requirements:

- Compatible with existing auth/RLS pattern.
- If the app uses anon/custom auth, follow existing project RLS style.
- Do not create unsafe public write policies.
- Normal users should not be able to modify lookup values.
- Direct deletion should be avoided; use deactivate.
- Locked system values should only be editable by system_admin or special permission if allowed.
- Audit logs should capture create/update/deactivate/reactivate.

Explain whether RLS will rely on helper functions such as `current_user_has_permission()` and how.

---

# 7. Audit Logging Plan

Plan how lookup changes will be audited.

Must capture:

- category created
- category updated
- category activated
- category deactivated
- category locked/unlocked
- value created
- value updated
- value activated
- value deactivated
- value locked/unlocked
- value sort order changed
- default value changed
- import performed if implemented
- export performed if audit supports it

Define:

- audit module_code
- entity_name
- action names
- old_values
- new_values
- performed_by
- created_at
- how server actions will call the audit function/service

---

# 8. Server Actions / Services Plan

Plan all server actions/services required.

Suggested files:

- `src/server/actions/master-data/lookups.ts`
- `src/features/master-data/lookups/types.ts`
- `src/features/master-data/lookups/validation.ts`
- `src/features/master-data/lookups/services.ts`
- or follow actual project pattern if different.

Required actions:

## Lookup Categories

- listLookupCategories
- getLookupCategoryById
- createLookupCategory
- updateLookupCategory
- deactivateLookupCategory
- reactivateLookupCategory
- lockLookupCategory
- unlockLookupCategory
- exportLookupCategories if existing export pattern requires server support

## Lookup Values

- listLookupValues
- getLookupValueById
- createLookupValue
- updateLookupValue
- deactivateLookupValue
- reactivateLookupValue
- lockLookupValue
- unlockLookupValue
- reorderLookupValues
- setDefaultLookupValue
- getLookupValuesByCategoryCode

## LookupSelect Component Service

- getActiveLookupValues(categoryCode)
- getLookupValueLabel(categoryCode, valueCode)
- support language selection if existing locale supports it
- support includeInactive only if permission allows it

For every action, define:

- input
- output
- validation
- permission check
- RLS expectation
- audit logging
- error handling
- cache/revalidation strategy if needed

---

# 9. Validation Plan

Plan Zod schemas and database constraints.

## Category Validation

- category_code required
- category_code uppercase
- category_code unique
- category_code only A-Z, 0-9, underscore
- category_name_en required
- module_code uppercase optional
- category_scope allowed values
- sort_order numeric
- locked category cannot be edited by unauthorized users

## Value Validation

- category_id required
- value_code required
- value_code uppercase
- value_code unique within category
- value_label_en required
- parent value must be same category
- color_hex valid hex if provided
- effective_to must be after effective_from
- only one active default value per category if implemented
- locked value cannot be edited by unauthorized users

---

# 10. UI / Screen Plan

Plan all screens and components.

## 10.1 Sidebar Integration

Plan menu items:

Administration
└── Master Data
    ├── Master Data Dashboard
    └── Global Lookups
        ├── Lookup Categories
        ├── Lookup Values
        └── Locked System Values

Define:

- route paths
- icons if project uses icons
- permission required
- visible from this phase
- hidden future master data groups
- active menu highlighting
- collapsed/expanded behavior

## 10.2 Master Data Dashboard

Suggested route:

`/admin/master-data`

Plan widgets/cards:

- Total lookup categories
- Total lookup values
- Active values
- Inactive values
- Locked system values
- Recently updated values
- Quick links to Lookup Categories and Lookup Values

Do not overbuild dashboard now.

## 10.3 Lookup Categories Page

Suggested route:

`/admin/master-data/lookups/categories`

Required features:

- list table
- search
- filters:
  - active/inactive
  - system/locked
  - module_code
- columns:
  - category_code
  - category_name_en
  - category_name_ar
  - module_code
  - supports_hierarchy
  - supports_color
  - is_system
  - is_locked
  - is_active
  - sort_order
  - updated_at
  - actions
- actions:
  - add
  - view
  - edit
  - deactivate
  - reactivate
  - lock/unlock
- export if existing export menu can be reused

Use existing ERPDataTable.

Use existing ERPDrawerForm.

## 10.4 Lookup Values Page

Suggested route:

`/admin/master-data/lookups/values`

Required features:

- category selector/filter
- list table
- search
- filters:
  - category
  - active/inactive
  - system/locked
  - parent value
- columns:
  - category_code
  - value_code
  - value_label_en
  - value_label_ar
  - parent_value
  - color/badge
  - sort_order
  - is_default
  - is_system
  - is_locked
  - is_active
  - updated_at
  - actions
- actions:
  - add
  - view
  - edit
  - deactivate
  - reactivate
  - lock/unlock
  - set default
  - reorder
- export if existing export menu can be reused

Use existing ERPDataTable.

Use existing ERPDrawerForm.

## 10.5 Locked System Values Page

Suggested route:

`/admin/master-data/lookups/system`

This can be:

- separate page, or
- filtered view of Lookup Values.

Plan whichever is cleaner with existing architecture.

Purpose:

- show system locked categories/values
- prevent normal editing
- allow view only unless system_admin

## 10.6 Drawer Forms

Plan drawer sections.

### Lookup Category Drawer Sections

1. Basic Information
   - category_code
   - category_name_en
   - category_name_ar
   - description

2. Scope and Behavior
   - module_code
   - category_scope
   - supports_hierarchy
   - supports_color
   - supports_icon
   - supports_effective_dates
   - supports_metadata

3. Status and Governance
   - is_system
   - is_locked
   - is_active
   - sort_order

4. Audit Information
   - created_at/by
   - updated_at/by
   - deactivated_at/by
   - deactivation_reason

### Lookup Value Drawer Sections

1. Basic Information
   - category_id
   - value_code
   - value_label_en
   - value_label_ar
   - description

2. Hierarchy and Display
   - parent_value_id
   - color_hex
   - icon_name
   - badge_variant
   - sort_order
   - is_default

3. Effective Dates and Metadata
   - effective_from
   - effective_to
   - metadata_json

4. Status and Governance
   - is_system
   - is_locked
   - is_active

5. Audit Information
   - created_at/by
   - updated_at/by
   - deactivated_at/by
   - deactivation_reason

---

# 11. Reusable LookupSelect Component Plan

Plan reusable component:

Suggested file:

`src/components/erp/lookup-select.tsx`

or:

`src/features/master-data/lookups/components/lookup-select.tsx`

Required props:

- categoryCode
- value
- onValueChange
- placeholder
- disabled
- required
- includeInactive
- parentValueCode
- moduleCode
- language
- showCode
- showColor
- allowClear
- className
- name

Required behavior:

- loads active lookup values by category_code
- respects sort_order
- supports parent/child filtering
- displays English label by default
- supports Arabic label readiness
- can display color/badge if available
- handles loading/error/empty states
- does not expose inactive values unless includeInactive allowed
- can be used in React Hook Form or standard form patterns depending on project

Plan any hooks needed:

- useLookupValues(categoryCode)
- useLookupValue(categoryCode, valueCode)
- useLookupCategories()

Plan caching/revalidation strategy if needed.

---

# 12. Export / Import Plan

For this phase:

## Export

If ERPExportMenu is stable:

- enable export for categories table
- enable export for values table

Formats:

- CSV
- Excel
- PDF if existing engine supports it

## Import

Do not fully implement import unless already easy and safe.

Plan import as future-ready:

- permission exists: master_data.lookups.import
- UI can show disabled "Import" button with "Future enhancement" if needed
- full import implementation can be later

If implementing import now is safe, describe exactly how, but do not over-scope.

---

# 13. Sidebar / Menu Modification Plan

Identify exact files likely to be modified.

Plan:

- where Master Data group will be added
- route paths
- permission checks
- active state
- future master data groups hidden until phases
- Global Lookups visible now

Must avoid adding all future menu groups fully active now.

Only show:

- Master Data Dashboard
- Global Lookups
  - Lookup Categories
  - Lookup Values
  - Locked System Values

Future groups can be defined in config as disabled/hidden if architecture supports it, but should not clutter sidebar now.

---

# 14. File Modification Plan

List expected files to create/modify.

Use actual project structure after inspection.

Expected possible files:

## Database

- `supabase/migrations/YYYYMMDDHHMMSS_erp_base_002f3b_global_lookup_engine.sql`

## Pages

- `src/app/(protected)/admin/master-data/page.tsx`
- `src/app/(protected)/admin/master-data/lookups/categories/page.tsx`
- `src/app/(protected)/admin/master-data/lookups/values/page.tsx`
- `src/app/(protected)/admin/master-data/lookups/system/page.tsx`

## Components

- `src/features/master-data/lookups/components/lookup-categories-table.tsx`
- `src/features/master-data/lookups/components/lookup-values-table.tsx`
- `src/features/master-data/lookups/components/lookup-category-drawer-form.tsx`
- `src/features/master-data/lookups/components/lookup-value-drawer-form.tsx`
- `src/features/master-data/lookups/components/lookup-dashboard-cards.tsx`
- `src/components/erp/lookup-select.tsx`

## Server Actions / Lib

- `src/server/actions/master-data/lookups.ts`
- `src/features/master-data/lookups/types.ts`
- `src/features/master-data/lookups/validation.ts`
- `src/features/master-data/lookups/lib.ts`
- `src/features/master-data/lookups/hooks/use-lookup-values.ts`

## Sidebar / Navigation

- existing sidebar config file to be identified
- existing route/menu config file to be identified

## Reports

- `ERP_BASE_002F_3B_GLOBAL_LOOKUP_DROPDOWN_ENGINE_TECHNICAL_IMPLEMENTATION_PLAN.md`
- Future implementation report:
  - `ERP_BASE_002F_3B_GLOBAL_LOOKUP_DROPDOWN_ENGINE_IMPLEMENTATION_REPORT.md`

---

# 15. Implementation Sequence Plan

Provide a step-by-step implementation sequence for the next implementation prompt.

Example:

1. Inspect existing foundation patterns.
2. Create migration.
3. Add permissions.
4. Add RLS.
5. Seed lookup categories/values.
6. Create TypeScript types.
7. Create Zod validations.
8. Create server actions.
9. Create LookupSelect.
10. Create dashboard page.
11. Create categories page/table/drawer.
12. Create values page/table/drawer.
13. Create locked values page/filter.
14. Add sidebar routes.
15. Add audit logging.
16. Add export support.
17. Run tests.
18. Produce implementation report.

For each step, list dependencies and failure risks.

---

# 16. Testing Plan

Plan exact tests.

## Database Tests

- migration applies
- tables created
- constraints work
- unique category_code enforced
- unique value_code per category enforced
- parent value same category validation works
- active/inactive works
- locked values protected
- indexes exist
- RLS enabled

## Permission Tests

- system_admin has all lookup permissions
- group_admin has expected lookup permissions
- company_admin behavior confirmed
- branch_admin behavior confirmed
- unauthorized users cannot manage
- sidebar hidden without permission

## RLS Tests

- authorized read works
- unauthorized write blocked
- locked values blocked
- direct table tampering blocked

## UI Tests

- dashboard loads
- categories page loads
- values page loads
- locked values page loads
- add category drawer opens
- edit category drawer works
- view category drawer works
- add value drawer opens
- edit value drawer works
- parent/child values work
- category filter works
- search works
- active/inactive filter works
- export works if enabled
- LookupSelect loads options

## Build Tests

- npm run typecheck
- npm run lint
- npm run build
- npm test if available
- Playwright tests if available

---

# 17. Risk Analysis

List risks and mitigations.

Include:

- risk of overbuilding import
- risk of adding too many lookup values too early
- risk of exposing system locked values for editing
- risk of unsafe RLS policies
- risk of hardcoded dropdowns remaining
- risk of menu clutter
- risk of generic lookup misuse for complex master data
- risk of performance issues if lookup loading is not cached
- risk of duplicate category/value codes
- risk of breaking existing organization/branch pages

---

# 18. Acceptance Criteria

Define exactly when 002F.3B implementation will be considered complete.

Acceptance criteria must include:

- technical plan completed and approved before implementation
- lookup schema implemented
- permissions implemented
- RLS implemented
- audit implemented
- dashboard implemented
- categories UI implemented
- values UI implemented
- locked values view implemented
- LookupSelect component implemented
- seed values created
- sidebar integrated
- tests passed
- implementation report generated
- Sameer review completed

---

# 19. Future Integration Notes

Explain how this engine will be used in future phases:

- 002F.3C geography/finance/UOM
- 002F.3E CRM dropdowns
- 002F.3F HR dropdowns
- 002F.3G fleet dropdowns
- 002F.3H workshop/inventory/procurement dropdowns
- 002F.3I HSE/DMS dropdowns
- 002F.3J scrap/waste/demolition dropdowns

Clearly explain that future phases must use LookupSelect instead of hardcoded arrays.

---

# 20. Final Recommendation

End the report with:

- readiness status
- whether implementation can start
- any decisions needed from Sameer
- exact next prompt that should be generated after approval

Final status must be one of:

- READY FOR SAMEER REVIEW — Technical plan complete.
- NEEDS USER DECISION — Specific decisions required.
- BLOCKED — Could not inspect source or plan safely.

## Important Final Instruction

Do not implement.

Do not create migrations.

Do not create pages.

Do not modify files.

Only create the technical implementation plan file:

`ERP_BASE_002F_3B_GLOBAL_LOOKUP_DROPDOWN_ENGINE_TECHNICAL_IMPLEMENTATION_PLAN.md`
