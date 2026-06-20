-- ============================================================================
-- SQL SEED: UAE Insurance Parties Official Contact and Address Enrichment
-- Purpose: Seed and enrich 31 UAE Insurance Policy Issuers with official contact
--          details, primary addresses, and official department contacts.
-- Date: 2026-06-19
-- Safety: DO NOT RUN WITHOUT HUMAN APPROVAL
-- ============================================================================

BEGIN;

-- ── 1. PRE-EXECUTION VALIDATION (READ-ONLY) ──────────────────────────────────
-- Validates lookup tables and numbering rules to ensure database state compatibility.
DO $$
DECLARE
  v_party_type_id        BIGINT;
  v_party_status_id      BIGINT;
  v_country_id           BIGINT;
  v_party_nature_id      BIGINT;
  v_addr_type_id         BIGINT;
  v_contact_role_id      BIGINT;
  v_contact_dept_id      BIGINT;
  v_num_rule_party_id    BIGINT;
  v_num_rule_addr_id     BIGINT;
  v_num_rule_cont_id     BIGINT;
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

  -- Validate party_address_types lookup for HEAD_OFFICE (ID must be 18)
  SELECT id INTO v_addr_type_id FROM public.party_address_types WHERE address_type_code = 'HEAD_OFFICE';
  IF v_addr_type_id IS NULL OR v_addr_type_id != 18 THEN
    RAISE EXCEPTION 'Validation failed: HEAD_OFFICE address type ID is expected to be 18, but found %', v_addr_type_id;
  END IF;

  -- Validate party_contact_roles lookup for OPERATIONS (ID must be 22)
  SELECT id INTO v_contact_role_id FROM public.party_contact_roles WHERE contact_role_code = 'OPERATIONS';
  IF v_contact_role_id IS NULL OR v_contact_role_id != 22 THEN
    RAISE EXCEPTION 'Validation failed: OPERATIONS contact role ID is expected to be 22, but found %', v_contact_role_id;
  END IF;

  -- Validate party_contact_departments lookup for OPERATIONS (ID must be 28)
  SELECT id INTO v_contact_dept_id FROM public.party_contact_departments WHERE contact_department_code = 'OPERATIONS';
  IF v_contact_dept_id IS NULL OR v_contact_dept_id != 28 THEN
    RAISE EXCEPTION 'Validation failed: OPERATIONS contact department ID is expected to be 28, but found %', v_contact_dept_id;
  END IF;

  -- Validate global_numbering_rules lookup for MASTER_PARTY (ID must be 20)
  SELECT id INTO v_num_rule_party_id FROM public.global_numbering_rules WHERE rule_code = 'MASTER_PARTY';
  IF v_num_rule_party_id IS NULL OR v_num_rule_party_id != 20 THEN
    RAISE EXCEPTION 'Validation failed: MASTER_PARTY numbering rule ID is expected to be 20, but found %', v_num_rule_party_id;
  END IF;

  -- Validate global_numbering_rules lookup for MASTER_PARTY_ADDRESS (ID must be 22)
  SELECT id INTO v_num_rule_addr_id FROM public.global_numbering_rules WHERE rule_code = 'MASTER_PARTY_ADDRESS';
  IF v_num_rule_addr_id IS NULL OR v_num_rule_addr_id != 22 THEN
    RAISE EXCEPTION 'Validation failed: MASTER_PARTY_ADDRESS numbering rule ID is expected to be 22, but found %', v_num_rule_addr_id;
  END IF;

  -- Validate global_numbering_rules lookup for MASTER_PARTY_CONTACT (ID must be 21)
  SELECT id INTO v_num_rule_cont_id FROM public.global_numbering_rules WHERE rule_code = 'MASTER_PARTY_CONTACT';
  IF v_num_rule_cont_id IS NULL OR v_num_rule_cont_id != 21 THEN
    RAISE EXCEPTION 'Validation failed: MASTER_PARTY_CONTACT numbering rule ID is expected to be 21, but found %', v_num_rule_cont_id;
  END IF;

  RAISE NOTICE 'Pre-execution lookup and numbering engine rule validations passed successfully.';
END $$;


