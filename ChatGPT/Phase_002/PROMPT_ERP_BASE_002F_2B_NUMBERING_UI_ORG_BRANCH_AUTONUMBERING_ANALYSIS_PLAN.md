# PROMPT_ERP_BASE_002F_2B_NUMBERING_ENGINE_UI_AND_ORG_BRANCH_AUTONUMBERING_ANALYSIS_PLAN

Act as a senior ERP QA lead, Supabase/PostgreSQL RLS auditor, Playwright automation engineer, Next.js runtime tester, SaaS security tester, and notification-engine validation specialist.

## Phase

ERP BASE 002F.2B — Global Numbering Engine UI Defect Analysis and Organization/Branch Autonumbering Planning

## Important Instruction

Do not implement yet.

This is an analysis and planning prompt only.

Inspect the actual source code, database, UI components, server actions, RLS policies, permissions, and runtime behavior, then generate a detailed analysis and implementation plan.

Do not make code changes unless explicitly instructed in the next prompt.

## Background

ERP BASE 002F.2 Global Numbering Engine was reported as implemented and reviewed as PASS.

However, during user testing, the following issues were found:

1. The page `/admin/settings/numbering` opens.
2. The user clicked **Add Numbering Rule**.
3. The right-side drawer opens.
4. The left drawer section navigation appears:
   - Basic Info
   - Module & Document
   - Number Format
   - Sequence Settings
   - Generation Policy
   - Audit Info
   - Notes
5. But the drawer content/body area is empty.
6. The input form fields are not visible.
7. This means the Add Numbering Rule form is not usable.

A screenshot was provided by the user showing the drawer opened but the form content area empty.

## New Requirement / Clarification

Organization/company and branch master records also require autonumbering.

The system must support codes for:

1. Owner Organization / Owner Company
2. Branch

Examples:

- Organization/company code:
  - ALGT
  - ALS
  - PGI
  - AET

- Branch code:
  - AUH
  - DXB
  - SHJ
  - ICAD
  - MUSSAFAH

Important:

The general future module document references should remain simple unless the user requests otherwise:

- EMP-0001
- PO-0001
- INV-0001
- JO-0001
- GRN-0001

But Organization/Company and Branch master records are exceptions because they require their own codes/autonumbering and these codes may later be used as master data fields, filters, permissions, reporting fields, and possible optional future numbering tokens.

Do not change document numbering back to long format.

Do not make EMP numbering become ALGT-AUH-EMP-0001.

For now, plan only how organization/company code and branch code should be supported correctly.

## Main Objectives of This Analysis

Analyze and produce a plan for:

1. Why the Add Numbering Rule drawer opens empty.
2. How to fix the drawer/form rendering issue.
3. Whether the global drawer component is failing because of:
   - section state
   - missing children rendering
   - CSS/layout issue
   - hidden active section body
   - scroll container height issue
   - form field components not mounted
   - conditional rendering
   - permissions
   - client/server component mismatch
   - hydration issue
   - JavaScript error
   - missing imports
   - z-index/position issue
   - empty data passed to drawer
4. How to add numbering/code support for Organization/Company records.
5. How to add numbering/code support for Branch records.
6. How to safely integrate Organization/Company and Branch code rules into the existing 002F.2 numbering system without breaking simple document numbering.

## Scope Boundaries

Do not implement code in this prompt.

Do not start ERP BASE 002F.3.

Do not modify HR, Fleet, Workshop, Procurement, Finance, Warehouse, HSE, DMS, or other business modules.

Do not redesign the entire ERP.

Do not replace the global drawer system unless analysis proves it is broken.

Do not create duplicate numbering logic outside the existing Global Numbering Engine.

Do not introduce long document numbering for normal ERP documents.

## Required Source Inspection

Inspect the following areas:

### Numbering Page / UI

Find and inspect:

- `/admin/settings/numbering` page file
- Numbering rules table component
- Numbering rule form drawer/dialog component
- Any ERPDrawerForm / drawer base component
- ERPDrawerBody
- ERPDrawerSection
- ERPDrawerSectionNav
- ERPFieldGrid
- form state logic
- active section state logic
- CSS / Tailwind classes related to drawer body height/visibility
- buttons/actions that open the drawer
- add/edit/view/duplicate mode logic

### Numbering Server Logic

Inspect:

- numbering server actions
- form submission action
- preview action
- table load action
- Supabase queries
- permission checks
- error handling

### Numbering Database

Inspect:

- numbering migration
- global_numbering_rules
- global_numbering_sequence_states
- global_numbering_generated_references
- preview function
- generate function
- RLS policies
- permissions seed

### Organization and Branch Existing Foundation

Inspect:

- organizations table
- owner_companies table if exists
- companies table if exists
- branches table
- organization page/components/actions
- branch page/components/actions
- fields currently available for code/reference/code prefix
- whether organization_code exists
- whether company_code exists
- whether branch_code exists
- whether any existing reference number already exists
- existing unique constraints
- existing RLS policies
- existing permissions
- existing forms

