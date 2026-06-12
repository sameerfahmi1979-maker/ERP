# PROMPT_ERP_BASE_002F_3C_1B_1_IMPLEMENT_ORGANIZATIONS_GEOGRAPHY_INTEGRATION

Act as a senior ERP QA lead, Supabase/PostgreSQL RLS auditor, Playwright automation engineer, Next.js runtime tester, SaaS security tester, notification-engine validation specialist, senior Next.js/Supabase implementation engineer, enterprise ERP master-data architect, UAE/international geography master-data consultant, and migration safety reviewer.

## Phase

ERP BASE 002F.3C.1B.1 — Organizations / Owner Companies Geography Integration

## Implementation Mode

This is an IMPLEMENTATION prompt.

You must implement only:

```text
ERP BASE 002F.3C.1B.1 — Organizations / Owner Companies Geography Integration
```

Do not implement Branches Geography Integration in this prompt.

Do not start ERP BASE 002F.3C.1B.2.

Do not start ERP BASE 002F.3C.2.

Do not implement Finance Basics.

Do not implement Units & Measurements.

Do not implement Work Sites.

Do not implement CRM, HR, Fleet, Workshop, Inventory, Procurement, HSE, DMS, Scrap/Waste/Demolition, or Accounting.

## Approved Sequence

The approved safe sequence is:

```text
1. 002F.3C.1B.1 — Organizations / Owner Companies Geography Integration
2. 002F.3C.1B.2 — Branches Geography Integration
3. 002F.3C.2 — Finance Basics / Commercial Readiness
```

You must complete Organizations first, then stop and generate the implementation report.

Branches will be implemented later in a separate prompt after Sameer reviews and approves this phase.

## Reference Planning File

Use this plan as the source of truth:

```text
ERP_BASE_002F_3C_1A_GEOGRAPHY_INTEGRATION_IMPACT_PLAN.md
```

The approved plan requires:

- Add new geography FK columns beside old text fields.
- Keep old text fields temporarily.
- Do not drop or overwrite legacy location text.
- Use cascading geography selects.
- Generate unmatched migration report.
- Do not move to Branches or Finance Basics until this phase is reviewed.

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

1. Global admin / system_admin must retain full access.
2. Existing owner company / organization data must not be lost.
3. Old free-text location fields must remain temporarily.
4. Add FK fields beside legacy text fields.
5. New UI should use structured Geography master data.
6. If FK is null, existing legacy text values must still display as fallback.
7. Do not break organization CRUD.
8. Do not break current RLS.
9. Do not break audit logging.
10. Do not implement Branches in this phase.
11. Do not start the next phase automatically.

---

# 1. Required Source Inspection Before Implementation

Before making changes, inspect the actual source code and migrations.

## Database / Migration Files

Search migrations for:

```text
owner_companies
organizations
country
emirate
city
area
address_line_1
address_line_2
po_box
makani_number
organization
owner_company
```

Confirm current `owner_companies` table columns and constraints.

Expected current location/address fields may include:

```text
country text
emirate text
city text
area text
address_line_1 text
address_line_2 text
po_box text
makani_number text
```

Confirm whether any geography FK columns already exist:

```text
country_id
emirate_id
city_id
area_zone_id
```

If they already exist, do not recreate them; verify and reuse.

## Organization Feature Files

Inspect actual files. Expected likely files:

```text
src/features/organizations/organization-schema.ts
src/features/organizations/organization-form-dialog.tsx
src/features/organizations/organizations-table.tsx
src/app/(protected)/admin/organizations/page.tsx
src/server/actions/organizations.ts
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
owner_companies RLS policies
organizations permissions
audit logging helper
current_user_profile_id()
current_user_has_permission()
system_admin role checks
```

---

# 2. Database Migration Requirements

Create a new migration only if required:

```text
supabase/migrations/YYYYMMDDHHMMSS_erp_base_002f3c1b1_organizations_geography_integration.sql
```

## 2.1 Add Geography FK Columns to owner_companies

Add columns only if not already present:

```sql
ALTER TABLE public.owner_companies
  ADD COLUMN IF NOT EXISTS country_id bigint REFERENCES public.countries(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS emirate_id bigint REFERENCES public.emirates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS city_id bigint REFERENCES public.cities(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS area_zone_id bigint REFERENCES public.areas_zones(id) ON DELETE SET NULL;
```

Important:

- Keep existing text fields.
- Do not drop `country`, `emirate`, `city`, or `area` text fields.
- Do not make new FK columns NOT NULL yet.
- Use `ON DELETE SET NULL` to preserve owner company records if a geography master record is deleted by system_admin.
- Do not create port linkage unless a clear business requirement exists.

