-- ============================================================================
-- ERP COMMON AI.0 — Governance and Architecture Baseline
-- Migration: erp_common_ai_0_governance_feature_flags_permissions
-- Date: 2026-06-16
-- Scope: Seed Common AI feature flags + permissions + role mappings ONLY
-- Does NOT create Common AI engine tables (erp_ai_field_suggestions, etc.)
-- ============================================================================

-- =============================================================================
-- SECTION 1: COMMON AI FEATURE FLAGS (all disabled by default)
-- =============================================================================

INSERT INTO erp_ai_feature_flags (
  feature_code, feature_name, description,
  is_enabled, requires_human_review, min_confidence_threshold
) VALUES
  ('ERP_AI_FORM_FILL', 'ERP AI Form Fill / Correct / Update',
   'Universal internal AI engine: suggest fills, corrections, and updates from linked DMS documents.',
   false, true, 0.850),
  ('ERP_AI_DOC_UNDERSTANDING', 'ERP AI Document Understanding Center',
   'Aggregate document intelligence: identity, entity match, field candidates, compliance gaps.',
   false, true, 0.850),
  ('ERP_AI_DUPLICATE_DETECT', 'ERP AI Duplicate / Conflict Detection',
   'Detect duplicate records and conflicting data across master data and DMS.',
   false, true, 0.850),
  ('ERP_AI_COMPLIANCE', 'ERP AI Compliance Checker',
   'Check record compliance using dms_required_document_rules and linked documents.',
   false, false, 0.000),
  ('ERP_AI_RISK_SCORE', 'ERP AI Record Risk Scoring',
   'Generate consistent risk score and level for records from document/compliance signals.',
   false, false, 0.000),
  ('ERP_AI_ERP_SEARCH', 'ERP AI Search Across ERP',
   'Natural language ERP search across records, DMS, compliance, and risk.',
   false, false, 0.000),
  ('ERP_AI_ACTIONS', 'ERP AI Assistant for Actions',
   'AI prepares action drafts (reminders, emails, tasks) — user confirms before execution.',
   false, true, 0.850),
  ('ERP_AI_DAILY_BRIEF', 'ERP AI Daily Dashboard Brief',
   'Management daily AI brief summarizing expiring docs, risk, and pending suggestions.',
   false, false, 0.000),
  ('ERP_AI_AUDIT_EXPLAINER', 'ERP AI Audit Trail Explainer',
   'Explain audit logs and AI suggestion history in human language.',
   false, false, 0.000),
  ('ERP_AI_DATA_QUALITY', 'ERP AI Data Quality Monitor',
   'Continuously scan master data quality and suggest cleanup.',
   false, true, 0.850)
ON CONFLICT (feature_code) DO UPDATE SET
  feature_name = EXCLUDED.feature_name,
  description = EXCLUDED.description,
  updated_at = now();
-- Note: ON CONFLICT does NOT overwrite is_enabled — preserves admin toggles on re-run

-- =============================================================================
-- SECTION 2: COMMON AI PERMISSIONS
-- =============================================================================

