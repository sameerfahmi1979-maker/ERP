-- ============================================================================
-- REPORT DESIGNER UX.3 — Sensitive Field Governance Permissions
-- Migration: 20260704030000_report_designer_ux3_sensitive_field_permissions
-- Date: 2026-07-04
-- Scope:
--   - Add reports.sensitive_fields.use permission
--   - Add reports.sensitive_fields.approve permission
--   - Seed role assignments (system_admin, group_admin, hr_manager, finance_manager)
-- ============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 1: Add report sensitive field permissions
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.permissions (
  permission_code,
  permission_name,
  module_code,
  action_code,
  description,
  is_active,
  is_system_permission,
  is_visible,
  sort_order
)
VALUES
  (
    'reports.sensitive_fields.use',
    'Use Sensitive Report Fields',
    'REPORTS',
    'use',
    'Insert and use restricted/confidential fields (salary, IBAN, passport, EID, visa) in authorized report templates. Template type must be in the field allowlist.',
    true, true, true, 910
  ),
  (
    'reports.sensitive_fields.approve',
    'Approve Sensitive Report Fields',
    'REPORTS',
    'approve',
    'Approve and publish templates that contain restricted or confidential fields. Required in addition to reports.template.approve for sensitive-field templates.',
    true, true, true, 911
  )
ON CONFLICT (permission_code) DO UPDATE SET
  permission_name      = EXCLUDED.permission_name,
  description          = EXCLUDED.description,
  is_active            = EXCLUDED.is_active,
  is_system_permission = EXCLUDED.is_system_permission,
  is_visible           = EXCLUDED.is_visible,
  sort_order           = EXCLUDED.sort_order,
  updated_at           = now();

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 2: Role Assignments
-- ─────────────────────────────────────────────────────────────────────────────

-- system_admin: both permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.permission_code IN (
  'reports.sensitive_fields.use',
  'reports.sensitive_fields.approve'
)
WHERE r.role_code = 'system_admin'
ON CONFLICT DO NOTHING;

-- group_admin: both permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.permission_code IN (
  'reports.sensitive_fields.use',
  'reports.sensitive_fields.approve'
)
WHERE r.role_code = 'group_admin'
ON CONFLICT DO NOTHING;

-- hr_manager: use only (not approve)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.permission_code IN (
  'reports.sensitive_fields.use'
)
WHERE r.role_code = 'hr_manager'
ON CONFLICT DO NOTHING;

-- finance_manager: use only (for salary_certificate templates)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.permission_code IN (
  'reports.sensitive_fields.use'
)
WHERE r.role_code = 'finance_manager'
ON CONFLICT DO NOTHING;

COMMIT;
