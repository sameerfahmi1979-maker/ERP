# PROMPT_ERP_BASE_002F_2_GLOBAL_NUMBERING_ENGINE_IMPLEMENT_NOW

Act as a senior ERP QA lead, Supabase/PostgreSQL RLS auditor, Playwright automation engineer, Next.js runtime tester, SaaS security tester, and notification-engine validation specialist.

## Phase

ERP BASE 002F.2 — Global Numbering / Prefix / Sequence Engine

## Important Correction

The previous prompt named `PROMPT_ERP_BASE_002F_2_GLOBAL_NUMBERING_ENGINE_AND_FORM` was not implemented.

You must implement this phase now.

Do not treat this as a planning-only prompt.

Do not produce only a report.

Do not produce only recommendations.

Do not create a prototype only.

You must create the real database foundation, real service logic, real admin page, real add/edit/view form, real validation, real RLS/security handling, and a final implementation report.

---

# 1. Project Context

This ERP project is still in the ERP BASE 002 foundation stage.

Do not jump to new business modules yet.

Do not implement HR, Fleet, Workshop, Procurement, Inventory, Finance, CRM, HSE, DMS, or any other business module in this phase.

This phase must only implement the global numbering engine foundation and its admin configuration screen.

The ERP stack is expected to be:

- Next.js
- TypeScript
- Supabase / PostgreSQL
- RLS enabled
- Existing admin layout
- Existing global table component if available
- Existing right-side drawer form if available
- Existing permission model if available
- Existing audit log pattern if available

Before implementing, inspect the existing source code and reuse existing patterns wherever possible.

---

# 2. User Required Numbering Style

The user does not want long numbers like:

ALGT-AUH-EMP-2026-000001  
ALS-AUH-PO-2026-000001  
PGI-DXB-INV-2026-000001  

Do not use company code.

Do not use branch code.

Do not use city code.

Do not use location code.

Do not use year.

Do not use month.

Do not use day.

Required format must be simple:

EMP-0001  
PO-0001  
INV-0001  
JO-0001  
GRN-0001  

Default template:

{DOC}-{SEQ4}

Where:

- DOC = document prefix, such as EMP, PO, INV, JO, GRN
- SEQ4 = 4-digit padded sequence number

Examples:

Document Prefix: EMP  
Next Sequence: 1  
Generated Number: EMP-0001

Document Prefix: PO  
Next Sequence: 25  
Generated Number: PO-0025

Document Prefix: INV  
Next Sequence: 312  
Generated Number: INV-0312

---

# 3. Main Objective

Implement a global numbering system that can be used later by all ERP modules to generate simple, unique, human-readable reference numbers.

This phase must include:

1. Database tables.
2. Database constraints.
3. Safe generation logic.
4. Preview logic.
5. Admin page.
6. Add form.
7. Edit form.
8. View form.
9. List/table screen.
10. Validation.
11. Permissions/RLS.
12. Audit trail.
13. Implementation report.

---

# 4. Scope Rules

## Must Do

Implement the full ERP BASE 002F.2 global numbering foundation.

## Must Not Do

Do not implement unrelated modules.

Do not implement HR employees.

Do not implement fleet assets.

Do not implement workshop jobs.

Do not implement purchase orders as a business module.

Do not implement invoices as a business module.

Do not implement GRN as a business module.

Do not implement Microsoft Graph email live testing.

Do not redesign the whole ERP.

Do not change the whole database architecture.

Do not remove existing features.

Do not hardcode the number generation only in frontend.

Do not rely only on frontend checks for uniqueness.

Do not create mock/demo-only implementation.

---

# 5. Required Database Migration

Create one new Supabase/PostgreSQL migration file using the project naming convention.

Suggested name:

`YYYYMMDDHHMMSS_erp_base_002f2_global_numbering_engine.sql`

The migration must create the required database foundation.

Use BIGINT primary keys if the project foundation uses BIGINT. If the existing source clearly uses another convention for this foundation, follow the existing convention and explain it in the report.

---

# 6. Required Tables

## 6.1 Table: global_numbering_rules

Create a table for numbering rule configuration.

Required fields:

