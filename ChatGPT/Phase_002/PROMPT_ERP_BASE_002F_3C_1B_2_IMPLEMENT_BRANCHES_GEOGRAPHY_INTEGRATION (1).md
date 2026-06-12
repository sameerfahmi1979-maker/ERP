# PROMPT_ERP_BASE_002F_3C_1B_2_IMPLEMENT_BRANCHES_GEOGRAPHY_INTEGRATION

Act as a senior ERP QA lead, Supabase/PostgreSQL RLS auditor, Playwright automation engineer, Next.js runtime tester, SaaS security tester, notification-engine validation specialist, senior Next.js/Supabase implementation engineer, enterprise ERP master-data architect, UAE/international geography master-data consultant, and migration safety reviewer.

## Phase

ERP BASE 002F.3C.1B.2 — Branches Geography Integration

## Implementation Mode

This is an IMPLEMENTATION prompt.

You must implement only the approved Branches Geography Integration.

Do not start ERP BASE 002F.3C.2.

Do not implement Finance Basics.

Do not implement Units & Measurements.

Do not implement Work Sites.

Do not implement CRM, HR, Fleet, Workshop, Inventory, Procurement, HSE, DMS, Scrap/Waste/Demolition, or Accounting.

Do not modify owner company geography integration unless it is required as a dependency and already approved.

## Important Prerequisite

The approved safe sequence is:

```text
002F.3C.1B.1 — Organizations / Owner Companies Geography Integration
002F.3C.1B.2 — Branches Geography Integration
```

Before implementing this prompt, verify whether:

```text
ERP BASE 002F.3C.1B.1 — Organizations / Owner Companies Geography Integration
```

has already been implemented and approved.

If 002F.3C.1B.1 has NOT been completed, stop and produce a short blocking report saying:

```text
BLOCKED — Organizations / Owner Companies Geography Integration should be completed before Branches Geography Integration unless Sameer explicitly approves changing the order.
```

If Sameer explicitly wants Branches first, continue with this prompt but document the decision in the report.

## Reference Planning File

Use this plan as source of truth:

```text
ERP_BASE_002F_3C_1A_GEOGRAPHY_INTEGRATION_IMPACT_PLAN.md
```

The plan approved:

- Add new geography FK columns beside old text fields.
- Keep old text fields temporarily.
- Do not drop or overwrite legacy location text.
- Use cascading geography selects.
- Generate unmatched migration report.
- Do not move to 002F.3C.2 until integrations are reviewed.

## Approved Geography Master Data

The approved Geography module includes:

```text
countries
emirates table used conceptually as Regions / Emirates / Governorates
cities
areas_zones
ports
```

User-facing hierarchy:

```text
Country
└── Region / Emirate / Governorate
    └── City
        └── Area / Zone
```

Technical compatibility:

```text
emirates table = administrative regions conceptually
emirate_id column = region reference conceptually
```

Do not rename:

```text
emirates table
emirate_id column
```

## Critical Business Rules

1. Global admin / system_admin must be able to view, insert, edit, delete, lock, and unlock all relevant records all the time where applicable.
2. Existing branch data must not be lost.
3. Old free-text location fields must remain temporarily.
4. Add FK fields beside legacy text fields.
5. New UI should use structured Geography master data.
6. If FK is null, existing legacy text values must still display as fallback.
7. Do not break branch CRUD.
8. Do not break current RLS.
9. Do not break audit logging.
10. Do not start the next phase automatically.

---

# 1. Required Source Inspection Before Implementation

Before making changes, inspect the actual source code and migrations.

Inspect:

## Database / Migration Files

Search migrations for:

```text
branches
country
emirate
city
area
address_line_1
address_line_2
po_box
makani_number
latitude
longitude
branch
```

Confirm current `branches` table columns and constraints.

Expected current location/address fields may include:

```text
emirate text
city text
area text
address_line_1 text
address_line_2 text
po_box text
makani_number text
latitude numeric
longitude numeric
```

Confirm whether any geography FK columns already exist:

```text
country_id
emirate_id
city_id
area_zone_id
```

If they already exist, do not recreate them; verify and reuse.

## Branch Feature Files

Inspect actual files. Expected likely files:

```text
src/features/branches/branch-schema.ts
src/features/branches/branch-form-dialog.tsx
src/features/branches/branches-table.tsx
src/app/(protected)/admin/branches/page.tsx
src/server/actions/branches.ts
```

