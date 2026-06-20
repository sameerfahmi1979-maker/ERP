# UAE Insurance Policy Issuers Final Dry-Run Report

## 1. Final Status

```text
READY FOR HUMAN EXECUTION APPROVAL
```

## 2. Input Reports Reviewed

1. **Party Insurance Company Seed Requirements Audit** ([PARTY_INSURANCE_COMPANY_SEED_REQUIREMENTS_AUDIT.md](file:///c:/dev/agt-erp/docs/seed/PARTY_INSURANCE_COMPANY_SEED_REQUIREMENTS_AUDIT.md))
   - **Status**: Reviewed. Verified basic schema tables, multi-select party type assignments, RLS policies, audit logging capabilities, and the absence of any existing insurance records.
2. **UAE Insurance Policy Issuers Seed Plan** ([UAE_INSURANCE_POLICY_ISSUERS_SEED_PLAN.md](file:///c:/dev/agt-erp/docs/seed/UAE_INSURANCE_POLICY_ISSUERS_SEED_PLAN.md))
   - **Status**: Reviewed. Verified the list of 31 candidates from the CBUAE January 2026 Register, the dynamic sequential code rules, and the target table structure.

## 3. Live Database Compatibility Confirmation

| Check Area | Expected | Actual | Result | Notes |
| :--- | :--- | :--- | :--- | :--- |
| **party type** | `INSURANCE_COMPANY` (ID: 54) | `INSURANCE_COMPANY` (ID: 54) | **MATCH** | Successfully fetched from `party_types` lookup. |
| **party status** | `ACTIVE` (ID: 14) | `ACTIVE` (ID: 14) | **MATCH** | Successfully fetched from `party_statuses` lookup. |
| **country** | `AE` (ID: 1) | `AE` (ID: 1) | **MATCH** | Successfully fetched from `countries` lookup. |
| **party nature** | `PLC` (ID: 26) | `PLC` (ID: 26) | **MATCH** | Successfully fetched from `party_natures` lookup. |
| **numbering rule** | `MASTER_PARTY` (ID: 20, template: `{DOC}-{SEQ6}`, allow_manual_override = false) | `MASTER_PARTY` (ID: 20, template: `{DOC}-{SEQ6}`, allow_manual_override = false) | **MATCH** | Rule requires sequential code generation and does not allow overrides. |
| **numbering function signature** | `public.generate_next_reference_number(...)` returning `generated_reference_number` | Signature confirmed in migration file | **MATCH** | Matches parameter types and return columns. |
| **parties required columns** | `party_code, display_name, legal_name_en, party_nature_id, primary_party_type_id, country_id, party_status_id, is_active, remarks` | Matches schema | **MATCH** | Minimal fields are sufficient. |
| **party_type_assignments required columns** | `party_id, party_type_id, is_primary, is_active, assigned_date` | Matches schema | **MATCH** | Relationship schema structure matches. |
| **RLS execution requirements** | Must run as superuser/service_role to bypass RLS | Confirmed via service_role access | **MATCH** | Verified that bypass is required for seeding scripts. |

## 4. Duplicate Dry-Run Result

A read-only dry-run check was executed against the live database using both exact names and case-insensitive keyword searches:

| Seed Record | Existing Match Found: Yes/No | Match Type | Final Action: Insert/Skip/Review | Notes |
| :--- | :--- | :--- | :--- | :--- |
| **Yas Takaful** | No | None | Insert | Clean slate in database. |
| **Salama Takaful** | No | None | Insert | Clean slate in database. |
| **Sukoon Takaful** | No | None | Insert | Clean slate in database. |
| **National General Insurance** | No | None | Insert | Clean slate in database. |
| **Daman Insurance** | No | None | Insert | Clean slate in database. |
| **Alliance Insurance** | No | None | Insert | Clean slate in database. |
| **Takaful Emarat** | No | None | Insert | Clean slate in database. |
| **Insurance House** | No | None | Insert | Clean slate in database. |
| **Dubai National Insurance** | No | None | Insert | Clean slate in database. |
| **Sukoon Insurance** | No | None | Insert | Clean slate in database. |
| **ADNIC** | No | None | Insert | Clean slate in database. |
| **Abu Dhabi Takaful** | No | None | Insert | Clean slate in database. |
| **Union Insurance** | No | None | Insert | Clean slate in database. |
| **Emirates Insurance** | No | None | Insert | Clean slate in database. |
| **Al Buhaira Insurance** | No | None | Insert | Clean slate in database. |
| **United Fidelity Insurance** | No | None | Insert | Clean slate in database. |
| **Sharjah Insurance** | No | None | Insert | Clean slate in database. |
| **Al Sagr Insurance** | No | None | Insert | Clean slate in database. |
| **Al Dhafra Insurance** | No | None | Insert | Clean slate in database. |
| **Al Ain Ahlia Insurance** | No | None | Insert | Clean slate in database. |
| **Al Fujairah Insurance** | No | None | Insert | Clean slate in database. |
| **Al Wathba Insurance** | No | None | Insert | Clean slate in database. |
| **Orient Takaful** | No | None | Insert | Clean slate in database. |
| **Orient Insurance** | No | None | Insert | Clean slate in database. |
| **HAYAH Insurance** | No | None | Insert | Clean slate in database. |
| **Aman Insurance** | No | None | Insert | Clean slate in database. |
| **Dubai Insurance** | No | None | Insert | Clean slate in database. |
| **RAK Insurance** | No | None | Insert | Clean slate in database. |
| **Methaq Takaful** | No | None | Insert | Clean slate in database. |
| **Watania General Takaful** | No | None | Insert | Clean slate in database. |
| **Watania Family Takaful** | No | None | Insert | Clean slate in database. |

## 5. Final Dataset Count

- **Total candidates**: 31
- **Insert candidates**: 31
- **Skip candidates**: 0
- **Human review candidates**: 0

## 6. SQL File Created

State the SQL path:

```text
supabase/manual_sql/seed_uae_insurance_policy_issuers.sql
```

## 7. SQL Safety Features

- **Uses numbering engine**: Calls `public.generate_next_reference_number(...)` dynamically during insertion to avoid hardcoded party codes and increment the global counter.
- **Does not hardcode party IDs**: Database generates ID sequences automatically.
- **Does not hardcode party codes**: Obtained dynamically from the numbering engine.
- **Uses duplicate checks**: Performs both `legal_name_en` and exact `remarks` checks prior to insertion to skip records that already exist.
- **Inserts only core party rows and party_type_assignments**: Does not seed secondary or child tables in this phase.
- **Does not insert child records**: Skipped.
- **Uses exact rollback targeting**: Rollback script uses exact remarks matching with individual CBUAE registration numbers.

## 8. Rollback Review

The rollback script is placed commented at the bottom of the SQL file. It targets the records precisely using:
1. `party_type_id = 54` (`INSURANCE_COMPANY`)
2. `remarks LIKE 'CBUAE licensed insurance policy issuer. CBUAE register category:%'`
3. Explicit `OR` subqueries targeting each of the 31 registration numbers seeded in this batch.

This prevents any broad deletions of other manually created insurance companies in the future.

## 9. Risks Remaining

- **Numbering sequence jump**: Executing the SQL script will consume 31 sequence numbers from the global party master sequence, changing the active counter. This is expected behavior.
- **Bypassing application audit logging**: Running direct database seed scripts bypasses Next.js audit logging (`audit_logs` table). Row level `created_at` and `updated_at` columns will be populated with standard system values, which is acceptable for bulk seeds.

## 10. Human Approval Required

```text
Waiting for human approval before execution.
```

## 11. Final Recommendation

We recommend executing the generated SQL file `supabase/manual_sql/seed_uae_insurance_policy_issuers.sql` inside a Supabase Database Console (using the Service Role key or Superuser privileges) after this report is approved by a human administrator.
