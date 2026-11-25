BEGIN;
SET LOCAL search_path=pg_catalog;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';

-- The unbound path currently tests three exact ordinary action scopes. Pin it
-- and its principal, global and nullable scope rules before factoring them.
DO $guard$
DECLARE expected record;
BEGIN
  IF current_user <> 'postgres' OR EXISTS (SELECT FROM unnest(ARRAY['anon','authenticated','service_role']) r
       WHERE has_schema_privilege(r,'erp_private','CREATE'))
  THEN RAISE EXCEPTION 'Reviewed Inbox function owner/schema required'; END IF;
  FOR expected IN SELECT * FROM (VALUES
    ('erp_private.business_principal_is_active()', '13bc54e6c909a2635599b2f45fc5eda6', 'boolean', false, 'search_path=""', '{authenticated=X/postgres,postgres=X/postgres,service_role=X/postgres}'),
    ('erp_private.permission_in_scope(text,bigint,bigint)', 'ce520fb29b4a68564fcbf9285a4a741e', 'boolean', false, 'search_path=""', '{authenticated=X/postgres,postgres=X/postgres}'),
    ('erp_private.readable_unbound_upload_session_ids()', 'bf90495b9107cf75befb36380f75dc2e', 'bigint', true, 'search_path=""', '{authenticated=X/postgres,postgres=X/postgres}'),
    ('erp_private.upload_row_allowed(bigint,bigint,bigint,bigint)', '5effa05af90b2e11331c41762bb12ca9', 'boolean', false, 'search_path=""', '{authenticated=X/postgres,postgres=X/postgres}'),
    ('public.current_user_is_global_admin()', '5375091be37487c37872452fa3837466', 'boolean', false, 'search_path=pg_catalog, public, pg_temp', '{anon=X/postgres,authenticated=X/postgres,postgres=X/postgres,service_role=X/postgres}'),
    ('public.current_user_profile_id()', '3ae97eed6dcb16e61291a1b8a5998b21', 'bigint', false, 'search_path=""', '{anon=X/postgres,authenticated=X/postgres,postgres=X/postgres,service_role=X/postgres}')
  ) f(signature,body_hash,result_type,returns_set,search_setting,acl) LOOP
    IF NOT EXISTS(SELECT FROM pg_proc p WHERE p.oid=to_regprocedure(expected.signature)
      AND p.proowner='postgres'::regrole AND p.prosecdef AND p.provolatile='s' AND NOT p.proisstrict
      AND p.proretset=expected.returns_set AND p.prorettype=to_regtype(expected.result_type)
      AND p.proconfig=ARRAY[expected.search_setting]
      AND ARRAY(SELECT a::text FROM unnest(p.proacl) a ORDER BY a::text)=expected.acl::text[]
      AND md5(replace(p.prosrc,E'\r\n',E'\n'))=expected.body_hash)
    THEN RAISE EXCEPTION 'Reviewed unbound Inbox authority drift: %',expected.signature; END IF;
  END LOOP;
  PERFORM set_config('inbox_unbound.original_attributes',(SELECT (to_jsonb(p)-'prosrc')::text
    FROM pg_proc p WHERE p.oid='erp_private.readable_unbound_upload_session_ids()'::regprocedure),true);
END $guard$;

-- Retain the helper's full unbound-ID contract, including legacy deleted or
-- original-context rows. Its RLS caller separately enforces F07 and deletion.
CREATE OR REPLACE FUNCTION erp_private.readable_unbound_upload_session_ids()
RETURNS SETOF bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $unbound$
  WITH actor AS MATERIALIZED (
    SELECT public.current_user_profile_id() AS profile_id,
           public.current_user_is_global_admin() AS global_admin
    WHERE (SELECT auth.uid()) IS NOT NULL AND (SELECT erp_private.business_principal_is_active())
  ), action_scopes AS MATERIALIZED (
    SELECT DISTINCT ur.owner_company_id,ur.branch_id,p.permission_code
    FROM actor JOIN public.user_roles ur ON ur.user_profile_id=actor.profile_id
    JOIN public.roles r ON r.id=ur.role_id
    JOIN public.role_permissions rp ON rp.role_id=r.id
    JOIN public.permissions p ON p.id=rp.permission_id
    WHERE ur.is_active AND r.is_active AND p.is_active
      AND p.permission_code IN ('dms.documents.review_ai','dms.admin','dms.documents.upload')
  )
  SELECT s.id
  FROM actor CROSS JOIN public.dms_upload_sessions s
  WHERE s.document_id IS NULL AND (actor.global_admin OR EXISTS (
    SELECT FROM action_scopes g
    WHERE ((g.owner_company_id IS NULL AND g.branch_id IS NULL)
      OR (g.owner_company_id=s.owning_company_id AND (g.branch_id IS NULL OR g.branch_id=s.owning_branch_id)))
      AND (g.permission_code IN ('dms.documents.review_ai','dms.admin') OR s.uploaded_by=actor.profile_id)
  ));
$unbound$;

DO $verify$
BEGIN
  IF (SELECT (to_jsonb(p)-'prosrc')::text FROM pg_proc p
      WHERE p.oid='erp_private.readable_unbound_upload_session_ids()'::regprocedure)
     IS DISTINCT FROM current_setting('inbox_unbound.original_attributes')
  THEN RAISE EXCEPTION 'Unbound Inbox function attributes changed'; END IF;
END $verify$;
COMMIT;
