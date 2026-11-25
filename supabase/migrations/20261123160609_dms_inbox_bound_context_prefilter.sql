-- Skip full bound-context checks for non-owners outside the linked document's review scope.
BEGIN;
SET LOCAL search_path = pg_catalog;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $guard$
DECLARE
  expected record;
BEGIN
  IF current_user <> 'postgres'
    OR EXISTS (SELECT FROM unnest(ARRAY['authenticated','anon','service_role']) AS r
               WHERE has_schema_privilege(r,'erp_private','CREATE'))
    OR NOT EXISTS (SELECT FROM pg_class WHERE oid='public.dms_upload_sessions'::regclass
                   AND relrowsecurity AND relowner='postgres'::regrole)
    OR NOT EXISTS (
      SELECT FROM pg_constraint c JOIN pg_attribute a ON a.attrelid=c.conrelid
      WHERE c.conrelid='public.user_profiles'::regclass AND a.attname='auth_user_id'
        AND a.attnotnull AND NOT a.attisdropped AND c.contype='u' AND c.convalidated
        AND NOT c.condeferrable AND c.conkey=ARRAY[a.attnum]
    )
    OR NOT EXISTS (
      SELECT FROM pg_policy p WHERE p.polrelid='public.dms_upload_sessions'::regclass
        AND p.polname='f07_original_upload_subject_read' AND p.polcmd='r'
        AND NOT p.polpermissive AND p.polroles=ARRAY['authenticated'::regrole::oid]
        AND p.polwithcheck IS NULL
        AND md5(pg_get_expr(p.polqual,p.polrelid))='5a01480bafd25329d10ab4e424de2c3a'
    )
  THEN RAISE EXCEPTION 'Reviewed Inbox context policy and schema required'; END IF;

  FOR expected IN SELECT * FROM (VALUES
    ('erp_private.f07_upload_subject_allowed(bigint)','2b6d67d10f78429e73fec38b93e3dcee','boolean','search_path=""','{authenticated=X/postgres,postgres=X/postgres}'),
    ('erp_private.upload_row_allowed(bigint,bigint,bigint,bigint)','5effa05af90b2e11331c41762bb12ca9','boolean','search_path=""','{authenticated=X/postgres,postgres=X/postgres}'),
    ('erp_private.document_permission(bigint,text)','1234c9bc566ace5131d264798e27728b','boolean','search_path=""','{authenticated=X/postgres,postgres=X/postgres}'),
    ('erp_private.inbox_current_review_scopes()','6480503115e5412208e085b991a8ea5b','text[]','search_path=""','{authenticated=X/postgres,postgres=X/postgres}'),
    ('public.current_user_is_global_admin()','5375091be37487c37872452fa3837466','boolean','search_path=pg_catalog, public, pg_temp','{anon=X/postgres,authenticated=X/postgres,postgres=X/postgres,service_role=X/postgres}'),
    ('public.current_user_profile_id()','3ae97eed6dcb16e61291a1b8a5998b21','bigint','search_path=""','{anon=X/postgres,authenticated=X/postgres,postgres=X/postgres,service_role=X/postgres}'),
    ('erp_private.business_principal_is_active()','13bc54e6c909a2635599b2f45fc5eda6','boolean','search_path=""','{authenticated=X/postgres,postgres=X/postgres,service_role=X/postgres}')
  ) f(signature,body_hash,result_type,search_setting,acl) LOOP
    IF NOT EXISTS (SELECT FROM pg_proc p WHERE p.oid=to_regprocedure(expected.signature)
        AND p.proowner='postgres'::regrole AND p.prosecdef AND p.provolatile='s'
        AND NOT p.proisstrict AND NOT p.proretset AND p.prorettype=to_regtype(expected.result_type)
        AND p.proconfig=ARRAY[expected.search_setting]
        AND ARRAY(SELECT a::text FROM unnest(p.proacl) a ORDER BY a::text)=expected.acl::text[]
        AND md5(replace(p.prosrc,E'\r\n',E'\n'))=expected.body_hash)
    THEN RAISE EXCEPTION 'Reviewed Inbox context authority changed: %',expected.signature; END IF;
  END LOOP;
END $guard$;

-- Consult the stored session and linked document in the same snapshot as F07.
-- Hints can only retain or skip the complete check, including for direct callers.
CREATE FUNCTION erp_private.inbox_context_read_allowed(
  p_session_id bigint, p_global boolean, p_profile_id bigint, p_review_scopes text[]
) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $point$
  SELECT CASE WHEN EXISTS (
    SELECT FROM public.dms_upload_sessions s
    LEFT JOIN public.dms_documents d ON d.id=s.document_id AND d.deleted_at IS NULL
    WHERE s.id=p_session_id AND s.deleted_at IS NULL
      AND (s.document_id IS NULL OR p_global OR s.uploaded_by=p_profile_id
        OR (d.id IS NOT NULL AND p_review_scopes && ARRAY[
          '*','c:'||d.owning_company_id::text,'b:'||d.owning_company_id::text||'/'||d.owning_branch_id::text]))
  ) THEN erp_private.f07_upload_subject_allowed(p_session_id) ELSE false END;
$point$;

REVOKE ALL ON FUNCTION erp_private.inbox_context_read_allowed(bigint,boolean,bigint,text[])
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION erp_private.inbox_context_read_allowed(bigint,boolean,bigint,text[])
  TO authenticated;

ALTER POLICY f07_original_upload_subject_read ON public.dms_upload_sessions
USING (CASE
  WHEN origin_entity_type IS NULL AND batch_id IS NULL THEN deleted_at IS NULL
  ELSE erp_private.inbox_context_read_allowed(id,
    (SELECT public.current_user_is_global_admin()),
    (SELECT public.current_user_profile_id()),
    (SELECT erp_private.inbox_current_review_scopes()))
END);

DO $verify$
BEGIN
  IF NOT EXISTS (
    SELECT FROM pg_proc p WHERE p.oid='erp_private.inbox_context_read_allowed(bigint,boolean,bigint,text[])'::regprocedure
      AND p.proowner='postgres'::regrole AND p.prosecdef AND p.provolatile='s'
      AND NOT p.proisstrict AND NOT p.proretset AND p.prorettype='boolean'::regtype
      AND p.proconfig=ARRAY['search_path=""']
      AND ARRAY(SELECT a::text FROM unnest(p.proacl) a ORDER BY a::text)=ARRAY['authenticated=X/postgres','postgres=X/postgres']
      AND NOT has_function_privilege('anon',p.oid,'EXECUTE')
      AND NOT has_function_privilege('service_role',p.oid,'EXECUTE')
  ) THEN RAISE EXCEPTION 'Unexpected Inbox context helper contract'; END IF;
END $verify$;
COMMIT;
