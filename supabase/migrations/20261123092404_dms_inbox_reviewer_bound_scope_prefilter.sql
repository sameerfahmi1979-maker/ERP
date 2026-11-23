BEGIN;
SET LOCAL search_path = pg_catalog;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $guard$
DECLARE expected record;
BEGIN
  IF current_user <> 'postgres'
    OR EXISTS (SELECT FROM unnest(ARRAY['authenticated','anon','service_role']) AS r
               WHERE has_schema_privilege(r,'erp_private','CREATE'))
    OR NOT EXISTS (SELECT FROM pg_class WHERE oid='public.dms_upload_sessions'::regclass
                   AND relrowsecurity AND relowner='postgres'::regrole)
    OR NOT EXISTS (SELECT FROM pg_attribute WHERE attrelid='public.dms_documents'::regclass
                   AND attname='confidentiality_level' AND attnotnull AND NOT attisdropped)
    OR (SELECT count(*) FROM pg_policy WHERE polrelid='public.dms_upload_sessions'::regclass
        AND polcmd IN ('r','*')) <> 4
  THEN RAISE EXCEPTION 'Reviewed Inbox read schema required'; END IF;

  FOR expected IN SELECT * FROM (VALUES
    ('f03_principal', '*', false, '7f2345bb3c7af80f4c0290b3ef9c491c'),
    ('f03_upload_select', 'r', true, 'b326b5062b2f0e69046810717534cb09'),
    ('f03_upload_subject_select', 'r', false, 'c1b435ef69899b62ba01eed55e44041f'),
    ('f07_original_upload_subject_read', 'r', false, '5a01480bafd25329d10ab4e424de2c3a')
  ) rules(name,cmd,permissive,hash) LOOP
    IF NOT EXISTS (SELECT FROM pg_policy p WHERE p.polrelid='public.dms_upload_sessions'::regclass
        AND p.polname=expected.name AND p.polcmd::text=expected.cmd AND p.polpermissive=expected.permissive
        AND p.polroles=ARRAY['authenticated'::regrole::oid]
        AND md5(pg_get_expr(p.polqual,p.polrelid))=expected.hash)
    THEN RAISE EXCEPTION 'Reviewed Inbox policy drift: %',expected.name; END IF;
  END LOOP;

  -- The hash alone omits execution privileges, null handling and the name-resolution context.
  FOR expected IN SELECT * FROM (VALUES
    ('erp_private.inbox_owned_bound_session_ids()', '888103237cfae1fd831ae3e822db6393', 'bigint', true, 'search_path=""', '{authenticated=X/postgres,postgres=X/postgres}'),
    ('erp_private.document_permission(bigint,text)', '1234c9bc566ace5131d264798e27728b', 'boolean', false, 'search_path=""', '{authenticated=X/postgres,postgres=X/postgres}'),
    ('erp_private.hr_document_evidence_allowed(bigint)', '7f65b92fdf64a26f1cb135e3923a2e06', 'boolean', false, 'search_path=""', '{authenticated=X/postgres,postgres=X/postgres}'),
    ('erp_private.recruitment_document_evidence_allowed(bigint)', 'dd2c040f3ebccaedc9092fc5c887d4e2', 'boolean', false, 'search_path=""', '{authenticated=X/postgres,postgres=X/postgres}'),
    ('erp_private.t05_document_allowed(bigint)', '53687b5ef73c40d6d886f2a3716b1dd8', 'boolean', false, 'search_path=""', '{postgres=X/postgres}'),
    ('public.current_user_has_permission_any_scope(text)', '4e7bd1d214481464f237f8e57cdf09c3', 'boolean', false, 'search_path=pg_catalog, public, pg_temp', '{anon=X/postgres,authenticated=X/postgres,postgres=X/postgres,service_role=X/postgres}'),
    ('public.current_user_is_global_admin()', '5375091be37487c37872452fa3837466', 'boolean', false, 'search_path=pg_catalog, public, pg_temp', '{anon=X/postgres,authenticated=X/postgres,postgres=X/postgres,service_role=X/postgres}'),
    ('public.current_user_profile_id()', '3ae97eed6dcb16e61291a1b8a5998b21', 'bigint', false, 'search_path=""', '{anon=X/postgres,authenticated=X/postgres,postgres=X/postgres,service_role=X/postgres}'),
    ('erp_private.business_principal_is_active()', '13bc54e6c909a2635599b2f45fc5eda6', 'boolean', false, 'search_path=""', '{authenticated=X/postgres,postgres=X/postgres,service_role=X/postgres}'),
    ('erp_private.readable_employee_ids()', 'bc725a99d93ad584f0397033eacbdfd1', 'bigint', true, 'search_path=""', '{authenticated=X/postgres,postgres=X/postgres}'),
    ('erp_private.inbox_generic_bound_read_allowed(bigint)', '2bb4e78c606da5749ce199fa2ede1252', 'boolean', false, 'search_path=""', '{authenticated=X/postgres,postgres=X/postgres}')
  ) f(signature,hash,result_type,returns_set,search_setting,acl) LOOP
    IF NOT EXISTS (SELECT FROM pg_proc p WHERE p.oid=to_regprocedure(expected.signature)
        AND p.provolatile='s' AND p.prosecdef AND p.proowner='postgres'::regrole
        AND NOT p.proisstrict AND p.proretset=expected.returns_set AND p.prorettype=to_regtype(expected.result_type)
        AND p.proconfig=ARRAY[expected.search_setting]
        AND ARRAY(SELECT ace::text FROM unnest(p.proacl) ace ORDER BY ace::text) = expected.acl::text[]
        AND md5(replace(p.prosrc,E'\r\n',E'\n'))=expected.hash)
    THEN RAISE EXCEPTION 'Reviewed Inbox document authority or ACL drift: %',expected.signature; END IF;
  END LOOP;
