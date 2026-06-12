# PROMPT_ERP_BASE_002F_3C_1_IMPLEMENT_GEOGRAPHY_LOCATIONS

Act as a senior ERP QA lead, Supabase/PostgreSQL RLS auditor, Playwright automation engineer, Next.js runtime tester, SaaS security tester, notification-engine validation specialist, enterprise ERP solution architect, UAE business compliance analyst, master data governance consultant, and senior Next.js/Supabase implementation engineer.

## Phase

ERP BASE 002F.3C.1 — Geography & Locations Implementation

## Implementation Mode

This is an IMPLEMENTATION prompt.

You must implement only the approved first sub-phase of ERP BASE 002F.3C:

**002F.3C.1 — Geography & Locations**

Do not implement the full 002F.3C phase.

Do not implement Finance Basics.

Do not implement Units & Measurements.

Do not implement CRM, HR, Fleet, Workshop, Inventory, Procurement, HSE, DMS, Scrap/Waste/Demolition, or Accounting.

Do not proceed to 002F.3C.2 automatically.

## Reference Plan

Use the reviewed plan as planning reference:

`ERP_BASE_002F_3C_CORE_UAE_SHARED_MASTER_DATA_TECHNICAL_IMPLEMENTATION_PLAN_REV2_COMPLETE.md`

However, apply the corrections and restrictions in this prompt as higher priority.

## Critical Corrections From Sameer / Dina Review

Before implementation, apply these corrections strictly:

### 1. Use Existing 002F.3B Lookup Tables

The 002F.3B lookup engine created:

```text
global_lookup_categories
global_lookup_values
```

Do not create or reference:

```text
lookup_categories
lookup_values
```

unless those exact tables already exist in the source, which is not expected.

Any lookup-backed field in this phase must reference/use the existing 002F.3B tables:

```text
global_lookup_categories
global_lookup_values
```

### 2. Use Existing Project RLS Helpers

Do not assume the existence of these functions unless they already exist:

```text
auth_context()
has_permission()
```

Inspect the existing Supabase migrations first and use the actual project RLS helper functions and patterns.

From previous phases, the project may include helpers such as:

```text
current_user_profile_id()
current_user_has_permission()
current_user_has_permission_any_scope()
current_user_is_global_admin()
```

Use the real existing helper names.

If a helper is missing, do not invent unsafe broad policies. Create only compatible secure helper functions if absolutely required and document why.

### 3. Use Existing Audit User Pattern

Do not reference `auth.users.id` directly for `created_by` / `updated_by` if the project uses BIGINT `user_profiles.id`.

Use the existing project pattern, expected to be:

```text
created_by BIGINT references public.user_profiles(id)
updated_by BIGINT references public.user_profiles(id)
deactivated_by BIGINT references public.user_profiles(id)
```

Follow the exact existing audit field style from 002F.3B and earlier migrations.

### 4. Clean Geography Hierarchy

Keep the geography hierarchy clean:

```text
Country → Emirate → City → Area / Zone
```

Do not duplicate industrial zones as both cities and areas.

Recommended structure:

## Cities

Use cities for actual cities / major municipalities:

```text
Abu Dhabi
Dubai
Sharjah
Ajman
Al Ain
Ras Al Khaimah
Fujairah
Umm Al Quwain
```

Optional city-level UAE locations can be included only if they are treated consistently.

## Areas / Zones

Use areas/zones for districts, industrial areas, free zones, ports/industrial zones:

```text
Mussafah
ICAD
KIZAD
Jebel Ali Free Zone
Hamriyah Free Zone
Al Quoz
Dubai Industrial City
Ruwais Industrial Area
Taweelah Industrial Area
Mafraq
```

Do not seed `Mussafah`, `ICAD`, `KIZAD`, etc. as both city and area unless there is a documented reason.

### 5. Work Sites Are Deferred Unless Explicitly Approved

Do not implement `work_sites` in 002F.3C.1 unless the project owner explicitly approves it during implementation.

For this implementation prompt, default decision is:

```text
DEFER WORK SITES
```

Reason:

Work Sites are operational/project-related and may later need:

- customer/project link
- site access requirements
- CICPA/security requirements
- HSE controls
- permit requirements
- site documents
- client ownership
- project status
- operational assignment

These belong better in 002F.3D or an operations/project foundation phase.

In 002F.3C.1, implement only:

