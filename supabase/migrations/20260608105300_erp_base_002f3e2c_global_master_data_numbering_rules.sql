-- ============================================================================
-- ERP BASE 002F.3E.2C — Global Master Data Numbering Rules
-- ============================================================================
-- Phase: ERP BASE 002F.3E.2C
-- Purpose: Add automatic numbering rules for party master data entities
-- Migration Type: Additive (INSERT/UPDATE only, no DROP/DELETE/TRUNCATE)
-- Safety: Idempotent using ON CONFLICT DO UPDATE
-- Date: 2026-06-08 10:53:00 UTC+4
-- ============================================================================
--
-- This migration adds 6 numbering rules for party master data:
-- - MASTER_CUSTOMER → CUSTOMER → CUST-000001
-- - MASTER_VENDOR → VENDOR → VEND-000001
-- - MASTER_SUBCONTRACTOR → SUBCONTRACTOR → SUBC-000001
-- - MASTER_CONSULTANT → CONSULTANT → CONS-000001
-- - MASTER_AUTHORITY → GOVERNMENT_AUTHORITY → AUTH-000001
-- - MASTER_AGENCY → RECRUITMENT_AGENCY → AGCY-000001
--
-- All rules use 6-digit sequence padding ({DOC}-{SEQ6})
-- Format: PREFIX-000001
-- No company/branch/year/month segmentation
-- No manual override, gaps allowed, never reset
--
-- ============================================================================

-- Verify numbering infrastructure exists before proceeding
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'global_numbering_rules') THEN
    RAISE EXCEPTION 'global_numbering_rules table does not exist. Cannot proceed with migration.';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'generate_next_reference_number') THEN
    RAISE EXCEPTION 'generate_next_reference_number function does not exist. Cannot proceed with migration.';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'preview_next_reference_number') THEN
    RAISE EXCEPTION 'preview_next_reference_number function does not exist. Cannot proceed with migration.';
  END IF;
END $$;

-- ============================================================================
-- Insert/Update Party Master Numbering Rules
-- ============================================================================

-- Rule 1: MASTER_CUSTOMER → CUSTOMER → CUST-000001
INSERT INTO global_numbering_rules (
  rule_code,
  rule_name,
  description,
  module_code,
  module_name,
  document_type_code,
  document_type_name,
  document_prefix,
  separator,
  format_template,
  sequence_length,
  padding_character,
  starting_sequence_number,
  current_sequence_number,
  next_sequence_number,
  reset_policy,
  reserve_on_draft,
  reserve_on_submit,
  allow_manual_override,
  manual_override_requires_permission,
  allow_gaps,
  cancelled_number_policy,
  duplicate_prevention_scope,
  is_active,
  is_locked,
  notes
) VALUES (
  'MASTER_CUSTOMER',
  'Customer Reference Number',
  'Automatic numbering for customer master records',
  'MASTER_DATA',
  'Master Data',
  'CUSTOMER',
  'Customer',
  'CUST',
  '-',
  '{DOC}-{SEQ6}',
  6,
  '0',
  1,
  0,
  1,
  'never',
  false,
  true,
  false,
  true,
  true,
  'never_reuse',
  'document_type',
  true,
  false,
  'Automatically generated customer codes starting from CUST-000001'
) ON CONFLICT (rule_code) DO UPDATE SET
  rule_name = EXCLUDED.rule_name,
  description = EXCLUDED.description,
  module_code = EXCLUDED.module_code,
  module_name = EXCLUDED.module_name,
  document_type_code = EXCLUDED.document_type_code,
  document_type_name = EXCLUDED.document_type_name,
  document_prefix = EXCLUDED.document_prefix,
  separator = EXCLUDED.separator,
  format_template = EXCLUDED.format_template,
  sequence_length = EXCLUDED.sequence_length,
  padding_character = EXCLUDED.padding_character,
  notes = EXCLUDED.notes,
  updated_at = now();

