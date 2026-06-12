# PROMPT_ERP_BASE_002F_3E_REV3_SQL_CORRECTION_COMPLETE_RLS_POLICIES

Act as a senior ERP QA lead, Supabase/PostgreSQL RLS auditor, SaaS security tester, PostgreSQL migration architect, master-data governance auditor, and database implementation reviewer.

## Phase

ERP BASE 002F.3E — People / Contacts / CRM Foundation  
ERP BASE 002F.3E.2 — Database + Lookup Categories + Seed Values

## Prompt Purpose

This is a CRITICAL SQL REVIEW CORRECTION prompt.

The current REV3 SQL fixed the unsafe lookup FK issue and preserved ICV/CICPA fields. However, review found that the SQL does NOT yet contain explicit RLS policies for all 29 tables.

The SQL currently enables RLS on all 29 tables, but explicit policies appear only for a limited subset of tables and the SQL contains a comment similar to:

```text
For brevity, applying same policy pattern to all 29 tables.
In production SQL, each table would have explicit policies.
```

This is not acceptable for an implementation SQL file. The SQL must be complete, not conceptual.

## Mode

Do not apply the SQL to the database.

Do not run the migration.

Do not use MCP apply_migration.

Do not use Supabase SQL editor execution.

Do not modify the remote database.

Do not implement UI.

Do not create server actions.

Do not update sidebar.

Create/update files only.

---

# 1. Files To Review

Review these current files:

```text
ERP_BASE_002F_3E_PEOPLE_CONTACTS_CRM_FOUNDATION_TECHNICAL_IMPLEMENTATION_PLAN_REV3.md

supabase/migrations/20260607150000_erp_base_002f3e2_people_contacts_crm_database_lookups_seeds.sql

ERP_BASE_002F_3E_2_DATABASE_LOOKUPS_SEEDS_SQL_REVIEW_REPORT_REV2.md
```

## Required Output Files

Create/update these files:

```text
ERP_BASE_002F_3E_PEOPLE_CONTACTS_CRM_FOUNDATION_TECHNICAL_IMPLEMENTATION_PLAN_REV4.md

supabase/migrations/20260607150000_erp_base_002f3e2_people_contacts_crm_database_lookups_seeds.sql

ERP_BASE_002F_3E_2_DATABASE_LOOKUPS_SEEDS_SQL_REVIEW_REPORT_REV3.md
```

The SQL file remains review-only and must NOT be applied.

---

# 2. Critical Issue — RLS Policies Are Incomplete

## Problem

The SQL currently enables RLS on all 29 tables but appears to create explicit policies only for a limited set of tables.

This is not acceptable.

For a database migration file, every table must have explicit policies written in the SQL file.

Do not rely on comments like:

```text
same policy pattern
macro-like pattern
for brevity
in production SQL
```

These comments must be removed.

## Required Fix

Create explicit RLS policies for all 29 tables.

At minimum, each table must have:

```text
SELECT policy
INSERT policy
UPDATE policy
DELETE policy
```

Therefore, required minimum policy count:

```text
29 tables × 4 policies = 116 explicit policies
```

If additional policies are required by existing project convention, include them, but the minimum is 116 explicit policies.

---

# 3. Required Tables For RLS Policies

Policies must be explicitly created for all these 29 tables.

## Main entity tables

```text
customers
vendors
subcontractors
consultants
government_authorities
recruitment_agencies
```

## Contact tables

```text
customer_contacts
vendor_contacts
subcontractor_contacts
consultant_contacts
government_authority_contacts
recruitment_agency_contacts
```

## Address tables

```text
customer_addresses
vendor_addresses
subcontractor_addresses
consultant_addresses
government_authority_addresses
recruitment_agency_addresses
```

## Document tables

```text
customer_documents
vendor_documents
subcontractor_documents
consultant_documents
government_authority_documents
recruitment_agency_documents
```

## Bank detail tables

```text
customer_bank_details
vendor_bank_details
subcontractor_bank_details
consultant_bank_details
recruitment_agency_bank_details
```

Do not add:

```text
government_authority_bank_details
```

---

# 4. Required RLS Pattern

Use the grouped permissions approved for this phase:

```text
master_data.party_master.view
master_data.party_master.manage
master_data.party_master.export
master_data.party_master.audit_view
```

Use existing helper functions only:

```text
current_user_has_permission()
current_user_has_role()
```

Do not invent helper functions.

## 4.1 SELECT Policy

For all 29 tables:

```sql
DROP POLICY IF EXISTS <table>_select_policy ON <table>;
CREATE POLICY <table>_select_policy ON <table>
FOR SELECT
USING (
  is_active = true
  OR current_user_has_permission('master_data.party_master.view')
  OR current_user_has_role('system_admin')
);
```

## 4.2 INSERT Policy

For all 29 tables:

```sql
DROP POLICY IF EXISTS <table>_insert_policy ON <table>;
CREATE POLICY <table>_insert_policy ON <table>
FOR INSERT
WITH CHECK (
  current_user_has_permission('master_data.party_master.manage')
  OR current_user_has_role('system_admin')
);
```

## 4.3 UPDATE Policy

For all 29 tables:

```sql
DROP POLICY IF EXISTS <table>_update_policy ON <table>;
CREATE POLICY <table>_update_policy ON <table>
FOR UPDATE
USING (
  (
    current_user_has_permission('master_data.party_master.manage')
    OR current_user_has_role('system_admin')
  )
  AND (
    is_locked = false
    OR current_user_has_role('system_admin')
  )
  AND (
    is_system = false
    OR current_user_has_role('system_admin')
  )
)
WITH CHECK (
  (
    current_user_has_permission('master_data.party_master.manage')
    OR current_user_has_role('system_admin')
  )
);
```

