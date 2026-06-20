-- ============================================================================
-- SQL SEED: UAE Insurance Policy Issuers
-- Purpose: Seeding 31 UAE National/Takaful insurance policy issuers into the ERP Party Master.
-- Date: 2026-06-19
-- Safety: DO NOT RUN WITHOUT HUMAN APPROVAL
-- ============================================================================

BEGIN;

-- ── 1. PRE-EXECUTION VALIDATION (READ-ONLY) ──────────────────────────────────
-- This block validates that the environment contains the expected lookup IDs and numbering rules.
DO $$
DECLARE
  v_party_type_id       BIGINT;
  v_party_status_id     BIGINT;
  v_country_id          BIGINT;
  v_party_nature_id     BIGINT;
  v_numbering_rule_id   BIGINT;
  v_rule_allow_override BOOLEAN;
BEGIN
  -- Validate party_types lookup for INSURANCE_COMPANY (ID must be 54)
  SELECT id INTO v_party_type_id FROM public.party_types WHERE type_code = 'INSURANCE_COMPANY';
  IF v_party_type_id IS NULL OR v_party_type_id != 54 THEN
    RAISE EXCEPTION 'Validation failed: INSURANCE_COMPANY party type ID is expected to be 54, but found %', v_party_type_id;
  END IF;

  -- Validate party_statuses lookup for ACTIVE (ID must be 14)
  SELECT id INTO v_party_status_id FROM public.party_statuses WHERE status_code = 'ACTIVE';
  IF v_party_status_id IS NULL OR v_party_status_id != 14 THEN
    RAISE EXCEPTION 'Validation failed: ACTIVE party status ID is expected to be 14, but found %', v_party_status_id;
  END IF;

  -- Validate countries lookup for AE (ID must be 1)
  SELECT id INTO v_country_id FROM public.countries WHERE country_code = 'AE';
  IF v_country_id IS NULL OR v_country_id != 1 THEN
    RAISE EXCEPTION 'Validation failed: AE country ID is expected to be 1, but found %', v_country_id;
  END IF;

  -- Validate party_natures lookup for PLC (ID must be 26)
  SELECT id INTO v_party_nature_id FROM public.party_natures WHERE nature_code = 'PLC';
  IF v_party_nature_id IS NULL OR v_party_nature_id != 26 THEN
    RAISE EXCEPTION 'Validation failed: PLC party nature ID is expected to be 26, but found %', v_party_nature_id;
  END IF;

  -- Validate global_numbering_rules lookup for MASTER_PARTY (ID must be 20)
  SELECT id, allow_manual_override INTO v_numbering_rule_id, v_rule_allow_override
  FROM public.global_numbering_rules
  WHERE rule_code = 'MASTER_PARTY';
  
  IF v_numbering_rule_id IS NULL OR v_numbering_rule_id != 20 THEN
    RAISE EXCEPTION 'Validation failed: MASTER_PARTY numbering rule ID is expected to be 20, but found %', v_numbering_rule_id;
  END IF;

  IF v_rule_allow_override = TRUE THEN
    RAISE EXCEPTION 'Validation failed: MASTER_PARTY rule should not allow manual override';
  END IF;

  RAISE NOTICE 'Pre-execution lookup validations passed successfully.';
END $$;


-- ── 2. SEED TRANSACTION BLOCK ────────────────────────────────────────────────
-- Inserts the 31 insurance policy issuers if they do not already exist.
-- Dynamically obtains sequence codes using the numbering engine.
DO $$
DECLARE
  v_party_id        BIGINT;
  v_party_code      TEXT;
  v_rec             RECORD;
  v_insert_count    INT := 0;
  v_skip_count      INT := 0;
