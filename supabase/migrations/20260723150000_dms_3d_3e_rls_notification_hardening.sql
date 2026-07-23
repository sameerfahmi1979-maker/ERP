-- ============================================================
-- DMS.3D/E Combined — RLS Hardening + Notification Security
-- Migration: 20260723150000_dms_3d_3e_rls_notification_hardening.sql
-- Phase: DMS.3D + DMS.3E
-- Date: 2026-07-23
-- Scope:
--   PART 1: RLS helper functions
--   PART 2: dms_documents SELECT policy hardened (confidentiality)
--   PART 3: DMS child table SELECT policies hardened (cascade)
--   PART 4: dms_workflow_document_types RLS enabled + policies
--   PART 5: erp_notifications policies replaced (ALL:true removed)
--   PART 6: erp_notification_templates policies replaced
--   PART 7: erp_email_send_logs / erp_notification_delivery_logs replaced
--   PART 8: dms_notification_queue SELECT tightened
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- PART 1: RLS helper functions (SECURITY DEFINER)
-- ──────────────────────────────────────────────────────────────

-- Helper: can the current session user view documents at a given confidentiality level?
-- Used by the notification queue and other level-based checks.
CREATE OR REPLACE FUNCTION public.current_user_can_view_dms_confidentiality(p_level TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Admins see everything
  IF public.current_user_is_global_admin() OR public.current_user_has_permission('dms.admin') THEN
    RETURN TRUE;
  END IF;
  -- Must have base view permission
  IF NOT public.current_user_has_permission('dms.documents.view') THEN
    RETURN FALSE;
  END IF;
  -- Non-sensitive levels: base permission sufficient
  IF p_level IN ('internal', 'company') THEN
    RETURN TRUE;
  END IF;
  -- Sensitive levels: require per-level permission
  RETURN public.current_user_has_permission('dms.documents.view.' || p_level);
END;
$$;

-- Helper: can the current session user view a specific DMS document?
-- Handles admin/system_admin bypass, owner/creator bypass, per-level permissions,
-- and a narrow bypass for active approvers on pending-approval documents.
--
-- NOTE: This function is SECURITY DEFINER. Its inner queries on dms_documents and
-- dms_document_approvals bypass RLS on those tables (runs as the definer role).
-- This is intentional and necessary to avoid recursive policy evaluation loops.
CREATE OR REPLACE FUNCTION public.current_user_can_view_dms_document(p_document_id BIGINT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_level          TEXT;
  v_owner_user_id  BIGINT;
  v_created_by     BIGINT;
  v_profile_id     BIGINT;
BEGIN
  -- Fast path: admins bypass all checks
  IF public.current_user_is_global_admin() OR public.current_user_has_permission('dms.admin') THEN
    RETURN TRUE;
  END IF;

  -- Must have at least the base DMS view permission or an approval-act permission
  IF NOT public.current_user_has_permission('dms.documents.view')
     AND NOT public.current_user_has_permission('dms.approvals.act')
     AND NOT public.current_user_has_permission('dms.approvals.admin') THEN
    RETURN FALSE;
  END IF;

  -- Load the document metadata (SECURITY DEFINER bypasses RLS here; no recursive loop)
  SELECT confidentiality_level, owner_user_id, created_by
  INTO   v_level, v_owner_user_id, v_created_by
  FROM   public.dms_documents
  WHERE  id = p_document_id
    AND  deleted_at IS NULL;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  -- Non-sensitive levels: base dms.documents.view is sufficient
  IF v_level IN ('internal', 'company') THEN
    RETURN public.current_user_has_permission('dms.documents.view');
  END IF;

  -- Owner or creator: allowed for their own sensitive documents
  v_profile_id := public.current_user_profile_id();
  IF v_profile_id IS NOT NULL
     AND (v_owner_user_id = v_profile_id OR v_created_by = v_profile_id) THEN
    RETURN TRUE;
  END IF;

  -- Sensitive-level per-permission check
  IF public.current_user_has_permission('dms.documents.view.' || v_level) THEN
    RETURN TRUE;
  END IF;

  -- Narrow approver bypass: users with dms.approvals.act may view confidential documents
  -- that currently have an active pending-approval record.
  -- This allows legitimate approvers to read the document they need to act on,
  -- even if they do not hold the per-level confidentiality permission.
  IF public.current_user_has_permission('dms.approvals.act') OR
     public.current_user_has_permission('dms.approvals.admin') THEN
    IF EXISTS (
      SELECT 1
      FROM   public.dms_document_approvals da
      WHERE  da.document_id = p_document_id
        AND  da.is_current  = TRUE
        AND  da.action = 'submitted'
    ) THEN
      RETURN TRUE;
    END IF;
  END IF;

  RETURN FALSE;
END;
$$;

-- Helper: can the current user admin DMS notifications?
CREATE OR REPLACE FUNCTION public.current_user_can_manage_dms_notifications()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN (
    public.current_user_is_global_admin()
    OR public.current_user_has_permission('dms.notifications.admin')
    OR public.current_user_has_permission('notifications.admin')
    OR public.current_user_has_permission('notifications.manage')
  );
END;
$$;

-- ──────────────────────────────────────────────────────────────
-- PART 2: dms_documents SELECT — add confidentiality enforcement
-- ──────────────────────────────────────────────────────────────

-- Replace the existing SELECT policy that only checked dms.documents.view.
-- New policy delegates all logic to current_user_can_view_dms_document().

DROP POLICY IF EXISTS dms_documents_select ON public.dms_documents;
CREATE POLICY dms_documents_select
  ON public.dms_documents
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND public.current_user_can_view_dms_document(id)
  );

-- ──────────────────────────────────────────────────────────────
-- PART 3: DMS child tables — confidentiality cascade via parent
-- ──────────────────────────────────────────────────────────────

-- dms_document_files
DROP POLICY IF EXISTS dms_files_select ON public.dms_document_files;
CREATE POLICY dms_files_select
  ON public.dms_document_files
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND (
      public.current_user_has_permission('dms.documents.preview')
      OR public.current_user_has_permission('dms.documents.view')
      OR public.current_user_is_global_admin()
    )
    AND public.current_user_can_view_dms_document(document_id)
  );