## 2.2 Add Indexes

Create indexes:

```sql
CREATE INDEX IF NOT EXISTS idx_owner_companies_country_id ON public.owner_companies(country_id);
CREATE INDEX IF NOT EXISTS idx_owner_companies_emirate_id ON public.owner_companies(emirate_id);
CREATE INDEX IF NOT EXISTS idx_owner_companies_city_id ON public.owner_companies(city_id);
CREATE INDEX IF NOT EXISTS idx_owner_companies_area_zone_id ON public.owner_companies(area_zone_id);
```

## 2.3 Add Column Comments

Add comments:

```sql
COMMENT ON COLUMN public.owner_companies.country_id IS 'FK to countries.id for structured geography. Legacy text location fields are retained temporarily.';
COMMENT ON COLUMN public.owner_companies.emirate_id IS 'FK to emirates.id, used conceptually as Region / Emirate / Governorate.';
COMMENT ON COLUMN public.owner_companies.city_id IS 'FK to cities.id for structured geography.';
COMMENT ON COLUMN public.owner_companies.area_zone_id IS 'FK to areas_zones.id for structured geography.';
```

## 2.4 Data Migration

Create safe matching logic to populate FK columns from existing text values.

Important:

- Exact/safe matches only.
- No destructive changes.
- Old text fields remain.
- Unmatched records must be reported.

### Country Migration

Match `owner_companies.country` to `countries` by:

- country_code
- name_en
- name_ar
- safe common UAE synonyms:
  - UAE
  - U.A.E.
  - United Arab Emirates
  - Emirates

Do not guess if uncertain.

### Region / Emirate Migration

Match `owner_companies.emirate` to `emirates` by:

- emirate_code
- name_en
- name_ar
- safe UAE synonyms:
  - Abu Dhabi / AUH
  - Dubai / DXB
  - Sharjah / SHJ
  - Ajman / AJM
  - Umm Al Quwain / UAQ
  - Ras Al Khaimah / RAK
  - Fujairah / FUJ

Filter by `country_id` if available.

### City Migration

Match `owner_companies.city` to `cities` by:

- city_code
- name_en
- name_ar
- filter by `emirate_id` if available
- filter by `country_id` if available

### Area / Zone Migration

Match `owner_companies.area` to `areas_zones` by:

- area_code
- name_en
- name_ar
- filter by `city_id` if available

## 2.5 Migration Report

Create a migration report query or view for unmatched owner companies.

Recommended view:

```sql
CREATE OR REPLACE VIEW public.v_owner_companies_geography_migration_unmatched AS
SELECT
  oc.id,
  oc.company_code,
  oc.legal_name_en,
  oc.country AS legacy_country,
  oc.emirate AS legacy_emirate,
  oc.city AS legacy_city,
  oc.area AS legacy_area,
  oc.country_id,
  oc.emirate_id,
  oc.city_id,
  oc.area_zone_id,
  CASE WHEN oc.country IS NOT NULL AND oc.country_id IS NULL THEN true ELSE false END AS unmatched_country,
  CASE WHEN oc.emirate IS NOT NULL AND oc.emirate_id IS NULL THEN true ELSE false END AS unmatched_emirate,
  CASE WHEN oc.city IS NOT NULL AND oc.city_id IS NULL THEN true ELSE false END AS unmatched_city,
  CASE WHEN oc.area IS NOT NULL AND oc.area_zone_id IS NULL THEN true ELSE false END AS unmatched_area
FROM public.owner_companies oc
WHERE
  (oc.country IS NOT NULL AND oc.country_id IS NULL)
  OR (oc.emirate IS NOT NULL AND oc.emirate_id IS NULL)
  OR (oc.city IS NOT NULL AND oc.city_id IS NULL)
  OR (oc.area IS NOT NULL AND oc.area_zone_id IS NULL);
```

If project avoids views, include the query in the implementation report instead.

---

# 3. TypeScript / Validation Updates

Update the organization schema/types according to actual project structure.

Expected file:

```text
src/features/organizations/organization-schema.ts
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
country
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

# 4. Organization Form UI Integration

Update the organization form.

Expected file:

```text
src/features/organizations/organization-form-dialog.tsx
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
const [countryId, setCountryId] = useState<number | null>(organization?.country_id ?? null);
const [emirateId, setEmirateId] = useState<number | null>(organization?.emirate_id ?? null);
const [cityId, setCityId] = useState<number | null>(organization?.city_id ?? null);
const [areaZoneId, setAreaZoneId] = useState<number | null>(organization?.area_zone_id ?? null);
```

In edit/view mode, initialize FK state from organization record.

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

In the Address & Contact section, replace or supplement existing location text inputs:

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
primary_email
primary_phone
website
```