If actual paths differ, follow the real project structure.

## Geography Components

Inspect and reuse:

```text
src/components/erp/geography/country-select.tsx
src/components/erp/geography/emirate-select.tsx
src/components/erp/geography/city-select.tsx
src/components/erp/geography/area-zone-select.tsx
```

Do not recreate geography select components.

## RLS / Permissions / Audit

Inspect existing:

```text
branches RLS policies
branches permissions
audit logging helper
current_user_profile_id()
current_user_has_permission()
system_admin role checks
```

---

# 2. Database Migration Requirements

Create a new migration only if required:

```text
supabase/migrations/YYYYMMDDHHMMSS_erp_base_002f3c1b2_branches_geography_integration.sql
```

## 2.1 Add Geography FK Columns to branches

Add columns only if not already present:

```sql
ALTER TABLE public.branches
  ADD COLUMN IF NOT EXISTS country_id bigint REFERENCES public.countries(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS emirate_id bigint REFERENCES public.emirates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS city_id bigint REFERENCES public.cities(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS area_zone_id bigint REFERENCES public.areas_zones(id) ON DELETE SET NULL;
```

Important:

- Keep existing text fields.
- Do not drop `emirate`, `city`, or `area` text fields.
- Do not make new FK columns NOT NULL yet.
- Use `ON DELETE SET NULL` to preserve branch records if a geography master record is deleted by system_admin.
- Do not create port linkage unless a clear business requirement exists.

## 2.2 Add Indexes

Create indexes:

```sql
CREATE INDEX IF NOT EXISTS idx_branches_country_id ON public.branches(country_id);
CREATE INDEX IF NOT EXISTS idx_branches_emirate_id ON public.branches(emirate_id);
CREATE INDEX IF NOT EXISTS idx_branches_city_id ON public.branches(city_id);
CREATE INDEX IF NOT EXISTS idx_branches_area_zone_id ON public.branches(area_zone_id);
```

## 2.3 Add Column Comments

Add comments:

```sql
COMMENT ON COLUMN public.branches.country_id IS 'FK to countries.id for structured geography. Legacy text location fields are retained temporarily.';
COMMENT ON COLUMN public.branches.emirate_id IS 'FK to emirates.id, used conceptually as Region / Emirate / Governorate.';
COMMENT ON COLUMN public.branches.city_id IS 'FK to cities.id for structured geography.';
COMMENT ON COLUMN public.branches.area_zone_id IS 'FK to areas_zones.id for structured geography.';
```

## 2.4 Data Migration

Create safe matching logic to populate FK columns from existing text values.

Important:

- Exact/safe matches only.
- No destructive changes.
- Old text fields remain.
- Unmatched records must be reported.

### Country Migration Strategy

Branches may not currently have a country text field.

Recommended country resolution order:

1. If branch parent owner company has `country_id`, use it.
2. If branch `emirate` text matches a UAE region/emirate, set country to UAE.
3. If branch `city` text matches a city with country_id, set country from city.
4. If no safe match exists, leave `country_id` null and report unmatched.

Do not guess country if uncertain.

### Region / Emirate Migration

Match branch `emirate` text to `emirates` table:

- by `emirate_code`
- by `name_en`
- by `name_ar`
- with basic UAE synonyms only if safe, such as:
  - Abu Dhabi / AUH
  - Dubai / DXB
  - Sharjah / SHJ
  - Ajman / AJM
  - Umm Al Quwain / UAQ
  - Ras Al Khaimah / RAK
  - Fujairah / FUJ

Filter by branch `country_id` if available.

### City Migration

Match branch `city` text to `cities` table:

- by `city_code`
- by `name_en`
- by `name_ar`
- filter by `emirate_id` if available
- filter by `country_id` if available

### Area / Zone Migration

Match branch `area` text to `areas_zones` table:

- by `area_code`
- by `name_en`
- by `name_ar`
- filter by `city_id` if available

## 2.5 Migration Report

Create a migration report query or table/view for unmatched branches.

Recommended view:

