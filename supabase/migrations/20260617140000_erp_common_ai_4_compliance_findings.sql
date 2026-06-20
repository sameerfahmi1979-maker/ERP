-- ERP COMMON AI.4 — AI Compliance Checker
-- Creates erp_ai_compliance_findings + erp_ai_compliance_finding_events
-- Adds ai.compliance.review permission
-- Feature flag ERP_AI_COMPLIANCE already exists (is_enabled=false — do not enable)

-- ── erp_ai_compliance_findings ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.erp_ai_compliance_findings (
  id                              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

  finding_type                    TEXT NOT NULL,
  severity                        TEXT NOT NULL DEFAULT 'medium',
  detection_method                TEXT NOT NULL DEFAULT 'deterministic',

  finding_key                     TEXT NOT NULL,

  entity_type                     TEXT NOT NULL,
  entity_id                       BIGINT NOT NULL,

  document_id                     BIGINT REFERENCES public.dms_documents(id) ON DELETE SET NULL,

  source_rule_id                  BIGINT REFERENCES public.dms_required_document_rules(id) ON DELETE SET NULL,
  source_duplicate_candidate_id   BIGINT REFERENCES public.erp_ai_duplicate_candidates(id) ON DELETE SET NULL,
  source_field_suggestion_id      BIGINT REFERENCES public.erp_ai_field_suggestions(id) ON DELETE SET NULL,

  field_code                      TEXT,
  expected_value                  TEXT,
  actual_value                    TEXT,
  confidence_score                NUMERIC(5,4) NOT NULL DEFAULT 0.80,
  evidence_json                   JSONB,
  ai_reason                       TEXT,
  recommended_action              TEXT,

  status                          TEXT NOT NULL DEFAULT 'open',
  review_decision                 TEXT,
  review_notes                    TEXT,

  reviewed_by                     BIGINT REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  reviewed_at                     TIMESTAMPTZ,
  resolved_by                     BIGINT REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  resolved_at                     TIMESTAMPTZ,
  waived_by                       BIGINT REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  waived_at                       TIMESTAMPTZ,
  waiver_reason                   TEXT,

  created_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by                      BIGINT REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  updated_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by                      BIGINT REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  deleted_at                      TIMESTAMPTZ,

  CONSTRAINT erp_ai_comp_findings_type_chk CHECK (finding_type IN (
    'missing_required_document', 'expired_document', 'expiring_soon_document',
    'document_high_risk', 'document_critical_risk', 'document_incomplete',
    'missing_ocr', 'missing_ai_summary', 'missing_embedding',
    'unlinked_document', 'wrong_document_type',
    'duplicate_conflict_open', 'field_suggestion_conflict_open',
    'license_expiry_mismatch', 'trn_mismatch',
    'missing_required_metadata', 'missing_issue_date',
    'confidential_document_requires_admin_review',
    'open_renewal_request', 'blocks_activation_warning',
    'ai_compliance_note'
  )),
  CONSTRAINT erp_ai_comp_findings_severity_chk CHECK (
    severity IN ('info', 'low', 'medium', 'high', 'critical')
  ),
  CONSTRAINT erp_ai_comp_findings_method_chk CHECK (
    detection_method IN ('deterministic', 'ai', 'hybrid')
  ),
  CONSTRAINT erp_ai_comp_findings_status_chk CHECK (status IN (
    'open', 'reviewed', 'accepted', 'waived', 'resolved',
    'false_positive', 'superseded', 'failed'
  )),
  CONSTRAINT erp_ai_comp_findings_confidence_chk CHECK (
    confidence_score >= 0 AND confidence_score <= 1
  ),
  CONSTRAINT erp_ai_comp_findings_reason_len_chk CHECK (
    ai_reason IS NULL OR char_length(ai_reason) <= 500
  ),
  CONSTRAINT erp_ai_comp_findings_action_len_chk CHECK (
    recommended_action IS NULL OR char_length(recommended_action) <= 300
  )
);

COMMENT ON TABLE public.erp_ai_compliance_findings IS
  'COMMON AI.4 — Compliance findings for human review. No auto-fix/waive/update. '
  'evidence_json never contains raw OCR text, prompts, or API keys.';

