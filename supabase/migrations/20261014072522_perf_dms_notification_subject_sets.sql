BEGIN;
SET LOCAL search_path=pg_catalog;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='8s';
-- Preserve the exact F03 document decision, but evaluate it once per distinct
-- notification document in a statement. No document or notification mutation
-- becomes eligible through this read-only subject set.
DO $guard$
DECLARE p record; expected record;
BEGIN
 IF current_user<>'postgres' OR to_regprocedure('erp_private.perf_notification_document_ids(text)') IS NOT NULL THEN
  RAISE EXCEPTION 'Reviewed owner and absent notification subject helper required';
 END IF;
 SELECT * INTO STRICT p FROM pg_proc WHERE oid='erp_private.document_permission(bigint,text)'::regprocedure;
 IF md5(p.prosrc)<>'1c6c7a6c40749c9bea0e28cc99e03595' OR NOT p.prosecdef OR p.provolatile<>'s'
  OR p.proconfig IS DISTINCT FROM ARRAY['search_path=""']::text[] OR pg_get_userbyid(p.proowner)<>'postgres'
  OR p.proretset OR p.prorettype<>'boolean'::regtype
 THEN RAISE EXCEPTION 'Reviewed notification document authority prerequisite drift'; END IF;
 FOR expected IN SELECT * FROM(VALUES
  ('erp_private.read_documents()','6bc7814a408d77990df6e20bb2c58033'),
  ('erp_private.read_documents_filtered(bigint[],text[])','c95a1a5ba0facbcb902b429be8a29a12'),
  ('erp_private.read_documents_filtered_v2(bigint[],text[],text[])','0740033a5d712f7e883dbff80680e2cb')
 )v(signature,hash)LOOP
  SELECT * INTO STRICT p FROM pg_proc WHERE oid=to_regprocedure(expected.signature);
  IF md5(p.prosrc)<>expected.hash OR NOT p.prosecdef OR p.provolatile<>'s' OR NOT p.proretset
   OR p.prorettype<>'public.dms_documents'::regtype OR p.proconfig IS DISTINCT FROM ARRAY['search_path=""']::text[] OR pg_get_userbyid(p.proowner)<>'postgres'
  THEN RAISE EXCEPTION 'Reviewed protected document set prerequisite drift'; END IF;
 END LOOP;
 IF (SELECT count(*)FROM pg_policies WHERE schemaname='public' AND tablename='dms_notification_queue')<>4
  OR NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='public.dms_notification_queue'::regclass AND relrowsecurity)
 THEN RAISE EXCEPTION 'Reviewed notification policy set required'; END IF;
 FOR expected IN SELECT * FROM(VALUES
  ('dms_notif_select','7ab9f1a84def47d51f91d6ac280697ba','SELECT','PERMISSIVE',false),
  ('dms_notif_write','b5b18ee8e2f0200df3fee2e3b253160d','ALL','PERMISSIVE',true),
  ('f03_document_subject','73771acf9117cc320a918bb957425b02','ALL','RESTRICTIVE',true),
  ('f03_principal','7f2345bb3c7af80f4c0290b3ef9c491c','ALL','RESTRICTIVE',true)
 )v(name,hash,command,kind,checked)LOOP
  SELECT * INTO STRICT p FROM pg_policies WHERE schemaname='public' AND tablename='dms_notification_queue' AND policyname=expected.name;
  IF md5(p.qual)<>expected.hash OR p.cmd<>expected.command OR p.permissive<>expected.kind OR p.roles IS DISTINCT FROM ARRAY['authenticated']::name[]
   OR (expected.checked AND p.with_check IS DISTINCT FROM p.qual) OR (NOT expected.checked AND p.with_check IS NOT NULL)
  THEN RAISE EXCEPTION 'Reviewed notification predicate drift'; END IF;
 END LOOP;
END $guard$;

