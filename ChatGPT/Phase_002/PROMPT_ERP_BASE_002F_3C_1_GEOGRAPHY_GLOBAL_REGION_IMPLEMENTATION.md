# PROMPT_ERP_BASE_002F_3C_1_GEOGRAPHY_GLOBAL_REGION_IMPLEMENTATION

Act as a senior ERP QA lead, Supabase/PostgreSQL RLS auditor, Playwright automation engineer, Next.js runtime tester, SaaS security tester, notification-engine validation specialist, senior Next.js/Supabase implementation engineer, enterprise ERP master-data architect, UAE and international geography master-data consultant, and migration safety reviewer.

## Phase

ERP BASE 002F.3C.1 — Geography & Locations Global Region Compatibility Fix

## Implementation Mode

This is an IMPLEMENTATION prompt.

You must implement only the approved minimum safe fix for making the existing Geography & Locations module globally compatible.

Do not start ERP BASE 002F.3C.2.

Do not implement Finance Basics.

Do not implement Units & Measurements.

Do not implement Work Sites.

Do not implement CRM, HR, Fleet, Workshop, Inventory, Procurement, HSE, DMS, Scrap/Waste/Demolition, or Accounting.

Do not rename the `emirates` table.

Do not rename the `emirate_id` column.

Do not make `cities.emirate_id` nullable.

Do not make `ports.emirate_id` nullable.

Do not perform a large refactor.

This prompt is only for the minimum safe global-region compatibility fix.

## Reference Plan

Use this approved planning file as reference:

`ERP_BASE_002F_3C_1_GEOGRAPHY_GLOBAL_REGION_FIX_PLAN.md`

The approved recommendation is Option E — Hybrid Minimal Safe Plan.

## Problem To Fix

The current Geography module is UAE-centric because the hierarchy is:

```text
Country → Emirate → City → Area / Zone
```

This works for UAE but does not work globally.

Example problem:

```text
Country: Jordan
Region/Governorate: Amman Governorate
City: Amman
```

Currently, the system forces the city to connect to a UAE-specific `emirate`.

The system must support this global concept:

```text
Country → Region / Emirate / Governorate / State / Province → City → Area / Zone
```

But to avoid breaking the approved 002F.3C.1 module, the database table name `emirates` and FK column `emirate_id` must remain for now.

## Approved Minimum Safe Fix

Implement the following:

1. Keep the existing `emirates` table.
2. Treat `emirates` conceptually as Administrative Regions.
3. Add `country_id` to `emirates`.
4. Add `region_type_code` to `emirates`.
5. Add optional `country_id` to `cities`.
6. Add optional `country_id` to `ports`.
7. Keep `cities.emirate_id` required.
8. Keep `ports.emirate_id` required.
9. Do not rename `emirate_id`.
10. Do not make `emirate_id` nullable.
11. Update UI labels from “Emirate” to “Region / Emirate / Governorate”.
12. Update sidebar/page label from “Emirates” to “Regions / Emirates”.
13. Add country filtering to the existing `EmirateSelect`.
14. Add CountrySelect before Region/Emirate select in City form.
15. Add CountrySelect before Region/Emirate select in Port form.
16. Add `REGION_TYPES` lookup category.
17. Update existing UAE Emirates to link to UAE country and `region_type_code = EMIRATE`.
18. Update existing UAE Cities to link to UAE country.
19. Update existing UAE Ports to link to UAE country.
20. Add seed examples for Jordan/Saudi/USA regions and cities only if safe and idempotent.
21. Keep all existing routes stable.
22. Keep existing permissions/RLS/audit behavior.
23. Generate implementation report and stop.

## Critical Business Rule

Sameer confirmed:

```text
Global admin / system_admin must be able to view, insert, edit, delete, lock, and unlock all geography records all the time.
```

This must remain true after the fix.

Do not weaken the current system_admin behavior.

## Critical Database Rule

This is a minimal compatibility layer.

Do not rename database objects:

```text
Do not rename emirates table.
Do not rename emirate_id column.
Do not rename Emirates routes unless only the label changes.
```

