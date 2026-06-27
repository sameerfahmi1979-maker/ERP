-- ============================================================================
-- ERP DMS AI Phase 16 Tier 2 — Party Licenses and Tax Registration Write-back
-- ============================================================================
--
-- Changes:
--   1. Extend dms_ai_erp_apply_runs.target_module CHECK to include 'party'
--   2. Seed 3 new feature flags (all default false)
--   3. No new tables (reuses Tier 1 dms_ai_erp_apply_runs + dms_ai_erp_apply_items)
--   4. No Party table alterations
--   5. No new permissions (master_data.parties.manage_licenses and manage_tax already exist)
--
-- Safety:
--   All new flags default false — must be enabled explicitly for UAT/production use.
--   Party write-back still requires: master flag + party gate + specific sub-flag.
--   Additive and idempotent.
-- ============================================================================

-- ── 1. Extend target_module CHECK on dms_ai_erp_apply_runs ───────────────────
--
-- Current:  CHECK (target_module = ANY (ARRAY['dms_document','dms_metadata']))
-- New:      CHECK (target_module = ANY (ARRAY['dms_document','dms_metadata','party']))
--
-- Constraint name: dms_ai_erp_apply_runs_target_module_check

ALTER TABLE public.dms_ai_erp_apply_runs
  DROP CONSTRAINT IF EXISTS dms_ai_erp_apply_runs_target_module_check;

ALTER TABLE public.dms_ai_erp_apply_runs
  ADD CONSTRAINT dms_ai_erp_apply_runs_target_module_check
  CHECK (target_module IN ('dms_document', 'dms_metadata', 'party'));

COMMENT ON CONSTRAINT dms_ai_erp_apply_runs_target_module_check
  ON public.dms_ai_erp_apply_runs
  IS 'Tier 1: dms_document, dms_metadata. Tier 2: party (party_licenses, party_tax_registrations).';

-- ── 2. Seed Tier 2 feature flags (all default false) ─────────────────────────

INSERT INTO erp_ai_feature_flags (feature_code, feature_name, description, is_enabled, created_at, updated_at)
VALUES
  (
    'DMS_AI_APPLY_TO_ERP_PARTY',
    'Apply to ERP: Party (Master Sub-Gate)',
    'Tier 2 master sub-gate for all Party write-back. Requires DMS_AI_APPLY_TO_ERP=true. Controls visibility of Party Apply section in Review Queue and Document AI tab.',
    false,
    NOW(),
    NOW()
  ),
  (
    'DMS_AI_APPLY_TO_ERP_PARTY_LICENSES',
    'Apply to ERP: Party Licenses',
    'Enables write-back to party_licenses fields (license_number, license_name, license_activity_text, issue_date, expiry_date, remarks). Requires DMS_AI_APPLY_TO_ERP=true AND DMS_AI_APPLY_TO_ERP_PARTY=true.',
    false,
    NOW(),
    NOW()
  ),
  (
    'DMS_AI_APPLY_TO_ERP_PARTY_TAX',
    'Apply to ERP: Party Tax Registrations',
    'Enables write-back to party_tax_registrations fields (tax_registration_number, effective_from, effective_to, remarks). Requires DMS_AI_APPLY_TO_ERP=true AND DMS_AI_APPLY_TO_ERP_PARTY=true.',
    false,
    NOW(),
    NOW()
  )
ON CONFLICT (feature_code) DO NOTHING;

-- ── 3. Verify permissions exist (informational; do not re-seed if present) ───
--
-- The following permissions are already seeded from Party Master:
--   master_data.parties.manage_licenses
--   master_data.parties.manage_tax
--   master_data.parties.edit
--   master_data.parties.view
--
-- No new permissions needed for Phase 16 Tier 2.

-- ── End of migration ─────────────────────────────────────────────────────────
