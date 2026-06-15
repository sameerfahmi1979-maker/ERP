-- ============================================================================
-- ERP BASE 002F.2B — Add Internal Reference Numbers for Organization/Branch
-- ============================================================================
-- Created: 2026-06-04
-- Purpose: Add optional internal reference number fields to owner_companies and branches
-- Rationale:
--   - company_code remains the user-facing business abbreviation (ALGT, ALS, PGI)
--   - branch_code remains the user-facing location abbreviation (AUH, DXB, SHJ)
--   - internal_reference_number provides optional system-level tracking (ORG-0001, BR-0001)
--   - Generated via Global Numbering Engine when users click "Generate Reference"
-- ============================================================================

-- ============================================================================
-- ADD INTERNAL_REFERENCE_NUMBER TO OWNER_COMPANIES
-- ============================================================================

alter table public.owner_companies 
  add column if not exists internal_reference_number text unique;

comment on column public.owner_companies.internal_reference_number is 
  'Optional system-generated reference (ORG-0001, ORG-0002). Distinct from company_code which is user-facing business abbreviation (ALGT, ALS, PGI).';

-- Index for performance
create index if not exists idx_owner_companies_internal_ref on public.owner_companies(internal_reference_number);

-- ============================================================================
-- ADD INTERNAL_REFERENCE_NUMBER TO BRANCHES
-- ============================================================================

alter table public.branches 
  add column if not exists internal_reference_number text unique;

comment on column public.branches.internal_reference_number is 
  'Optional system-generated reference (BR-0001, BR-0002). Distinct from branch_code which is user-facing location abbreviation (AUH, DXB, SHJ).';

-- Index for performance
create index if not exists idx_branches_internal_ref on public.branches(internal_reference_number);

-- ============================================================================
-- ADD GLOBAL NUMBERING RULES FOR ORGANIZATION AND BRANCH
-- ============================================================================

-- Rule for Owner Company Internal Reference
insert into public.global_numbering_rules (
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
) values (
  'MASTER_OWNER_COMPANY',
  'Owner Company Internal Reference',
  'System-generated internal reference for owner company master records. Distinct from company_code which is the user-facing business abbreviation.',
  'MASTER_DATA',
  'Master Data',
  'OWNER_COMPANY',
  'Owner Company',
  'ORG',
  '-',
  '{DOC}-{SEQ4}',
  4,
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
  'Internal reference for organization/owner company records. Generated on demand via "Generate Reference" button in the UI. Example: ORG-0001, ORG-0002.'
) on conflict (rule_code) do nothing;

-- Rule for Branch Internal Reference
insert into public.global_numbering_rules (
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
) values (
  'MASTER_BRANCH',
  'Branch Internal Reference',
  'System-generated internal reference for branch master records. Distinct from branch_code which is the user-facing location abbreviation.',
  'MASTER_DATA',
  'Master Data',
  'BRANCH',
  'Branch',
  'BR',
  '-',
  '{DOC}-{SEQ4}',
  4,
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
  'Internal reference for branch records. Generated on demand via "Generate Reference" button in the UI. Example: BR-0001, BR-0002.'
) on conflict (rule_code) do nothing;

-- ============================================================================
-- VERIFICATION COMMENTS
-- ============================================================================

-- These fields are optional and nullable
-- Existing records will have null internal_reference_number
-- New records can optionally have internal_reference_number generated
-- company_code and branch_code remain mandatory and user-facing
-- No data migration/backfill required — references generated on demand only