CREATE FUNCTION erp_private.perf_notification_document_ids(capability text)
RETURNS SETOF bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $body$
 WITH principal AS MATERIALIZED (
  SELECT erp_private.business_principal_is_active() active,
   public.current_user_is_global_admin() global_admin,public.current_user_profile_id() profile_id
 ), scopes AS MATERIALIZED (
  SELECT DISTINCT ur.owner_company_id,ur.branch_id FROM principal actor
  JOIN public.user_roles ur ON ur.user_profile_id=actor.profile_id
  JOIN public.roles r ON r.id=ur.role_id JOIN public.role_permissions rp ON rp.role_id=r.id
  JOIN public.permissions p ON p.id=rp.permission_id
  WHERE actor.active AND ur.is_active AND r.is_active AND p.is_active AND p.permission_code=$1
 )
 -- All authorized documents, including ones with no notification yet. Restricting
 -- this set to existing notification parents would break INSERT/UPDATE RETURNING.
 SELECT d.id FROM principal actor CROSS JOIN erp_private.read_documents() d
 WHERE actor.active AND $1 IN ('dms.documents.view','dms.admin','dms.notifications.admin','dms.notifications.manage')
  AND ($1='dms.documents.view' OR actor.global_admin OR EXISTS(SELECT 1 FROM scopes s
   WHERE (s.owner_company_id IS NULL AND s.branch_id IS NULL)
    OR (s.owner_company_id=d.owning_company_id AND (s.branch_id IS NULL OR s.branch_id=d.owning_branch_id))));
$body$;
ALTER FUNCTION erp_private.perf_notification_document_ids(text) OWNER TO postgres;
REVOKE ALL ON FUNCTION erp_private.perf_notification_document_ids(text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION erp_private.perf_notification_document_ids(text) TO authenticated;

-- ALL also participates in SELECT. Split its commands, retaining the exact
-- original write predicates and including its former SELECT branch explicitly.
DROP POLICY dms_notif_write ON public.dms_notification_queue;
CREATE POLICY perf_notification_insert ON public.dms_notification_queue FOR INSERT TO authenticated
 WITH CHECK(erp_private.document_permission(document_id,'dms.admin') OR public.current_user_has_role('system_admin'));
CREATE POLICY perf_notification_update ON public.dms_notification_queue FOR UPDATE TO authenticated
 USING(erp_private.document_permission(document_id,'dms.admin') OR public.current_user_has_role('system_admin'))
 WITH CHECK(erp_private.document_permission(document_id,'dms.admin') OR public.current_user_has_role('system_admin'));
CREATE POLICY perf_notification_delete ON public.dms_notification_queue FOR DELETE TO authenticated
 USING(erp_private.document_permission(document_id,'dms.admin') OR public.current_user_has_role('system_admin'));
ALTER POLICY dms_notif_select ON public.dms_notification_queue USING(
 document_id IN(SELECT erp_private.perf_notification_document_ids('dms.admin'))
 OR (SELECT public.current_user_has_role('system_admin'))
 OR ((SELECT auth.uid()) IS NOT NULL AND (
  (SELECT public.current_user_is_global_admin()) OR recipient_user_id=(SELECT public.current_user_profile_id())
  OR document_id IN(SELECT erp_private.perf_notification_document_ids('dms.notifications.admin'))
  OR document_id IN(SELECT erp_private.perf_notification_document_ids('dms.notifications.manage'))))
);
DROP POLICY f03_document_subject ON public.dms_notification_queue;
CREATE POLICY perf_notification_subject_select ON public.dms_notification_queue AS RESTRICTIVE FOR SELECT TO authenticated
 USING(document_id IN(SELECT erp_private.perf_notification_document_ids('dms.documents.view')));
CREATE POLICY perf_notification_subject_insert ON public.dms_notification_queue AS RESTRICTIVE FOR INSERT TO authenticated
 WITH CHECK(erp_private.document_permission(document_id,'dms.documents.view'));
CREATE POLICY perf_notification_subject_update ON public.dms_notification_queue AS RESTRICTIVE FOR UPDATE TO authenticated
 USING(erp_private.document_permission(document_id,'dms.documents.view')) WITH CHECK(erp_private.document_permission(document_id,'dms.documents.view'));
CREATE POLICY perf_notification_subject_delete ON public.dms_notification_queue AS RESTRICTIVE FOR DELETE TO authenticated
 USING(erp_private.document_permission(document_id,'dms.documents.view'));
COMMIT;
