-- ERP USERS.5 — Narrow erp_email_queue RLS
-- Phase: ERP USERS.5 Security Hardening
-- Replaces: broad authenticated ALL policy with scoped, permission-based policies
-- Service-role (admin client) always bypasses RLS.

-- ── Drop broad policy ────────────────────────────────────────────────────────

DROP POLICY IF EXISTS erp_email_queue_authenticated ON public.erp_email_queue;

-- ── Scoped SELECT ────────────────────────────────────────────────────────────
-- Admin / notification managers / email queue viewers may read

CREATE POLICY erp_email_queue_scoped_select
ON public.erp_email_queue
FOR SELECT
TO authenticated
USING (
  current_user_is_global_admin()
  OR current_user_has_permission_any_scope('notifications.email_queue.view')
  OR current_user_has_permission_any_scope('notifications.email_queue.manage')
  OR current_user_has_permission_any_scope('notifications.email_queue.process')
  OR current_user_has_permission_any_scope('notifications.manage')
  OR current_user_has_permission_any_scope('notifications.admin')
);

-- ── Scoped INSERT ─────────────────────────────────────────────────────────────
-- Only queue managers / notification admin may insert (or service role)

CREATE POLICY erp_email_queue_scoped_insert
ON public.erp_email_queue
FOR INSERT
TO authenticated
WITH CHECK (
  current_user_is_global_admin()
  OR current_user_has_permission_any_scope('notifications.email_queue.manage')
  OR current_user_has_permission_any_scope('notifications.manage')
  OR current_user_has_permission_any_scope('notifications.admin')
);

-- ── Scoped UPDATE ─────────────────────────────────────────────────────────────
-- Only queue managers / notification admin / processor may update (process/retry)

CREATE POLICY erp_email_queue_scoped_update
ON public.erp_email_queue
FOR UPDATE
TO authenticated
USING (
  current_user_is_global_admin()
  OR current_user_has_permission_any_scope('notifications.email_queue.manage')
  OR current_user_has_permission_any_scope('notifications.email_queue.process')
  OR current_user_has_permission_any_scope('notifications.manage')
  OR current_user_has_permission_any_scope('notifications.admin')
)
WITH CHECK (
  current_user_is_global_admin()
  OR current_user_has_permission_any_scope('notifications.email_queue.manage')
  OR current_user_has_permission_any_scope('notifications.email_queue.process')
  OR current_user_has_permission_any_scope('notifications.manage')
  OR current_user_has_permission_any_scope('notifications.admin')
);

-- ── Verification ─────────────────────────────────────────────────────────────
-- Run after applying: SELECT tablename, policyname, cmd FROM pg_policies WHERE tablename = 'erp_email_queue';
