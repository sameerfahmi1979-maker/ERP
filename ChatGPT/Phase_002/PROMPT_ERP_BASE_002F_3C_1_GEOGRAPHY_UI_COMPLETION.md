# PROMPT_ERP_BASE_002F_3C_1_GEOGRAPHY_UI_COMPLETION

Act as a senior ERP QA lead, Supabase/PostgreSQL RLS auditor, Playwright automation engineer, Next.js runtime tester, SaaS security tester, notification-engine validation specialist, senior Next.js frontend engineer, and enterprise ERP UI/UX implementation specialist.

## Phase

ERP BASE 002F.3C.1 — Geography & Locations UI Completion

## Implementation Mode

This is a UI COMPLETION prompt.

The backend foundation for ERP BASE 002F.3C.1 — Geography & Locations has been implemented, but the phase is still NOT approved because the CRUD UI pages, data tables, drawer forms, browser/manual testing, and export UI were deferred.

You must complete the missing UI scope for ERP BASE 002F.3C.1 only.

Do not start ERP BASE 002F.3C.2.

Do not implement Finance Basics.

Do not implement Units & Measurements.

Do not implement Work Sites.

Do not implement CRM, HR, Fleet, Workshop, Inventory, Procurement, HSE, DMS, Scrap/Waste/Demolition, or Accounting.

Do not create new database schema unless absolutely required to fix a UI-blocking issue.

## Reference Reports

Review these reports before starting:

1. `ERP_BASE_002F_3C_1_GEOGRAPHY_LOCATIONS_IMPLEMENTATION_REPORT.md`
2. `ERP_BASE_002F_3C_1_GEOGRAPHY_LOCATIONS_COMPLETION_FIX_REPORT.md`

The completion/fix report confirms:

- Database schema exists.
- Seed data exists.
- Permissions exist.
- RLS policies exist.
- Server actions exist.
- Validation schemas exist.
- TypeScript types exist.
- Select components exist.
- Sidebar route exists.
- Global admin/system_admin delete access exists.
- CRUD UI pages are still missing.
- Browser/manual testing is still missing.
- Export UI is still missing.

Your task is to finish only the missing UI and validation/testing layer.

## Critical Business Rule From Sameer

Global admin/system_admin must be able to:

```text
view, insert, edit, and delete all geography records all the time
```

This rule must be reflected in the UI:

- system_admin can see all records.
- system_admin can add records.
- system_admin can edit records.
- system_admin can activate/deactivate records.
- system_admin can hard delete records.
- hard delete button must be visible only to system_admin/global admin.
- hard delete must require confirmation.
- hard delete must call the already-created delete server actions.
- non-system_admin users must not see hard delete action.
- non-system_admin users should use deactivate/reactivate only if they have manage permission.
- all UI actions must respect existing permissions.

## Current Known Backend / Files

The previous report says the following files exist:

```text
src/features/master-data/geography/actions.ts
src/features/master-data/geography/types.ts
src/features/master-data/geography/validation.ts

src/components/erp/geography/country-select.tsx
src/components/erp/geography/emirate-select.tsx
src/components/erp/geography/city-select.tsx
src/components/erp/geography/area-zone-select.tsx
src/components/erp/geography/port-select.tsx
src/components/erp/geography/index.ts

src/components/layout/app-sidebar.tsx
```

Use the existing actions/types/validation/select components.

Do not duplicate action files.

Do not create parallel geography logic.

If an action needed by the UI is missing, add it to the existing geography actions file using the same backend pattern.

## Approved UI Scope

Create full CRUD admin UI for these 5 geography entities:

```text
Countries
Emirates
Cities
Areas / Zones
Ports
```

Routes must be:

```text
/admin/master-data/geography/countries
/admin/master-data/geography/emirates
/admin/master-data/geography/cities
/admin/master-data/geography/areas
/admin/master-data/geography/ports
```

Do not create:

```text
/admin/master-data/geography/sites
```

Work Sites remain deferred.

## Must Use Existing ERP UI Components

Use the existing project UI patterns:

- ERPPageHeader
- ERPDataTable
- ERPDrawerForm
- ERPFieldGrid
- ERPDrawerSection / section navigation if available
- Status badges
- Lock/system indicators
- ERPExportMenu if stable
- Confirmation dialog pattern used elsewhere in the app
- Toast/success/error pattern used elsewhere
- Permission-gated action buttons

Follow the same style used by:

- Organization pages
- Branch pages
- Numbering pages
- Lookup categories/values pages from 002F.3B

Do not invent a new UI framework.

---

# 1. Required UI Pages

Create these page files:

```text
src/app/(protected)/admin/master-data/geography/countries/page.tsx
src/app/(protected)/admin/master-data/geography/emirates/page.tsx
src/app/(protected)/admin/master-data/geography/cities/page.tsx
src/app/(protected)/admin/master-data/geography/areas/page.tsx
src/app/(protected)/admin/master-data/geography/ports/page.tsx
```

Each page must:

1. Check page permission:
   - `master_data.geography.view`
2. Load the required data through existing server actions.
3. Render page header.
4. Render table component.
5. Provide add button if user has:
   - `master_data.geography.manage`
6. Provide export button/menu if user has:
   - `master_data.geography.export`
7. Show proper empty state.
8. Show proper error state if load fails.
9. Not expose unauthorized actions.
10. Follow the protected route pattern used in existing admin pages.

---

# 2. Required Table Components

Create these table components:

```text
src/features/master-data/geography/components/countries-table.tsx
src/features/master-data/geography/components/emirates-table.tsx
src/features/master-data/geography/components/cities-table.tsx
src/features/master-data/geography/components/areas-zones-table.tsx
src/features/master-data/geography/components/ports-table.tsx
```

Each table must support:

- search
- filters
- sortable columns where practical
- active/inactive/all filter
- system indicator
- locked indicator
- row actions
- permission-based action visibility
- view action
- edit action if user has `master_data.geography.manage`
- activate/deactivate if user has `master_data.geography.manage`
- hard delete only if user is `system_admin`
- confirmation dialog for hard delete
- export integration if ERPDataTable export supports it

## Permission Rules for Row Actions

### View

Visible if user can view page.

### Edit

Visible if user has:

```text
master_data.geography.manage
```

But for locked/system records:

- non-global admins must not edit locked records
- system_admin/global admin can edit all records

### Activate/Deactivate

Visible if user has:

```text
master_data.geography.manage
```

But for locked/system records:

- non-global admins must not deactivate locked/system records unless existing backend allows it
- system_admin/global admin can activate/deactivate all records

### Delete

Visible only if:

```text
roleCodes includes system_admin
```

or the project’s actual global-admin helper indicates global admin.

Delete must:

- show confirmation dialog
- clearly warn hard delete is permanent
- call correct delete server action
- show success/error toast
- refresh/revalidate data
- not be visible to group_admin/company_admin/branch_admin/normal user

---

# 3. Required Drawer Form Components

Create these drawer form components:

```text
src/features/master-data/geography/components/country-form-dialog.tsx
src/features/master-data/geography/components/emirate-form-dialog.tsx
src/features/master-data/geography/components/city-form-dialog.tsx
src/features/master-data/geography/components/area-zone-form-dialog.tsx
src/features/master-data/geography/components/port-form-dialog.tsx
```

Each drawer must support modes:

```text
add
edit
view
```

Each drawer must:

- use existing ERPDrawerForm pattern
- use ERPFieldGrid
- have visible fields
- have sectioned layout
- disable fields in view mode
- prevent submit in view mode
- show validation errors
- show success/error toast
- call create/update server action
- refresh/revalidate page after save
- close only after successful save unless existing pattern differs
- show audit information in read-only section where available
- include status/governance section

---

# 4. Countries UI Requirements

## Countries Page Route

```text
/admin/master-data/geography/countries
```

## Table Columns

- Country Code / ISO2
- ISO3
- Name EN
- Name AR
- Nationality EN
- Nationality AR if space allows
- Phone Code
- Default Currency Code
- GCC
- UAE
- Active
- System
- Locked
- Updated At
- Actions

## Filters

- search by code/name/nationality
- active/inactive/all
- GCC only
- UAE only
- locked/unlocked/all
- system/non-system/all

## Drawer Sections

### Basic Information

- ISO2 / country code
- ISO3 code
- Name EN
- Name AR

### Nationality & Contact

- Nationality EN
- Nationality AR
- Phone code
- Default currency code as text

### Classification

- Is GCC
- Is UAE
- Sort order

### Status & Governance

- Is active
- Is system
- Is locked

### Audit Information

- Created by
- Created at
- Updated by
- Updated at
- Deactivated by
- Deactivated at
- Deactivation reason

## Actions

Use:

- createCountry
- updateCountry
- toggleCountryStatus
- deleteCountry

---

# 5. Emirates UI Requirements

## Route

```text
/admin/master-data/geography/emirates
```

## Table Columns

- Emirate Code
- Name EN
- Name AR
- Country
- Active
- System
- Locked
- Updated At
- Actions

## Filters

- search by code/name
- country
- active/inactive/all
- locked/unlocked/all
- system/non-system/all

## Drawer Sections

### Basic Information

- Emirate code
- Name EN
- Name AR
- Country

### Display & Status

- Sort order
- Is active
- Is system
- Is locked

### Audit Information

- audit fields

## Actions

Use:

- createEmirate
- updateEmirate
- toggleEmirateStatus
- deleteEmirate

---

# 6. Cities UI Requirements

## Route

```text
/admin/master-data/geography/cities
```

## Table Columns

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

## Filters

- search by code/name
- country
- emirate
- active/inactive/all
- capital yes/no/all
- locked/unlocked/all
- system/non-system/all

## Drawer Sections

### Basic Information

- City code
- Name EN
- Name AR

### Geography Link

- Country
- Emirate
- Is capital

### Status & Governance

- Sort order
- Is active
- Is system
- Is locked

### Audit Information

- audit fields

## Actions

Use:

- createCity
- updateCity
- toggleCityStatus
- deleteCity

---

# 7. Areas / Zones UI Requirements

## Route

```text
/admin/master-data/geography/areas
```

## Table Columns

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

## Filters

- search by code/name
- country
- emirate
- city
- area type
- free zone yes/no/all
- industrial yes/no/all
- port area yes/no/all
- active/inactive/all
- locked/unlocked/all
- system/non-system/all

## Drawer Sections

### Basic Information

- Area code
- Name EN
- Name AR
- Area type

### Geography Link

- Country
- Emirate
- City

### Area Classification

- Is free zone
- Is industrial area
- Is port area
- Description

### Status & Governance

- Sort order
- Is active
- Is system
- Is locked

### Audit Information

- audit fields

## Actions

Use:

- createAreaZone
- updateAreaZone
- toggleAreaZoneStatus
- deleteAreaZone

---

# 8. Ports UI Requirements

## Route

```text
/admin/master-data/geography/ports
```

## Table Columns

- Port Code
- Name EN
- Name AR
- Port Type
- Country
- Emirate
- City
- Operator
- ICAO / IATA if fields exist
- Website
- Active
- System
- Locked
- Updated At
- Actions

## Filters

- search by code/name/operator
- country
- emirate
- city
- port type
- active/inactive/all
- locked/unlocked/all
- system/non-system/all

## Drawer Sections

### Basic Information

- Port code
- Name EN
- Name AR
- Port type

### Geography Link

- Country
- Emirate
- City

### Port Details

- Operator name
- ICAO code if exists
- IATA code if exists
- Website
- Description

