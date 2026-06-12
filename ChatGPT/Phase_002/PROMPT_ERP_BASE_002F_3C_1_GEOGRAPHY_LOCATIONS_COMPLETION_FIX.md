# PROMPT_ERP_BASE_002F_3C_1_GEOGRAPHY_LOCATIONS_COMPLETION_FIX

Act as a senior ERP QA lead, Supabase/PostgreSQL RLS auditor, Playwright automation engineer, Next.js runtime tester, SaaS security tester, notification-engine validation specialist, enterprise ERP solution architect, UAE business compliance analyst, master data governance consultant, and senior Next.js/Supabase implementation engineer.

## Phase

ERP BASE 002F.3C.1 — Geography & Locations Completion Fix

## Implementation Mode

This is a COMPLETION AND FIX prompt.

The previous ERP BASE 002F.3C.1 implementation report shows that the database foundation, server actions, validation, types, select components, and sidebar were partially completed, but the phase is NOT approved because several required items were missed.

You must complete and fix ERP BASE 002F.3C.1 only.

Do not start ERP BASE 002F.3C.2.

Do not implement Finance Basics.

Do not implement Units & Measurements.

Do not implement Work Sites.

Do not implement CRM, HR, Fleet, Workshop, Inventory, Procurement, HSE, DMS, Scrap/Waste/Demolition, or Accounting.

## Reference Report

Review the previous implementation report:

`ERP_BASE_002F_3C_1_GEOGRAPHY_LOCATIONS_IMPLEMENTATION_REPORT.md`

This report confirms the following were implemented:

- `countries`
- `emirates`
- `cities`
- `areas_zones`
- `ports`
- `AREA_TYPES`
- `PORT_TYPES`
- geography server actions
- geography validation
- geography TypeScript types
- geography select components
- geography sidebar group

But it also confirms missing/incomplete items:

- CRUD UI pages were not implemented.
- Full browser testing was not completed.
- Only 2 permissions were created instead of the required 4.
- Role assignments were incomplete.
- Delete policies were created, but they must be reviewed and corrected based on the global admin rule below.
- Export permission and UI export behavior were not completed.
- `areas` vs `areas-zones` route mismatch exists.
- Work Sites roadmap was incorrectly mentioned as next sub-phase.
- The implementation report incorrectly says ready for next phase even though required UI was missing.

## Critical Business Rule From Sameer

Sameer confirmed:

```text
Global admin / system_admin must be able to view, insert, edit, and delete all records all the time.
```

Apply this rule strictly for ERP BASE 002F.3C.1 Geography & Locations.

### Required Meaning

Global admin/system_admin must have unrestricted administration control for geography master data:

- Can view all records.
- Can insert all record types.
- Can edit all records.
- Can activate/deactivate all records.
- Can lock/unlock all records.
- Can delete all records if required.
- Can access active, inactive, system, locked, and non-system records.
- Can bypass company/branch/scoped restrictions where applicable.
- Must still be fully audited.

### Safety Requirements

Even though global admin can delete:

1. Delete must be restricted to global admin/system_admin only.
2. No normal user, branch admin, company admin, or group admin can hard delete unless explicitly allowed later.
3. Delete actions must be audited.
4. UI must show a clear confirmation dialog before hard delete.
5. System/locked records can be deleted only by global admin/system_admin.
6. Deactivate remains the normal recommended action for non-global-admin roles.
7. If the system has an existing `system_admin` or global admin helper, use it.
8. Do not expose delete action to unauthorized roles in the UI.
9. RLS must enforce delete restrictions at database level.
10. Server actions must also enforce delete restrictions before attempting delete.

## Important Correction About Hard Delete

Previous prompts preferred deactivation instead of delete. Sameer has now clarified that global admin must be able to delete all records all the time.

Therefore, for this fix:

- Keep deactivate/reactivate for normal admin workflow.
- Add/confirm hard delete only for global admin/system_admin.
- Do not allow hard delete for group_admin, company_admin, branch_admin, or normal users.
- Document this clearly in the final report.

## Critical Technical Corrections To Preserve

### 1. Use Existing 002F.3B Lookup Tables

Use:

```text
global_lookup_categories
global_lookup_values
```

Do not use or create:

```text
lookup_categories
lookup_values
```

If the previous implementation used soft text references such as `area_type_code` and `port_type_code`, review whether this is acceptable. If FK is used, it must reference `global_lookup_values`.

