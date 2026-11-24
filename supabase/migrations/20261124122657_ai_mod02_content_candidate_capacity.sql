-- Bound selective extracted-content search before protected composite expansion.
-- No table, index, grant, authorization helper, limit or timeout is changed.
BEGIN;
SET LOCAL lock_timeout='5s';
DO $guard$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid=
   'public.ai_mod02_search_documents(text,boolean,text,bigint,bigint[],text,text,jsonb)'::regprocedure
   AND md5(p.prosrc)='1fba4087249c5e9329485d1dead65fd0'
   AND p.proowner='postgres'::regrole AND NOT p.prosecdef AND p.provolatile='s'
   AND p.proconfig=ARRAY['search_path=""'])
 OR NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid=
   'erp_private.read_documents_matching(bigint[],text[],text[],bigint[],text,tsquery)'::regprocedure
   AND md5(p.prosrc)='78a58f1b738d6dcd8455c9d9c288595e'
   AND p.proowner='postgres'::regrole AND p.prosecdef AND p.provolatile='s'
   AND p.proconfig=ARRAY['search_path=""']) THEN
   RAISE EXCEPTION 'Content search prerequisite changed';
 END IF;
END $guard$;

CREATE OR REPLACE FUNCTION public.ai_mod02_search_documents(text_query text DEFAULT ''::text, include_content boolean DEFAULT false, subject_type text DEFAULT NULL::text, subject_id bigint DEFAULT NULL::bigint, document_type_ids bigint[] DEFAULT '{}'::bigint[], linked_type text DEFAULT NULL::text, expiry_state text DEFAULT NULL::text, metadata_filters jsonb DEFAULT '[]'::jsonb)
 RETURNS SETOF public.dms_documents
 LANGUAGE plpgsql
 STABLE
 SECURITY INVOKER
 SET search_path TO ''