```text
countries
emirates
cities
areas_zones
ports
```

You may include `SITE_TYPES` lookup only if clearly needed later, but do not create the `work_sites` table or UI in this phase.

### 6. Do Not Add Future Menus Yet

In this phase, add only:

```text
Master Data
└── Geography & Locations
    ├── Countries
    ├── Emirates
    ├── Cities
    ├── Areas / Zones
    └── Ports
```

Do not add Finance Basics menu.

Do not add UOM menu.

Do not add HR/CRM/Fleet/HSE/Scrap menus.

### 7. One Phase Only

Implement only:

```text
ERP BASE 002F.3C.1 — Geography & Locations
```

After implementation, generate the report and stop.

Do not proceed to 002F.3C.2.

---

# 1. Required Source Inspection Before Implementation

Before making changes, inspect the actual project source.

Review:

## 002F.3B Lookup Engine

- migration for `global_lookup_categories`
- migration for `global_lookup_values`
- lookup server actions
- LookupSelect component
- lookup RLS policies
- lookup permissions
- lookup audit pattern

## Foundation Tables and Helpers

- `user_profiles`
- `roles`
- `permissions`
- `role_permissions`
- `audit_logs`
- RLS helper functions
- `set_updated_at()` trigger
- owner company and branch tables
- existing sidebar/menu implementation

## UI Patterns

- ERPDrawerForm
- ERPDataTable
- ERPPageHeader
- ERPExportMenu
- existing lookup pages
- existing numbering pages
- organization/branch form patterns

Follow existing project conventions.

Do not invent parallel architecture.

---

# 2. Approved 002F.3C.1 Scope

Implement:

## Tables

1. `countries`
2. `emirates`
3. `cities`
4. `areas_zones`
5. `ports`

## Lookup Categories to Add

Add to existing `global_lookup_categories` / `global_lookup_values`:

1. `AREA_TYPES`
2. `PORT_TYPES`

Optional only if needed for future but no work_sites table:

3. `SITE_TYPES` may be seeded as future-ready, but do not create work_sites table/UI.

## Permissions

Add geography permissions only:

```text
master_data.geography.view
master_data.geography.manage
master_data.geography.export
master_data.geography.audit_view
```

Reuse existing:

```text
master_data.lookups.lock
```

Do not add finance or UOM permissions in this phase.

## UI Pages

Create:

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

unless explicitly approved.

## Components

Create:

- Countries table
- Country drawer form
- Emirates table
- Emirate drawer form
- Cities table
- City drawer form
- Areas/Zones table
- Area/Zone drawer form
- Ports table
- Port drawer form

Create select components if useful in forms:

- CountrySelect
- EmirateSelect
- CitySelect
- AreaZoneSelect
- PortSelect

## Sidebar

Add only Geography & Locations group.

## Report

Create implementation report:

`ERP_BASE_002F_3C_1_GEOGRAPHY_LOCATIONS_IMPLEMENTATION_REPORT.md`

---

# 3. Database Migration Requirements

Create one migration using project naming convention:

```text
supabase/migrations/YYYYMMDDHHMMSS_erp_base_002f3c1_geography_locations.sql
```

## General Table Standards

All tables must follow existing project style:

- BIGINT primary keys unless project convention differs
- `created_at`
- `created_by`
- `updated_at`
- `updated_by`
- `deactivated_at`
- `deactivated_by`
- `deactivation_reason`
- `is_active`
- `is_system`
- `is_locked`
- `sort_order`
- updated_at trigger
- RLS enabled
- no hard delete
- DELETE blocked by RLS or no delete policy
- comments on important tables/columns

## Table 1 — countries

Required fields:

- id
- country_code_iso2 or country_code
- country_code_iso3 or iso3_code
- country_name_en or name_en
- country_name_ar or name_ar
- nationality_en
- nationality_ar
- phone_code
- default_currency_code as text for now, because currencies table is in 002F.3C.2
- is_gcc
- is_uae
- is_active
- is_system
- is_locked
- sort_order
- created_at
- created_by
- updated_at
- updated_by
- deactivated_at
- deactivated_by
- deactivation_reason

Required constraints:

- ISO2 exactly 2 uppercase letters
- ISO3 exactly 3 uppercase letters
- unique ISO2
- unique ISO3
- phone_code format if practical
- only one UAE flag true if practical
- deactivation consistency if existing pattern supports it