Do not create duplicate lookup tables.

### 2. Use Existing Project RLS Helpers

Do not assume fake helper names.

Inspect the existing RLS helpers and use actual project functions, such as:

```text
current_user_profile_id()
current_user_has_permission()
current_user_has_permission_any_scope()
current_user_is_global_admin()
```

or whatever actually exists.

If a global admin helper does not exist, create or use a secure equivalent based on existing roles/permissions.

### 3. Use Existing Audit User Pattern

Use existing BIGINT `user_profiles.id` pattern for:

```text
created_by
updated_by
deactivated_by
deleted_by if added
```

Do not reference direct `auth.users.id` if the project uses BIGINT `user_profiles.id`.

### 4. Work Sites Remain Deferred

Do not create or complete:

```text
work_sites
/admin/master-data/geography/sites
WorkSiteSelect
```

Do not mention Work Sites as 002F.3C.2.

The approved next sub-phase after 002F.3C.1 is:

```text
002F.3C.2 — Finance Basics / Commercial Readiness
```

### 5. Geography Hierarchy Must Stay Clean

The clean hierarchy is:

```text
Country → Emirate → City → Area / Zone
```

Cities should be actual cities/municipalities.

Areas/zones should include districts, industrial zones, free zones, and operational zones.

Do not duplicate the same location as both city and area unless documented.

### 6. Do Not Add Future Menus

For this fix, the sidebar should show only:

```text
Master Data
└── Geography & Locations
    ├── Countries
    ├── Emirates
    ├── Cities
    ├── Areas / Zones
    └── Ports
```

Do not show:

```text
Work Sites
Finance Basics
Units & Measurements
HR
CRM
Fleet
HSE
Scrap/Waste/Demolition
```

---

# 1. Required Scope of This Fix

You must complete:

## A. Missing CRUD UI Pages

Create full admin pages for:

```text
/admin/master-data/geography/countries
/admin/master-data/geography/emirates
/admin/master-data/geography/cities
/admin/master-data/geography/areas
/admin/master-data/geography/ports
```

Important route decision:

- Standardize route as `/areas`, not `/areas-zones`, unless the existing app has already created `/areas-zones`.
- If `/areas-zones` already exists, create a redirect or standard route alias and document it.
- Final preferred route: `/admin/master-data/geography/areas`.

## B. Table Components

Create data table components for:

- countries
- emirates
- cities
- areas_zones
- ports

Each table must support:

- search
- filters
- sortable columns
- status badges
- system/locked indicators
- row actions
- export if stable
- permission-based action visibility
- active/inactive records view where allowed

## C. Drawer Forms

Create drawer form components for:

- country
- emirate
- city
- area/zone
- port

Each drawer must support modes:

- add
- edit
- view

Each drawer must use:

- ERPDrawerForm
- ERPFieldGrid
- right-side drawer pattern
- section navigation if consistent with existing pattern
- visible form fields
- audit info section
- status/governance section

## D. Actions

Ensure server actions include:

- create
- update
- activate/deactivate
- lock/unlock
- delete for global admin/system_admin only
- list
- get by id
- active select list

If list/get/select functions are missing, add them.

## E. Permissions

Add missing permissions:

```text
master_data.geography.export
master_data.geography.audit_view
```

Confirm existing permissions:

```text
master_data.geography.view
master_data.geography.manage
```

Add or confirm delete/global-admin control:

Option 1 if a permission system supports it:

```text
master_data.geography.delete
```

Option 2 if delete is controlled by global admin role only:

- no separate delete permission required
- delete allowed only for global admin/system_admin role

Choose the safest approach consistent with the existing permission system.

Global admin/system_admin must be able to delete all geography records.

## F. Role Assignments

Assign geography permissions correctly:

### system_admin / global admin

Must have:

```text
master_data.geography.view
master_data.geography.manage
master_data.geography.export
master_data.geography.audit_view
master_data.geography.delete if created
master_data.lookups.lock
```

Must be able to:

- view all
- insert all
- edit all
- lock/unlock all
- activate/deactivate all
- delete all

### group_admin

Recommended:

```text
master_data.geography.view
master_data.geography.manage
master_data.geography.export
master_data.geography.audit_view
```

No hard delete unless explicitly approved.

### company_admin

Recommended:

```text
master_data.geography.view
master_data.geography.export
```

No manage/delete by default.

### branch_admin

Recommended:

```text
master_data.geography.view
```