-- dms_document_versions
DROP POLICY IF EXISTS dms_versions_select ON public.dms_document_versions;
CREATE POLICY dms_versions_select
  ON public.dms_document_versions
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND (
      public.current_user_has_permission('dms.documents.view')
      OR public.current_user_is_global_admin()
    )
    AND public.current_user_can_view_dms_document(document_id)
  );

-- dms_document_metadata_values
DROP POLICY IF EXISTS dms_metadata_vals_select ON public.dms_document_metadata_values;
CREATE POLICY dms_metadata_vals_select
  ON public.dms_document_metadata_values
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND public.current_user_has_permission('dms.documents.view')
    AND public.current_user_can_view_dms_document(document_id)
  );

-- dms_document_links
DROP POLICY IF EXISTS dms_links_select ON public.dms_document_links;
CREATE POLICY dms_links_select
  ON public.dms_document_links
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND public.current_user_has_permission('dms.documents.view')
    AND public.current_user_can_view_dms_document(document_id)
  );

-- dms_document_tags
DROP POLICY IF EXISTS dms_doc_tags_select ON public.dms_document_tags;
CREATE POLICY dms_doc_tags_select
  ON public.dms_document_tags
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND public.current_user_has_permission('dms.documents.view')
    AND public.current_user_can_view_dms_document(document_id)
  );

-- dms_document_comments
DROP POLICY IF EXISTS dms_comments_select ON public.dms_document_comments;
CREATE POLICY dms_comments_select
  ON public.dms_document_comments
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND public.current_user_has_permission('dms.documents.view')
    AND public.current_user_can_view_dms_document(document_id)
  );

-- dms_document_events
DROP POLICY IF EXISTS dms_events_select ON public.dms_document_events;
CREATE POLICY dms_events_select
  ON public.dms_document_events
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND (
      public.current_user_has_permission('dms.documents.view')
      OR public.current_user_is_global_admin()
    )
    AND public.current_user_can_view_dms_document(document_id)
  );

-- dms_document_content
DROP POLICY IF EXISTS dms_doc_content_select ON public.dms_document_content;
CREATE POLICY dms_doc_content_select
  ON public.dms_document_content
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND public.current_user_has_permission('dms.documents.view')
    AND public.current_user_can_view_dms_document(document_id)
  );

-- dms_document_content_chunks
-- Replace the existing partial check with the full helper (covers all sensitive levels including finance)
DROP POLICY IF EXISTS dms_chunks_select ON public.dms_document_content_chunks;
CREATE POLICY dms_chunks_select
  ON public.dms_document_content_chunks
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND public.current_user_has_permission('dms.documents.view')
    AND public.current_user_can_view_dms_document(document_id)
  );

-- ──────────────────────────────────────────────────────────────
-- PART 4: dms_workflow_document_types — enable RLS + add policies
-- ──────────────────────────────────────────────────────────────

