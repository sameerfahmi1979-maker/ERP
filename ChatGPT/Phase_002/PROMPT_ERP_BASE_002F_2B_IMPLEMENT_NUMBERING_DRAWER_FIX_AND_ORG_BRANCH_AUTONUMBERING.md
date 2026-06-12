# PROMPT_ERP_BASE_002F_2B_IMPLEMENT_NUMBERING_DRAWER_FIX_AND_ORG_BRANCH_AUTONUMBERING

Act as a senior ERP QA lead, Supabase/PostgreSQL RLS auditor, Playwright automation engineer, Next.js runtime tester, SaaS security tester, and notification-engine validation specialist.

## Phase

ERP BASE 002F.2B — Fix Global Numbering Rule Drawer Form and Add Organization/Branch Autonumbering Support

## Important Instruction

This is an IMPLEMENTATION prompt.

Do not only analyze.

Do not only create a report.

Implement the required fixes and generate the implementation report.

## Background

ERP BASE 002F.2 Global Numbering Engine was implemented, but during user testing the Add Numbering Rule drawer opens with the left section navigation visible while the main form body appears empty.

A follow-up analysis report identified the root cause:

- `ERPFieldGrid` uses `grid-cols-12`.
- The numbering form field wrapper divs are missing proper `col-span-X` classes.
- Fields collapse to 1/12th width and become effectively invisible.
- File requiring fix:
  - `src/features/numbering/components/numbering-rule-form-dialog.tsx`

The report also identified that:

- `owner_companies.company_code` already exists.
- `branches.branch_code` already exists.
- Both are currently manually entered.
- However, the user clarified that organization/company and branch should also have autonumbering/code support.

## User Clarification

The user wants:

1. Normal ERP document numbering to remain simple:
   - EMP-0001
   - PO-0001
   - INV-0001
   - JO-0001
   - GRN-0001

2. No company, branch, city, location, year, month, or day in normal document numbers.

3. Organization/company and branch are exceptions:
   - Organization/company master records should have code/autonumbering support.
   - Branch master records should have code/autonumbering support.
   - Company code and branch code fields must remain important master data fields.

4. Future modules that need autonumbering must use the existing ERP BASE 002F.2 Global Numbering System, not separate numbering logic.

## Main Objectives

Implement the following:

1. Fix the empty Add Numbering Rule drawer form.
2. Make all form sections visible and usable.
3. Add proper column spans to all numbering form fields.
4. Improve organization/company code handling.
5. Improve branch code handling.
6. Add optional autonumber generation support for organization/company and branch codes or internal references, using the existing Global Numbering Engine.
7. Do not change normal document numbering format.
8. Produce a complete implementation report.

## Scope Boundaries

Do not start ERP BASE 002F.3.

Do not implement HR, Fleet, Workshop, Procurement, Finance, Warehouse, HSE, CRM, DMS, or other business modules.

Do not change normal document numbers into long format.

Do not create separate numbering logic outside the Global Numbering Engine.

Do not remove existing manually entered company_code and branch_code functionality.

Do not break existing organization and branch screens.

Do not make company/branch code mandatory auto-only if current operations need manual short codes such as ALGT, ALS, PGI, AUH, DXB, SHJ.

## Part A — Fix Empty Numbering Rule Drawer Form

### Required File

Modify:

`src/features/numbering/components/numbering-rule-form-dialog.tsx`

### Required Fix

Add proper Tailwind grid column span classes to all field wrapper divs inside `ERPFieldGrid`.

Follow the existing working pattern from:

- `src/features/organizations/organization-form-dialog.tsx`
- `src/features/branches/branch-form-dialog.tsx`

### Required Column Layout

Use these column spans unless the source code requires a better layout:

#### Section 1 — Basic Info

- Rule Code: `col-span-6`
- Rule Name: `col-span-6`
- Description: `col-span-12`
- Active: `col-span-6`
- Locked: `col-span-6`
- Effective From: `col-span-6`
- Effective To: `col-span-6`

