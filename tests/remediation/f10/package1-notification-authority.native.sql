\set ON_ERROR_STOP on
BEGIN;

DO $$
BEGIN
  IF current_database() !~ '^package1_[a-z0-9_]+$'
    OR current_setting('cron.launch_active_jobs') IS DISTINCT FROM 'off'
    OR (SELECT shobj_description(oid, 'pg_database') FROM pg_database WHERE datname = current_database())
      IS DISTINCT FROM 'Isolated HR T00 20261119'
  THEN RAISE EXCEPTION 'A marked isolated Package 1 test database is required'; END IF;
END;
$$;

INSERT INTO public.owner_companies(id, company_code, legal_name_en) OVERRIDING SYSTEM VALUE
VALUES (918201, 'P1-NOTIFY-A', 'Synthetic notification test company');
INSERT INTO public.branches(id, owner_company_id, branch_code, branch_name_en) OVERRIDING SYSTEM VALUE
VALUES (918211, 918201, 'P1-NOTIFY-A1', 'Synthetic notification test branch');

INSERT INTO auth.users(id, email, aud, role, email_confirmed_at)
SELECT ('91820000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
  'package1-notification-' || i || '@example.invalid', 'authenticated', 'authenticated', now()
FROM generate_series(1, 5) i;

INSERT INTO auth.sessions(id, user_id, created_at, not_after)
SELECT replace(id::text, '-8000-', '-8001-')::uuid, id, now(), now() + interval '1 day'
FROM auth.users WHERE email LIKE 'package1-notification-%@example.invalid';

INSERT INTO public.user_profiles(auth_user_id, full_name, status, must_change_password)
SELECT id, 'Synthetic Package 1 actor', 'active', false FROM auth.users WHERE email LIKE 'package1-notification-%@example.invalid'
ON CONFLICT(auth_user_id) DO UPDATE SET status = 'active', must_change_password = false;

CREATE FUNCTION pg_temp.package1_profile(i int) RETURNS bigint LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT id FROM public.user_profiles WHERE auth_user_id = ('91820000-0000-4000-8000-' || lpad(i::text,12,'0'))::uuid;
$$;
CREATE FUNCTION pg_temp.package1_actor(i int) RETURNS text LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', jsonb_build_object('role', 'authenticated',
    'sub', '91820000-0000-4000-8000-' || lpad(i::text,12,'0'),
    'session_id', '91820000-0000-4000-8001-' || lpad(i::text,12,'0'))::text, true);
$$;

INSERT INTO public.roles(role_code, role_name, is_system_role) VALUES
 ('package1_notification_reads','Synthetic global notification readers',false),
 ('package1_notification_edits','Synthetic global notification editors',false),
 ('package1_notification_manage_only','Synthetic notification manage only',false);
INSERT INTO public.permissions(permission_code, permission_name, module_code, action_code, administrator_scope) VALUES
 ('notifications.logs.view','Synthetic delivery metadata permission','NOTIFICATIONS','view','global'),
 ('notifications.templates.view','Synthetic template metadata permission','NOTIFICATIONS','view','global'),
 ('notifications.templates.manage','Synthetic template edit permission','NOTIFICATIONS','manage','global'),
 ('dms.notifications.view','Synthetic DMS notifications permission','DMS','view','branch'),
 ('dms.notifications.settings.manage','Synthetic DMS settings permission','DMS','manage','global')
ON CONFLICT(permission_code) DO NOTHING;
INSERT INTO public.role_permissions(role_id, permission_id)
SELECT r.id, p.id FROM (VALUES
 ('package1_notification_reads', ARRAY['notifications.logs.view','notifications.templates.view','dms.notifications.view']),
 ('package1_notification_edits', ARRAY['notifications.templates.view','notifications.templates.manage','dms.notifications.settings.manage']),
 ('package1_notification_manage_only', ARRAY['notifications.templates.manage'])
) a(code, caps) JOIN public.roles r ON r.role_code = a.code JOIN public.permissions p ON p.permission_code = ANY(a.caps);

INSERT INTO public.user_roles(user_profile_id, role_id, owner_company_id, branch_id, is_active)
SELECT pg_temp.package1_profile(a.actor), r.id, a.company, a.branch, true FROM (VALUES
 (1,'package1_notification_reads',NULL::bigint,NULL::bigint),
 (2,'package1_notification_reads',918201,918211),
 (2,'package1_notification_edits',918201,918211),
 (3,'package1_notification_edits',NULL,NULL),
 (4,'package1_notification_manage_only',NULL,NULL),
 (5,'package1_notification_reads',NULL,NULL)
) a(actor,code,company,branch) JOIN public.roles r ON r.role_code = a.code;

UPDATE auth.sessions SET not_after = now() - interval '1 minute'
WHERE user_id = '91820000-0000-4000-8000-000000000005'::uuid;

INSERT INTO public.erp_notification_templates(template_code, template_name, source_module, notification_type, subject_template, text_template, is_system)
VALUES ('PACKAGE1_AUTHORITY_SAMPLE','Synthetic Package 1 template','SYNTHETIC','test','Synthetic subject','Synthetic wording',false);
INSERT INTO public.erp_notification_delivery_logs(id, delivery_channel, status, message, error_message) OVERRIDING SYSTEM VALUE
VALUES (918201,'email','failed','Synthetic diagnostic','Synthetic failure');
INSERT INTO public.dms_notification_settings(id, is_enabled, email_enabled, in_app_enabled, config_name)
VALUES (1, false, false, false, 'Synthetic disabled notification settings') ON CONFLICT (id) DO NOTHING;

SET LOCAL ROLE authenticated;
SELECT pg_temp.package1_actor(1) AS claims \gset
DO $$
BEGIN
  IF NOT EXISTS(SELECT FROM public.perf_notification_delivery_read WHERE id = 918201
    AND message = 'Delivery diagnostic recorded.' AND error_message LIKE 'Delivery error recorded;%')
    OR EXISTS(SELECT FROM public.erp_notification_delivery_logs WHERE id = 918201)
  THEN RAISE EXCEPTION 'Global logs viewer authority did not remain limited to masked metadata'; END IF;
  IF NOT EXISTS(SELECT FROM public.notification_template_metadata_read WHERE template_code = 'PACKAGE1_AUTHORITY_SAMPLE')
    OR EXISTS(SELECT FROM public.erp_notification_templates WHERE template_code = 'PACKAGE1_AUTHORITY_SAMPLE')
  THEN RAISE EXCEPTION 'Global templates viewer could not read metadata or could read wording'; END IF;
  IF NOT EXISTS(SELECT FROM public.dms_notification_settings WHERE id = 1) THEN
    RAISE EXCEPTION 'Global DMS settings reader lost read access'; END IF;
  UPDATE public.dms_notification_settings SET config_name = 'Unexpected viewer update' WHERE id = 1;
  IF FOUND THEN RAISE EXCEPTION 'Global DMS settings reader gained mutation authority'; END IF;
END;
$$;

SELECT pg_temp.package1_actor(2) AS claims \gset
DO $$
BEGIN
  IF EXISTS(SELECT FROM public.perf_notification_delivery_read WHERE id = 918201)
    OR EXISTS(SELECT FROM public.notification_template_metadata_read WHERE template_code = 'PACKAGE1_AUTHORITY_SAMPLE')
    OR EXISTS(SELECT FROM public.dms_notification_settings WHERE id = 1)
  THEN RAISE EXCEPTION 'Branch grants were incorrectly admitted to global notification scopes'; END IF;
  UPDATE public.erp_notification_templates SET template_name = 'Unexpected scoped update' WHERE template_code = 'PACKAGE1_AUTHORITY_SAMPLE';
  IF FOUND THEN RAISE EXCEPTION 'Scoped branch grant gained global template edit authority'; END IF;
END;
$$;

SELECT pg_temp.package1_actor(3) AS claims \gset
DO $$
BEGIN
  IF NOT EXISTS(SELECT FROM public.erp_notification_templates WHERE template_code = 'PACKAGE1_AUTHORITY_SAMPLE' AND text_template = 'Synthetic wording') THEN
    RAISE EXCEPTION 'Admitted global editor could not read the edit detail'; END IF;
  UPDATE public.erp_notification_templates SET text_template = 'Synthetic revision' WHERE template_code = 'PACKAGE1_AUTHORITY_SAMPLE';
  IF NOT FOUND THEN RAISE EXCEPTION 'Admitted global editor could not update wording'; END IF;
  DELETE FROM public.erp_notification_templates WHERE template_code = 'PACKAGE1_AUTHORITY_SAMPLE';
  IF FOUND THEN RAISE EXCEPTION 'Delegated global editor gained delete authority'; END IF;
  UPDATE public.dms_notification_settings SET config_name = 'Synthetic settings revision' WHERE id = 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'Explicit Global DMS settings editor could not update verified settings'; END IF;
END;
$$;

SELECT pg_temp.package1_actor(4) AS claims \gset
DO $$
BEGIN
  IF EXISTS(SELECT FROM public.notification_template_metadata_read WHERE template_code = 'PACKAGE1_AUTHORITY_SAMPLE')
    OR EXISTS(SELECT FROM public.erp_notification_templates WHERE template_code = 'PACKAGE1_AUTHORITY_SAMPLE')
  THEN RAISE EXCEPTION 'A manage-only grant gained template read authority'; END IF;
END;
$$;

SELECT pg_temp.package1_actor(5) AS claims \gset
DO $$
BEGIN
  IF EXISTS(SELECT FROM public.perf_notification_delivery_read WHERE id = 918201)
    OR EXISTS(SELECT FROM public.notification_template_metadata_read WHERE template_code = 'PACKAGE1_AUTHORITY_SAMPLE')
    OR EXISTS(SELECT FROM public.dms_notification_settings WHERE id = 1)
  THEN RAISE EXCEPTION 'Expired session retained global notification access'; END IF;
END;
$$;

ROLLBACK;
\echo 'Package 1 notification scope and redaction assertions passed'