- id
- rule_code
- rule_name
- description
- module_code
- module_name
- document_type_code
- document_type_name
- document_prefix
- separator
- format_template
- sequence_length
- padding_character
- starting_sequence_number
- current_sequence_number
- next_sequence_number
- reset_policy
- reserve_on_draft
- reserve_on_submit
- allow_manual_override
- manual_override_requires_permission
- allow_gaps
- cancelled_number_policy
- duplicate_prevention_scope
- is_active
- is_locked
- effective_from
- effective_to
- notes
- created_at
- created_by
- updated_at
- updated_by
- deleted_at or is_deleted depending on existing project soft-delete pattern

Required defaults:

- separator = '-'
- format_template = '{DOC}-{SEQ4}'
- sequence_length = 4
- padding_character = '0'
- starting_sequence_number = 1
- current_sequence_number = 0
- next_sequence_number = 1
- reset_policy = 'never'
- reserve_on_draft = false
- reserve_on_submit = true
- allow_manual_override = false
- manual_override_requires_permission = true
- allow_gaps = true
- cancelled_number_policy = 'never_reuse'
- duplicate_prevention_scope = 'document_type'
- is_active = true
- is_locked = false

Required constraints:

- rule_code unique.
- document_prefix required.
- document_prefix uppercase.
- document_prefix should allow only A-Z, 0-9, and underscore if needed.
- format_template required.
- format_template must include `{DOC}`.
- format_template must include one sequence token.
- sequence_length must be between 1 and 12.
- starting_sequence_number must be greater than or equal to 1.
- next_sequence_number must be greater than or equal to 1.
- effective_to must be null or greater than/equal to effective_from.

## 6.2 Table: global_numbering_sequence_states

Create a table for actual sequence state.

Required fields:

- id
- numbering_rule_id
- module_code
- document_type_code
- document_prefix
- reset_period_key
- last_sequence_number
- next_sequence_number
- last_generated_reference
- last_generated_at
- created_at
- created_by
- updated_at
- updated_by

Required constraints:

- numbering_rule_id references global_numbering_rules(id)
- reset_period_key default = 'GLOBAL'
- unique(numbering_rule_id, reset_period_key)
- last_sequence_number must be greater than or equal to 0
- next_sequence_number must be greater than or equal to 1

## 6.3 Table: global_numbering_generated_references

Create a table for audit trail of all generated/reserved/consumed/cancelled numbers.

Required fields:

- id
- numbering_rule_id
- sequence_state_id
- generated_reference_number
- generated_sequence_number
- module_code
- document_type_code
- document_prefix
- target_table_name
- target_record_id
- generation_status
- generation_reason
- reserved_at
- consumed_at
- cancelled_at
- cancelled_reason
- manual_override_used
- manual_override_reason
- generated_by
- generated_at
- created_at
- created_by
- updated_at
- updated_by

Required generation_status values:

- preview_only
- reserved
- consumed
- cancelled
- manual_override

Required constraints:

- generated_reference_number unique.
- numbering_rule_id references global_numbering_rules(id).
- sequence_state_id references global_numbering_sequence_states(id) where applicable.
- generated_sequence_number must be greater than or equal to 1 when not preview_only.
- manual_override_used default false.

---

# 7. Required Database Functions / RPC

Create secure PostgreSQL functions or service-backed RPC functions for the numbering engine.

## 7.1 Preview Function

Create a function to preview the next number without consuming the sequence.

Suggested name:

`preview_next_reference_number`

Input:

- p_rule_id or p_document_type_code
- optional p_next_sequence_number

Output:

- preview_reference_number
- document_prefix
- sequence_number
- format_template

Rules:

- Must not update sequence state.
- Must not consume a number.
- Must not create a generated reference record unless you intentionally log preview activity. If preview is logged, status must be preview_only and must not affect sequence.

## 7.2 Generate / Reserve Function

Create a function to generate the next number.

Suggested name:

`generate_next_reference_number`

Input:

- p_rule_id or p_document_type_code
- p_target_table_name optional
- p_target_record_id optional
- p_generation_reason optional

Output:

- generated_reference_number
- generated_sequence_number
- numbering_rule_id
- sequence_state_id
- generation_status

Rules:

- Must be concurrency-safe.
- Must prevent duplicate numbers.
- Must lock the relevant sequence state row or use a safe PostgreSQL locking method.
- Must increment the sequence only once.
- Must insert an audit record in global_numbering_generated_references.
- Must reject inactive rules.
- Must reject soft-deleted rules.
- Must reject expired rules.
- Must use the format `{DOC}-{SEQ4}` by default.
- Must generate values like EMP-0001, EMP-0002, EMP-0003.

