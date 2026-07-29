-- OFFICIAL DOCS.1 — Global Official Letters & Forms Generator.
--
-- Forward-only, idempotent. Extends the existing Global Output Framework:
--   1. Registers the six new official document identities required by the
--      approved catalog (Section 7 of the program). Wording-complete documents
--      are served by fixed code-based definitions (src/lib/official-documents);
--      identities without verified wording exist in the registry but their
--      code definitions carry status `disabled_pending_wording`, so the
--      coordinator refuses to generate them.
--   2. Seeds the dedicated branding/letterhead override permission
--      (Section 10.2: overrides require a dedicated, audited permission).
--
-- No historical rows are modified or deleted. No PK/FK type changes.

-- ── 1. New official document identities ─────────────────────────────────────

INSERT INTO erp_report_registry (
  report_code, report_name_en, report_name_ar, module_code, report_category,
  description_en, default_output_formats, default_orientation,
  branding_strategy, branding_source_path, required_permissions,
  sensitive_profile, sensitive_field_rules_json, filter_schema_json, column_schema_json,
  supports_numbering, numbering_rule_code, supports_scheduling,
  is_letter_type, sort_order, is_system, is_active, document_class
) VALUES

-- Employment Confirmation (EN/AR/bilingual narrative — published, fixed code definition)
('HR_EMPLOYMENT_CONFIRMATION', 'Employment Confirmation', 'خطاب تأكيد التوظيف', 'HR', 'letter',
 'Employment confirmation letter in English, Arabic, or synchronized bilingual layout (fixed code-based template).',
 ARRAY['pdf','print'], 'portrait',
 'auto_by_owner_company', 'owner_company_id',
 ARRAY['hr.employees.view'],
 'normal', '{}'::jsonb,
 '{"filters":["employee_id"]}'::jsonb,
 '{"columns":["employee_name","employee_code","designation","joining_date","company_name","generated_date"]}'::jsonb,
 false, null, false, true, 206, true, true, 'B'),

-- Official Warning Letter (Class A, approval required by class, never publicly verifiable)
('HR_WARNING_LETTER', 'Official Warning Letter', 'خطاب إنذار رسمي', 'HR', 'letter',
 'Formal disciplinary warning letter tied to a recorded disciplinary action (fixed code-based template).',
 ARRAY['pdf','print'], 'portrait',
 'auto_by_owner_company', 'owner_company_id',
 ARRAY['hr.actions.view'],
 'disciplinary', '{}'::jsonb,
 '{"filters":["employee_id","action_id"]}'::jsonb,
 '{"columns":["employee_name","employee_code","warning_level","warning_reason","incident_date","generated_date"]}'::jsonb,
 false, null, false, true, 207, true, true, 'A'),

-- Bank Salary Transfer Letter (identity reserved — disabled pending approved wording)
('HR_BANK_SALARY_TRANSFER', 'Bank Salary Transfer Letter', NULL, 'HR', 'letter',
 'Bank salary transfer letter. Disabled pending approved wording — the code definition refuses generation.',
 ARRAY['pdf','print'], 'portrait',
 'auto_by_owner_company', 'owner_company_id',
 ARRAY['hr.payroll.view'],
 'payroll', '{}'::jsonb,
 '{"filters":["employee_id"]}'::jsonb,
 '{}'::jsonb,
 false, null, false, true, 208, true, true, 'A'),

-- Embassy / Consulate Letter (identity reserved — disabled pending approved wording)
('HR_EMBASSY_LETTER', 'Embassy / Consulate Letter', NULL, 'HR', 'letter',
 'Embassy or consulate employment/salary letter. Disabled pending approved wording — the code definition refuses generation.',
 ARRAY['pdf','print'], 'portrait',
 'auto_by_owner_company', 'owner_company_id',
 ARRAY['hr.employees.view'],
 'mixed_sensitive', '{}'::jsonb,
 '{"filters":["employee_id"]}'::jsonb,
 '{}'::jsonb,
 false, null, false, true, 209, true, true, 'A'),

-- Employee Handover Form (identity reserved — disabled pending approved wording/structure)
('HR_HANDOVER_FORM', 'Employee Handover Form', NULL, 'HR', 'form',
 'Duties/assets handover form. Disabled pending approved wording — the code definition refuses generation.',
 ARRAY['pdf','print'], 'portrait',
 'auto_by_owner_company', 'owner_company_id',
 ARRAY['hr.actions.view'],
 'normal', '{}'::jsonb,
 '{"filters":["employee_id"]}'::jsonb,
 '{}'::jsonb,
 false, null, false, false, 210, true, true, 'C'),

-- Leave Confirmation Letter (identity reserved — disabled pending approved wording)
('HR_LEAVE_CONFIRMATION', 'Leave Confirmation Letter', NULL, 'HR', 'letter',
 'Approved-leave confirmation letter. Disabled pending approved wording — the code definition refuses generation.',
 ARRAY['pdf','print'], 'portrait',
 'auto_by_owner_company', 'owner_company_id',
 ARRAY['hr.leave.view'],
 'normal', '{}'::jsonb,
 '{"filters":["employee_id"]}'::jsonb,
 '{}'::jsonb,
 false, null, false, true, 211, true, true, 'B')

ON CONFLICT (report_code) DO NOTHING;

-- Warning letters must never carry a public QR verification link (Section 15).
UPDATE erp_report_registry
SET qr_policy_override = 'none',
    updated_at = now()
WHERE report_code = 'HR_WARNING_LETTER'
  AND deleted_at IS NULL
  AND qr_policy_override IS DISTINCT FROM 'none';

-- ── 2. Branding / letterhead override permission (Section 10.2) ─────────────

INSERT INTO permissions (permission_code, permission_name, module_code, action_code, description, is_active, display_name, is_system_permission, is_visible)
VALUES
  ('reports.branding.override', 'Override Issuing Company Branding', 'REPORTS', 'override',
   'Select a non-default approved issuing company/letterhead profile when generating official documents. Overrides are audited.',
   true, 'Official Documents — Branding Override', true, true)
ON CONFLICT (permission_code) DO NOTHING;

-- Grant to System Administrator only (least privilege; other roles via Permission Matrix).
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.role_name = 'System Administrator'
  AND p.permission_code = 'reports.branding.override'
  AND NOT EXISTS (
    SELECT 1 FROM role_permissions rp
    WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );
