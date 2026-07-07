-- ─────────────────────────────────────────────────────────────────────────────
-- ERP RBAC: HR Manager + DMS Manager role permission gap fill
-- Phase: RBAC.UPDATE.1 (2026-07-06)
--
-- Problem:
--   hr_manager only had view-level DMS access (dms.view, dms.documents.view.hr).
--   HR Managers couldn't upload, edit, download or approve employee/HR documents
--   inside the DMS — the Documents tab in the Employee form was read-only.
--
--   dms_manager had NO HR module access. DMS Managers couldn't navigate to
--   employee records to associate documents with employees.
--
-- Fix:
--   1. Add DMS operational permissions to hr_manager so HR staff can fully
--      manage HR documents (upload, edit, approve, manage expiry/renewals).
--   2. Add HR view permissions to dms_manager so DMS staff can browse employee
--      records when managing employee-linked documents.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. HR Manager → DMS document operational permissions ──────────────────────

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.role_code = 'hr_manager'
  AND p.permission_code IN (
    'dms.documents.upload',        -- upload employee/HR documents
    'dms.documents.edit',          -- edit document metadata fields
    'dms.documents.download',      -- download documents
    'dms.documents.preview',       -- preview documents in viewer
    'dms.documents.view',          -- general DMS document view (was only view.hr)
    'dms.documents.approve',       -- approve HR documents
    'dms.documents.manage_tags',   -- tag HR documents
    'dms.documents.ocr.view',      -- view extracted OCR text
    'dms.expiry.view',             -- view expiry information
    'dms.expiry.manage',           -- manage expiry reminders
    'dms.expiry.dismiss',          -- dismiss expiry alerts
    'dms.renewals.manage',         -- manage document renewals
    'dms.notifications.view'       -- view DMS notifications
  )
ON CONFLICT DO NOTHING;

-- ── 2. DMS Manager → HR view permissions ─────────────────────────────────────

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.role_code = 'dms_manager'
  AND p.permission_code IN (
    'hr.employees.view',           -- browse employee list / records
    'hr.employee_profile.view',    -- view employee profile tab
    'hr.compliance.view',          -- view compliance documents tab
    'hr.view',                     -- general HR module access
    'hr.dashboard.view'            -- HR dashboard view
  )
ON CONFLICT DO NOTHING;
