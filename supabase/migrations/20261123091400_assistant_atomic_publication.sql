BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- Capture only new admissions. A pre-migration pending turn has no authentic
-- snapshot and stays available to the original recovery flow.
ALTER TABLE erp_private.ai_mod05_turn_admissions
  ADD COLUMN publication_claims jsonb,
  ADD COLUMN publication_authority text,
  ADD COLUMN published_message bigint,
  ADD COLUMN published_digest text;
ALTER TABLE erp_private.ai_mod05_turn_admissions
  ALTER COLUMN publication_claims SET DEFAULT jsonb_build_object(
    'role', 'authenticated', 'sub', auth.uid(), 'session_id', auth.jwt()->>'session_id'),
  ALTER COLUMN publication_authority SET DEFAULT erp_private.ai_mod05_authority();

-- The graph used by the model and its digest share one snapshot. Other
-- application requests keep the existing bootstrap and payload unchanged.
CREATE FUNCTION public.erp_assistant_publication_auth_graph(p_auth_user_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  WITH current_graph AS MATERIALIZED (SELECT public.erp_current_auth_graph(p_auth_user_id) AS g)
  SELECT jsonb_build_object('graph',g,'hash',encode(sha256(convert_to((g-'profile')::text,'UTF8')),'hex')) FROM current_graph;
$$;
REVOKE ALL ON FUNCTION public.erp_assistant_publication_auth_graph(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.erp_assistant_publication_auth_graph(uuid) TO service_role;

CREATE FUNCTION erp_private.begin_assistant_publication(p_session bigint, p_request uuid, p_hash text, p_graph_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE admission jsonb;
BEGIN
  admission := public.ai_mod05_turn('begin',p_session,p_request,p_hash);
  IF p_graph_hash IS NULL OR public.erp_assistant_publication_auth_graph(auth.uid())->>'hash' IS DISTINCT FROM p_graph_hash THEN
    RAISE EXCEPTION 'Assistant generation authority changed' USING ERRCODE='42501';
  END IF;
  RETURN admission;
END $$;
REVOKE ALL ON FUNCTION erp_private.begin_assistant_publication(bigint,uuid,text,text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION erp_private.begin_assistant_publication(bigint,uuid,text,text) TO authenticated;
CREATE FUNCTION public.erp_begin_assistant_publication(p_session bigint, p_request uuid, p_hash text, p_graph_hash text)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT erp_private.begin_assistant_publication(p_session,p_request,p_hash,p_graph_hash);
$$;
REVOKE ALL ON FUNCTION public.erp_begin_assistant_publication(bigint,uuid,text,text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.erp_begin_assistant_publication(bigint,uuid,text,text) TO authenticated;

-- Mirror the existing transaction-audit writer pattern. Only the server may
-- supply generated text. During publication all source and conversation RLS
-- runs as an ordinary authenticated role with the admission's exact identity.
CREATE ROLE erp_assistant_publisher NOLOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
GRANT authenticated TO erp_assistant_publisher;
GRANT erp_assistant_publisher TO postgres;
GRANT USAGE ON SCHEMA public, erp_private TO erp_assistant_publisher;
GRANT SELECT ON erp_private.ai_mod05_turn_admissions TO erp_assistant_publisher;
GRANT UPDATE (published_message, published_digest, state, completed_at) ON erp_private.ai_mod05_turn_admissions TO erp_assistant_publisher;
CREATE POLICY assistant_publisher_admission_read ON erp_private.ai_mod05_turn_admissions
  FOR SELECT TO erp_assistant_publisher USING (true);
CREATE POLICY assistant_publisher_admission_update ON erp_private.ai_mod05_turn_admissions
  FOR UPDATE TO erp_assistant_publisher USING (true) WITH CHECK (actor = public.current_user_profile_id());

CREATE POLICY assistant_publication_required ON public.erp_ai_assistant_messages
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (current_user = 'erp_assistant_publisher' OR (role = 'system_notice' AND output_type = 'blocked_notice'
    AND message_text = 'A dangerous action was requested and was blocked by the assistant safety layer.'
    AND safe_metadata_json - 'blocked_action_codes' = '{}'::jsonb));

CREATE FUNCTION erp_private.assistant_publication_sources_current(p_sources jsonb)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $$
DECLARE s jsonb; kind text; entity bigint; observed timestamptz; caps text[];
BEGIN
  IF jsonb_typeof(p_sources) IS DISTINCT FROM 'array' OR jsonb_array_length(p_sources) > 96 THEN RETURN false; END IF;
  FOR s IN SELECT value FROM jsonb_array_elements(p_sources) LOOP
    kind := s#>>'{reference,entityType}';
    IF jsonb_typeof(s#>'{reference,entityId}') IS DISTINCT FROM 'number'
       OR (s#>>'{reference,entityId}') !~ '^[1-9][0-9]{0,15}$'
       OR jsonb_typeof(s->'sourceVersion') IS DISTINCT FROM 'string' THEN RETURN false; END IF;
    entity := (s#>>'{reference,entityId}')::bigint;
    CASE kind
      WHEN 'company' THEN
        caps := ARRAY['organizations.view'];
        SELECT updated_at INTO observed FROM public.owner_companies WHERE id=entity;
      WHEN 'party' THEN
        caps := ARRAY['master_data.parties.view','master_data.party_master.view'];
        SELECT updated_at INTO observed FROM public.parties WHERE id=entity;
      WHEN 'branch' THEN
        caps := ARRAY['branches.view'];
        SELECT updated_at INTO observed FROM public.branches WHERE id=entity;
      WHEN 'site' THEN
        caps := ARRAY['common_md.view','common_md.work_sites.view'];
        SELECT updated_at INTO observed FROM public.work_sites WHERE id=entity;
      WHEN 'employee' THEN
        caps := ARRAY['hr.employees.view'];
        SELECT updated_at INTO observed FROM public.employees WHERE id=entity AND deleted_at IS NULL;
      WHEN 'dependent' THEN
        caps := ARRAY['hr.employees.view'];
        SELECT updated_at INTO observed FROM public.f03_read_employee_dependents() WHERE id=entity AND deleted_at IS NULL;
      WHEN 'dms_document' THEN
        caps := ARRAY['dms.documents.view'];
        IF public.f03_has_document_permission(entity,'dms.documents.view') IS NOT TRUE THEN RETURN false; END IF;
        SELECT updated_at INTO observed FROM public.f03_read_documents() WHERE id=entity;
      ELSE RETURN false;
    END CASE;
    IF observed IS NULL OR observed IS DISTINCT FROM (s->>'sourceVersion')::timestamptz
       OR NOT EXISTS (SELECT FROM unnest(caps) c WHERE public.current_user_has_permission_any_scope(c)) THEN RETURN false; END IF;
  END LOOP;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION erp_private.assistant_publication_sources_current(jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION erp_private.assistant_publication_sources_current(jsonb) TO erp_assistant_publisher;

-- Match bounded results, membership and empty reads using the caller's source policies.
-- Results are transient inputs. No child query or contents are saved to the ledger.
CREATE FUNCTION erp_private.assistant_publication_queries_current(p_queries jsonb)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE q jsonb; k text; e bigint; n integer; v jsonb; cap text;
  a jsonb; f jsonb; page_offset integer; today date:=(statement_timestamp() AT TIME ZONE 'Asia/Dubai')::date;
BEGIN
  IF jsonb_typeof(p_queries) IS DISTINCT FROM 'array' OR jsonb_array_length(p_queries)>64 THEN RETURN false; END IF;
  FOR q IN SELECT value FROM jsonb_array_elements(p_queries) LOOP
    k:=q#>>'{reference,entityType}'; e:=(q#>>'{reference,entityId}')::bigint; n:=(q->>'limit')::integer; cap:=NULL;
    a:=q#>'{params,args}'; f:=q#>'{params,filters}'; page_offset:=(q#>>'{params,offset}')::integer;
    IF n IS NULL OR n NOT BETWEEN 0 AND 5000 OR ((q ? 'reference') AND (e IS NULL OR e<=0)) THEN RETURN false; END IF;
    CASE q->>'kind'
      WHEN 'document_page' THEN
        IF n>100 OR page_offset NOT BETWEEN 0 AND 1000000 OR coalesce(f->>'lifecycle','current')<>'current'
          OR (f-ARRAY['lifecycle','expiryFrom','expiryTo','expiryState','candidateIds'])<>'{}'::jsonb THEN RETURN false; END IF;
        WITH visible AS MATERIALIZED (
          SELECT d.id,d.updated_at,d.created_at,d.document_type_id FROM public.ai_mod02_search_documents(
            a->>'text_query',(a->>'include_content')::boolean,a->>'subject_type',(a->>'subject_id')::bigint,
            ARRAY(SELECT jsonb_array_elements_text(a->'document_type_ids')::bigint),a->>'linked_type',a->>'expiry_state',(a->>'metadata_filters')::jsonb) d
          WHERE d.is_archived=false AND d.status NOT IN ('archived','superseded','deleted')
            AND (NOT(f?'candidateIds') OR d.id IN(SELECT jsonb_array_elements_text(f->'candidateIds')::bigint))
            AND (NOT(f?'expiryFrom') OR d.expiry_date >= (f->>'expiryFrom')::date)
            AND (NOT(f?'expiryTo') OR d.expiry_date <= (f->>'expiryTo')::date)
            AND CASE f->>'expiryState' WHEN 'expiring_soon' THEN d.expiry_date BETWEEN today AND today+30
              WHEN 'expired' THEN d.expiry_date<today WHEN 'valid' THEN d.expiry_date>=today
              WHEN 'missing_expiry' THEN d.expiry_date IS NULL ELSE NOT(f?'expiryState') END
        ), page AS (SELECT * FROM visible ORDER BY created_at DESC NULLS LAST,id DESC OFFSET page_offset LIMIT n)
        SELECT jsonb_build_object('count',(SELECT count(*) FROM visible),'rows',coalesce(jsonb_agg(
          jsonb_build_array(p.id,p.updated_at,t.name_en,t.type_code) ORDER BY p.created_at DESC NULLS LAST,p.id DESC),'[]'))
        INTO v FROM page p LEFT JOIN public.dms_document_types t ON t.id=p.document_type_id;
      WHEN 'global_page' THEN
        IF n>100 OR page_offset NOT BETWEEN 0 AND 1000000 THEN RETURN false; END IF;
        WITH visible AS MATERIALIZED (SELECT entity_type,entity_id,source_version FROM public.ai_mod02_search_global(a->>'search_text',
          ARRAY(SELECT jsonb_array_elements_text(a->'domains')),a->>'document_text',a->>'subject_type',(a->>'subject_id')::bigint,
          ARRAY(SELECT jsonb_array_elements_text(a->'document_type_ids')::bigint),a->>'expiry_state')),
        page AS (SELECT * FROM visible ORDER BY entity_type,entity_id OFFSET page_offset LIMIT n)
        SELECT jsonb_build_object('count',(SELECT count(*) FROM visible),'rows',coalesce(jsonb_agg(
          jsonb_build_array(entity_type,entity_id,source_version) ORDER BY entity_type,entity_id),'[]')) INTO v FROM page;
      WHEN 'subject_lookup' THEN
        SELECT coalesce(jsonb_agg(jsonb_build_array(entity_type,entity_id,label,code) ORDER BY entity_type COLLATE "C",entity_id),'[]')
          INTO v FROM public.ai_mod02_resolve_subject(q->>'term');
      WHEN 'type_lookup' THEN
        SELECT coalesce(jsonb_agg(jsonb_build_array(id,name_en,type_code) ORDER BY id),'[]') INTO v FROM public.dms_document_types WHERE deleted_at IS NULL;
      WHEN 'company_labels' THEN
        SELECT coalesce(jsonb_agg(jsonb_build_array(id,company_code,trade_name) ORDER BY id),'[]') INTO v FROM public.owner_companies
        WHERE id IN (SELECT jsonb_array_elements_text(q#>'{params,ids}')::bigint);
      WHEN 'branch_labels' THEN
        SELECT coalesce(jsonb_agg(jsonb_build_array(id,branch_code,branch_name_en) ORDER BY id),'[]') INTO v FROM public.branches
        WHERE id IN (SELECT jsonb_array_elements_text(q#>'{params,ids}')::bigint);
      WHEN 'site_labels' THEN
        SELECT coalesce(jsonb_agg(jsonb_build_array(id,site_code,site_name) ORDER BY id),'[]') INTO v FROM public.work_sites
        WHERE deleted_at IS NULL AND id IN (SELECT jsonb_array_elements_text(q#>'{params,ids}')::bigint);
      WHEN 'site_links' THEN
        SELECT coalesce(jsonb_agg(jsonb_build_array(document_id,entity_id) ORDER BY id),'[]') INTO v FROM public.dms_document_links
        WHERE entity_type='site' AND deleted_at IS NULL AND document_id IN (SELECT jsonb_array_elements_text(q#>'{params,ids}')::bigint);
      WHEN 'approval' THEN
        IF k<>'dms_document' THEN RETURN false; END IF;
        WITH routing AS MATERIALIZED (SELECT public.ai_mod04_approval_routing('read',jsonb_build_object('documentId',e)) r)
        SELECT jsonb_build_object('approvalStatus',d.approval_status,'workflow',CASE WHEN r->>'state'='assigned' THEN 'company_type_branch_configured' ELSE r->>'state' END,
          'assignees',(SELECT coalesce(jsonb_agg(p->'label' ORDER BY ord),'[]') FROM jsonb_array_elements(r->'assignees') WITH ORDINALITY a(p,ord)),
          'notificationReadiness',r->>'notificationReadiness') INTO v FROM routing,public.f03_read_documents() d WHERE d.id=e;
      WHEN 'dashboard_risk' THEN
        SELECT jsonb_build_array(count(*) FILTER(WHERE risk_level='critical'),count(*) FILTER(WHERE risk_level='high'),
          count(*) FILTER(WHERE updated_at<(q#>>'{params,since}')::timestamptz),
          count(*) FILTER(WHERE risk_level IN ('critical','high','medium','low','none') AND status='pending_review')) INTO v
          FROM public.erp_ai_risk_scores WHERE deleted_at IS NULL;
      WHEN 'dashboard_compliance' THEN
        SELECT jsonb_build_array(count(*) FILTER(WHERE status='open'),count(*) FILTER(WHERE severity='critical'),
          count(*) FILTER(WHERE severity='high')) INTO v FROM public.erp_ai_compliance_findings WHERE deleted_at IS NULL AND status IN ('open','acknowledged');
      WHEN 'dashboard_duplicates' THEN
        SELECT jsonb_build_array(count(*),count(*) FILTER(WHERE confidence_score>=0.8),count(*) FILTER(WHERE candidate_type='conflict')) INTO v
        FROM public.erp_ai_duplicate_candidates WHERE deleted_at IS NULL AND status IN ('pending','under_review');
      WHEN 'dashboard_fields' THEN
        SELECT jsonb_build_array(count(*) FILTER(WHERE status='pending'),count(*) FILTER(WHERE status='accepted' AND updated_at>=(q#>>'{params,since}')::timestamptz),
          count(*) FILTER(WHERE status='rejected' AND updated_at>=(q#>>'{params,since}')::timestamptz),count(*) FILTER(WHERE status='conflict_detected')) INTO v
          FROM public.erp_ai_field_suggestions WHERE deleted_at IS NULL;
      WHEN 'dashboard_dms' THEN
        SELECT jsonb_build_array(count(*) FILTER(WHERE created_at>=(q#>>'{params,since}')::timestamptz),count(*) FILTER(WHERE ocr_text_available IS NOT TRUE),
          count(*) FILTER(WHERE ai_summary_status<>'complete'),count(*) FILTER(WHERE summary_embedding_status<>'complete'),count(*) FILTER(WHERE ai_risk_level IN ('high','critical')))
          INTO v FROM public.f03_read_documents() WHERE deleted_at IS NULL;

      WHEN 'risk' THEN
        cap:='ai.risk.view';
        SELECT coalesce(jsonb_agg(jsonb_build_array(id,risk_score,risk_level,status) ORDER BY id),'[]') INTO v FROM public.erp_ai_risk_scores
          WHERE entity_type=k AND entity_id=e AND deleted_at IS NULL AND status NOT IN ('superseded','failed');
      WHEN 'compliance' THEN
        cap:='ai.compliance.view';
        SELECT coalesce(jsonb_agg(jsonb_build_array(id,severity,finding,status) ORDER BY severity,id),'[]') INTO v
        FROM (SELECT id,severity,coalesce(ai_reason,recommended_action,finding_type) finding,status
          FROM public.erp_ai_compliance_findings WHERE entity_type=k AND entity_id=e AND deleted_at IS NULL
          AND status IN ('open','pending_review') ORDER BY severity,id LIMIT n)x;
      WHEN 'duplicates' THEN
        cap:='ai.duplicates.view';
        SELECT coalesce(jsonb_agg(jsonb_build_array(id,confidence_score,status,entity_type_a,entity_id_a,entity_type_b,entity_id_b)
          ORDER BY confidence_score DESC,id),'[]') INTO v
        FROM (SELECT id,confidence_score,status,entity_type_a,entity_id_a,entity_type_b,entity_id_b
          FROM public.erp_ai_duplicate_candidates WHERE deleted_at IS NULL AND status='pending'
          AND ((entity_type_a=k AND entity_id_a=e) OR (entity_type_b=k AND entity_id_b=e))
          ORDER BY confidence_score DESC,id LIMIT n)x;
      WHEN 'dependents' THEN
        IF k<>'employee' OR n<>20 THEN RETURN false; END IF;
        WITH visible AS MATERIALIZED (SELECT id,dependent_name_en,updated_at FROM public.f03_read_employee_dependents()
          WHERE employee_id=e AND is_active AND deleted_at IS NULL)
        SELECT jsonb_build_object('count',(SELECT count(*) FROM visible),
          'rows',coalesce((SELECT jsonb_agg(jsonb_build_array(id,dependent_name_en,updated_at) ORDER BY id)
          FROM (SELECT * FROM visible ORDER BY id LIMIT n)x),'[]')) INTO v;
      WHEN 'expiry_identity' THEN
        IF k<>'dms_document' OR n<>2 THEN RETURN false; END IF;
        SELECT coalesce(jsonb_agg(jsonb_build_array(id,employee_id,expiry_date) ORDER BY id),'[]') INTO v
          FROM (SELECT id,employee_id,expiry_date FROM public.employee_identity_documents WHERE dms_document_id=e
            AND deleted_at IS NULL ORDER BY id LIMIT n)x;
      WHEN 'expiry_access' THEN
        IF k<>'dms_document' OR n<>2 THEN RETURN false; END IF;
        SELECT coalesce(jsonb_agg(jsonb_build_array(id,employee_id,expiry_date) ORDER BY id),'[]') INTO v
          FROM (SELECT id,employee_id,expiry_date FROM public.employee_access_cards WHERE dms_document_id=e
            AND deleted_at IS NULL ORDER BY id LIMIT n)x;
      WHEN 'policy' THEN
        SELECT to_jsonb(value) INTO v FROM public.system_settings WHERE category='AI' AND key='ERP_AI_APPROVED_POLICY_SOURCES';
      WHEN 'excerpt' THEN
        IF k<>'dms_document' OR length(q->>'term') NOT BETWEEN 1 AND 200 THEN RETURN false; END IF;
        SELECT coalesce(jsonb_agg(jsonb_build_array(document_id,document_version,content_version,excerpt)),'[]') INTO v
        FROM public.ai_mod02_search_excerpts(ARRAY[e],q->>'term');
      WHEN 'understanding' THEN
        IF k<>'dms_document' OR NOT EXISTS (SELECT FROM public.erp_ai_feature_flags WHERE feature_code='ERP_AI_DOC_UNDERSTANDING' AND is_enabled) THEN RETURN false; END IF;
        WITH extract AS MATERIALIZED (SELECT id,ai_status,raw_ocr_text,field_confidence_json j FROM public.dms_ai_extraction_results
          WHERE document_id=e ORDER BY created_at DESC,id DESC LIMIT 1),
        fields AS (SELECT a.value FROM extract x CROSS JOIN LATERAL jsonb_array_elements(
          CASE WHEN jsonb_typeof(x.j)='array' THEN x.j ELSE '[]'::jsonb END)a WHERE jsonb_typeof(a.value) IN ('object','array')
          UNION ALL SELECT a.value FROM extract x CROSS JOIN LATERAL jsonb_each(CASE WHEN jsonb_typeof(x.j)='object' THEN x.j ELSE '{}'::jsonb END)a)
        SELECT jsonb_build_object('typeName',t.name_en,'typeCode',t.type_code,
          'summary',CASE WHEN d.confidentiality_level IN ('hr','legal','executive') AND NOT public.current_user_has_permission_any_scope('dms.admin')
            THEN NULL ELSE left(d.ai_summary,600) END,
          'fileOcr',EXISTS(SELECT FROM public.f03_read_document_files() f WHERE f.document_id=e AND f.deleted_at IS NULL
              AND (f.ocr_status IN ('complete','skipped') OR f.ocr_text ~ '[^[:space:]]')),
          'content',EXISTS(SELECT FROM public.dms_document_content c WHERE c.document_id=e AND c.content_text_char_count>0),
          'linked',EXISTS(SELECT FROM public.dms_document_links l WHERE l.document_id=e AND l.deleted_at IS NULL),
          'extraction',(SELECT jsonb_build_array(id,ai_status,coalesce(raw_ocr_text ~ '[^[:space:]]',false),(SELECT count(*) FROM fields),
            EXISTS(SELECT FROM fields WHERE lower(coalesce(value->>'confidence_label',value->>'label','')) IN ('low','needs_manual_review'))) FROM extract))
          INTO v FROM public.f03_read_documents() d LEFT JOIN public.dms_document_types t ON t.id=d.document_type_id WHERE d.id=e;
      ELSE RETURN false;
    END CASE;
    IF cap IS NOT NULL AND NOT (public.current_user_has_permission_any_scope(cap) OR public.current_user_has_permission_any_scope('ai.common.admin')) THEN RETURN false; END IF;
    IF coalesce(v,'null'::jsonb) IS DISTINCT FROM q->'result' THEN RETURN false; END IF;
  END LOOP;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION erp_private.assistant_publication_queries_current(jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION erp_private.assistant_publication_queries_current(jsonb) TO erp_assistant_publisher;

-- Invoked only by the publisher after caller-RLS checks. The lock helper
-- returns no data; read-only callers never need UPDATE privilege on sources.
CREATE FUNCTION erp_private.lock_assistant_publication_sources(p_sources jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE s record; relation text;
BEGIN
  FOR s IN SELECT DISTINCT value#>>'{reference,entityType}' kind,
            (value#>>'{reference,entityId}')::bigint entity FROM jsonb_array_elements(p_sources)
            ORDER BY 1,2 LOOP
    relation := CASE s.kind WHEN 'company' THEN 'owner_companies' WHEN 'party' THEN 'parties'
      WHEN 'branch' THEN 'branches' WHEN 'site' THEN 'work_sites' WHEN 'employee' THEN 'employees'
      WHEN 'dependent' THEN 'employee_dependents' WHEN 'dms_document' THEN 'dms_documents' END;
    IF relation IS NULL THEN RAISE EXCEPTION 'Unknown source' USING ERRCODE='42501'; END IF;
    IF s.kind = 'dms_document' THEN
      -- Exclusive parent lock also conflicts with new FK relationships.
      PERFORM FROM public.dms_documents WHERE id=s.entity FOR UPDATE NOWAIT;
      PERFORM erp_private.ai_mod04_lock_source(s.entity);
    ELSE
      EXECUTE format('SELECT id FROM public.%I WHERE id=$1 FOR SHARE NOWAIT',relation) USING s.entity;
      IF s.kind='dependent' THEN
        PERFORM FROM public.employees e JOIN public.employee_dependents d ON d.employee_id=e.id
          WHERE d.id=s.entity FOR SHARE OF e NOWAIT;
      END IF;
    END IF;
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION erp_private.lock_assistant_publication_sources(jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION erp_private.lock_assistant_publication_sources(jsonb) TO erp_assistant_publisher;

CREATE FUNCTION erp_private.publish_assistant_turn(p_actor bigint, p_auth_user uuid, p_session bigint,
  p_request uuid, p_hash text, p_binding jsonb, p_generation jsonb, p_prompt text, p_answer text, p_output text, p_meta jsonb)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  adm erp_private.ai_mod05_turn_admissions;
  sess public.erp_ai_assistant_sessions;
  subject jsonb := nullif(p_meta->'ai_mod03_subject_binding','null'::jsonb);
  sources jsonb; digest text; answer_id bigint; original_claims text := current_setting('request.jwt.claims',true);
  context_kind text;
BEGIN
  IF auth.jwt()->>'role' IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Trusted publication required' USING ERRCODE='42501'; END IF;
  SELECT * INTO adm FROM erp_private.ai_mod05_turn_admissions
    WHERE actor=p_actor AND session_id=p_session AND request_id=p_request AND input_hash=p_hash FOR UPDATE NOWAIT;
  IF adm.publication_claims->>'sub' IS DISTINCT FROM p_auth_user::text OR p_auth_user IS NULL
     OR adm.publication_authority IS NULL OR adm.state='held' THEN RAISE EXCEPTION 'Original admission unavailable' USING ERRCODE='42501'; END IF;
  PERFORM set_config('request.jwt.claims',adm.publication_claims::text,true);
  PERFORM erp_private.ai_mod05_lock_actor();
  IF public.current_user_profile_id() IS DISTINCT FROM p_actor OR erp_private.business_principal_is_active() IS NOT TRUE
     OR public.current_user_has_permission_any_scope('ai.assistant.use') IS NOT TRUE
     OR erp_private.ai_mod05_authority() IS DISTINCT FROM adm.publication_authority
     OR p_meta->>'ai_mod05_authority' IS DISTINCT FROM adm.publication_authority
     OR p_meta->>'ai_mod05_turn_request' IS DISTINCT FROM p_request::text
     OR NOT EXISTS (SELECT FROM public.erp_ai_feature_flags WHERE feature_code='ERP_AI_ASSISTANT' AND is_enabled) THEN
    RAISE EXCEPTION 'Assistant authority changed' USING ERRCODE='42501';
  END IF;
  SELECT * INTO sess FROM public.erp_ai_assistant_sessions WHERE id=p_session AND owner_user_profile_id=p_actor
    AND status='active' AND deleted_at IS NULL FOR UPDATE NOWAIT;
  IF sess.id IS NULL OR p_binding->>'version' IS DISTINCT FROM '1' OR p_binding->>'ownerProfileId' IS DISTINCT FROM p_actor::text
    OR p_binding->>'sessionId' IS DISTINCT FROM p_session::text OR coalesce(p_binding->>'authorityFingerprint','') !~ '^[a-f0-9]{64}$'
    OR jsonb_typeof(p_binding->'sources') IS DISTINCT FROM 'array' OR jsonb_array_length(p_binding->'sources')>10
    OR NOT (p_meta ? 'ai_mod01_binding') OR (p_meta->'ai_mod01_binding' <> 'null'::jsonb AND p_meta->'ai_mod01_binding' <> p_binding)
    OR (subject IS NULL) IS DISTINCT FROM (nullif(p_meta->'ai_mod03_subject','null'::jsonb) IS NULL)
    OR (subject IS NOT NULL AND ((subject-'sources') IS DISTINCT FROM (p_binding-'sources')
       OR jsonb_array_length(subject->'sources') IS DISTINCT FROM 1 OR subject#>'{sources,0,reference}' IS DISTINCT FROM p_meta->'ai_mod03_subject')) THEN
    RAISE EXCEPTION 'Invalid conversation source binding' USING ERRCODE='42501';
  END IF;
  context_kind := CASE sess.context_entity_type WHEN 'organization' THEN 'company' WHEN 'document' THEN 'dms_document'
    WHEN 'work_site' THEN 'site' ELSE sess.context_entity_type END;
  IF (context_kind IS NULL) <> (sess.context_entity_id IS NULL)
     OR (context_kind IS NOT NULL AND NOT EXISTS (SELECT FROM jsonb_array_elements(p_binding->'sources') s
       WHERE s->'reference'=jsonb_build_object('entityType',context_kind,'entityId',sess.context_entity_id))) THEN
    RAISE EXCEPTION 'Session context changed' USING ERRCODE='42501';
  END IF;
  IF jsonb_typeof(p_generation->'sources') IS DISTINCT FROM 'array'
      OR jsonb_typeof(p_generation->'queries') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Generation evidence unavailable' USING ERRCODE='42501'; END IF;
  SELECT coalesce(jsonb_agg(DISTINCT s),'[]'::jsonb) INTO sources FROM jsonb_array_elements(
    (p_binding->'sources') || coalesce(subject->'sources','[]'::jsonb) || (p_generation->'sources')) s;
  IF NOT erp_private.assistant_publication_sources_current(sources) THEN RAISE EXCEPTION 'Answer source unavailable' USING ERRCODE='42501'; END IF;
  PERFORM erp_private.lock_assistant_publication_sources(sources);
  digest := encode(sha256(convert_to(jsonb_build_array(p_binding,p_generation,p_prompt,p_answer,p_output,p_meta)::text,'UTF8')),'hex');
  IF adm.state='complete' THEN
    IF adm.published_digest IS DISTINCT FROM digest OR adm.published_message IS NULL
       OR NOT erp_private.assistant_publication_sources_current(sources) OR NOT erp_private.assistant_publication_queries_current(p_generation->'queries') THEN RAISE EXCEPTION 'Original publication unavailable' USING ERRCODE='42501'; END IF;
    answer_id := adm.published_message;
  ELSE
    IF sess.message_count>=50 THEN RAISE EXCEPTION 'Session full' USING ERRCODE='55000'; END IF;
    -- Source RLS, exact version, feature and authority share the INSERT's
    -- statement snapshot, including any relationship edit after lock acquisition.
    WITH inserted AS (
      INSERT INTO public.erp_ai_assistant_messages(session_id,role,message_text,output_type,safe_metadata_json)
      SELECT p_session, v.actor_role, v.body, v.output_kind, v.metadata
      FROM (VALUES ('user',p_prompt,'text',jsonb_build_object('ai_mod01_binding',p_meta->'ai_mod01_binding')),
                   ('assistant',p_answer,p_output,p_meta)) AS v(actor_role,body,output_kind,metadata)
      WHERE erp_private.assistant_publication_sources_current(sources)
        AND erp_private.assistant_publication_queries_current(p_generation->'queries')
        AND erp_private.ai_mod05_authority()=adm.publication_authority
        AND EXISTS (SELECT FROM public.erp_ai_feature_flags WHERE feature_code='ERP_AI_ASSISTANT' AND is_enabled)
      RETURNING id,role
    ) SELECT id INTO answer_id FROM inserted WHERE role='assistant';
    IF answer_id IS NULL THEN RAISE EXCEPTION 'Publication authority changed' USING ERRCODE='42501'; END IF;
    UPDATE public.erp_ai_assistant_sessions SET message_count=message_count+2 WHERE id=p_session;
    UPDATE erp_private.ai_mod05_turn_admissions SET state='complete',completed_at=clock_timestamp(),
      published_digest=digest,published_message=answer_id WHERE id=adm.id AND state='started';
    IF NOT FOUND THEN RAISE EXCEPTION 'Turn completion unavailable' USING ERRCODE='42501'; END IF;
  END IF;
  PERFORM set_config('request.jwt.claims',original_claims,true);
  RETURN answer_id;
END $$;
GRANT CREATE ON SCHEMA erp_private TO erp_assistant_publisher;
ALTER FUNCTION erp_private.publish_assistant_turn(bigint,uuid,bigint,uuid,text,jsonb,jsonb,text,text,text,jsonb) OWNER TO erp_assistant_publisher;
REVOKE CREATE ON SCHEMA erp_private FROM erp_assistant_publisher;
REVOKE ALL ON FUNCTION erp_private.publish_assistant_turn(bigint,uuid,bigint,uuid,text,jsonb,jsonb,text,text,text,jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION erp_private.publish_assistant_turn(bigint,uuid,bigint,uuid,text,jsonb,jsonb,text,text,text,jsonb) TO service_role;

CREATE FUNCTION public.erp_publish_assistant_turn(p_actor bigint, p_auth_user uuid, p_session bigint,
  p_request uuid, p_hash text, p_binding jsonb, p_generation jsonb, p_prompt text, p_answer text, p_output text, p_meta jsonb)
RETURNS bigint LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT erp_private.publish_assistant_turn(p_actor,p_auth_user,p_session,p_request,p_hash,p_binding,p_generation,p_prompt,p_answer,p_output,p_meta);
$$;
REVOKE ALL ON FUNCTION public.erp_publish_assistant_turn(bigint,uuid,bigint,uuid,text,jsonb,jsonb,text,text,text,jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.erp_publish_assistant_turn(bigint,uuid,bigint,uuid,text,jsonb,jsonb,text,text,text,jsonb) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