No manage/export/delete by default unless existing policy differs.

### normal users

No admin page permissions by default.

Can still load active geography values through safe select/dropdown services.

## G. RLS Policies

Review existing RLS on:

```text
countries
emirates
cities
areas_zones
ports
```

Fix RLS so:

### Read

- Global admin/system_admin can read all records all the time.
- Users with `master_data.geography.view` can read admin pages.
- Normal valid ERP users can read active geography records if needed for dropdowns, according to existing safe pattern.

### Insert

- Global admin/system_admin can insert all records all the time.
- Users with `master_data.geography.manage` can insert according to admin rules.
- Unauthorized users cannot insert.

### Update

- Global admin/system_admin can update all records all the time, including system/locked/inactive records.
- Users with `master_data.geography.manage` can update non-locked records.
- Lock/unlock requires `master_data.lookups.lock` unless global admin/system_admin.
- Unauthorized users cannot update.

### Delete

- Global admin/system_admin can delete all records all the time.
- All other roles cannot hard delete unless explicitly granted later.
- Delete must be blocked for unauthorized roles.
- Delete must be audited through server action before deletion.
- If physical delete is difficult to audit after deletion, log audit before delete.

Do not use unsafe public write policies.

Do not expose service role to frontend.

## H. Audit

Add audit for delete actions:

- country.delete
- emirate.delete
- city.delete
- area_zone.delete
- port.delete

Confirm existing audit actions:

- create
- update
- activate/deactivate
- lock/unlock

Audit must include old record data before delete.

## I. Browser / Manual Testing

Perform browser testing for:

- Countries page
- Emirates page
- Cities page
- Areas page
- Ports page
- Sidebar navigation
- Add drawer
- Edit drawer
- View drawer
- Activate/deactivate
- Lock/unlock
- Delete as global admin
- Delete blocked for non-global admin
- Export if enabled
- Filters/search

## J. Build Testing

Run:

```text
npm run typecheck
npm run lint
npm run build
npm test if available
```

Document all results.

---

# 2. Page Requirements

## Countries Page

Route:

```text
/admin/master-data/geography/countries
```

Columns:

- Country Code / ISO2
- ISO3
- Name EN
- Name AR
- Nationality EN
- Phone Code
- Default Currency Code
- GCC
- UAE
- Active
- System
- Locked
- Updated At
- Actions

Filters:

- search by code/name/nationality
- active/inactive/all
- GCC only
- UAE only
- locked/unlocked

Drawer fields:

- ISO2 code
- ISO3 code
- name EN
- name AR
- nationality EN
- nationality AR
- phone code
- default currency code as text
- is_gcc
- is_uae
- sort order
- status/governance
- audit info

## Emirates Page

Route:

```text
/admin/master-data/geography/emirates
```

Columns:

- Emirate Code
- Name EN
- Name AR
- Country
- Active
- System
- Locked
- Updated At
- Actions

Filters:

- search by code/name
- active/inactive/all
- locked/unlocked

Drawer fields:

- emirate code
- name EN
- name AR
- country
- sort order
- status/governance
- audit info

## Cities Page

Route:

```text
/admin/master-data/geography/cities
```

Columns:

- City Code
- Name EN
- Name AR
- Country
- Emirate
- Capital
- Active
- System
- Locked
- Updated At
- Actions

Filters:

- search by code/name
- country
- emirate
- active/inactive/all
- capital yes/no
- locked/unlocked

Drawer fields:

- city code
- name EN
- name AR
- country
- emirate
- is_capital
- sort order
- status/governance
- audit info

## Areas / Zones Page

Route:

```text
/admin/master-data/geography/areas
```

Columns:

- Area Code
- Name EN
- Name AR
- Type
- Country
- Emirate
- City
- Free Zone
- Industrial
- Port Area
- Active
- System
- Locked
- Updated At
- Actions

Filters:

- search by code/name
- country
- emirate
- city
- area type
- free zone
- industrial area
- active/inactive/all
- locked/unlocked

Drawer fields:

- area code
- name EN
- name AR
- country
- emirate
- city
- area type
- is_free_zone
- is_industrial_area
- is_port_area
- description
- sort order
- status/governance
- audit info

## Ports Page

Route:

```text
/admin/master-data/geography/ports
```

Columns:

- Port Code
- Name EN
- Name AR
- Port Type
- Country
- Emirate
- City
- Operator
- Website
- Active
- System
- Locked
- Updated At
- Actions

