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
    ('f03_upload_subject_select', 'r', false, '5ad55d1c86e28e70efacffbe3f2fea68'),
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

-- Applies only to the uploader's own generic, active, document-bound sessions.
-- Administrator and reviewer RLS evaluation remains on its separate point path.
CREATE FUNCTION erp_private.inbox_owned_bound_session_ids()
RETURNS SETOF bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $owned$
  WITH actor AS MATERIALIZED (
    SELECT public.current_user_profile_id() AS profile_id
    WHERE auth.uid() IS NOT NULL AND erp_private.business_principal_is_active()
      AND NOT public.current_user_is_global_admin()
  ), grants AS MATERIALIZED (
    SELECT DISTINCT ur.owner_company_id, ur.branch_id, p.permission_code
    FROM actor JOIN public.user_roles ur ON ur.user_profile_id=actor.profile_id
    JOIN public.roles r ON r.id=ur.role_id
    JOIN public.role_permissions rp ON rp.role_id=r.id
    JOIN public.permissions p ON p.id=rp.permission_id
    WHERE ur.is_active AND r.is_active AND p.is_active
      AND p.permission_code IN ('dms.documents.upload','dms.documents.view','dms.admin',
        'dms.documents.view.hr','dms.documents.view.finance','dms.documents.view.legal','dms.documents.view.executive')
  ), bound AS MATERIALIZED (
    SELECT s.id, d.id AS document_id, d.owning_company_id, d.owning_branch_id, d.confidentiality_level
    FROM actor JOIN public.dms_upload_sessions s ON s.uploaded_by=actor.profile_id
    JOIN public.dms_documents d ON d.id=s.document_id
    WHERE s.deleted_at IS NULL AND d.deleted_at IS NULL AND s.origin_entity_type IS NULL AND s.batch_id IS NULL
  ), authorized_scopes AS MATERIALIZED (
    SELECT k.owning_company_id, k.owning_branch_id, k.confidentiality_level
    FROM (SELECT DISTINCT owning_company_id,owning_branch_id,confidentiality_level FROM bound) k
    JOIN grants g ON (g.owner_company_id IS NULL AND g.branch_id IS NULL)
      OR (g.owner_company_id=k.owning_company_id AND (g.branch_id IS NULL OR g.branch_id=k.owning_branch_id))
    WHERE k.confidentiality_level IN ('internal','company','hr','finance','legal','executive')
    GROUP BY k.owning_company_id,k.owning_branch_id,k.confidentiality_level
    HAVING bool_or(g.permission_code='dms.documents.upload')
      AND bool_or(g.permission_code IN ('dms.documents.view','dms.admin'))
      AND (k.confidentiality_level IN ('internal','company')
        OR bool_or(g.permission_code='dms.documents.view.'||k.confidentiality_level))
  ), evidence AS MATERIALIZED (
    -- Complete set of active HR and recruitment sources from the guarded point helpers.
    -- Fleet's durable parent and an orphan Fleet link each require the original decision.
    SELECT dms_document_id id FROM public.employee_access_cards WHERE deleted_at IS NULL AND dms_document_id IS NOT NULL
    UNION ALL SELECT dms_document_id FROM public.employee_assets WHERE deleted_at IS NULL AND dms_document_id IS NOT NULL
    UNION ALL SELECT dms_document_id FROM public.employee_disciplinary_records WHERE deleted_at IS NULL AND dms_document_id IS NOT NULL
    UNION ALL SELECT dms_document_id FROM public.employee_eos_cases WHERE deleted_at IS NULL AND dms_document_id IS NOT NULL
    UNION ALL SELECT dms_document_id FROM public.employee_hr_actions WHERE deleted_at IS NULL AND dms_document_id IS NOT NULL
    UNION ALL SELECT dms_document_id FROM public.employee_identity_documents WHERE deleted_at IS NULL AND dms_document_id IS NOT NULL
    UNION ALL SELECT dms_document_id FROM public.employee_medical_insurances WHERE deleted_at IS NULL AND dms_document_id IS NOT NULL
    UNION ALL SELECT dms_document_id FROM public.employee_medical_records WHERE deleted_at IS NULL AND dms_document_id IS NOT NULL
    UNION ALL SELECT dms_document_id FROM public.employee_performance_records WHERE deleted_at IS NULL AND dms_document_id IS NOT NULL
    UNION ALL SELECT dms_document_id FROM public.employee_ppe_issues WHERE deleted_at IS NULL AND dms_document_id IS NOT NULL
    UNION ALL SELECT related_document_id FROM public.employee_pro_processes WHERE deleted_at IS NULL AND related_document_id IS NOT NULL
    UNION ALL SELECT dms_document_id FROM public.employee_training_certificates WHERE deleted_at IS NULL AND dms_document_id IS NOT NULL
    UNION ALL SELECT dms_document_id FROM public.employee_dependents WHERE deleted_at IS NULL AND dms_document_id IS NOT NULL
    UNION ALL SELECT sick_cert_dms_id FROM public.employee_leave_requests WHERE deleted_at IS NULL AND sick_cert_dms_id IS NOT NULL
    UNION ALL SELECT photo_dms_document_id FROM public.employees WHERE deleted_at IS NULL AND photo_dms_document_id IS NOT NULL
    UNION ALL SELECT dms_document_id FROM public.employee_document_links WHERE deleted_at IS NULL AND dms_document_id IS NOT NULL
    UNION ALL SELECT dms_document_id FROM public.hr_candidate_documents WHERE deleted_at IS NULL AND dms_document_id IS NOT NULL
    UNION ALL SELECT offer_document_id FROM public.hr_offers WHERE deleted_at IS NULL AND offer_document_id IS NOT NULL
    UNION ALL SELECT dms_document_id FROM public.hr_onboarding_tasks WHERE deleted_at IS NULL AND dms_document_id IS NOT NULL
    UNION ALL SELECT document_id FROM erp_private.fleet_document_parents
    UNION ALL SELECT document_id FROM public.dms_document_links WHERE entity_type='fleet_asset' AND deleted_at IS NULL
  ), allowed_documents AS MATERIALIZED (
    SELECT d.document_id FROM (SELECT DISTINCT b.document_id FROM bound b
      JOIN authorized_scopes k ON b.owning_company_id IS NOT DISTINCT FROM k.owning_company_id
        AND b.owning_branch_id IS NOT DISTINCT FROM k.owning_branch_id AND b.confidentiality_level=k.confidentiality_level
    ) d
    WHERE CASE WHEN d.document_id IN (SELECT id FROM evidence)
      THEN erp_private.document_permission(d.document_id,'dms.documents.upload')
      ELSE NOT EXISTS (SELECT FROM public.dms_document_links l WHERE l.document_id=d.document_id
        AND l.deleted_at IS NULL AND l.entity_type='employee'
        AND l.entity_id NOT IN (SELECT erp_private.readable_employee_ids()))
    END
  )
  SELECT b.id FROM bound b JOIN allowed_documents a ON a.document_id=b.document_id;
