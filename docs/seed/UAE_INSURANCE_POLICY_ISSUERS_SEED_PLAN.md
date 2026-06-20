# UAE Insurance Policy Issuers Seed Plan

## 1. Executive Summary

Based on the requirements audit and active lookup validation from the live database, this seed plan establishes a safe, non-destructive method for inserting UAE Insurance Policy Issuers into the ERP Party Master.

The final readiness status is:

**SAFE SQL PREVIEW READY — WAITING HUMAN APPROVAL**

Key highlights of this plan:
- **31 Candidate Insurers**: Mapped and verified from the CBUAE Register (January 2026). All candidates are National or Takaful policy issuers. Brokers have been strictly excluded.
- **Unified Sequential Codes**: All seeded records will dynamically obtain sequence codes (`PTY-` prefix) from the numbering engine using `generate_next_reference_number('MASTER_PARTY')` during execution. Hardcoded or custom `INS-` prefixes are avoided to prevent constraint conflicts.
- **Zero Existing Duplicates**: Query analysis of the database confirmed that no pre-existing records matching insurance keywords exist.
- **Safe Transaction Block**: The SQL preview runs within an anonymous block (`DO $$ ... $$`) and performs `NOT EXISTS` validations on `legal_name_en` to prevent duplicate rows if run multiple times.

---

## 2. Source Files and Database Objects Reviewed

The following files and database tables were utilized to verify lookup IDs and rules:
- **CBUAE Register (Jan 2026)**: Primary source for validating licensed entities and registration numbers.
- **Migrations & Seeds**:
  - `20260604180757_erp_base_002f2_global_numbering_engine.sql`
  - `20260614060000_erp_base_002f5a1_party_master_tables.sql`
  - `20260614060002_erp_base_002f5a1_party_master_seeds_perms_func.sql`
- **Database Tables**: `parties`, `party_type_assignments`, `party_types`, `party_statuses`, `party_natures`, `countries`, `emirates`, `global_numbering_rules`, `audit_logs`.

---

## 3. Confirmed ERP Rules

The following parameters have been queried and verified from the active database to ensure compatibility:

- **Primary Party Type**: `INSURANCE_COMPANY` (ID: `54`).
- **Party Status**: `ACTIVE` (ID: `14`).
- **Country**: `AE` (ID: `1`).
- **Party Nature**: PJSC/PLC is mapped to `PLC` (Public Listed Company, ID: `26`). National insurance companies in the UAE are legally required to be public joint-stock companies, so all 31 national/takaful candidates map to ID `26`.
- **Numbering Rule**: Managed under rule `MASTER_PARTY` (ID: `20`) which generates codes matching `PTY-{SEQ6}` (e.g. `PTY-000084` is currently next). Manual override is set to `false`.
- **RLS Policy**: Access requires superuser (`service_role`) privileges to bypass row-level permissions during execution.
- **Duplicate Protection**: Exact match blocks are active for TRN and License numbers, while warning blocks check exact emails, mobiles, and names.

---

## 4. Candidate Insurance Issuers Reviewed

Below is the verified list of candidate insurers checked against the CBUAE January 2026 register:

| Candidate Name | CBUAE Category | CBUAE REG NO | Included | Reason | Needs Human Approval |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **YAS Takaful** | Takaful | 084 | **Yes** | Licensed National Takaful policy issuer | No |
| **Islamic Arab Insurance Company 'SALAMA'** | Takaful | 017 | **Yes** | Licensed National Takaful policy issuer | No |
| **Sukoon Takaful PJSC** | Takaful | 006 | **Yes** | Licensed National Takaful policy issuer | No |
| **National General Insurance Co** | National | 061 | **Yes** | Licensed National policy issuer | No |
| **The National Health Insurance Company (Daman) PJSC** | National | 073 | **Yes** | Licensed National health policy issuer | No |
| **Alliance Insurance** | National | 018 | **Yes** | Licensed National policy issuer | No |
| **Takaful Emarat - Insurance PSC** | Takaful | 086 | **Yes** | Licensed National Takaful policy issuer | No |
| **Insurance House** | National | 089 | **Yes** | Licensed National policy issuer | No |
| **Dubai National Insurance & Reinsurance P.S.C** | National | 064 | **Yes** | Licensed National policy issuer | No |
| **Sukoon Insurance PJSC** | National | 009 | **Yes** | Licensed National policy issuer | No |
| **Abu Dhabi National Insurance Company** | National | 001 | **Yes** | Licensed National policy issuer | No |
| **Abu Dhabi National Takaful Company** | Takaful | 071 | **Yes** | Licensed National Takaful policy issuer | No |
| **Union Insurance** | National | 067 | **Yes** | Licensed National policy issuer | No |
| **Emirates Insurance Company (PSC)** | National | 002 | **Yes** | Licensed National policy issuer | No |
| **Al Buhaira National Insurance Co** | National | 015 | **Yes** | Licensed National policy issuer | No |
| **United Fidelity Insurance Company** | National | 008 | **Yes** | Licensed National policy issuer | No |
| **Sharjah Insurance Company (P.S.C)** | National | 012 | **Yes** | Licensed National policy issuer | No |
| **Al Sagr National Insurance Co. (PSC)** | National | 016 | **Yes** | Licensed National policy issuer | No |
| **Al Dhafra Insurance Company** | National | 005 | **Yes** | Licensed National policy issuer | No |
| **Al Ain Ahlia Insurance Company** | National | 003 | **Yes** | Licensed National policy issuer | No |
| **Al Fujairah National Insurance Company PSC** | National | 011 | **Yes** | Licensed National policy issuer | No |
| **Al Wathba National Insurance Company** | National | 010 | **Yes** | Licensed National policy issuer | No |
| **Orient Takaful (PJSC)** | Takaful | 092 | **Yes** | Licensed National Takaful policy issuer | No |
| **Orient Insurance Company** | National | 014 | **Yes** | Licensed National policy issuer | No |
| **HAYAH Insurance Company** | National | 083 | **Yes** | Licensed National policy issuer | No |
| **Dubai Islamic Insurance & Reinsurance Co. (Aman)** | Takaful | 070 | **Yes** | Licensed National Takaful policy issuer | No |
| **Dubai Insurance Company (PSC)** | National | 004 | **Yes** | Licensed National policy issuer | No |
| **Ras Al Khaimah National Insurance Company P.S.C** | National | 007 | **Yes** | Licensed National policy issuer | No |
| **Methaq Takaful Insurance** | Takaful | 082 | **Yes** | Licensed National Takaful policy issuer | No |
| **Watania Takaful General PJSC** | Takaful | 085 | **Yes** | Licensed National Takaful policy issuer | No |
| **Watania Takaful Family Insurance Company** | Takaful | 078 | **Yes** | Licensed National Takaful policy issuer | No |

---

## 5. Excluded Brokers / Non-Issuers

In compliance with the safety scope, all entities classified as Brokers, TPA, Reinsurers only, or representative offices in the CBUAE Register have been excluded:
- **Insurance Brokers** (e.g. Marsh, Aon, local brokers) are excluded.
- **Third-Party Administrators** (e.g. NextCare, NAS) are excluded.
- **Foreign Company Branches**: 27 foreign company branches licensed by CBUAE (including Chubb, Adamjee, Cigna Middle East, Zurich Life, Jordan Insurance Co, etc.) are **excluded by default** in this seed plan, marked as `NEEDS HUMAN APPROVAL` unless the user explicitly requests their addition.

---

## 6. Existing ERP Duplicates Found

A search of the active database for display and legal names containing matching keywords resulted in:
- **No Existing Records**: Zero matches found. No duplicates exist in the system under the `INSURANCE_COMPANY` classification.

---

## 7. Final Seed Dataset Preview

Below is a preview of the data fields that will be inserted. To maintain maximum compatibility, contacts, addresses, tax, and licensing details remain generic until officially verified.

