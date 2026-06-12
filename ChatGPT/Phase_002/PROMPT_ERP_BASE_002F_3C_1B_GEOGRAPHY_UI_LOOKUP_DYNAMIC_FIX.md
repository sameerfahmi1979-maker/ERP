# PROMPT_ERP_BASE_002F_3C_1B_1_ORGANIZATIONS_BRANCHES_GEOGRAPHY_UI_FIX_AND_LOOKUP_DYNAMIC_VERIFICATION

Act as a senior ERP QA lead, Supabase/PostgreSQL RLS auditor, Playwright automation engineer, Next.js runtime tester, SaaS security tester, notification-engine validation specialist, senior Next.js/Supabase implementation engineer, enterprise ERP UI/UX reviewer, master-data integration auditor, and dynamic lookup-system validation specialist.

## Phase

ERP BASE 002F.3C.1B — Geography Integration UI Fix and Lookup Dynamic Verification

## Implementation Mode

This is a focused FIX AND VERIFICATION prompt.

Do not start ERP BASE 002F.3C.2.

Do not implement Finance Basics.

Do not implement Units & Measurements.

Do not implement Work Sites.

Do not implement CRM, HR, Fleet, Workshop, Inventory, Procurement, HSE, DMS, Scrap/Waste/Demolition, or Accounting.

Fix only the issues listed in this prompt and generate a detailed fix report.

## Reference Files / Reports

Review the latest Organizations Geography Integration implementation report:

```text
ERP_BASE_002F_3C_1B_1_ORGANIZATIONS_GEOGRAPHY_INTEGRATION_IMPLEMENTATION_REPORT.md
```

Also review relevant Geography reports if needed:

```text
ERP_BASE_002F_3C_1_GEOGRAPHY_GLOBAL_REGION_FINAL_CLEANUP_AND_VERIFICATION_REPORT.md
ERP_BASE_002F_3C_1A_GEOGRAPHY_INTEGRATION_IMPACT_PLAN.md
```

## User-Tested Current Issues

Sameer tested the app and found these issues:

### Issue 1 — Duplicate Country Field in Organization

In Organization form:

```text
Basic Information section has Country field, but it is not a dropdown.
Address and Contacts section also has Country dropdown.
```

Required fix:

1. Investigate why Basic Information still has a Country text field.
2. Remove or hide the old free-text Country field from Basic Information if it is legacy and not needed there.
3. Keep the structured Country dropdown only in the Address and Contact / Geography section.
4. Do not delete the legacy database column yet.
5. If the old text country field is needed for backward compatibility, show it only as read-only legacy hint where appropriate, not as an editable field.
6. The final Organization form must not confuse users with two country inputs.

### Issue 2 — Area / Zone Displays Serial Number Instead of Name

In Organization Address and Contact section:

```text
After selecting Area / Zone, it displays the serial number / ID instead of the area/zone name.
```

Required fix:

1. Inspect `AreaZoneSelect` component.
2. Inspect how Organization form stores and displays `area_zone_id`.
3. Fix select value/display mapping so the UI displays:
   - area/zone English name
   - optionally area code
   - not the numeric ID
4. Confirm it still saves `area_zone_id` to database.
5. Confirm edit mode loads the correct area/zone name.
6. Confirm view mode shows area/zone name, not ID.
7. Check whether the same problem exists in Branch form or other forms using `AreaZoneSelect`; fix if related.

### Issue 3 — Branch Profile Location Tab: Emirate Not Retrieved From Master Data

In Branch Profile location tab:

```text
Emirate is not retrieved from master data.
```

Required fix:

1. Inspect Branch Profile / Branch Location tab.
2. Identify whether it uses old text field `emirate` instead of `emirate_id`.
3. Connect it to the approved Geography master data:
   - CountrySelect
   - EmirateSelect / Region / Emirate / Governorate select
   - CitySelect
   - AreaZoneSelect
4. If Branch Geography Integration has not been fully implemented yet, implement only the minimum fix required for Branch Profile Location tab to retrieve and display Region / Emirate / Governorate from master data.
5. Do not break the approved implementation sequence.
6. If full Branch Geography Integration is still pending, clearly document whether this fix is:
   - temporary display fix, or
   - part of full Branch Geography Integration.
7. Region/Emirate label must use global wording:
   - `Region / Emirate / Governorate`
8. The location tab must display the master-data name, not the ID and not only old free-text value.
9. If FK is null but legacy text exists, display legacy text as fallback with a clear marker:
   - `Abu Dhabi (legacy)`

### Issue 4 — Lookup Categories / Lookup Values / Locked System Values Dynamic Behavior

Sameer asked:

```text
Lookup Categories, Lookup Values, and Locked System Values — are they dynamic?
If I add more values to the system, are they updating the values in the 3 menus?
```

Required answer in final report:

1. Investigate the actual 002F.3B lookup implementation.
2. Inspect:
   - `global_lookup_categories`
   - `global_lookup_values`
   - Lookup Categories page
   - Lookup Values page
   - Locked System Values page
   - LookupSelect component
   - lookup server actions
3. Answer clearly:
   - Are Lookup Categories dynamic?
   - Are Lookup Values dynamic?
   - Are Locked System Values dynamic?
   - If a user adds a new lookup category, will it appear in Lookup Categories?
   - If a user adds a new lookup value, will it appear in Lookup Values?
   - If a lookup category/value is marked `is_system=true` or `is_locked=true`, will it appear in Locked System Values?
   - Are there cache/revalidation issues?
   - Does the UI need refresh or revalidation after adding values?
   - Are newly added values immediately available in `LookupSelect` dropdowns?
4. If dynamic behavior is broken or incomplete, fix it if safe.
5. If it is already working, document evidence and explain how it works.
6. If locked values page only shows `is_locked=true` or `is_system=true`, state the exact rule.

## Critical Existing Rules

1. Do not drop old legacy text columns.
2. Do not remove data from database.
3. Do not break existing Organization create/edit.
4. Do not break Branch create/edit.
5. Do not break Geography module.
6. Do not break Lookup module.
7. Do not start 002F.3C.2.
8. Keep system_admin/global admin full access.
9. Keep RLS secure.
10. All fixes must be audited or compatible with existing audit behavior where mutations occur.

---

# 1. Required Source Inspection

Inspect the actual source files before fixing.

## Organization Files

Expected files may include:

```text
src/features/organizations/organization-form-dialog.tsx
src/features/organizations/organization-schema.ts
src/features/organizations/organizations-table.tsx
src/app/(protected)/admin/organizations/page.tsx
src/server/actions/organizations.ts
```

Find actual paths if different.

## Branch Files

Expected files may include:

```text
src/features/branches/branch-form-dialog.tsx
src/features/branches/branches-table.tsx
src/app/(protected)/admin/branches/page.tsx
src/server/actions/branches.ts
```

Also inspect any Branch Profile / Branch Detail / Location tab components. Search for:

```text
Branch Profile
Location tab
branch profile
locations tab
emirate
city
area
country
```

## Geography Components

Inspect:

```text
src/components/erp/geography/country-select.tsx
src/components/erp/geography/emirate-select.tsx
src/components/erp/geography/city-select.tsx
src/components/erp/geography/area-zone-select.tsx
src/components/erp/geography/port-select.tsx
```

## Lookup Components

Inspect:

```text
src/features/master-data/lookups
src/components/erp/lookup-select.tsx
src/app/(protected)/admin/master-data/lookups
global_lookup_categories
global_lookup_values
```

Search actual project paths if different.

---

# 2. Fix Organization Duplicate Country Field

## Required Behavior

Organization form should have one structured country selection.

Recommended final UI:

```text
Basic Information section:
- Company code
- legal name
- trade name
- company type
- status
- other identity fields
NO editable Country text field here

Address and Contact / Geography section:
- CountrySelect
- Region / Emirate / Governorate select
- CitySelect
- AreaZoneSelect
- address lines
- PO Box
- Makani
- phone/email/website
```

## Legacy Handling

If `owner_companies.country` text column still exists:

- Do not delete it.
- Do not show it as editable field in Basic Information.
- If FK `country_id` is null and legacy `country` exists, show read-only helper text under CountrySelect:
  - `Legacy Country: <value>`
- Keep old text value preserved.

## Verification

Test:

1. Open Organization Add form.
2. Confirm only one Country control exists and it is a dropdown.
3. Open Organization Edit form.
4. Confirm Basic Information does not show old editable country text input.
5. Confirm Address and Contact section has Country dropdown.
6. Confirm save still works.

---

# 3. Fix Area / Zone Display Showing ID

## Required Behavior

When selecting Area / Zone:

- the stored value should remain `area_zone_id`
- the visible text should show area/zone name
- optionally show area code
- never display only numeric ID to the user

Examples:

```text
Musaffah
ICAD
Jebel Ali Free Zone
Al Quoz
```

Acceptable display:

```text
MUSSAFAH — Musaffah
ICAD — Industrial City of Abu Dhabi
```

Not acceptable:

```text
15
22
3
```

## Required Checks

Inspect `AreaZoneSelect`:

- Does it use `value` as number but render raw value?
- Does it find selected option by ID?
- Does it display `name_en` / `area_name_en` / actual schema field?
- Does it have mismatched field names?
- Does it query `areas_zones` correctly?
- Does Organization form pass number/string mismatch?

Fix the source of the problem.

## Also Check

- Branch form
- City/area filter behavior
- Edit mode and view mode

---

# 4. Fix Branch Profile Location Tab Emirate Master Data Retrieval

## Required Behavior

Branch Profile Location tab must use master data fields and display names.

Minimum acceptable behavior:

1. If `branch.emirate_id` exists:
   - display linked region/emirate/governorate name from `emirates` table.
