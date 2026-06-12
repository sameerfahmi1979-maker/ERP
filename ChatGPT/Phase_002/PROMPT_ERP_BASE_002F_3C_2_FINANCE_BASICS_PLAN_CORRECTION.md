# PROMPT_ERP_BASE_002F_3C_2_FINANCE_BASICS_PLAN_CORRECTION

Act as a senior ERP QA lead, Supabase/PostgreSQL RLS auditor, Playwright automation engineer, Next.js runtime tester, SaaS security tester, notification-engine validation specialist, enterprise ERP solution architect, UAE business compliance analyst, finance master-data governance consultant, and senior Next.js/Supabase implementation planner.

## Phase

ERP BASE 002F.3C.2 — Finance Basics / Commercial Readiness Technical Plan Correction

## Prompt Purpose

This is a TECHNICAL PLAN CORRECTION prompt.

Do not implement code.

Do not create migrations.

Do not modify database schema.

Do not create UI screens.

Do not modify application source files.

Do not start implementation.

Your task is to revise and correct the existing technical implementation plan:

```text
ERP_BASE_002F_3C_2_FINANCE_BASICS_TECHNICAL_IMPLEMENTATION_PLAN.md
```

Generate a corrected REV1 plan that is safe, aligned with the current ERP architecture, and ready for Sameer review before implementation.

## Required Output File

Create only this markdown file:

```text
ERP_BASE_002F_3C_2_FINANCE_BASICS_TECHNICAL_IMPLEMENTATION_PLAN_REV1.md
```

## Current Decision

The current 002F.3C.2 plan direction is approved, but implementation is NOT approved yet.

The plan correctly identifies the phase scope:

```text
Currencies
Payment Terms
Tax Types
Banks
Cost Centers
Profit Centers
```

And lookup categories:

```text
PAYMENT_METHODS
TAX_TREATMENT_TYPES
BANK_ACCOUNT_TYPES
BANK_TYPES
COST_CENTER_TYPES
PROFIT_CENTER_TYPES
```

However, the plan has several technical issues that must be corrected before implementation.

## Critical Correction Summary

You must revise the plan to fix these issues:

1. Use BIGINT PK/FK only. Do not use `SERIAL`.
2. Use the existing project audit user pattern, likely BIGINT `user_profiles.id`, not direct UUID `auth.users.id`.
3. Inspect and use actual RLS helper functions from the project. Do not assume fake helpers.
4. Reduce migration count. Do not generate 16+ migration files for one phase.
5. Remove or defer budget/target/accounting-like fields.
6. Keep cost centers and profit centers as reporting master data only.
7. Confirm route and sidebar conventions before finalizing routes.
8. Keep strict “No Accounting Module” boundary.
9. Use existing master data and lookup systems only.
10. Ensure all future module prompts continue to reuse master data instead of hardcoded dropdowns.

---

# 1. Mandatory Source Inspection Before Revising

Before writing the corrected REV1 plan, inspect the actual project source.

Inspect:

## Existing BIGINT / Audit / RLS Patterns

Review current approved modules:

```text
Geography & Locations
Organizations Geography Integration
Branches Geography Integration if present
Global Lookup Engine
Global Numbering Engine
```

Find the actual patterns for:

```text
BIGINT primary keys
created_by
updated_by
deactivated_by
deleted_by if used
user_profiles foreign keys
RLS helper functions
permission helper functions
set_updated_at trigger
audit_logs structure
logAudit helper
createAuditDiff helper
system_admin detection
```

Do not assume these names:

```text
auth_context()
has_permission()
auth.users.id
UUID created_by
SERIAL primary key
```

Use only actual project conventions.

## Existing Route / Sidebar Patterns

Inspect:

```text
src/components/layout/app-sidebar.tsx
src/app/(protected)/admin/master-data
src/app/(protected)/admin/master-data/geography
src/app/(protected)/admin/master-data/lookups
```