Required indexes:

- ISO2
- ISO3
- is_active
- is_gcc
- is_uae
- sort_order

## Table 2 — emirates

Required fields:

- id
- country_id references countries
- emirate_code
- emirate_name_en or name_en
- emirate_name_ar or name_ar
- is_active
- is_system
- is_locked
- sort_order
- audit/deactivation fields

Required constraints:

- emirate_code uppercase
- unique emirate_code
- country must be UAE if practical, validated in app/server if not DB constraint

Required indexes:

- country_id
- emirate_code
- is_active
- sort_order

## Table 3 — cities

Required fields:

- id
- country_id references countries
- emirate_id references emirates nullable
- city_code
- city_name_en or name_en
- city_name_ar or name_ar
- is_capital
- is_active
- is_system
- is_locked
- sort_order
- audit/deactivation fields

Required constraints:

- city_code uppercase
- unique city_code within country/emirate scope
- if country is UAE, emirate should be required, either DB or server validation

Required indexes:

- country_id
- emirate_id
- city_code
- is_active
- sort_order

## Table 4 — areas_zones

Required fields:

- id
- country_id references countries
- emirate_id references emirates nullable
- city_id references cities nullable
- area_code
- area_name_en or name_en
- area_name_ar or name_ar
- area_type_lookup_id or area_type_code referencing/using `global_lookup_values`
- is_free_zone
- is_industrial_area
- is_port_area
- is_active
- is_system
- is_locked
- sort_order
- description
- audit/deactivation fields

Important:

If using lookup foreign key, it must reference existing `global_lookup_values`, not `lookup_values`.

Also validate that selected lookup value belongs to category `AREA_TYPES` in server logic or DB trigger if practical.

Required constraints:

- area_code uppercase
- unique area_code within city/emirate/country scope or globally if simpler
- valid booleans

Required indexes:

- country_id
- emirate_id
- city_id
- area_code
- is_free_zone
- is_industrial_area
- is_active

## Table 5 — ports

Required fields:

- id
- country_id references countries
- emirate_id references emirates nullable
- city_id references cities nullable
- port_code
- port_name_en or name_en
- port_name_ar or name_ar
- port_type_lookup_id or port_type_code referencing/using `global_lookup_values`
- operator_name
- website
- is_active
- is_system
- is_locked
- sort_order
- description
- audit/deactivation fields

Important:

If using lookup foreign key, it must reference existing `global_lookup_values`, not `lookup_values`.

Validate selected lookup value belongs to category `PORT_TYPES`.

Required constraints:

- port_code uppercase
- unique port_code
- website URL validation can be frontend/server if DB check is impractical

Required indexes:

- country_id
- emirate_id
- city_id
- port_code
- is_active

## Do Not Create Work Sites Table

Do not create:

```text
work_sites
```

In this phase.

Document it as deferred.

---

# 4. Lookup Seed Requirements

Add lookup categories/values into existing 002F.3B tables:

```text
global_lookup_categories
global_lookup_values
```

## AREA_TYPES

Seed values:

```text
INDUSTRIAL
FREE_ZONE
PORT_AREA
BUSINESS_PARK
RESIDENTIAL
MIXED_USE
```

## PORT_TYPES

Seed values:

```text
SEA_PORT
AIR_PORT
BORDER_CROSSING
DRY_PORT
```

## SITE_TYPES

Optional future-ready only. If added, make clear it is for future use and do not create work_sites table/UI.

If added, seed values:

```text
PROJECT_SITE
WAREHOUSE
WORKSHOP
YARD
OFFICE
SCRAP_YARD
```

All lookup seeds should be:

- is_system = true
- is_locked = true
- is_active = true

Use idempotent inserts.

Do not duplicate if already exists.

---

# 5. Geography Seed Data Requirements

## Countries

Seed at minimum:

```text
United Arab Emirates
Saudi Arabia
Oman
Qatar
Bahrain
Kuwait
Jordan
India
Pakistan
Philippines
Bangladesh
Nepal
Sri Lanka
Egypt
Syria
Lebanon
United Kingdom
United States
China
Japan
Germany
Italy
France
Turkey
Australia
```

Include:

- ISO2
- ISO3
- name EN
- name AR if possible
- nationality EN
- nationality AR if possible
- phone code
- default currency code as text
- is_gcc
- is_uae
- sort order

