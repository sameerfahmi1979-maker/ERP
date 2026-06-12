# PROMPT_ERP_BASE_002F_3E_3B_2B_CONVERT_GEOGRAPHY_SELECTS_TO_ERPCOMBOBOX

Act as a senior ERP QA lead, Supabase/PostgreSQL RLS auditor, Playwright automation engineer, Next.js runtime tester, SaaS security tester, enterprise ERP UI/UX architect, reusable component architect, shadcn/ui combobox implementation specialist, accessibility reviewer, master-data governance auditor, senior React/Next.js engineer, and Cursor implementation engineer.

## Phase

ERP BASE 002F.3E.3B.2B — Convert Geography Select Wrappers to ERPCombobox

## Prompt Purpose

This is a controlled IMPLEMENTATION prompt.

Implement only the geography select wrapper conversion using the already-created shared `ERPCombobox` base component.

This phase continues after:

```text
ERP BASE 002F.3E.3B.2A — Implement Base ERPCombobox and LookupSelect Wrapper
```

In 3B.2A, the shared `ERPCombobox` base component and `LookupSelect` wrapper were implemented with **PASS WITH NOTES**, pending user browser verification.

For this phase, convert only:

```text
CountrySelect
EmirateSelect
CitySelect
AreaZoneSelect
```

to internally use `ERPCombobox`.

Do not modify finance selects.

Do not modify LookupSelect unless a small compatibility fix is absolutely required.

Do not modify Customer form directly unless required by build/runtime errors.

Do not modify database schema.

Do not create migrations.

Do not apply SQL.

Do not implement Global Search.

Do not continue to 3B.2C.

---

# 1. Mandatory Standards To Read First

Before implementation, read and follow:

```text
docs/standards/ERP_GLOBAL_CURSOR_DEVELOPMENT_AND_IMPLEMENTATION_GUIDE.md

docs/standards/ERP_GLOBAL_UI_UX_FORM_TABLE_DRAWER_DEVELOPMENT_GUIDE.md
```

Also review:

```text
ERP_BASE_002F_3E_3B_2_GLOBAL_COMBOBOX_FOUNDATION_UIUX_TECHNICAL_PLAN.md

ERP_BASE_002F_3E_3B_2_GLOBAL_COMBOBOX_FOUNDATION_SQL_REVIEW.sql

ERP_BASE_002F_3E_3B_2_GLOBAL_COMBOBOX_FOUNDATION_RISK_IMPACT_REVIEW.md

ERP_BASE_002F_3E_3B_2_GLOBAL_COMBOBOX_FOUNDATION_NEXT_IMPLEMENTATION_PROMPT_PLAN.md

ERP_BASE_002F_3E_3B_2A_BASE_ERPCOMBOBOX_AND_LOOKUPSELECT_IMPLEMENTATION_REPORT.md
```

The implementation report must confirm these files were reviewed.

---

# 2. Mandatory Supabase Connection First

Before implementation, connect to the live Supabase project:

```text
https://mmiefuieduzdiiwnqpie.supabase.co
```

Verify live schema and current data for:

```text
countries
emirates
cities
areas_zones
```

Verify:

```text
tables exist
RLS is enabled
columns used by current geography select components exist
active records exist
foreign key relationships / parent filter columns exist
no SQL changes are required
```

Expected table relationships to verify from live schema/source code:

```text
countries.id
emirates.country_id
cities.emirate_id
areas_zones.city_id
```

Do not assume column names. Verify from live schema and existing source code.

The implementation report must include:

```text
Connected to live Supabase project: https://mmiefuieduzdiiwnqpie.supabase.co
Live database schema was inspected before converting geography select wrappers to ERPCombobox.
```

If Supabase connection fails, stop and create a BLOCKED report.

Do not implement without live verification.

---

# 3. Scope

## In Scope

```text
Refactor CountrySelect to internally use ERPCombobox.
Refactor EmirateSelect to internally use ERPCombobox.
Refactor CitySelect to internally use ERPCombobox.
Refactor AreaZoneSelect to internally use ERPCombobox.

Preserve all public component names.
Preserve all import paths.
Preserve all existing public props.
Preserve value/onValueChange behavior.
Preserve countryId / emirateId / cityId parent filtering.
Preserve includeInactive behavior.
Preserve gccOnly behavior for CountrySelect if it exists.
Preserve showCode behavior.
Preserve language en/ar behavior.
Preserve allowClear behavior.
Preserve disabled behavior.
Preserve required behavior.
Preserve error behavior.
Preserve loading/empty states.
Test Customer form Address/Location tab.
Test cascading behavior.
Generate implementation report.
```

## Out of Scope

```text
LookupSelect refactor, except small compatibility fix if absolutely required
Finance components:
- BankSelect
- CurrencySelect
- PaymentTermSelect
- TaxTypeSelect

Remaining select components:
- PortSelect
- OwnerCompanySelect
- BranchSelect
- UOMCategorySelect
- UnitOfMeasureSelect
- UnitByCategorySelect
- CostCenterSelect
- ProfitCenterSelect

Customer form direct refactor
Required field marker implementation
Save / Save & Close / Cancel implementation
Safe close implementation
Customer drawer performance optimization
Global Search implementation
AI implementation
DMS implementation
Database migration
SQL execution
```

