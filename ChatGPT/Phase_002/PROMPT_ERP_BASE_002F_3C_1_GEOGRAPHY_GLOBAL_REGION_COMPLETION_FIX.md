# PROMPT_ERP_BASE_002F_3C_1_GEOGRAPHY_GLOBAL_REGION_COMPLETION_FIX

Act as a senior ERP QA lead, Supabase/PostgreSQL RLS auditor, Playwright automation engineer, Next.js runtime tester, SaaS security tester, notification-engine validation specialist, senior Next.js/Supabase implementation engineer, enterprise ERP master-data architect, UAE and international geography master-data consultant, and migration safety reviewer.

## Phase

ERP BASE 002F.3C.1 — Geography & Locations Global Region Completion Fix

## Implementation Mode

This is a COMPLETION FIX prompt.

The global region database migration has already been applied by Sameer.

Do not recreate the migration unless a small corrective migration is absolutely required.

Do not start ERP BASE 002F.3C.2.

Do not implement Finance Basics.

Do not implement Units & Measurements.

Do not implement Work Sites.

Do not implement CRM, HR, Fleet, Workshop, Inventory, Procurement, HSE, DMS, Scrap/Waste/Demolition, or Accounting.

Your task is to complete the remaining global-region compatibility work for ERP BASE 002F.3C.1.

## Current Status

The migration has already been applied to the database.

The previous implementation report confirmed that the following backend/database direction was prepared:

- `country_id` added to `emirates`
- `region_type_code` added to `emirates`
- `country_id` added to `cities`
- `country_id` added to `ports`
- `REGION_TYPES` lookup category created
- `EmirateSelect` updated with country filtering
- TypeScript types partially updated
- Validation schemas partially updated
- `getEmirates`, `getCities`, and `getPorts` filters partially updated

But these items still require completion:

1. Update City form with CountrySelect before Region/Emirate select.
2. Update Port form with CountrySelect before Region/Emirate select.
3. Update Regions/Emirates form with CountrySelect and REGION_TYPES LookupSelect.
4. Update UI labels to “Region / Emirate / Governorate” or “Regions / Emirates.”
5. Update create/update actions to save `country_id` and `region_type_code`.
6. Infer `country_id` from selected region if missing.
7. Run typecheck, lint, and build.
8. Browser-test UAE backward compatibility.
9. Browser-test Jordan → Amman Governorate → Amman.
10. Confirm system_admin full access still works.
11. Generate final completion report.

## Critical Business Rule

Sameer confirmed:

```text
Global admin / system_admin must be able to view, insert, edit, delete, lock, and unlock all geography records all the time.
```

This must remain true after all fixes.

## Critical Database Compatibility Rule

Do not rename database objects:

```text
Do not rename emirates table.
Do not rename emirate_id column.
Do not make cities.emirate_id nullable.
Do not make ports.emirate_id nullable.
```

The technical compromise remains:

```text
emirates table = administrative regions conceptually
emirate_id column = region/emirate/governorate reference conceptually
```

## Critical Lookup Rule

Use only the existing lookup tables:

```text
global_lookup_categories
global_lookup_values
```

Do not use or create:

```text
lookup_categories
lookup_values
```

---

# 1. Verify Migration State First

Before making UI/action changes, verify the applied database state.

Confirm:

```text
emirates.country_id exists
emirates.region_type_code exists
cities.country_id exists
ports.country_id exists
REGION_TYPES exists in global_lookup_categories
REGION_TYPES values exist in global_lookup_values
Existing UAE emirates have country_id linked to UAE
Existing UAE emirates have region_type_code = EMIRATE
Existing UAE cities have country_id linked to UAE
Existing UAE ports have country_id linked to UAE
```

If the migration is incomplete, document the issue and create a small corrective migration only if required.

Do not recreate the already-applied migration.

---

# 2. Complete City Form

Update:

```text
src/features/master-data/geography/components/city-form-dialog.tsx
```

Required form flow:

```text
Country
Region / Emirate / Governorate
City details
```

Requirements:

1. Add `CountrySelect` above the region/emirate select.
2. Add `countryId` state.
3. Initialize `countryId` from:
   - `city.country_id`, or
   - `city.emirate.country_id` if available, or
   - null.
4. Pass `countryId` to `EmirateSelect`.
5. Rename user-facing label from “Emirate” to:

```text
Region / Emirate / Governorate
```

6. When country changes:
   - clear selected region if the existing selected region belongs to a different country, or simply clear selected region safely.
7. Keep `emirate_id` required.
8. Save both:
   - `country_id`
   - `emirate_id`
9. In view mode, fields must be disabled.
10. In edit mode, existing data must load correctly.
11. Add clear validation messages.

Important:

```text
Do not remove emirate_id.
Do not make emirate_id optional.
```

---

# 3. Complete Port Form

Update:

```text
src/features/master-data/geography/components/port-form-dialog.tsx
```

Required form flow:

```text
Country
Region / Emirate / Governorate
Port details
```

Requirements:

1. Add `CountrySelect` above the region/emirate select.
2. Add `countryId` state.
3. Initialize `countryId` from:
   - `port.country_id`, or
   - `port.emirate.country_id` if available, or
   - null.
4. Pass `countryId` to `EmirateSelect`.
5. Rename user-facing label from “Emirate” to:

```text
Region / Emirate / Governorate
```

6. When country changes, clear invalid selected region.
7. Keep `emirate_id` required.
8. Save both:
   - `country_id`
   - `emirate_id`
9. In view mode, fields must be disabled.
10. In edit mode, existing data must load correctly.

---

# 4. Complete Regions / Emirates Form

Update:

```text
src/features/master-data/geography/components/emirate-form-dialog.tsx
```

This form currently manages records in the `emirates` table, which now conceptually represents administrative regions.

Required changes:

1. Add `CountrySelect`.
2. Add `LookupSelect` for:

```text
REGION_TYPES
```

3. Add state for:
   - `countryId`
   - `regionTypeCode`
4. Save:
   - `country_id`
   - `region_type_code`
5. Update labels:
   - Page/entity label: `Region / Emirate / Governorate`
   - Code label: `Region Code`
   - Name label: `Region Name`
   - Region type label: `Region Type`
6. Existing UAE emirates should show:
   - Country = United Arab Emirates
   - Region Type = EMIRATE
7. In add mode:
   - country is required
   - region type is recommended/required if practical
8. In edit mode:
   - existing values load correctly
9. In view mode:
   - fields are disabled

Do not rename the component file unless necessary.

---

# 5. Complete UI Label Updates

Update labels only, not routes.

## Sidebar

Update:

```text
Emirates
```

to:

```text
Regions / Emirates
```

in:

```text
src/components/layout/app-sidebar.tsx
```

Keep route:

```text
/admin/master-data/geography/emirates
```

## Emirates Page

Update page title and description:

Preferred:

```text
Regions / Emirates
```

Description example:

```text
Manage country administrative regions such as UAE Emirates, Jordan Governorates, US States, and Provinces.
```

## Tables

Update column labels from `Emirate` to:

```text
Region / Emirate / Governorate
```

In:

```text
src/features/master-data/geography/components/cities-table.tsx
src/features/master-data/geography/components/ports-table.tsx
src/features/master-data/geography/components/areas-table.tsx
```

## Forms

Update all user-facing labels/messages from `Emirate` to:

```text
Region / Emirate / Governorate
```

where the concept is global.

---

# 6. Complete Create / Update Server Actions

Update:

```text
src/features/master-data/geography/actions.ts
```

## createEmirate / updateEmirate

Must accept and save:

```text
country_id
region_type_code
```

If region_type_code is missing and country is UAE, default to:

```text
EMIRATE
```

Do not overwrite existing non-null values unnecessarily.

## createCity / updateCity

Must accept and save:

```text
country_id
emirate_id
```

If `country_id` is not supplied but `emirate_id` is supplied, infer:

```text
country_id = selected emirates.country_id
```

If both are supplied, optionally validate selected region belongs to selected country.

If mismatch, return a clear error:

```text
Selected Region / Emirate / Governorate does not belong to the selected country.
```

Keep `emirate_id` required.

## createPort / updatePort

Same logic:

- accept country_id
- infer from emirate_id if missing
- validate country/region consistency if both exist
- keep emirate_id required

## getEmirates

Already partially updated. Verify:

- accepts country_id filter
- returns `country_id`
- returns `region_type_code`

## getCities

Verify:

- accepts country_id filter
- returns country_id
- returns joined region/emirate data including country_id if needed

## getPorts

Verify:

- accepts country_id filter
- returns country_id
- returns joined region/emirate data including country_id if needed

## Audit

Audit create/update should include:

```text
country_id
region_type_code
```

No audit schema change required.

---

# 7. Complete Types and Validation If Needed

Update:

```text
src/features/master-data/geography/types.ts
src/features/master-data/geography/validation.ts
```

Confirm:

## Types

- `Emirate` includes `country_id` and `region_type_code`
- `City` includes `country_id`
- `Port` includes `country_id`
- create/update inputs include required new optional fields
- filters include country_id
- `AdministrativeRegion = Emirate` alias exists if useful

## Validation

- create/update emirate schemas accept `country_id` and `region_type_code`
- create/update city schemas accept `country_id`
- create/update port schemas accept `country_id`
- user-facing error uses Region / Emirate / Governorate
- `emirate_id` remains required for city and port

---

# 8. Complete Select Component Behavior

Update/verify:

```text
src/components/erp/geography/emirate-select.tsx
```

Required:

- accepts `countryId`
- filters by `country_id` if provided
- refetches when countryId changes
- displays empty state:
  - `No regions found for selected country`
- uses user-facing label:
  - `Region / Emirate / Governorate`
- does not expose service role key
- continues working for UAE existing data

---

# 9. Testing Requirements

Run:

```text
npm run typecheck
npm run lint
npm run build
npm test if available
```

If lint has unrelated legacy errors, separate them clearly.

All geography module issues must be fixed.

## Browser Testing — UAE Backward Compatibility

Test:

1. Regions / Emirates page loads.
2. Existing UAE emirates show UAE as country.
3. Existing UAE emirates show EMIRATE as region type.
4. Existing UAE cities still display correctly.
5. Existing UAE areas still display correctly.
6. Existing UAE ports still display correctly.
7. Add UAE city works:
   - Country = UAE
   - Region = Dubai / Abu Dhabi / etc.
8. Edit UAE city works.
9. Add UAE port works.
10. Edit UAE port works.
11. Lock/unlock still works.
12. Delete as system_admin still works.

## Browser Testing — Global Support

Test Jordan:

1. Confirm Jordan country exists.
2. Confirm Amman Governorate exists or create it:
   - Country = Jordan
   - Region Type = GOVERNORATE
   - Name = Amman Governorate
3. Create Amman city:
   - Country = Jordan
   - Region / Emirate / Governorate = Amman Governorate
   - City = Amman
4. Confirm city table displays Amman correctly.
5. Confirm region filtering:
   - selecting Jordan only shows Jordan governorates.
   - selecting UAE only shows UAE emirates.
6. Edit Amman city.
7. Lock/unlock Amman city.
8. Delete test record as system_admin if created only for testing.

Test at least one more global example if seed exists:

- Saudi Arabia → Riyadh Region → Riyadh
- USA → California → Los Angeles

## Permission Testing

Confirm:

- system_admin can view/insert/edit/delete/lock/unlock all.
- group_admin can manage according to current permissions, but cannot hard delete if system_admin-only delete remains.
- company_admin/branch_admin behavior remains unchanged.

---

# 10. Required Final Report

Create:

```text
ERP_BASE_002F_3C_1_GEOGRAPHY_GLOBAL_REGION_COMPLETION_FIX_REPORT.md
```

The report must include:

1. Phase name.
2. Date.
3. Summary of pending items completed.
4. Migration state verification.
5. Files reviewed.
6. Files modified.
7. City form changes.
8. Port form changes.
9. Regions / Emirates form changes.
10. UI label changes.
11. Server action changes.
12. Type/validation changes.
13. Select component behavior.
14. UAE backward compatibility test.
15. Jordan/global support test.
16. RLS/permission verification.
17. Global admin full access verification.
18. Typecheck result.
19. Lint result.
20. Build result.
21. Remaining known limitations.
22. Final status.

At the end write exactly one:

```text
PASS — Geography global region compatibility completion fix is complete and 002F.3C.1 is ready to close.
PASS WITH NOTES — Geography global region compatibility completion fix works with minor non-blocking notes.
FAIL — Geography global region compatibility completion fix requires correction.
```

## Known Limitation To Document

Document:

```text
The database table remains named emirates and FK column remains emirate_id for compatibility.
Conceptually, these represent administrative regions globally.
A future deep refactor may rename them to administrative_regions / administrative_region_id if needed.
```

Also document:

```text
cities.emirate_id and ports.emirate_id remain required in this phase.
Countries without a region layer should use a generic national region record for now.
```

## Final Instruction

Complete recommendations 2 through 11 only.

Do not recreate the applied migration unless a corrective migration is required.

Do not start ERP BASE 002F.3C.2.

Generate the completion fix report and stop.
