-- ============================================================
-- DMS.2A — Approval Schema Gap-Fill
-- ============================================================
-- Phase: DMS.2A — First sub-phase of DMS.2 Full Approval System
-- Date:  2026-07-20
-- Safe:  Idempotent. All ADD COLUMN / ADD CONSTRAINT use IF NOT EXISTS.
--        No existing data is dropped or modified.
--        dms_approve_runs is untouched (AI intake only).
-- ============================================================

-- ── SECTION 1: Extend dms_documents ──────────────────────────────────────────

ALTER TABLE public.dms_documents
  ADD COLUMN IF NOT EXISTS approval_status TEXT    NULL,
  ADD COLUMN IF NOT EXISTS submitted_by    BIGINT  NULL REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS submitted_at    TIMESTAMPTZ NULL;

-- CHECK constraint on approval_status (NULL is valid for non-approval docs)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.dms_documents'::regclass
      AND conname   = 'dms_documents_approval_status_chk'
  ) THEN
    ALTER TABLE public.dms_documents
      ADD CONSTRAINT dms_documents_approval_status_chk
      CHECK (approval_status IS NULL OR approval_status IN (
        'pending_approval', 'approved', 'rejected', 'withdrawn'
      ));
  END IF;
END;
$$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_dms_documents_approval_status
  ON public.dms_documents (approval_status) WHERE approval_status IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_dms_documents_submitted_by
  ON public.dms_documents (submitted_by) WHERE submitted_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_dms_documents_submitted_at
  ON public.dms_documents (submitted_at DESC) WHERE submitted_at IS NOT NULL;

COMMENT ON COLUMN public.dms_documents.approval_status IS
  'Business approval workflow state: NULL = no approval in progress, pending_approval | approved | rejected | withdrawn';
COMMENT ON COLUMN public.dms_documents.submitted_by IS
  'User profile who last submitted this document for approval';
COMMENT ON COLUMN public.dms_documents.submitted_at IS
  'Timestamp when the document was last submitted for approval';


-- ── SECTION 2: Extend dms_document_approvals ─────────────────────────────────

ALTER TABLE public.dms_document_approvals
  ADD COLUMN IF NOT EXISTS submitted_by BIGINT      NULL REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS reason       TEXT        NULL,
  ADD COLUMN IF NOT EXISTS is_current   BOOLEAN     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS updated_at   TIMESTAMPTZ NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_by   BIGINT      NULL REFERENCES public.user_profiles(id) ON DELETE SET NULL;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_dms_approvals_document_id
  ON public.dms_document_approvals (document_id);

CREATE INDEX IF NOT EXISTS idx_dms_approvals_document_current
  ON public.dms_document_approvals (document_id, is_current) WHERE is_current = true;

CREATE INDEX IF NOT EXISTS idx_dms_approvals_submitted_by
  ON public.dms_document_approvals (submitted_by) WHERE submitted_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_dms_approvals_actioned_by
  ON public.dms_document_approvals (actioned_by) WHERE actioned_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_dms_approvals_action
  ON public.dms_document_approvals (action);

CREATE INDEX IF NOT EXISTS idx_dms_approvals_submitted_at
  ON public.dms_document_approvals (submitted_at DESC) WHERE submitted_at IS NOT NULL;

COMMENT ON COLUMN public.dms_document_approvals.submitted_by  IS 'User who submitted the document for approval (copied from dms_documents.submitted_by at time of action)';
COMMENT ON COLUMN public.dms_document_approvals.submitted_at  IS 'When the document was submitted for approval';
COMMENT ON COLUMN public.dms_document_approvals.reason        IS 'Mandatory reason text when action = rejected; optional for other actions';
COMMENT ON COLUMN public.dms_document_approvals.is_current    IS 'True only on the active/pending approval request row for a document; false on all historical rows';
COMMENT ON COLUMN public.dms_document_approvals.updated_at    IS 'Last update timestamp';
COMMENT ON COLUMN public.dms_document_approvals.updated_by    IS 'User who last updated this row';