## Required Analysis Questions

Answer the following clearly in the output report:

### A. Empty Add Numbering Rule Form

1. Which component is responsible for the drawer body?
2. Are the form fields rendered in the DOM?
3. Is the active section content hidden due to state mismatch?
4. Is the drawer body height collapsing?
5. Is the form inside a scroll container with zero height?
6. Are fields conditionally hidden because `rule` is null in add mode?
7. Is add mode failing because default values are missing?
8. Are client components missing `"use client"`?
9. Are there console errors?
10. Are server actions or permissions blocking field rendering?
11. Is the left section navigation active but the section body not mapped correctly?
12. What is the exact root cause?
13. What is the recommended fix?
14. Which files need to be modified in the implementation step?

### B. Organization/Company Autonumbering

1. What is the current organization/company table name?
2. Does it already have a company code field?
3. Does it already have a reference number field?
4. Should company/organization code be mandatory?
5. Should the company/organization code be manually entered or generated?
6. Should the code be unique?
7. What format should be used?
8. Should the global numbering engine create default rules such as:
   - ORG-0001
   - COM-0001
   - CMP-0001
9. Or should organization code be short manual code such as:
   - ALGT
   - ALS
   - PGI
10. Recommended approach:
   - For legal company/owner company master data, use manually entered short code such as ALGT, ALS, PGI.
   - Optionally also create internal autonumbered record reference such as ORG-0001 if needed.
11. Explain which approach is best for this ERP and why.

### C. Branch Autonumbering

1. What is the current branch table name?
2. Does it already have a branch code field?
3. Does it already have a reference number field?
4. Should branch code be mandatory?
5. Should branch code be manually entered or generated?
6. Should branch code be unique globally or unique per company?
7. What format should be used?
8. Recommended approach:
   - Branch short code should be manually entered, such as AUH, DXB, SHJ, ICAD.
   - Optional internal branch record reference can be autonumbered as BR-0001 if needed.
9. Explain which approach is best for this ERP and why.

### D. Global Numbering System Integration

1. Should organization/company and branch code rules be added to global_numbering_rules?
2. Should they be document types:
   - OWNER_COMPANY / prefix ORG or COM
   - BRANCH / prefix BR
3. Should these rules generate internal record references only, not display master short codes?
4. How should future modules use organization/branch codes?
5. How to avoid changing simple document numbering like EMP-0001?
6. How to keep organization/branch codes available as optional metadata, not forced into every reference number?

## Recommended Planning Direction

Unless the existing source proves otherwise, recommend the following:

### Organization / Owner Company

Add or confirm these fields:

- organization_code or company_code
- internal_reference_number if needed
- legal_name
- display_name
- short_name
- is_active
- notes

Company code should be manually controlled and unique, examples:

- ALGT
- ALS
- PGI
- AET

Optional internal reference can use global numbering:

- ORG-0001
- ORG-0002

But this internal reference should not replace the short company code.

### Branch

Add or confirm these fields:

- branch_code
- internal_reference_number if needed
- branch_name
- owner_company_id / organization_id
- city
- emirate
- is_active
- notes

Branch code should preferably be manually controlled and unique per owner company, examples:

- AUH
- DXB
- SHJ
- ICAD
- MUSAFFAH

Optional internal reference can use global numbering:

- BR-0001
- BR-0002

But this internal reference should not replace the short branch code.

### Existing Global Numbering Engine

Keep document references simple:

- EMP-0001
- PO-0001
- INV-0001
- JO-0001
- GRN-0001

Do not modify this to include company/branch/year.

## Required Output File

Create a report file only:

`ERP_BASE_002F_2B_NUMBERING_UI_ORG_BRANCH_AUTONUMBERING_ANALYSIS_PLAN.md`

The report must include:

1. Phase name.
2. Date.
3. Summary of user issue.
4. Screenshot-based observation summary.
5. Files inspected.
6. Empty drawer root cause analysis.
7. Proposed fix for empty Add Numbering Rule form.
8. Organization/company existing structure analysis.
9. Branch existing structure analysis.
10. Recommended organization/company code strategy.
11. Recommended branch code strategy.
12. Global numbering integration strategy.
13. Database changes required in the next implementation prompt.
14. UI changes required in the next implementation prompt.
15. Server action changes required in the next implementation prompt.
16. RLS and permission changes required in the next implementation prompt.
17. Test plan for the next implementation prompt.
18. Risks and cautions.
19. Clear implementation task list for the next prompt.
20. Final recommendation.

## Required Final Status

At the end of the report, write one of:

- READY FOR IMPLEMENTATION — The issue is understood and implementation prompt can be generated.
- NEEDS USER DECISION — Specific user decision required before implementation.
- BLOCKED — Cannot proceed due to missing source access or critical ambiguity.

## Important Final Reminder

Do not implement in this step.

Analyze, verify, and produce the planning report only.

The next step after Sameer review will be a separate implementation prompt to fix the empty form and add organization/branch code/autonumbering support correctly.
