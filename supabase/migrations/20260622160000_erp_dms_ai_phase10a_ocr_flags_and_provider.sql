-- =============================================================================
-- ERP DMS AI Phase 10A — OCR Pipeline Upgrade / Azure OCR Wiring
-- Migration: feature flags + Azure Document Intelligence provider config
-- Date: 2026-06-22
-- Scope: Seed OCR routing feature flags and ARABIC_OCR_AZURE provider config row
-- Does NOT enable any new OCR behavior by default (all flags off except fallback)
-- =============================================================================

-- =============================================================================
-- SECTION 1: OCR Feature Flags
-- =============================================================================
-- DMS_OCR already exists (is_enabled=true). We add the three new routing flags.
-- All new flags default to safe values that preserve existing behavior:
--   DMS_OCR_ROUTER=false       → old GPT-only path still used
--   DMS_OCR_AZURE=false        → Azure not used until admin enables
--   DMS_OCR_GPT_VISION_FALLBACK=true → GPT remains available as fallback

INSERT INTO public.erp_ai_feature_flags (
  feature_code,
  feature_name,
  description,
  is_enabled,
  requires_human_review,
  min_confidence_threshold
) VALUES
  (
    'DMS_OCR_ROUTER',
    'DMS OCR Router (Phase 10A)',
    'Enables the three-tier OCR router: digital PDF text-layer → Azure DI → GPT vision fallback. '
    'When false (default), all files go to GPT-4.1 vision as before Phase 10A. '
    'Enable after UAT confirms text-layer fast path works correctly.',
    false,
    false,
    0.000
  ),
  (
    'DMS_OCR_AZURE',
    'DMS Azure Document Intelligence OCR',
    'When true and DMS_OCR_ROUTER=true, uses Azure Document Intelligence (prebuilt-read) '
    'for scanned PDFs and images. Requires ARABIC_OCR_AZURE provider config to be enabled '
    'and AZURE_DOCUMENT_INTELLIGENCE_KEY env var to be set.',
    false,
    false,
    0.000
  ),
  (
    'DMS_OCR_GPT_VISION_FALLBACK',
    'DMS OCR GPT-4.1 Vision Fallback',
    'When true (default), GPT-4.1 vision is used as a fallback when Azure DI is disabled '
    'or fails. When false, OCR will fail if Azure is the only configured provider and it fails. '
    'Should remain true unless cost controls require disabling the fallback.',
    true,
    false,
    0.000
  )
ON CONFLICT (feature_code) DO UPDATE SET
  feature_name       = EXCLUDED.feature_name,
  description        = EXCLUDED.description,
  updated_at         = now();
-- Note: is_enabled is intentionally NOT updated on conflict to preserve admin overrides.

-- =============================================================================
-- SECTION 2: Azure Document Intelligence Provider Config
-- =============================================================================
-- Inserts the ARABIC_OCR_AZURE provider config row if it does not already exist.
-- The factory function getAzureDocumentIntelligenceProvider() already checks for
-- this config_code. This row wires it into the live erp_ai_provider_configs table.
--
-- Admin must:
--   1. Set api_endpoint to their Azure DI resource URL
--   2. Set AZURE_DOCUMENT_INTELLIGENCE_KEY environment variable
--   3. Set is_enabled=true when ready to use

INSERT INTO public.erp_ai_provider_configs (
  config_code,
  provider_type,
  provider_name,
  purpose,
  model_id,
  api_endpoint,
  api_version,
  secret_ref,
  is_enabled,
  is_active,
  requires_human_review,
  confidence_threshold,
  notes
) VALUES (
  'ARABIC_OCR_AZURE',
  'azure_document_intelligence',
  'Azure Document Intelligence (OCR)',
  'DMS document OCR — scanned PDFs, images, Arabic documents. Used by Phase 10A OCR router '
  'when DMS_OCR_AZURE=true. Falls back to GPT-4.1 vision when disabled or fails.',
  'prebuilt-read',
  NULL,           -- Admin must set: https://<region>.cognitiveservices.azure.com
  '2024-11-30',
  'AZURE_DOCUMENT_INTELLIGENCE_KEY',   -- env var name — API key must NOT be in DB
  false,          -- disabled until admin configures endpoint and sets env var
  true,
  true,
  0.000,
  'Phase 10A: Set api_endpoint to your Azure Document Intelligence resource URL. '
  'Set AZURE_DOCUMENT_INTELLIGENCE_KEY env var (not stored in DB). '
  'Enable is_enabled=true when ready. Supports Arabic/bilingual documents via prebuilt-read model.'
)
ON CONFLICT (config_code) DO NOTHING;
-- Do nothing on conflict: admin may have already configured endpoint/key via UI.