-- ── 2. SEED & ENRICH TRANSACTION BLOCK ────────────────────────────────────────
-- Inserts or updates the 31 insurance policy issuers and seeds their official addresses/contacts.
DO $$
DECLARE
  v_party_id        BIGINT;
  v_party_code      TEXT;
  v_address_id      BIGINT;
  v_address_code    TEXT;
  v_contact_id      BIGINT;
  v_contact_code    TEXT;
  v_rec             RECORD;
  
  v_insert_party_cnt INT := 0;
  v_update_party_cnt INT := 0;
  v_insert_addr_cnt  INT := 0;
  v_insert_cont_cnt  INT := 0;
BEGIN
  -- Create temporary table containing enriched seed dataset
  CREATE TEMPORARY TABLE temp_enriched_insurers (
    display_name TEXT,
    legal_name_en TEXT,
    cbuae_reg_no TEXT,
    official_website TEXT,
    main_phone TEXT,
    main_email TEXT,
    po_box TEXT,
    full_address_text TEXT,
    emirate_id BIGINT,
    city_id BIGINT,
    contact_name TEXT,
    contact_designation TEXT,
    contact_phone TEXT,
    contact_email TEXT,
    remarks TEXT
  ) ON COMMIT DROP;

  INSERT INTO temp_enriched_insurers VALUES ('Yas Takaful', 'Yas Takaful PJSC', '084', 'http://www.yastakaful.ae', '800 889', 'customerinfo@yastakaful.ae', '111644', 'Abu Dhabi, UAE', 1, 1, NULL, NULL, NULL, NULL, 'CBUAE licensed insurance policy issuer. CBUAE register category: Takaful. CBUAE registration no: 084. Verified official website: http://www.yastakaful.ae. Product categories shown: takaful. Note: License suspended by CBUAE in August 2025. Prohibited from writing new business.');
  INSERT INTO temp_enriched_insurers VALUES ('Salama Takaful', 'Islamic Arab Insurance Company ''SALAMA'' PJSC', '017', 'https://www.salama.ae', '800 725262', 'info@salama.ae', '10214', '4th Floor, Block A, Spectrum Building, Oud Metha, Sheikh Rashid Road, Dubai, UAE', 2, 4, 'Customer Service', 'Official Department Contact', '800 725262', 'info@salama.ae', 'CBUAE licensed insurance policy issuer. CBUAE register category: Takaful. CBUAE registration no: 017. Verified official website: https://www.salama.ae. Product categories shown: motor, health, home, travel, corporate. Note: Active insurer.');
  INSERT INTO temp_enriched_insurers VALUES ('Sukoon Takaful', 'Sukoon Takaful PJSC', '006', 'https://www.sukoontakaful.com', '+971 4 282 4403', 'customercare@sukoontakaful.com', '1993', 'Al Garhoud, 3rd Floor, Al Kazim Building, Dubai, UAE', 2, 4, 'Customer Care', 'Official Department Contact', '+971 4 282 4403', 'customercare@sukoontakaful.com', 'CBUAE licensed insurance policy issuer. CBUAE register category: Takaful. CBUAE registration no: 006. Verified official website: https://www.sukoontakaful.com. Product categories shown: takaful, motor, medical, home, sme. Note: Active insurer.');
  INSERT INTO temp_enriched_insurers VALUES ('National General Insurance', 'National General Insurance Co PSC', '061', 'https://www.ngi.ae', '+971 4 211 5800', 'customerservice@ngiuae.com', '154', 'NGI House, Port Saeed Street, Deira, Dubai, UAE', 2, 4, 'Customer Service', 'Official Department Contact', '+971 4 211 5800', 'customerservice@ngiuae.com', 'CBUAE licensed insurance policy issuer. CBUAE register category: National. CBUAE registration no: 061. Verified official website: https://www.ngi.ae. Product categories shown: motor, medical, home, travel, corporate. Note: Active insurer.');
  INSERT INTO temp_enriched_insurers VALUES ('Daman Insurance', 'The National Health Insurance Company (Daman) PJSC', '073', 'https://www.damanhealth.ae', '600 532626', 'customerinfo@damanhealth.ae', '128888', 'Abu Dhabi, UAE', 1, 1, 'Customer Service', 'Official Department Contact', '600 532626', 'customerinfo@damanhealth.ae', 'CBUAE licensed insurance policy issuer. CBUAE register category: National. CBUAE registration no: 073. Verified official website: https://www.damanhealth.ae. Product categories shown: health. Note: Active health insurer.');
  INSERT INTO temp_enriched_insurers VALUES ('Alliance Insurance', 'Alliance Insurance PSC', '018', 'https://www.alliance-uae.com', '+971 4 605 1111', 'care@alliance-uae.com', '5501', 'Alliance Building, Warba Street, Deira, Dubai, UAE', 2, 4, 'Customer Care', 'Official Department Contact', '+971 4 605 1111', 'care@alliance-uae.com', 'CBUAE licensed insurance policy issuer. CBUAE register category: National. CBUAE registration no: 018. Verified official website: https://www.alliance-uae.com. Product categories shown: motor, medical, life, property, marine, engineering. Note: Active insurer.');
  INSERT INTO temp_enriched_insurers VALUES ('Takaful Emarat', 'Takaful Emarat - Insurance PSC', '086', 'http://www.takafulemarat.com', '600 522550', 'customerrelations@takafulemarat.com', '57589', 'Dubai, UAE', 2, 4, 'Customer Relations', 'Official Department Contact', '600 522550', 'customerrelations@takafulemarat.com', 'CBUAE licensed insurance policy issuer. CBUAE register category: Takaful. CBUAE registration no: 086. Verified official website: http://www.takafulemarat.com. Product categories shown: takaful, health, life. Note: Active insurer.');
  INSERT INTO temp_enriched_insurers VALUES ('Insurance House', 'Insurance House PSC', '089', 'https://www.insurancehouse.ae', '600 511112', 'customerservice@insurancehouse.ae', '129921', 'Abu Dhabi, UAE', 1, 1, 'Customer Service', 'Official Department Contact', '600 511112', 'customerservice@insurancehouse.ae', 'CBUAE licensed insurance policy issuer. CBUAE register category: National. CBUAE registration no: 089. Verified official website: https://www.insurancehouse.ae. Product categories shown: motor, home, health, travel, corporate. Note: Active insurer.');
  INSERT INTO temp_enriched_insurers VALUES ('Dubai National Insurance', 'Dubai National Insurance & Reinsurance P.S.C', '064', 'https://www.dni.ae', '600 5 80000', 'info@dni.ae', '1806', '7th Floor, DNI House, Sheikh Zayed Road, Dubai, UAE', 2, 4, 'Customer Service', 'Official Department Contact', '600 5 80000', 'info@dni.ae', 'CBUAE licensed insurance policy issuer. CBUAE register category: National. CBUAE registration no: 064. Verified official website: https://www.dni.ae. Product categories shown: motor, medical, home, travel, group life, corporate. Note: Active insurer.');
  INSERT INTO temp_enriched_insurers VALUES ('Sukoon Insurance', 'Sukoon Insurance PJSC', '009', 'https://www.sukoon.com', '800 SUKOON (785666)', 'service@sukoon.com', '5209', 'Sukoon Building, Omar Bin Al Khattab Street, Next to Al Ghurair Mall, Deira, Dubai, UAE', 2, 4, 'Customer Service', 'Official Department Contact', '800 SUKOON (785666)', 'service@sukoon.com', 'CBUAE licensed insurance policy issuer. CBUAE register category: National. CBUAE registration no: 009. Verified official website: https://www.sukoon.com. Product categories shown: motor, medical, home, life, corporate. Note: Active insurer.');
  INSERT INTO temp_enriched_insurers VALUES ('ADNIC', 'Abu Dhabi National Insurance Company PJSC', '001', 'https://www.adnic.ae', '800 8040', 'info@adnic.ae', '839', 'Building No. 403, Khalifa Bin Zayed The First Street, Abu Dhabi, UAE', 1, 1, 'Customer Service', 'Official Department Contact', '800 8040', 'info@adnic.ae', 'CBUAE licensed insurance policy issuer. CBUAE register category: National. CBUAE registration no: 001. Verified official website: https://www.adnic.ae. Product categories shown: motor, medical, home, travel, commercial. Note: Active insurer.');
  INSERT INTO temp_enriched_insurers VALUES ('Abu Dhabi Takaful', 'Abu Dhabi National Takaful Company PSC', '071', 'https://www.takaful.ae', '800 2244', 'customer.service@takaful.ae', '35335', 'Tamouh Tower, 25th Floor, Marina Square, Al Reem Island, Abu Dhabi, UAE', 1, 1, 'Customer Service', 'Official Department Contact', '800 2244', 'customer.service@takaful.ae', 'CBUAE licensed insurance policy issuer. CBUAE register category: Takaful. CBUAE registration no: 071. Verified official website: https://www.takaful.ae. Product categories shown: takaful, motor, medical, family takaful, corporate. Note: Active insurer.');
  INSERT INTO temp_enriched_insurers VALUES ('Union Insurance', 'Union Insurance Company PSC', '067', 'https://www.unioninsurance.ae', '+971 4 3787 777', 'info@unioninsurance.ae', '119227', 'Single Business Tower, Sheikh Zayed Road, Dubai, UAE', 2, 4, 'Customer Service', 'Official Department Contact', '+971 4 3787 777', 'info@unioninsurance.ae', 'CBUAE licensed insurance policy issuer. CBUAE register category: National. CBUAE registration no: 067. Verified official website: https://www.unioninsurance.ae. Product categories shown: motor, health, home, travel, corporate. Note: Active insurer.');
  INSERT INTO temp_enriched_insurers VALUES ('Emirates Insurance', 'Emirates Insurance Company (PSC)', '002', 'https://www.eminsco.com', '800 98', 'info@eminsco.com', '3856', 'Abu Dhabi, UAE', 1, 1, 'Customer Service', 'Official Department Contact', '800 98', 'info@eminsco.com', 'CBUAE licensed insurance policy issuer. CBUAE register category: National. CBUAE registration no: 002. Verified official website: https://www.eminsco.com. Product categories shown: motor, medical, home, corporate. Note: Active insurer.');
  INSERT INTO temp_enriched_insurers VALUES ('Al Buhaira Insurance', 'Al Buhaira National Insurance Co PSC', '015', 'https://albuhaira.com', '06 517 4444', 'care@albuhaira.com', '6000', '6th Floor, Buhaira Insurance Towers, Khalid Lagoon, Buhaira Corniche, Sharjah, UAE', 3, 6, 'Customer Service', 'Official Department Contact', '06 517 4444', 'care@albuhaira.com', 'CBUAE licensed insurance policy issuer. CBUAE register category: National. CBUAE registration no: 015. Verified official website: https://albuhaira.com. Product categories shown: motor, medical, home, marine, engineering. Note: Active insurer.');
  INSERT INTO temp_enriched_insurers VALUES ('United Fidelity Insurance', 'United Fidelity Insurance Company PSC', '008', 'https://fidelityunited.ae', '800 842', 'customercare@fidelityunited.ae', '1888', 'The Opus Tower, Block B, Office B703, Business Bay, Dubai, UAE', 2, 4, 'Customer Care', 'Official Department Contact', '800 842', 'customercare@fidelityunited.ae', 'CBUAE licensed insurance policy issuer. CBUAE register category: National. CBUAE registration no: 008. Verified official website: https://fidelityunited.ae. Product categories shown: motor, medical, property, engineering, marine. Note: Active insurer.');
  INSERT INTO temp_enriched_insurers VALUES ('Sharjah Insurance', 'Sharjah Insurance Company (P.S.C)', '012', 'https://www.shjins.com', '06 519 5666', 'sico@shjins.com', '792', 'Al Boorj Building, Al Boorj Avenue (Bank Street), Rolla, Sharjah, UAE', 3, 6, 'Customer Service', 'Official Department Contact', '06 519 5666', 'sico@shjins.com', 'CBUAE licensed insurance policy issuer. CBUAE register category: National. CBUAE registration no: 012. Verified official website: https://www.shjins.com. Product categories shown: motor, property, marine, medical. Note: Active insurer.');
  INSERT INTO temp_enriched_insurers VALUES ('Al Sagr Insurance', 'Al Sagr National Insurance Co. (PSC)', '016', 'http://www.alsagrins.ae', '+971 4 702 8500', 'asnic@alsagrins.ae', '121828', 'Al Sagr Insurance Building, Diplomatic Area, Al Seef Road, Bur Dubai, Dubai, UAE', 2, 4, 'Customer Service', 'Official Department Contact', '+971 4 702 8500', 'asnic@alsagrins.ae', 'CBUAE licensed insurance policy issuer. CBUAE register category: National. CBUAE registration no: 016. Verified official website: http://www.alsagrins.ae. Product categories shown: motor, medical, home, sme, corporate. Note: Active insurer.');
  INSERT INTO temp_enriched_insurers VALUES ('Al Dhafra Insurance', 'Al Dhafra Insurance Company PSC', '005', 'http://www.aldhafrainsurance.ae', '+971 2 694 9444', 'info@aldhafrainsurance.ae', '319', 'Company Building, Zayed the First Street, Abu Dhabi, UAE', 1, 1, 'Customer Service', 'Official Department Contact', '+971 2 694 9444', 'info@aldhafrainsurance.ae', 'CBUAE licensed insurance policy issuer. CBUAE register category: National. CBUAE registration no: 005. Verified official website: http://www.aldhafrainsurance.ae. Product categories shown: motor, medical, property, marine, engineering. Note: Active insurer.');
  INSERT INTO temp_enriched_insurers VALUES ('Al Ain Ahlia Insurance', 'Al Ain Ahlia Insurance Company PSC', '003', 'https://www.alaininsurance.com', '+971 2 611 9999', 'info@alaininsurance.com', '3077', 'Al Ain Ahlia Insurance Co. Building, Airport Road, Abu Dhabi, UAE', 1, 1, 'Customer Service', 'Official Department Contact', '+971 2 611 9999', 'info@alaininsurance.com', 'CBUAE licensed insurance policy issuer. CBUAE register category: National. CBUAE registration no: 003. Verified official website: https://www.alaininsurance.com. Product categories shown: motor, medical, property, energy, marine. Note: Active insurer.');
  INSERT INTO temp_enriched_insurers VALUES ('Al Fujairah Insurance', 'Al Fujairah National Insurance Company PSC', '011', 'https://afnic.ae', '+971 9 223 3355', 'callcenter@fujinsco.ae', '277', '8th Floor, Insurance Building, Hamad Bin Abdullah St., Fujairah, UAE', 7, 14, 'Call Center', 'Official Department Contact', '+971 9 223 3355', 'callcenter@fujinsco.ae', 'CBUAE licensed insurance policy issuer. CBUAE register category: National. CBUAE registration no: 011. Verified official website: https://afnic.ae. Product categories shown: motor, medical, property, marine, sme. Note: Active insurer.');
  INSERT INTO temp_enriched_insurers VALUES ('Al Wathba Insurance', 'Al Wathba National Insurance Company PJSC', '010', 'https://awnic.com', '600 544 040', 'customercare@awnic.com', '45154', 'Al Wathba Tower, Mohammed Bin Butti Al Hamed St., Abu Dhabi, UAE', 1, 1, 'Customer Care', 'Official Department Contact', '600 544 040', 'customercare@awnic.com', 'CBUAE licensed insurance policy issuer. CBUAE register category: National. CBUAE registration no: 010. Verified official website: https://awnic.com. Product categories shown: motor, medical, home, travel, corporate. Note: Active insurer.');
  INSERT INTO temp_enriched_insurers VALUES ('Orient Takaful', 'Orient Takaful (PJSC)', '092', 'https://www.orienttakaful.ae', '+971 4 601 7500', 'CustomerCare@orienttakaful.ae', '183368', 'Al Futtaim Building, Deira, Dubai, UAE', 2, 4, 'Customer Care', 'Official Department Contact', '+971 4 601 7500', 'CustomerCare@orienttakaful.ae', 'CBUAE licensed insurance policy issuer. CBUAE register category: Takaful. CBUAE registration no: 092. Verified official website: https://www.orienttakaful.ae. Product categories shown: takaful, motor, medical, home, sme. Note: Active insurer.');
  INSERT INTO temp_enriched_insurers VALUES ('Orient Insurance', 'Orient Insurance Company PJSC', '014', 'https://www.insuranceuae.com', '+971 4 253 1300', 'orient@alfuttaim.ae', '27966', 'Orient Building, Al Badia Business Park, Dubai Festival City, Dubai, UAE', 2, 4, 'Customer Support', 'Official Department Contact', '+971 4 253 1300', 'orient@alfuttaim.ae', 'CBUAE licensed insurance policy issuer. CBUAE register category: National. CBUAE registration no: 014. Verified official website: https://www.insuranceuae.com. Product categories shown: motor, medical, home, travel, commercial. Note: Active insurer.');
  INSERT INTO temp_enriched_insurers VALUES ('HAYAH Insurance', 'HAYAH Insurance Company PJSC', '083', 'https://www.hayah.com', '800 42924', 'contact@hayah.com', '63323', 'Floor 16, Sheikh Sultan Bin Hamdan Building, Corniche Road, Abu Dhabi, UAE', 1, 1, 'Customer Support', 'Official Department Contact', '800 42924', 'contact@hayah.com', 'CBUAE licensed insurance policy issuer. CBUAE register category: National. CBUAE registration no: 083. Verified official website: https://www.hayah.com. Product categories shown: life, savings, medical. Note: Active insurer.');
  INSERT INTO temp_enriched_insurers VALUES ('Aman Insurance', 'Dubai Islamic Insurance & Reinsurance Co. (Aman) PSC', '070', 'https://www.aman.ae', '+971 4 319 3111', 'info@aman.ae', '157', 'Gulf Towers, Block B1, Mezzanine Floor, Oud Metha, Dubai, UAE', 2, 4, 'Customer Support', 'Official Department Contact', '+971 4 319 3111', 'info@aman.ae', 'CBUAE licensed insurance policy issuer. CBUAE register category: Takaful. CBUAE registration no: 070. Verified official website: https://www.aman.ae. Product categories shown: takaful, motor, medical, home, sme. Note: Transitioning to an investment holding company.');
  INSERT INTO temp_enriched_insurers VALUES ('Dubai Insurance', 'Dubai Insurance Company (PSC)', '004', 'https://www.dubins.ae', '800 DUBINS (382467)', 'info@dubins.ae', '3027', 'Head Office, Al Riqqa Road, Deira, Dubai, UAE', 2, 4, 'Customer Support', 'Official Department Contact', '800 DUBINS (382467)', 'info@dubins.ae', 'CBUAE licensed insurance policy issuer. CBUAE register category: National. CBUAE registration no: 004. Verified official website: https://www.dubins.ae. Product categories shown: motor, medical, home, marine, group life, corporate. Note: Active insurer.');
  INSERT INTO temp_enriched_insurers VALUES ('RAK Insurance', 'Ras Al Khaimah National Insurance Company P.S.C', '007', 'https://www.rakinsurance.com', '800 7254', 'info@rakinsurance.com', '506', '6th Floor, RAKBANK Headquarters, Sheikh Saqr Bin Mohammad Al Qasimi R/18, Ras Al Khaimah, UAE', 6, 12, 'Customer Support', 'Official Department Contact', '800 7254', 'info@rakinsurance.com', 'CBUAE licensed insurance policy issuer. CBUAE register category: National. CBUAE registration no: 007. Verified official website: https://www.rakinsurance.com. Product categories shown: motor, medical, home, travel, corporate. Note: Active insurer.');
  INSERT INTO temp_enriched_insurers VALUES ('Methaq Takaful', 'Methaq Takaful Insurance PSC', '082', 'https://www.methaq.ae', '600 565 695', 'info@methaq.ae', '32774', 'Liwa Tower, ADNEC Area, Abu Dhabi, UAE', 1, 1, 'Customer Support', 'Official Department Contact', '600 565 695', 'info@methaq.ae', 'CBUAE licensed insurance policy issuer. CBUAE register category: Takaful. CBUAE registration no: 082. Verified official website: https://www.methaq.ae. Product categories shown: takaful, motor, medical, home, sme. Note: Active insurer.');
  INSERT INTO temp_enriched_insurers VALUES ('Watania General Takaful', 'Watania Takaful General PJSC', '085', 'https://www.watania.ae', '800 928 2642', 'info@watania.ae', '48883', 'The Galleries, Building 2, Level 13, Downtown Jebel Ali, Dubai, UAE', 2, 4, 'Customer Support', 'Official Department Contact', '800 928 2642', 'info@watania.ae', 'CBUAE licensed insurance policy issuer. CBUAE register category: Takaful. CBUAE registration no: 085. Verified official website: https://www.watania.ae. Product categories shown: takaful, motor, medical, home, sme. Note: Active insurer.');
  INSERT INTO temp_enriched_insurers VALUES ('Watania Family Takaful', 'Watania Takaful Family Insurance Company PJSC', '078', 'https://www.watania.ae', '800 928 2642', 'info@watania.ae', '48883', 'The Galleries, Building 2, Level 13, Downtown Jebel Ali, Dubai, UAE', 2, 4, 'Customer Support', 'Official Department Contact', '800 928 2642', 'info@watania.ae', 'CBUAE licensed insurance policy issuer. CBUAE register category: Takaful. CBUAE registration no: 078. Verified official website: https://www.watania.ae. Product categories shown: takaful, family takaful, life, health. Note: Active family/life insurer.');

  -- Loop and enrich/insert
  FOR v_rec IN SELECT * FROM temp_enriched_insurers LOOP
    -- Search if party already exists (check both legal name and registration no in remarks)
    SELECT id INTO v_party_id 
    FROM public.parties 
    WHERE lower(legal_name_en) = lower(v_rec.legal_name_en)
       OR remarks LIKE '%CBUAE registration no: ' || v_rec.cbuae_reg_no || '%';

    IF FOUND THEN
      -- MODE A: Party already exists, enrich missing contact fields
      UPDATE public.parties
      SET
        main_phone = COALESCE(main_phone, v_rec.main_phone),
        main_email = COALESCE(main_email, v_rec.main_email),
        website = COALESCE(website, v_rec.official_website),
        po_box = COALESCE(po_box, v_rec.po_box),
        full_address_text = COALESCE(full_address_text, v_rec.full_address_text),
        emirate_id = COALESCE(emirate_id, v_rec.emirate_id),
        city_id = COALESCE(city_id, v_rec.city_id),
        remarks = v_rec.remarks,
        updated_at = now()
      WHERE id = v_party_id;

      v_update_party_cnt := v_update_party_cnt + 1;
    ELSE
      -- MODE B: Party does not exist, insert completely
      -- Generate sequential party code via numbering engine
      SELECT generated_reference_number INTO v_party_code
      FROM public.generate_next_reference_number(
        p_rule_code := 'MASTER_PARTY',
        p_document_type_code := 'PARTY',
        p_target_table_name := 'parties',
        p_generation_reason := 'Seed Enriched CBUAE Insurance Company'
      );

      -- Insert core party
      INSERT INTO public.parties (
        party_code,
        display_name,
        legal_name_en,
        party_nature_id,
        primary_party_type_id,
        country_id,
        party_status_id,
        is_active,
        main_phone,
        main_email,
        website,
        po_box,
        full_address_text,
        emirate_id,
        city_id,
        remarks,
        created_at,
        updated_at
      ) VALUES (
        v_party_code,
        v_rec.display_name,
        v_rec.legal_name_en,
        26, -- PLC
        54, -- INSURANCE_COMPANY
        1,  -- AE
        14, -- ACTIVE
        TRUE,
        v_rec.main_phone,
        v_rec.main_email,
        v_rec.official_website,
        v_rec.po_box,
        v_rec.full_address_text,
        v_rec.emirate_id,
        v_rec.city_id,
        v_rec.remarks,
        now(),
        now()
      ) RETURNING id INTO v_party_id;

      -- Insert party classification assignment (primary, active)
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

      v_insert_party_cnt := v_insert_party_cnt + 1;
    END IF;

    -- Address Child Table Seeding: Head Office Address
    -- Only create if a valid full address text is verified, and no primary active address exists
    IF v_rec.full_address_text IS NOT NULL THEN
      SELECT id INTO v_address_id 
      FROM public.party_addresses 
      WHERE party_id = v_party_id 
        AND is_primary = TRUE 
        AND is_active = TRUE;

      IF NOT FOUND THEN
        -- Generate sequential address code via numbering engine
        SELECT generated_reference_number INTO v_address_code
        FROM public.generate_next_reference_number(
          p_rule_code := 'MASTER_PARTY_ADDRESS',
          p_document_type_code := 'PARTY_ADDRESS',
          p_target_table_name := 'party_addresses',
          p_generation_reason := 'Seed Enriched CBUAE Insurance Company Address'
        );

        INSERT INTO public.party_addresses (
          address_code,
          party_id,
          address_type_id,
          address_name,
          country_id,
          emirate_id,
          city_id,
          po_box,
          full_address_text,
          is_primary,
          is_billing_address,
          is_shipping_address,
          is_site_address,
          is_active,
          notes,
          created_at,
          updated_at
        ) VALUES (
          v_address_code,
          v_party_id,
          18, -- HEAD_OFFICE
          'Head Office',
          1,  -- AE
          v_rec.emirate_id,
          v_rec.city_id,
          v_rec.po_box,
          v_rec.full_address_text,
          TRUE,
          TRUE,
          FALSE,
          FALSE,
          TRUE,
          'Seeded via official contact enrichment script.',
          now(),
          now()
        );

        v_insert_addr_cnt := v_insert_addr_cnt + 1;
      END IF;
    END IF;

    -- Contact Child Table Seeding: Official Department Contact
    -- Only create if a valid contact email/phone is verified, and no primary active contact exists
    IF v_rec.contact_name IS NOT NULL THEN
      SELECT id INTO v_contact_id 
      FROM public.party_contacts 
      WHERE party_id = v_party_id 
        AND is_primary = TRUE 
        AND is_active = TRUE;

      IF NOT FOUND THEN
        -- Generate sequential contact code via numbering engine
        SELECT generated_reference_number INTO v_contact_code
        FROM public.generate_next_reference_number(
          p_rule_code := 'MASTER_PARTY_CONTACT',
          p_document_type_code := 'PARTY_CONTACT',
          p_target_table_name := 'party_contacts',
          p_generation_reason := 'Seed Enriched CBUAE Insurance Company Contact'
        );

        INSERT INTO public.party_contacts (
          contact_code,
          party_id,
          full_name,
          designation,
          department_id,
          contact_role_id,
          email,
          phone,
          is_primary,
          is_accounts_contact,
          is_sales_contact,
          is_operations_contact,
          is_hse_contact,
          is_documents_contact,
          is_active,
          notes,
          created_at,
          updated_at
        ) VALUES (
          v_contact_code,
          v_party_id,
          v_rec.contact_name,
          v_rec.contact_designation,
          28, -- OPERATIONS department
          22, -- OPERATIONS role
          v_rec.contact_email,
          v_rec.contact_phone,
          TRUE,
          FALSE,
          FALSE,
          TRUE,
          FALSE,
          FALSE,
          TRUE,
          'Seeded via official contact enrichment script.',
          now(),
          now()
        );

        v_insert_cont_cnt := v_insert_cont_cnt + 1;
      END IF;
    END IF;

  END LOOP;

  RAISE NOTICE 'Enrichment Summary: % parties inserted, % parties updated, % addresses seeded, % contacts seeded.', 
    v_insert_party_cnt, v_update_party_cnt, v_insert_addr_cnt, v_insert_cont_cnt;