```sql
CREATE OR REPLACE VIEW public.v_branches_geography_migration_unmatched AS
SELECT
  b.id,
  b.branch_code,
  b.branch_name_en,
  b.emirate AS legacy_emirate,
  b.city AS legacy_city,
  b.area AS legacy_area,
  b.country_id,
  b.emirate_id,
  b.city_id,
  b.area_zone_id,
  CASE WHEN b.emirate IS NOT NULL AND b.emirate_id IS NULL THEN true ELSE false END AS unmatched_emirate,
  CASE WHEN b.city IS NOT NULL AND b.city_id IS NULL THEN true ELSE false END AS unmatched_city,
  CASE WHEN b.area IS NOT NULL AND b.area_zone_id IS NULL THEN true ELSE false END AS unmatched_area
FROM public.branches b
WHERE
  (b.emirate IS NOT NULL AND b.emirate_id IS NULL)
  OR (b.city IS NOT NULL AND b.city_id IS NULL)
  OR (b.area IS NOT NULL AND b.area_zone_id IS NULL);
```

If project avoids views, include the query in the implementation report instead.

---

# 3. TypeScript / Validation Updates

Update the branch schema/types according to actual project structure.

Expected file:

```text
src/features/branches/branch-schema.ts
```

Add optional FK fields:

```ts
country_id: z.number().int().positive().nullable().optional()
emirate_id: z.number().int().positive().nullable().optional()
city_id: z.number().int().positive().nullable().optional()
area_zone_id: z.number().int().positive().nullable().optional()
```

Keep old text fields temporarily:

```ts
emirate
city
area
```

Do not delete validation for old text fields unless the form no longer sends them and existing records do not require them.

Update TypeScript interfaces if separate types exist.

Expected fields:

```ts
country_id?: number | null
emirate_id?: number | null
city_id?: number | null
area_zone_id?: number | null
```

---

# 4. Branch Form UI Integration

Update the branch form.

Expected file:

```text
src/features/branches/branch-form-dialog.tsx
```

## 4.1 Import Geography Select Components

Use existing components:

```ts
CountrySelect
EmirateSelect
CitySelect
AreaZoneSelect
```

Do not recreate them.

## 4.2 Add Cascading State

Add state:

```ts
const [countryId, setCountryId] = useState<number | null>(branch?.country_id ?? null);
const [emirateId, setEmirateId] = useState<number | null>(branch?.emirate_id ?? null);
const [cityId, setCityId] = useState<number | null>(branch?.city_id ?? null);
const [areaZoneId, setAreaZoneId] = useState<number | null>(branch?.area_zone_id ?? null);
```

In edit/view mode, initialize FK state from branch record.

If FK is null but legacy text exists, show legacy hint.

## 4.3 Cascading Behavior

Implement:

```text
Country changes → clear emirate, city, area
Region / Emirate changes → clear city, area
City changes → clear area
```

Use safe useEffect patterns consistent with existing forms.

## 4.4 Replace Free-Text Location Inputs

In the Location section, replace or supplement existing location text inputs:

### Add

```text
CountrySelect
Region / Emirate / Governorate select
CitySelect
AreaZoneSelect
```

### Keep

```text
address_line_1
address_line_2
po_box
makani_number
latitude
longitude
```

### Hide or keep legacy text fields?

Recommended:

- Do not show legacy text fields for new records.
- For existing records with null FK but legacy text, display read-only legacy hints below the new selects:
  - `Legacy Emirate: Abu Dhabi`
  - `Legacy City: Abu Dhabi`
  - `Legacy Area: Musaffah`

Do not allow users to edit old text fields unless required for backward compatibility.

## 4.5 Required Labels

Use global label:

```text
Region / Emirate / Governorate
```

Do not use only `Emirate`.

## 4.6 Form Submission

When saving branch, include:

```text
country_id
emirate_id
city_id
area_zone_id
```

Keep address fields:

```text
address_line_1
address_line_2
po_box
makani_number
latitude
longitude
```

For old text fields:

- Do not overwrite existing text values unless explicitly intended.
- Do not set legacy fields to null unless approved.
- Keep them as preserved legacy values.

---

# 5. Branch Server Actions Update

Update actual branch server action file.

Expected file:

```text
src/server/actions/branches.ts
```

or actual existing path.

Update:

```text
createBranch
updateBranch
getBranches / listBranches
getBranchById
```

## Create / Update

Ensure create/update saves:

```text
country_id
emirate_id
city_id
area_zone_id
```

Do not strip these fields.

Audit log should capture FK changes automatically.

## List / Get

If list/get currently uses `select('*')`, FK fields will be returned automatically.

If list/get explicitly lists columns, add:

```text
country_id
emirate_id
city_id
area_zone_id
```

If table display needs geography names, either:

1. join geography tables in query, or
2. keep table display as-is for now and rely on form only, or
3. add simple FK name display carefully.

