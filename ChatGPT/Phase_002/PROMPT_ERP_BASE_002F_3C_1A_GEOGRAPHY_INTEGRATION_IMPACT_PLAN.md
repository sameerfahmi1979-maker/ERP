# PROMPT_ERP_BASE_002F_3C_1A_GEOGRAPHY_INTEGRATION_IMPACT_PLAN

Act as a senior ERP QA lead, Supabase/PostgreSQL RLS auditor, Playwright automation engineer, Next.js runtime tester, SaaS security tester, notification-engine validation specialist, senior Next.js/Supabase implementation planner, enterprise ERP master-data architect, UAE/international geography master-data consultant, and migration risk analyst.

## Phase

ERP BASE 002F.3C.1A — Geography & Locations Integration Impact Plan

## Prompt Purpose

This prompt is for TECHNICAL PLANNING ONLY.

Do not implement code.

Do not create migrations.

Do not modify database schema.

Do not modify UI pages.

Do not modify server actions.

Do not start ERP BASE 002F.3C.2.

Your task is to inspect the current application and generate a detailed technical plan for integrating the approved Geography & Locations master data into already implemented modules and fields.

## Required Output File

Create only this markdown report:

`ERP_BASE_002F_3C_1A_GEOGRAPHY_INTEGRATION_IMPACT_PLAN.md`

The report must be detailed, evidence-based, and implementation-ready.

## Background

ERP BASE 002F.3C.1 — Geography & Locations is now approved and closed.

The approved Geography module includes:

```text
countries
emirates table used conceptually as Regions / Emirates / Governorates
cities
areas_zones
ports
```

The approved user-facing hierarchy is:

```text
Country
└── Region / Emirate / Governorate
    └── City
        └── Area / Zone
```

Important technical compatibility decision:

```text
The database table remains named emirates.
The FK column remains emirate_id.
Conceptually these represent administrative regions globally.
```

Before moving to:

```text
ERP BASE 002F.3C.2 — Finance Basics / Commercial Readiness
```

we must plan how to integrate Geography & Locations into the app modules that already exist.

The most important current modules to investigate are:

```text
Organizations
Branches
Owner Companies
Company Addresses
Branch Addresses
Any existing admin/settings/profile pages
Any existing master data forms
Any existing address/location fields in implemented modules
Any existing hardcoded country/emirate/city/area fields
```

## Critical User Requirement

Sameer said:

```text
Before 002F.3C.2, we need to integrate organizations and branches with master data like country, city, area, etc.
We need Cursor to prepare a plan file only.
We should not jump to the next step or 002F.3C.2 before that.
Cursor must investigate all fields of the app implemented before and suggest where to integrate Geography & Locations.
```

## Critical Constraints

1. Do not implement anything in this prompt.
2. Do not start 002F.3C.2.
3. Do not create migrations yet.
4. Do not modify Organizations or Branches yet.
5. Do not modify any UI yet.
6. Only inspect and prepare a safe integration plan.
7. Preserve existing data.
8. Preserve existing RLS policies.
9. Preserve existing organization/branch functionality.
10. Preserve system_admin full access behavior.
11. Prefer safe phased implementation.
12. Any old text fields must be handled carefully to avoid data loss.
13. The plan must identify all affected tables, files, pages, forms, and fields.
14. The plan must recommend the minimum safe implementation approach.

---

# 1. Required Source Inspection

Inspect the full current application source and database migrations.

At minimum, inspect:

## Database Migrations / Tables

Search all migrations and schema definitions for fields related to:

```text
country
country_code
country_name
emirate
emirate_id
city
city_id
area
area_id
zone
zone_id
region
region_id
address
address_line
po_box
postal_code
location
port
port_id
nationality
place
site
yard
branch_location
company_location
```

Inspect all relevant existing tables, especially:

```text
owner_companies
branches
owner_company_addresses
branch_addresses
organization tables if separate
company documents if address/location-related
app settings tables
letterhead/settings tables
users/profile tables if location-related
any already implemented master data tables
any already implemented forms/pages that include address or location fields
```

## Frontend Pages / Forms

Inspect all implemented routes and components for hardcoded location/address fields.

At minimum inspect:

```text
src/app/(protected)/admin/organizations
src/app/(protected)/admin/branches
src/app/(protected)/admin/master-data
src/app/(protected)/admin/settings
src/app/(protected)/admin/users
src/app/(protected)/admin/roles
src/app/(protected)/admin/permissions
```

And related feature folders:

```text
src/features/organizations
src/features/branches
src/features/master-data
src/features/admin
src/features/settings
src/features/users
```

If actual folder names differ, inspect the actual project structure.

## Existing Geography Components

Inspect the approved components:

```text
CountrySelect
EmirateSelect / RegionSelect concept
CitySelect
AreaZoneSelect
PortSelect
```

Confirm how they should be reused in existing forms.

---

# 2. Main Questions To Answer

The plan must answer:

1. Which already implemented tables have country/emirate/city/area/port/address fields?
2. Which fields are currently text fields and should be converted to FK references?
3. Which fields should remain text fields for free-form address lines?
4. Which current forms/pages need to use Geography select components?
5. Which backend actions need to save geography FK fields?
6. Which validation schemas need to change?
7. Which RLS policies are affected?
8. Which audit logs are affected?
9. How should existing text data be migrated safely?
10. Should we keep old text columns temporarily for backward compatibility?
11. Should we add new FK columns next to old text columns first?
12. Which integration should be implemented first: owner companies or branches?
13. What should be deferred to later modules?
14. What fields should be added to Organizations / Branches now?
15. What fields should not be changed now?
16. How do we avoid breaking already approved modules?
17. What is the safest implementation sequence?
18. What should be the next implementation prompt after this plan is approved?

---

# 3. Required Report Structure

The output report must include all sections below:

1. Executive Summary
2. Source Inspection Summary
3. Current Geography Master Data Availability
4. Existing App Location/Address Field Inventory
5. Organizations Integration Plan
6. Branches Integration Plan
7. Address Tables Integration Plan
8. Other Existing Modules Integration Opportunities
9. Database Change Recommendations
10. Data Migration Strategy
11. UI/Form Integration Plan
12. Server Actions / Validation Integration Plan
13. RLS / Permission / Audit Impact
14. Backward Compatibility Plan
15. Implementation Phasing Recommendation
16. Testing Plan
17. Risks and Mitigations
18. Acceptance Criteria
19. Final Recommendation
20. Next Prompt Name After Approval

Do not leave any section generic.

---

# 4. Section Details

## 1. Executive Summary

Include:

- why this integration plan is needed before 002F.3C.2
- what current Geography master data provides
- high-level findings
- recommended minimum safe approach
- whether implementation can start after Sameer approval

## 2. Source Inspection Summary

Create a table:

```text
Area inspected | Files/tables inspected | Findings | Impact | Recommendation
```

Include:

- organizations
- branches
- company address tables
- branch address tables
- settings/letterhead if relevant
- hardcoded address/location fields
- existing UI forms
- existing server actions
- existing validation schemas
- existing RLS policies

## 3. Current Geography Master Data Availability

Summarize the approved geography module:

```text
countries
emirates = Regions / Emirates / Governorates
cities
areas_zones
ports
```

Confirm the reusable components available:

```text
CountrySelect
EmirateSelect with country filtering
CitySelect
AreaZoneSelect
PortSelect
```

Confirm hierarchy:

```text
Country → Region / Emirate / Governorate → City → Area / Zone
```

## 4. Existing App Location/Address Field Inventory

Produce a detailed inventory table.

Required columns:

```text
Table / Component / Page
Current field name
Current field type
Current use
Recommended geography master data mapping
Recommended change
Risk level
Priority
```

Example rows:

```text
branches | emirate text | hardcoded UAE emirate | emirates.id | add region_id/emirate_id FK, keep old emirate_text temporarily | Medium | High
branches | city text | free text | cities.id | add city_id FK | Medium | High
owner_companies | country text | free text | countries.id | add country_id FK | Medium | High
```

## 5. Organizations Integration Plan

Analyze current owner company / organization tables.

Plan fields such as:

```text
country_id
region_id / emirate_id
city_id
area_zone_id
postal_code
po_box
address_line_1
address_line_2
latitude
longitude
primary_port_id if needed later
```

Important:

- Do not remove free-form address lines.
- Keep address_line fields for detailed street/building/location.
- Use FK fields for structured geography.
- If old text fields exist, keep temporarily and add new FK fields beside them.

Plan UI changes:

- CountrySelect
- Region / Emirate select filtered by country
- CitySelect filtered by region/country
- AreaZoneSelect filtered by city
- optional PortSelect only if business need exists

Plan migration strategy for existing organization records.

## 6. Branches Integration Plan

Analyze branches table and UI.

Plan branch fields:

```text
country_id
region_id / emirate_id
city_id
area_zone_id
po_box
postal_code
address_line_1
address_line_2
latitude
longitude
nearest_port_id optional
```

Plan cascading UI:

```text
Country → Region / Emirate / Governorate → City → Area / Zone
```

Plan how branch code/location fields should remain separate from geography.

## 7. Address Tables Integration Plan

If tables exist such as:

```text
owner_company_addresses
branch_addresses
addresses
```

Plan:

- whether to normalize addresses there instead of directly on owner_companies/branches
- support multiple addresses per company/branch
- address type lookup
- primary address flag
- expiry/document link if relevant
- localization support
- UAE PO Box
- coordinates

Recommend whether the first implementation should update main organization/branch tables or address child tables.

## 8. Other Existing Modules Integration Opportunities

Investigate all implemented modules and identify where Geography should eventually be integrated.

Examples:

```text
users/profile location
document letterheads
app settings company address
numbering rules if branch/country filters exist
audit reports if location filters exist
master data dashboard
```

Do not implement all now.

Classify each as:

```text
Now
Next
Later
Not needed
```

## 9. Database Change Recommendations

Recommend exact schema strategy.

Minimum safe approach likely:

```text
Add new FK columns beside old text columns.
Do not drop old text columns now.
Populate FK columns where exact match exists.
Keep old text columns for backward compatibility until migration verified.
Later cleanup phase can remove/deprecate old text fields.
```