BEGIN
  -- Create temporary table containing seed dataset
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

  FOR v_rec IN SELECT * FROM temp_seed_insurers LOOP
    -- Validate uniqueness: check both by lower(legal_name_en) and by the exact remarks containing the registration no
    IF EXISTS (
      SELECT 1 FROM public.parties 
      WHERE lower(legal_name_en) = lower(v_rec.legal_name_en)
         OR remarks = v_rec.remarks
    ) THEN
      v_skip_count := v_skip_count + 1;
      RAISE NOTICE 'Skipping duplicate candidate: %', v_rec.legal_name_en;
    ELSE
      -- Generate next sequential reference code from numbering engine
      SELECT generated_reference_number INTO v_party_code
      FROM public.generate_next_reference_number(
        p_rule_code := 'MASTER_PARTY',
        p_document_type_code := 'PARTY',
        p_target_table_name := 'parties',
        p_generation_reason := 'Seed CBUAE Insurance Company'
      );

      -- Insert core party record
      INSERT INTO public.parties (
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
        v_party_code,
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

      -- Insert party classification assignment (primary classification)
      INSERT INTO public.party_type_assignments (
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

      v_insert_count := v_insert_count + 1;
    END IF;
  END LOOP;

  RAISE NOTICE 'Seeding Summary: % inserted, % skipped.', v_insert_count, v_skip_count;
END $$;


-- ── 3. FINAL SEED VERIFICATION SUMMARY ───────────────────────────────────────
SELECT 
  p.id AS party_id,
  p.party_code,
  p.display_name,
  p.legal_name_en,
  pta.is_primary,
  p.remarks
FROM public.parties p
JOIN public.party_type_assignments pta ON p.id = pta.party_id
WHERE pta.party_type_id = 54
  AND p.remarks LIKE 'CBUAE licensed insurance policy issuer.%'
ORDER BY p.party_code;

COMMIT;


-- ── 4. COMMENTED ROLLBACK SECTION ───────────────────────────────────────────
-- To rollback only this specific seed batch, uncomment and run the block below:
/*
BEGIN;

-- 1. Remove party type assignments for the seeded insurers
DELETE FROM public.party_type_assignments
WHERE party_type_id = 54
  AND party_id IN (
    SELECT id FROM public.parties 
    WHERE remarks LIKE 'CBUAE licensed insurance policy issuer. CBUAE register category:%'
      AND (
        remarks LIKE '%CBUAE registration no: 084%' OR
        remarks LIKE '%CBUAE registration no: 017%' OR
        remarks LIKE '%CBUAE registration no: 006%' OR
        remarks LIKE '%CBUAE registration no: 061%' OR
        remarks LIKE '%CBUAE registration no: 073%' OR
        remarks LIKE '%CBUAE registration no: 018%' OR
        remarks LIKE '%CBUAE registration no: 086%' OR
        remarks LIKE '%CBUAE registration no: 089%' OR
        remarks LIKE '%CBUAE registration no: 064%' OR
        remarks LIKE '%CBUAE registration no: 009%' OR
        remarks LIKE '%CBUAE registration no: 001%' OR
        remarks LIKE '%CBUAE registration no: 071%' OR
        remarks LIKE '%CBUAE registration no: 067%' OR
        remarks LIKE '%CBUAE registration no: 002%' OR
        remarks LIKE '%CBUAE registration no: 015%' OR
        remarks LIKE '%CBUAE registration no: 008%' OR
        remarks LIKE '%CBUAE registration no: 012%' OR
        remarks LIKE '%CBUAE registration no: 016%' OR
        remarks LIKE '%CBUAE registration no: 005%' OR
        remarks LIKE '%CBUAE registration no: 003%' OR
        remarks LIKE '%CBUAE registration no: 011%' OR
        remarks LIKE '%CBUAE registration no: 010%' OR
        remarks LIKE '%CBUAE registration no: 092%' OR
        remarks LIKE '%CBUAE registration no: 014%' OR
        remarks LIKE '%CBUAE registration no: 083%' OR
        remarks LIKE '%CBUAE registration no: 070%' OR
        remarks LIKE '%CBUAE registration no: 004%' OR
        remarks LIKE '%CBUAE registration no: 007%' OR
        remarks LIKE '%CBUAE registration no: 082%' OR
        remarks LIKE '%CBUAE registration no: 085%' OR
        remarks LIKE '%CBUAE registration no: 078%'
      )
  );

-- 2. Remove the core party records
DELETE FROM public.parties
WHERE remarks LIKE 'CBUAE licensed insurance policy issuer. CBUAE register category:%'
  AND (
    remarks LIKE '%CBUAE registration no: 084%' OR
    remarks LIKE '%CBUAE registration no: 017%' OR
    remarks LIKE '%CBUAE registration no: 006%' OR
    remarks LIKE '%CBUAE registration no: 061%' OR
    remarks LIKE '%CBUAE registration no: 073%' OR
    remarks LIKE '%CBUAE registration no: 018%' OR
    remarks LIKE '%CBUAE registration no: 086%' OR
    remarks LIKE '%CBUAE registration no: 089%' OR
    remarks LIKE '%CBUAE registration no: 064%' OR
    remarks LIKE '%CBUAE registration no: 009%' OR
    remarks LIKE '%CBUAE registration no: 001%' OR
    remarks LIKE '%CBUAE registration no: 071%' OR
    remarks LIKE '%CBUAE registration no: 067%' OR
    remarks LIKE '%CBUAE registration no: 002%' OR
    remarks LIKE '%CBUAE registration no: 015%' OR
    remarks LIKE '%CBUAE registration no: 008%' OR
    remarks LIKE '%CBUAE registration no: 012%' OR
    remarks LIKE '%CBUAE registration no: 016%' OR
    remarks LIKE '%CBUAE registration no: 005%' OR
    remarks LIKE '%CBUAE registration no: 003%' OR
    remarks LIKE '%CBUAE registration no: 011%' OR
    remarks LIKE '%CBUAE registration no: 010%' OR
    remarks LIKE '%CBUAE registration no: 092%' OR
    remarks LIKE '%CBUAE registration no: 014%' OR
    remarks LIKE '%CBUAE registration no: 083%' OR
    remarks LIKE '%CBUAE registration no: 070%' OR
    remarks LIKE '%CBUAE registration no: 004%' OR
    remarks LIKE '%CBUAE registration no: 007%' OR
    remarks LIKE '%CBUAE registration no: 082%' OR
    remarks LIKE '%CBUAE registration no: 085%' OR
    remarks LIKE '%CBUAE registration no: 078%'
  );

COMMIT;
*/