## 4.4 DELETE Policy

For all 29 tables:

```sql
DROP POLICY IF EXISTS <table>_delete_policy ON <table>;
CREATE POLICY <table>_delete_policy ON <table>
FOR DELETE
USING (
  current_user_has_role('system_admin')
);
```

## 4.5 Bank Details Note

Bank details tables also include `is_active`, `is_locked`, `is_system`, so the same pattern applies.

If any bank details table does not include these fields, either:
1. Add the missing standard fields to match project standard; or
2. Adjust RLS policy safely and document the reason.

Preferred:

```text
All 29 tables should include is_active, is_locked, is_system.
```

---

# 5. Role Assignment Correction

Review the technical plan and SQL role assignment section.

Correct final role assignment to:

```text
system_admin: view, manage, export, audit_view
group_admin: view, manage, export, audit_view
company_admin: view, export
branch_admin: view only
normal users: no admin page access by default
```

Do not give `branch_admin` manage permission in the plan.

The current SQL appears to use branch_admin view only. Keep that.

If the REV3 plan says branch_admin has manage permission, correct it in REV4.

---

# 6. Keep Already Approved Corrections

Do not undo these approved fixes.

## 6.1 Keep Unsafe Lookup FK Fix

Final SQL must still contain:

```text
0 occurrences of references global_lookup_values(value_code)
```

Keep lookup-code columns as text.

Keep column comments documenting lookup categories.

## 6.2 Keep ICV + CICPA Fields

Keep ICV/CICPA fields in:

```text
customers
vendors
subcontractors
consultants
recruitment_agencies
```

Do not add them to:

```text
government_authorities
```

Keep:

```text
icv_certificate_number
icv_score_percentage
icv_issue_date
icv_expiry_date
icv_company_type
icv_financial_year_end_date
icv_certification_body
icv_version
icv_status_code
icv_document_path
cicpa_registration_number
```

Keep:

```text
ICV_STATUS_TYPES
VALID
EXPIRED
UNDER_RENEWAL
NOT_AVAILABLE
NOT_REQUIRED
PENDING_SUBMISSION
```

## 6.3 Keep Table Count

Keep table count:

```text
29 tables
```

Do not add or remove tables.

---

# 7. Remove Conceptual / Placeholder Comments From SQL

Search and remove/replace comments such as:

```text
For brevity
same policy pattern
macro-like pattern
In production SQL
```

The SQL file must be implementation-ready and complete.

The SQL may contain explanatory comments, but not comments that indicate incomplete code.

---

# 8. Required Verification

Before finishing, verify the SQL file and include results in the review report.

## Required SQL Verification Checks

```text
Total CREATE TABLE IF NOT EXISTS statements = 29
Total ALTER TABLE ... ENABLE ROW LEVEL SECURITY statements = 29
Total CREATE POLICY statements >= 116
Every one of the 29 tables has:
- select policy
- insert policy
- update policy
- delete policy

references global_lookup_values(value_code) count = 0

ICV/CICPA fields present in:
- customers
- vendors
- subcontractors
- consultants
- recruitment_agencies

ICV/CICPA fields absent from:
- government_authorities

ICV_STATUS_TYPES exists
6 ICV status values exist

branch_admin has view only
company_admin has view/export only
```

---

# 9. Required REV4 Plan Updates

Create:

```text
ERP_BASE_002F_3E_PEOPLE_CONTACTS_CRM_FOUNDATION_TECHNICAL_IMPLEMENTATION_PLAN_REV4.md
```

REV4 must:

1. State it supersedes REV3.
2. Keep all REV1 classification corrections.
3. Keep all REV2 ICV/CICPA corrections.
4. Keep REV3 lookup FK correction.
5. Add REV4 correction: complete explicit RLS policies for all 29 tables.
6. Correct branch_admin permissions to view only.
7. Remove any suggestion that RLS policies are conceptual or abbreviated.
8. Clearly state minimum RLS policy count is 116 explicit policies.
9. Keep SQL review-only status.

---

# 10. Required Review Report REV3

Create:

```text
ERP_BASE_002F_3E_2_DATABASE_LOOKUPS_SEEDS_SQL_REVIEW_REPORT_REV3.md
```

The report must include:

1. Phase name.
2. Date.
3. Files updated.
4. Review-only status confirmation.
5. Summary of incomplete RLS issue found.
6. Confirmation all 29 tables now have explicit policies.
7. Total policy count.
8. Table-by-table RLS verification matrix:
   - table
   - select policy
   - insert policy
   - update policy
   - delete policy
9. Confirmation unsafe lookup FKs remain removed.
10. Confirmation real master-data FKs are preserved.
11. Confirmation ICV/CICPA fields remain correct.
12. Confirmation government_authorities remains excluded from ICV/CICPA fields.
13. Confirmation ICV_STATUS_TYPES remains seeded.
14. Confirmation branch_admin has view only.
15. Remaining review points before DB application.
16. Final status.

End with:

```text
READY FOR REVIEW — REV3 SQL correction completed explicit RLS policies for all 29 tables, preserved lookup/ICV/CICPA corrections, and was not applied to database.
```

---

# 11. Final Instruction

Do not apply SQL.

Do not run migration.

Do not implement UI.

Do not implement server actions.

Do not start 002F.3E.3.

Create/update only the SQL, REV4 plan, and REV3 review report.