ALTER TABLE public.dms_workflow_document_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dms_workflow_document_types FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS dms_wf_doc_types_select ON public.dms_workflow_document_types;
CREATE POLICY dms_wf_doc_types_select
  ON public.dms_workflow_document_types
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND (
      public.current_user_has_permission('dms.documents.view')
      OR public.current_user_has_permission('dms.approvals.admin')
      OR public.current_user_has_permission('dms.admin')
      OR public.current_user_is_global_admin()
    )
  );

DROP POLICY IF EXISTS dms_wf_doc_types_manage ON public.dms_workflow_document_types;
CREATE POLICY dms_wf_doc_types_manage
  ON public.dms_workflow_document_types
  FOR ALL
  USING (
    public.current_user_has_permission('dms.approvals.admin')
    OR public.current_user_has_permission('dms.admin')
    OR public.current_user_is_global_admin()
  );

-- ──────────────────────────────────────────────────────────────
-- PART 5: erp_notifications — replace ALL:true with scoped policies
-- ──────────────────────────────────────────────────────────────

-- Remove the dangerous catch-all policy
DROP POLICY IF EXISTS erp_notifications_authenticated ON public.erp_notifications;

-- SELECT: recipient sees own, admins see all
DROP POLICY IF EXISTS erp_notifications_select ON public.erp_notifications;
CREATE POLICY erp_notifications_select
  ON public.erp_notifications
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND (
      recipient_user_id = public.current_user_profile_id()
      OR public.current_user_is_global_admin()
      OR public.current_user_has_permission('notifications.admin')
      OR public.current_user_has_permission('notifications.manage')
      OR public.current_user_has_permission('dms.notifications.admin')
    )
  );

-- INSERT: only users with notification management permission (or admin client bypasses RLS)
-- Note: sendApprovalNotification uses createAdminClient() so it always bypasses this policy.
-- createNotification() uses session client and requires notifications.manage server-side.
DROP POLICY IF EXISTS erp_notifications_insert ON public.erp_notifications;
CREATE POLICY erp_notifications_insert
  ON public.erp_notifications
  FOR INSERT
  WITH CHECK (
    public.current_user_is_global_admin()
    OR public.current_user_has_permission('notifications.manage')
    OR public.current_user_has_permission('notifications.admin')
    OR public.current_user_has_permission('dms.notifications.admin')
  );

-- UPDATE: recipient can update own (mark-read, dismiss); admins can update all
DROP POLICY IF EXISTS erp_notifications_update ON public.erp_notifications;
CREATE POLICY erp_notifications_update
  ON public.erp_notifications
  FOR UPDATE
  USING (
    auth.uid() IS NOT NULL
    AND (
      recipient_user_id = public.current_user_profile_id()
      OR public.current_user_is_global_admin()
      OR public.current_user_has_permission('notifications.admin')
      OR public.current_user_has_permission('dms.notifications.admin')
    )
  )
  WITH CHECK (
    recipient_user_id = public.current_user_profile_id()
    OR public.current_user_is_global_admin()
    OR public.current_user_has_permission('notifications.admin')
    OR public.current_user_has_permission('dms.notifications.admin')
  );

-- DELETE: admin only (normal users use dismiss/archive)
DROP POLICY IF EXISTS erp_notifications_delete ON public.erp_notifications;
CREATE POLICY erp_notifications_delete
  ON public.erp_notifications
  FOR DELETE
  USING (
    public.current_user_is_global_admin()
    OR public.current_user_has_permission('notifications.admin')
    OR public.current_user_has_permission('dms.notifications.admin')
  );

-- ──────────────────────────────────────────────────────────────
-- PART 6: erp_notification_templates — replace ALL:true
-- ──────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS erp_notification_templates_authenticated ON public.erp_notification_templates;

-- SELECT: any authenticated user can read templates (needed for rendering notification content)
DROP POLICY IF EXISTS erp_notification_templates_select ON public.erp_notification_templates;
CREATE POLICY erp_notification_templates_select
  ON public.erp_notification_templates
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- INSERT/UPDATE/DELETE: admin/system_admin only (templates should not be user-editable)
DROP POLICY IF EXISTS erp_notification_templates_write ON public.erp_notification_templates;
CREATE POLICY erp_notification_templates_write
  ON public.erp_notification_templates
  FOR ALL
  USING (
    public.current_user_is_global_admin()
    OR public.current_user_has_permission('notifications.admin')
    OR public.current_user_has_permission('dms.notifications.admin')
  );