END $guard$;

-- These are the current caller's own review/admin grant scopes. No upload,
-- document, fallback decision or other principal's assignment enters this set.
CREATE FUNCTION erp_private.inbox_current_review_scopes()
RETURNS text[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $scopes$
  SELECT coalesce(array_agg(DISTINCT
    CASE WHEN ur.owner_company_id IS NULL THEN '*'
         WHEN ur.branch_id IS NULL THEN 'c:'||ur.owner_company_id::text
         ELSE 'b:'||ur.owner_company_id::text||'/'||ur.branch_id::text END), ARRAY[]::text[])
  FROM public.user_roles ur
  JOIN public.roles r ON r.id=ur.role_id
  JOIN public.role_permissions rp ON rp.role_id=r.id
  JOIN public.permissions p ON p.id=rp.permission_id
  WHERE (SELECT auth.uid()) IS NOT NULL AND (SELECT erp_private.business_principal_is_active())
    AND ur.user_profile_id=(SELECT public.current_user_profile_id())
    AND ur.is_active AND r.is_active AND p.is_active
    AND (ur.owner_company_id IS NOT NULL OR ur.branch_id IS NULL)
    AND p.permission_code IN ('dms.documents.review_ai','dms.admin');
$scopes$;

-- An untrusted map can only cause an extra execution of the original point
-- decision or an early denial. Bind the scope lookup to the actual session's
-- own linked document. Never expose the intermediate scope-match Boolean.
CREATE FUNCTION erp_private.inbox_reviewer_bound_point(p_session_id bigint,p_review_scopes text[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $point$
  SELECT CASE WHEN EXISTS (
    SELECT FROM public.dms_upload_sessions s JOIN public.dms_documents d ON d.id=s.document_id
    WHERE s.id=p_session_id AND s.deleted_at IS NULL AND d.deleted_at IS NULL
      AND s.origin_entity_type IS NULL AND s.batch_id IS NULL
      AND p_review_scopes && ARRAY['*','c:'||d.owning_company_id::text,
                                  'b:'||d.owning_company_id::text||'/'||d.owning_branch_id::text]
  ) THEN erp_private.inbox_generic_bound_read_allowed(p_session_id) ELSE false END;
$point$;

REVOKE ALL ON FUNCTION erp_private.inbox_current_review_scopes(),
  erp_private.inbox_reviewer_bound_point(bigint,text[]) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION erp_private.inbox_current_review_scopes(),
  erp_private.inbox_reviewer_bound_point(bigint,text[]) TO authenticated;

ALTER POLICY f03_upload_subject_select ON public.dms_upload_sessions
USING (CASE
  WHEN origin_entity_type IS NOT NULL OR batch_id IS NOT NULL THEN true
  WHEN document_id IS NULL THEN id IN (SELECT erp_private.readable_unbound_upload_session_ids())
  WHEN (SELECT public.current_user_has_permission_any_scope('dms.documents.review_ai'))
    OR (SELECT public.current_user_has_permission_any_scope('dms.admin'))
  THEN CASE
    WHEN (SELECT public.current_user_is_global_admin()) OR uploaded_by=(SELECT public.current_user_profile_id())
    THEN erp_private.inbox_generic_bound_read_allowed(id)
    ELSE erp_private.inbox_reviewer_bound_point(id,(SELECT erp_private.inbox_current_review_scopes()))
  END
  WHEN uploaded_by = (SELECT public.current_user_profile_id())
    AND (SELECT public.current_user_has_permission_any_scope('dms.documents.upload'))
  THEN id IN (SELECT erp_private.inbox_owned_bound_session_ids())
  ELSE false
END);

DO $verify$
DECLARE expected record;
BEGIN
  FOR expected IN SELECT * FROM (VALUES
    ('erp_private.inbox_current_review_scopes()','text[]'),
    ('erp_private.inbox_reviewer_bound_point(bigint,text[])','boolean')
  ) f(signature,return_type) LOOP
    IF NOT EXISTS (SELECT FROM pg_proc p WHERE p.oid=to_regprocedure(expected.signature)
      AND p.proowner='postgres'::regrole AND p.prosecdef AND p.provolatile='s' AND NOT p.proisstrict
      AND NOT p.proretset AND p.prorettype=to_regtype(expected.return_type) AND p.proconfig=ARRAY['search_path=""']
      AND ARRAY(SELECT ace::text FROM unnest(p.proacl) ace ORDER BY ace::text)
          = ARRAY['authenticated=X/postgres','postgres=X/postgres']
      AND has_function_privilege('authenticated',p.oid,'EXECUTE')
      AND NOT has_function_privilege('anon',p.oid,'EXECUTE')
      AND NOT has_function_privilege('service_role',p.oid,'EXECUTE'))
    THEN RAISE EXCEPTION 'Unexpected reviewer point execution contract: %',expected.signature; END IF;
  END LOOP;
END $verify$;
COMMIT;
