-- ─────────────────────────────────────────────────────────────────────────────
-- HR.14A — Employee Creation from Existing DMS Documents
-- Feature flag: ERP_AI_HR_DOCUMENT_TO_EMPLOYEE
-- ─────────────────────────────────────────────────────────────────────────────

-- Insert feature flag (idempotent via ON CONFLICT DO NOTHING)
INSERT INTO public.erp_ai_feature_flags (
  feature_code, feature_name, description,
  is_enabled, requires_human_review, min_confidence_threshold
)
VALUES (
  'ERP_AI_HR_DOCUMENT_TO_EMPLOYEE',
  'HR Document-to-Employee Wizard',
  'Enables the "Add from Documents" wizard on the HR Employees page. Reads existing DMS OCR/AI extraction results to suggest employee core fields and compliance child records. Human review is mandatory before any data is saved.',
  false,
  true,
  0.70
)
ON CONFLICT (feature_code) DO NOTHING;