END $$;


-- ── 3. FINAL ENRICHMENT VERIFICATION SUMMARY ─────────────────────────────────
SELECT 
  p.id AS party_id,
  p.party_code,
  p.display_name,
  p.legal_name_en,
  p.main_phone,
  p.main_email,
  p.website,
  p.po_box,
  pa.full_address_text AS head_office_address,
  pc.full_name AS primary_contact_name,
  pc.email AS primary_contact_email
FROM public.parties p
LEFT JOIN public.party_addresses pa ON p.id = pa.party_id AND pa.is_primary = TRUE AND pa.is_active = TRUE
LEFT JOIN public.party_contacts pc ON p.id = pc.party_id AND pc.is_primary = TRUE AND pc.is_active = TRUE
WHERE p.remarks LIKE 'CBUAE licensed insurance policy issuer.%'
ORDER BY p.party_code;

COMMIT;


-- ── 4. COMMENTED ROLLBACK SECTION ───────────────────────────────────────────
-- To rollback ONLY the changes made by this enrichment script, uncomment and run:
/*
BEGIN;

-- 1. Remove child contacts created by this enrichment
DELETE FROM public.party_contacts
WHERE notes = 'Seeded via official contact enrichment script.'
  AND party_id IN (
    SELECT id FROM public.parties WHERE remarks LIKE 'CBUAE licensed insurance policy issuer.%'
  );

-- 2. Remove child addresses created by this enrichment
DELETE FROM public.party_addresses
WHERE notes = 'Seeded via official contact enrichment script.'
  AND party_id IN (
    SELECT id FROM public.parties WHERE remarks LIKE 'CBUAE licensed insurance policy issuer.%'
  );

-- 3. Clear only the enriched fields in parties that were seeded by this script
-- Note: This resets the fields to NULL if they match the seeded values
UPDATE public.parties
SET
  main_phone = NULL,
  main_email = NULL,
  website = NULL,
  po_box = NULL,
  full_address_text = NULL,
  emirate_id = NULL,
  city_id = NULL,
  updated_at = now()
WHERE remarks LIKE 'CBUAE licensed insurance policy issuer.%'
  AND (created_at >= now() - INTERVAL '1 hour' OR updated_at >= now() - INTERVAL '1 hour');

-- 4. Delete the parties that were newly created by this script (if any)
-- This checks if they were created within the same batch (using remarks registration numbers)
DELETE FROM public.party_type_assignments
WHERE party_type_id = 54
  AND party_id IN (
    SELECT id FROM public.parties 
    WHERE remarks LIKE 'CBUAE licensed insurance policy issuer. CBUAE register category:%'
      AND created_at >= now() - INTERVAL '1 hour'
  );

DELETE FROM public.parties
WHERE remarks LIKE 'CBUAE licensed insurance policy issuer. CBUAE register category:%'
  AND created_at >= now() - INTERVAL '1 hour';

COMMIT;
*/