-- ── SECTION 3: Align dms_document_approvals.action CHECK constraint ──────────
-- No existing CHECK constraint on action (confirmed from live DB).
-- Table has 0 rows, so adding the constraint is safe.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.dms_document_approvals'::regclass
      AND conname   = 'dms_document_approvals_action_chk'
  ) THEN
    ALTER TABLE public.dms_document_approvals
      ADD CONSTRAINT dms_document_approvals_action_chk
      CHECK (action IN (
        'submitted',
        'approved',
        'rejected',
        'withdrawn',
        'returned',
        'escalated'
      ));
  END IF;
END;
$$;

COMMENT ON COLUMN public.dms_document_approvals.action IS
  'Approval action recorded: submitted | approved | rejected | withdrawn | returned | escalated';


-- ── SECTION 4: RLS policies on dms_document_approvals ────────────────────────

-- Drop old overly-broad policies
DROP POLICY IF EXISTS dms_approvals_select ON public.dms_document_approvals;
DROP POLICY IF EXISTS dms_approvals_insert ON public.dms_document_approvals;
DROP POLICY IF EXISTS dms_approvals_update ON public.dms_document_approvals;
DROP POLICY IF EXISTS dms_approvals_delete ON public.dms_document_approvals;

-- SELECT: user can see their own submission/action rows, or has approvals view/admin
CREATE POLICY dms_approvals_select
  ON public.dms_document_approvals
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND (
      current_user_has_permission('dms.admin')
      OR current_user_has_permission('dms.approvals.admin')
      OR current_user_has_permission('dms.approvals.view')
      OR current_user_has_permission('dms.approvals.history.view')
      OR current_user_has_permission('dms.documents.approve')
      OR current_user_has_role('system_admin')
      -- Own rows (submitted or actioned)
      OR submitted_by IN (
          SELECT id FROM public.user_profiles WHERE auth_user_id = auth.uid()
      )
      OR actioned_by IN (
          SELECT id FROM public.user_profiles WHERE auth_user_id = auth.uid()
      )
    )
  );

-- INSERT: submitters and approvers can insert audit rows
CREATE POLICY dms_approvals_insert
  ON public.dms_document_approvals
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND (
      current_user_has_permission('dms.admin')
      OR current_user_has_permission('dms.approvals.admin')
      OR current_user_has_permission('dms.approvals.submit')
      OR current_user_has_permission('dms.approvals.act')
      OR current_user_has_permission('dms.approvals.withdraw')
      OR current_user_has_permission('dms.documents.approve')
      OR current_user_has_role('system_admin')
    )
  );

-- UPDATE: approvers and admins can update (e.g. mark is_current=false on withdrawal)
CREATE POLICY dms_approvals_update
  ON public.dms_document_approvals
  FOR UPDATE
  USING (
    auth.uid() IS NOT NULL
    AND (
      current_user_has_permission('dms.admin')
      OR current_user_has_permission('dms.approvals.admin')
      OR current_user_has_permission('dms.approvals.act')
      OR current_user_has_permission('dms.approvals.withdraw')
      OR current_user_has_permission('dms.documents.approve')
      OR current_user_has_role('system_admin')
    )
  );

-- DELETE: admin / system_admin only
CREATE POLICY dms_approvals_delete
  ON public.dms_document_approvals
  FOR DELETE
  USING (
    auth.uid() IS NOT NULL
    AND (
      current_user_has_permission('dms.admin')
      OR current_user_has_permission('dms.approvals.admin')
      OR current_user_has_role('system_admin')
    )
  );


-- ── SECTION 5: Seed approval permissions ─────────────────────────────────────

INSERT INTO public.permissions
  (permission_code, permission_name, description, module_code, action_code, is_active)
