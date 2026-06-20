-- ERP COMMON AI.15 — AI Data Quality Monitor
-- Migration: Add feature flag, permissions, and data quality tables

-- Feature flag (preferred code; ERP_AI_DATA_QUALITY already exists as legacy)
INSERT INTO erp_ai_feature_flags (feature_code, feature_name, is_enabled, requires_human_review, description)
VALUES (
  'ERP_AI_DATA_QUALITY_MONITOR',
  'AI Data Quality Monitor',
  false,
  false,
  'Deterministic data quality scanning and finding management for existing ERP scope'
)
ON CONFLICT (feature_code) DO NOTHING;

-- Permissions (action_code is required NOT NULL in this project)
INSERT INTO permissions (permission_code, permission_name, module_code, action_code, description)
VALUES
  ('ai.data_quality.scan',   'AI Data Quality - Run Scan',          'AI', 'scan',   'Permission to run data quality scans'),
  ('ai.data_quality.review', 'AI Data Quality - Review Findings',   'AI', 'review', 'Permission to review/dismiss/reopen data quality findings'),
  ('ai.data_quality.admin',  'AI Data Quality - Admin Summary',     'AI', 'admin',  'Permission to view admin-level data quality summary')
ON CONFLICT (permission_code) DO NOTHING;

-- Role mappings (role_permissions uses role_id and permission_id FKs)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.role_code IN ('system_admin', 'group_admin', 'company_admin')
  AND p.permission_code IN (
    'ai.data_quality.view',
    'ai.data_quality.scan',
    'ai.data_quality.review',
    'ai.data_quality.admin'
  )
ON CONFLICT DO NOTHING;

-- Table: erp_ai_data_quality_findings
CREATE TABLE IF NOT EXISTS erp_ai_data_quality_findings (
  id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  finding_key         TEXT NOT NULL,
  entity_type         TEXT NOT NULL,
  entity_id           BIGINT,
  source_table        TEXT,
  source_field        TEXT,
  rule_code           TEXT NOT NULL,
  rule_category       TEXT NOT NULL,
  severity            TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'open',
  title               TEXT NOT NULL,
  description         TEXT NOT NULL,
  recommendation      TEXT,
  safe_evidence_json  JSONB NOT NULL DEFAULT '{}'::jsonb,
  detected_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at         TIMESTAMPTZ,
  resolved_by         BIGINT REFERENCES user_profiles(id),
  reviewed_at         TIMESTAMPTZ,
  reviewed_by         BIGINT REFERENCES user_profiles(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at          TIMESTAMPTZ,
  CONSTRAINT chk_dq_severity     CHECK (severity IN ('info','low','medium','high','critical')),
  CONSTRAINT chk_dq_status       CHECK (status IN ('open','reviewed','dismissed','resolved','false_positive','superseded')),
  CONSTRAINT chk_dq_rule_category CHECK (rule_category IN ('completeness','format','consistency','staleness','relationship','dms_health','ai_health','permission_health'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_dq_findings_active_key
  ON erp_ai_data_quality_findings (finding_key)
  WHERE deleted_at IS NULL AND status IN ('open','reviewed');

CREATE INDEX IF NOT EXISTS idx_dq_findings_entity   ON erp_ai_data_quality_findings (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_dq_findings_status   ON erp_ai_data_quality_findings (status);
CREATE INDEX IF NOT EXISTS idx_dq_findings_severity ON erp_ai_data_quality_findings (severity);

ALTER TABLE erp_ai_data_quality_findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_ai_data_quality_findings FORCE ROW LEVEL SECURITY;

-- RLS policies use user_roles.user_profile_id (actual schema)
CREATE POLICY "dq_findings_select" ON erp_ai_data_quality_findings
  FOR SELECT USING (
    auth.uid() IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM role_permissions rp
      JOIN user_roles ur ON ur.role_id = rp.role_id
        AND ur.user_profile_id = (SELECT id FROM user_profiles WHERE auth_user_id = auth.uid() LIMIT 1)
      JOIN permissions perm ON perm.id = rp.permission_id
      WHERE perm.permission_code IN ('ai.data_quality.view','ai.common.admin','system_admin')
    )
  );

CREATE POLICY "dq_findings_insert" ON erp_ai_data_quality_findings
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM role_permissions rp
      JOIN user_roles ur ON ur.role_id = rp.role_id
        AND ur.user_profile_id = (SELECT id FROM user_profiles WHERE auth_user_id = auth.uid() LIMIT 1)
      JOIN permissions perm ON perm.id = rp.permission_id
      WHERE perm.permission_code IN ('ai.data_quality.scan','ai.common.admin','system_admin')
    )
  );

CREATE POLICY "dq_findings_update" ON erp_ai_data_quality_findings
  FOR UPDATE USING (
    auth.uid() IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM role_permissions rp
      JOIN user_roles ur ON ur.role_id = rp.role_id
        AND ur.user_profile_id = (SELECT id FROM user_profiles WHERE auth_user_id = auth.uid() LIMIT 1)
      JOIN permissions perm ON perm.id = rp.permission_id
      WHERE perm.permission_code IN ('ai.data_quality.review','ai.common.admin','system_admin')
    )
  );

-- Table: erp_ai_data_quality_finding_events (append-only — no UPDATE/DELETE policies)
CREATE TABLE IF NOT EXISTS erp_ai_data_quality_finding_events (
  id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  finding_id          BIGINT REFERENCES erp_ai_data_quality_findings(id) ON DELETE CASCADE,
  event_type          TEXT NOT NULL,
  event_note          TEXT,
  safe_metadata_json  JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by          BIGINT REFERENCES user_profiles(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dq_events_finding ON erp_ai_data_quality_finding_events (finding_id);

ALTER TABLE erp_ai_data_quality_finding_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_ai_data_quality_finding_events FORCE ROW LEVEL SECURITY;

CREATE POLICY "dq_events_select" ON erp_ai_data_quality_finding_events
  FOR SELECT USING (
    auth.uid() IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM role_permissions rp
      JOIN user_roles ur ON ur.role_id = rp.role_id
        AND ur.user_profile_id = (SELECT id FROM user_profiles WHERE auth_user_id = auth.uid() LIMIT 1)
      JOIN permissions perm ON perm.id = rp.permission_id
      WHERE perm.permission_code IN ('ai.data_quality.view','ai.common.admin','system_admin')
    )
  );

CREATE POLICY "dq_events_insert" ON erp_ai_data_quality_finding_events
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL AND
    EXISTS (
      SELECT 1 FROM role_permissions rp
      JOIN user_roles ur ON ur.role_id = rp.role_id
        AND ur.user_profile_id = (SELECT id FROM user_profiles WHERE auth_user_id = auth.uid() LIMIT 1)
      JOIN permissions perm ON perm.id = rp.permission_id
      WHERE perm.permission_code IN ('ai.data_quality.scan','ai.data_quality.review','ai.common.admin','system_admin')
    )
  );
-- No UPDATE or DELETE policy on events — append-only by design