## 7.3 Manual Override Validation Function

Create a function or service method that validates manual reference numbers.

Rules:

- Manual override is disabled by default.
- If enabled, it requires a special permission.
- Manual override cannot duplicate an existing generated_reference_number.
- Manual override must be logged.

## 7.4 Cancel Function

Create a function or service method to cancel a generated/reserved reference.

Rules:

- Must not physically delete audit history.
- Must set generation_status = cancelled.
- Must store cancelled_at and cancelled_reason.
- Must follow cancelled_number_policy.
- Default cancelled_number_policy is never_reuse.

---

# 8. Required Admin UI Page

Create a real admin page for numbering rules.

Use the existing route convention.

Suggested route:

`/admin/settings/numbering`

If the project has another settings route convention, follow it and report the final route.

Page title:

Global Numbering Rules

Subtitle:

Configure simple ERP reference number sequences such as EMP-0001, PO-0001, INV-0001.

---

# 9. Required List/Table

The page must show all numbering rules in a table.

Required columns:

- Rule Code
- Rule Name
- Module Code
- Document Type Code
- Document Prefix
- Format Template
- Next Number Preview
- Current Sequence
- Next Sequence
- Reset Policy
- Active
- Locked
- Updated At
- Actions

Required actions:

- Add New Rule
- View
- Edit
- Duplicate / Copy
- Activate / Deactivate
- Lock / Unlock if authorized
- Preview Next Number
- Search
- Filter by Module Code
- Filter by Document Type Code
- Filter by Active / Inactive
- Filter by Locked / Unlocked

Do not show company/branch/city/location columns because the user does not want this numbering format.

---

# 10. Required Drawer Form

Create or reuse the existing right-side drawer form.

The drawer form must support:

- Add mode
- Edit mode
- View/read-only mode
- Duplicate/copy mode

The drawer should follow the ERP global drawer style already used in the project.

If the global drawer form does not exist or is not stable, create a consistent drawer form for this page and explain it in the report.

---

# 11. Required Form Sections and Fields

## Section 1 — Basic Rule Information

Fields:

- Rule Code
- Rule Name
- Description
- Active
- Locked
- Effective From
- Effective To

## Section 2 — Module and Document Type

Fields:

- Module Code
- Module Name
- Document Type Code
- Document Type Name
- Document Prefix

Examples:

Module Code: HR  
Module Name: Human Resources  
Document Type Code: EMPLOYEE  
Document Type Name: Employee  
Document Prefix: EMP  

Module Code: PROCUREMENT  
Module Name: Procurement  
Document Type Code: PURCHASE_ORDER  
Document Type Name: Purchase Order  
Document Prefix: PO  

## Section 3 — Number Format

Fields:

- Separator
- Format Template
- Token Helper
- Live Preview

Allowed tokens in this phase:

- {DOC}
- {SEQ}
- {SEQ3}
- {SEQ4}
- {SEQ5}
- {SEQ6}

Default:

{DOC}-{SEQ4}

Do not allow tokens:

- {COMPANY}
- {BRANCH}
- {CITY}
- {LOCATION}
- {YYYY}
- {YY}
- {MM}
- {DD}

If the user enters an unsupported token, the form must show validation error.

## Section 4 — Sequence Settings

Fields:

- Sequence Length
- Padding Character
- Starting Sequence Number
- Current Sequence Number
- Next Sequence Number
- Reset Policy

Default values:

- Sequence Length: 4
- Padding Character: 0
- Starting Sequence Number: 1
- Current Sequence Number: 0
- Next Sequence Number: 1
- Reset Policy: never

Reset policy options:

- never
- yearly
- monthly

Even if yearly/monthly reset policy exists internally, the generated number must still not include year/month unless the format template is changed in a future phase. For this phase, keep visible format simple.

## Section 5 — Generation Policy

Fields:

- Reserve On Draft
- Reserve On Submit
- Allow Manual Override
- Manual Override Requires Permission
- Allow Gaps
- Cancelled Number Policy
- Duplicate Prevention Scope

Defaults:

- Reserve On Draft: false
- Reserve On Submit: true
- Allow Manual Override: false
- Manual Override Requires Permission: true
- Allow Gaps: true
- Cancelled Number Policy: never_reuse
- Duplicate Prevention Scope: document_type

## Section 6 — Audit / Read-only Information