VALUES
  ('dms.approvals.view',         'View DMS Approval Queue',           'View the approval queue and pending approval requests',       'DMS', 'view',    true),
  ('dms.approvals.submit',       'Submit DMS Documents for Approval', 'Submit own/assigned documents for approval',                  'DMS', 'create',  true),
  ('dms.approvals.act',          'Approve/Reject DMS Documents',      'Approve or reject documents pending approval',                'DMS', 'approve', true),
  ('dms.approvals.withdraw',     'Withdraw DMS Approval Request',     'Withdraw a pending approval request before final decision',   'DMS', 'manage',  true),
  ('dms.approvals.admin',        'Administer DMS Approvals',          'Full administration of approval workflows and overrides',     'DMS', 'admin',   true),
  ('dms.approvals.history.view', 'View DMS Approval History',         'View full approval audit history on document records',        'DMS', 'view',    true)
ON CONFLICT (permission_code) DO UPDATE
  SET permission_name = EXCLUDED.permission_name,
      description     = EXCLUDED.description,
      module_code     = EXCLUDED.module_code,
      action_code     = EXCLUDED.action_code,
      is_active       = EXCLUDED.is_active;


-- ── SECTION 6: Seed approval notification templates ──────────────────────────

INSERT INTO public.erp_notification_templates
  (template_code, template_name, source_module, notification_type,
   subject_template, text_template, html_template,
   default_severity, default_channel_in_app, default_channel_email,
   is_system, is_active, created_at, updated_at)
VALUES
  (
    'DMS_APPROVAL_REQUESTED',
    'DMS Document Submitted for Approval',
    'DMS',
    'approval_requested',
    'Approval Required: {{document_no}} — {{title}}',
    'Document {{document_no}} ({{title}}) has been submitted for approval by {{actor_name}} on {{action_date}}. Document type: {{document_type}}. Please review and approve or reject.',
    '<p>Document <strong>{{document_no}}</strong> (<em>{{title}}</em>) has been submitted for approval by <strong>{{actor_name}}</strong> on {{action_date}}.</p><p>Document type: {{document_type}}</p>{{#if comments_or_reason}}<p>Notes: {{comments_or_reason}}</p>{{/if}}<p><a href="{{action_url}}">Review Document</a></p>',
    'info', true, true, true, true, now(), now()
  ),
  (
    'DMS_APPROVED',
    'DMS Document Approved',
    'DMS',
    'approval_approved',
    'Document Approved: {{document_no}} — {{title}}',
    'Document {{document_no}} ({{title}}) has been approved by {{actor_name}} on {{action_date}}.{{#if comments_or_reason}} Comments: {{comments_or_reason}}{{/if}}',
    '<p>Document <strong>{{document_no}}</strong> (<em>{{title}}</em>) has been <span style="color:green;font-weight:bold">approved</span> by <strong>{{actor_name}}</strong> on {{action_date}}.</p>{{#if comments_or_reason}}<p>Comments: {{comments_or_reason}}</p>{{/if}}<p><a href="{{action_url}}">View Document</a></p>',
    'info', true, true, true, true, now(), now()
  ),
  (
    'DMS_REJECTED',
    'DMS Document Rejected',
    'DMS',
    'approval_rejected',
    'Document Rejected: {{document_no}} — {{title}}',
    'Document {{document_no}} ({{title}}) has been rejected by {{actor_name}} on {{action_date}}. Reason: {{comments_or_reason}}',
    '<p>Document <strong>{{document_no}}</strong> (<em>{{title}}</em>) has been <span style="color:red;font-weight:bold">rejected</span> by <strong>{{actor_name}}</strong> on {{action_date}}.</p><p><strong>Reason:</strong> {{comments_or_reason}}</p><p><a href="{{action_url}}">View Document</a></p>',
    'urgent', true, true, true, true, now(), now()
  ),
  (
    'DMS_APPROVAL_WITHDRAWN',
    'DMS Approval Request Withdrawn',
    'DMS',
    'approval_withdrawn',
    'Approval Withdrawn: {{document_no}} — {{title}}',
    'The approval request for document {{document_no}} ({{title}}) has been withdrawn by {{actor_name}} on {{action_date}}.{{#if comments_or_reason}} Reason: {{comments_or_reason}}{{/if}}',
    '<p>The approval request for document <strong>{{document_no}}</strong> (<em>{{title}}</em>) has been <strong>withdrawn</strong> by <strong>{{actor_name}}</strong> on {{action_date}}.</p>{{#if comments_or_reason}}<p>Reason: {{comments_or_reason}}</p>{{/if}}<p><a href="{{action_url}}">View Document</a></p>',
    'warning', true, false, true, true, now(), now()
  )
