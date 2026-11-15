BEGIN;
SET LOCAL search_path = pg_catalog;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- Reuse the reviewed visibility rules. Refuse to replace a divergent definition.
DO $guard$
DECLARE expected record;
BEGIN
  IF current_user <> 'postgres'
    OR has_schema_privilege('authenticated', 'erp_private', 'CREATE')
    OR has_schema_privilege('anon', 'erp_private', 'CREATE') THEN
    RAISE EXCEPTION 'Unexpected document reader owner or schema grants';
  END IF;
  FOR expected IN SELECT * FROM (VALUES
    ('erp_private.read_documents_filtered_v2(bigint[],text[],text[])', '0c4be0e6b69b7fa8bb2ba0c446d3aae5', true),
    ('erp_private.perf_hr_document_subjects_allowed(bigint)', '6d025f4b9359e7685d1085f2179b40b0', true),
    ('public.ai_mod02_search_documents(text,boolean,text,bigint,bigint[],text,text,jsonb)', '1547bf94212f4637ee467966d2e5c99f', false),
    ('public.ai_mod02_search_excerpts(bigint[],text)', '97ad2012f54d456b411edae535cb78e6', false)
  ) AS rules(signature, body_hash, definer) LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid = to_regprocedure(expected.signature)
      AND md5(p.prosrc) = expected.body_hash AND p.prosecdef = expected.definer
      AND p.provolatile = 's' AND p.proowner = 'postgres'::regrole
      AND p.proconfig = ARRAY['search_path=""']) THEN
      RAISE EXCEPTION 'Document reader prerequisite changed: %', expected.signature;
    END IF;
  END LOOP;
END $guard$;

CREATE FUNCTION erp_private.read_documents_matching(
  document_ids bigint[], document_statuses text[], excluded_statuses text[],
  document_types bigint[], reference_text text, words tsquery
) RETURNS SETOF public.dms_documents
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $reader$
  WITH visible_candidates AS MATERIALIZED (
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
      AND p.permission_code IN ('dms.documents.view','dms.admin','dms.documents.preview',
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
  -- Use the original row as the base and overwrite just the protected fields.
  -- This avoids a whole-row JSON round trip (including embeddings and summaries).
  SELECT CASE WHEN preview.allowed THEN d ELSE jsonb_populate_record(d, jsonb_build_object(
    'ai_summary',NULL,'content_tsv',metadata.words,'summary_embedding',NULL,'ai_summary_error',NULL,
    'summary_embedding_error',NULL,'ai_warnings_json',NULL,'ai_risk_reasons_json',NULL
  )) END
  FROM principal actor CROSS JOIN public.dms_documents d
  CROSS JOIN LATERAL (
    SELECT actor.global_admin OR EXISTS (SELECT 1 FROM capability_scopes s
      WHERE s.permission_code='dms.documents.preview' AND ((s.owner_company_id IS NULL AND s.branch_id IS NULL)
        OR (s.owner_company_id=d.owning_company_id AND (s.branch_id IS NULL OR s.branch_id=d.owning_branch_id)))) allowed
  ) preview
  CROSS JOIN LATERAL (
    SELECT to_tsvector('simple',concat_ws(' ',d.document_no,d.title,d.description,d.legacy_document_code)) words
  ) metadata
  WHERE actor.uid IS NOT NULL AND actor.active AND d.deleted_at IS NULL
    AND (document_ids IS NULL OR d.id=ANY(document_ids))
    AND (document_statuses IS NULL OR d.status=ANY(document_statuses))
    AND (excluded_statuses IS NULL OR d.status<>ALL(excluded_statuses))
    AND (coalesce(cardinality(document_types),0)=0 OR d.document_type_id=ANY(document_types))
    AND (reference_text IS NULL OR position(reference_text IN lower(d.document_no))>0)
    AND (read_documents_matching.words IS NULL OR
      CASE WHEN preview.allowed THEN d.content_tsv ELSE metadata.words END @@ read_documents_matching.words)
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
$reader$;
REVOKE ALL ON FUNCTION erp_private.read_documents_matching(bigint[],text[],text[],bigint[],text,tsquery)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION erp_private.read_documents_matching(bigint[],text[],text[],bigint[],text,tsquery)
  TO authenticated;

CREATE OR REPLACE FUNCTION erp_private.read_documents_filtered_v2(
  document_ids bigint[], document_statuses text[], excluded_statuses text[]
) RETURNS SETOF public.dms_documents
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $reader$
  SELECT * FROM erp_private.read_documents_matching(document_ids,document_statuses,excluded_statuses,NULL,NULL,NULL);
$reader$;

-- Keep public signatures, PostgREST embeds and all invoker-side predicates.
-- Content OR matches stay under the caller's existing content RLS.
DO $narrow$
DECLARE
  definition text;
  updated text;
BEGIN
  definition := pg_get_functiondef('public.ai_mod02_search_documents(text,boolean,text,bigint,bigint[],text,text,jsonb)'::regprocedure);
  updated := replace(definition, 'FROM public.f03_read_documents() d',
    'FROM erp_private.read_documents_matching(NULL,NULL,NULL,document_type_ids,
      CASE WHEN reference_only THEN lower(btrim(text_query)) END,
      CASE WHEN NOT reference_only AND include_content IS NOT TRUE THEN search_query END) d');
  IF updated = definition THEN RAISE EXCEPTION 'Search projection call site changed'; END IF;
  EXECUTE updated;

  definition := pg_get_functiondef('public.ai_mod02_search_excerpts(bigint[],text)'::regprocedure);
  updated := replace(definition, 'JOIN public.f03_read_documents() d',
    'JOIN erp_private.read_documents_filtered(CASE WHEN cardinality(document_ids) BETWEEN 1 AND 100 THEN document_ids ELSE ARRAY[]::bigint[] END,NULL) d');
  IF updated = definition THEN RAISE EXCEPTION 'Excerpt projection call site changed'; END IF;
  EXECUTE updated;
END $narrow$;

NOTIFY pgrst, 'reload schema';
COMMIT;