### Legacy Text Fields

Recommended:

- Do not show legacy text fields for new records.
- For existing records with null FK but legacy text, display read-only legacy hints below the new selects:
  - `Legacy Country: UAE`
  - `Legacy Region / Emirate: Abu Dhabi`
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

When saving organization, include:

```text
country_id
emirate_id
city_id
area_zone_id
```

Keep address/contact fields:

```text
address_line_1
address_line_2
po_box
makani_number
primary_email
primary_phone
website
```

For old text fields:

- Do not overwrite existing text values unless explicitly intended.
- Do not set legacy fields to null unless approved.
- Keep them as preserved legacy values.

---

# 5. Organization Server Actions Update

Update actual organization server action file.

Expected file:

```text
src/server/actions/organizations.ts
```

or actual existing path.

Update:

```text
createOrganization / createOwnerCompany
updateOrganization / updateOwnerCompany
getOrganizations / listOrganizations
getOrganizationById
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

For this phase, prioritize safe organization form integration over complex table display changes.

## Revalidation

Make sure organization paths revalidate after save:

```text
/admin/organizations
```

or actual route path.

---

# 6. Organization Table / View Display

Review organization list/table component.

If organization table currently displays legacy text fields, decide safest display approach:

Recommended display:

1. If FK related name is available, show master data name.
2. Else show legacy text value with subtle marker:
   - `Abu Dhabi (legacy)`
3. Else show `—`.

Do not break the organization table if joins are not yet added.

If joining related geography names is too risky for this phase, document as future enhancement and only implement form-level integration now.

---

# 7. RLS / Permission Requirements

Do not create new permissions unless required.

Existing organization permissions should govern organization editing:

```text
organizations.view
organizations.manage
```

or actual permission names used in project.

Geography read access is needed for select dropdowns.

Confirm relevant admin roles have:

```text
master_data.geography.view
```

If not, add role permission assignment in the migration only if safe.

RLS should remain:

- owner_company row access controlled by organization policies
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
Organizations geography integration lint errors:
Legacy unrelated lint errors:
```

All organization/geography integration errors must be fixed.

---

# 10. Browser Testing Requirements

Test as system_admin.

## Create Organization

1. Open Organizations page.
2. Add organization.
3. Select Country = United Arab Emirates.
4. Select Region / Emirate / Governorate = Abu Dhabi or Dubai.
5. Select City.
6. Select Area / Zone if available.
7. Enter address line, PO Box, Makani if applicable.
8. Save.
9. Confirm organization is created.
10. Reopen edit form and confirm FK values load correctly.

## Edit Existing Organization With Legacy Text

1. Open existing organization with old text location values.
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
7. Save organization.
8. Confirm no errors.

## Permission/RLS

1. system_admin can create/edit all organizations.
2. group_admin/company_admin behavior remains unchanged.
3. normal users remain blocked where expected.

---

# 11. Required Implementation Report

Create:

```text
ERP_BASE_002F_3C_1B_1_ORGANIZATIONS_GEOGRAPHY_INTEGRATION_IMPLEMENTATION_REPORT.md
```

The report must include:

1. Phase name.
2. Date.
3. Summary of implementation.
4. Files reviewed.
5. Files created.
6. Files modified.
7. Migration created/applied.
8. Database columns added.
9. Indexes/FKs added.
10. Data migration result.
11. Unmatched organizations report.
12. UI form changes.
13. Cascading select behavior.
14. Legacy text fallback behavior.
15. Server action changes.
16. Validation/type changes.
17. RLS/permission verification.
18. Audit verification.
19. Typecheck result.
20. Lint result.
21. Build result.
22. Browser testing result.
23. Known limitations.
24. Final status.

At the end write one of:

```text
PASS — Organizations Geography Integration is complete and ready for Sameer review.
PASS WITH NOTES — Organizations Geography Integration works with minor non-blocking notes.
FAIL — Organizations Geography Integration requires correction before approval.
```

## Known Limitations To Document

If applicable:

```text
Legacy text columns remain for backward compatibility.
Unmatched text values require manual review.
Organization table display may still show legacy text until related-name display is enhanced.
Branches Geography Integration is not implemented in this phase and must be done next.
```

## Final Instruction

Implement only Organizations / Owner Companies Geography Integration.

Do not implement Branches.

Do not start ERP BASE 002F.3C.2.

Generate the implementation report and stop.