For each affected table, list:

- columns to add
- columns to keep
- columns to deprecate later
- FK constraints
- indexes
- comments
- data migration logic
- rollback approach

## 10. Data Migration Strategy

Plan how to migrate existing text values.

For example:

```text
country text = UAE / United Arab Emirates / AE → countries.id for AE
emirate text = Abu Dhabi / AUH → emirates.id for Abu Dhabi
city text = Abu Dhabi / Dubai → cities.id
area text = Musaffah / ICAD → areas_zones.id if exact match
```

Include:

- exact match strategy
- fuzzy match risk
- unmatched values handling
- migration report table or CSV
- manual review list
- no destructive migration
- old values retained

## 11. UI/Form Integration Plan

For each affected page/form, plan:

- fields to add
- fields to replace
- cascading select behavior
- default values
- edit mode behavior
- view mode behavior
- validation
- error messages
- user-friendly labels

Cascading behavior:

```text
Country selected → Region list filtered
Region selected → City list filtered
City selected → Area list filtered
Area optional
```

## 12. Server Actions / Validation Integration Plan

Identify actions and schemas to update.

For each affected module:

- server action file
- create action changes
- update action changes
- list/get changes
- validation schema changes
- type changes
- audit diff impact
- revalidate paths

## 13. RLS / Permission / Audit Impact

Explain:

- whether new FK columns affect RLS
- whether organization/branch permissions remain same
- whether geography data read access is sufficient
- whether audit logs will capture FK changes
- whether system_admin full access remains unaffected
- whether any new permissions are needed

Prefer no new permissions if existing organization/branch permissions cover the changes.

## 14. Backward Compatibility Plan

Must include:

- do not drop old text columns immediately
- keep old UI display fallback if FK is null
- allow existing records to load even without FK values
- prevent data loss
- deprecate old fields later only after verification
- generate migration report for unmatched values

## 15. Implementation Phasing Recommendation

Recommend safe sub-phases.

Example:

```text
002F.3C.1B.1 — Organization/Owner Company Geography Integration Plan/Implementation
002F.3C.1B.2 — Branch Geography Integration
002F.3C.1B.3 — Existing Address Tables Integration
002F.3C.1B.4 — Geography Integration QA and Cleanup
```

Or recommend one small implementation if scope is small.

The plan must recommend exact next implementation step.

## 16. Testing Plan

Include tests:

## Database

- FK columns exist
- FKs valid
- indexes exist
- old data preserved
- FK migration results correct
- unmatched values reported

## UI

- organization form loads
- branch form loads
- cascading selects work
- edit existing record with null FK works
- save creates FK values
- old text fallback displays

## RLS

- system_admin full access
- group_admin/company/branch permissions unchanged
- normal users blocked where expected

## Build

```text
npm run typecheck
npm run lint
npm run build
```

## Browser

- create organization with UAE location
- edit organization with Jordan location
- create branch with UAE / city / area
- edit existing branch with old text values

## 17. Risks and Mitigations

Include:

- old text values not matching master data
- data loss risk
- route/form breakage
- FK constraint failures
- inconsistent country/region/city values
- cascading select UX issues
- RLS read restrictions
- too much scope before 002F.3C.2
- future modules depending on geography

For each risk:

```text
Risk | Impact | Likelihood | Mitigation
```

## 18. Acceptance Criteria

Use future checkboxes `[ ]`.

Include:

- [ ] Plan approved by Sameer
- [ ] affected fields identified
- [ ] database schema change plan complete
- [ ] old data migration strategy defined
- [ ] UI integration plan complete
- [ ] server action plan complete
- [ ] RLS/audit impact reviewed
- [ ] implementation phasing approved
- [ ] next implementation prompt generated

## 19. Final Recommendation

Clearly say:

- whether integration should happen before 002F.3C.2
- recommended minimum safe implementation
- exact first implementation sub-phase
- any decision needed from Sameer
- whether Work Sites remain deferred
- whether old text fields remain temporarily

## 20. Next Prompt Name After Approval

Recommend the exact next prompt name.

Example:

```text
PROMPT_ERP_BASE_002F_3C_1B_1_IMPLEMENT_ORGANIZATION_BRANCH_GEOGRAPHY_INTEGRATION.md
```

or if split:

```text
PROMPT_ERP_BASE_002F_3C_1B_1_IMPLEMENT_OWNER_COMPANY_GEOGRAPHY_INTEGRATION.md
PROMPT_ERP_BASE_002F_3C_1B_2_IMPLEMENT_BRANCH_GEOGRAPHY_INTEGRATION.md
```

## Final Status

At the end write one of:

```text
READY FOR SAMEER REVIEW — Geography integration impact plan complete.
NEEDS USER DECISION — Specific decisions required before implementation.
BLOCKED — Could not inspect source or determine safe integration plan.
```

## Final Instruction

Create only:

```text
ERP_BASE_002F_3C_1A_GEOGRAPHY_INTEGRATION_IMPACT_PLAN.md
```

Do not implement anything.
Do not start 002F.3C.2.
