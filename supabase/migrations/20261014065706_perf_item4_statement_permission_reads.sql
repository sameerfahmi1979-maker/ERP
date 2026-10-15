BEGIN;
SET LOCAL search_path=pg_catalog;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='8s';
-- Only statement-constant principal/capability checks become initplans.
-- Recipient comparisons and document-dependent predicates remain row-bound.
-- ALL policies below retain their exact write predicate/implicit WITH CHECK;
-- no permission, scope, lifecycle rule, role, grant or helper is changed.
DO $guard$
DECLARE target record; policy record; helper regprocedure;
BEGIN
 IF current_user<>'postgres' THEN RAISE EXCEPTION 'Reviewed migration owner required'; END IF;
 FOR target IN SELECT * FROM (VALUES
  ('erp_report_delivery_logs','rpt_delivery_select','8a46671651ed9608dd583d2637344131','SELECT','public'),
  ('erp_report_registry','rpt_registry_select','1d313f453f58afbba3932688db3eb7b1','SELECT','public'),
  ('erp_report_runs','rpt_runs_select_own','a506f50ba7c3ce75c6c67f9c70d081f0','SELECT','public'),
  ('erp_notifications','erp_notifications_select','579f5221dd283586ee7e3e1ea671c40e','SELECT','public'),
  ('erp_email_queue','erp_email_queue_scoped_select','da3b4c47ccb7fd745a45e9a75d79fa66','SELECT','authenticated'),
  ('erp_notification_delivery_logs','erp_notification_delivery_logs_admin','673180ef7807eabeb9bbb54b8a02a7ce','ALL','public'),
  ('erp_notification_templates','erp_notification_templates_select','dc71e447411e7aaf354179a11ad2e2ae','SELECT','public'),
  ('erp_notification_templates','erp_notification_templates_write','673180ef7807eabeb9bbb54b8a02a7ce','ALL','public'),
  ('dms_notification_queue','dms_notif_select','b747c4e5ffaadf4a29046d14b7599527','SELECT','authenticated')
 ) AS expected(tbl,pol,hash,command,role_name) LOOP
  SELECT * INTO STRICT policy FROM pg_policies WHERE schemaname='public' AND tablename=target.tbl AND policyname=target.pol;
  IF md5(policy.qual)<>target.hash OR policy.cmd<>target.command OR policy.permissive<>'PERMISSIVE'
   OR policy.roles IS DISTINCT FROM ARRAY[target.role_name]::name[] OR policy.with_check IS NOT NULL
   OR NOT EXISTS(SELECT 1 FROM pg_class WHERE oid=format('public.%I',target.tbl)::regclass AND relrowsecurity)
   OR NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=target.tbl AND policyname='f03_principal'
    AND permissive='RESTRICTIVE' AND cmd='ALL' AND roles=ARRAY['authenticated']::name[]
    AND qual='( SELECT erp_private.business_principal_is_active() AS business_principal_is_active)' AND with_check=qual)
  THEN RAISE EXCEPTION 'Reviewed item4 policy prerequisite drift: %',target.tbl; END IF;
 END LOOP;
 FOREACH helper IN ARRAY ARRAY['auth.uid()'::regprocedure,'public.current_user_profile_id()'::regprocedure,
  'public.current_user_is_global_admin()'::regprocedure,'public.current_user_has_permission(text)'::regprocedure,
  'public.current_user_has_permission_any_scope(text)'::regprocedure] LOOP
  IF (SELECT provolatile FROM pg_proc WHERE oid=helper)<>'s' THEN RAISE EXCEPTION 'Stable principal helper required'; END IF;
 END LOOP;
END $guard$;
ALTER POLICY rpt_delivery_select ON public.erp_report_delivery_logs USING ((SELECT public.current_user_has_permission('reports.history.view')));
ALTER POLICY rpt_registry_select ON public.erp_report_registry USING ((SELECT public.current_user_has_permission('reports.view')));
ALTER POLICY rpt_runs_select_own ON public.erp_report_runs USING (
 run_by=(SELECT id FROM public.user_profiles WHERE auth_user_id=(SELECT auth.uid()) LIMIT 1)
 OR (SELECT public.current_user_has_permission('reports.history.view'))
);
ALTER POLICY erp_notifications_select ON public.erp_notifications USING (
 (SELECT auth.uid()) IS NOT NULL AND (recipient_user_id=(SELECT public.current_user_profile_id())
 OR (SELECT public.current_user_is_global_admin()) OR (SELECT public.current_user_has_permission('notifications.admin'))
 OR (SELECT public.current_user_has_permission('notifications.manage')) OR (SELECT public.current_user_has_permission('dms.notifications.admin')))
);
ALTER POLICY erp_email_queue_scoped_select ON public.erp_email_queue USING (
 (SELECT public.current_user_is_global_admin()) OR (SELECT public.current_user_has_permission_any_scope('notifications.email_queue.view'))
 OR (SELECT public.current_user_has_permission_any_scope('notifications.email_queue.manage')) OR (SELECT public.current_user_has_permission_any_scope('notifications.email_queue.process'))
 OR (SELECT public.current_user_has_permission_any_scope('notifications.manage')) OR (SELECT public.current_user_has_permission_any_scope('notifications.admin'))
);
ALTER POLICY erp_notification_delivery_logs_admin ON public.erp_notification_delivery_logs USING (
 (SELECT public.current_user_is_global_admin()) OR (SELECT public.current_user_has_permission('notifications.admin')) OR (SELECT public.current_user_has_permission('dms.notifications.admin'))
);
ALTER POLICY erp_notification_templates_select ON public.erp_notification_templates USING ((SELECT auth.uid()) IS NOT NULL);
ALTER POLICY erp_notification_templates_write ON public.erp_notification_templates USING (
 (SELECT public.current_user_is_global_admin()) OR (SELECT public.current_user_has_permission('notifications.admin')) OR (SELECT public.current_user_has_permission('dms.notifications.admin'))
);
ALTER POLICY dms_notif_select ON public.dms_notification_queue USING (
 (SELECT auth.uid()) IS NOT NULL AND ((SELECT public.current_user_is_global_admin())
 OR recipient_user_id=(SELECT public.current_user_profile_id())
 OR erp_private.document_permission(document_id,'dms.admin') OR erp_private.document_permission(document_id,'dms.notifications.admin')
 OR erp_private.document_permission(document_id,'dms.notifications.manage'))
);
COMMIT;