### Status & Governance

- Sort order
- Is active
- Is system
- Is locked

### Audit Information

- audit fields

## Actions

Use:

- createPort
- updatePort
- togglePortStatus
- deletePort

---

# 9. Route Standardization

Preferred route is:

```text
/admin/master-data/geography/areas
```

If previous route exists:

```text
/admin/master-data/geography/areas-zones
```

Then either:

1. Remove/rename it to `/areas`, or
2. Add redirect from `/areas-zones` to `/areas`, or
3. Keep both if needed, but sidebar must point to `/areas`.

The final report must clearly confirm the final route.

---

# 10. Export UI Requirements

If existing ERPExportMenu / ERPDataTable export is stable:

- Add export to all 5 geography pages.
- Export should respect visible rows/filters if existing table supports it.
- Export visible only to:
  - system_admin
  - group_admin
  - company_admin if they have `master_data.geography.export`
- Export hidden for branch_admin unless permission exists.
- Export hidden for normal users.

If export engine is not stable:

- hide/disable export button
- document as deferred

Do not build a brand-new export engine in this phase.

---

# 11. Import Requirements

Do not implement import.

No upload button.

No active import UI.

Document import as future enhancement.

---

# 12. Work Sites Correction

Do not create Work Sites UI.

Do not create WorkSiteSelect.

Do not add Work Sites to sidebar.

Final report must say:

```text
Work Sites remain deferred.
Next approved sub-phase is 002F.3C.2 — Finance Basics / Commercial Readiness.
```

---

# 13. Testing Requirements

## TypeScript / Build

Run:

```text
npm run typecheck
npm run lint
npm run build
```

If commands differ, run the correct project commands.

## Browser Testing

Open and test:

```text
/admin/master-data/geography/countries
/admin/master-data/geography/emirates
/admin/master-data/geography/cities
/admin/master-data/geography/areas
/admin/master-data/geography/ports
```

For each page, test:

- page loads
- table loads
- seed data visible
- search works
- filters work
- add drawer opens
- edit drawer opens
- view drawer opens
- fields are visible
- create works
- update works
- activate/deactivate works
- delete visible only for system_admin
- delete works for system_admin
- delete blocked for non-system_admin
- export visible according to permission
- no console errors

## RLS / Security Testing

Verify:

- system_admin can view/insert/edit/delete all records
- group_admin can view/manage/export/audit but cannot hard delete
- company_admin can view/export but cannot manage/delete
- branch_admin can view only
- normal user cannot access admin pages unless explicitly granted
- active select components still work
- service role key is not exposed

---

# 14. Required Final Report

Create this report:

```text
ERP_BASE_002F_3C_1_GEOGRAPHY_UI_COMPLETION_REPORT.md
```

The report must include:

1. Phase name.
2. Date.
3. Summary of previous missing UI gaps.
4. Files reviewed.
5. Files created.
6. Files modified.
7. UI pages created.
8. Table components created.
9. Drawer forms created.
10. Server actions added/modified.
11. Permission behavior.
12. Global admin/system_admin delete behavior.
13. Route standardization.
14. Export status.
15. Import status.
16. Work Sites status.
17. Typecheck result.
18. Lint result.
19. Build result.
20. Browser/manual testing result.
21. RLS/security testing result.
22. Remaining known limitations.
23. Final status.

At the end, write one of:

```text
PASS — ERP BASE 002F.3C.1 UI is complete and ready for Sameer review.
PASS WITH NOTES — ERP BASE 002F.3C.1 UI is complete with minor non-blocking notes.
FAIL — ERP BASE 002F.3C.1 UI still requires correction.
```

Do not proceed to 002F.3C.2.

---

# 15. Final Instruction

Complete only the missing UI for:

```text
ERP BASE 002F.3C.1 — Geography & Locations
```

Do not start the next sub-phase.

Generate the UI completion report and stop.