| display_name | legal_name_en | party_nature_id | primary_party_type_id | country_id | party_status_id | remarks |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Yas Takaful** | Yas Takaful PJSC | 26 | 54 | 1 | 14 | CBUAE licensed insurance policy issuer. CBUAE register category: Takaful. CBUAE registration no: 084. Product coverage to be verified before operational use. |
| **Salama Takaful** | Islamic Arab Insurance Company 'SALAMA' PJSC | 26 | 54 | 1 | 14 | CBUAE licensed insurance policy issuer. CBUAE register category: Takaful. CBUAE registration no: 017. Product coverage to be verified before operational use. |
| **Sukoon Takaful** | Sukoon Takaful PJSC | 26 | 54 | 1 | 14 | CBUAE licensed insurance policy issuer. CBUAE register category: Takaful. CBUAE registration no: 006. Product coverage to be verified before operational use. |
| **National General Insurance** | National General Insurance Co PSC | 26 | 54 | 1 | 14 | CBUAE licensed insurance policy issuer. CBUAE register category: National. CBUAE registration no: 061. Product coverage to be verified before operational use. |
| **Daman Insurance** | The National Health Insurance Company (Daman) PJSC | 26 | 54 | 1 | 14 | CBUAE licensed insurance policy issuer. CBUAE register category: National. CBUAE registration no: 073. Product coverage to be verified before operational use. |
| **Alliance Insurance** | Alliance Insurance PSC | 26 | 54 | 1 | 14 | CBUAE licensed insurance policy issuer. CBUAE register category: National. CBUAE registration no: 018. Product coverage to be verified before operational use. |
| **Takaful Emarat** | Takaful Emarat - Insurance PSC | 26 | 54 | 1 | 14 | CBUAE licensed insurance policy issuer. CBUAE register category: Takaful. CBUAE registration no: 086. Product coverage to be verified before operational use. |
| **Insurance House** | Insurance House PSC | 26 | 54 | 1 | 14 | CBUAE licensed insurance policy issuer. CBUAE register category: National. CBUAE registration no: 089. Product coverage to be verified before operational use. |
| **Dubai National Insurance** | Dubai National Insurance & Reinsurance P.S.C | 26 | 54 | 1 | 14 | CBUAE licensed insurance policy issuer. CBUAE register category: National. CBUAE registration no: 064. Product coverage to be verified before operational use. |
| **Sukoon Insurance** | Sukoon Insurance PJSC | 26 | 54 | 1 | 14 | CBUAE licensed insurance policy issuer. CBUAE register category: National. CBUAE registration no: 009. Product coverage to be verified before operational use. |
| **ADNIC** | Abu Dhabi National Insurance Company PJSC | 26 | 54 | 1 | 14 | CBUAE licensed insurance policy issuer. CBUAE register category: National. CBUAE registration no: 001. Product coverage to be verified before operational use. |
| **Abu Dhabi Takaful** | Abu Dhabi National Takaful Company PSC | 26 | 54 | 1 | 14 | CBUAE licensed insurance policy issuer. CBUAE register category: Takaful. CBUAE registration no: 071. Product coverage to be verified before operational use. |
| **Union Insurance** | Union Insurance Company PSC | 26 | 54 | 1 | 14 | CBUAE licensed insurance policy issuer. CBUAE register category: National. CBUAE registration no: 067. Product coverage to be verified before operational use. |
| **Emirates Insurance** | Emirates Insurance Company (PSC) | 26 | 54 | 1 | 14 | CBUAE licensed insurance policy issuer. CBUAE register category: National. CBUAE registration no: 002. Product coverage to be verified before operational use. |
| **Al Buhaira Insurance** | Al Buhaira National Insurance Co PSC | 26 | 54 | 1 | 14 | CBUAE licensed insurance policy issuer. CBUAE register category: National. CBUAE registration no: 015. Product coverage to be verified before operational use. |
| **United Fidelity Insurance** | United Fidelity Insurance Company PSC | 26 | 54 | 1 | 14 | CBUAE licensed insurance policy issuer. CBUAE register category: National. CBUAE registration no: 008. Product coverage to be verified before operational use. |
| **Sharjah Insurance** | Sharjah Insurance Company (P.S.C) | 26 | 54 | 1 | 14 | CBUAE licensed insurance policy issuer. CBUAE register category: National. CBUAE registration no: 012. Product coverage to be verified before operational use. |
| **Al Sagr Insurance** | Al Sagr National Insurance Co. (PSC) | 26 | 54 | 1 | 14 | CBUAE licensed insurance policy issuer. CBUAE register category: National. CBUAE registration no: 016. Product coverage to be verified before operational use. |
| **Al Dhafra Insurance** | Al Dhafra Insurance Company PSC | 26 | 54 | 1 | 14 | CBUAE licensed insurance policy issuer. CBUAE register category: National. CBUAE registration no: 005. Product coverage to be verified before operational use. |
| **Al Ain Ahlia Insurance** | Al Ain Ahlia Insurance Company PSC | 26 | 54 | 1 | 14 | CBUAE licensed insurance policy issuer. CBUAE register category: National. CBUAE registration no: 003. Product coverage to be verified before operational use. |
| **Al Fujairah Insurance** | Al Fujairah National Insurance Company PSC | 26 | 54 | 1 | 14 | CBUAE licensed insurance policy issuer. CBUAE register category: National. CBUAE registration no: 011. Product coverage to be verified before operational use. |
| **Al Wathba Insurance** | Al Wathba National Insurance Company PJSC | 26 | 54 | 1 | 14 | CBUAE licensed insurance policy issuer. CBUAE register category: National. CBUAE registration no: 010. Product coverage to be verified before operational use. |
| **Orient Takaful** | Orient Takaful (PJSC) | 26 | 54 | 1 | 14 | CBUAE licensed insurance policy issuer. CBUAE register category: Takaful. CBUAE registration no: 092. Product coverage to be verified before operational use. |
| **Orient Insurance** | Orient Insurance Company PJSC | 26 | 54 | 1 | 14 | CBUAE licensed insurance policy issuer. CBUAE register category: National. CBUAE registration no: 014. Product coverage to be verified before operational use. |
| **HAYAH Insurance** | HAYAH Insurance Company PJSC | 26 | 54 | 1 | 14 | CBUAE licensed insurance policy issuer. CBUAE register category: National. CBUAE registration no: 083. Product coverage to be verified before operational use. |
| **Aman Insurance** | Dubai Islamic Insurance & Reinsurance Co. (Aman) PSC | 26 | 54 | 1 | 14 | CBUAE licensed insurance policy issuer. CBUAE register category: Takaful. CBUAE registration no: 070. Product coverage to be verified before operational use. |
| **Dubai Insurance** | Dubai Insurance Company (PSC) | 26 | 54 | 1 | 14 | CBUAE licensed insurance policy issuer. CBUAE register category: National. CBUAE registration no: 004. Product coverage to be verified before operational use. |
| **RAK Insurance** | Ras Al Khaimah National Insurance Company P.S.C | 26 | 54 | 1 | 14 | CBUAE licensed insurance policy issuer. CBUAE register category: National. CBUAE registration no: 007. Product coverage to be verified before operational use. |
| **Methaq Takaful** | Methaq Takaful Insurance PSC | 26 | 54 | 1 | 14 | CBUAE licensed insurance policy issuer. CBUAE register category: Takaful. CBUAE registration no: 082. Product coverage to be verified before operational use. |
| **Watania General Takaful** | Watania Takaful General PJSC | 26 | 54 | 1 | 14 | CBUAE licensed insurance policy issuer. CBUAE register category: Takaful. CBUAE registration no: 085. Product coverage to be verified before operational use. |
| **Watania Family Takaful** | Watania Takaful Family Insurance Company PJSC | 26 | 54 | 1 | 14 | CBUAE licensed insurance policy issuer. CBUAE register category: Takaful. CBUAE registration no: 078. Product coverage to be verified before operational use. |

