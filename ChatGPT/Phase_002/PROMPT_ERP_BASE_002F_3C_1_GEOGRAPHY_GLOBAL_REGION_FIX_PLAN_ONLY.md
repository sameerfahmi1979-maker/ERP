# PROMPT_ERP_BASE_002F_3C_1_GEOGRAPHY_GLOBAL_REGION_FIX_PLAN_ONLY

Act as a senior ERP QA lead, Supabase/PostgreSQL RLS auditor, Next.js/Supabase enterprise architect, SaaS data-modeling specialist, UAE and international business-location master data consultant, migration risk analyst, and master-data governance reviewer.

## Phase

ERP BASE 002F.3C.1 — Geography & Locations Global Region Fix Planning Only

## Prompt Purpose

This is a PLANNING ONLY prompt.

Do not implement code.

Do not create migrations.

Do not modify database schema.

Do not modify UI pages.

Do not modify server actions.

Do not modify TypeScript files.

Do not change routes.

Do not start ERP BASE 002F.3C.2.

Your task is to analyze the current Geography & Locations module and generate a technical correction plan for the minimum and safest fix.

## Required Output File

Create only this markdown report:

`ERP_BASE_002F_3C_1_GEOGRAPHY_GLOBAL_REGION_FIX_PLAN.md`

The report must be detailed and must recommend the safest correction approach.

## Background

ERP BASE 002F.3C.1 — Geography & Locations was approved and closed after full audit.

Current approved module includes:

- countries
- emirates
- cities
- areas_zones
- ports

However, Sameer identified an important data-model issue:

The current hierarchy is:

```text
Country → Emirate → City → Area / Zone
```

This works for the UAE because UAE has Emirates.

But it does not work globally.

Example problem:

If Sameer wants to add:

```text
Country: Jordan
City: Amman
```

The system forces the city to connect to an `emirate`, which is UAE-specific and wrong.

For global ERP use, the concept should support:

```text
Country → State / Province / Region / Governorate / Emirate → City → Area / Zone
```

Examples:

```text
UAE → Emirate → City
Jordan → Governorate → City
USA → State → City
Canada → Province → City
Saudi Arabia → Region / Province → City
India → State → City
```

## Important User Direction

Sameer asked:

```text
Ask Cursor for his idea and generate a plan file only.
Do not implement the fix.
Use the minimum and most safe fix.
```

Therefore, you must provide analysis and recommendation only.

## Main Question To Answer

What is the minimum and safest technical fix for making the Geography module globally compatible without breaking the already approved 002F.3C.1 module?

## Critical Constraints

1. Do not break existing UAE geography data.
2. Do not break existing countries, emirates, cities, areas_zones, or ports pages.
3. Do not break current RLS policies.
4. Do not break server actions.
5. Do not break add/edit/delete/lock/unlock behavior already tested by Sameer.
6. Do not rename routes unnecessarily.
7. Do not create a large risky refactor if a smaller compatibility layer can solve the issue.
8. Do not start 002F.3C.2.
9. Do not implement anything in this prompt.
10. Recommend a safe phased migration/fix if needed.
11. Global admin/system_admin must continue to have full access after any future fix.
12. All future fixes must remain compatible with RLS, permissions, audit logs, and existing UI patterns.

## Current Module To Inspect

Inspect the actual source/database/report state for:

## Tables

```text
countries
emirates
cities
areas_zones
ports
```

## Current Relationships

Specifically inspect:

- Does `cities` have `emirate_id` only?
- Does `cities` have `country_id`?
- Does `areas_zones` connect to `city_id` only?
- Does `ports` connect to `emirate_id`, city_id, or country_id?
- Does UI label the parent as “Emirate” everywhere?
- Do server actions require `emirate_id` for all cities?
- Do validation schemas require emirate_id?
- Do select components assume Emirate always?
- Does seed data contain only UAE cities?

## Current Files To Review

Review:

```text
src/features/master-data/geography/actions.ts
src/features/master-data/geography/types.ts
src/features/master-data/geography/validation.ts

src/app/(protected)/admin/master-data/geography/countries/page.tsx
src/app/(protected)/admin/master-data/geography/emirates/page.tsx
src/app/(protected)/admin/master-data/geography/cities/page.tsx
src/app/(protected)/admin/master-data/geography/areas/page.tsx
src/app/(protected)/admin/master-data/geography/ports/page.tsx

src/features/master-data/geography/components/countries-table.tsx
src/features/master-data/geography/components/emirates-table.tsx
src/features/master-data/geography/components/cities-table.tsx
src/features/master-data/geography/components/areas-table.tsx
src/features/master-data/geography/components/ports-table.tsx

src/features/master-data/geography/components/country-form-dialog.tsx
src/features/master-data/geography/components/emirate-form-dialog.tsx
src/features/master-data/geography/components/city-form-dialog.tsx
src/features/master-data/geography/components/area-form-dialog.tsx
src/features/master-data/geography/components/port-form-dialog.tsx

src/components/erp/geography/country-select.tsx
src/components/erp/geography/emirate-select.tsx
src/components/erp/geography/city-select.tsx
src/components/erp/geography/area-zone-select.tsx
src/components/erp/geography/port-select.tsx

src/components/layout/app-sidebar.tsx
```

Also review all 002F.3C.1 migrations:

```text
supabase/migrations/*002f3c1*geography*.sql
supabase/migrations/*geography_completion_fix*.sql
```

## Planning Options To Evaluate