For this phase, prioritize safe branch form integration over complex table display changes.

## Revalidation

Make sure branch paths revalidate after save:

```text
/admin/branches
```

or actual route path.

---

# 6. Branch Table / View Display

Review branch list/table component.

If branch table currently displays legacy text fields, decide safest display approach:

Recommended display:

1. If FK related name is available, show master data name.
2. Else show legacy text value with subtle marker:
   - `Abu Dhabi (legacy)`
3. Else show `—`.

Do not break the branch table if joins are not yet added.

If joining related geography names is too risky for this phase, document as future enhancement and only implement form-level integration now.

---

# 7. RLS / Permission Requirements

Do not create new permissions unless required.

Existing branch permissions should govern branch editing:

```text
branches.view
branches.manage
```

or actual permission names used in project.

Geography read access is needed for select dropdowns.

Confirm relevant admin roles have:

```text
master_data.geography.view
```

If not, add role permission assignment in the migration only if safe.

RLS should remain:

- branch row access controlled by branch policies
- geography select options controlled by geography RLS
- no service role exposure to frontend

System_admin full access must remain unchanged.

---

# 8. Audit Requirements

Audit must capture geography FK changes:

```text
country_id
emirate_id
city_id
area_zone_id
```

No separate audit schema change should be needed if audit logs store old/new JSON.

Confirm create/update logs include new FK fields.

---

# 9. Build / Type / Lint Requirements

Run:

```text
npm run typecheck
npm run lint
npm run build
```

If lint has unrelated legacy errors, separate them clearly:

```text
Branches geography integration lint errors:
Legacy unrelated lint errors:
```

All branch/geography integration errors must be fixed.

---

# 10. Browser Testing Requirements

Test as system_admin.

## Create Branch

1. Open Branches page.
2. Add branch.
3. Select Country = United Arab Emirates.
4. Select Region / Emirate / Governorate = Abu Dhabi or Dubai.
5. Select City.
6. Select Area / Zone if available.
7. Enter address line, PO Box, Makani, coordinates if applicable.
8. Save.
9. Confirm branch is created.
10. Reopen edit form and confirm FK values load correctly.

## Edit Existing Branch With Legacy Text

1. Open existing branch with old text location values.
2. Confirm form loads even if FK columns are null.
3. Confirm legacy text hints display if applicable.
4. Select structured geography values.
5. Save.
6. Reopen and verify structured geography values load.

## Cascading Behavior

1. Select UAE.
2. Confirm Region list shows UAE regions/emirates.
3. Change Country to Jordan.
4. Confirm Region clears.
5. Confirm Region list shows Jordan governorates.
6. Select Jordan → Amman Governorate → Amman.
7. Save branch.
8. Confirm no errors.

## Permission/RLS

1. system_admin can create/edit all branches.
2. group_admin/company_admin/branch_admin behavior remains unchanged.
3. normal users remain blocked where expected.

---

# 11. Required Implementation Report

Create:

```text
ERP_BASE_002F_3C_1B_2_BRANCHES_GEOGRAPHY_INTEGRATION_IMPLEMENTATION_REPORT.md
```

The report must include:

1. Phase name.
2. Date.
3. Prerequisite status: whether 002F.3C.1B.1 Organizations integration was already completed.
4. Summary of implementation.
5. Files reviewed.
6. Files created.
7. Files modified.
8. Migration created/applied.
9. Database columns added.
10. Indexes/FKs added.
11. Data migration result.
12. Unmatched branches report.
13. UI form changes.
14. Cascading select behavior.
15. Legacy text fallback behavior.
16. Server action changes.
17. Validation/type changes.
18. RLS/permission verification.
19. Audit verification.
20. Typecheck result.
21. Lint result.
22. Build result.
23. Browser testing result.
24. Known limitations.
25. Final status.

At the end write one of:

```text
PASS — Branches Geography Integration is complete and ready for Sameer review.
PASS WITH NOTES — Branches Geography Integration works with minor non-blocking notes.
FAIL — Branches Geography Integration requires correction before approval.
BLOCKED — Organizations Geography Integration prerequisite was not completed.
```

## Known Limitations To Document

If applicable:

```text
Legacy text columns remain for backward compatibility.
Unmatched text values require manual review.
Branch table display may still show legacy text until related-name display is enhanced.
```

## Final Instruction

Implement only Branches Geography Integration.

Do not start ERP BASE 002F.3C.2.

Generate the implementation report and stop.
