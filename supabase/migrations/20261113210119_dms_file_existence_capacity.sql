BEGIN;
SET LOCAL search_path = pg_catalog;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- File SELECT reduces to active principal + document_permission(id, 'view').
-- Check the reviewed policy and point guard before using that equivalence.
DO $guard$
DECLARE expected record;
BEGIN
  IF current_user <> 'postgres'
    OR has_schema_privilege('authenticated', 'erp_private', 'CREATE')
    OR has_schema_privilege('anon', 'erp_private', 'CREATE')
    OR NOT EXISTS (SELECT 1 FROM pg_class
      WHERE oid = 'public.dms_document_files'::regclass AND relrowsecurity AND relforcerowsecurity)
    OR (SELECT count(*) FROM pg_policy
      WHERE polrelid = 'public.dms_document_files'::regclass AND polcmd IN ('r','*')) <> 3 THEN
    RAISE EXCEPTION 'DMS file SELECT prerequisites changed';
  END IF;
  FOR expected IN SELECT * FROM (VALUES
    ('dms_files_select', 'r', true, 'd2d2d3f322e423f51e61ee8011db50fd'),
    ('f03_document_subject', '*', false, '73771acf9117cc320a918bb957425b02'),
    ('f03_principal', '*', false, '7f2345bb3c7af80f4c0290b3ef9c491c')
  ) AS rules(policy_name, command, permissive, qualifier) LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = 'public.dms_document_files'::regclass
      AND p.polname = expected.policy_name AND p.polcmd::text = expected.command
      AND p.polpermissive = expected.permissive AND p.polroles = ARRAY['authenticated'::regrole::oid]
      AND md5(pg_get_expr(p.polqual,p.polrelid)) = expected.qualifier) THEN
      RAISE EXCEPTION 'DMS file SELECT policy changed: %', expected.policy_name;
    END IF;
  END LOOP;
  FOR expected IN SELECT * FROM (VALUES
    ('erp_private.document_permission(bigint,text)', '1c6c7a6c40749c9bea0e28cc99e03595', true),
    ('erp_private.hr_document_evidence_allowed(bigint)', '7f65b92fdf64a26f1cb135e3923a2e06', true),
    ('erp_private.recruitment_document_evidence_allowed(bigint)', 'dd2c040f3ebccaedc9092fc5c887d4e2', true),
    ('public.current_user_can_view_dms_document(bigint)', 'd991b0195f38b55711cde71f72bfb1e6', false),
    ('public.perf_document_has_files(public.dms_documents)', 'ab32ccaca20810f1be70e5a3c61ce4fa', false)
  ) AS routines(signature, body_hash, definer) LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid = to_regprocedure(expected.signature)
      AND md5(p.prosrc) = expected.body_hash AND p.prosecdef = expected.definer
      AND p.provolatile = 's' AND p.proowner = 'postgres'::regrole AND p.proconfig = ARRAY['search_path=""']) THEN
      RAISE EXCEPTION 'DMS file visibility prerequisite changed: %', expected.signature;
    END IF;
  END LOOP;
END $guard$;