Read-only fields:

- Last Generated Reference
- Last Generated At
- Created By
- Created At
- Updated By
- Updated At

## Section 7 — Notes

Field:

- Notes

---

# 12. Required Form Buttons

The drawer form must include:

- Save
- Save & Close
- Cancel
- Preview Next Number
- Reset Form
- Close

If existing draft workflow is available and stable, optionally include Save Draft.

If draft workflow is not available yet, do not fake Save Draft. Mention it in the report.

---

# 13. Required Live Preview Behavior

The form must calculate preview instantly based on:

- Document Prefix
- Separator
- Format Template
- Sequence Length
- Padding Character
- Next Sequence Number

Examples:

Document Prefix = EMP  
Format Template = {DOC}-{SEQ4}  
Next Sequence = 1  
Preview = EMP-0001

Document Prefix = PO  
Format Template = {DOC}-{SEQ4}  
Next Sequence = 25  
Preview = PO-0025

Document Prefix = INV  
Format Template = {DOC}-{SEQ5}  
Next Sequence = 25  
Preview = INV-00025

Preview must not consume or increment the sequence.

---

# 14. Required Frontend Files

Follow the existing project structure.

Suggested structure only if compatible:

- src/app/admin/settings/numbering/page.tsx
- src/features/numbering/components/numbering-rules-table.tsx
- src/features/numbering/components/numbering-rule-drawer-form.tsx
- src/features/numbering/components/numbering-preview.tsx
- src/features/numbering/lib/numbering-service.ts
- src/features/numbering/lib/numbering-validation.ts
- src/features/numbering/types.ts
- src/features/numbering/hooks/use-numbering-rules.ts
- src/features/numbering/hooks/use-numbering-preview.ts

If the project uses a different structure, follow the existing pattern.

---

# 15. Required Validation

Validation must exist in frontend and backend/database where appropriate.

Required validation:

- Rule Code is required.
- Rule Code must be unique.
- Rule Name is required.
- Module Code is required.
- Document Type Code is required.
- Document Prefix is required.
- Document Prefix must be uppercase.
- Document Prefix must not include spaces.
- Format Template is required.
- Format Template must include `{DOC}`.
- Format Template must include one valid sequence token.
- Unsupported tokens must be rejected.
- Sequence Length must be between 1 and 12.
- Padding Character is required.
- Starting Sequence Number must be at least 1.
- Current Sequence Number must be at least 0.
- Next Sequence Number must be at least 1.
- Effective To must not be before Effective From.
- Locked records cannot be edited by normal users.
- Inactive records cannot generate new numbers.
- Soft-deleted records cannot generate new numbers.
- Duplicate generated reference numbers must be impossible.

---

# 16. Required Permissions

Add or reuse permissions for:

- numbering.rules.view
- numbering.rules.create
- numbering.rules.update
- numbering.rules.deactivate
- numbering.rules.lock
- numbering.rules.preview
- numbering.rules.generate
- numbering.rules.manual_override
- numbering.rules.audit_view

Unauthorized users must not see or use restricted actions.

If current permission system is incomplete, implement the best compatible pattern and clearly report the limitation.

---

# 17. Required RLS Policies

Enable RLS on all new tables.

Create policies for the project’s actual auth pattern.

Important: this ERP uses frontend Supabase anon key with custom authentication patterns, so policies must be compatible with anon and authenticated roles where the existing project requires it.

Do not create unsafe public policies.

Do not use unrestricted `USING (true)` or `WITH CHECK (true)` unless the existing project already has a secure application-level wrapper pattern and you clearly explain the reason in the report.

Required security behavior:

- Authorized users can view numbering rules.
- Authorized users can create numbering rules.
- Authorized users can edit numbering rules.
- Authorized users can deactivate rules.
- Only authorized users can lock/unlock rules.
- Only authorized users can preview numbers.
- Only secure function/service path can update sequence state.
- Normal frontend users must not directly update sequence state manually.
- Generated reference audit records must not be editable by normal users.
- Manual override requires special permission.

---

# 18. Required Audit Trail

Audit must capture:

- Numbering rule created.
- Numbering rule updated.
- Numbering rule activated.
- Numbering rule deactivated.
- Numbering rule locked.
- Numbering rule unlocked.
- Preview requested, if preview logging is implemented.
- Number generated.
- Number reserved.
- Number consumed.
- Number cancelled.
- Manual override attempted.
- Manual override accepted.
- Manual override rejected.

