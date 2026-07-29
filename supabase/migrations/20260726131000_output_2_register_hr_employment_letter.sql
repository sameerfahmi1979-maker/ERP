-- OUTPUT.2 — Register the HR Employment Letter as a governed coordinator output
-- (migrates standalone Pipeline A into the global output registry, Class B).
INSERT INTO erp_report_registry (
  report_code, report_name_en, report_name_ar, module_code, report_category,
  description_en, default_template_id, default_output_formats, default_orientation,
  branding_strategy, required_permissions, sensitive_profile,
  supports_numbering, supports_scheduling, is_letter_type, sort_order,
  is_system, is_active, document_class
)
SELECT
  'HR_EMPLOYMENT_LETTER', 'Employment Letter', NULL, 'HR', 'letter',
  'Official employment confirmation letter (migrated from the standalone Gotenberg pipeline to the global output coordinator in OUTPUT.2).',
  NULL, default_output_formats, 'portrait',
  'auto_by_owner_company', ARRAY['hr.employees.view'], 'normal',
  supports_numbering, false, true, sort_order + 1,
  true, true, 'B'
FROM erp_report_registry
WHERE report_code = 'HR_EXPERIENCE_LETTER'
ON CONFLICT (report_code) DO NOTHING;
