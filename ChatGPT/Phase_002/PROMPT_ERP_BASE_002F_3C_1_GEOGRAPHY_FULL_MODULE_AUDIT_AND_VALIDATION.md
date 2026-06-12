# PROMPT_ERP_BASE_002F_3C_1_GEOGRAPHY_FULL_MODULE_AUDIT_AND_VALIDATION

Act as a senior ERP QA lead, Supabase/PostgreSQL RLS auditor, Playwright automation engineer, Next.js runtime tester, SaaS security tester, notification-engine validation specialist, senior Next.js/Supabase code reviewer, enterprise ERP master data auditor, and UAE business compliance analyst.

## Phase

ERP BASE 002F.3C.1 — Geography & Locations Full Module Audit and Validation

## Purpose

We are still in ERP BASE 002F.3C.1.

Do not start ERP BASE 002F.3C.2.

Do not implement Finance Basics.

Do not implement Units & Measurements.

Do not implement Work Sites.

Do not implement CRM, HR, Fleet, Workshop, Inventory, Procurement, HSE, DMS, Scrap/Waste/Demolition, or Accounting.

Your task is to perform a full deep audit and validation of the completed Geography & Locations module to confirm it is implemented correctly, safely, and fully before Sameer approves moving to the next phase.

This is primarily an audit and validation prompt.

If you find defects directly related to ERP BASE 002F.3C.1, fix them carefully.

If the issue is risky, architectural, or outside scope, document it clearly and do not make broad changes without approval.

## Required Output File

Create this report:

`ERP_BASE_002F_3C_1_GEOGRAPHY_FULL_MODULE_AUDIT_AND_VALIDATION_REPORT.md`

The report must be deep, detailed, and evidence-based.

## Reference Reports To Review

Review all previous 002F.3C.1 reports before auditing:

1. `ERP_BASE_002F_3C_1_GEOGRAPHY_LOCATIONS_IMPLEMENTATION_REPORT.md`
2. `ERP_BASE_002F_3C_1_GEOGRAPHY_LOCATIONS_COMPLETION_FIX_REPORT.md`
3. `ERP_BASE_002F_3C_1_GEOGRAPHY_UI_COMPLETION_REPORT.md`
4. `ERP_BASE_002F_3C_1_GEOGRAPHY_LOCK_UNLOCK_FIX_REPORT.md` if it exists

Also review the approved prompt used for implementation if available:

1. `PROMPT_ERP_BASE_002F_3C_1_IMPLEMENT_GEOGRAPHY_LOCATIONS.md`
2. `PROMPT_ERP_BASE_002F_3C_1_GEOGRAPHY_LOCATIONS_COMPLETION_FIX.md`
3. `PROMPT_ERP_BASE_002F_3C_1_GEOGRAPHY_UI_COMPLETION.md`
4. `PROMPT_ERP_BASE_002F_3C_1_GEOGRAPHY_LOCK_UNLOCK_FIX.md`

## Critical Business Rule

Sameer confirmed:

```text
Global admin / system_admin must be able to view, insert, edit, delete, lock, and unlock all geography records all the time.
```

This must be validated at:

1. Database RLS level.
2. Server action level.
3. UI visibility level.
4. Browser testing level.
5. Audit logging level.

## Approved 002F.3C.1 Scope

The approved Geography & Locations module includes only:

```text
Countries
Emirates
Cities
Areas / Zones
Ports
```

Work Sites are deferred.

Finance Basics is not part of this phase.

Units & Measurements is not part of this phase.

## Main Audit Objective

Confirm that all 002F.3C.1 module parts are:

1. Correctly implemented.
2. Connected to the correct database tables and columns.
3. Using correct RLS policies.
4. Using correct permissions and roles.
5. Using correct server actions.
6. Using correct validation schemas.
7. Using correct TypeScript types.
8. Using correct UI fields.
9. Using correct routes.
10. Using correct select components.
11. Using correct lookup categories and lookup values.
12. Using correct audit logging.
13. Using correct system_admin/global admin behavior.
14. Free from build/type/lint errors caused by this module.
15. Ready for final Sameer approval.

---

# 1. Files and Areas To Inspect

## Database Migrations

Inspect all 002F.3C.1 migrations:

```text
supabase/migrations/*002f3c1*geography*.sql
supabase/migrations/*geography_completion_fix*.sql
```

Verify all changes are correct and no duplicate/conflicting migration exists.

## Database Tables

Audit these tables fully:

```text
countries
emirates
cities
areas_zones
ports
```

For each table verify:

- columns
- data types
- primary keys
- foreign keys
- unique constraints
- check constraints
- indexes
- triggers
- comments if any
- seed data
- RLS enabled
- RLS policies
- audit fields
- deactivation fields
- global admin delete behavior

## Lookup Tables

The approved lookup engine tables are:

```text
global_lookup_categories
global_lookup_values
```

Verify Geography uses only these tables.

Do not allow references to non-existing or duplicate tables:

```text
lookup_categories
lookup_values
```

Verify lookup categories:

```text
AREA_TYPES
PORT_TYPES
```

If `SITE_TYPES` exists, confirm it is harmless/future-ready only and no Work Sites table/UI was created.

## Permissions and Roles

Audit:

```text
permissions
role_permissions
roles
user_profiles
```

Verify required permissions exist:

```text
master_data.geography.view
master_data.geography.manage
master_data.geography.export
master_data.geography.audit_view
```

Verify lock permission from 002F.3B exists and is used correctly:

```text
master_data.lookups.lock
```

Verify role assignments:

## system_admin / global admin

Must have full access.

## group_admin

Expected:

```text
view
manage
export
audit_view
```

No hard delete unless explicitly approved.

## company_admin

Expected:

```text
view
export
```

No manage/delete by default unless intentionally changed.

## branch_admin

Expected:

```text
view
```

No manage/export/delete by default unless intentionally changed.

## normal users

No geography admin page access by default.

Can load active geography records through safe select services where needed.

## RLS Helper Functions

Inspect actual helper functions used by the app.

Do not assume fake helpers.

Validate actual functions such as:

```text
current_user_profile_id()
current_user_has_permission()
current_user_has_permission_any_scope()
current_user_is_global_admin()
```

or whatever actually exists.

## Backend / Server Actions

Inspect:

```text
src/features/master-data/geography/actions.ts
```

Verify functions exist and are wired correctly:

## Countries

```text
getCountries
getCountryById
createCountry
updateCountry
toggleCountryStatus
toggleCountryLock
deleteCountry
getActiveCountriesForSelect
```

## Emirates

```text
getEmirates
getEmirateById
createEmirate
updateEmirate
toggleEmirateStatus
toggleEmirateLock
deleteEmirate
getActiveEmiratesForSelect
```

## Cities

```text
getCities
getCityById
createCity
updateCity
toggleCityStatus
toggleCityLock
deleteCity
getActiveCitiesForSelect
```

## Areas / Zones

```text
getAreasZones
getAreaZoneById
createAreaZone
updateAreaZone
toggleAreaZoneStatus
toggleAreaZoneLock
deleteAreaZone
getActiveAreasZonesForSelect
```

## Ports

```text
getPorts
getPortById
createPort
updatePort
togglePortStatus
togglePortLock
deletePort
getActivePortsForSelect
```

If function names differ, document actual names and confirm they are properly used.

## TypeScript Types

Inspect:

```text
src/features/master-data/geography/types.ts
```

Verify types match real database columns exactly.

No UI should rely on fields that do not exist in DB.

No DB fields should be missing from types where needed.

## Validation Schemas

Inspect:

```text
src/features/master-data/geography/validation.ts
```

Verify schemas match DB constraints and UI forms.

## Select Components

Inspect:

```text
src/components/erp/geography/country-select.tsx
src/components/erp/geography/emirate-select.tsx
src/components/erp/geography/city-select.tsx
src/components/erp/geography/area-zone-select.tsx
src/components/erp/geography/port-select.tsx
src/components/erp/geography/index.ts
```

Verify:

- source table is correct
- active records loading works
- dependent filters work
- no service role key exposed
- no incorrect field names
- no direct unsafe queries
- no hardcoded outdated table/column names

## UI Pages

Inspect and browser-test:

```text
src/app/(protected)/admin/master-data/geography/countries/page.tsx
src/app/(protected)/admin/master-data/geography/emirates/page.tsx
src/app/(protected)/admin/master-data/geography/cities/page.tsx
src/app/(protected)/admin/master-data/geography/areas/page.tsx
src/app/(protected)/admin/master-data/geography/ports/page.tsx
```

## Table Components

Inspect:

```text
src/features/master-data/geography/components/countries-table.tsx
src/features/master-data/geography/components/emirates-table.tsx
src/features/master-data/geography/components/cities-table.tsx
src/features/master-data/geography/components/areas-table.tsx
src/features/master-data/geography/components/areas-zones-table.tsx if exists
src/features/master-data/geography/components/ports-table.tsx
```

Verify no duplicate/unused conflicting table components exist.

## Drawer / Form Components

Inspect:

```text
src/features/master-data/geography/components/country-form-dialog.tsx
src/features/master-data/geography/components/emirate-form-dialog.tsx
src/features/master-data/geography/components/city-form-dialog.tsx
src/features/master-data/geography/components/area-form-dialog.tsx
src/features/master-data/geography/components/area-zone-form-dialog.tsx if exists
src/features/master-data/geography/components/port-form-dialog.tsx
```

Verify no duplicate/unused conflicting form components exist.

## Sidebar

Inspect:

```text
src/components/layout/app-sidebar.tsx
```

Verify sidebar shows only:

```text
Master Data
└── Geography & Locations
    ├── Countries
    ├── Emirates
    ├── Cities
    ├── Areas / Zones
    └── Ports
```

No Work Sites.

No Finance Basics yet.

No UOM yet.

---

# 2. Database Audit Requirements

For each table, produce a detailed audit.

## countries

Verify expected fields:

- id
- country_code / ISO2
- iso3_code
- name_en
- name_ar
- nationality_en
- nationality_ar
- phone_code
- default_currency_code
- is_gcc
- is_uae
- is_active
- is_system
- is_locked
- sort_order
- created_by
- created_at
- updated_by
- updated_at
- deactivated_by
- deactivated_at
- deactivation_reason

Verify:

- ISO2 validation
- ISO3 validation
- UAE flag
- GCC flags
- uniqueness
- seed data
- UI field mapping
- server action mapping
- validation schema mapping

## emirates

Verify:

- id
- emirate_code
- name_en
- name_ar
- abbreviation fields if implemented
- is_active
- is_system
- is_locked
- sort_order
- audit/deactivation fields

Verify:

- 7 emirates exist
- codes are correct
- UI field mapping
- server action mapping
- validation schema mapping

## cities

Verify:

- id
- city_code
- name_en
- name_ar
- emirate_id or country/emirate linkage as actually implemented
- is_active
- is_system
- is_locked
- sort_order
- audit/deactivation fields

Verify:

- cities linked to correct emirates
- no wrong duplicate city/area design
- UI field mapping
- server action mapping
- validation schema mapping

## areas_zones

Verify:

- id
- area_code
- name_en
- name_ar
- city_id
- area_type_code or area_type lookup reference
- is_active
- is_system
- is_locked
- sort_order
- audit/deactivation fields

If fields like `is_free_zone`, `is_industrial_area`, `is_port_area`, or `description` were removed because they do not exist, confirm UI does not use them.

Verify:

- areas linked to correct city
- area type connects to `global_lookup_values`
- UI field mapping
- server action mapping
- validation schema mapping

## ports

Verify:

- id
- port_code
- name_en
- name_ar
- emirate_id or city linkage as actually implemented
- port_type_code or port type lookup
- ICAO/IATA fields if implemented
- is_active
- is_system
- is_locked
- sort_order
- audit/deactivation fields

Verify:

- ports linked to correct emirates/cities
- port type connects to `global_lookup_values`
- UI field mapping
- server action mapping
- validation schema mapping

---

# 3. RLS and Permission Audit Requirements

For each table verify:

## SELECT

- system_admin can view all records.
- users with `master_data.geography.view` can view admin records.
- active records are safely available for select/dropdowns if needed.
- unauthorized users cannot access admin pages.

## INSERT

- system_admin can insert.
- users with `master_data.geography.manage` can insert according to rules.
- unauthorized users cannot insert.

## UPDATE

- system_admin can update all records, including locked/system records.
- users with manage can update allowed records.
- locked records cannot be updated by unauthorized roles.

## LOCK / UNLOCK

- system_admin can lock/unlock all records.
- users with `master_data.lookups.lock` can lock/unlock if allowed.
- unauthorized roles cannot lock/unlock.

## DELETE

- system_admin can hard delete all records, subject only to FK constraints.
- all non-system_admin roles cannot hard delete.
- delete is audited before deletion.
- UI delete action is visible only to system_admin.

## EXPORT / AUDIT VIEW

- export permission exists.
- audit_view permission exists.
- UI and server access respect permissions.

---

# 4. UI Audit Requirements

For each page verify:

1. Page loads.
2. Permission gate works.
3. Table loads data.
4. Correct columns display.
5. No missing/undefined field errors.
6. Search works.
7. Filters work.
8. Add drawer opens.
9. Add action works.
10. Edit drawer opens.
11. Edit action works.
12. View drawer opens.
13. View mode disables fields.
14. Activate/deactivate works.
15. Lock/unlock works.
16. Delete works for system_admin.
17. Delete hidden/blocked for non-system_admin.
18. Export visibility works.
19. Audit info section displays correctly.
20. No console errors.
21. No route mismatch.
22. No broken import/export paths.
23. No duplicate conflicting components.

Pages:

```text
/admin/master-data/geography/countries
/admin/master-data/geography/emirates
/admin/master-data/geography/cities
/admin/master-data/geography/areas
/admin/master-data/geography/ports
```

---

# 5. Route Audit

Confirm final route standard:

```text
/admin/master-data/geography/areas
```

If `/areas-zones` exists:

- confirm it redirects to `/areas`, or
- remove it if unused, or
- document why it exists.

Sidebar must point to `/areas`.

Server revalidatePath must use `/areas`.