Filters:

- search by code/name/operator
- country
- emirate
- city
- port type
- active/inactive/all
- locked/unlocked

Drawer fields:

- port code
- name EN
- name AR
- country
- emirate
- city
- port type
- operator name
- website
- description
- sort order
- status/governance
- audit info

---

# 3. Required Files To Create Or Complete

Use actual project structure where applicable.

Expected files include:

## Pages

```text
src/app/(protected)/admin/master-data/geography/countries/page.tsx
src/app/(protected)/admin/master-data/geography/emirates/page.tsx
src/app/(protected)/admin/master-data/geography/cities/page.tsx
src/app/(protected)/admin/master-data/geography/areas/page.tsx
src/app/(protected)/admin/master-data/geography/ports/page.tsx
```

## Table Components

```text
src/features/master-data/geography/components/countries-table.tsx
src/features/master-data/geography/components/emirates-table.tsx
src/features/master-data/geography/components/cities-table.tsx
src/features/master-data/geography/components/areas-zones-table.tsx
src/features/master-data/geography/components/ports-table.tsx
```

## Drawer Forms

```text
src/features/master-data/geography/components/country-form-dialog.tsx
src/features/master-data/geography/components/emirate-form-dialog.tsx
src/features/master-data/geography/components/city-form-dialog.tsx
src/features/master-data/geography/components/area-zone-form-dialog.tsx
src/features/master-data/geography/components/port-form-dialog.tsx
```

## Server Actions

Complete or update:

```text
src/features/master-data/geography/actions.ts
```

or move/follow the project standard if server actions should be under:

```text
src/server/actions/master-data/geography.ts
```

Do not duplicate action files.

## Migration

If database/RLS/permission corrections are required, create a new corrective migration:

```text
supabase/migrations/YYYYMMDDHHMMSS_erp_base_002f3c1_geography_completion_fix.sql
```

Do not edit already-applied migration unless project convention allows it and it has not been deployed.

## Sidebar

Update if needed:

```text
src/components/layout/app-sidebar.tsx
```

---

# 4. Route Standardization

Preferred standard route:

```text
/admin/master-data/geography/areas
```

If previous implementation used:

```text
/admin/master-data/geography/areas-zones
```

Then do one of:

1. Rename/update route to `/areas`, or
2. Keep `/areas-zones` and add `/areas` redirect to `/areas-zones`, or
3. Keep `/areas-zones` only if project convention requires it.

Final report must clearly state chosen route.

My preferred decision:

```text
Use /admin/master-data/geography/areas
```

---

# 5. Work Sites Correction

The previous report incorrectly says Work Sites are the next sub-phase.

Correct statement:

```text
Work Sites remain deferred.
Next sub-phase after approval is 002F.3C.2 — Finance Basics / Commercial Readiness.
```

Do not create:

```text
work_sites table
work site UI
WorkSiteSelect
/admin/master-data/geography/sites
```

---

# 6. Final Completion/Fix Report

Create this report:

```text
ERP_BASE_002F_3C_1_GEOGRAPHY_LOCATIONS_COMPLETION_FIX_REPORT.md
```

The report must include:

1. Phase name.
2. Date.
3. Summary of previous gaps.
4. Files reviewed.
5. Files created.
6. Files modified.
7. Migration fixes applied, if any.
8. Permissions fixed.
9. Role assignments fixed.
10. RLS policies fixed.
11. Global admin/system_admin full access confirmation.
12. Delete behavior confirmation.
13. UI pages created.
14. Table components created.
15. Drawer forms created.
16. Sidebar route standardization.
17. Export status.
18. Import status: deferred.
19. Work Sites status: deferred.
20. Typecheck result.
21. Lint result.
22. Build result.
23. Browser/manual testing result.
24. RLS/security testing result.
25. Remaining known limitations.
26. Final status.

At the end write one of:

```text
PASS — ERP BASE 002F.3C.1 is complete and ready for Sameer review.
PASS WITH NOTES — ERP BASE 002F.3C.1 is complete but has minor non-blocking notes.
FAIL — ERP BASE 002F.3C.1 still requires correction.
```

Do not proceed to 002F.3C.2.

---

# 7. Final Instruction

Complete and fix only:

```text
ERP BASE 002F.3C.1 — Geography & Locations
```

Global admin/system_admin must be able to view, insert, edit, and delete all geography records all the time.

Generate the completion/fix report and stop.
