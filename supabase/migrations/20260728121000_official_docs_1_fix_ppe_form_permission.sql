-- OFFICIAL DOCS.1 — Package 7 UAT fix.
--
-- HR_PPE_ISSUE_FORM was registered (REPORT.4) requiring 'hr.operations.view',
-- but that permission code was never created — no user (including System
-- Administrator) could ever generate the PPE Issue Form.
--
-- The PPE records it prints live in the HR Operations module, whose server
-- actions are gated by 'hr.assignments.view' (src/server/actions/hr/operations.ts).
-- Align the output's required permission with the permission that already
-- guards the underlying data.
--
-- Forward-only, idempotent. No historical rows modified or deleted.

UPDATE erp_report_registry
SET required_permissions = ARRAY['hr.assignments.view'],
    updated_at = now()
WHERE report_code = 'HR_PPE_ISSUE_FORM'
  AND deleted_at IS NULL
  AND required_permissions = ARRAY['hr.operations.view'];