-- Rule 2: MASTER_VENDOR → VENDOR → VEND-000001
INSERT INTO global_numbering_rules (
  rule_code,
  rule_name,
  description,
  module_code,
  module_name,
  document_type_code,
  document_type_name,
  document_prefix,
  separator,
  format_template,
  sequence_length,
  padding_character,
  starting_sequence_number,
  current_sequence_number,
  next_sequence_number,
  reset_policy,
  reserve_on_draft,
  reserve_on_submit,
  allow_manual_override,
  manual_override_requires_permission,
  allow_gaps,
  cancelled_number_policy,
  duplicate_prevention_scope,
  is_active,
  is_locked,
  notes
) VALUES (
  'MASTER_VENDOR',
  'Vendor Reference Number',
  'Automatic numbering for vendor master records',
  'MASTER_DATA',
  'Master Data',
  'VENDOR',
  'Vendor',
  'VEND',
  '-',
  '{DOC}-{SEQ6}',
  6,
  '0',
  1,
  0,
  1,
  'never',
  false,
  true,
  false,
  true,
  true,
  'never_reuse',
  'document_type',
  true,
  false,
  'Automatically generated vendor codes starting from VEND-000001'
) ON CONFLICT (rule_code) DO UPDATE SET
  rule_name = EXCLUDED.rule_name,
  description = EXCLUDED.description,
  module_code = EXCLUDED.module_code,
  module_name = EXCLUDED.module_name,
  document_type_code = EXCLUDED.document_type_code,
  document_type_name = EXCLUDED.document_type_name,
  document_prefix = EXCLUDED.document_prefix,
  separator = EXCLUDED.separator,
  format_template = EXCLUDED.format_template,
  sequence_length = EXCLUDED.sequence_length,
  padding_character = EXCLUDED.padding_character,
  notes = EXCLUDED.notes,
  updated_at = now();

-- Rule 3: MASTER_SUBCONTRACTOR → SUBCONTRACTOR → SUBC-000001
INSERT INTO global_numbering_rules (
  rule_code,
  rule_name,
  description,
  module_code,
  module_name,
  document_type_code,
  document_type_name,
  document_prefix,
  separator,
  format_template,
  sequence_length,
  padding_character,
  starting_sequence_number,
  current_sequence_number,
  next_sequence_number,
  reset_policy,
  reserve_on_draft,
  reserve_on_submit,
  allow_manual_override,
  manual_override_requires_permission,
  allow_gaps,
  cancelled_number_policy,
  duplicate_prevention_scope,
  is_active,
  is_locked,
  notes
) VALUES (
  'MASTER_SUBCONTRACTOR',
  'Subcontractor Reference Number',
  'Automatic numbering for subcontractor master records',
  'MASTER_DATA',
  'Master Data',
  'SUBCONTRACTOR',
  'Subcontractor',
  'SUBC',
  '-',
  '{DOC}-{SEQ6}',
  6,
  '0',
  1,
  0,
  1,
  'never',
  false,
  true,
  false,
  true,
  true,
  'never_reuse',
  'document_type',
  true,
  false,
  'Automatically generated subcontractor codes starting from SUBC-000001'
) ON CONFLICT (rule_code) DO UPDATE SET
  rule_name = EXCLUDED.rule_name,
  description = EXCLUDED.description,
  module_code = EXCLUDED.module_code,
  module_name = EXCLUDED.module_name,
  document_type_code = EXCLUDED.document_type_code,
  document_type_name = EXCLUDED.document_type_name,
  document_prefix = EXCLUDED.document_prefix,
  separator = EXCLUDED.separator,
  format_template = EXCLUDED.format_template,
  sequence_length = EXCLUDED.sequence_length,
  padding_character = EXCLUDED.padding_character,
  notes = EXCLUDED.notes,
  updated_at = now();

-- Rule 4: MASTER_CONSULTANT → CONSULTANT → CONS-000001
INSERT INTO global_numbering_rules (
  rule_code,
  rule_name,
  description,
  module_code,
  module_name,
  document_type_code,
  document_type_name,
  document_prefix,
  separator,
  format_template,
  sequence_length,
  padding_character,
  starting_sequence_number,
  current_sequence_number,
  next_sequence_number,
  reset_policy,
  reserve_on_draft,
  reserve_on_submit,
  allow_manual_override,
  manual_override_requires_permission,
  allow_gaps,
  cancelled_number_policy,
  duplicate_prevention_scope,
  is_active,
  is_locked,
  notes
) VALUES (
  'MASTER_CONSULTANT',
  'Consultant Reference Number',
  'Automatic numbering for consultant master records',
  'MASTER_DATA',
  'Master Data',
  'CONSULTANT',
  'Consultant',
  'CONS',
  '-',
  '{DOC}-{SEQ6}',
  6,
  '0',
  1,
  0,
  1,
  'never',
  false,
  true,
  false,
  true,
  true,
  'never_reuse',
  'document_type',
  true,
  false,
  'Automatically generated consultant codes starting from CONS-000001'
) ON CONFLICT (rule_code) DO UPDATE SET
  rule_name = EXCLUDED.rule_name,
  description = EXCLUDED.description,
  module_code = EXCLUDED.module_code,
  module_name = EXCLUDED.module_name,
  document_type_code = EXCLUDED.document_type_code,
  document_type_name = EXCLUDED.document_type_name,
  document_prefix = EXCLUDED.document_prefix,
  separator = EXCLUDED.separator,
  format_template = EXCLUDED.format_template,
  sequence_length = EXCLUDED.sequence_length,
  padding_character = EXCLUDED.padding_character,
  notes = EXCLUDED.notes,
  updated_at = now();

