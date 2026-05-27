# PROMPT_ERP_BASE_002D_MIGRATION_FIX — Correct 002D Migration Before Supabase Push

Act as a senior Supabase/PostgreSQL migration auditor, ERP database architect, RLS safety reviewer, and TypeScript validation engineer.

## Purpose

Fix the generated Phase 002D migration before applying it to Supabase Cloud.

Do not push the migration until the corrected SQL and reports are reviewed and approved.

## Current Files

Migration to fix:

```text
supabase/migrations/20260527160443_erp_base_002d_admin_master_data_hardening.sql
```

Reports already generated:

```text
ERP_BASE_002D_INITIAL_REVIEW_REPORT.md
ERP_BASE_002D_DATABASE_MIGRATION_REPORT.md
```

## Current Migration Status

The migration scope is approved conceptually:

- Add UAE-ready owner company fields
- Add UAE-ready branch operational/location fields
- Add role display/categorization fields
- Add permission display/visibility fields
- Add user profile admin/preference fields
- Preserve BIGINT primary keys
- No RLS policy changes
- Additive only, no destructive changes

However, the SQL requires correction before running `supabase db push`.

---

## Critical Fix 1 — Replace Unsupported `ADD CONSTRAINT IF NOT EXISTS`

The current migration uses syntax similar to:

```sql
ALTER TABLE public.owner_companies
  ADD CONSTRAINT IF NOT EXISTS owner_companies_icv_score_range
    CHECK (...);
```

and similar for branches.

This is not safe PostgreSQL/Supabase migration syntax.

Fix by using a safe `DO $$ ... $$` block that checks `pg_constraint` before adding each constraint.

Example pattern:

```sql
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'owner_companies_icv_score_range'
  ) THEN
    ALTER TABLE public.owner_companies
      ADD CONSTRAINT owner_companies_icv_score_range
      CHECK (icv_score IS NULL OR (icv_score >= 0 AND icv_score <= 100));
  END IF;
END $$;
```

Apply this pattern to all new constraints:

- `owner_companies_icv_score_range`
- `branches_branch_type_check`
- `branches_operating_status_check`
- `branches_latitude_range`
- `branches_longitude_range`

---

## Critical Fix 2 — Do Not Recreate Updated-At Triggers Blindly

The current migration drops/creates triggers like:

```sql
DROP TRIGGER IF EXISTS set_updated_at_owner_companies ON public.owner_companies;
CREATE TRIGGER set_updated_at_owner_companies ...
```

This is risky because Phase 001 may already have updated-at triggers with different names. Creating another trigger could create duplicate timestamp updates.

Since adding nullable/default columns does not require recreating updated-at triggers, do one of these:

### Preferred option

Remove the entire trigger recreation section from the 002D migration.

Reason:

- Existing updated_at triggers from Phase 001 are already working.
- New columns do not require trigger changes.
- Avoid duplicate triggers.

### Alternative option

Only create missing triggers after checking `pg_trigger`, and do not duplicate existing updated_at behavior.

Preferred: remove the trigger recreation section.

---

## Critical Fix 3 — Confirm Column Count and Report Accuracy

The report says 47 new columns.

Recount the actual columns in the SQL and correct the report if needed.

The branches section appears to add more fields than the report summary states.

Update:

```text
ERP_BASE_002D_DATABASE_MIGRATION_REPORT.md
```

to match the actual SQL precisely.

Do not overstate or understate column counts.

---

## Critical Fix 4 — Add Missing Useful Columns if Intended

Review whether the migration includes all intended fields from the 002D prompt.

Confirm whether these are already existing or newly added:

### owner_companies expected fields

- city
- area
- address_line_1
- address_line_2
- po_box
- makani_number
- trade_license_issue_date
- trade_license_expiry_date
- licensing_authority
- chamber_membership_no
- chamber_membership_expiry_date
- vat_registered
- corporate_tax_registered
- icv_certificate_no
- icv_score
- icv_issue_date
- icv_expiry_date
- adnoc_supplier_no
- notes

