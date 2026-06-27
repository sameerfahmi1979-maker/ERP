-- ERP DMS.14 RLS Parity Backfill (Phase 2 Step 0)
-- Aligns repo migrations with live DMS.14 scoped policies.
-- Idempotent: safe on fresh install and existing DB.

-- ── dms_expiry_reminders ─────────────────────────────────────────────────────

DROP POLICY IF EXISTS dms_expiry_reminders_authenticated ON public.dms_expiry_reminders;

DROP POLICY IF EXISTS dms_expiry_select ON public.dms_expiry_reminders;
CREATE POLICY dms_expiry_select ON public.dms_expiry_reminders
  FOR SELECT TO authenticated
  USING (
    auth.uid() IS NOT NULL
    AND (
      current_user_has_permission('dms.documents.view')
      OR current_user_has_role('system_admin')
    )
  );

DROP POLICY IF EXISTS dms_expiry_manage ON public.dms_expiry_reminders;
CREATE POLICY dms_expiry_manage ON public.dms_expiry_reminders
  FOR ALL TO authenticated
  USING (
    current_user_has_permission('dms.admin')
    OR current_user_has_role('system_admin')
  )
  WITH CHECK (
    current_user_has_permission('dms.admin')
    OR current_user_has_role('system_admin')
  );

-- ── dms_notification_queue ───────────────────────────────────────────────────

DROP POLICY IF EXISTS dms_notification_queue_authenticated ON public.dms_notification_queue;

DROP POLICY IF EXISTS dms_notif_select ON public.dms_notification_queue;
CREATE POLICY dms_notif_select ON public.dms_notification_queue
  FOR SELECT TO authenticated
  USING (
    auth.uid() IS NOT NULL
    AND (
      current_user_has_permission('dms.documents.view')
      OR current_user_has_permission('dms.admin')
      OR current_user_has_role('system_admin')
    )
  );

DROP POLICY IF EXISTS dms_notif_write ON public.dms_notification_queue;
CREATE POLICY dms_notif_write ON public.dms_notification_queue
  FOR ALL TO authenticated
  USING (
    current_user_has_permission('dms.admin')
    OR current_user_has_role('system_admin')
  )
  WITH CHECK (
    current_user_has_permission('dms.admin')
    OR current_user_has_role('system_admin')
  );

-- ── dms_renewal_requests ─────────────────────────────────────────────────────

DROP POLICY IF EXISTS dms_renewal_requests_authenticated ON public.dms_renewal_requests;

DROP POLICY IF EXISTS dms_renewals_select ON public.dms_renewal_requests;
CREATE POLICY dms_renewals_select ON public.dms_renewal_requests
  FOR SELECT TO authenticated
  USING (
    auth.uid() IS NOT NULL
    AND (
      current_user_has_permission('dms.documents.view')
      OR current_user_has_permission('dms.admin')
      OR current_user_has_role('system_admin')
    )
  );

DROP POLICY IF EXISTS dms_renewals_insert ON public.dms_renewal_requests;
CREATE POLICY dms_renewals_insert ON public.dms_renewal_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    current_user_has_permission('dms.documents.edit')
    OR current_user_has_permission('dms.admin')
    OR current_user_has_role('system_admin')
  );

DROP POLICY IF EXISTS dms_renewals_update ON public.dms_renewal_requests;
CREATE POLICY dms_renewals_update ON public.dms_renewal_requests
  FOR UPDATE TO authenticated
  USING (
    current_user_has_permission('dms.documents.edit')
    OR current_user_has_permission('dms.admin')
    OR current_user_has_role('system_admin')
  )
  WITH CHECK (
    current_user_has_permission('dms.documents.edit')
    OR current_user_has_permission('dms.admin')
    OR current_user_has_role('system_admin')
  );

DROP POLICY IF EXISTS dms_renewals_delete ON public.dms_renewal_requests;
CREATE POLICY dms_renewals_delete ON public.dms_renewal_requests
  FOR DELETE TO authenticated
  USING (
    current_user_has_permission('dms.documents.delete')
    OR current_user_has_permission('dms.admin')
    OR current_user_has_role('system_admin')
  );
