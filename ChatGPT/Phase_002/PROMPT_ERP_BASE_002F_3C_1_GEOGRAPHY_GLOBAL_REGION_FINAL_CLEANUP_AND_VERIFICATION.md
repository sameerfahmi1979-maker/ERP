# PROMPT_ERP_BASE_002F_3C_1_GEOGRAPHY_GLOBAL_REGION_FINAL_CLEANUP_AND_VERIFICATION

Act as a senior ERP QA lead, Supabase/PostgreSQL RLS auditor, Playwright automation engineer, Next.js runtime tester, SaaS security tester, notification-engine validation specialist, senior Next.js/Supabase implementation engineer, enterprise ERP master-data auditor, and UAE/international geography master-data reviewer.

## Phase

ERP BASE 002F.3C.1 — Geography & Locations Global Region Final Cleanup and Verification

## Implementation Mode

This is a FINAL CLEANUP AND VERIFICATION prompt.

We are still in ERP BASE 002F.3C.1.

Do not start ERP BASE 002F.3C.2.

Do not implement Finance Basics.

Do not implement Units & Measurements.

Do not implement Work Sites.

Do not implement CRM, HR, Fleet, Workshop, Inventory, Procurement, HSE, DMS, Scrap/Waste/Demolition, or Accounting.

Your task is to complete the remaining final cleanup items for the Geography Global Region fix, run full verification, browser-test the module, and generate a final closure report.

## Reference Reports

Review before starting:

```text
ERP_BASE_002F_3C_1_GEOGRAPHY_GLOBAL_REGION_IMPLEMENTATION_REPORT.md
ERP_BASE_002F_3C_1_GEOGRAPHY_GLOBAL_REGION_COMPLETION_FIX_REPORT.md
ERP_BASE_002F_3C_1_GEOGRAPHY_FULL_MODULE_AUDIT_AND_VALIDATION_REPORT.md
```

The latest report says the core functionality is implemented, but these final items remain:

```text
Table column labels still pending
Sidebar menu label still pending
Emirates page title still pending
Typecheck not run
Lint not run
Build not run
Browser testing not done
```

This prompt is only to complete those remaining items and confirm final closure.

## Current Accepted Functionality

The following is already accepted and should not be redesigned:

```text
emirates table remains as the internal administrative region table
emirate_id remains as the internal region reference
cities.emirate_id remains required
ports.emirate_id remains required
country_id exists on emirates, cities, and ports
region_type_code exists on emirates
REGION_TYPES lookup exists
CountrySelect added to City form
CountrySelect added to Port form
CountrySelect added to Region / Emirate form
EmirateSelect supports countryId filtering
```

Do not rename database tables.

Do not rename database columns.

Do not make emirate_id nullable.

## Critical Business Rule

Sameer confirmed:

```text
Global admin / system_admin must be able to view, insert, edit, delete, lock, and unlock all geography records all the time.
```

This must remain true.

---

# 1. Final UI Label Cleanup

Complete all remaining user-facing label cleanup.

## 1.1 Sidebar

Update:

```text
Emirates
```

to:

```text
Regions / Emirates
```

In:

```text
src/components/layout/app-sidebar.tsx
```

Keep route unchanged:

```text
/admin/master-data/geography/emirates
```

Do not rename the route.

## 1.2 Regions / Emirates Page Title

Update:

```text
src/app/(protected)/admin/master-data/geography/emirates/page.tsx
```

Change page title from:

```text
Emirates
```

to:

```text
Regions / Emirates
```

Update description to something like:

```text
Manage country administrative regions such as UAE Emirates, Jordan Governorates, US States, Saudi Regions, and Provinces.
```

Do not change the route.

## 1.3 Table Column Labels

Update table labels from:

```text
Emirate
```

to:

```text
Region / Emirate / Governorate
```

In:

```text
src/features/master-data/geography/components/cities-table.tsx
src/features/master-data/geography/components/ports-table.tsx
src/features/master-data/geography/components/areas-table.tsx
```

If the column width becomes too wide, use a shorter label:

```text
Region / Emirate
```

But the tooltip/description should clarify:

```text
Region / Emirate / Governorate / State / Province
```

## 1.4 Form Labels

Verify the following already use global wording:

```text
city-form-dialog.tsx
port-form-dialog.tsx
emirate-form-dialog.tsx
```

Make sure user-facing labels/messages do not say only:

```text
Emirate
```

where the global concept is meant.

Acceptable labels:

```text
Region / Emirate / Governorate
Region / Emirate
Administrative Region
Region Type
```

---

# 2. Verify Server Actions Save New Fields

Review:

```text
src/features/master-data/geography/actions.ts
```

Confirm these actions properly save:

## createEmirate / updateEmirate

```text
country_id
region_type_code
```

## createCity / updateCity

```text
country_id
emirate_id
```

## createPort / updatePort

```text
country_id
emirate_id
```

If the form passes `country_id` but the server action strips it or validation drops it, fix it.

If country_id inference from emirate_id is missing, add a small safe fallback:

```text
If country_id is null/undefined and emirate_id is provided, fetch emirates.country_id and use it.
```

Also validate mismatch if both are supplied:

```text
If country_id and emirate_id are both provided, confirm selected region/emirate belongs to selected country.
If mismatch, return a friendly error.
```

Friendly error:

```text
Selected Region / Emirate / Governorate does not belong to the selected country.
```

Do not break existing UAE city/port create/edit flow.