Evaluate at least these options.

### Option A — Rename `emirates` table to `administrative_regions`

This is conceptually clean but may be risky.

Evaluate:

- migration complexity
- impact on FK constraints
- impact on server actions
- impact on UI routes
- impact on select components
- impact on existing data
- impact on RLS
- impact on audit logs
- risk of breaking 002F.3C.1

### Option B — Keep `emirates` table but relabel UI to “Region / Emirate / Governorate”

This may be the minimum safe fix.

Evaluate:

- keep existing database
- add country_id to `emirates` if missing
- use the `emirates` table as a generic “regions” table internally for now
- change UI labels from “Emirate” to “Region / Emirate”
- allow records such as:
  - AMMAN_GOV — Amman Governorate — country Jordan
  - IRBID_GOV — Irbid Governorate — country Jordan
- update city form to allow selecting country first, then region/emirate filtered by country
- use existing `emirate_id` column as region_id conceptually
- minimize route/database breakage

### Option C — Add new `administrative_regions` table and keep `emirates` as UAE-specific legacy

Evaluate:

- add new table
- migrate future cities to administrative_regions
- keep existing emirates table for UAE only
- introduce dual relationship risk
- more complex but future-proof
- possible data duplication

### Option D — Add `country_id` directly to cities and make `emirate_id` optional

Evaluate:

- minimum schema change
- cities can exist directly under countries when no region exists
- Jordan → Amman can be country-linked without region
- still keeps emirate for UAE cities
- may be the absolute minimum fix
- but misses governorate/state/province layer for countries that need it
- UI must support “No region / direct country city”

### Option E — Hybrid minimal safe plan

For example:

- keep `emirates` table for now
- add/ensure `country_id` to `emirates`
- treat it as “Region” in UI
- optionally add `region_type_code` later
- add country filter to region select
- keep `cities.emirate_id` but label it as `region_id` in UI/types where practical
- add `country_id` to cities if missing for easier filtering/reporting
- plan future table rename only after more modules are stable

You must recommend the best option.

## Required Analysis

Your plan must answer:

1. Is the issue real? Confirm from actual schema/code.
2. Does the current city model only support UAE-style emirate relationship?
3. What is the safest minimum correction?
4. Should we rename the database table now or avoid renaming?
5. Should we add a new table now or avoid it?
6. Should `countries → emirates → cities` become `countries → regions → cities` conceptually?
7. Should the UI label change immediately?
8. Should we add `country_id` to `emirates` if missing?
9. Should we add `country_id` to `cities` if missing?
10. Should `cities.emirate_id` become optional?
11. Should `emirate_id` remain the column name internally for now, while UI labels show Region?
12. How can we support Jordan → Amman Governorate → Amman?
13. How can we support a country that has no region layer?
14. What are the RLS implications?
15. What are the UI implications?
16. What are the migration risks?
17. What needs to be changed in select components?
18. What needs to be changed in forms?
19. What needs to be changed in tables?
20. What should not be changed now?

## Required Report Structure

The output report must include:

1. Executive Summary
2. Problem Confirmation
3. Current Schema and UI Findings
4. Global Geography Requirement
5. Option Analysis
6. Recommended Minimum Safe Fix
7. Proposed Future Data Model
8. Proposed Database Changes
9. Proposed UI Label Changes
10. Proposed Server Action Changes
11. Proposed Validation Changes
12. Proposed Select Component Changes
13. Proposed RLS / Permission / Audit Impact
14. Proposed Seed Data Additions
15. Migration Safety Plan
16. Rollback Plan
17. Testing Plan
18. Risks and Mitigations
19. Final Recommendation
20. Implementation Prompt Name To Generate After Approval

## Required Recommendation Style

The recommendation must be practical.

Do not recommend a huge refactor unless absolutely necessary.

Prefer minimum safe fix.

However, do not hide long-term risk.

If the minimum fix keeps the table named `emirates`, state that it is a technical compromise and recommend renaming later only if required.

## Minimum Safe Fix Candidate To Consider Strongly

Strongly evaluate this approach:

```text
Keep the existing emirates table for now.
Use it as “Administrative Region” conceptually.
Add/confirm country_id on emirates if missing.
Add/confirm country_id on cities if missing or plan it.
Make city region/emirate parent optional only if necessary.
Change UI labels from “Emirate” to “Region / Emirate / Governorate”.
Rename component labels only, not database table names.
Change EmirateSelect display label to RegionSelect or create wrapper RegionSelect using existing emirates table.
Filter regions by selected country.
Allow non-UAE regions such as Amman Governorate linked to Jordan.
Keep routes stable for now.
Document future deeper rename from emirates to administrative_regions as later refactor only.
```

## Important Output Rules

- Do not implement.
- Do not create migration.
- Do not modify code.
- Do not generate implementation prompt yet.
- Do not start 002F.3C.2.
- Create only the plan report.
- The plan must clearly say whether implementation is recommended or whether Sameer must decide first.

## Final Status Options

At the end of the report, write one of:

```text
READY FOR SAMEER REVIEW — Plan complete, recommended minimum safe fix identified.
NEEDS USER DECISION — Multiple safe options exist; Sameer must choose.
BLOCKED — Source inspection failed or current schema could not be verified.
```

## Final Instruction

Create only:

```text
ERP_BASE_002F_3C_1_GEOGRAPHY_GLOBAL_REGION_FIX_PLAN.md
```

Do not implement the fix.