System/locked:

- UAE and GCC countries should be system/locked.
- Other countries can be system or not depending on existing seed strategy, but document clearly.

## Emirates

Seed all 7 UAE Emirates:

```text
AUH — Abu Dhabi
DXB — Dubai
SHJ — Sharjah
AJM — Ajman
UAQ — Umm Al Quwain
RAK — Ras Al Khaimah
FUJ — Fujairah
```

All should be system/locked/active.

## Cities

Seed actual cities / major municipalities only. Recommended:

```text
ABU_DHABI — Abu Dhabi — AUH
DUBAI — Dubai — DXB
SHARJAH — Sharjah — SHJ
AJMAN — Ajman — AJM
AL_AIN — Al Ain — AUH
RAS_AL_KHAIMAH — Ras Al Khaimah — RAK
FUJAIRAH — Fujairah — FUJ
UMM_AL_QUWAIN — Umm Al Quwain — UAQ
```

Optional if you clearly classify them as cities:

```text
RUWAIS — Ruwais — AUH
```

Do not seed Mussafah, ICAD, KIZAD, JAFZA, Hamriyah Free Zone, Al Quoz, etc. as cities. These belong in Areas/Zones unless justified.

## Areas / Zones

Seed key UAE areas/zones:

```text
MUSSAFAH — Mussafah
ICAD — Industrial City of Abu Dhabi
KIZAD — Khalifa Industrial Zone / KEZAD/KIZAD
JAFZA — Jebel Ali Free Zone
HAMRIYAH_FZ — Hamriyah Free Zone
AL_QUOZ — Al Quoz
DUBAI_INDUSTRIAL_CITY — Dubai Industrial City
RUWAIS_INDUSTRIAL — Ruwais Industrial Area
TAWEELAH_INDUSTRIAL — Taweelah Industrial Area
MAFRAQ — Mafraq
```

Assign each to country/emirate/city as accurately as practical.

If exact city mapping is unclear, use city as nearest major city and document.

## Ports

Seed major UAE ports:

```text
KHALIFA_PORT — Khalifa Port — Abu Dhabi
ZAYED_PORT — Zayed Port — Abu Dhabi
JEBEL_ALI_PORT — Jebel Ali Port — Dubai
PORT_RASHID — Port Rashid — Dubai
HAMRIYAH_PORT — Hamriyah Port — Sharjah
FUJAIRAH_PORT — Fujairah Port — Fujairah
MINA_SAQR — Mina Saqr — Ras Al Khaimah
```

Do not over-seed ports.

---

# 6. Permissions Requirements

Add only geography permissions:

```text
master_data.geography.view
master_data.geography.manage
master_data.geography.export
master_data.geography.audit_view
```

Role assignment:

## system_admin

All geography permissions.

## group_admin

```text
master_data.geography.view
master_data.geography.manage
master_data.geography.export
master_data.geography.audit_view
```

## company_admin

```text
master_data.geography.view
master_data.geography.export
```

## branch_admin

```text
master_data.geography.view
```

## normal users

Do not assign admin page view permission by default unless existing role policy requires it.

Normal users can access active geography values through safe select/dropdown services if needed.

Do not add finance or UOM permissions in this phase.

---

# 7. RLS Requirements

Enable RLS on:

```text
countries
emirates
cities
areas_zones
ports
```

## Read Access

Admin pages should require `master_data.geography.view`.

However, active geography records should be readable through safe select/dropdown services for valid ERP users.

Implementation may choose either:

1. RLS SELECT allows valid authenticated ERP users to read active geography records.
2. Server action/service provides active geography records safely.

Use the existing project pattern from 002F.3B.

## Write Access

Insert/update/deactivate requires:

```text
master_data.geography.manage
```

Locked row update requires:

```text
master_data.lookups.lock
```

## Delete

Hard delete must be blocked.

Use deactivation instead.

## Unsafe Policy Restrictions

Do not create unsafe public write policies.

Do not use broad unrestricted write access.

Do not expose service role to frontend.

---

# 8. Audit Logging Requirements

Use existing audit log helper/pattern.

Audit these actions:

## Countries

- country.create
- country.update
- country.activate
- country.deactivate
- country.lock
- country.unlock

## Emirates

- emirate.create
- emirate.update
- emirate.activate
- emirate.deactivate
- emirate.lock
- emirate.unlock

## Cities

- city.create
- city.update
- city.activate
- city.deactivate
- city.lock
- city.unlock

## Areas / Zones

- area_zone.create
- area_zone.update
- area_zone.activate
- area_zone.deactivate
- area_zone.lock
- area_zone.unlock

## Ports

- port.create
- port.update
- port.activate
- port.deactivate
- port.lock
- port.unlock

Audit records must include:

- module code
- entity name
- entity id
- entity reference/code
- action
- old values where applicable
- new values where applicable
- actor/user
- timestamps

---

# 9. Server Actions / Services

Create geography server actions file:

```text
src/server/actions/master-data/geography.ts
```

Follow existing 002F.3B action pattern.

For each table, implement:

## Countries

- listCountries
- getCountryById
- createCountry
- updateCountry
- toggleCountryStatus
- toggleCountryLock
- getActiveCountriesForSelect
- exportCountries if export engine is stable

## Emirates

- listEmirates
- getEmirateById
- createEmirate
- updateEmirate
- toggleEmirateStatus
- toggleEmirateLock
- getActiveEmiratesForSelect
- exportEmirates if export engine is stable

## Cities

- listCities
- getCityById
- createCity
- updateCity
- toggleCityStatus
- toggleCityLock
- getActiveCitiesForSelect
- exportCities if export engine is stable

## Areas / Zones

- listAreasZones
- getAreaZoneById
- createAreaZone
- updateAreaZone
- toggleAreaZoneStatus
- toggleAreaZoneLock
- getActiveAreasZonesForSelect
- exportAreasZones if export engine is stable

## Ports

- listPorts
- getPortById
- createPort
- updatePort
- togglePortStatus
- togglePortLock
- getActivePortsForSelect
- exportPorts if export engine is stable

For every mutation:

- validate input
- check permission
- check locked status
- audit changes
- revalidate relevant route
- return typed ActionResult

---

# 10. TypeScript Types and Validation

Create:

```text
src/features/master-data/geography/types.ts
src/features/master-data/geography/validation.ts
```

Use Zod validation.

Required validation:

## Country

- ISO2 exactly 2 uppercase letters
- ISO3 exactly 3 uppercase letters
- name_en required
- nationality_en required
- phone_code optional
- default_currency_code optional text, 3 uppercase letters if provided
- only one is_uae true if practical

## Emirate

- emirate_code uppercase
- country_id required
- country must be UAE, server validation if needed
- name_en required

## City

- city_code uppercase
- country_id required
- emirate_id required if UAE
- name_en required
- unique city scope

## Area / Zone

- area_code uppercase
- country_id required
- city_id optional but recommended
- area_type must belong to AREA_TYPES if provided
- name_en required

## Port

- port_code uppercase
- country_id required
- port_type must belong to PORT_TYPES if provided
- name_en required
- website optional URL

---

# 11. UI Pages and Components

Use existing ERP components:

- ERPPageHeader
- ERPDataTable
- ERPDrawerForm
- ERPFieldGrid
- ERPExportMenu if stable
- LookupSelect for lookup fields

Create pages:

```text
src/app/(protected)/admin/master-data/geography/countries/page.tsx
src/app/(protected)/admin/master-data/geography/emirates/page.tsx
src/app/(protected)/admin/master-data/geography/cities/page.tsx
src/app/(protected)/admin/master-data/geography/areas/page.tsx
src/app/(protected)/admin/master-data/geography/ports/page.tsx
```

Do not create `/sites` page.

## Countries Page

Route:

```text
/admin/master-data/geography/countries
```

Columns:

- ISO2 / Country Code
- ISO3
- Name EN
- Name AR
- Nationality
- Phone Code
- Default Currency Code
- GCC
- UAE
- Active
- Locked
- Updated At
- Actions

Drawer sections:

1. Basic Information
2. Regional / Contact Details
3. Status & Governance
4. Audit Information

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
- Locked
- Updated At
- Actions

Drawer sections:

1. Basic Information
2. Country Link
3. Status & Governance
4. Audit Information

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
- Locked
- Updated At
- Actions

Drawer sections:

1. Basic Information
2. Geography Link
3. Status & Governance
4. Audit Information

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
- Locked
- Updated At
- Actions

Drawer sections:

1. Basic Information
2. Geography Link
3. Area Classification
4. Status & Governance
5. Audit Information

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
- Active
- Locked
- Updated At
- Actions