-- Return only the IDs whose live files are visible under the table's SELECT rule.
-- The point guard remains authoritative for HR and recruitment evidence, including
-- sick-leave certificates and employee photos. Keep this source set in sync with
-- both evidence guards when a new kind of evidence is added.
CREATE FUNCTION erp_private.visible_dms_file_document_ids()
RETURNS SETOF bigint
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $reader$
  WITH principal AS MATERIALIZED (
    SELECT auth.uid() uid, erp_private.business_principal_is_active() active,
      public.current_user_is_global_admin() global_admin
  ), scopes AS MATERIALIZED (
    SELECT DISTINCT ur.owner_company_id, ur.branch_id, p.permission_code
    FROM principal actor JOIN public.user_profiles up ON up.auth_user_id=actor.uid
    JOIN public.user_roles ur ON ur.user_profile_id=up.id
    JOIN public.roles r ON r.id=ur.role_id
    JOIN public.role_permissions rp ON rp.role_id=r.id
    JOIN public.permissions p ON p.id=rp.permission_id
    WHERE actor.active AND ur.is_active AND r.is_active AND p.is_active
      AND p.permission_code IN ('dms.documents.view','dms.admin',
        'dms.documents.view.hr','dms.documents.view.finance','dms.documents.view.legal','dms.documents.view.executive')
  ), readable_employees AS MATERIALIZED (
    SELECT erp_private.readable_employee_ids() id
  ), evidence_documents AS MATERIALIZED (
    SELECT dms_document_id id FROM public.employee_access_cards WHERE deleted_at IS NULL AND dms_document_id IS NOT NULL
    UNION SELECT dms_document_id FROM public.employee_assets WHERE deleted_at IS NULL AND dms_document_id IS NOT NULL
    UNION SELECT dms_document_id FROM public.employee_disciplinary_records WHERE deleted_at IS NULL AND dms_document_id IS NOT NULL
    UNION SELECT dms_document_id FROM public.employee_eos_cases WHERE deleted_at IS NULL AND dms_document_id IS NOT NULL
    UNION SELECT dms_document_id FROM public.employee_hr_actions WHERE deleted_at IS NULL AND dms_document_id IS NOT NULL
    UNION SELECT dms_document_id FROM public.employee_identity_documents WHERE deleted_at IS NULL AND dms_document_id IS NOT NULL
    UNION SELECT dms_document_id FROM public.employee_medical_insurances WHERE deleted_at IS NULL AND dms_document_id IS NOT NULL
    UNION SELECT dms_document_id FROM public.employee_medical_records WHERE deleted_at IS NULL AND dms_document_id IS NOT NULL
    UNION SELECT dms_document_id FROM public.employee_performance_records WHERE deleted_at IS NULL AND dms_document_id IS NOT NULL
    UNION SELECT dms_document_id FROM public.employee_ppe_issues WHERE deleted_at IS NULL AND dms_document_id IS NOT NULL
    UNION SELECT related_document_id FROM public.employee_pro_processes WHERE deleted_at IS NULL AND related_document_id IS NOT NULL
    UNION SELECT dms_document_id FROM public.employee_training_certificates WHERE deleted_at IS NULL AND dms_document_id IS NOT NULL
    UNION SELECT dms_document_id FROM public.employee_dependents WHERE deleted_at IS NULL AND dms_document_id IS NOT NULL
    UNION SELECT sick_cert_dms_id FROM public.employee_leave_requests WHERE deleted_at IS NULL AND sick_cert_dms_id IS NOT NULL
    UNION SELECT photo_dms_document_id FROM public.employees WHERE deleted_at IS NULL AND photo_dms_document_id IS NOT NULL
    UNION SELECT dms_document_id FROM public.employee_document_links WHERE deleted_at IS NULL AND dms_document_id IS NOT NULL
    UNION SELECT dms_document_id FROM public.hr_candidate_documents WHERE deleted_at IS NULL AND dms_document_id IS NOT NULL
    UNION SELECT offer_document_id FROM public.hr_offers WHERE deleted_at IS NULL AND offer_document_id IS NOT NULL
    UNION SELECT dms_document_id FROM public.hr_onboarding_tasks WHERE deleted_at IS NULL AND dms_document_id IS NOT NULL
  )
  SELECT d.id
  FROM principal actor CROSS JOIN public.dms_documents d
  WHERE actor.uid IS NOT NULL AND actor.active AND d.deleted_at IS NULL
    AND EXISTS (SELECT 1 FROM public.dms_document_files f WHERE f.document_id=d.id AND f.deleted_at IS NULL)
    AND (actor.global_admin OR (
      d.confidentiality_level IN ('internal','company','hr','finance','legal','executive')
      AND EXISTS (SELECT 1 FROM scopes s WHERE s.permission_code IN ('dms.documents.view','dms.admin')
        AND ((s.owner_company_id IS NULL AND s.branch_id IS NULL)
          OR (s.owner_company_id=d.owning_company_id AND (s.branch_id IS NULL OR s.branch_id=d.owning_branch_id))))
      AND (d.confidentiality_level IN ('internal','company') OR EXISTS (
        SELECT 1 FROM scopes s WHERE s.permission_code='dms.documents.view.'||d.confidentiality_level
          AND ((s.owner_company_id IS NULL AND s.branch_id IS NULL)
            OR (s.owner_company_id=d.owning_company_id AND (s.branch_id IS NULL OR s.branch_id=d.owning_branch_id)))))
      AND NOT EXISTS (SELECT 1 FROM public.dms_document_links l
        WHERE l.document_id=d.id AND l.deleted_at IS NULL AND l.entity_type='employee'
          AND l.entity_id NOT IN (SELECT id FROM readable_employees))
      AND CASE WHEN d.id IN (SELECT id FROM evidence_documents)
        THEN erp_private.document_permission(d.id,'dms.documents.view') ELSE true END
    ));
$reader$;
REVOKE ALL ON FUNCTION erp_private.visible_dms_file_document_ids() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION erp_private.visible_dms_file_document_ids() TO authenticated;

-- Keep the shared search, including its content RLS and document projection.
-- A set intersection makes the file decision before PostgREST counts or pages.
CREATE FUNCTION public.dms_search_documents_by_file_presence(
  has_files boolean, text_query text DEFAULT '', include_content boolean DEFAULT false,
  subject_type text DEFAULT NULL, subject_id bigint DEFAULT NULL,
  document_type_ids bigint[] DEFAULT '{}'::bigint[], linked_type text DEFAULT NULL,
  expiry_state text DEFAULT NULL, metadata_filters jsonb DEFAULT '[]'::jsonb
) RETURNS SETOF public.dms_documents
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $search$
  WITH visible_files AS MATERIALIZED (SELECT id FROM erp_private.visible_dms_file_document_ids() id)
  SELECT d.*
  FROM public.ai_mod02_search_documents(text_query,include_content,subject_type,subject_id,
    document_type_ids,linked_type,expiry_state,metadata_filters) d
  WHERE has_files = (d.id IN (SELECT id FROM visible_files));
$search$;
REVOKE ALL ON FUNCTION public.dms_search_documents_by_file_presence(boolean,text,boolean,text,bigint,bigint[],text,text,jsonb)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.dms_search_documents_by_file_presence(boolean,text,boolean,text,bigint,bigint[],text,text,jsonb)
  TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