Use comments and labels to explain that:

```text
emirates table = Administrative Regions conceptually
emirate_id = region/emirate/governorate reference conceptually
```

## Critical Lookup Rule

Use only the existing 002F.3B lookup tables:

```text
global_lookup_categories
global_lookup_values
```

Do not use or create:

```text
lookup_categories
lookup_values
```

## Scope In This Implementation

### Database

Create one corrective migration:

```text
supabase/migrations/YYYYMMDDHHMMSS_erp_base_002f3c1_geography_global_region_support.sql
```

Migration must:

1. Add `country_id` to `emirates` if not exists.
2. Add `region_type_code` to `emirates` if not exists.
3. Add `country_id` to `cities` if not exists.
4. Add `country_id` to `ports` if not exists.
5. Add indexes for new country columns.
6. Add table/column comments explaining global region concept.
7. Seed `REGION_TYPES` lookup category into `global_lookup_categories`.
8. Seed `REGION_TYPES` values into `global_lookup_values`.
9. Update existing UAE emirates with UAE country id.
10. Update existing UAE cities with UAE country id.
11. Update existing UAE ports with UAE country id.
12. Optionally seed Jordan/Saudi/USA regions and cities only if safe and idempotent.
13. Preserve RLS policies.
14. Preserve existing data.
15. Preserve existing routes.
16. Preserve existing permissions.

### TypeScript / Validation / Actions

Update existing files only.

Expected files:

```text
src/features/master-data/geography/types.ts
src/features/master-data/geography/validation.ts
src/features/master-data/geography/actions.ts
src/components/erp/geography/emirate-select.tsx
src/features/master-data/geography/components/city-form-dialog.tsx
src/features/master-data/geography/components/port-form-dialog.tsx
src/features/master-data/geography/components/area-form-dialog.tsx
src/features/master-data/geography/components/cities-table.tsx
src/features/master-data/geography/components/ports-table.tsx
src/features/master-data/geography/components/areas-table.tsx
src/app/(protected)/admin/master-data/geography/emirates/page.tsx
src/features/master-data/geography/components/emirates-table.tsx
src/features/master-data/geography/components/emirate-form-dialog.tsx
src/components/layout/app-sidebar.tsx
```

Do not duplicate files.

Do not create a new administrative_regions module.

---

# 1. Database Migration Requirements

Create a new migration file.

## 1.1 Add `country_id` to `emirates`

Add:

```sql
ALTER TABLE public.emirates
ADD COLUMN IF NOT EXISTS country_id bigint REFERENCES public.countries(id) ON DELETE RESTRICT;
```

Add index:

```sql
CREATE INDEX IF NOT EXISTS idx_emirates_country_id ON public.emirates(country_id);
```

Add comment:

```sql
COMMENT ON TABLE public.emirates IS 'Administrative regions for countries. For UAE these records are Emirates; for other countries they may be Governorates, States, Provinces, or Regions.';
COMMENT ON COLUMN public.emirates.country_id IS 'Parent country for this administrative region.';
```

## 1.2 Add `region_type_code` to `emirates`

Add:

```sql
ALTER TABLE public.emirates
ADD COLUMN IF NOT EXISTS region_type_code text;
```

Add index:

```sql
CREATE INDEX IF NOT EXISTS idx_emirates_region_type_code ON public.emirates(region_type_code);
```

Add comment:

```sql
COMMENT ON COLUMN public.emirates.region_type_code IS 'Administrative region type code from REGION_TYPES lookup, such as EMIRATE, GOVERNORATE, STATE, PROVINCE, REGION.';
```

## 1.3 Add optional `country_id` to `cities`

Add:

```sql
ALTER TABLE public.cities
ADD COLUMN IF NOT EXISTS country_id bigint REFERENCES public.countries(id) ON DELETE RESTRICT;
```

Add index:

```sql
CREATE INDEX IF NOT EXISTS idx_cities_country_id ON public.cities(country_id);
```

Add comment:

```sql
COMMENT ON COLUMN public.cities.country_id IS 'Parent country for this city. Added for global geography support and reporting. emirate_id remains required and represents the administrative region.';
```

Important:

```text
Do not make cities.emirate_id nullable.
```

## 1.4 Add optional `country_id` to `ports`

Add:

```sql
ALTER TABLE public.ports
ADD COLUMN IF NOT EXISTS country_id bigint REFERENCES public.countries(id) ON DELETE RESTRICT;
```

Add index:

```sql
CREATE INDEX IF NOT EXISTS idx_ports_country_id ON public.ports(country_id);
```

Add comment:

```sql
COMMENT ON COLUMN public.ports.country_id IS 'Parent country for this port. Added for global geography support and reporting. emirate_id remains required and represents the administrative region.';
```

Important:

```text
Do not make ports.emirate_id nullable.
```

## 1.5 Seed REGION_TYPES Lookup

Insert into existing lookup tables:

```text
global_lookup_categories
global_lookup_values
```

Category:

```text
REGION_TYPES
Administrative Region Types
```

Values:

```text
EMIRATE
GOVERNORATE
STATE
PROVINCE
REGION
```

Optional values if useful:

```text
TERRITORY
COUNTY
DISTRICT
```

All seed values:

```text
is_system = true
is_locked = true
is_active = true
```

Use idempotent insert logic.

Do not create duplicate lookup categories.

## 1.6 Update Existing UAE Records

Find UAE country:

```sql
SELECT id FROM public.countries WHERE country_code = 'AE';
```

Update:

```text
existing emirates.country_id = UAE id
existing emirates.region_type_code = EMIRATE
existing cities.country_id = UAE id
existing ports.country_id = UAE id
```

Only update null values where appropriate.

Do not overwrite user-customized non-null country values.

## 1.7 Optional Global Seed Examples

If safe, add a very small set of global seed examples.

Recommended:

## Jordan

Regions:

```text
AMM — Amman Governorate — GOVERNORATE
IRB — Irbid Governorate — GOVERNORATE
ZAR — Zarqa Governorate — GOVERNORATE
```

Cities:

```text
AMMAN_CITY — Amman — linked to AMM
IRBID_CITY — Irbid — linked to IRB
ZARQA_CITY — Zarqa — linked to ZAR
```

## Saudi Arabia

Regions:

```text
RUH — Riyadh Region — REGION
MAK — Makkah Region — REGION
EAS — Eastern Province — PROVINCE
```

Cities:

```text
RIYADH_CITY — Riyadh — linked to RUH
JEDDAH_CITY — Jeddah — linked to MAK
DAMMAM_CITY — Dammam — linked to EAS
```

## United States

Regions:

```text
CAL — California — STATE
TEX — Texas — STATE
NYK — New York — STATE
```

Cities:

```text
LA_CITY — Los Angeles — linked to CAL
HOUSTON_CITY — Houston — linked to TEX
NYC_CITY — New York City — linked to NYK
```

Use idempotent inserts.

If any of these countries are missing, skip related seed with safe logic.

Document exactly what was seeded.

---

# 2. TypeScript Types Requirements

Update:

```text
src/features/master-data/geography/types.ts
```

Add optional fields where appropriate:

## Emirate

Add:

```ts
country_id?: number | null;
region_type_code?: string | null;
```

Add comment:

```ts
// NOTE: The emirates table is used as the administrative_regions concept.
// For UAE, records are Emirates. For other countries, records may be Governorates, States, Provinces, or Regions.
```

## City

Add:

```ts
country_id?: number | null;
```

Add comment:

```ts
// country_id is added for global geography support; emirate_id remains the current administrative region reference.
```

## Port

Add:

```ts
country_id?: number | null;
```

Update related create/update input types.

Do not rename `Emirate` type yet unless adding alias only.

Optional safe alias:

```ts
export type AdministrativeRegion = Emirate;
```

Do not break existing imports.

---

# 3. Validation Requirements

Update:

```text
src/features/master-data/geography/validation.ts
```