AS $function$
DECLARE search_query tsquery; subject_allowed boolean=true; reference_only boolean=false; candidate_ids bigint[];
BEGIN
 IF NOT public.f03_current_session_valid() THEN RAISE EXCEPTION 'AI_SEARCH_UNAVAILABLE' USING ERRCODE='42501'; END IF;
 IF char_length(coalesce(text_query,''))>500 OR coalesce(cardinality(document_type_ids),0)>100
   OR EXISTS(SELECT 1 FROM unnest(document_type_ids) n WHERE n IS NULL OR n<=0)
   OR (subject_type IS NULL)<>(subject_id IS NULL)
   OR (subject_type IS NOT NULL AND (subject_id<=0 OR subject_type NOT IN ('employee','employee_dependent','company','party','branch','site')))
   OR (linked_type IS NOT NULL AND linked_type NOT IN ('employee','employee_dependent','party','vendor'))
   OR (expiry_state IS NOT NULL AND expiry_state NOT IN ('expired','expiring_soon','valid'))
 THEN RAISE EXCEPTION 'AI_SEARCH_INVALID' USING ERRCODE='22023'; END IF;
 IF jsonb_typeof(metadata_filters) IS DISTINCT FROM 'array' OR jsonb_array_length(metadata_filters)>20 THEN RAISE EXCEPTION 'AI_SEARCH_INVALID' USING ERRCODE='22023';END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(metadata_filters) f WHERE jsonb_typeof(f) IS DISTINCT FROM 'object'
   OR NOT(f ? 'field_code' AND f ? 'value') OR f-'field_code'-'value'<>'{}'::jsonb
   OR jsonb_typeof(f->'field_code') IS DISTINCT FROM 'string' OR jsonb_typeof(f->'value') IS DISTINCT FROM 'string'
   OR (f->>'field_code')!~'^[a-z][a-z0-9_]{0,99}$' OR char_length(f->>'value') NOT BETWEEN 1 AND 200)
 THEN RAISE EXCEPTION 'AI_SEARCH_INVALID' USING ERRCODE='22023';END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(metadata_filters) f WHERE f->>'field_code' IN ('blood_group','result','medical_center'))
   AND NOT public.current_user_has_permission_any_scope('hr.medical.view') THEN RAISE EXCEPTION 'AI_SEARCH_UNAVAILABLE' USING ERRCODE='42501';END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(metadata_filters) f WHERE NOT EXISTS(
   SELECT 1 FROM public.dms_metadata_definitions n WHERE n.field_code=f->>'field_code' AND n.deleted_at IS NULL AND n.is_active AND (n.is_searchable OR n.is_filterable)))
 THEN RAISE EXCEPTION 'AI_SEARCH_FILTER_UNAVAILABLE' USING ERRCODE='22023';END IF;
 IF subject_type='employee' THEN
   SELECT EXISTS(SELECT 1 FROM public.employees e WHERE e.id=subject_id AND e.deleted_at IS NULL
     AND public.f03_has_employee_permission(e.id,'hr.employees.view')) INTO subject_allowed;
 ELSIF subject_type='employee_dependent' THEN
   SELECT EXISTS(SELECT 1 FROM public.employee_dependents d WHERE d.id=subject_id AND d.deleted_at IS NULL
     AND public.f03_has_employee_permission(d.employee_id,'hr.employees.view')) INTO subject_allowed;
 ELSIF subject_type='company' THEN SELECT EXISTS(SELECT 1 FROM public.owner_companies c WHERE c.id=subject_id AND public.current_user_has_permission_any_scope('organizations.view')) INTO subject_allowed;
 ELSIF subject_type='branch' THEN SELECT EXISTS(SELECT 1 FROM public.branches b WHERE b.id=subject_id AND public.current_user_has_permission_any_scope('branches.view')) INTO subject_allowed;
 ELSIF subject_type='party' THEN SELECT EXISTS(SELECT 1 FROM public.parties p WHERE p.id=subject_id AND p.is_active AND (public.current_user_has_permission_any_scope('master_data.parties.view') OR public.current_user_has_permission_any_scope('master_data.party_master.view'))) INTO subject_allowed;
 ELSIF subject_type='site' THEN SELECT EXISTS(SELECT 1 FROM public.work_sites s WHERE s.id=subject_id AND s.deleted_at IS NULL AND (public.current_user_has_permission_any_scope('common_md.view') OR public.current_user_has_permission_any_scope('common_md.work_sites.view'))) INTO subject_allowed;
 END IF;
 IF NOT subject_allowed THEN RAISE EXCEPTION 'AI_SEARCH_SUBJECT_UNAVAILABLE' USING ERRCODE='42501'; END IF;
 search_query=public.ai_mod02_text_query(text_query);
 reference_only=coalesce(cardinality(document_type_ids),0)=0 AND subject_type IS NULL
   AND (btrim(text_query)~'^[A-Za-z][A-Za-z0-9]*(-[A-Za-z][A-Za-z0-9]*)*(-[0-9]+)+$' OR btrim(text_query)~'^[0-9]{4,}$');
 -- A content OR predicate outside the non-inlined protected reader otherwise
 -- expands every authorized composite row before filtering. Both candidate
 -- sources retain existing caller authority; the final reader still performs
 -- all scope/HR/Fleet checks and masking, and all predicates below remain active.
 IF include_content IS TRUE AND NOT reference_only AND search_query IS NOT NULL
   AND coalesce(btrim(text_query),'')<>'' THEN
   candidate_ids := ARRAY(
     SELECT hit.id
     FROM erp_private.read_documents_matching(NULL,NULL,NULL,document_type_ids,NULL,search_query) hit
     UNION
     SELECT c.document_id FROM public.dms_document_content c
     WHERE to_tsvector('simple',coalesce(c.content_text,'')) @@ search_query
   );
   -- ARRAY retains an empty result as {}, never NULL (which means all IDs).
 END IF;
 RETURN QUERY SELECT d.* FROM erp_private.read_documents_matching(candidate_ids,NULL,NULL,document_type_ids,
      CASE WHEN reference_only THEN lower(btrim(text_query)) END,
      CASE WHEN NOT reference_only AND include_content IS NOT TRUE THEN search_query END) d
 WHERE d.deleted_at IS NULL
   AND (coalesce(cardinality(document_type_ids),0)=0 OR d.document_type_id=ANY(document_type_ids))
   AND (NOT EXISTS(SELECT 1 FROM jsonb_array_elements(metadata_filters) f WHERE f->>'field_code' IN ('blood_group','result','medical_center'))
     OR (public.f03_has_document_permission(d.id,'dms.documents.preview') AND EXISTS(SELECT 1 FROM public.dms_document_links medical_subject
       WHERE medical_subject.document_id=d.id AND medical_subject.entity_type='employee' AND medical_subject.deleted_at IS NULL
         AND public.f03_has_employee_permission(medical_subject.entity_id,'hr.medical.view'))))
   AND (subject_type IS NULL
     OR (subject_type='company' AND d.owning_company_id=subject_id)
     OR (subject_type='branch' AND d.owning_branch_id=subject_id)
     OR (subject_type='party' AND d.party_id=subject_id)
     OR (subject_type IN ('employee','employee_dependent','party','site') AND EXISTS(SELECT 1 FROM public.dms_document_links l WHERE l.document_id=d.id AND l.deleted_at IS NULL
       AND l.entity_type=subject_type AND l.entity_id=subject_id))
     OR (subject_type='employee' AND EXISTS(SELECT 1 FROM public.employee_identity_documents i
       WHERE i.employee_id=subject_id AND i.dms_document_id=d.id AND i.deleted_at IS NULL))
     OR (subject_type='employee' AND EXISTS(SELECT 1 FROM public.employees e WHERE e.id=subject_id AND e.deleted_at IS NULL AND e.photo_dms_document_id=d.id))
     OR (subject_type='employee' AND EXISTS(SELECT 1 FROM public.employee_access_cards a
       WHERE a.employee_id=subject_id AND a.dms_document_id=d.id AND a.deleted_at IS NULL))
     OR (subject_type='employee_dependent' AND EXISTS(SELECT 1 FROM public.employee_dependents p
       WHERE p.id=subject_id AND p.deleted_at IS NULL AND (p.dms_document_id=d.id OR p.photo_dms_document_id=d.id))))
   AND (linked_type IS NULL OR EXISTS(SELECT 1 FROM public.dms_document_links l WHERE l.document_id=d.id AND l.entity_type=linked_type AND l.deleted_at IS NULL))
   AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(metadata_filters) f WHERE NOT EXISTS(
     SELECT 1 FROM public.dms_metadata_definitions n JOIN public.dms_document_metadata_values v ON v.definition_id=n.id AND v.document_id=d.id
     WHERE n.document_type_id=d.document_type_id AND n.field_code=f->>'field_code' AND n.deleted_at IS NULL AND n.is_active
       AND (n.is_searchable OR n.is_filterable) AND v.deleted_at IS NULL
       AND CASE WHEN n.field_type='date' THEN
         CASE WHEN (f->>'value')~'^--[0-9]{2}-[0-9]{2}$' THEN to_char(v.value_date,'MM-DD')=substr(f->>'value',3)
              WHEN (f->>'value')~'^--[0-9]{2}$' THEN to_char(v.value_date,'MM')=substr(f->>'value',3)
              ELSE v.value_date::text=f->>'value' END
         ELSE lower(btrim(v.value_text))=lower(btrim(f->>'value'))
           OR v.value_number::text=f->>'value' OR lower(v.value_boolean::text)=lower(f->>'value')
           OR v.value_datetime::text=f->>'value'
           OR v.value_json=to_jsonb(f->>'value')
           OR (jsonb_typeof(v.value_json)='array' AND v.value_json @> jsonb_build_array(f->>'value')) END))
   AND (expiry_state IS NULL
     OR (expiry_state='expired' AND d.expiry_date<(now() AT TIME ZONE 'Asia/Dubai')::date)
     OR (expiry_state='expiring_soon' AND d.expiry_date BETWEEN (now() AT TIME ZONE 'Asia/Dubai')::date AND (now() AT TIME ZONE 'Asia/Dubai')::date+30)
     OR (expiry_state='valid' AND d.expiry_date>=(now() AT TIME ZONE 'Asia/Dubai')::date))
   AND (NOT reference_only OR position(lower(btrim(text_query)) IN lower(d.document_no))>0)
   AND (reference_only OR (search_query IS NULL AND coalesce(btrim(text_query),'')='') OR d.content_tsv @@ search_query
     OR (include_content AND EXISTS(SELECT 1 FROM public.dms_document_content c
       WHERE c.document_id=d.id AND to_tsvector('simple',coalesce(c.content_text,'')) @@ search_query)));
END $function$;

-- Same CREATE OR REPLACE signature preserves owner and existing execution ACL.
COMMIT;

