-- =============================================================================
-- BRANDING.7 — Template Governance, Versioning, Approval, and Security
-- Date: 2026-07-02
-- Depends on: BRANDING.6 (erp_output_public_links), REPORT.2/3 (erp_report_templates)
-- =============================================================================
-- Includes:
--   1. BRANDING.6 Permission Correction: remove reports.verify.admin from group_admin
--   2. New permission: reports.template.approve (system_admin + group_admin only)
--   3. Governance columns added to erp_report_templates
--   4. New table: erp_report_template_events (append-only audit log)
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. BRANDING.6 PERMISSION CORRECTION
--    Remove reports.verify.admin from group_admin.
--    The BRANDING.6 migration comment said "publish only" but accidentally granted
--    reports.verify.admin too. This corrects that.
-- ─────────────────────────────────────────────────────────────────────────────

DELETE FROM public.role_permissions
WHERE role_id IN (
  SELECT id FROM public.roles WHERE role_code = 'group_admin'
)
AND permission_id IN (
  SELECT id FROM public.permissions WHERE permission_code = 'reports.verify.admin'
);

-- Verify system_admin still has reports.verify.admin (safety INSERT ON CONFLICT DO NOTHING)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.role_code = 'system_admin'
  AND p.permission_code = 'reports.verify.admin'
ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. NEW PERMISSION: reports.template.approve
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.permissions (
  permission_code, permission_name, module_code, action_code, description,
  is_active, is_system_permission, is_visible, sort_order
)
VALUES (
  'reports.template.approve',
  'Approve/Reject Report Templates',
  'REPORTS',
  'approve',
  'Approve, reject, or publish report templates in the governance workflow',
  true, true, true, 564
)
ON CONFLICT (permission_code) DO NOTHING;

-- Grant to system_admin and group_admin
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.role_code IN ('system_admin', 'group_admin')
  AND p.permission_code = 'reports.template.approve'
ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. GOVERNANCE COLUMNS ON erp_report_templates
--    All columns added with IF NOT EXISTS for idempotency.
-- ─────────────────────────────────────────────────────────────────────────────

-- Version lineage
ALTER TABLE public.erp_report_templates
  ADD COLUMN IF NOT EXISTS parent_template_id BIGINT NULL
    REFERENCES public.erp_report_templates(id);

-- Governance lifecycle status
ALTER TABLE public.erp_report_templates
  ADD COLUMN IF NOT EXISTS governance_status TEXT NOT NULL DEFAULT 'draft';

ALTER TABLE public.erp_report_templates
  DROP CONSTRAINT IF EXISTS chk_template_governance_status;
ALTER TABLE public.erp_report_templates
  ADD CONSTRAINT chk_template_governance_status
    CHECK (governance_status IN ('draft', 'in_review', 'approved', 'published', 'archived', 'rejected'));

-- Submission tracking
ALTER TABLE public.erp_report_templates
  ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ NULL;
ALTER TABLE public.erp_report_templates
  ADD COLUMN IF NOT EXISTS submitted_by BIGINT NULL
    REFERENCES public.user_profiles(id);

-- Approval tracking
ALTER TABLE public.erp_report_templates
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ NULL;
ALTER TABLE public.erp_report_templates
  ADD COLUMN IF NOT EXISTS approved_by BIGINT NULL
    REFERENCES public.user_profiles(id);
ALTER TABLE public.erp_report_templates
  ADD COLUMN IF NOT EXISTS approval_notes TEXT NULL;

-- Rejection tracking
ALTER TABLE public.erp_report_templates
  ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ NULL;
ALTER TABLE public.erp_report_templates
  ADD COLUMN IF NOT EXISTS rejected_by BIGINT NULL
    REFERENCES public.user_profiles(id);
ALTER TABLE public.erp_report_templates
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT NULL;

-- Publish tracking
ALTER TABLE public.erp_report_templates
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ NULL;
ALTER TABLE public.erp_report_templates
  ADD COLUMN IF NOT EXISTS published_by BIGINT NULL
    REFERENCES public.user_profiles(id);

-- Archive tracking
ALTER TABLE public.erp_report_templates
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ NULL;
ALTER TABLE public.erp_report_templates
  ADD COLUMN IF NOT EXISTS archived_by BIGINT NULL
    REFERENCES public.user_profiles(id);
ALTER TABLE public.erp_report_templates
  ADD COLUMN IF NOT EXISTS archive_reason TEXT NULL;

-- Security review
ALTER TABLE public.erp_report_templates
  ADD COLUMN IF NOT EXISTS security_review_status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE public.erp_report_templates
  DROP CONSTRAINT IF EXISTS chk_template_security_review_status;
ALTER TABLE public.erp_report_templates
  ADD CONSTRAINT chk_template_security_review_status
    CHECK (security_review_status IN ('pending', 'passed', 'failed', 'skipped'));
ALTER TABLE public.erp_report_templates
  ADD COLUMN IF NOT EXISTS security_review_notes TEXT NULL;
ALTER TABLE public.erp_report_templates
  ADD COLUMN IF NOT EXISTS security_review_at TIMESTAMPTZ NULL;
ALTER TABLE public.erp_report_templates
  ADD COLUMN IF NOT EXISTS security_review_by BIGINT NULL
    REFERENCES public.user_profiles(id);

-- Index for governance status queries
CREATE INDEX IF NOT EXISTS idx_report_templates_governance_status
  ON public.erp_report_templates (governance_status)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_report_templates_parent
  ON public.erp_report_templates (parent_template_id)
  WHERE deleted_at IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. NEW TABLE: erp_report_template_events
--    Append-only governance event log. No UPDATE/DELETE policies.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.erp_report_template_events (
  id                    BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  template_id           BIGINT NOT NULL REFERENCES public.erp_report_templates(id),
  event_type            TEXT NOT NULL,
  actor_user_profile_id BIGINT NULL REFERENCES public.user_profiles(id),
  occurred_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Safe payload: do not store full template HTML, only governance metadata
  payload_json          JSONB NOT NULL DEFAULT '{}'::jsonb,
  notes                 TEXT NULL,

  CONSTRAINT chk_template_event_type
    CHECK (event_type IN (
      'template_created',
      'template_updated',
      'template_submitted_for_review',
      'template_approved',
      'template_rejected',
      'template_published',
      'template_archived',
      'template_new_version_created',
      'template_security_review_failed',
      'template_security_review_passed'
    ))
);

CREATE INDEX IF NOT EXISTS idx_template_events_template_id
  ON public.erp_report_template_events (template_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_template_events_actor
  ON public.erp_report_template_events (actor_user_profile_id)
  WHERE actor_user_profile_id IS NOT NULL;

-- RLS: enabled and forced
ALTER TABLE public.erp_report_template_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_report_template_events FORCE ROW LEVEL SECURITY;

-- SELECT: reports.view or better
CREATE POLICY "template_events_select"
  ON public.erp_report_template_events FOR SELECT TO authenticated
  USING (
    public.current_user_has_permission('reports.view')
    OR public.current_user_has_permission('reports.manage')
    OR public.current_user_has_permission('reports.template.approve')
    OR public.current_user_is_global_admin()
  );

-- INSERT: reports.manage or reports.template.approve or global admin
-- (server actions use admin client; this policy is for defense-in-depth)
CREATE POLICY "template_events_insert"
  ON public.erp_report_template_events FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_has_permission('reports.manage')
    OR public.current_user_has_permission('reports.template.approve')
    OR public.current_user_is_global_admin()
  );

-- NO UPDATE policy — append-only
-- NO DELETE policy — append-only