#### Section 2 — Module & Document

- Module Code: `col-span-6`
- Module Name: `col-span-6`
- Document Type Code: `col-span-6`
- Document Type Name: `col-span-6`
- Document Prefix: `col-span-6`

#### Section 3 — Number Format

- Separator: `col-span-4`
- Format Template: `col-span-8`
- Live Preview Card: `col-span-12`
- Token helper: `col-span-12` if present

#### Section 4 — Sequence Settings

- Sequence Length: `col-span-4`
- Padding Character: `col-span-4`
- Starting Sequence Number: `col-span-4`
- Reset Policy: `col-span-4`
- Current Sequence Number: `col-span-6`
- Next Sequence Number: `col-span-6`

#### Section 5 — Generation Policy

- Checkbox groups: `col-span-12`
- Cancelled Number Policy: `col-span-6`
- Duplicate Prevention Scope: `col-span-6`

If manual override, reserve on draft, or yearly/monthly reset are not fully implemented, they must either be disabled with clear helper text “Future enhancement” or hidden until functional.

Do not leave active controls that do nothing.

#### Section 6 — Audit Info

- Created At: `col-span-6`
- Updated At: `col-span-6`
- Created By: `col-span-6`
- Updated By: `col-span-6`

#### Section 7 — Notes

- Notes: `col-span-12`

### Required Browser Behavior After Fix

When the user opens Add Numbering Rule:

- The drawer must show the first active section fields.
- The drawer must not show an empty body.
- All sections must show their fields when clicked.
- Add, Edit, View, and Duplicate modes must all display correctly.
- Live preview must be visible and functional.
- Form buttons must be visible and functional.

## Part B — Organization/Company Code and Autonumbering Support

### Current State to Preserve

The existing `owner_companies.company_code` field must remain.

It is important master data.

Users may manually enter meaningful short company codes such as:

- ALGT
- ALS
- PGI
- AET

Do not remove this field.

Do not rename it without a migration and full compatibility check.

Do not force all company codes to become ORG-0001 if the business needs short codes.

### Required Enhancement

Add support so the organization/company form can optionally generate a code/reference from the Global Numbering Engine.

Because company codes are meaningful business abbreviations, implement this carefully.

Preferred approach:

1. Keep `company_code` as the main user-facing company code.
2. Add an optional button or action in the organization form:
   - “Generate Code”
   - or “Generate Reference”
3. If the user clicks generate:
   - Use the existing Global Numbering Engine.
   - Use a numbering rule such as:
     - rule_code: MASTER_OWNER_COMPANY
     - module_code: MASTER_DATA
     - document_type_code: OWNER_COMPANY
     - document_prefix: ORG
     - format_template: {DOC}-{SEQ4}
   - Generated result example:
     - ORG-0001
4. The generated value may populate either:
   - `company_code` if the user wants automatic company code, or
   - a new optional `internal_reference_number` field if this is safer.

Decision rule:

- If existing `company_code` is used widely as a business short code, do not overwrite its purpose.
- Add `internal_reference_number` for generated ORG-0001 if needed.
- If adding `internal_reference_number`, create proper database migration, UI field, server action handling, RLS compatibility, and audit.
- If not adding a new field, make sure generated company_code still supports manual override/edit before save.

### Required Database Planning During Implementation

Inspect current `owner_companies` usage.

If safe and needed, add:

`internal_reference_number text unique`

to `owner_companies`.

Do not make it required unless the system can generate it automatically for existing and new records.

If adding this field:

- Backfill existing records only if safe.
- Do not break existing data.
- Include migration.
- Add index/unique constraint.
- Add UI read-only or generated field.
- Add server action support.
- Add audit support if existing audit pattern supports it.

### Required Numbering Rule Seed

Ensure the Global Numbering Engine has a default rule for owner company if implementing generated internal references:

- Rule Code: MASTER_OWNER_COMPANY
- Rule Name: Owner Company Reference
- Module Code: MASTER_DATA
- Module Name: Master Data
- Document Type Code: OWNER_COMPANY
- Document Type Name: Owner Company
- Document Prefix: ORG
- Format Template: {DOC}-{SEQ4}
- Example: ORG-0001