No stale `/areas-zones` route should remain unless intentionally redirected.

---

# 6. Lookup Audit

Verify lookup use:

## AREA_TYPES

- exists in `global_lookup_categories`
- values exist in `global_lookup_values`
- areas use correct value/code
- UI uses LookupSelect correctly
- no reference to old `lookup_values`

## PORT_TYPES

- exists in `global_lookup_categories`
- values exist in `global_lookup_values`
- ports use correct value/code
- UI uses LookupSelect correctly
- no reference to old `lookup_values`

## SITE_TYPES

If present, confirm:

- it is future-only
- it does not create Work Sites table/UI
- it does not show Work Sites menu

---

# 7. Audit Logging Requirements

Verify audit logging for:

## countries

- country.create
- country.update
- country.activate
- country.deactivate
- country.lock
- country.unlock
- country.delete

## emirates

- emirate.create
- emirate.update
- emirate.activate
- emirate.deactivate
- emirate.lock
- emirate.unlock
- emirate.delete

## cities

- city.create
- city.update
- city.activate
- city.deactivate
- city.lock
- city.unlock
- city.delete

## areas_zones

- area_zone.create
- area_zone.update
- area_zone.activate
- area_zone.deactivate
- area_zone.lock
- area_zone.unlock
- area_zone.delete

## ports

- port.create
- port.update
- port.activate
- port.deactivate
- port.lock
- port.unlock
- port.delete

Audit must include:

- entity name
- entity id
- entity code/reference
- old values
- new values
- actor user
- timestamp
- delete old record snapshot before deletion

---

# 8. Build / Type / Lint Requirements

Run:

```text
npm run typecheck
npm run lint
npm run build
npm test if available
```

If lint has old unrelated errors, separate:

- geography module errors
- unrelated legacy errors

All geography module errors must be fixed.

---

# 9. Browser Testing Requirements

Browser-test the full module.

For each page:

```text
Countries
Emirates
Cities
Areas / Zones
Ports
```

Test:

1. Open page.
2. Search.
3. Filter.
4. Add test record.
5. Edit test record.
6. View test record.
7. Lock test record.
8. Confirm locked badge.
9. Unlock test record.
10. Deactivate test record.
11. Reactivate test record.
12. Delete test record as system_admin.
13. Confirm delete blocked/hidden for non-system_admin if possible.
14. Confirm export UI behavior.
15. Confirm no console errors.

If test records are created:

- delete them as system_admin, or
- clearly name them test records and remove/deactivate after testing.

---

# 10. Required Fix Rules

If you find issues inside 002F.3C.1:

- fix them carefully.
- document exactly what was fixed.
- create corrective migration if database/RLS correction is required.
- do not edit already-applied migrations unless project convention allows and it is safe.
- do not change unrelated modules.
- do not begin 002F.3C.2.

Examples of issues to fix:

- field mismatch between UI and database
- wrong route
- wrong revalidatePath
- wrong lookup table reference
- missing permission check
- missing RLS policy
- missing lock/unlock action
- delete visible to non-system_admin
- system_admin blocked from delete
- non-existing database column in form
- TypeScript/lint/build errors in geography module
- broken sidebar link
- duplicate conflicting component files

---

# 11. Required Output Report Structure

Create:

```text
ERP_BASE_002F_3C_1_GEOGRAPHY_FULL_MODULE_AUDIT_AND_VALIDATION_REPORT.md
```

The report must include:

1. Phase name.
2. Date.
3. Executive summary.
4. Final decision: PASS / PASS WITH NOTES / FAIL.
5. Files reviewed.
6. Files modified, if any.
7. Migrations reviewed.
8. Migrations created, if any.
9. Database table audit.
10. Field and column mapping audit.
11. Lookup table audit.
12. Permission and role audit.
13. RLS policy audit.
14. Global admin full access validation.
15. Server action audit.
16. Validation schema audit.
17. TypeScript type audit.
18. UI page audit.
19. Table component audit.
20. Drawer form audit.
21. Select component audit.
22. Sidebar and route audit.
23. Audit logging verification.
24. Browser testing result.
25. Typecheck result.
26. Lint result.
27. Build result.
28. Security issues found and fixed.
29. Remaining known limitations.
30. Final recommendation.

At the end, write exactly one:

```text
PASS — ERP BASE 002F.3C.1 Geography & Locations is fully audited, validated, and ready to close.
PASS WITH NOTES — ERP BASE 002F.3C.1 Geography & Locations is acceptable with minor non-blocking notes.
FAIL — ERP BASE 002F.3C.1 Geography & Locations requires correction before closing.
```

## Final Instruction

Audit and validate only:

```text
ERP BASE 002F.3C.1 — Geography & Locations
```

Do not start ERP BASE 002F.3C.2.

Do not implement Finance Basics.

Generate the full audit and validation report and stop.
