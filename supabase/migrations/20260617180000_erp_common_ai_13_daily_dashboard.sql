-- ERP COMMON AI.13 — AI Daily Dashboard
-- Adds ERP_AI_DAILY_DASHBOARD feature flag and ai.dashboard.admin permission
-- ai.dashboard.view already exists (seeded in AI.0)

INSERT INTO erp_ai_feature_flags (feature_code, feature_name, description, is_enabled, requires_human_review)
VALUES ('ERP_AI_DAILY_DASHBOARD', 'AI Daily Dashboard', 'AI Daily Dashboard for existing ERP scope — risk, compliance, duplicates, DMS health, assistant activity', false, false)
ON CONFLICT (feature_code) DO NOTHING;

INSERT INTO permissions (permission_code, permission_name, description, module_code, action_code, is_active)
VALUES ('ai.dashboard.admin', 'Administer AI Dashboard', 'View all AI dashboard sections including usage and feature flags', 'AI', 'admin', true)
ON CONFLICT (permission_code) DO NOTHING;

-- Map both permissions to system_admin/group_admin/company_admin
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.role_code IN ('system_admin','group_admin','company_admin')
  AND p.permission_code IN ('ai.dashboard.view','ai.dashboard.admin')
ON CONFLICT DO NOTHING;