## Part C — Branch Code and Autonumbering Support

### Current State to Preserve

The existing `branches.branch_code` field must remain.

It is important master data.

Users may manually enter meaningful branch/location codes such as:

- AUH
- DXB
- SHJ
- ICAD
- MUSSAFAH

Do not remove this field.

Do not rename it without a migration and full compatibility check.

Do not force all branch codes to become BR-0001 if the business needs location abbreviations.

### Required Enhancement

Add support so the branch form can optionally generate a branch code/reference from the Global Numbering Engine.

Preferred approach:

1. Keep `branch_code` as the main user-facing branch/location code.
2. Add optional button/action:
   - “Generate Code”
   - or “Generate Reference”
3. If the user clicks generate:
   - Use the existing Global Numbering Engine.
   - Use a numbering rule such as:
     - rule_code: MASTER_BRANCH
     - module_code: MASTER_DATA
     - document_type_code: BRANCH
     - document_prefix: BR
     - format_template: {DOC}-{SEQ4}
   - Generated result example:
     - BR-0001
4. The generated value may populate either:
   - `branch_code` if the user wants automatic branch code, or
   - a new optional `internal_reference_number` field if this is safer.

Decision rule:

- If existing `branch_code` is used as a meaningful business/location code, do not overwrite its purpose.
- Add `internal_reference_number` for generated BR-0001 if needed.
- If adding `internal_reference_number`, create proper database migration, UI field, server action handling, RLS compatibility, and audit.
- If not adding a new field, make sure generated branch_code still supports manual override/edit before save.

### Required Database Planning During Implementation

Inspect current `branches` usage.

If safe and needed, add:

`internal_reference_number text unique`

to `branches`.

Do not make it required unless the system can generate it automatically for existing and new records.

If adding this field:

- Backfill existing records only if safe.
- Do not break existing data.
- Include migration.
- Add index/unique constraint.
- Add UI read-only or generated field.
- Add server action support.
- Add audit support if existing audit pattern supports it.

### Required Numbering Rule Seed

Ensure the Global Numbering Engine has a default rule for branch if implementing generated internal references:

- Rule Code: MASTER_BRANCH
- Rule Name: Branch Reference
- Module Code: MASTER_DATA
- Module Name: Master Data
- Document Type Code: BRANCH
- Document Type Name: Branch
- Document Prefix: BR
- Format Template: {DOC}-{SEQ4}
- Example: BR-0001

## Part D — Normal Document Numbering Must Remain Simple

Do not modify the existing document numbering rules for:

- HR_EMPLOYEE
- PROCUREMENT_PURCHASE_ORDER
- FINANCE_INVOICE
- WORKSHOP_JOB_ORDER
- WAREHOUSE_GRN

They must remain simple:

- EMP-0001
- PO-0001
- INV-0001
- JO-0001
- GRN-0001

Do not add company, branch, year, month, day, or location tokens to them.

Unsupported tokens must remain blocked for normal document numbering:

- {COMPANY}
- {BRANCH}
- {CITY}
- {LOCATION}
- {YYYY}
- {YY}
- {MM}
- {DD}

## Part E — UI Improvements for Organization and Branch Forms

### Organization Form

Inspect and update if safe:

`src/features/organizations/organization-form-dialog.tsx`

Required improvements:

1. Keep `company_code`.
2. Improve placeholder to:
   - `e.g., ALGT, ALS, PGI`
3. Add helper text:
   - “Company Code is the short business code used across the ERP.”
4. If implementing generated reference:
   - Add internal reference field or generate button.
   - Clearly label it.
   - Do not confuse it with the business company code.
5. If using generate button:
   - It must call the global numbering preview/generate logic safely.
   - It must not consume sequence unless the user saves, or it must clearly reserve and audit the generated number.
   - Avoid generating unused gaps if possible.