## Emirate / Region

Add optional:

```ts
country_id
region_type_code
```

Update messages from “Emirate” to “Region / Emirate / Governorate” where user-facing.

Do not break existing UAE emirate validation.

## City

Add optional:

```ts
country_id
```

Keep:

```ts
emirate_id required
```

Change user-facing validation message from:

```text
Emirate is required
```

to:

```text
Region / Emirate / Governorate is required
```

## Port

Add optional:

```ts
country_id
```

Keep:

```ts
emirate_id required
```

Change user-facing message similarly.

---

# 4. Server Action Requirements

Update:

```text
src/features/master-data/geography/actions.ts
```

## getEmirates

Add optional filter:

```ts
country_id?: number
```

Query should filter:

```ts
.eq("country_id", filters.country_id)
```

when provided.

## getCities

Add optional filter:

```ts
country_id?: number
```

Query should filter by cities.country_id when provided.

Make sure joined region/emirate data still displays.

## getPorts

Add optional filter:

```ts
country_id?: number
```

Query should filter by ports.country_id when provided.

## createEmirate / updateEmirate

Accept and save:

```ts
country_id
region_type_code
```

## createCity / updateCity

Accept and save:

```ts
country_id
```

When city country_id is not supplied, infer from selected emirate/region if practical.

Example:

```text
If country_id is null and emirate_id is provided, fetch emirates.country_id and use it.
```

## createPort / updatePort

Accept and save:

```ts
country_id
```

When port country_id is not supplied, infer from selected emirate/region if practical.

## Audit

Audit old/new values should capture:

```text
country_id
region_type_code
```

No special audit schema change required.

---

# 5. EmirateSelect / Region Select Requirements

Update existing:

```text
src/components/erp/geography/emirate-select.tsx
```

Do not create a completely separate new module unless needed.

Add prop:

```ts
countryId?: number | null;
```

Add optional prop aliases if helpful:

```ts
labelMode?: "emirate" | "region";
```

But keep it simple if possible.

Required behavior:

- If countryId is provided, show only regions/emirates for that country.
- If countryId is null, show all active regions/emirates.
- Show loading state.
- Show empty state:
  - “No regions found for selected country”
- Show label text as:
  - “Region / Emirate / Governorate”
- Existing UAE use must continue to work.

Add code comment:

```ts
// NOTE: This component reads from the emirates table, which now represents administrative regions globally.
```

---

# 6. City Form UI Requirements

Update:

```text
src/features/master-data/geography/components/city-form-dialog.tsx
```

Add CountrySelect above Region/Emirate select.

Flow:

```text
Country
Region / Emirate / Governorate
City details
```

State:

```ts
countryId
emirateId
```

Behavior:

- When country changes, region list filters by country.
- If country changes and current region does not belong to selected country, clear region.
- Region/Emirate select is disabled until country is selected, unless existing data has region.
- Save `country_id` together with `emirate_id`.
- Keep `emirate_id` required.
- In edit mode, country should load from record.country_id or from record.emirate.country_id if available.
- In view mode, fields are disabled.
- Validation message uses Region / Emirate / Governorate.

Do not remove existing emirate_id logic.

---

# 7. Port Form UI Requirements

Update:

```text
src/features/master-data/geography/components/port-form-dialog.tsx
```

Add CountrySelect above Region/Emirate select.

Flow:

```text
Country
Region / Emirate / Governorate
Port details
```

Same behavior as City form:

- Country filters regions.
- Save `country_id`.
- Keep `emirate_id` required.
- In edit mode, load country correctly.
- In view mode, disabled.

---

# 8. Emirate / Region Form UI Requirements

Update:

```text
src/features/master-data/geography/components/emirate-form-dialog.tsx
```

User-facing label:

```text
Region / Emirate / Governorate
```

Add fields:

- country
- region_type_code

Use:

```text
CountrySelect
LookupSelect category REGION_TYPES
```

Keep existing fields:

- emirate_code
- name_en
- name_ar
- abbreviation_en
- abbreviation_ar
- is_active
- is_system
- is_locked
- sort_order

