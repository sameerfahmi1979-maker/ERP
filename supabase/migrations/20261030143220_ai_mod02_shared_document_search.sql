BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';

-- New invoker-only functions. Existing tables, RLS, grants and deployed RPCs stay intact.
CREATE FUNCTION public.ai_mod02_identity_text(value text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE SECURITY INVOKER SET search_path='' AS $$
 SELECT btrim(regexp_replace(regexp_replace(translate(lower(normalize(coalesce(value,''),NFKC)),
   'أإآى','اااي'),U&'[\064B-\065F\0670\0640]','','g'),'[^[:alnum:]@._/-]+',' ','g'));
$$;

CREATE FUNCTION public.ai_mod02_resolve_subject(search_name text)
RETURNS TABLE(entity_type text,entity_id bigint,label text,code text)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 WITH candidates AS (
 SELECT 'employee'::text kind,e.id,e.full_name_en name,e.employee_code business_code,e.full_name_ar alternate
 FROM public.employees e WHERE e.deleted_at IS NULL
   AND public.current_user_has_permission_any_scope('hr.employees.view') AND public.f03_has_employee_permission(e.id,'hr.employees.view')
 UNION ALL SELECT 'employee_dependent',d.id,d.dependent_name_en,NULL::text,d.dependent_name_ar
 FROM public.employee_dependents d WHERE d.deleted_at IS NULL
   AND public.current_user_has_permission_any_scope('hr.employees.view') AND public.f03_has_employee_permission(d.employee_id,'hr.employees.view')
 UNION ALL SELECT 'company',c.id,c.trade_name,c.company_code,NULL::text FROM public.owner_companies c
 WHERE public.current_user_has_permission_any_scope('organizations.view')
 UNION ALL SELECT 'branch',b.id,b.branch_name_en,b.branch_code,NULL::text FROM public.branches b
 WHERE public.current_user_has_permission_any_scope('branches.view')
 UNION ALL SELECT 'party',p.id,p.display_name,p.party_code,NULL::text FROM public.parties p
 WHERE p.is_active AND (public.current_user_has_permission_any_scope('master_data.parties.view') OR public.current_user_has_permission_any_scope('master_data.party_master.view'))
 UNION ALL SELECT 'site',s.id,s.site_name,s.site_code,NULL::text FROM public.work_sites s
 WHERE s.deleted_at IS NULL AND (public.current_user_has_permission_any_scope('common_md.view') OR public.current_user_has_permission_any_scope('common_md.work_sites.view'))
 ), wanted AS (SELECT public.ai_mod02_identity_text(search_name) q)
 SELECT c.kind,c.id,CASE WHEN public.ai_mod02_identity_text(c.name)=w.q OR public.ai_mod02_identity_text(c.business_code)=w.q
   OR left(public.ai_mod02_identity_text(c.name),char_length(w.q)+1)=w.q||' ' THEN c.name ELSE c.alternate END,c.business_code FROM candidates c CROSS JOIN wanted w
 WHERE public.f03_current_session_valid() AND char_length(w.q) BETWEEN 2 AND 200
   AND (public.ai_mod02_identity_text(c.name)=w.q OR public.ai_mod02_identity_text(c.business_code)=w.q
     OR left(public.ai_mod02_identity_text(c.name),char_length(w.q)+1)=w.q||' '
     OR (coalesce(c.alternate,'')<>'' AND (public.ai_mod02_identity_text(c.alternate)=w.q OR left(public.ai_mod02_identity_text(c.alternate),char_length(w.q)+1)=w.q||' ')))
 ORDER BY c.kind,c.id LIMIT 21;
$$;

CREATE FUNCTION public.ai_mod02_text_query(value text)
RETURNS tsquery LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE term text;parts text[]='{}';
BEGIN
 IF char_length(coalesce(value,''))>500 THEN RAISE EXCEPTION 'AI_SEARCH_INVALID' USING ERRCODE='22023';END IF;
 FOR term IN SELECT (m)[1] FROM regexp_matches(lower(normalize(coalesce(value,''),NFKC)),
   '([[:alnum:]][[:alnum:]]*([@._:/-][[:alnum:]][[:alnum:]]*)*)','g') m LOOP
   IF char_length(term)>120 OR cardinality(parts)>=80 THEN RAISE EXCEPTION 'AI_SEARCH_INVALID' USING ERRCODE='22023';END IF;
   parts=array_append(parts,CASE WHEN term IN ('certificate','certificates','certification','certifications')
     THEN '(''certificate'' | ''certificates'' | ''certification'' | ''certifications'')' ELSE quote_literal(term) END);
 END LOOP;
 RETURN CASE WHEN cardinality(parts)>0 THEN to_tsquery('simple',array_to_string(parts,' & ')) ELSE NULL END;
END $$;

CREATE FUNCTION public.ai_mod02_search_documents(
 text_query text DEFAULT '', include_content boolean DEFAULT false,
 subject_type text DEFAULT NULL,subject_id bigint DEFAULT NULL,document_type_ids bigint[] DEFAULT '{}'::bigint[],linked_type text DEFAULT NULL,expiry_state text DEFAULT NULL,metadata_filters jsonb DEFAULT '[]'::jsonb)
RETURNS SETOF public.dms_documents LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE search_query tsquery; subject_allowed boolean=true; reference_only boolean=false;
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
 RETURN QUERY SELECT d.* FROM public.f03_read_documents() d
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
END $$;

CREATE FUNCTION public.ai_mod02_search_excerpts(document_ids bigint[],search_text text)
RETURNS TABLE(document_id bigint,excerpt text,document_version timestamptz,content_version timestamptz)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT c.document_id,left(ts_headline('simple',c.content_text,public.ai_mod02_text_query(search_text),
   'StartSel=,StopSel=,MaxWords=20,MinWords=5,MaxFragments=1'),120),d.updated_at,c.content_text_updated_at
 FROM public.dms_document_content c JOIN public.f03_read_documents() d ON d.id=c.document_id
 WHERE public.f03_current_session_valid() AND cardinality(document_ids) BETWEEN 1 AND 100
   AND c.document_id=ANY(document_ids) AND public.f03_has_document_permission(c.document_id,'dms.documents.preview')
   AND public.ai_mod02_text_query(search_text) IS NOT NULL
   AND to_tsvector('simple',coalesce(c.content_text,'')) @@ public.ai_mod02_text_query(search_text);
$$;
REVOKE ALL ON FUNCTION public.ai_mod02_text_query(text),public.ai_mod02_search_excerpts(bigint[],text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.ai_mod02_text_query(text),public.ai_mod02_search_excerpts(bigint[],text) TO authenticated;

CREATE FUNCTION public.ai_mod02_search_global(
 search_text text,domains text[] DEFAULT ARRAY['organization','branch','party','site','dms_document'],
 document_text text DEFAULT '',subject_type text DEFAULT NULL,subject_id bigint DEFAULT NULL,document_type_ids bigint[] DEFAULT '{}'::bigint[],expiry_state text DEFAULT NULL)
RETURNS TABLE(entity_type text,entity_id bigint,title text,business_code text,source_version timestamptz)
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE words tsquery;
BEGIN
 IF NOT public.f03_current_session_valid() THEN RAISE EXCEPTION 'AI_SEARCH_UNAVAILABLE' USING ERRCODE='42501'; END IF;
 IF char_length(btrim(search_text)) NOT BETWEEN 1 AND 500 OR cardinality(domains)>5 OR EXISTS(SELECT 1 FROM unnest(domains) d WHERE d IS NULL OR d NOT IN ('organization','branch','party','site','dms_document'))
 THEN RAISE EXCEPTION 'AI_SEARCH_INVALID' USING ERRCODE='22023'; END IF;
 words=plainto_tsquery('simple',search_text);
 RETURN QUERY
 SELECT 'organization'::text,c.id,coalesce(c.trade_name,c.legal_name_en,c.company_code),c.company_code,c.updated_at
 FROM public.owner_companies c WHERE 'organization'=ANY(domains) AND public.current_user_has_permission_any_scope('organizations.view')
   AND to_tsvector('simple',concat_ws(' ',c.trade_name,c.legal_name_en,c.company_code)) @@ words
 UNION ALL SELECT 'branch',b.id,b.branch_name_en,b.branch_code,b.updated_at FROM public.branches b
 WHERE 'branch'=ANY(domains) AND public.current_user_has_permission_any_scope('branches.view') AND to_tsvector('simple',concat_ws(' ',b.branch_name_en,b.branch_code)) @@ words
 UNION ALL SELECT 'party',p.id,p.display_name,p.party_code,p.updated_at FROM public.parties p
 WHERE 'party'=ANY(domains) AND p.is_active AND (public.current_user_has_permission_any_scope('master_data.parties.view') OR public.current_user_has_permission_any_scope('master_data.party_master.view'))
   AND to_tsvector('simple',concat_ws(' ',p.display_name,p.party_code)) @@ words
 UNION ALL SELECT 'site',s.id,s.site_name,s.site_code,s.updated_at FROM public.work_sites s
 WHERE 'site'=ANY(domains) AND s.deleted_at IS NULL AND (public.current_user_has_permission_any_scope('common_md.view') OR public.current_user_has_permission_any_scope('common_md.work_sites.view'))
   AND to_tsvector('simple',concat_ws(' ',s.site_name,s.site_code)) @@ words
 UNION ALL SELECT 'dms_document',d.id,d.title,d.document_no,d.updated_at
 FROM public.ai_mod02_search_documents(document_text,false,subject_type,subject_id,document_type_ids,NULL,expiry_state,'[]'::jsonb) d
 WHERE 'dms_document'=ANY(domains) AND (public.current_user_has_permission_any_scope('dms.documents.view') OR public.current_user_has_permission_any_scope('dms.admin'))
   AND NOT d.is_archived AND d.status NOT IN ('archived','superseded','deleted');
END $$;
REVOKE ALL ON FUNCTION public.ai_mod02_search_global(text,text[],text,text,bigint,bigint[],text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.ai_mod02_search_global(text,text[],text,text,bigint,bigint[],text) TO authenticated;

REVOKE ALL ON FUNCTION public.ai_mod02_identity_text(text),public.ai_mod02_resolve_subject(text),
 public.ai_mod02_search_documents(text,boolean,text,bigint,bigint[],text,text,jsonb) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.ai_mod02_identity_text(text),public.ai_mod02_resolve_subject(text),
 public.ai_mod02_search_documents(text,boolean,text,bigint,bigint[],text,text,jsonb) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