2. If `branch.emirate_id` is null but `branch.emirate` legacy text exists:
   - display legacy text with marker:
     - `Abu Dhabi (legacy)`
3. If neither exists:
   - display `—`

Preferred behavior:

- Branch profile location tab uses same cascading Geography selects when editing:
  - Country
  - Region / Emirate / Governorate
  - City
  - Area / Zone

## Required Investigation

Determine if Branch Profile location tab is:

- a separate detail component,
- part of branch form,
- part of branch table,
- or a route/page.

Fix the correct component.

Do not implement unrelated Branch Geography Integration if not needed.

But if the branch profile location tab is already part of Branch Geography Integration, complete the missing FK display/select integration there.

---

# 5. Verify Dynamic Lookup Menus

## Required Investigation Questions

Answer all:

### Lookup Categories

1. Does the Lookup Categories menu/page load data from `global_lookup_categories`?
2. If a new category is added, does it appear after save/revalidation?
3. Is it filtered by active/system/locked status?
4. Does sidebar/menu require any manual update when categories are added?

### Lookup Values

1. Does Lookup Values menu/page load data from `global_lookup_values`?
2. If a new value is added, does it appear after save/revalidation?
3. Does it appear under the correct category?
4. Does `LookupSelect` read it dynamically by category code?

### Locked System Values

1. Does Locked System Values page load from the same lookup tables?
2. What rule does it use?
   - `is_locked = true`
   - `is_system = true`
   - both
   - category locked
   - value locked
3. If a user adds a new locked/system value, does it appear?
4. If user unlocks it, does it disappear from locked/system page?
5. If value is active/inactive, how is it shown?

### Cache / Revalidation

1. After creating/updating lookup category/value, are pages revalidated?
2. Does user need manual page refresh?
3. Does LookupSelect cache values?
4. If LookupSelect caches, does it refresh after changes?

## Required Final Answer

In the final report include a clear answer:

```text
Yes / No / Partially
```

For each:

```text
Lookup Categories dynamic:
Lookup Values dynamic:
Locked System Values dynamic:
LookupSelect dropdowns dynamic:
Refresh/revalidation behavior:
Any fixes applied:
```

---

# 6. Testing Requirements

Run:

```text
npm run typecheck
npm run lint
npm run build
```

If lint has unrelated legacy errors, separate clearly:

```text
Current fix module lint errors:
Legacy unrelated lint errors:
```

All relevant errors caused by this fix must be fixed.

## Browser Testing

Test as system_admin.

### Organization

1. Open Organization form.
2. Confirm duplicate country field removed/hidden.
3. Select Country dropdown.
4. Select Region / Emirate / Governorate.
5. Select City.
6. Select Area / Zone.
7. Confirm Area / Zone displays name, not ID.
8. Save.
9. Reopen edit form and confirm all values display names correctly.
10. View mode shows names, not IDs.
11. Legacy fallback works if FK null.

### Branch Profile Location Tab

1. Open Branch Profile.
2. Open Location tab.
3. Confirm Region / Emirate / Governorate is loaded from master data if FK exists.
4. Confirm legacy fallback if FK missing.
5. Confirm no raw ID appears.
6. If editing is available, test cascading selects.

### Lookup Menus

1. Open Lookup Categories.
2. Add a test category or verify with existing dynamic category.
3. Confirm it appears in Lookup Categories.
4. Open Lookup Values.
5. Add a test value under a test category or verify with existing.
6. Confirm it appears in Lookup Values.
7. Mark value/category locked/system if safe.
8. Confirm it appears in Locked System Values according to the page rule.
9. Clean up test values if created, or mark them inactive/test.
10. Confirm LookupSelect can read newly added active values.

---

# 7. Required Fix Report

Create:

```text
ERP_BASE_002F_3C_1B_GEOGRAPHY_UI_LOOKUP_DYNAMIC_FIX_REPORT.md
```

The report must include:

1. Phase name.
2. Date.
3. Summary of issues reported by Sameer.
4. Files reviewed.
5. Files modified.
6. Organization duplicate country fix.
7. Area/Zone ID display fix.
8. Branch Profile Location master data fix.
9. Lookup Categories dynamic verification.
10. Lookup Values dynamic verification.
11. Locked System Values dynamic verification.
12. LookupSelect dynamic behavior verification.
13. Cache/revalidation explanation.
14. Typecheck result.
15. Lint result.
16. Build result.
17. Browser testing result.
18. Remaining known limitations.
19. Final status.

At the end write one of:

```text
PASS — Reported geography/lookup issues are fixed and verified.
PASS WITH NOTES — Issues are fixed with minor non-blocking notes.
FAIL — One or more reported issues still require correction.
```

## Final Instruction

Fix only the reported issues and verify dynamic lookup behavior.

Do not start 002F.3C.2.

Do not implement Finance Basics.

Generate the fix report and stop.
