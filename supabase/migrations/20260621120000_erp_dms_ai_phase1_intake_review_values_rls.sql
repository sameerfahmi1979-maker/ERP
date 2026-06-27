-- ERP DMS AI Phase 1 — Tighten dms_intake_review_values RLS
--
-- Backfills DMS.14 security fix for fresh installs. Live Supabase already has
-- these policies; migration is idempotent (DROP IF EXISTS + CREATE).

DROP POLICY IF EXISTS "auth_users_manage_intake_review_values" ON public.dms_intake_review_values;

ALTER TABLE public.dms_intake_review_values FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS dms_intake_review_select ON public.dms_intake_review_values;
CREATE POLICY dms_intake_review_select ON public.dms_intake_review_values
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.dms_upload_sessions s
      WHERE s.id = dms_intake_review_values.upload_session_id
        AND (
          s.uploaded_by = current_user_profile_id()
          OR current_user_has_permission('dms.documents.review_ai')
          OR current_user_has_permission('dms.admin')
          OR current_user_has_role('system_admin')
        )
    )
  );

DROP POLICY IF EXISTS dms_intake_review_write ON public.dms_intake_review_values;
CREATE POLICY dms_intake_review_write ON public.dms_intake_review_values
  FOR ALL
  TO authenticated
  USING (
    current_user_has_permission('dms.documents.upload')
    OR current_user_has_permission('dms.documents.review_ai')
    OR current_user_has_permission('dms.admin')
    OR current_user_has_role('system_admin')
  )
  WITH CHECK (
    current_user_has_permission('dms.documents.upload')
    OR current_user_has_permission('dms.documents.review_ai')
    OR current_user_has_permission('dms.admin')
    OR current_user_has_role('system_admin')
  );
