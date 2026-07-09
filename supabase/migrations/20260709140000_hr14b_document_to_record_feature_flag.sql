-- HR.14B — Feature flag: ERP_AI_HR_DOCUMENT_TO_RECORD
-- Date: 2026-07-09

INSERT INTO erp_ai_feature_flags (
  feature_code,
  feature_name,
  description,
  is_enabled,
  requires_human_review
)
VALUES (
  'ERP_AI_HR_DOCUMENT_TO_RECORD',
  'HR Document-to-Record Wizard',
  'Allows HR users to create identity documents, medical insurance, and dependent records for existing employees by selecting and mapping data from already-uploaded DMS documents. All AI suggestions require mandatory human review before saving.',
  false,
  true
)
ON CONFLICT (feature_code) DO NOTHING;