If a global audit log already exists, reuse it.

If not, ensure the generated references table stores enough audit history and explain that global audit integration can be enhanced later.

---

# 19. Required Runtime Behavior

The implementation must support this flow:

1. Admin opens Global Numbering Rules page.
2. Admin clicks Add New Rule.
3. Drawer form opens.
4. Admin enters:
   - Rule Code: HR_EMP
   - Rule Name: Employee Number
   - Module Code: HR
   - Module Name: Human Resources
   - Document Type Code: EMPLOYEE
   - Document Type Name: Employee
   - Document Prefix: EMP
   - Format Template: {DOC}-{SEQ4}
   - Starting Sequence Number: 1
5. Live preview shows EMP-0001.
6. Admin saves.
7. Rule appears in the table.
8. Admin clicks Preview Next Number.
9. System shows EMP-0001.
10. Admin or service generates the next number.
11. System returns EMP-0001.
12. Next preview becomes EMP-0002.
13. Audit record exists for EMP-0001.

---

# 20. Required Tests

Run or prepare tests according to the existing project tooling.

## Database Tests

Verify:

- Migration applies successfully.
- Tables exist.
- Required constraints work.
- Rule code uniqueness works.
- Invalid format template is rejected.
- Unsupported tokens are rejected.
- Preview does not consume sequence.
- Generate consumes sequence.
- EMP-0001 is generated first.
- EMP-0002 is generated second.
- Duplicate reference cannot be generated.
- Inactive rule cannot generate.
- Locked rule cannot be edited by normal user.
- Manual override duplicate is rejected.
- Audit record is created.

## Frontend Tests

Verify:

- Numbering page loads.
- Table loads.
- Empty state works.
- Add drawer opens.
- Edit drawer opens.
- View drawer opens.
- Duplicate/copy opens.
- Validation errors appear.
- Live preview works.
- Save works.
- Save & Close works.
- Preview button works.
- Active/inactive status works.
- Unauthorized actions are hidden or blocked.
- No company/branch/city/year/month/day fields appear in generated numbering form.

## Security Tests

Verify:

- Unauthorized read is blocked.
- Unauthorized create is blocked.
- Unauthorized update is blocked.
- Unauthorized lock/unlock is blocked.
- Unauthorized manual override is blocked.
- Sequence state cannot be tampered from frontend.
- Generated references cannot be tampered by normal users.
- No service role key is exposed to frontend.

## Build Tests

Run if available:

- npm run typecheck
- npm run lint
- npm run build
- npm test
- Playwright tests if available

If any command is not available, mention it in the report.

---

# 21. Required Implementation Report

Create this report file:

`ERP_BASE_002F_2_GLOBAL_NUMBERING_ENGINE_IMPLEMENTATION_REPORT.md`

The report must include:

1. Phase name.
2. Date.
3. Confirmation that previous prompt was not implemented and this phase was implemented now.
4. Summary of work completed.
5. Files created.
6. Files modified.
7. Database migration created.
8. Tables created.
9. Functions/RPC created.
10. RLS policies created.
11. Permissions created or reused.
12. Admin route created.
13. UI components created.
14. Form fields implemented.
15. Validation implemented.
16. Supported tokens.
17. Explicit confirmation that generated references are simple like EMP-0001.
18. Explicit confirmation that company/branch/city/year/month/day are not included.
19. Test results.
20. Security/RLS results.
21. Known limitations.
22. Items intentionally not included.
23. Recommended next phase.
24. Approval gate.

At the end of the report, write:

`ERP BASE 002F.2 is ready for Sameer review.`

Then provide status:

- PASS
- PASS WITH NOTES
- FAIL

Do not proceed to the next phase automatically.

---

# 22. Recommended Next Phase After Approval

After Sameer approves 002F.2, the next recommended phase is:

ERP BASE 002F.3 — Global Lookup / Dropdown / Master Data Engine

Do not start 002F.3 in this prompt.

---

# 23. Final Cursor Instruction

Implement the work now.

Do not stop at planning.

Do not say the previous prompt was enough.

Do not create only a markdown report.

Do not create only UI without database.

Do not create only database without UI.

Do not use long reference format.

The correct output format is simple:

EMP-0001  
PO-0001  
INV-0001  
JO-0001  
GRN-0001  

Complete the implementation and produce the required implementation report.