INSERT INTO permissions (permission_code, permission_name, description, module_code, action_code, is_active)
VALUES
  ('ai.common.view',              'View Common AI',                    'View Common AI features and results',                         'AI', 'view',   true),
  ('ai.common.generate',          'Generate Common AI',                'Trigger Common AI generation operations',                     'AI', 'generate', true),
  ('ai.common.apply',             'Apply Common AI',                   'Apply accepted Common AI suggestions',                        'AI', 'apply',  true),
  ('ai.common.admin',             'Administer Common AI',              'Admin bulk scans and Common AI administration',               'AI', 'admin',  true),
  ('ai.field_suggestions.view',   'View AI Field Suggestions',         'View AI field suggestions on record forms',                   'AI', 'view',   true),
  ('ai.field_suggestions.generate','Generate AI Field Suggestions',    'Generate AI field suggestions from linked DMS documents',     'AI', 'generate', true),
  ('ai.field_suggestions.apply',  'Apply AI Field Suggestions',        'Accept and apply AI field suggestions to records',              'AI', 'apply',  true),
  ('ai.field_suggestions.manage', 'Manage AI Field Suggestions',       'Manage and supersede AI field suggestions',                     'AI', 'manage', true),
  ('ai.duplicates.view',          'View AI Duplicate Candidates',      'View AI duplicate and conflict detection results',            'AI', 'view',   true),
  ('ai.duplicates.review',        'Review AI Duplicate Candidates',    'Review and resolve AI duplicate/conflict candidates',           'AI', 'review', true),
  ('ai.compliance.view',          'View AI Compliance Status',         'View AI compliance snapshots and status',                     'AI', 'view',   true),
  ('ai.compliance.generate',      'Generate AI Compliance Evaluation', 'Run AI compliance evaluation on records',                     'AI', 'generate', true),
  ('ai.risk.view',                'View AI Risk Status',               'View AI risk scores and snapshots',                           'AI', 'view',   true),
  ('ai.risk.generate',            'Generate AI Risk Evaluation',       'Run AI risk evaluation on records',                           'AI', 'generate', true),
  ('ai.search.use',               'Use AI ERP Search',                 'Use natural language AI search across ERP',                   'AI', 'use',    true),
  ('ai.actions.prepare',          'Prepare AI Actions',                'Prepare AI action drafts (reminders, emails, tasks)',         'AI', 'prepare', true),
  ('ai.actions.execute_after_confirm', 'Execute Confirmed AI Actions', 'Execute AI action drafts after user confirmation',           'AI', 'execute', true),
  ('ai.dashboard.view',           'View AI Daily Dashboard',           'View AI daily brief and dashboard',                           'AI', 'view',   true),
  ('ai.audit_explainer.view',     'View AI Audit Explainer',           'Use AI audit trail explainer',                                'AI', 'view',   true),
  ('ai.data_quality.view',        'View AI Data Quality Findings',     'View AI data quality monitor findings',                       'AI', 'view',   true),
  ('ai.data_quality.manage',      'Manage AI Data Quality Findings',   'Resolve or dismiss AI data quality findings',                 'AI', 'manage', true)
ON CONFLICT (permission_code) DO UPDATE SET
  permission_name = EXCLUDED.permission_name,
  description     = EXCLUDED.description,
  module_code     = EXCLUDED.module_code,
  action_code     = EXCLUDED.action_code,
  is_active       = EXCLUDED.is_active,
  updated_at      = now();

-- =============================================================================
-- SECTION 3: ROLE PERMISSION MAPPINGS
-- =============================================================================

-- system_admin: all ai.* permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.role_code = 'system_admin'
  AND p.permission_code LIKE 'ai.%'
ON CONFLICT DO NOTHING;

-- group_admin: view + generate + apply (not admin/manage for data quality)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.permission_code IN (
  'ai.common.view', 'ai.common.generate',
  'ai.field_suggestions.view', 'ai.field_suggestions.generate', 'ai.field_suggestions.apply',
  'ai.duplicates.view', 'ai.duplicates.review',
  'ai.compliance.view', 'ai.compliance.generate',
  'ai.risk.view', 'ai.risk.generate',
  'ai.search.use',
  'ai.actions.prepare',
  'ai.dashboard.view',
  'ai.audit_explainer.view',
  'ai.data_quality.view'
)
WHERE r.role_code = 'group_admin'
ON CONFLICT DO NOTHING;

-- company_admin: view-only subset
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.permission_code IN (
  'ai.common.view',
  'ai.field_suggestions.view',
  'ai.compliance.view',
  'ai.risk.view',
  'ai.search.use',
  'ai.dashboard.view',
  'ai.audit_explainer.view',
  'ai.data_quality.view'
)
WHERE r.role_code = 'company_admin'
ON CONFLICT DO NOTHING;