-- ──────────────────────────────────────────────────────────────
-- PART 7: erp_email_send_logs + erp_notification_delivery_logs
-- Replace ALL:true with admin-only
-- ──────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS erp_email_send_logs_authenticated ON public.erp_email_send_logs;

DROP POLICY IF EXISTS erp_email_send_logs_admin ON public.erp_email_send_logs;
CREATE POLICY erp_email_send_logs_admin
  ON public.erp_email_send_logs
  FOR ALL
  USING (
    public.current_user_is_global_admin()
    OR public.current_user_has_permission('notifications.admin')
    OR public.current_user_has_permission('dms.notifications.admin')
  );

DROP POLICY IF EXISTS erp_notification_delivery_logs_authenticated ON public.erp_notification_delivery_logs;

DROP POLICY IF EXISTS erp_notification_delivery_logs_admin ON public.erp_notification_delivery_logs;
CREATE POLICY erp_notification_delivery_logs_admin
  ON public.erp_notification_delivery_logs
  FOR ALL
  USING (
    public.current_user_is_global_admin()
    OR public.current_user_has_permission('notifications.admin')
    OR public.current_user_has_permission('dms.notifications.admin')
  );

-- ──────────────────────────────────────────────────────────────
-- PART 8: dms_notification_queue — tighten SELECT to recipient-scoped
-- ──────────────────────────────────────────────────────────────

-- Old SELECT: any user with dms.documents.view can see ALL queue rows.
-- New SELECT: recipient sees own, admins see all.

DROP POLICY IF EXISTS dms_notif_select ON public.dms_notification_queue;
CREATE POLICY dms_notif_select
  ON public.dms_notification_queue
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND (
      recipient_user_id = public.current_user_profile_id()
      OR public.current_user_has_permission('dms.admin')
      OR public.current_user_has_permission('dms.notifications.admin')
      OR public.current_user_has_permission('dms.notifications.manage')
      OR public.current_user_is_global_admin()
    )
  );

-- ──────────────────────────────────────────────────────────────
-- Validation block
-- ──────────────────────────────────────────────────────────────

DO $$
BEGIN
  -- Helper functions exist
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname='current_user_can_view_dms_document' AND pronamespace='public'::regnamespace) THEN
    RAISE EXCEPTION 'VALIDATION FAILED: current_user_can_view_dms_document not found';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname='current_user_can_view_dms_confidentiality' AND pronamespace='public'::regnamespace) THEN
    RAISE EXCEPTION 'VALIDATION FAILED: current_user_can_view_dms_confidentiality not found';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname='current_user_can_manage_dms_notifications' AND pronamespace='public'::regnamespace) THEN
    RAISE EXCEPTION 'VALIDATION FAILED: current_user_can_manage_dms_notifications not found';
  END IF;
  -- dms_documents_select has confidentiality check
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='dms_documents' AND policyname='dms_documents_select') THEN
    RAISE EXCEPTION 'VALIDATION FAILED: dms_documents_select policy not found';
  END IF;
  -- dms_workflow_document_types has RLS
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname='dms_workflow_document_types' AND relrowsecurity=TRUE AND relnamespace='public'::regnamespace) THEN
    RAISE EXCEPTION 'VALIDATION FAILED: dms_workflow_document_types RLS not enabled';
  END IF;
  -- erp_notifications has no ALL:true policy
  IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename='erp_notifications' AND policyname='erp_notifications_authenticated') THEN
    RAISE EXCEPTION 'VALIDATION FAILED: erp_notifications_authenticated (ALL:true) policy still exists';
  END IF;
  -- erp_notification_templates has no ALL:true policy
  IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename='erp_notification_templates' AND policyname='erp_notification_templates_authenticated') THEN
    RAISE EXCEPTION 'VALIDATION FAILED: erp_notification_templates_authenticated (ALL:true) policy still exists';
  END IF;
  -- erp_email_send_logs has no ALL:true policy
  IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename='erp_email_send_logs' AND policyname='erp_email_send_logs_authenticated') THEN
    RAISE EXCEPTION 'VALIDATION FAILED: erp_email_send_logs_authenticated (ALL:true) policy still exists';
  END IF;
  -- erp_notification_delivery_logs has no ALL:true policy
  IF EXISTS (SELECT 1 FROM pg_policies WHERE tablename='erp_notification_delivery_logs' AND policyname='erp_notification_delivery_logs_authenticated') THEN
    RAISE EXCEPTION 'VALIDATION FAILED: erp_notification_delivery_logs_authenticated (ALL:true) policy still exists';
  END IF;

  RAISE NOTICE 'DMS.3D/E validation PASSED';
END $$;