---

## 8. SQL / Script Preview

The anonymous PL/pgSQL block below executes the insertions. It dynamically calls the numbering engine for sequence generation, maps mappings, and handles duplicate prevention.

```sql
DO $$
DECLARE
  v_party_id BIGINT;
  v_code     TEXT;
  v_profile  RECORD;
  v_rec      RECORD;
BEGIN
  -- Create temporary table containing dataset
  CREATE TEMPORARY TABLE temp_seed_insurers (
    display_name TEXT,
    legal_name_en TEXT,
    party_nature_id BIGINT,
    primary_party_type_id BIGINT,
    country_id BIGINT,
    party_status_id BIGINT,
    remarks TEXT
  ) ON COMMIT DROP;

  INSERT INTO temp_seed_insurers VALUES
    ('Yas Takaful', 'Yas Takaful PJSC', 26, 54, 1, 14, 'CBUAE licensed insurance policy issuer. CBUAE register category: Takaful. CBUAE registration no: 084. Product coverage to be verified before operational use.'),
    ('Salama Takaful', 'Islamic Arab Insurance Company ''SALAMA'' PJSC', 26, 54, 1, 14, 'CBUAE licensed insurance policy issuer. CBUAE register category: Takaful. CBUAE registration no: 017. Product coverage to be verified before operational use.'),
    ('Sukoon Takaful', 'Sukoon Takaful PJSC', 26, 54, 1, 14, 'CBUAE licensed insurance policy issuer. CBUAE register category: Takaful. CBUAE registration no: 006. Product coverage to be verified before operational use.'),
    ('National General Insurance', 'National General Insurance Co PSC', 26, 54, 1, 14, 'CBUAE licensed insurance policy issuer. CBUAE register category: National. CBUAE registration no: 061. Product coverage to be verified before operational use.'),
    ('Daman Insurance', 'The National Health Insurance Company (Daman) PJSC', 26, 54, 1, 14, 'CBUAE licensed insurance policy issuer. CBUAE register category: National. CBUAE registration no: 073. Product coverage to be verified before operational use.'),
    ('Alliance Insurance', 'Alliance Insurance PSC', 26, 54, 1, 14, 'CBUAE licensed insurance policy issuer. CBUAE register category: National. CBUAE registration no: 018. Product coverage to be verified before operational use.'),
    ('Takaful Emarat', 'Takaful Emarat - Insurance PSC', 26, 54, 1, 14, 'CBUAE licensed insurance policy issuer. CBUAE register category: Takaful. CBUAE registration no: 086. Product coverage to be verified before operational use.'),
    ('Insurance House', 'Insurance House PSC', 26, 54, 1, 14, 'CBUAE licensed insurance policy issuer. CBUAE register category: National. CBUAE registration no: 089. Product coverage to be verified before operational use.'),
    ('Dubai National Insurance', 'Dubai National Insurance & Reinsurance P.S.C', 26, 54, 1, 14, 'CBUAE licensed insurance policy issuer. CBUAE register category: National. CBUAE registration no: 064. Product coverage to be verified before operational use.'),
    ('Sukoon Insurance', 'Sukoon Insurance PJSC', 26, 54, 1, 14, 'CBUAE licensed insurance policy issuer. CBUAE register category: National. CBUAE registration no: 009. Product coverage to be verified before operational use.'),
    ('ADNIC', 'Abu Dhabi National Insurance Company PJSC', 26, 54, 1, 14, 'CBUAE licensed insurance policy issuer. CBUAE register category: National. CBUAE registration no: 001. Product coverage to be verified before operational use.'),
    ('Abu Dhabi Takaful', 'Abu Dhabi National Takaful Company PSC', 26, 54, 1, 14, 'CBUAE licensed insurance policy issuer. CBUAE register category: Takaful. CBUAE registration no: 071. Product coverage to be verified before operational use.'),
    ('Union Insurance', 'Union Insurance Company PSC', 26, 54, 1, 14, 'CBUAE licensed insurance policy issuer. CBUAE register category: National. CBUAE registration no: 067. Product coverage to be verified before operational use.'),
    ('Emirates Insurance', 'Emirates Insurance Company (PSC)', 26, 54, 1, 14, 'CBUAE licensed insurance policy issuer. CBUAE register category: National. CBUAE registration no: 002. Product coverage to be verified before operational use.'),
    ('Al Buhaira Insurance', 'Al Buhaira National Insurance Co PSC', 26, 54, 1, 14, 'CBUAE licensed insurance policy issuer. CBUAE register category: National. CBUAE registration no: 015. Product coverage to be verified before operational use.'),
    ('United Fidelity Insurance', 'United Fidelity Insurance Company PSC', 26, 54, 1, 14, 'CBUAE licensed insurance policy issuer. CBUAE register category: National. CBUAE registration no: 008. Product coverage to be verified before operational use.'),
    ('Sharjah Insurance', 'Sharjah Insurance Company (P.S.C)', 26, 54, 1, 14, 'CBUAE licensed insurance policy issuer. CBUAE register category: National. CBUAE registration no: 012. Product coverage to be verified before operational use.'),
    ('Al Sagr Insurance', 'Al Sagr National Insurance Co. (PSC)', 26, 54, 1, 14, 'CBUAE licensed insurance policy issuer. CBUAE register category: National. CBUAE registration no: 016. Product coverage to be verified before operational use.'),
    ('Al Dhafra Insurance', 'Al Dhafra Insurance Company PSC', 26, 54, 1, 14, 'CBUAE licensed insurance policy issuer. CBUAE register category: National. CBUAE registration no: 005. Product coverage to be verified before operational use.'),
    ('Al Ain Ahlia Insurance', 'Al Ain Ahlia Insurance Company PSC', 26, 54, 1, 14, 'CBUAE licensed insurance policy issuer. CBUAE register category: National. CBUAE registration no: 003. Product coverage to be verified before operational use.'),
    ('Al Fujairah Insurance', 'Al Fujairah National Insurance Company PSC', 26, 54, 1, 14, 'CBUAE licensed insurance policy issuer. CBUAE register category: National. CBUAE registration no: 011. Product coverage to be verified before operational use.'),
    ('Al Wathba Insurance', 'Al Wathba National Insurance Company PJSC', 26, 54, 1, 14, 'CBUAE licensed insurance policy issuer. CBUAE register category: National. CBUAE registration no: 010. Product coverage to be verified before operational use.'),
    ('Orient Takaful', 'Orient Takaful (PJSC)', 26, 54, 1, 14, 'CBUAE licensed insurance policy issuer. CBUAE register category: Takaful. CBUAE registration no: 092. Product coverage to be verified before operational use.'),
    ('Orient Insurance', 'Orient Insurance Company PJSC', 26, 54, 1, 14, 'CBUAE licensed insurance policy issuer. CBUAE register category: National. CBUAE registration no: 014. Product coverage to be verified before operational use.'),
    ('HAYAH Insurance', 'HAYAH Insurance Company PJSC', 26, 54, 1, 14, 'CBUAE licensed insurance policy issuer. CBUAE register category: National. CBUAE registration no: 083. Product coverage to be verified before operational use.'),
    ('Aman Insurance', 'Dubai Islamic Insurance & Reinsurance Co. (Aman) PSC', 26, 54, 1, 14, 'CBUAE licensed insurance policy issuer. CBUAE register category: Takaful. CBUAE registration no: 070. Product coverage to be verified before operational use.'),
    ('Dubai Insurance', 'Dubai Insurance Company (PSC)', 26, 54, 1, 14, 'CBUAE licensed insurance policy issuer. CBUAE register category: National. CBUAE registration no: 004. Product coverage to be verified before operational use.'),
    ('RAK Insurance', 'Ras Al Khaimah National Insurance Company P.S.C', 26, 54, 1, 14, 'CBUAE licensed insurance policy issuer. CBUAE register category: National. CBUAE registration no: 007. Product coverage to be verified before operational use.'),
    ('Methaq Takaful', 'Methaq Takaful Insurance PSC', 26, 54, 1, 14, 'CBUAE licensed insurance policy issuer. CBUAE register category: Takaful. CBUAE registration no: 082. Product coverage to be verified before operational use.'),
    ('Watania General Takaful', 'Watania Takaful General PJSC', 26, 54, 1, 14, 'CBUAE licensed insurance policy issuer. CBUAE register category: Takaful. CBUAE registration no: 085. Product coverage to be verified before operational use.'),
    ('Watania Family Takaful', 'Watania Takaful Family Insurance Company PJSC', 26, 54, 1, 14, 'CBUAE licensed insurance policy issuer. CBUAE register category: Takaful. CBUAE registration no: 078. Product coverage to be verified before operational use.');

  -- Loop and insert
  FOR v_rec IN SELECT * FROM temp_seed_insurers LOOP
    -- Validate exact duplicate name check
    IF NOT EXISTS (SELECT 1 FROM parties WHERE lower(legal_name_en) = lower(v_rec.legal_name_en)) THEN
      
      -- Generate sequential party code via numbering engine
      SELECT generated_reference_number INTO v_code
      FROM public.generate_next_reference_number(
        p_rule_code := 'MASTER_PARTY',
        p_document_type_code := 'PARTY',
        p_target_table_name := 'parties',
        p_generation_reason := 'Seed CBUAE Insurance Company'
      );

      -- Insert core party
      INSERT INTO parties (
        party_code,
        display_name,
        legal_name_en,
        party_nature_id,
        primary_party_type_id,
        country_id,
        party_status_id,
        is_active,
        remarks,
        created_at,
        updated_at
      ) VALUES (
        v_code,
        v_rec.display_name,
        v_rec.legal_name_en,
        v_rec.party_nature_id,
        v_rec.primary_party_type_id,
        v_rec.country_id,
        v_rec.party_status_id,
        TRUE,
        v_rec.remarks,
        now(),
        now()
      ) RETURNING id INTO v_party_id;

      -- Insert party classification assignment (primary, active)
      INSERT INTO party_type_assignments (
        party_id,
        party_type_id,
        is_primary,
        is_active,
        assigned_date,
        created_at,
        updated_at
      ) VALUES (
        v_party_id,
        54, -- INSURANCE_COMPANY
        TRUE,
        TRUE,
        current_date,
        now(),
        now()
      );

    END IF;
  END LOOP;
END $$;
```