ON CONFLICT (template_code) DO NOTHING;


-- ── SECTION 7: Attach updated_at trigger to dms_document_workflows ───────────
-- set_updated_at() confirmed to exist in public schema.
-- No trigger currently exists on this table.

DROP TRIGGER IF EXISTS set_dms_document_workflows_updated_at ON public.dms_document_workflows;
CREATE TRIGGER set_dms_document_workflows_updated_at
  BEFORE UPDATE ON public.dms_document_workflows
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ── SECTION 8: Validation block ──────────────────────────────────────────────

DO $$
DECLARE
  v_col      TEXT;
  v_perm     TEXT;
  v_tpl      TEXT;
  v_chk      TEXT;
  v_trigger  TEXT;
BEGIN
  -- dms_documents columns
  FOR v_col IN SELECT unnest(ARRAY['approval_status','submitted_by','submitted_at']) LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='dms_documents' AND column_name=v_col
    ) THEN
      RAISE EXCEPTION 'DMS.2A VALIDATION FAILED: dms_documents.% missing', v_col;
    END IF;
  END LOOP;

  -- dms_document_approvals columns
  FOR v_col IN SELECT unnest(ARRAY['submitted_by','submitted_at','reason','is_current','updated_at','updated_by']) LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='dms_document_approvals' AND column_name=v_col
    ) THEN
      RAISE EXCEPTION 'DMS.2A VALIDATION FAILED: dms_document_approvals.% missing', v_col;
    END IF;
  END LOOP;

  -- action CHECK constraint
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.dms_document_approvals'::regclass
      AND conname='dms_document_approvals_action_chk'
  ) THEN
    RAISE EXCEPTION 'DMS.2A VALIDATION FAILED: dms_document_approvals_action_chk constraint missing';
  END IF;

  -- approval_status CHECK constraint
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.dms_documents'::regclass
      AND conname='dms_documents_approval_status_chk'
  ) THEN
    RAISE EXCEPTION 'DMS.2A VALIDATION FAILED: dms_documents_approval_status_chk constraint missing';
  END IF;

  -- Permissions
  FOR v_perm IN SELECT unnest(ARRAY[
    'dms.approvals.view','dms.approvals.submit','dms.approvals.act',
    'dms.approvals.withdraw','dms.approvals.admin','dms.approvals.history.view'
  ]) LOOP
    IF NOT EXISTS (SELECT 1 FROM public.permissions WHERE permission_code=v_perm) THEN
      RAISE EXCEPTION 'DMS.2A VALIDATION FAILED: permission % missing', v_perm;
    END IF;
  END LOOP;

  -- Notification templates
  FOR v_tpl IN SELECT unnest(ARRAY[
    'DMS_APPROVAL_REQUESTED','DMS_APPROVED','DMS_REJECTED','DMS_APPROVAL_WITHDRAWN'
  ]) LOOP
    IF NOT EXISTS (SELECT 1 FROM public.erp_notification_templates WHERE template_code=v_tpl AND is_active=true) THEN
      RAISE EXCEPTION 'DMS.2A VALIDATION FAILED: notification template % missing or inactive', v_tpl;
    END IF;
  END LOOP;

  -- dms_document_workflows trigger
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON t.tgrelid=c.oid
    WHERE c.relname='dms_document_workflows'
      AND t.tgname='set_dms_document_workflows_updated_at'
  ) THEN
    RAISE EXCEPTION 'DMS.2A VALIDATION FAILED: updated_at trigger missing on dms_document_workflows';
  END IF;

  RAISE NOTICE 'DMS.2A VALIDATION PASSED — all schema objects confirmed.';
END;
$$;