-- Rule 5: MASTER_AUTHORITY → GOVERNMENT_AUTHORITY → AUTH-000001
INSERT INTO global_numbering_rules (
  rule_code,
  rule_name,
  description,
  module_code,
  module_name,
  document_type_code,
  document_type_name,
  document_prefix,
  separator,
  format_template,
  sequence_length,
  padding_character,
  starting_sequence_number,
  current_sequence_number,
  next_sequence_number,
  reset_policy,
  reserve_on_draft,
  reserve_on_submit,
  allow_manual_override,
  manual_override_requires_permission,
  allow_gaps,
  cancelled_number_policy,
  duplicate_prevention_scope,
  is_active,
  is_locked,
  notes
) VALUES (
  'MASTER_AUTHORITY',
  'Government Authority Reference Number',
  'Automatic numbering for government authority master records',
  'MASTER_DATA',
  'Master Data',
  'GOVERNMENT_AUTHORITY',
  'Government Authority',
  'AUTH',
  '-',
  '{DOC}-{SEQ6}',
  6,
  '0',
  1,
  0,
  1,
  'never',
  false,
  true,
  false,
  true,
  true,
  'never_reuse',
  'document_type',
  true,
  false,
  'Automatically generated government authority codes starting from AUTH-000001'
) ON CONFLICT (rule_code) DO UPDATE SET
  rule_name = EXCLUDED.rule_name,
  description = EXCLUDED.description,
  module_code = EXCLUDED.module_code,
  module_name = EXCLUDED.module_name,
  document_type_code = EXCLUDED.document_type_code,
  document_type_name = EXCLUDED.document_type_name,
  document_prefix = EXCLUDED.document_prefix,
  separator = EXCLUDED.separator,
  format_template = EXCLUDED.format_template,
  sequence_length = EXCLUDED.sequence_length,
  padding_character = EXCLUDED.padding_character,
  notes = EXCLUDED.notes,
  updated_at = now();

-- Rule 6: MASTER_AGENCY → RECRUITMENT_AGENCY → AGCY-000001
INSERT INTO global_numbering_rules (
  rule_code,
  rule_name,
  description,
  module_code,
  module_name,
  document_type_code,
  document_type_name,
  document_prefix,
  separator,
  format_template,
  sequence_length,
  padding_character,
  starting_sequence_number,
  current_sequence_number,
  next_sequence_number,
  reset_policy,
  reserve_on_draft,
  reserve_on_submit,
  allow_manual_override,
  manual_override_requires_permission,
  allow_gaps,
  cancelled_number_policy,
  duplicate_prevention_scope,
  is_active,
  is_locked,
  notes
) VALUES (
  'MASTER_AGENCY',
  'Recruitment Agency Reference Number',
  'Automatic numbering for recruitment agency master records',
  'MASTER_DATA',
  'Master Data',
  'RECRUITMENT_AGENCY',
  'Recruitment Agency',
  'AGCY',
  '-',
  '{DOC}-{SEQ6}',
  6,
  '0',
  1,
  0,
  1,
  'never',
  false,
  true,
  false,
  true,
  true,
  'never_reuse',
  'document_type',
  true,
  false,
  'Automatically generated recruitment agency codes starting from AGCY-000001'
) ON CONFLICT (rule_code) DO UPDATE SET
  rule_name = EXCLUDED.rule_name,
  description = EXCLUDED.description,
  module_code = EXCLUDED.module_code,
  module_name = EXCLUDED.module_name,
  document_type_code = EXCLUDED.document_type_code,
  document_type_name = EXCLUDED.document_type_name,
  document_prefix = EXCLUDED.document_prefix,
  separator = EXCLUDED.separator,
  format_template = EXCLUDED.format_template,
  sequence_length = EXCLUDED.sequence_length,
  padding_character = EXCLUDED.padding_character,
  notes = EXCLUDED.notes,
  updated_at = now();

-- ============================================================================
-- Verification: Confirm all 6 rules were created/updated
-- ============================================================================

DO $$
DECLARE
  v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM global_numbering_rules
  WHERE rule_code IN (
    'MASTER_CUSTOMER',
    'MASTER_VENDOR',
    'MASTER_SUBCONTRACTOR',
    'MASTER_CONSULTANT',
    'MASTER_AUTHORITY',
    'MASTER_AGENCY'
  );
  
  IF v_count <> 6 THEN
    RAISE EXCEPTION 'Migration verification failed: Expected 6 party master numbering rules, found %', v_count;
  END IF;
  
  RAISE NOTICE 'Migration verification successful: All 6 party master numbering rules exist';
END $$;

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
