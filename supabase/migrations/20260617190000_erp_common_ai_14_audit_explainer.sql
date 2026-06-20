-- ERP COMMON AI.14 — AI Audit Trail Explainer
-- ERP_AI_AUDIT_EXPLAINER flag already exists (is_enabled=false, from AI.0 governance seed)
-- ai.audit_explainer.view already exists (from AI.0 governance seed)
-- Add: ai.audit_explainer.use, ai.audit_explainer.admin, role mappings, cache table

INSERT INTO permissions (permission_code, permission_name, description, module_code, action_code, is_active)
VALUES
  ('ai.audit_explainer.use', 'Use AI Audit Explainer', 'Generate AI explanations for audit log entries', 'AI', 'use', true),
  ('ai.audit_explainer.admin', 'Administer AI Audit Explainer', 'Admin-wide audit summary and explanation history', 'AI', 'admin', true)
ON CONFLICT (permission_code) DO NOTHING;

-- Map all 3 permissions to system_admin/group_admin/company_admin
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.role_code IN ('system_admin','group_admin','company_admin')
  AND p.permission_code IN ('ai.audit_explainer.view','ai.audit_explainer.use','ai.audit_explainer.admin')
ON CONFLICT DO NOTHING;

-- Cache table for audit explanations (sanitized explanation text only)
-- No raw audit payloads, no prompt text, no raw AI responses
CREATE TABLE IF NOT EXISTS erp_ai_audit_explanations (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source_type TEXT NOT NULL CHECK (source_type IN ('audit_log','audit_group','entity_timeline','ai_event_group','dms_event_group')),
  source_id BIGINT,
  entity_type TEXT,
  entity_id BIGINT,
  scope TEXT NOT NULL CHECK (scope IN ('single_event','entity_today','entity_7_days','entity_30_days','dashboard_period','custom_range')),
  scope_start TIMESTAMPTZ,
  scope_end TIMESTAMPTZ,
  explanation_text TEXT NOT NULL,
  summary_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  model_name TEXT,
  prompt_version TEXT,
  created_by BIGINT REFERENCES user_profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_erp_ai_audit_explanations_source
  ON erp_ai_audit_explanations (source_type, source_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_erp_ai_audit_explanations_entity
  ON erp_ai_audit_explanations (entity_type, entity_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_erp_ai_audit_explanations_created_by
  ON erp_ai_audit_explanations (created_by)
  WHERE deleted_at IS NULL;

-- RLS: ENABLED + FORCE
ALTER TABLE erp_ai_audit_explanations ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_ai_audit_explanations FORCE ROW LEVEL SECURITY;

CREATE POLICY "audit_explainer_select" ON erp_ai_audit_explanations
  FOR SELECT USING (
    created_by = current_user_profile_id()
    OR current_user_has_permission('ai.audit_explainer.admin')
    OR current_user_has_role('system_admin')
  );

CREATE POLICY "audit_explainer_insert" ON erp_ai_audit_explanations
  FOR INSERT WITH CHECK (
    current_user_has_permission('ai.audit_explainer.use')
    OR current_user_has_role('system_admin')
  );

CREATE POLICY "audit_explainer_soft_delete" ON erp_ai_audit_explanations
  FOR UPDATE USING (
    created_by = current_user_profile_id()
    OR current_user_has_permission('ai.audit_explainer.admin')
    OR current_user_has_role('system_admin')
  );