Confirm whether the best route should be:

```text
/admin/master-data/finance-basics/...
```

or another established convention.

## Existing Master Data Integration Rule

Confirm and include:

```text
All new modules must reuse existing master data and lookup values.
Do not create hardcoded dropdowns.
Do not create duplicate master tables.
If required master data does not exist, add it to the correct master-data area first.
```

---

# 2. Required Output Structure

The revised REV1 plan must include:

1. Executive Summary
2. Correction Summary
3. Confirmed Project Architecture Patterns
4. Scope and Non-Scope Confirmation
5. Corrected Lookup vs Dedicated Table Decision Matrix
6. Corrected Database Schema Plan
7. Corrected Lookup Categories and Seed Values Plan
8. UAE VAT / RCM Compatibility Plan
9. Corrected Permissions and Role Assignment Plan
10. Corrected RLS Policy Plan
11. Global Admin Full Access Plan
12. Audit Logging Plan
13. Corrected Server Actions / Services Plan
14. Corrected Validation Plan
15. Corrected UI / Screen Plan
16. Reusable Select Component Plan
17. Corrected Seed Data Plan
18. Corrected Sidebar / Menu Plan
19. Corrected File Creation / Modification Plan
20. Corrected Implementation Sequence Plan
21. Testing Plan
22. Risk Analysis and Mitigation
23. Acceptance Criteria
24. Future Integration Notes
25. Final Recommendation

Do not summarize critical sections.

Do not write “details to be implemented later”.

---

# 3. Correction Requirements in Detail

## 3.1 BIGINT PK/FK Requirement

The corrected plan must use BIGINT PK/FK.

Do not use:

```sql
id SERIAL PRIMARY KEY
```

Use the actual project BIGINT identity pattern, likely:

```sql
id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY
```

or whatever the current project migrations use.

All FKs must be BIGINT:

```sql
country_id BIGINT REFERENCES public.countries(id)
owner_company_id BIGINT REFERENCES public.owner_companies(id)
branch_id BIGINT REFERENCES public.branches(id)
parent_cost_center_id BIGINT REFERENCES public.cost_centers(id)
```

## 3.2 Audit User Pattern Requirement

Do not use:

```sql
created_by UUID REFERENCES auth.users(id)
updated_by UUID REFERENCES auth.users(id)
deactivated_by UUID REFERENCES auth.users(id)
```

Use existing ERP project pattern.

Expected pattern:

```sql
created_by BIGINT REFERENCES public.user_profiles(id)
updated_by BIGINT REFERENCES public.user_profiles(id)
deactivated_by BIGINT REFERENCES public.user_profiles(id)
```

If the actual project uses another BIGINT user profile pattern, use the actual one.

The corrected plan must explicitly state:

```text
The plan follows the existing project audit user pattern and does not reference auth.users.id directly unless the existing project table does so.
```

## 3.3 RLS Helper Requirement

The current plan includes example RLS that may not match the project.

The corrected plan must:

1. Inspect actual RLS helper functions.
2. List actual helper functions found.
3. Use those exact helpers in sample policies.
4. Follow existing Geography/Organizations RLS style.

Do not assume:

```sql
auth_context()
has_permission()
```

Use actual helpers, likely:

```sql
current_user_profile_id()
current_user_has_permission()
current_user_has_permission_any_scope()
current_user_has_permission_in_company()
current_user_has_permission_in_branch()
```

or the actual names found.

## 3.4 Migration Count Reduction

The current plan proposes too many migrations.

Corrected recommendation:

```text
One main migration for 002F.3C.2:
- dedicated tables
- constraints
- indexes
- triggers
- RLS
- permissions
- role assignments
- lookup categories
- seed values
```

Optional:

```text
One corrective migration only if needed after testing.
```

Do not recommend 16+ migration files.

Recommended migration name:

```text
supabase/migrations/YYYYMMDDHHMMSS_erp_base_002f3c2_finance_basics.sql
```