Drawer sections:

1. Basic Information
2. Geography Link
3. Port Details
4. Status & Governance
5. Audit Information

---

# 12. Select Components

Create select components if needed for forms and future phases:

```text
src/features/master-data/geography/components/country-select.tsx
src/features/master-data/geography/components/emirate-select.tsx
src/features/master-data/geography/components/city-select.tsx
src/features/master-data/geography/components/area-zone-select.tsx
src/features/master-data/geography/components/port-select.tsx
```

Do not create WorkSiteSelect in this phase.

## Required Select Behavior

- load active records only
- searchable where practical
- loading state
- error state
- empty state
- disabled state
- support dependent filters:
  - emirates by country
  - cities by country/emirate
  - areas by city/emirate
  - ports by country/emirate/type
- safe for normal user dropdown usage
- no service key exposure

---

# 13. Sidebar Integration

Modify existing sidebar/menu only as needed.

Add:

```text
Master Data
└── Geography & Locations
    ├── Countries
    ├── Emirates
    ├── Cities
    ├── Areas / Zones
    └── Ports
```

Do not add:

```text
Work Sites
Finance Basics
Units & Measurements
HR Master Data
Fleet Master Data
CRM Master Data
HSE Master Data
Scrap / Waste / Demolition Master Data
```

Sidebar visibility:

- Geography group visible only with `master_data.geography.view`
- Add/edit buttons visible only with `master_data.geography.manage`
- Lock/unlock visible only with `master_data.lookups.lock`
- Export visible only with `master_data.geography.export`

---

# 14. Export / Import

## Export

Implement export if existing ERP export engine is stable.

Each table should support export:

- CSV
- Excel if supported
- PDF if supported

Export permission:

```text
master_data.geography.export
```

If export is not stable, hide/disable and document as deferred.

## Import

Do not implement import.

Do not show active import button.

No upload flow.

---

# 15. Testing Requirements

Run and report:

## Database Tests

- migration applies
- tables exist
- constraints exist
- indexes exist
- triggers exist
- seed countries exist
- 7 emirates exist
- cities/areas/ports seeds exist
- lookup categories/values added
- RLS enabled

## Permission Tests

- system_admin can view/manage/export/audit
- group_admin can view/manage/export/audit
- company_admin can view/export only
- branch_admin can view only
- normal users cannot access admin pages unless granted

## RLS Tests

- read behavior works as designed
- insert/update blocked without manage
- locked rows protected
- delete blocked
- active select services work

## UI Tests

- all 5 geography pages load
- tables load
- filters/search work
- add/edit/view drawers work
- fields visible
- create/update works
- deactivate/reactivate works
- lock/unlock works
- export works if enabled
- sidebar works

## Build Tests

Run:

```text
npm run typecheck
npm run lint
npm run build
npm test if available
```

Document results.

---

# 16. Required Implementation Report

Create:

```text
ERP_BASE_002F_3C_1_GEOGRAPHY_LOCATIONS_IMPLEMENTATION_REPORT.md
```

Report must include:

1. Phase name.
2. Date.
3. Summary.
4. Files created.
5. Files modified.
6. Migration created.
7. Tables created.
8. Lookup categories/values added.
9. Seed data created.
10. Permissions created.
11. RLS policies created.
12. Audit logging implemented.
13. Server actions created.
14. UI pages created.
15. Select components created.
16. Sidebar changes.
17. Work Sites status: deferred.
18. Tests run.
19. Security/RLS validation.
20. Known limitations.
21. Deferred items.
22. Final status.

At end write:

```text
ERP BASE 002F.3C.1 is ready for Sameer review.
```

Then one of:

```text
PASS
PASS WITH NOTES
FAIL
```

Do not proceed to 002F.3C.2.

---

# 17. Known Limitations to Document

Document if applicable:

- Work Sites deferred.
- Existing organization/branch text fields not migrated yet.
- Existing hardcoded dropdowns not migrated yet.
- Finance Basics not implemented.
- UOM not implemented.
- Import not implemented.
- Deep geography hierarchy edge cases if any.

---

# 18. Final Instruction

Implement only:

```text
ERP BASE 002F.3C.1 — Geography & Locations
```

Do not implement other phases.

Do not start 002F.3C.2.

Generate the implementation report and stop.