### Branch Form

Inspect and update if safe:

`src/features/branches/branch-form-dialog.tsx`

Required improvements:

1. Keep `branch_code`.
2. Improve placeholder to:
   - `e.g., AUH, DXB, SHJ, ICAD`
3. Add helper text:
   - “Branch Code is the short location/facility code used across the ERP.”
4. If implementing generated reference:
   - Add internal reference field or generate button.
   - Clearly label it.
   - Do not confuse it with the business branch code.
5. If using generate button:
   - It must call the global numbering preview/generate logic safely.
   - It must not consume sequence unless the user saves, or it must clearly reserve and audit the generated number.
   - Avoid generating unused gaps if possible.

## Part F — Required Tests

### Numbering Drawer Tests

Run browser/manual tests:

1. Open `/admin/settings/numbering`.
2. Click Add Numbering Rule.
3. Confirm Basic Info fields are visible.
4. Click every drawer section.
5. Confirm all section fields are visible.
6. Test Add mode.
7. Test Edit mode.
8. Test View mode.
9. Test Duplicate mode.
10. Confirm live preview works.
11. Confirm the drawer is not empty anymore.

### Organization/Company Tests

1. Open organization add form.
2. Confirm company_code field exists and is visible.
3. Confirm placeholder/help text explains examples like ALGT, ALS, PGI.
4. If generated reference support is added, confirm ORG-0001 preview/generation works.
5. Confirm existing manual company_code still works.
6. Confirm uniqueness still works.
7. Confirm edit mode does not improperly change code behavior.

### Branch Tests

1. Open branch add form.
2. Confirm branch_code field exists and is visible.
3. Confirm placeholder/help text explains examples like AUH, DXB, SHJ, ICAD.
4. If generated reference support is added, confirm BR-0001 preview/generation works.
5. Confirm existing manual branch_code still works.
6. Confirm uniqueness per owner company still works.
7. Confirm edit mode does not improperly change code behavior.

### Numbering System Tests

1. Confirm EMP-0001 format remains unchanged.
2. Confirm PO-0001 format remains unchanged.
3. Confirm INV-0001 format remains unchanged.
4. Confirm unsupported long tokens are still rejected.
5. Confirm organization/branch numbering rules, if added, do not force company/branch tokens into document numbers.

### Build and Runtime Tests

Run available commands:

- npm run typecheck
- npm run lint
- npm run build
- npm test if available
- Playwright tests if available

If a command does not exist or fails due to unrelated pre-existing issue, document clearly.

## Required Implementation Report

Create this report:

`ERP_BASE_002F_2B_NUMBERING_DRAWER_FIX_AND_ORG_BRANCH_AUTONUMBERING_IMPLEMENTATION_REPORT.md`

The report must include:

1. Phase name.
2. Date.
3. User issue summary.
4. Files inspected.
5. Root cause of empty drawer.
6. Files modified.
7. Drawer/form fixes applied.
8. Before/after behavior.
9. Organization/company code strategy implemented.
10. Branch code strategy implemented.
11. Whether `internal_reference_number` fields were added or not.
12. Whether MASTER_OWNER_COMPANY numbering rule was added.
13. Whether MASTER_BRANCH numbering rule was added.
14. Confirmation that normal document numbering remains simple.
15. Confirmation that company/branch/year/month/day are not included in EMP/PO/INV/JO/GRN numbering.
16. RLS and permission impact.
17. Database migration details, if any.
18. UI changes.
19. Server action changes.
20. Test results.
21. Known limitations.
22. Items intentionally not included.
23. Final status.

At the end, write one of:

- PASS — ERP BASE 002F.2B is fixed and ready for Sameer review.
- PASS WITH NOTES — Minor non-blocking notes remain.
- FAIL — Must correct before continuing.

Do not proceed to 002F.3 automatically.

## Final Cursor Instruction

Implement now.

Fix the empty drawer form.

Add the required organization/branch code/autonumbering support carefully.

Keep normal document numbering simple.

Generate the required implementation report.