---

# 4. Files To Inspect

Inspect existing files before editing:

```text
src/components/erp/combobox/erp-combobox.tsx
src/components/erp/combobox/types.ts
src/components/erp/combobox/index.ts

src/components/erp/geography/country-select.tsx
src/components/erp/geography/emirate-select.tsx
src/components/erp/geography/city-select.tsx
src/components/erp/geography/area-zone-select.tsx
src/components/erp/geography/index.ts

src/features/master-data/customers/components/customer-form-drawer.tsx

src/components/ui/command.tsx
src/components/ui/popover.tsx
src/components/ui/button.tsx
src/components/ui/badge.tsx
src/components/ui/label.tsx

src/lib/supabase/client.ts
src/lib/supabase/server.ts
src/lib/rbac/check.ts
```

If exact paths differ, find the actual paths and document in the report.

---

# 5. Files To Modify

Modify only:

```text
src/components/erp/geography/country-select.tsx
src/components/erp/geography/emirate-select.tsx
src/components/erp/geography/city-select.tsx
src/components/erp/geography/area-zone-select.tsx
```

Modify `src/components/erp/geography/index.ts` only if export compatibility requires it.

Modify `ERPCombobox` only if a small reusable compatibility fix is necessary and does not break 3B.2A / LookupSelect. If modified, document exactly why.

Do not modify Customer form directly unless build/runtime errors prove it is required. If that happens, document it clearly.

---

# 6. Geography Wrapper Requirements

All geography select components must remain public wrappers that internally use `ERPCombobox`.

They must not duplicate Popover + Command logic.

They must fetch their own data exactly as before, map rows to `ERPComboboxOption[]`, and pass options to `ERPCombobox`.

---

## 6.1 CountrySelect Requirements

Refactor:

```text
src/components/erp/geography/country-select.tsx
```

Preserve all existing props, including if present:

```text
value
onValueChange
placeholder
disabled
required
gccOnly
includeInactive
language
showCode
allowClear
className
name
error
```

Expected behavior:

```text
fetch countries from countries table/source
respect includeInactive
respect gccOnly if present
map to ERPComboboxOption[]
value = country.id
label = country.name_en
labelAr = country.name_ar
code = country.country_code
raw = country
search by country_code, name_en, name_ar
```

Do not change value type.

`onValueChange` must still return:

```text
number | null
```

---

## 6.2 EmirateSelect Requirements

Refactor:

```text
src/components/erp/geography/emirate-select.tsx
```

Preserve all existing props, including if present:

```text
value
onValueChange
countryId
placeholder
disabled
required
includeInactive
language
showCode
allowClear
className
name
error
```

Expected behavior:

```text
fetch emirates filtered by countryId
do not load unrelated emirates if countryId is required by existing behavior
map to ERPComboboxOption[]
value = emirate.id
label = emirate.name_en
labelAr = emirate.name_ar
code = emirate.emirate_code
raw = emirate
search by emirate_code, name_en, name_ar
```

Do not change value type.

`onValueChange` must still return:

```text
number | null
```

Disabled behavior must remain:

```text
disabled if disabled prop true
disabled if parent countryId is required but not selected, according to current behavior
```

---

## 6.3 CitySelect Requirements

Refactor:

```text
src/components/erp/geography/city-select.tsx
```

Preserve all existing props, including if present:

```text
value
onValueChange
emirateId
placeholder
disabled
required
includeInactive
language
showCode
allowClear
className
name
error
```

Expected behavior:

```text
fetch cities filtered by emirateId
map to ERPComboboxOption[]
value = city.id
label = city.name_en
labelAr = city.name_ar
code = city.city_code
raw = city
search by city_code, name_en, name_ar
```

Do not change value type.

`onValueChange` must still return:

```text
number | null
```

Disabled behavior must remain:

```text
disabled if disabled prop true
disabled if parent emirateId is required but not selected, according to current behavior
```

---

## 6.4 AreaZoneSelect Requirements

Refactor:

```text
src/components/erp/geography/area-zone-select.tsx
```

Preserve all existing props, including if present:

```text
value
onValueChange
cityId
placeholder
disabled
required
includeInactive
language
showCode
allowClear
className
name
error
```

Expected behavior:

```text
fetch areas_zones filtered by cityId
map to ERPComboboxOption[]
value = area_zone.id
label = area_zone.name_en
labelAr = area_zone.name_ar
code = area_zone.area_code or actual code column from live schema/source
raw = area_zone
search by code, name_en, name_ar
```

Do not invent column names. Verify actual area/zone code column from live schema and existing source.

Do not change value type.

`onValueChange` must still return:

```text
number | null
```

Disabled behavior must remain:

```text
disabled if disabled prop true
disabled if parent cityId is required but not selected, according to current behavior
```

---

# 7. Cascading Behavior Requirements

Customer form Address/Location tab must continue to behave correctly:

```text
Selecting Country resets Emirate, City, Area/Zone.
Selecting Emirate resets City, Area/Zone.
Selecting City resets Area/Zone.
```

This behavior may exist in the Customer form or component state. Do not break it.

The geography wrappers must not internally prevent parent components from resetting child values.

When parent prop changes:

```text
EmirateSelect must refetch for new countryId.
CitySelect must refetch for new emirateId.
AreaZoneSelect must refetch for new cityId.
```

If parent value becomes null:

```text
child component should show disabled/empty/select parent first state according to current behavior.
```

---

# 8. ERPCombobox Usage Requirements

All four wrappers must import from:

```text
src/components/erp/combobox
```

or the actual export path created in 3B.2A.

They must pass:

```text
value
onValueChange
options
placeholder
searchPlaceholder
disabled/readOnly
required
loading
error
allowClear
showCode
language
emptyText
noResultsText
name
className
```

as applicable.

Do not copy the Popover + Command implementation into each wrapper.

---

# 9. Customer Form Tests Required

After implementation, test geography fields in the Customer drawer.

## Address/Location tab

```text
Country
Emirate / Region
City
Area / Zone
```

Test in:

```text
Add mode
Edit mode
View mode
```

## Required manual/browser tests

```text
Open Customers page
Open Add Customer drawer
Go to Address/Location tab
Verify Country is Combobox behavior
Search Country by code, English, Arabic if data exists
Select Country
Verify Emirate/Region becomes enabled and loads values for selected Country
Search Emirate by code, English, Arabic if data exists
Select Emirate
Verify City becomes enabled and loads values for selected Emirate
Search City by code, English, Arabic if data exists
Select City
Verify Area/Zone becomes enabled and loads values for selected City
Search Area/Zone by code, English, Arabic if data exists
Select Area/Zone
Change Country
Verify Emirate, City, Area/Zone reset
Change Emirate
Verify City, Area/Zone reset
Change City
Verify Area/Zone resets
Clear Country if optional
Verify child geography values clear/disable as expected
Open Edit Customer drawer
Verify existing selected geography values display correctly
Open View Customer drawer
Verify geography comboboxes are disabled/read-only
Verify keyboard navigation works:
- Enter opens
- arrow keys navigate
- Enter selects
- Escape closes
Verify no console errors
Verify no horizontal scroll
```

---

# 10. Build / Quality Tests Required

Run:

```bash
npm run typecheck
npm run lint
npm run build
```

If any fail, fix before report.

Do not mark PASS if typecheck or build fails.

If lint fails due only to pre-existing unrelated issues, document clearly:

```text
lint has pre-existing unrelated issues; no new lint issues introduced by this phase
```

---

# 11. Browser / Manual Testing

Use Playwright if available.

If Playwright is not available, perform manual browser tests and document clearly.

If browser tests cannot be performed, mark report as:

```text
PASS WITH NOTES
```

not full PASS.

---

# 12. Required Implementation Report

Create:

```text
ERP_BASE_002F_3E_3B_2B_GEOGRAPHY_SELECT_WRAPPERS_IMPLEMENTATION_REPORT.md
```

The report must include:

1. Phase name.
2. Date/time.
3. Supabase connection confirmation.
4. Standards files read confirmation.
5. Planning files read confirmation.
6. Files modified.
7. Whether ERPCombobox was modified or not.
8. CountrySelect wrapper refactor summary.
9. EmirateSelect wrapper refactor summary.
10. CitySelect wrapper refactor summary.
11. AreaZoneSelect wrapper refactor summary.
12. Backward compatibility confirmation.
13. Parent filtering confirmation.
14. Cascading behavior confirmation.
15. Customer form Address/Location testing results.
16. Keyboard/accessibility testing results.
17. Typecheck result.
18. Lint result.
19. Build result.
20. Browser/manual testing result.
21. Known notes/limitations.
22. Final status.

Final status must be exactly one of:

```text
PASS — 3B.2B geography select wrappers converted to ERPCombobox and verified successfully.
PASS WITH NOTES — 3B.2B implemented with non-blocking notes.
FAIL — 3B.2B requires correction before approval.
BLOCKED — 3B.2B could not be completed due to blocking issue.
```

---

# 13. Stop Condition

After converting the four geography wrappers, testing, and creating the report, stop.

Do not continue to:

```text
3B.2C — Finance Select Wrappers
```

Do not implement finance wrappers.

Do not implement remaining wrappers.

Do not implement global search.

Wait for Sameer/Dina review and approval.

---

# Final Instruction

Read both standards guides.

Connect to Supabase.

Verify live geography schema.

Convert only CountrySelect, EmirateSelect, CitySelect, and AreaZoneSelect to use ERPCombobox internally.

Run tests.

Create implementation report.

Stop.
