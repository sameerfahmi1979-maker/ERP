BEGIN;
SET LOCAL lock_timeout = '5s';

-- Admit the explicit global reporting role to masked delivery metadata.
-- The underlying log and its existing raw diagnostic permissions are unchanged.
CREATE OR REPLACE VIEW public.perf_notification_delivery_read
WITH (security_invoker = false, security_barrier = true) AS
SELECT id, notification_id, email_queue_id, delivery_channel, status, duration_ms, attempt_number, created_at,
  CASE WHEN message IS NOT NULL AND message <> '' THEN 'Delivery diagnostic recorded.'::text END AS message,
  CASE WHEN error_message IS NOT NULL AND error_message <> ''
    THEN 'Delivery error recorded; inspect the authorized diagnostic record.'::text END AS error_message,
  id::text AS id_search, notification_id::text AS notification_search, email_queue_id::text AS queue_search,
  attempt_number::text AS attempt_search, duration_ms::text AS duration_search
FROM public.erp_notification_delivery_logs
WHERE (SELECT public.current_user_has_permission('notifications.logs.view'))
   OR (SELECT public.current_user_has_permission('notifications.admin'));

REVOKE ALL ON public.perf_notification_delivery_read FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.perf_notification_delivery_read TO authenticated;

-- The catalogue carries only metadata. Wording and writes require edit authority.
CREATE VIEW public.notification_template_metadata_read
WITH (security_barrier = true) AS
SELECT id, template_code, template_name, source_module, notification_type, default_severity,
  default_channel_in_app, default_channel_email, is_active
FROM public.erp_notification_templates
WHERE deleted_at IS NULL AND ((SELECT public.current_user_has_permission('notifications.templates.view'))
   OR (SELECT public.current_user_has_permission('notifications.admin')));

REVOKE ALL ON public.notification_template_metadata_read FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.notification_template_metadata_read TO authenticated;

DROP POLICY erp_notification_templates_select ON public.erp_notification_templates;
DROP POLICY erp_notification_templates_write ON public.erp_notification_templates;

CREATE POLICY erp_notification_templates_editor_read ON public.erp_notification_templates FOR SELECT TO authenticated
USING (
  (SELECT public.current_user_has_permission('notifications.admin')) OR
  ((SELECT public.current_user_has_permission('notifications.templates.view'))
    AND (SELECT public.current_user_has_permission('notifications.templates.manage')))
);

CREATE POLICY erp_notification_templates_editor_insert ON public.erp_notification_templates FOR INSERT TO authenticated
WITH CHECK (
  (SELECT public.current_user_has_permission('notifications.admin')) OR
  ((SELECT public.current_user_has_permission('notifications.templates.view'))
    AND (SELECT public.current_user_has_permission('notifications.templates.manage')))
);

CREATE POLICY erp_notification_templates_editor_update ON public.erp_notification_templates FOR UPDATE TO authenticated
USING (
  (SELECT public.current_user_has_permission('notifications.admin')) OR
  ((SELECT public.current_user_has_permission('notifications.templates.view'))
    AND (SELECT public.current_user_has_permission('notifications.templates.manage')))
)
WITH CHECK (
  (SELECT public.current_user_has_permission('notifications.admin')) OR
  ((SELECT public.current_user_has_permission('notifications.templates.view'))
    AND (SELECT public.current_user_has_permission('notifications.templates.manage')))
);

CREATE POLICY erp_notification_templates_admin_delete ON public.erp_notification_templates FOR DELETE TO authenticated
USING ((SELECT public.current_user_has_permission('notifications.admin')));

-- The configuration applies across employers. Scoped DMS recipient actions
-- keep their own permissions and use server-side policy reads after admission.
DROP POLICY dms_notification_settings_select ON public.dms_notification_settings;
DROP POLICY dms_notification_settings_manage ON public.dms_notification_settings;

CREATE POLICY dms_notification_settings_global_read ON public.dms_notification_settings FOR SELECT TO authenticated
USING (
  (SELECT public.current_user_has_permission('dms.admin'))
  OR (SELECT public.current_user_has_permission('dms.notifications.view'))
  OR (SELECT public.current_user_has_permission('dms.notifications.manage'))
  OR (SELECT public.current_user_has_permission('dms.notifications.settings.manage'))
);

CREATE POLICY dms_notification_settings_global_insert ON public.dms_notification_settings FOR INSERT TO authenticated
WITH CHECK (
  (SELECT public.current_user_has_permission('dms.admin'))
  OR (SELECT public.current_user_has_permission('dms.notifications.manage'))
  OR (SELECT public.current_user_has_permission('dms.notifications.settings.manage'))
);

CREATE POLICY dms_notification_settings_global_update ON public.dms_notification_settings FOR UPDATE TO authenticated
USING (
  (SELECT public.current_user_has_permission('dms.admin'))
  OR (SELECT public.current_user_has_permission('dms.notifications.manage'))
  OR (SELECT public.current_user_has_permission('dms.notifications.settings.manage'))
)
WITH CHECK (
  (SELECT public.current_user_has_permission('dms.admin'))
  OR (SELECT public.current_user_has_permission('dms.notifications.manage'))
  OR (SELECT public.current_user_has_permission('dms.notifications.settings.manage'))
);

CREATE POLICY dms_notification_settings_global_admin_delete ON public.dms_notification_settings FOR DELETE TO authenticated
USING (
  (SELECT public.current_user_has_permission('dms.admin'))
  OR (SELECT public.current_user_has_permission('dms.notifications.manage'))
);

NOTIFY pgrst, 'reload schema';
COMMIT;