---

# 3. Verify Select Component Behavior

Review:

```text
src/components/erp/geography/emirate-select.tsx
```

Confirm:

- accepts `countryId`
- filters by `country_id`
- refetches when countryId changes
- shows empty state: `No regions found for selected country`
- no service role key exposed
- works when countryId is null
- continues working with UAE data

---

# 4. Verify Forms

Review and test:

```text
src/features/master-data/geography/components/city-form-dialog.tsx
src/features/master-data/geography/components/port-form-dialog.tsx
src/features/master-data/geography/components/emirate-form-dialog.tsx
```

Confirm:

## City form

- Country appears before Region / Emirate / Governorate.
- Region list filters by selected country.
- Region is disabled until country is selected.
- Changing country clears invalid region.
- Saves country_id and emirate_id.
- Edit mode loads existing country/region correctly.
- View mode disables fields.

## Port form

- Same behavior as city form.

## Region / Emirate form

- Country field exists.
- Region Type field exists using REGION_TYPES.
- Saves country_id and region_type_code.
- Existing UAE Emirates show UAE and EMIRATE.
- Edit/view/add modes work.

---

# 5. Run Typecheck / Lint / Build

Run:

```text
npm run typecheck
npm run lint
npm run build
```

If `npm run lint` shows old unrelated errors, separate them clearly:

```text
Geography module lint errors: none / list
Legacy unrelated lint errors: list
```

All geography-related typecheck/build/lint errors must be fixed.

If `npm test` exists and is practical, run it:

```text
npm test
```

Document results.

---

# 6. Browser Testing

Perform browser testing.

## 6.1 UAE Backward Compatibility

Test:

```text
/admin/master-data/geography/emirates
/admin/master-data/geography/cities
/admin/master-data/geography/areas
/admin/master-data/geography/ports
```

Confirm:

1. Regions / Emirates page loads.
2. Existing UAE Emirates show country = UAE.
3. Existing UAE Emirates show region type = EMIRATE.
4. Existing UAE cities display correctly.
5. Existing UAE areas display correctly.
6. Existing UAE ports display correctly.
7. Add UAE city works:
   - Country = United Arab Emirates
   - Region = Abu Dhabi / Dubai / etc.
8. Edit UAE city works.
9. Add UAE port works.
10. Edit UAE port works.
11. Lock/unlock still works.
12. Delete as system_admin still works.
13. Non-system_admin delete remains hidden/blocked if tested.

## 6.2 Global Support — Jordan

Test:

1. Confirm Jordan exists in countries.
2. Confirm Amman Governorate exists or create it:
   - Country = Jordan
   - Region Type = GOVERNORATE
   - Region = Amman Governorate
3. Create or verify Amman city:
   - Country = Jordan
   - Region / Emirate / Governorate = Amman Governorate
   - City = Amman
4. Confirm city table displays Amman correctly.
5. Confirm region filtering:
   - Selecting Jordan shows Jordan governorates only.
   - Selecting UAE shows UAE emirates only.
6. Edit Amman city.
7. Lock/unlock Amman city.
8. Delete test records as system_admin only if they were created only for testing.

## 6.3 Optional Global Support — Saudi / USA

If seed data exists, test one:

```text
Saudi Arabia → Riyadh Region → Riyadh
USA → California → Los Angeles
```

## 6.4 Console / Runtime

Confirm:

- no browser console errors
- no hydration errors
- no missing field errors
- no broken import/export paths
- no route mismatch

---

# 7. RLS and Permission Verification

Confirm after final cleanup:

```text
system_admin can view/insert/edit/delete/lock/unlock all geography records
group_admin behavior unchanged
company_admin behavior unchanged
branch_admin behavior unchanged
normal user behavior unchanged
```

Confirm:

- delete remains system_admin only
- lock/unlock remains restricted to system_admin or approved lock permission
- country filtering does not bypass RLS
- no service role key exposed to client

---

# 8. Required Final Report

Create:

```text
ERP_BASE_002F_3C_1_GEOGRAPHY_GLOBAL_REGION_FINAL_CLEANUP_AND_VERIFICATION_REPORT.md
```

The report must include:

1. Phase name.
2. Date.
3. Summary of remaining issues from previous report.
4. Files reviewed.
5. Files modified.
6. Sidebar label cleanup.
7. Page title cleanup.
8. Table label cleanup.
9. Form label verification.
10. Server action field-saving verification.
11. Country inference / mismatch validation status.
12. EmirateSelect / region select behavior verification.
13. City form test result.
14. Port form test result.
15. Region / Emirate form test result.
16. UAE backward compatibility browser test result.
17. Jordan/global browser test result.
18. RLS/permission verification.
19. Global admin full access verification.
20. Typecheck result.
21. Lint result.
22. Build result.
23. Remaining known limitations.
24. Final decision.

At the end write exactly one:

```text
PASS — ERP BASE 002F.3C.1 Geography Global Region Fix is fully complete and ready to close.
PASS WITH NOTES — ERP BASE 002F.3C.1 Geography Global Region Fix is acceptable with minor non-blocking notes.
FAIL — ERP BASE 002F.3C.1 Geography Global Region Fix still requires correction.
```

## Remaining Known Limitation To Keep

Document this technical compromise:

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

Complete only final cleanup and verification for the Geography Global Region fix.

Do not start ERP BASE 002F.3C.2.

Generate the final cleanup and verification report and stop.
