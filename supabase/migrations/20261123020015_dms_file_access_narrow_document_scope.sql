-- Read only authorized document identity and scope before projecting file rows.
BEGIN;
SET LOCAL search_path = pg_catalog;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $guard$
DECLARE
  expected record;
BEGIN
  IF current_user <> 'postgres'
    OR has_schema_privilege('authenticated','erp_private','CREATE')
    OR has_schema_privilege('anon','erp_private','CREATE')
  THEN RAISE EXCEPTION 'Reviewed DMS projection owner and schema required'; END IF;

  FOR expected IN SELECT * FROM (VALUES
    ('erp_private.read_documents()', '6bc7814a408d77990df6e20bb2c58033', 'public.dms_documents'),
    ('erp_private.read_documents_filtered(bigint[],text[])', 'c95a1a5ba0facbcb902b429be8a29a12', 'public.dms_documents'),
    ('erp_private.read_documents_filtered_v2(bigint[],text[],text[])', '96419de21552cdc297af58d3c655023e', 'public.dms_documents'),
    ('erp_private.read_documents_matching(bigint[],text[],text[],bigint[],text,tsquery)', '78a58f1b738d6dcd8455c9d9c288595e', 'public.dms_documents'),
    ('erp_private.read_document_files()', '28ec66c593816cff4e059f17b4bd09ae', 'public.dms_document_files')
  ) AS v(signature, body_hash, row_type)
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid = to_regprocedure(expected.signature)
      AND p.proowner = 'postgres'::regrole AND p.prosecdef AND p.provolatile = 's' AND p.proretset
      AND p.prorettype = to_regtype(expected.row_type) AND p.proconfig = ARRAY['search_path=""']
      AND ARRAY(SELECT acl::text FROM unnest(p.proacl) acl ORDER BY acl::text)
        = ARRAY['authenticated=X/postgres','postgres=X/postgres']
      AND md5(replace(p.prosrc,E'\r\n',E'\n')) = expected.body_hash)
    THEN RAISE EXCEPTION 'Reviewed wide DMS reader drift: %', expected.signature; END IF;
  END LOOP;

  PERFORM set_config('dms_file_scope.reader_preimage', (SELECT (to_jsonb(p)-'prosrc')::text
    FROM pg_proc p WHERE p.oid='erp_private.read_document_files()'::regprocedure), true);
END $guard$;