## 3.5 Remove Accounting-Like Fields

Remove or defer fields such as:

```text
exchange_rate_placeholder
budget_enabled
target_enabled
manager_user_id
budget amount
target revenue
GL account linkage
account group linkage
posting flags
ledger flags
```

Cost centers and profit centers must remain **reporting-readiness master data only**.

Allowed fields for cost/profit centers:

```text
id
code
name_en
name_ar
type_code
parent_id
owner_company_id
branch_id
description_en
description_ar
notes
is_system
is_locked
is_active
sort_order
created_at
created_by
updated_at
updated_by
deactivated_at
deactivated_by
deactivation_reason
```

Do not add:

```text
budget_enabled
target_enabled
manager_user_id
```

unless clearly deferred and not implemented now.

## 3.6 Strict No Accounting Module Rule

The revised plan must clearly say:

Do not implement:

```text
chart_of_accounts
account_groups
general_ledger
journal_entries
ledger_transactions
trial_balance
balance_sheet
profit_and_loss
cash_flow
financial_period_closing
accounting_posting_engine
double_entry_accounting
AR/AP ledgers
bank reconciliation
exchange rate engine
currency revaluation
budget management
budget control
VAT return filing
e-invoicing
```

## 3.7 Master Data Reuse Rule

The corrected plan must include this standing rule:

```text
All future modules and phases must reuse existing master data and global lookup values.
No hardcoded dropdowns.
No duplicate master data tables.
If a needed dropdown/value is missing, add it to the appropriate master data or global lookup first.
```

This must be included in the implementation sequence and acceptance criteria.

---

# 4. Corrected Database Scope

The corrected plan should keep these dedicated tables:

```text
currencies
payment_terms
tax_types
banks
cost_centers
profit_centers
```

## 4.1 currencies

Keep simple fields only:

```text
id BIGINT
currency_code
currency_name_en
currency_name_ar
symbol
decimal_places
is_base_currency
description/notes
is_system
is_locked
is_active
sort_order
audit/deactivation fields
```

Do not include exchange rate engine fields.

Optional note:

```text
Exchange rates are future phase and not implemented now.
```

## 4.2 payment_terms

Keep:

```text
id
payment_term_code or term_code
name_en
name_ar
due_days
advance_percentage
retention_percentage
description/notes
is_system
is_locked
is_active
sort_order
audit/deactivation fields
```

No AR/AP logic.

## 4.3 tax_types

Keep:

```text
id
tax_code
name_en
name_ar
tax_rate
tax_treatment_code
is_vat
is_reverse_charge
applies_to_sales
applies_to_purchases
applies_to_scrap
effective_from
effective_to
description/notes
is_system
is_locked
is_active
sort_order
audit/deactivation fields
```

No tax filing or accounting posting.

## 4.4 banks

Keep:

```text
id
bank_code
name_en
name_ar
short_name
country_id
bank_type_code
swift_code
website_url
contact info optional
description/notes
is_system
is_locked
is_active
sort_order
audit/deactivation fields
```

No bank account ledger or reconciliation.

## 4.5 cost_centers

Keep as reporting master data only:

```text
id
cost_center_code
name_en
name_ar
cost_center_type_code
parent_cost_center_id
owner_company_id
branch_id
description/notes
is_system
is_locked
is_active
sort_order
audit/deactivation fields
```

Do not include budget or GL fields.

## 4.6 profit_centers

Keep as reporting master data only:

```text
id
profit_center_code
name_en
name_ar
profit_center_type_code
parent_profit_center_id
owner_company_id
branch_id
description/notes
is_system
is_locked
is_active
sort_order
audit/deactivation fields
```

Do not include target revenue or GL fields.

---

# 5. Corrected Lookup Categories

Keep these lookup categories:

```text
PAYMENT_METHODS
TAX_TREATMENT_TYPES
BANK_ACCOUNT_TYPES
BANK_TYPES
COST_CENTER_TYPES
PROFIT_CENTER_TYPES
```

Use:

```text
global_lookup_categories
global_lookup_values
```

Do not create separate lookup tables.

The plan must confirm these pages are dynamic:

```text
Lookup Categories
Lookup Values
Locked System Values
LookupSelect dropdowns
```

---

# 6. Corrected Permissions Plan

Use:

```text
master_data.finance_basics.view
master_data.finance_basics.manage
master_data.finance_basics.export
master_data.finance_basics.audit_view
```

Optional delete permission only if existing project pattern requires it. Otherwise:

```text
Hard delete controlled by system_admin/global admin only.
```

Role assignments:

```text
system_admin: all
group_admin: view/manage/export/audit_view
company_admin: view/export
branch_admin: view
normal users: no admin page access by default
```

Normal users may later read active values through safe select services when used in business forms.

---

# 7. Corrected RLS Plan

Use actual helper functions.

Policy strategy:

## SELECT

```text
system_admin can view all
users with master_data.finance_basics.view can view admin pages
normal business dropdown services can read active records if allowed by existing pattern
```

## INSERT / UPDATE

```text
system_admin full access
users with master_data.finance_basics.manage can create/update non-locked records
locked records require system_admin or lock permission if such pattern exists
```

## DELETE

```text
system_admin only
```

## Lock / Unlock

```text
system_admin or existing master_data.lookups.lock pattern if applicable
```

Do not create unsafe public write policies.

---

# 8. Corrected File Plan

Reduce implementation file count if possible.

Expected files:

```text
supabase/migrations/YYYYMMDDHHMMSS_erp_base_002f3c2_finance_basics.sql

src/features/master-data/finance-basics/types.ts
src/features/master-data/finance-basics/validation.ts
src/features/master-data/finance-basics/actions.ts

src/features/master-data/finance-basics/components/*-table.tsx
src/features/master-data/finance-basics/components/*-form-dialog.tsx

src/components/erp/finance-basics/*-select.tsx

src/app/(protected)/admin/master-data/finance-basics/*/page.tsx

src/components/layout/app-sidebar.tsx
```

The revised plan should recommend logical grouping and avoid unnecessary hooks unless the existing app pattern requires them.

---

# 9. Corrected Testing Plan

Must include:

```text
npm run typecheck
npm run lint
npm run build
```

Also test:

```text
RLS
permissions
system_admin delete/lock/unlock
group_admin manage but no delete
company_admin view/export only
branch_admin view only
global lookup dynamic values
UAE VAT / RCM seed data
cost/profit center hierarchy
one base currency constraint
```

---

# 10. Corrected Acceptance Criteria

Acceptance criteria must include:

```text
[ ] BIGINT PK/FK used everywhere
[ ] audit fields follow user_profiles pattern
[ ] actual RLS helpers used
[ ] only one main migration unless corrective migration needed
[ ] no accounting fields added
[ ] no GL / journal / budget / exchange engine added
[ ] all lookups use global_lookup_categories/global_lookup_values
[ ] future modules must reuse master data
[ ] typecheck/lint/build passed
[ ] implementation report generated
```

---

# 11. Final Recommendation Requirements

End with:

```text
READY FOR SAMEER REVIEW — Corrected finance basics plan complete.
```

or:

```text
NEEDS USER DECISION — Specific decisions required before implementation.
```

or:

```text
BLOCKED — Could not inspect source or determine safe corrected plan.
```

If ready, recommend next prompt name:

```text
PROMPT_ERP_BASE_002F_3C_2_IMPLEMENT_FINANCE_BASICS.md
```

## Final Instruction

Create only:

```text
ERP_BASE_002F_3C_2_FINANCE_BASICS_TECHNICAL_IMPLEMENTATION_PLAN_REV1.md
```

Do not implement.
Do not create migrations.
Do not modify app files.