### branches expected fields

- branch_type
- is_main_branch
- operating_status
- city
- makani_number
- latitude
- longitude
- contact_person_name
- contact_phone
- contact_email
- has_workshop
- has_warehouse
- has_yard
- has_weighbridge
- notes

### roles expected fields

- display_name
- role_category
- role_level
- is_assignable
- notes

### permissions expected fields

- display_name
- is_system_permission
- is_visible
- sort_order

### user_profiles expected fields

- employee_reference
- manager_user_profile_id
- preferred_language
- timezone
- last_admin_updated_at
- notes

If any field is missing, either add it or document why it already exists / is deferred.

---

## Critical Fix 5 — Validate Existing Duplicate Columns

Because some Phase 001 tables already contain some fields, keep:

```sql
ADD COLUMN IF NOT EXISTS
```

This is correct.

Do not remove `IF NOT EXISTS` for columns.

Do not add duplicate columns.

---

## Critical Fix 6 — Manager FK Safety

The migration adds:

```sql
manager_user_profile_id bigint REFERENCES public.user_profiles(id) ON DELETE SET NULL
```

Check whether this creates an automatically named FK constraint. This is acceptable, but report it clearly.

If you want deterministic naming, change to:

```sql
ADD COLUMN IF NOT EXISTS manager_user_profile_id bigint,
ADD CONSTRAINT ... FOREIGN KEY ...
```

But only if done safely with constraint-existence checks.

Keep the simple inline FK if it passes migration validation.

---

## Critical Fix 7 — BIGINT / No UUID Verification

Keep the validation block confirming:

- `owner_companies.id` is BIGINT
- `branches.id` is BIGINT
- `roles.id` is BIGINT
- `permissions.id` is BIGINT
- `user_profiles.id` is BIGINT

Also confirm:

- No new UUID primary keys
- No `gen_random_uuid()` added
- No new ERP table UUID PKs

---

## Critical Fix 8 — RLS Safety

Do not change RLS policies in this migration.

Confirm:

- No `ALTER POLICY`
- No `DROP POLICY`
- No `DISABLE ROW LEVEL SECURITY`
- No broad grants
- No service role changes
- No auth changes

New columns inherit existing table-level RLS.

---

## Validation Required

After correcting SQL, run local/static validation:

1. Review SQL syntax.
2. Search for unsupported constraint syntax:

```text
ADD CONSTRAINT IF NOT EXISTS
```

It must not appear.

3. Search for trigger recreation:

```text
DROP TRIGGER
CREATE TRIGGER
set_updated_at_
```

If trigger recreation remains, explain why and ensure no duplication risk.

4. Confirm all new constraints use safe existence checks.

5. Run:

```bash
npm run lint
npm run typecheck
npm run build
```

Do not run `supabase db push`.

---

## Required Updated Reports

Create/update:

```text
ERP_BASE_002D_DATABASE_MIGRATION_REPORT.md
ERP_BASE_002D_MIGRATION_FIX_REPORT.md
ERP_BASE_002D_SECURITY_RLS_REVIEW_REPORT.md
```

Reports must include:

- what was wrong in the first migration
- how it was corrected
- corrected column count
- corrected constraint strategy
- trigger strategy
- BIGINT/no UUID confirmation
- RLS unchanged confirmation
- whether migration is still not pushed
- clear approval request to user before push

---

## Acceptance Criteria

This fix is complete only if:

- `ADD CONSTRAINT IF NOT EXISTS` is removed.
- Constraints are added through safe `DO $$` checks.
- Trigger recreation is removed or proven safe.
- Column count in report matches SQL.
- Migration remains additive and non-destructive.
- No RLS changes.
- No UUID primary keys.
- TypeScript/lint/build pass.
- Migration is still not pushed.
- Updated reports are generated.

---

## Final Instruction

Fix the Phase 002D migration only.

Do not continue implementation after this.

Do not push migration.

Stop after updated SQL and reports for user approval.