---

## 9. Audit Handling

- **Row-level Audit Columns**: Row-level fields (`created_at`, `updated_at`) are explicitly set to `now()`. The actor references (`created_by`, `updated_by`) remain `NULL` since these rows are system seeds.
- **Audit Logs Table**: Database seeds run at a superuser level bypass Next.js API hooks, meaning rows are not created automatically in `audit_logs`. Because seed operations are trackable via migration commits, direct SQL insert into the `audit_logs` table is omitted to keep the script clean.

---

## 10. Rollback Plan

To rollback this seed without affecting other parties, execute the SQL script below. It identifies the records by their CBUAE signature in `remarks` and the join table assignments:

```sql
BEGIN;

-- 1. Remove assignments
DELETE FROM party_type_assignments
WHERE party_type_id = 54
  AND party_id IN (
    SELECT id FROM parties WHERE remarks LIKE 'CBUAE licensed insurance policy issuer%'
  );

-- 2. Remove core parties
DELETE FROM parties
WHERE remarks LIKE 'CBUAE licensed insurance policy issuer%';

COMMIT;
```

---

## 11. Human Approval Needed

Before execution, the user must explicitly align on:
1. **Default Exclusions**: Confirming that all foreign licensed branches and broker companies remain excluded.
2. **Standardized PTY- Prefix**: Confirming that standard `PTY-` sequential reference codes will be assigned instead of `INS-`.
3. **Execution Environment**: Bypassing RLS requires running the SQL block in a superuser console (e.g. Supabase Dashboard).

---

## 12. Final Recommendation

**SAFE SQL PREVIEW READY — WAITING HUMAN APPROVAL**

The seed plan complies with all database constraints and application conventions. Do not execute the script until the user issues an explicit approval.