CREATE INDEX IF NOT EXISTS idx_erp_ai_comp_findings_status
  ON public.erp_ai_compliance_findings(status)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_erp_ai_comp_findings_entity
  ON public.erp_ai_compliance_findings(entity_type, entity_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_erp_ai_comp_findings_type_severity
  ON public.erp_ai_compliance_findings(finding_type, severity, status)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_erp_ai_comp_findings_document
  ON public.erp_ai_compliance_findings(document_id)
  WHERE document_id IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_erp_ai_comp_findings_rule
  ON public.erp_ai_compliance_findings(source_rule_id)
  WHERE source_rule_id IS NOT NULL AND deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_erp_ai_comp_findings_open_key
  ON public.erp_ai_compliance_findings(finding_key)
  WHERE status = 'open' AND deleted_at IS NULL;

DROP TRIGGER IF EXISTS trg_erp_ai_comp_findings_updated_at ON public.erp_ai_compliance_findings;
CREATE TRIGGER trg_erp_ai_comp_findings_updated_at
  BEFORE UPDATE ON public.erp_ai_compliance_findings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── RLS: erp_ai_compliance_findings ───────────────────────────────────────────

ALTER TABLE public.erp_ai_compliance_findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_ai_compliance_findings FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS erp_ai_comp_findings_select ON public.erp_ai_compliance_findings;
CREATE POLICY erp_ai_comp_findings_select
  ON public.erp_ai_compliance_findings FOR SELECT
  USING (
    deleted_at IS NULL
    AND (
      current_user_has_permission('ai.compliance.view')
      OR current_user_has_permission('ai.common.admin')
      OR current_user_has_role('system_admin')
    )
  );

DROP POLICY IF EXISTS erp_ai_comp_findings_insert ON public.erp_ai_compliance_findings;
CREATE POLICY erp_ai_comp_findings_insert
  ON public.erp_ai_compliance_findings FOR INSERT
  WITH CHECK (
    current_user_has_permission('ai.compliance.generate')
    OR current_user_has_permission('ai.common.admin')
    OR current_user_has_role('system_admin')
  );

DROP POLICY IF EXISTS erp_ai_comp_findings_update ON public.erp_ai_compliance_findings;
CREATE POLICY erp_ai_comp_findings_update
  ON public.erp_ai_compliance_findings FOR UPDATE
  USING (
    deleted_at IS NULL
    AND (
      current_user_has_permission('ai.compliance.review')
      OR current_user_has_permission('ai.compliance.generate')
      OR current_user_has_permission('ai.common.admin')
      OR current_user_has_role('system_admin')
    )
  )
  WITH CHECK (
    current_user_has_permission('ai.compliance.review')
    OR current_user_has_permission('ai.compliance.generate')
    OR current_user_has_permission('ai.common.admin')
    OR current_user_has_role('system_admin')
  );

-- ── erp_ai_compliance_finding_events (append-only) ──────────────────────────────

CREATE TABLE IF NOT EXISTS public.erp_ai_compliance_finding_events (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  finding_id      BIGINT NOT NULL
    REFERENCES public.erp_ai_compliance_findings(id) ON DELETE CASCADE,
  event_type      TEXT NOT NULL,
  event_data_json JSONB,
  actor_user_id   BIGINT REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT erp_ai_comp_events_type_chk CHECK (event_type IN (
    'detected', 'reviewed', 'accepted', 'waived', 'resolved',
    'false_positive', 'superseded', 'failed'
  ))
);

COMMENT ON TABLE public.erp_ai_compliance_finding_events IS
  'COMMON AI.4 — Append-only audit trail for compliance finding lifecycle events.';

CREATE INDEX IF NOT EXISTS idx_erp_ai_comp_events_finding
  ON public.erp_ai_compliance_finding_events(finding_id);

CREATE INDEX IF NOT EXISTS idx_erp_ai_comp_events_created
  ON public.erp_ai_compliance_finding_events(created_at DESC);

ALTER TABLE public.erp_ai_compliance_finding_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_ai_compliance_finding_events FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS erp_ai_comp_events_select ON public.erp_ai_compliance_finding_events;
CREATE POLICY erp_ai_comp_events_select
  ON public.erp_ai_compliance_finding_events FOR SELECT
  USING (
    current_user_has_permission('ai.compliance.view')
    OR current_user_has_permission('ai.common.admin')
    OR current_user_has_role('system_admin')
  );

DROP POLICY IF EXISTS erp_ai_comp_events_insert ON public.erp_ai_compliance_finding_events;
CREATE POLICY erp_ai_comp_events_insert
  ON public.erp_ai_compliance_finding_events FOR INSERT
  WITH CHECK (
    actor_user_id = current_user_profile_id()
    AND (
      current_user_has_permission('ai.compliance.review')
      OR current_user_has_permission('ai.compliance.generate')
      OR current_user_has_permission('ai.common.admin')
      OR current_user_has_role('system_admin')
    )
  );

-- ── ai.compliance.review permission ───────────────────────────────────────────

INSERT INTO permissions (permission_code, permission_name, description, module_code, action_code, is_active)
VALUES (
  'ai.compliance.review',
  'Review AI Compliance Findings',
  'Review, waive, resolve, or mark false positive on compliance findings',
  'AI', 'review', true
) ON CONFLICT (permission_code) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.role_code IN ('system_admin', 'group_admin')
  AND p.permission_code = 'ai.compliance.review'
ON CONFLICT DO NOTHING;

-- ── Optional party/branch required document rule seeds ────────────────────────

INSERT INTO dms_required_document_rules
  (rule_code, rule_name, entity_type, document_type_id, is_required, requires_expiry_date, requires_issue_date, is_active)
SELECT 'PARTY-TRADE-LICENSE', 'Party Trade License', 'party', id, true, true, true, true
FROM dms_document_types WHERE type_code = 'TRADE_LICENSE' AND deleted_at IS NULL
ON CONFLICT (rule_code) DO NOTHING;

INSERT INTO dms_required_document_rules
  (rule_code, rule_name, entity_type, document_type_id, is_required, requires_expiry_date, is_active)
SELECT 'PARTY-VAT-CERT', 'Party VAT Certificate', 'party', id, true, false, true
FROM dms_document_types WHERE type_code = 'VAT_CERTIFICATE' AND deleted_at IS NULL
ON CONFLICT (rule_code) DO NOTHING;

INSERT INTO dms_required_document_rules
  (rule_code, rule_name, entity_type, document_type_id, is_required, requires_expiry_date, is_active)
SELECT 'BRANCH-TRADE-LICENSE', 'Branch Trade License', 'branch', id, true, true, true
FROM dms_document_types WHERE type_code = 'TRADE_LICENSE' AND deleted_at IS NULL
ON CONFLICT (rule_code) DO NOTHING;