-- Derived from the all-null filter call of the reviewed wide documents reader.
-- The active principal, Fleet, classification, recruitment and HR predicates
-- match that reader. Keep this body in sync when reviewing future changes.
CREATE FUNCTION erp_private.file_document_visibility_scope()
RETURNS TABLE (id bigint, owning_company_id bigint, owning_branch_id bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $scope$
  WITH fleet_blocked AS MATERIALIZED (
    SELECT parent.document_id AS id FROM erp_private.fleet_document_parents parent
    JOIN erp_private.fleet_assets a ON a.id=parent.asset_id
    JOIN public.dms_documents doc ON doc.id=parent.document_id
    WHERE ROW(doc.owning_company_id,doc.owning_branch_id) IS DISTINCT FROM ROW(a.owner_company_id,a.home_branch_id)
      OR NOT erp_private.t05_scope('fleet.assets.view',a.owner_company_id,a.home_branch_id)
    UNION
    SELECT l.document_id FROM public.dms_document_links l
    WHERE l.entity_type='fleet_asset' AND l.deleted_at IS NULL AND NOT EXISTS (
      SELECT 1 FROM erp_private.fleet_document_parents p WHERE p.document_id=l.document_id AND p.asset_id=l.entity_id)
  ), visible_candidates AS MATERIALIZED (
    SELECT id FROM erp_private.read_hr_candidates()
  ), principal AS MATERIALIZED (
    SELECT auth.uid() uid, erp_private.business_principal_is_active() active,
      public.current_user_is_global_admin() global_admin, public.current_user_profile_id() profile_id
  ), capability_scopes AS MATERIALIZED (
    SELECT DISTINCT ur.owner_company_id, ur.branch_id, p.permission_code
    FROM principal actor JOIN public.user_roles ur ON ur.user_profile_id=actor.profile_id
    JOIN public.roles r ON r.id=ur.role_id
    JOIN public.role_permissions rp ON rp.role_id=r.id
    JOIN public.permissions p ON p.id=rp.permission_id
    WHERE actor.uid IS NOT NULL AND actor.active AND ur.is_active AND r.is_active AND p.is_active
      AND p.permission_code IN ('dms.documents.view','dms.admin',
        'dms.documents.view.hr','dms.documents.view.finance','dms.documents.view.legal','dms.documents.view.executive')
  ), hr_evidence_documents AS MATERIALIZED (
    -- Only rows referenced by an active HR child need the existing point guard.
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
    UNION SELECT dms_document_id FROM public.employee_document_links WHERE deleted_at IS NULL AND dms_document_id IS NOT NULL
  )
  SELECT d.id, d.owning_company_id, d.owning_branch_id
  FROM principal actor CROSS JOIN public.dms_documents d
  WHERE actor.uid IS NOT NULL AND actor.active AND d.deleted_at IS NULL AND NOT EXISTS (SELECT 1 FROM fleet_blocked fb WHERE fb.id=d.id)
    AND (actor.global_admin OR (
      d.confidentiality_level IN ('internal','company','hr','finance','legal','executive')
      AND EXISTS (SELECT 1 FROM capability_scopes s WHERE s.permission_code IN ('dms.documents.view','dms.admin')
        AND ((s.owner_company_id IS NULL AND s.branch_id IS NULL)
          OR (s.owner_company_id=d.owning_company_id AND (s.branch_id IS NULL OR s.branch_id=d.owning_branch_id))))
      AND (d.confidentiality_level IN ('internal','company') OR EXISTS (
        SELECT 1 FROM capability_scopes s WHERE s.permission_code='dms.documents.view.'||d.confidentiality_level
          AND ((s.owner_company_id IS NULL AND s.branch_id IS NULL)
            OR (s.owner_company_id=d.owning_company_id AND (s.branch_id IS NULL OR s.branch_id=d.owning_branch_id)))))
      AND NOT EXISTS (SELECT 1 FROM public.hr_candidate_documents c
        WHERE c.dms_document_id=d.id AND c.deleted_at IS NULL AND c.candidate_id NOT IN (SELECT id FROM visible_candidates))
      AND NOT EXISTS (SELECT 1 FROM public.hr_offers o WHERE o.offer_document_id IS NOT NULL AND o.offer_document_id=d.id AND o.deleted_at IS NULL AND NOT
        (erp_private.candidate_permission(o.candidate_id,'hr.recruitment.view')
          AND erp_private.recruitment_scope(o.owner_company_id,o.branch_id,'hr.recruitment.view')
          AND erp_private.permission_in_scope('hr.payroll.view',o.owner_company_id,o.branch_id)))
      AND NOT EXISTS (SELECT 1 FROM public.hr_onboarding_tasks t WHERE t.dms_document_id IS NOT NULL AND t.dms_document_id=d.id AND t.deleted_at IS NULL
        AND NOT erp_private.onboarding_permission(t.candidate_id,t.employee_id,'hr.recruitment.view'))
      AND CASE WHEN d.id IN (SELECT id FROM hr_evidence_documents)
        THEN erp_private.perf_hr_document_subjects_allowed(d.id) ELSE true END
      AND NOT EXISTS (SELECT 1 FROM public.dms_document_links l WHERE l.document_id=d.id AND l.deleted_at IS NULL AND l.entity_type='employee'
        AND l.entity_id NOT IN (SELECT erp_private.readable_employee_ids()))
      AND NOT EXISTS (SELECT 1 FROM public.employee_medical_records m WHERE m.dms_document_id=d.id AND m.deleted_at IS NULL
        AND NOT public.current_user_can_view_employee_medical(m.employee_id))
      AND NOT EXISTS (SELECT 1 FROM public.employee_dependents child WHERE child.dms_document_id=d.id AND child.deleted_at IS NULL
        AND NOT (public.current_user_can_view_employee(child.employee_id) AND erp_private.employee_permission(child.employee_id,'hr.compliance.view')))
    ));
$scope$;

REVOKE ALL ON FUNCTION erp_private.file_document_visibility_scope()
  FROM PUBLIC, anon, authenticated, service_role;

-- Keep the existing projection type, scope-local preview and sensitive masks.
CREATE OR REPLACE FUNCTION erp_private.read_document_files()
RETURNS SETOF public.dms_document_files LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $reader$
 WITH principal AS MATERIALIZED(
  SELECT auth.uid()uid,erp_private.business_principal_is_active()active,public.current_user_is_global_admin()global_admin,public.current_user_profile_id()profile_id
 ),preview_scopes AS MATERIALIZED(
  SELECT DISTINCT ur.owner_company_id,ur.branch_id FROM principal actor
  JOIN public.user_roles ur ON ur.user_profile_id=actor.profile_id JOIN public.roles r ON r.id=ur.role_id
  JOIN public.role_permissions rp ON rp.role_id=r.id JOIN public.permissions p ON p.id=rp.permission_id
  WHERE actor.uid IS NOT NULL AND actor.active AND ur.is_active AND r.is_active AND p.is_active AND p.permission_code='dms.documents.preview'
 ),authorized_documents AS MATERIALIZED(
  -- This is the current F03/PERF reader, including HR, recruitment, clinical,
  -- sensitivity, linked employee/dependent, deleted-row and scope fences.
  SELECT d.id,d.owning_company_id,d.owning_branch_id FROM erp_private.file_document_visibility_scope()d
 )
 SELECT projected.* FROM principal actor CROSS JOIN public.dms_document_files f
 JOIN authorized_documents d ON d.id=f.document_id
 CROSS JOIN LATERAL jsonb_populate_record(NULL::public.dms_document_files,
  CASE WHEN actor.global_admin OR EXISTS(SELECT 1 FROM preview_scopes s WHERE(s.owner_company_id IS NULL AND s.branch_id IS NULL)OR(s.owner_company_id=d.owning_company_id AND(s.branch_id IS NULL OR s.branch_id=d.owning_branch_id)))
  THEN to_jsonb(f)ELSE to_jsonb(f)-ARRAY['ocr_text','ocr_error_message','integrity_error_message']END)AS projected
 WHERE actor.uid IS NOT NULL AND actor.active AND f.deleted_at IS NULL;
$reader$;

DO $verify$
BEGIN
  IF (SELECT (to_jsonb(p)-'prosrc')::text FROM pg_proc p
      WHERE p.oid='erp_private.read_document_files()'::regprocedure)
      IS DISTINCT FROM current_setting('dms_file_scope.reader_preimage')
    OR (SELECT ARRAY(SELECT acl::text FROM unnest(p.proacl) acl ORDER BY acl::text)
      FROM pg_proc p WHERE p.oid='erp_private.file_document_visibility_scope()'::regprocedure)
      IS DISTINCT FROM ARRAY['postgres=X/postgres']
  THEN RAISE EXCEPTION 'DMS file scope changed production grants or reader metadata'; END IF;
END $verify$;

COMMIT;
