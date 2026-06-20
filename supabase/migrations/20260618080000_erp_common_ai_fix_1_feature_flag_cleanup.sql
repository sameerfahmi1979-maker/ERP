-- ERP COMMON AI FIX.1 — Feature Flag State Cleanup
-- 2026-06-18
--
-- Cleans up feature flag states that drifted from their documented defaults during
-- testing/UAT sessions. Disables orphan and legacy flags; enables the correct
-- ERP_AI_DATA_QUALITY_MONITOR flag now that the F-001 audit bug is fixed.
--
-- Flags set to FALSE (disable):
--   ERP_AI_FORM_FILL         — SOT: "enable only for UAT by Sameer"; accidental drift
--   ERP_AI_ACTIONS           — SOT: "ERP_AI_ACTIONS=false remains disabled" (AI.7)
--   ERP_AI_ERP_SEARCH        — Orphan flag; code uses AI_SEARCH instead
--   ERP_AI_DAILY_BRIEF       — Orphan flag; no code in src/ references it
--   ERP_AI_DATA_QUALITY      — Legacy flag superseded by ERP_AI_DATA_QUALITY_MONITOR
--
-- Flags set to TRUE (enable):
--   ERP_AI_DATA_QUALITY_MONITOR — New flag for AI.15; was false; F-001 now fixed

UPDATE erp_ai_feature_flags
SET is_enabled = false,
    updated_at = NOW()
WHERE feature_code IN (
  'ERP_AI_FORM_FILL',
  'ERP_AI_ACTIONS',
  'ERP_AI_ERP_SEARCH',
  'ERP_AI_DAILY_BRIEF',
  'ERP_AI_DATA_QUALITY'
);

UPDATE erp_ai_feature_flags
SET is_enabled = true,
    updated_at = NOW()
WHERE feature_code = 'ERP_AI_DATA_QUALITY_MONITOR';
