-- Migration: Add Customer Contact Numbering Rule
-- Phase: ERP BASE 002F.3E.3A (Customer Contacts Auto-Numbering)
-- Date: 2026-06-08
-- Description: Add numbering rule for customer_contacts.contact_code

-- Insert Customer Contact Numbering Rule
INSERT INTO public.global_numbering_rules (
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
  effective_from,
  notes
)
VALUES (
  'MASTER_CUSTOMER_CONTACT',
  'Customer Contact Code',
  'Auto-generates unique codes for customer contacts',
  'master_data',
  'Master Data',
  'CUSTOMER_CONTACT',
  'Customer Contact',
  'CONT',
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
  CURRENT_DATE,
  'Auto-generates customer contact codes in format CONT-000001'
)
ON CONFLICT (rule_code) DO UPDATE SET
  rule_name = EXCLUDED.rule_name,
  description = EXCLUDED.description,
  document_type_code = EXCLUDED.document_type_code,
  document_prefix = EXCLUDED.document_prefix,
  format_template = EXCLUDED.format_template,
  notes = EXCLUDED.notes,
  updated_at = CURRENT_TIMESTAMP;