$owned$;
REVOKE ALL ON FUNCTION erp_private.inbox_owned_bound_session_ids() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION erp_private.inbox_owned_bound_session_ids() TO authenticated;

ALTER POLICY f03_upload_subject_select ON public.dms_upload_sessions
USING (CASE
  WHEN origin_entity_type IS NOT NULL OR batch_id IS NOT NULL THEN true
  WHEN document_id IS NULL THEN id IN (SELECT erp_private.readable_unbound_upload_session_ids())
  WHEN (SELECT public.current_user_has_permission_any_scope('dms.documents.review_ai'))
    OR (SELECT public.current_user_has_permission_any_scope('dms.admin'))
  THEN erp_private.inbox_generic_bound_read_allowed(id)
  WHEN uploaded_by = (SELECT public.current_user_profile_id())
    AND (SELECT public.current_user_has_permission_any_scope('dms.documents.upload'))
  THEN id IN (SELECT erp_private.inbox_owned_bound_session_ids())
  ELSE false
END);
DO $verify$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_proc p WHERE p.oid=to_regprocedure('erp_private.inbox_owned_bound_session_ids()')
    AND p.proowner='postgres'::regrole AND p.prosecdef AND p.provolatile='s' AND NOT p.proisstrict
    AND p.proretset AND p.prorettype='bigint'::regtype AND p.proconfig=ARRAY['search_path=""']
    AND ARRAY(SELECT ace::text FROM unnest(p.proacl) ace ORDER BY ace::text)
        = ARRAY['authenticated=X/postgres','postgres=X/postgres']
    AND has_function_privilege('authenticated',p.oid,'EXECUTE')
    AND NOT has_function_privilege('anon',p.oid,'EXECUTE')
    AND NOT has_function_privilege('service_role',p.oid,'EXECUTE'))
  THEN RAISE EXCEPTION 'Unexpected owned Inbox set execution contract'; END IF;
END $verify$;

COMMIT;