Do not rename columns.

---

# 9. Table / Page Label Requirements

Update labels only.

## Sidebar

Change menu item:

```text
Emirates
```

to:

```text
Regions / Emirates
```

## Page title

Change Emirates page title to:

```text
Regions / Emirates
```

or:

```text
Administrative Regions
```

Preferred:

```text
Regions / Emirates
```

## Table column labels

Change:

```text
Emirate
```

to:

```text
Region / Emirate / Governorate
```

in:

- cities table
- areas table
- ports table

## Forms

Same label changes.

Do not change route:

```text
/admin/master-data/geography/emirates
```

Keep route stable.

---

# 10. RLS / Permission Requirements

Do not weaken RLS.

No new permissions are required.

Existing geography permissions continue:

```text
master_data.geography.view
master_data.geography.manage
master_data.geography.export
master_data.geography.audit_view
master_data.lookups.lock
```

Confirm after migration:

- system_admin can view/insert/edit/delete/lock/unlock all records.
- group_admin can manage according to current rules.
- company_admin/branch_admin behavior remains unchanged.
- normal user behavior remains unchanged.

No RLS policy changes should be needed unless the new columns require explicit security adjustment.

If any RLS issue appears, fix with a corrective migration and document it.

---

# 11. Testing Requirements

Run:

```text
npm run typecheck
npm run lint
npm run build
npm test if available
```

If lint has unrelated legacy errors, separate them clearly.

## Browser Testing

Test UAE backward compatibility:

1. UAE emirates page loads.
2. UAE cities still display region/emirate.
3. Add UAE city works.
4. Edit UAE city works.
5. Existing areas display city and region/emirate.
6. Existing ports display region/emirate.

Test global support:

1. Add Jordan region:
   - Country: Jordan
   - Region Type: Governorate
   - Code: AMM or AMMAN_GOV
   - Name: Amman Governorate

2. Add Jordan city:
   - Country: Jordan
   - Region: Amman Governorate
   - City: Amman

3. Confirm city table shows:
   - Country: Jordan if displayed
   - Region / Emirate / Governorate: Amman Governorate
   - City: Amman

4. Add Saudi region and city if seeded.
5. Add USA state and city if seeded.

Test filtering:

- Country filters regions.
- Changing country clears invalid selected region.
- Region select shows only selected country’s regions.

Test actions:

- Add/edit/delete/lock/unlock still work.
- system_admin full access still works.
- non-system_admin hard delete remains blocked.

---

# 12. Required Implementation Report

Create:

```text
ERP_BASE_002F_3C_1_GEOGRAPHY_GLOBAL_REGION_IMPLEMENTATION_REPORT.md
```

Report must include:

1. Phase name.
2. Date.
3. Summary of the issue.
4. Summary of implemented fix.
5. Files reviewed.
6. Files modified.
7. Migration created.
8. Database changes applied.
9. Lookup category REGION_TYPES created.
10. Seed data added.
11. TypeScript type changes.
12. Validation changes.
13. Server action changes.
14. UI label changes.
15. Country filtering changes.
16. EmirateSelect / RegionSelect behavior.
17. City form changes.
18. Port form changes.
19. Regions / Emirates form changes.
20. RLS / permission verification.
21. Global admin full access verification.
22. UAE backward compatibility testing.
23. Jordan / global support testing.
24. Typecheck result.
25. Lint result.
26. Build result.
27. Remaining known limitations.
28. Future recommendation about eventual table rename if needed.
29. Final status.

At the end write one of:

```text
PASS — Geography global region compatibility fix is complete and 002F.3C.1 remains ready to close.
PASS WITH NOTES — Geography global region compatibility fix works with minor non-blocking notes.
FAIL — Geography global region compatibility fix requires correction.
```

## Known Limitation To Document

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

Implement only the approved minimum safe global region compatibility fix.

Do not start ERP BASE 002F.3C.2.

Do not implement Finance Basics.

Generate the implementation report and stop.
