BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';

CREATE FUNCTION erp_private.mobile_dms_hash(p_value jsonb) RETURNS text
LANGUAGE sql IMMUTABLE STRICT SET search_path='' AS $$
 SELECT encode(sha256(convert_to(p_value::text,'UTF8')),'hex');
$$;
CREATE FUNCTION erp_private.mobile_dms_keys(p_data jsonb,required text[],optional text[] DEFAULT '{}') RETURNS void
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
BEGIN
 IF jsonb_typeof(p_data) IS DISTINCT FROM 'object' OR NOT p_data ?& required OR p_data-(required||optional) <> '{}'::jsonb THEN
  RAISE EXCEPTION 'Invalid operation fields' USING ERRCODE='22023'; END IF;
END $$;
CREATE FUNCTION erp_private.mobile_dms_actor() RETURNS bigint
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE actor bigint:=public.current_user_profile_id();
BEGIN
 IF actor IS NULL OR NOT coalesce(public.f03_current_session_valid(),false) OR NOT erp_private.business_principal_is_active() THEN
  RAISE EXCEPTION 'Current session required' USING ERRCODE='42501'; END IF;
 RETURN actor;
END $$;
CREATE FUNCTION erp_private.mobile_dms_can(doc bigint,cap text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT cap=ANY(ARRAY['dms.documents.view','dms.documents.preview','dms.documents.download','dms.documents.edit','dms.documents.manage_tags','dms.documents.share_external','dms.documents.review_ai','dms.renewals.manage','dms.admin'])
 AND public.f03_current_session_valid() AND public.f03_has_document_permission(doc,cap)
 AND erp_private.hr_document_evidence_allowed(doc) AND erp_private.recruitment_document_evidence_allowed(doc)
 AND NOT EXISTS(SELECT 1 FROM public.dms_document_links l WHERE l.document_id=doc AND l.deleted_at IS NULL AND l.entity_type='employee' AND NOT public.current_user_can_view_employee(l.entity_id))
 AND NOT EXISTS(SELECT 1 FROM public.employee_medical_records m WHERE m.dms_document_id=doc AND m.deleted_at IS NULL AND NOT public.current_user_can_view_employee_medical(m.employee_id));
$$;

-- Calculate the complete binding and its authority at one statement snapshot.
CREATE FUNCTION erp_private.mobile_dms_read_source(p_data jsonb,p_caps text[]) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE doc public.dms_documents; ver public.dms_document_versions; f public.dms_document_files;
 selected bigint:=(p_data->>'fileId')::bigint; version bigint:=(p_data->>'versionId')::bigint;
 revision text; fingerprint text; files jsonb; cap text;
BEGIN
 PERFORM erp_private.mobile_dms_actor();
 PERFORM erp_private.mobile_dms_keys(p_data,ARRAY['documentId'],ARRAY['versionId','fileId','historical','sourceHash']);
 IF jsonb_typeof(p_data->'documentId')<>'number' OR coalesce(array_length(p_caps,1),0) NOT BETWEEN 1 AND 8 THEN RAISE EXCEPTION 'Invalid source' USING ERRCODE='22023'; END IF;
 SELECT * INTO doc FROM public.dms_documents WHERE id=(p_data->>'documentId')::bigint AND deleted_at IS NULL;
 IF doc.id IS NULL OR NOT erp_private.mobile_dms_can(doc.id,'dms.documents.view') THEN RAISE EXCEPTION 'Unavailable document' USING ERRCODE='PT404'; END IF;
 FOREACH cap IN ARRAY p_caps LOOP
  IF NOT coalesce(erp_private.mobile_dms_can(doc.id,cap),false) THEN RAISE EXCEPTION 'Source permission required' USING ERRCODE='42501'; END IF;
 END LOOP;
 SELECT * INTO ver FROM public.dms_document_versions WHERE id=coalesce(version,doc.current_version_id) AND document_id=doc.id AND unlinked_at IS NULL;
 IF ver.id IS NULL OR (NOT coalesce((p_data->>'historical')::boolean,false) AND (ver.id IS DISTINCT FROM doc.current_version_id OR NOT ver.is_current)) THEN RAISE EXCEPTION 'Source changed' USING ERRCODE='PT409'; END IF;
 IF selected IS NOT NULL THEN
  SELECT * INTO f FROM public.dms_document_files WHERE id=selected AND document_id=doc.id AND version_id=ver.id AND deleted_at IS NULL AND file_role IN ('original','attachment');
  IF f.id IS NULL THEN RAISE EXCEPTION 'File changed' USING ERRCODE='PT409'; END IF;
 END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_array(x.id,x.version_id,x.file_name,x.mime_type,x.file_size_bytes,x.sha256_hash,x.file_role,x.storage_bucket,x.storage_path) ORDER BY x.id),'[]') INTO files
 FROM public.dms_document_files x WHERE x.document_id=doc.id AND x.version_id=ver.id AND x.deleted_at IS NULL AND x.file_role IN ('original','attachment') AND (selected IS NULL OR x.id=selected);
 revision:=erp_private.mobile_dms_hash(jsonb_build_array(doc.id,doc.document_no,doc.title,doc.document_type_id,doc.issue_date,doc.expiry_date,doc.description,doc.owning_company_id,doc.owning_branch_id,doc.confidentiality_level,doc.status,doc.review_status,doc.approval_status,doc.current_version_id,doc.is_archived,doc.superseded_by_document_id,ver.id,ver.version_number,ver.version_label,ver.is_current));
 fingerprint:=erp_private.mobile_dms_hash(jsonb_build_array('mobile-dms/source/1',revision,selected,files));
 IF p_data ? 'sourceHash' AND fingerprint IS DISTINCT FROM p_data->>'sourceHash' THEN RAISE EXCEPTION 'Source changed' USING ERRCODE='PT409'; END IF;
 RETURN jsonb_build_object('documentId',doc.id,'documentVersionId',ver.id,'documentRevision',revision,'fileId',selected,'fileSha256',f.sha256_hash,'sourceHash',fingerprint);
END $$;
REVOKE ALL ON FUNCTION erp_private.mobile_dms_read_source(jsonb,text[]) FROM PUBLIC,anon,authenticated,service_role;
-- Re-enter the stable projection through a fresh statement after a mutation lock wait.
CREATE FUNCTION erp_private.mobile_dms_source(p_data jsonb,p_caps text[]) RETURNS jsonb LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path='' AS $$SELECT erp_private.mobile_dms_read_source(p_data,p_caps)$$;
CREATE FUNCTION public.mobile_dms_source(p_data jsonb,p_caps text[]) RETURNS jsonb LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path='' AS $$ SELECT erp_private.mobile_dms_source(p_data,p_caps) $$;
CREATE FUNCTION erp_private.mobile_dms_lock(doc bigint) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM erp_private.mobile_dms_actor();
 IF NOT erp_private.mobile_dms_can(doc,'dms.documents.view') THEN RAISE EXCEPTION 'Document unavailable' USING ERRCODE='PT404'; END IF;
 PERFORM 1 FROM public.dms_documents WHERE id=doc FOR UPDATE;
 PERFORM 1 FROM public.dms_document_versions WHERE document_id=doc AND unlinked_at IS NULL ORDER BY id FOR SHARE;
 PERFORM 1 FROM public.dms_document_files WHERE document_id=doc AND deleted_at IS NULL ORDER BY id FOR SHARE;
END $$;
CREATE TABLE erp_private.mobile_dms_receipts(
 actor bigint NOT NULL REFERENCES public.user_profiles(id),operation uuid NOT NULL,command text NOT NULL,payload_hash text NOT NULL CHECK(payload_hash~'^[a-f0-9]{64}$'),
 result jsonb,state text NOT NULL DEFAULT 'admitted' CHECK(state IN ('admitted','settled','uncertain')),created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(actor,operation));
ALTER TABLE erp_private.mobile_dms_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON erp_private.mobile_dms_receipts FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION erp_private.mobile_dms_reserve(command_name text,payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE who bigint:=erp_private.mobile_dms_actor(); op uuid:=(payload->>'operationId')::uuid; h text:=erp_private.mobile_dms_hash(payload); rec erp_private.mobile_dms_receipts;
BEGIN
 IF op IS NULL THEN RAISE EXCEPTION 'Operation required' USING ERRCODE='22023'; END IF;
 INSERT INTO erp_private.mobile_dms_receipts(actor,operation,command,payload_hash) VALUES(who,op,command_name,h) ON CONFLICT DO NOTHING;
 IF FOUND THEN RETURN NULL; END IF;
 SELECT * INTO STRICT rec FROM erp_private.mobile_dms_receipts WHERE actor=who AND operation=op FOR UPDATE;
 IF rec.command<>command_name OR rec.payload_hash<>h THEN RAISE EXCEPTION 'Operation conflict' USING ERRCODE='PT409'; END IF;
 IF rec.state<>'settled' THEN RAISE EXCEPTION 'Operation requires reconciliation' USING ERRCODE='55000'; END IF;
 RETURN rec.result||jsonb_build_object('replayed',true);
END $$;
CREATE FUNCTION erp_private.mobile_dms_settle(op uuid,receipt jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 UPDATE erp_private.mobile_dms_receipts SET result=receipt,state='settled' WHERE actor=erp_private.mobile_dms_actor() AND operation=op AND state='admitted';
 IF NOT FOUND THEN RAISE EXCEPTION 'Operation conflict' USING ERRCODE='PT409'; END IF;
 RETURN receipt;
END $$;
CREATE FUNCTION erp_private.mobile_dms_audit(doc bigint,entity text,target bigint,verb text,event_name text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE who bigint:=erp_private.mobile_dms_actor(); company bigint; branch bigint;
BEGIN
 IF doc IS NOT NULL THEN
  SELECT owning_company_id,owning_branch_id INTO company,branch FROM public.dms_documents WHERE id=doc;
  INSERT INTO public.dms_document_events(document_id,event_type,description,performed_by) VALUES(doc,event_name,replace(event_name,'_',' '),who);
 END IF;
 INSERT INTO public.audit_logs(actor_user_profile_id,owner_company_id,branch_id,module_code,entity_name,entity_id,entity_reference,action)
 VALUES(who,company,branch,'DMS',entity,target,target::text,verb);
END $$;
ALTER TABLE public.dms_document_comments ADD COLUMN workspace_revision bigint NOT NULL DEFAULT 1 CHECK(workspace_revision>0);
CREATE FUNCTION erp_private.mobile_dms_increment_revision() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN NEW.workspace_revision:=OLD.workspace_revision+1; RETURN NEW; END $$;
CREATE TRIGGER mobile_dms_comment_revision BEFORE UPDATE ON public.dms_document_comments FOR EACH ROW EXECUTE FUNCTION erp_private.mobile_dms_increment_revision();
CREATE FUNCTION erp_private.mobile_dms_comment(p_action text,p_data jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE who bigint:=erp_private.mobile_dms_actor(); doc bigint:=(p_data->>'documentId')::bigint; op uuid:=(p_data->>'operationId')::uuid;
 target bigint:=(p_data->>'commentId')::bigint; revision text:=p_data->>'commentRevision'; msg text:=btrim(p_data->>'text'); r jsonb; out_id bigint; out_rev bigint;
BEGIN
 IF p_action NOT IN ('add','edit','delete') OR p_action IS NULL THEN RAISE EXCEPTION 'Invalid action' USING ERRCODE='22023'; END IF;
 PERFORM erp_private.mobile_dms_keys(p_data,ARRAY['documentId','operationId','sourceHash']||CASE WHEN p_action<>'add' THEN ARRAY['commentId','commentRevision'] ELSE '{}'::text[] END||CASE WHEN p_action<>'delete' THEN ARRAY['text'] ELSE '{}'::text[] END);
 IF (p_action<>'delete' AND (msg IS NULL OR length(msg) NOT BETWEEN 1 AND 2000)) OR (p_action<>'add' AND (target IS NULL OR revision IS NULL OR revision!~'^[1-9][0-9]{0,18}$')) THEN RAISE EXCEPTION 'Invalid comment' USING ERRCODE='22023'; END IF;
 PERFORM erp_private.mobile_dms_lock(doc);
 IF p_action<>'add' THEN PERFORM 1 FROM public.dms_document_comments WHERE id=target AND document_id=doc AND created_by=who FOR UPDATE; END IF;
 PERFORM erp_private.mobile_dms_source(jsonb_build_object('documentId',doc,'sourceHash',p_data->>'sourceHash'),ARRAY['dms.documents.view']);
 r:=erp_private.mobile_dms_reserve('comment/'||p_action,p_data); IF r IS NOT NULL THEN RETURN r; END IF;
 IF p_action='add' THEN
  INSERT INTO public.dms_document_comments(document_id,comment_text,created_by,updated_by) VALUES(doc,msg,who,who) RETURNING id,workspace_revision INTO out_id,out_rev;
 ELSE
  UPDATE public.dms_document_comments SET comment_text=CASE WHEN p_action='edit' THEN msg ELSE comment_text END,deleted_at=CASE WHEN p_action='delete' THEN clock_timestamp() ELSE NULL END,updated_by=who,updated_at=clock_timestamp()
  WHERE id=target AND document_id=doc AND created_by=who AND workspace_revision=revision::bigint AND deleted_at IS NULL RETURNING id,workspace_revision INTO out_id,out_rev;
  IF NOT FOUND THEN RAISE EXCEPTION 'Comment changed' USING ERRCODE='PT409'; END IF;
 END IF;
 PERFORM erp_private.mobile_dms_audit(doc,'dms_document_comments',out_id,CASE p_action WHEN 'add' THEN 'create' WHEN 'edit' THEN 'update' ELSE 'delete' END,CASE p_action WHEN 'add' THEN 'comment_added' WHEN 'edit' THEN 'comment_updated' ELSE 'comment_deleted' END);
 RETURN erp_private.mobile_dms_settle(op,jsonb_build_object('documentId',doc,'commentId',out_id,'operationId',op,'revision',out_rev::text,'replayed',false));
END $$;
CREATE FUNCTION public.mobile_dms_comment(p_action text,p_data jsonb) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT erp_private.mobile_dms_comment(p_action,p_data) $$;

CREATE FUNCTION erp_private.mobile_dms_notification_current(item jsonb) RETURNS boolean LANGUAGE plpgsql STABLE SET search_path='' AS $$
BEGIN
 PERFORM erp_private.mobile_dms_keys(item,ARRAY['documentId','versionId','sourceHash']);
 PERFORM erp_private.mobile_dms_read_source(item,ARRAY['dms.documents.view']);
 RETURN true;
EXCEPTION WHEN SQLSTATE '42501' OR SQLSTATE 'PT404' OR SQLSTATE 'PT409' THEN RETURN false;
END $$;
REVOKE ALL ON FUNCTION erp_private.mobile_dms_notification_current(jsonb) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION erp_private.mobile_dms_document(p_action text,p_data jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE who bigint:=erp_private.mobile_dms_actor(); doc bigint:=(p_data->>'documentId')::bigint; pg int:=(p_data->>'page')::int; op uuid:=(p_data->>'operationId')::uuid;
 src jsonb; r jsonb; vals jsonb; defs jsonb; rules jsonb; d public.dms_documents; editable boolean; n bigint; added int; removed int; a bigint[]; b bigint[]; q tsquery;
BEGIN
 IF p_action='search_parent' THEN PERFORM erp_private.mobile_dms_keys(p_data,ARRAY['parent']); PERFORM erp_private.mobile_dms_parent(p_data->'parent');RETURN 'true'::jsonb;END IF;
 IF p_action='search_origins' THEN
  PERFORM erp_private.mobile_dms_keys(p_data,ARRAY['ids','textQuery','structured']);
  IF jsonb_typeof(p_data->'ids') IS DISTINCT FROM 'array' OR jsonb_array_length(p_data->'ids')>100 OR jsonb_typeof(p_data->'structured') IS DISTINCT FROM 'boolean' OR length(p_data->>'textQuery')>8000 THEN RAISE EXCEPTION 'Invalid search page' USING ERRCODE='22023'; END IF;
  SELECT array_agg(value::bigint) INTO a FROM jsonb_array_elements_text(p_data->'ids');
  IF coalesce(cardinality(a),0)=0 THEN RETURN '[]'; END IF;
  q:=to_tsquery('simple',nullif(p_data->>'textQuery',''));
  -- The canonical search projection removes protected summary text and rebuilds the index for metadata-only viewers.
  WITH hits AS (
   SELECT hit.id,to_tsvector('simple',concat_ws(' ',hit.document_no,hit.title,hit.description,hit.legacy_document_code)) @@ q AS metadata,
     to_tsvector('simple',coalesce(hit.ai_summary,'')) @@ q AS content
   FROM erp_private.read_documents_matching(a,NULL,NULL,NULL,NULL,q) hit WHERE erp_private.mobile_dms_can(hit.id,'dms.documents.view')
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',h.id,'matchSource',CASE WHEN q IS NULL THEN 'metadata'
    WHEN h.content AND (h.metadata OR (p_data->>'structured')::boolean) THEN 'both'
    WHEN h.content THEN 'content' WHEN h.metadata THEN 'metadata' ELSE 'both' END) ORDER BY array_position(a,h.id)),'[]') INTO r FROM hits h;
  RETURN r;
 ELSIF p_action='notification_targets' THEN
  PERFORM erp_private.mobile_dms_keys(p_data,ARRAY['sources']);
  IF jsonb_typeof(p_data->'sources') IS DISTINCT FROM 'array' OR jsonb_array_length(p_data->'sources')>25 THEN RAISE EXCEPTION 'Invalid notification page' USING ERRCODE='22023'; END IF;
  -- All retained bindings use the same final statement snapshot.
  SELECT coalesce(jsonb_agg(erp_private.mobile_dms_notification_current(item) ORDER BY ord),'[]') INTO r FROM jsonb_array_elements(p_data->'sources') WITH ORDINALITY e(item,ord);
  RETURN r;
 END IF;
 IF p_action IN ('metadata_save','tags_change') THEN PERFORM erp_private.mobile_dms_lock(doc); END IF;
 src:=erp_private.mobile_dms_source(jsonb_strip_nulls(jsonb_build_object('documentId',doc,'sourceHash',p_data->>'sourceHash')),ARRAY['dms.documents.view']);
 IF p_action='comments' THEN
  PERFORM erp_private.mobile_dms_keys(p_data,ARRAY['documentId','page']);
  IF pg IS NULL OR pg NOT BETWEEN 1 AND 100000 THEN RAISE EXCEPTION 'Invalid page' USING ERRCODE='22023'; END IF;
  WITH arr AS MATERIALIZED(SELECT c.id,c.comment_text,c.created_at,c.updated_at,c.workspace_revision,c.created_by FROM public.dms_document_comments c WHERE c.document_id=doc AND c.deleted_at IS NULL),
  selected AS(SELECT * FROM arr ORDER BY created_at,id LIMIT 20 OFFSET (pg-1)*20)
  SELECT jsonb_build_object('totalCount',(SELECT count(*) FROM arr),'rows',coalesce(jsonb_agg(jsonb_build_object('id',c.id,'text',c.comment_text,'authorLabel',p.display_name,'createdAt',c.created_at,'updatedAt',c.updated_at,'revision',c.workspace_revision::text,'canEdit',coalesce(c.created_by=who,false),'canDelete',coalesce(c.created_by=who,false)) ORDER BY c.created_at,c.id),'[]')) INTO r FROM selected c LEFT JOIN public.user_profiles p ON p.id=c.created_by;
  RETURN r;
 ELSIF p_action='metadata' THEN
  PERFORM erp_private.mobile_dms_keys(p_data,ARRAY['documentId']); SELECT * INTO STRICT d FROM public.dms_documents WHERE id=doc;
  editable:=(erp_private.mobile_dms_can(doc,'dms.documents.edit') OR erp_private.mobile_dms_can(doc,'dms.admin')) AND NOT d.is_archived AND d.status NOT IN ('archived','superseded','deleted') AND d.approval_status IS DISTINCT FROM 'pending_approval';
  r:=public.f07_metadata_operation('snapshot',p_data); rules:=public.ai_mod04_review_rules(d.document_type_id);
  SELECT jsonb_agg(jsonb_build_object('id',f.id,'code',f.field_code,'label',f.field_label_en,'type',f.field_type,'isRequired',f.is_required OR coalesce(rules->'requiredFields' ? f.field_code,false),'isEditable',editable AND coalesce((rules->>'ready')::boolean,false),'options',f.options_json,'value',coalesce(v.value_json,to_jsonb(v.value_boolean),to_jsonb(v.value_date),to_jsonb(v.value_datetime),to_jsonb(v.value_number),to_jsonb(v.value_text))) ORDER BY f.sort_order,f.id)
  INTO defs FROM (SELECT * FROM public.dms_metadata_definitions c WHERE c.document_type_id=d.document_type_id AND c.is_active AND c.deleted_at IS NULL AND (c.show_in_detail IS DISTINCT FROM false OR c.is_required OR rules->'requiredFields' ? c.field_code) ORDER BY c.sort_order,c.id LIMIT 251) f
  LEFT JOIN public.dms_document_metadata_values v ON v.definition_id=f.id AND v.document_id=doc AND v.deleted_at IS NULL;
  IF jsonb_array_length(defs)>250 THEN RAISE EXCEPTION 'Too many definitions' USING ERRCODE='54000'; END IF;
  RETURN jsonb_build_object('source',src,'documentTypeId',d.document_type_id,'snapshot',r->'snapshot','sourceSnapshot',r->'sourceSnapshot','fields',coalesce(defs,'[]'));
 ELSIF p_action='metadata_save' THEN
  PERFORM erp_private.mobile_dms_keys(p_data,ARRAY['documentId','sourceHash','operationId','snapshot','values']);
  IF NOT (erp_private.mobile_dms_can(doc,'dms.documents.edit') OR erp_private.mobile_dms_can(doc,'dms.admin')) THEN RAISE EXCEPTION 'Edit required' USING ERRCODE='42501'; END IF;
  r:=erp_private.mobile_dms_reserve('metadata/save',p_data); IF r IS NOT NULL THEN RETURN r; END IF;
  SELECT * INTO STRICT d FROM public.dms_documents WHERE id=doc;
  rules:=public.ai_mod04_review_rules(d.document_type_id);
  IF rules->>'ready' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Processing rules changed' USING ERRCODE='PT409'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_data->'values') x WHERE NOT EXISTS(SELECT 1 FROM public.dms_metadata_definitions f WHERE f.id=(x->>'definition_id')::bigint AND f.document_type_id=d.document_type_id AND f.deleted_at IS NULL AND f.is_active AND (f.show_in_detail IS DISTINCT FROM false OR f.is_required OR rules->'requiredFields' ? f.field_code))) THEN RAISE EXCEPTION 'Field unavailable for this document' USING ERRCODE='22023'; END IF;
  r:=public.f07_metadata_operation('save',(p_data-ARRAY['sourceHash','operationId'])||jsonb_build_object('requestId',op));
  IF EXISTS(SELECT 1 FROM public.dms_metadata_definitions f WHERE f.document_type_id=d.document_type_id AND f.is_active AND f.deleted_at IS NULL AND rules->'requiredFields' ? f.field_code AND NOT EXISTS(SELECT 1 FROM public.dms_document_metadata_values v WHERE v.document_id=doc AND v.definition_id=f.id AND v.deleted_at IS NULL AND coalesce(nullif(btrim(v.value_text),''),v.value_date::text,v.value_number::text,v.value_boolean::text,v.value_datetime::text,nullif(v.value_json,'null')::text) IS NOT NULL)) THEN RAISE EXCEPTION 'Required registered field missing' USING ERRCODE='22023'; END IF;
  RETURN erp_private.mobile_dms_settle(op,jsonb_build_object('documentId',doc,'operationId',op,'snapshot',r->'snapshot','replayed',false));
 ELSIF p_action='tags_change' THEN
  PERFORM erp_private.mobile_dms_keys(p_data,ARRAY['documentId','sourceHash','operationId','add','remove']);
  IF NOT(erp_private.mobile_dms_can(doc,'dms.documents.edit') OR erp_private.mobile_dms_can(doc,'dms.documents.manage_tags')) THEN RAISE EXCEPTION 'Tag permission required' USING ERRCODE='42501'; END IF;
  SELECT array(SELECT value::bigint FROM jsonb_array_elements_text(p_data->'add')),array(SELECT value::bigint FROM jsonb_array_elements_text(p_data->'remove')) INTO a,b;
  IF cardinality(a)>100 OR cardinality(b)>100 OR a&&b OR (SELECT count(DISTINCT x) FROM unnest(a||b)x WHERE x>0)<>cardinality(a||b) THEN RAISE EXCEPTION 'Invalid tag changes' USING ERRCODE='22023'; END IF;
  r:=erp_private.mobile_dms_reserve('tags/change',p_data); IF r IS NOT NULL THEN RETURN r-'replayed'; END IF;
  PERFORM 1 FROM public.dms_tags WHERE id=ANY(a) AND is_active AND deleted_at IS NULL ORDER BY id FOR SHARE; GET DIAGNOSTICS n=ROW_COUNT;
  IF n<>cardinality(a) THEN RAISE EXCEPTION 'Tag unavailable' USING ERRCODE='PT409'; END IF;
  INSERT INTO public.dms_document_tags(document_id,tag_id,created_by) SELECT doc,x,who FROM unnest(a)x ON CONFLICT(document_id,tag_id) DO NOTHING; GET DIAGNOSTICS added=ROW_COUNT;
  DELETE FROM public.dms_document_tags WHERE document_id=doc AND tag_id=ANY(b); GET DIAGNOSTICS removed=ROW_COUNT;
  IF added+removed>0 THEN PERFORM erp_private.mobile_dms_audit(doc,'dms_document_tags',doc,'update','tags_updated'); END IF;
  RETURN erp_private.mobile_dms_settle(op,jsonb_build_object('documentId',doc,'operationId',op,'changed',added+removed>0));
 END IF;
 RAISE EXCEPTION 'Invalid document action' USING ERRCODE='22023';
END $$;
CREATE FUNCTION public.mobile_dms_document(p_action text,p_data jsonb) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT erp_private.mobile_dms_document(p_action,p_data) $$;

CREATE FUNCTION erp_private.mobile_dms_parent(p jsonb) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE who bigint:=erp_private.mobile_dms_actor(); typ text:=p->>'entityType'; target bigint:=(p->>'entityId')::bigint; company bigint; branch bigint; department bigint; revision bigint; subtype text; officer boolean; own boolean:=false;
BEGIN
 PERFORM erp_private.mobile_dms_keys(p,ARRAY['entityId','entityType']);
 IF typ='employee' THEN
  SELECT owner_company_id,branch_id,department_id,workspace_revision INTO company,branch,department,revision FROM public.employees WHERE id=target AND deleted_at IS NULL AND public.current_user_can_view_employee(id);
  IF revision IS NOT NULL THEN own:=erp_private.mobile_hr_self(target);officer:=erp_private.employee_permission(target,'hr.compliance.manage'); END IF;
 ELSIF typ='site' THEN
  SELECT owner_company_id,branch_id,workspace_revision,site_type INTO company,branch,revision,subtype FROM public.work_sites s WHERE id=target AND deleted_at IS NULL AND erp_private.administrator_work_site_permission('view',s.owner_company_id,s.branch_id);
  officer:=erp_private.administrator_work_site_permission('manage',company,branch);
 ELSE RAISE EXCEPTION 'Invalid parent' USING ERRCODE='22023'; END IF;
 IF company IS NULL OR revision IS NULL OR NOT (erp_private.permission_in_scope('dms.documents.view',company,branch) OR erp_private.permission_in_scope('dms.admin',company,branch)) THEN RAISE EXCEPTION 'Parent unavailable' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('company',company,'branch',branch,'department',department,'subtype',subtype,'revision',revision,'canManage',officer,'canSubmit',officer OR (own AND (erp_private.permission_in_scope('dms.documents.upload',company,branch) OR erp_private.employee_permission(target,'hr.requests.submit'))));
END $$;
CREATE FUNCTION erp_private.mobile_dms_parent_key(typ text,eid bigint) RETURNS bigint LANGUAGE sql IMMUTABLE SET search_path='' AS $$ SELECT hashtextextended('mobile-dms-parent/'||typ||'/'||eid::text,0) $$;
CREATE FUNCTION erp_private.mobile_dms_link_fence() RETURNS trigger LANGUAGE plpgsql SET search_path='' SECURITY DEFINER AS $$
DECLARE a bigint;b bigint;
BEGIN
 IF TG_OP<>'INSERT' AND OLD.entity_type IN ('employee','site') THEN a:=erp_private.mobile_dms_parent_key(OLD.entity_type,OLD.entity_id); END IF;
 IF TG_OP<>'DELETE' AND NEW.entity_type IN ('employee','site') THEN b:=erp_private.mobile_dms_parent_key(NEW.entity_type,NEW.entity_id); END IF;
 IF coalesce(a,b) IS NOT NULL THEN PERFORM pg_advisory_xact_lock(least(a,b)); IF a IS DISTINCT FROM b AND a IS NOT NULL AND b IS NOT NULL THEN PERFORM pg_advisory_xact_lock(greatest(a,b)); END IF; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
CREATE TRIGGER mobile_dms_link_parent BEFORE INSERT OR UPDATE OR DELETE ON public.dms_document_links FOR EACH ROW EXECUTE FUNCTION erp_private.mobile_dms_link_fence();
CREATE FUNCTION erp_private.mobile_dms_lock_parent(p jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE eid bigint:=(p->>'entityId')::bigint; typ text:=p->>'entityType';
BEGIN
 PERFORM erp_private.mobile_dms_parent(p);
 PERFORM pg_advisory_xact_lock(erp_private.mobile_dms_parent_key(typ,eid));
 IF typ='employee' THEN PERFORM 1 FROM public.employees WHERE id=eid FOR SHARE; ELSE PERFORM 1 FROM public.work_sites WHERE id=eid FOR SHARE; END IF;
 PERFORM 1 FROM public.dms_documents d WHERE EXISTS(SELECT 1 FROM public.dms_document_links l WHERE l.document_id=d.id AND l.entity_type=typ AND l.entity_id=eid AND l.deleted_at IS NULL) ORDER BY d.id FOR SHARE;
 PERFORM 1 FROM public.dms_document_files f JOIN public.dms_documents d ON d.id=f.document_id AND d.current_version_id=f.version_id WHERE f.deleted_at IS NULL AND EXISTS(SELECT 1 FROM public.dms_document_links l WHERE l.document_id=d.id AND l.entity_type=typ AND l.entity_id=eid AND l.deleted_at IS NULL) ORDER BY f.id FOR SHARE OF f;
END $$;
CREATE TABLE erp_private.mobile_dms_missing_requests(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,parent_type text NOT NULL CHECK(parent_type IN ('employee','site')),parent_id bigint NOT NULL,rule_id bigint NOT NULL REFERENCES public.dms_required_document_rules,document_type_id bigint NOT NULL REFERENCES public.dms_document_types,requester bigint NOT NULL REFERENCES public.user_profiles,assignee bigint REFERENCES public.user_profiles,due_date date,notes text NOT NULL CHECK(length(notes)<=2000),
 status text NOT NULL DEFAULT 'requested' CHECK(status IN('requested','in_progress','submitted','fulfilled','rejected','cancelled')),revision bigint NOT NULL DEFAULT 1,submitted_doc bigint REFERENCES public.dms_documents,submitted_version bigint REFERENCES public.dms_document_versions,evidence_submitter bigint REFERENCES public.user_profiles,submitted_hash text,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());
CREATE UNIQUE INDEX mobile_dms_missing_open ON erp_private.mobile_dms_missing_requests(parent_type,parent_id,rule_id) WHERE status IN('requested','in_progress','submitted');
ALTER TABLE erp_private.mobile_dms_missing_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON erp_private.mobile_dms_missing_requests FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION erp_private.mobile_dms_accepted(d public.dms_documents) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT d.deleted_at IS NULL AND NOT d.is_archived AND d.superseded_by_document_id IS NULL AND d.current_version_id IS NOT NULL AND d.status IN ('active','approved','expired') AND d.review_status IN ('not_required','approved','reviewed','verified','completed') AND (d.approval_status IS NULL OR d.approval_status='approved');
$$;
REVOKE ALL ON FUNCTION erp_private.mobile_dms_accepted(public.dms_documents) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION erp_private.mobile_dms_rule_rows(p jsonb, selected bigint DEFAULT NULL) RETURNS TABLE(rule_id bigint,row_data jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 WITH parent AS MATERIALIZED(SELECT erp_private.mobile_dms_parent(p) v), coverage AS MATERIALIZED(
 SELECT d.id,d.document_type_id,d.status,d.review_status,d.approval_status,erp_private.mobile_dms_accepted(d) accepted,d.current_version_id,d.is_archived,d.superseded_by_document_id,l.id link,erp_private.mobile_dms_can(d.id,'dms.documents.view') visible,
 (SELECT coalesce(jsonb_agg(jsonb_build_array(f.id,f.sha256_hash,f.file_size_bytes,f.file_name,f.mime_type,f.storage_path) ORDER BY f.id),'[]') FROM public.dms_document_files f WHERE f.document_id=d.id AND f.version_id=d.current_version_id AND f.deleted_at IS NULL) files
 FROM public.dms_document_links l JOIN public.dms_documents d ON d.id=l.document_id AND d.deleted_at IS NULL WHERE l.entity_type=p->>'entityType' AND l.entity_id=(p->>'entityId')::bigint AND l.deleted_at IS NULL),
 applicable AS(SELECT r.*,parent.v authority FROM parent CROSS JOIN public.dms_required_document_rules r WHERE (selected IS NULL OR r.id=selected) AND r.entity_type=p->>'entityType' AND r.is_active AND r.is_required AND r.deleted_at IS NULL
 AND (r.owner_company_id IS NULL OR r.owner_company_id=(parent.v->>'company')::bigint) AND (r.branch_id IS NULL OR r.branch_id=(parent.v->>'branch')::bigint)
 AND (r.department_id IS NULL OR r.department_id=(parent.v->>'department')::bigint) AND (r.effective_from IS NULL OR r.effective_from<=(now() AT TIME ZONE 'Asia/Dubai')::date)
 AND (r.effective_to IS NULL OR r.effective_to>=(now() AT TIME ZONE 'Asia/Dubai')::date) AND (r.entity_subtype IS NULL OR parent.v->>'subtype' IS NULL OR r.entity_subtype=parent.v->>'subtype')),
 checked AS(SELECT a.*,CASE WHEN a.document_type_id IS NULL OR (a.entity_subtype IS NOT NULL AND a.authority->>'subtype' IS NULL) THEN 'unknown'
 WHEN EXISTS(SELECT 1 FROM coverage c WHERE c.visible AND c.document_type_id=a.document_type_id AND c.accepted) THEN 'present'
 WHEN EXISTS(SELECT 1 FROM coverage c WHERE NOT c.visible OR (c.document_type_id=a.document_type_id AND c.status IN ('active','approved','pending_review') AND NOT c.accepted)) THEN 'unknown' ELSE 'missing' END state FROM applicable a), offered AS(SELECT c.*,c.state='missing' AND (c.authority->>'canSubmit')::boolean AND NOT EXISTS(SELECT 1 FROM erp_private.mobile_dms_missing_requests m WHERE m.parent_type=p->>'entityType' AND m.parent_id=(p->>'entityId')::bigint AND m.rule_id=c.id AND m.status IN ('requested','in_progress','submitted')) AS requestable FROM checked c)
 SELECT a.id,jsonb_build_object('ruleId',a.id,'documentTypeId',a.document_type_id,'label',a.rule_name,'state',a.state,'canRequest',a.requestable,
 'checklistHash',CASE WHEN a.requestable THEN erp_private.mobile_dms_hash(jsonb_build_array(auth.uid(),auth.jwt()->>'session_id',p,a.authority,a.id,a.workspace_revision,a.document_type_id,a.state,
 (SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.link),'[]') FROM coverage c WHERE c.document_type_id=a.document_type_id),
 (SELECT coalesce(jsonb_agg(jsonb_build_array(ur.id,ur.role_id,ur.owner_company_id,ur.branch_id) ORDER BY ur.id),'[]') FROM public.user_roles ur WHERE ur.user_profile_id=public.current_user_profile_id() AND ur.is_active))) END)
 FROM offered a;
$$;
CREATE FUNCTION erp_private.mobile_dms_checklist(p_data jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE pg int:=(p_data->>'page')::int; r jsonb;
BEGIN
 PERFORM erp_private.mobile_dms_keys(p_data,ARRAY['parent','page']); PERFORM erp_private.mobile_dms_parent(p_data->'parent');
 IF pg IS NULL OR pg NOT BETWEEN 1 AND 100000 THEN RAISE EXCEPTION 'Invalid page' USING ERRCODE='22023'; END IF;
 WITH items AS MATERIALIZED(SELECT * FROM erp_private.mobile_dms_rule_rows(p_data->'parent')), selected AS(SELECT * FROM items ORDER BY rule_id LIMIT 25 OFFSET (pg-1)*25),
 counts AS(SELECT count(*) n,count(*) FILTER(WHERE row_data->>'state'='unknown') u,count(*) FILTER(WHERE row_data->>'state'='missing') m FROM items)
 SELECT jsonb_build_object('rows',(SELECT coalesce(jsonb_agg(row_data ORDER BY rule_id),'[]') FROM selected),'totalCount',n,'coverage',CASE WHEN u=0 THEN 'complete' WHEN u=n THEN 'unknown' ELSE 'partial' END,'missingCount',CASE WHEN u=0 THEN m END) INTO r FROM counts;
 RETURN r;
END $$;
CREATE FUNCTION public.mobile_dms_checklist(p_data jsonb) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT erp_private.mobile_dms_checklist(p_data)$$;
ALTER TABLE public.dms_renewal_requests ADD COLUMN workspace_revision bigint NOT NULL DEFAULT 1 CHECK(workspace_revision>0);
CREATE TRIGGER mobile_dms_renewal_revision BEFORE UPDATE ON public.dms_renewal_requests FOR EACH ROW EXECUTE FUNCTION erp_private.mobile_dms_increment_revision();
CREATE TABLE erp_private.mobile_dms_renewal_context(request_id bigint PRIMARY KEY REFERENCES public.dms_renewal_requests,parent_type text NOT NULL CHECK(parent_type IN('employee','site')),parent_id bigint NOT NULL,source_version bigint NOT NULL REFERENCES public.dms_document_versions,source_hash text NOT NULL,submitted_doc bigint REFERENCES public.dms_documents,submitted_version bigint REFERENCES public.dms_document_versions,evidence_submitter bigint REFERENCES public.user_profiles,submitted_hash text);
ALTER TABLE erp_private.mobile_dms_renewal_context ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON erp_private.mobile_dms_renewal_context FROM PUBLIC,anon,authenticated,service_role;

-- Match employee_permission for the nominee without switching the caller's identity.
CREATE FUNCTION erp_private.mobile_dms_nominee_employee(p_profile bigint,p_employee bigint,caps text[]) RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
 WITH subject AS (
  SELECT e.id,e.owner_company_id company,e.branch_id branch,
   CASE WHEN link.employee_id=e.id THEN '.self' WHEN link.employee_id=e.reporting_manager_id AND link.employee_id<>e.id THEN '.team' END suffix
  FROM public.employees e LEFT JOIN (
   SELECT l.employee_id FROM public.erp_user_employee_links l JOIN public.user_profiles up ON up.id=l.user_profile_id
   JOIN public.employees linked ON linked.id=l.employee_id AND linked.deleted_at IS NULL
    AND up.owner_company_id=linked.owner_company_id AND up.branch_id IS NOT DISTINCT FROM linked.branch_id
   WHERE l.user_profile_id=p_profile
  ) link ON true WHERE e.id=p_employee AND e.deleted_at IS NULL
 ), permissions AS (
  SELECT code,erp_private.ai_mod04_profile_grant(p_profile,code,company,branch)
    OR (suffix IS NOT NULL AND erp_private.ai_mod04_profile_grant(p_profile,code||suffix,company,branch)) allowed
  FROM subject CROSS JOIN unnest(ARRAY['hr.employees.view','hr.employee_profile.view']||caps) codes(code)
 )
 SELECT EXISTS(SELECT 1 FROM permissions WHERE code IN ('hr.employees.view','hr.employee_profile.view') AND allowed)
   AND NOT EXISTS(SELECT 1 FROM permissions WHERE code=ANY(caps) AND NOT allowed);
$$;
REVOKE ALL ON FUNCTION erp_private.mobile_dms_nominee_employee(bigint,bigint,text[]) FROM PUBLIC,anon,authenticated,service_role;
-- Match the registered HR evidence categories in hr_document_evidence_allowed for the nominee.
CREATE FUNCTION erp_private.mobile_dms_nominee_hr_evidence(p_profile bigint,p_document bigint) RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
 WITH linked AS MATERIALIZED (SELECT DISTINCT employee_id,caps FROM (
   SELECT employee_id,ARRAY['hr.compliance.view'] caps FROM public.employee_access_cards WHERE dms_document_id=p_document AND deleted_at IS NULL
   UNION ALL SELECT employee_id,ARRAY['hr.assignments.view'] FROM public.employee_assets WHERE dms_document_id=p_document AND deleted_at IS NULL
   UNION ALL SELECT employee_id,ARRAY['hr.actions.view','hr.confidential.view'] FROM public.employee_disciplinary_records WHERE dms_document_id=p_document AND deleted_at IS NULL
   UNION ALL SELECT employee_id,ARRAY['hr.eos.view'] FROM public.employee_eos_cases WHERE dms_document_id=p_document AND deleted_at IS NULL
   UNION ALL SELECT employee_id,ARRAY['hr.actions.view'] FROM public.employee_hr_actions WHERE dms_document_id=p_document AND deleted_at IS NULL
   UNION ALL SELECT employee_id,ARRAY['hr.compliance.view'] FROM public.employee_identity_documents WHERE dms_document_id=p_document AND deleted_at IS NULL
   UNION ALL SELECT employee_id,ARRAY['hr.medical.view'] FROM public.employee_medical_insurances WHERE dms_document_id=p_document AND deleted_at IS NULL
   UNION ALL SELECT employee_id,ARRAY['hr.medical.view'] FROM public.employee_medical_records WHERE dms_document_id=p_document AND deleted_at IS NULL
   UNION ALL SELECT employee_id,ARRAY['hr.actions.view','hr.confidential.view'] FROM public.employee_performance_records WHERE dms_document_id=p_document AND deleted_at IS NULL
   UNION ALL SELECT employee_id,ARRAY['hr.assignments.view'] FROM public.employee_ppe_issues WHERE dms_document_id=p_document AND deleted_at IS NULL
   UNION ALL SELECT employee_id,ARRAY['hr.actions.view'] FROM public.employee_pro_processes WHERE related_document_id=p_document AND deleted_at IS NULL
   UNION ALL SELECT employee_id,ARRAY['hr.compliance.view'] FROM public.employee_training_certificates WHERE dms_document_id=p_document AND deleted_at IS NULL
   UNION ALL SELECT employee_id,ARRAY['hr.compliance.view'] FROM public.employee_dependents WHERE dms_document_id=p_document AND deleted_at IS NULL
   UNION ALL SELECT employee_id,ARRAY['hr.medical.view'] FROM public.employee_leave_requests WHERE sick_cert_dms_id=p_document AND deleted_at IS NULL
   UNION ALL SELECT id,ARRAY[]::text[] FROM public.employees WHERE photo_dms_document_id=p_document AND deleted_at IS NULL
   UNION ALL SELECT employee_id,CASE WHEN related_record_type IN ('medical_record','medical_insurance') THEN ARRAY['hr.medical.view'] ELSE ARRAY[]::text[] END
    FROM public.employee_document_links WHERE dms_document_id=p_document AND deleted_at IS NULL
  ) raw_links)
 SELECT NOT EXISTS(SELECT 1 FROM linked WHERE NOT erp_private.mobile_dms_nominee_employee(p_profile,linked.employee_id,linked.caps));
$$;
REVOKE ALL ON FUNCTION erp_private.mobile_dms_nominee_hr_evidence(bigint,bigint) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION erp_private.mobile_dms_officers(p jsonb,kind text,doc_id bigint) RETURNS TABLE(id bigint,label text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 WITH pscope AS MATERIALIZED(SELECT erp_private.mobile_dms_parent(p) AS s), grants AS(
 SELECT up.id,coalesce(nullif(up.display_name,''),up.full_name) label,
 bool_or(perm.permission_code IN ('dms.documents.view','dms.admin')) doc, bool_or(perm.permission_code='dms.renewals.manage') renewal,
 bool_or(CASE WHEN p->>'entityType'='employee' THEN perm.permission_code IN ('hr.compliance.manage','hr.compliance.manage.self','hr.compliance.manage.team') ELSE perm.permission_code IN ('common_md.work_sites.manage','common_md.manage') END) officer
 FROM pscope JOIN public.user_roles ur ON ur.owner_company_id=(s->>'company')::bigint AND (ur.branch_id IS NULL OR ur.branch_id=(s->>'branch')::bigint)
 JOIN public.user_profiles up ON up.id=ur.user_profile_id JOIN public.roles r ON r.id=ur.role_id JOIN public.role_permissions rp ON rp.role_id=r.id JOIN public.permissions perm ON perm.id=rp.permission_id
 WHERE up.status='active' AND NOT up.must_change_password AND ur.is_active AND r.is_active AND perm.is_active GROUP BY up.id)
 SELECT g.id,g.label FROM grants g CROSS JOIN pscope ps WHERE g.doc AND g.officer
 AND CASE WHEN p->>'entityType'='employee' THEN erp_private.mobile_dms_nominee_employee(g.id,(p->>'entityId')::bigint,ARRAY['hr.compliance.manage'])
   ELSE erp_private.ai_mod04_profile_grant(g.id,'common_md.work_sites.view',(ps.s->>'company')::bigint,(ps.s->>'branch')::bigint) OR erp_private.ai_mod04_profile_grant(g.id,'common_md.view',(ps.s->>'company')::bigint,(ps.s->>'branch')::bigint) END
 AND (kind='missing' OR (g.renewal AND EXISTS(SELECT 1 FROM public.dms_documents d WHERE d.id=doc_id AND d.deleted_at IS NULL AND d.confidentiality_level IN ('internal','company','hr','finance','legal','executive')
 AND erp_private.ai_mod04_profile_grant(g.id,'dms.renewals.manage',d.owning_company_id,d.owning_branch_id)
 AND erp_private.ai_mod04_profile_grant(g.id,'dms.documents.view',d.owning_company_id,d.owning_branch_id)
 AND (d.confidentiality_level IN ('internal','company') OR erp_private.ai_mod04_profile_grant(g.id,'dms.documents.view.'||d.confidentiality_level,d.owning_company_id,d.owning_branch_id))
 AND erp_private.mobile_dms_nominee_hr_evidence(g.id,d.id) AND erp_private.ai_mod04_profile_recruitment_allowed(g.id,d.id)
 AND NOT EXISTS(SELECT 1 FROM public.dms_document_links l WHERE l.document_id=d.id AND l.deleted_at IS NULL AND l.entity_type='employee' AND NOT erp_private.mobile_dms_nominee_employee(g.id,l.entity_id,'{}'))
 AND NOT EXISTS(SELECT 1 FROM public.employee_medical_records m WHERE m.dms_document_id=d.id AND m.deleted_at IS NULL AND NOT erp_private.mobile_dms_nominee_employee(g.id,m.employee_id,ARRAY['hr.medical.view']))
 AND NOT EXISTS(SELECT 1 FROM public.dms_document_links l LEFT JOIN public.employee_dependents child ON child.id=l.entity_id AND child.deleted_at IS NULL WHERE l.document_id=d.id AND l.deleted_at IS NULL AND l.entity_type='employee_dependent' AND (child.id IS NULL OR NOT erp_private.mobile_dms_nominee_employee(g.id,child.employee_id,ARRAY['hr.compliance.view']))))));
$$;
CREATE FUNCTION erp_private.mobile_dms_evidence(p jsonb,dt bigint,doc bigint,ver bigint) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE src jsonb;
BEGIN
 PERFORM erp_private.mobile_dms_lock(doc);
 src:=erp_private.mobile_dms_source(jsonb_build_object('documentId',doc,'versionId',ver),ARRAY['dms.documents.preview']);
 IF NOT EXISTS(SELECT 1 FROM public.dms_documents d JOIN public.dms_document_links l ON l.document_id=d.id WHERE d.id=doc AND d.document_type_id=dt AND erp_private.mobile_dms_accepted(d) AND d.status IN ('active','approved') AND d.current_version_id=ver AND l.entity_type=p->>'entityType' AND l.entity_id=(p->>'entityId')::bigint AND l.deleted_at IS NULL) THEN RAISE EXCEPTION 'Evidence changed' USING ERRCODE='PT409'; END IF;
 RETURN src->>'sourceHash';
END $$;
CREATE FUNCTION erp_private.mobile_dms_request_row(kind text,target bigint,p_filter jsonb DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE who bigint:=erp_private.mobile_dms_actor(); p jsonb; ps jsonb; m erp_private.mobile_dms_missing_requests; r public.dms_renewal_requests; c erp_private.mobile_dms_renewal_context; d public.dms_documents;
 requester bigint; officer bigint; st text; canonical text; revision bigint; dt bigint; evidence bigint; ver bigint; due date; notes text; created timestamptz; updated timestamptz; manage boolean; actions text[]:='{}';
BEGIN
 IF kind='missing' THEN
  SELECT * INTO m FROM erp_private.mobile_dms_missing_requests WHERE id=target; IF m.id IS NULL THEN RETURN NULL; END IF;
  p:=jsonb_build_object('entityType',m.parent_type,'entityId',m.parent_id);requester:=m.requester;officer:=m.assignee;st:=m.status;revision:=m.revision;dt:=m.document_type_id;evidence:=m.submitted_doc;ver:=m.submitted_version;due:=m.due_date;notes:=m.notes;created:=m.created_at;updated:=m.updated_at;
 ELSIF kind='renewal' THEN
  SELECT * INTO r FROM public.dms_renewal_requests WHERE id=target AND deleted_at IS NULL;
  IF r.id IS NULL OR NOT erp_private.mobile_dms_can(r.document_id,'dms.documents.view') THEN RETURN NULL; END IF;
  SELECT * INTO d FROM public.dms_documents WHERE id=r.document_id;
  SELECT * INTO c FROM erp_private.mobile_dms_renewal_context WHERE request_id=r.id;
  IF c.request_id IS NOT NULL THEN p:=jsonb_build_object('entityType',c.parent_type,'entityId',c.parent_id);
  ELSE SELECT (array_agg(q.parent))[1] INTO p FROM (SELECT DISTINCT jsonb_build_object('entityType',entity_type,'entityId',entity_id) parent FROM public.dms_document_links WHERE document_id=d.id AND entity_type IN ('employee','site') AND deleted_at IS NULL)q HAVING count(*)=1; END IF;
  IF p IS NULL OR NOT EXISTS(SELECT 1 FROM public.dms_document_links l WHERE l.document_id=d.id AND l.entity_type=p->>'entityType' AND l.entity_id=(p->>'entityId')::bigint AND l.deleted_at IS NULL) THEN RETURN NULL; END IF;
  requester:=r.requested_by;officer:=r.assigned_to;canonical:=r.status;
  st:=CASE r.status WHEN 'draft' THEN 'requested' WHEN 'requested' THEN 'requested' WHEN 'waiting_for_document' THEN CASE WHEN c.submitted_doc IS NULL THEN 'in_progress' ELSE 'submitted' END WHEN 'renewed' THEN 'fulfilled' ELSE r.status END;
  revision:=r.workspace_revision;dt:=d.document_type_id;evidence:=coalesce(c.submitted_doc,r.replacement_document_id);ver:=coalesce(c.submitted_version,r.replacement_version_id);due:=r.target_renewal_date;notes:=r.notes;created:=r.created_at;updated:=r.updated_at;
 ELSE RETURN NULL; END IF;
 IF p_filter IS NOT NULL AND p_filter<>p THEN RETURN NULL; END IF;
 ps:=erp_private.mobile_dms_parent(p);
 manage:=(ps->>'canManage')::boolean AND (kind='missing' OR erp_private.mobile_dms_can(r.document_id,'dms.renewals.manage'));
 IF NOT manage AND who IS DISTINCT FROM requester AND who IS DISTINCT FROM officer THEN RETURN NULL; END IF;
 IF evidence IS NOT NULL AND NOT erp_private.mobile_dms_can(evidence,'dms.documents.preview') THEN evidence:=NULL;ver:=NULL; END IF;
 IF st IN ('requested','in_progress','submitted') THEN
  IF manage AND (officer IS NULL OR officer=who) AND requester IS DISTINCT FROM who THEN
   IF st='requested' THEN actions:=array_append(actions,'start'); END IF;
   IF st='submitted' AND evidence IS NOT NULL AND coalesce(m.evidence_submitter,c.evidence_submitter) IS NOT NULL AND who<>coalesce(m.evidence_submitter,c.evidence_submitter) THEN actions:=array_append(actions,'fulfil'); END IF;
   actions:=array_append(actions,'reject');
  END IF;
  IF st IN('requested','in_progress') AND (who=requester OR (manage AND (officer IS NULL OR officer=who))) THEN actions:=array_append(actions,'submit_document'); END IF;
  IF who=requester OR (manage AND (officer IS NULL OR officer=who)) THEN actions:=array_append(actions,'cancel'); END IF;
 END IF;
 RETURN jsonb_build_object('id',target,'kind',kind,'parent',p,'ruleId',m.rule_id,'documentTypeId',dt,'sourceDocumentId',r.document_id,'sourceVersionId',c.source_version,'status',st,'canonicalStatus',canonical,'revision',revision,
 'requesterLabel',coalesce((SELECT coalesce(nullif(display_name,''),full_name) FROM public.user_profiles WHERE id=requester),'Unavailable'),'assigneeId',officer,'assigneeLabel',(SELECT coalesce(nullif(display_name,''),full_name) FROM public.user_profiles WHERE id=officer),'dueDate',due,'notes',left(coalesce(notes,''),2000),'submittedDocumentId',evidence,'submittedVersionId',ver,'createdAt',created,'updatedAt',updated,'actions',actions);
EXCEPTION WHEN insufficient_privilege THEN RETURN NULL;
END $$;
CREATE FUNCTION erp_private.mobile_dms_requests(p_action text,p_data jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE who bigint:=erp_private.mobile_dms_actor(); kind text:=p_data->>'kind'; p jsonb:=p_data->'parent'; pg int:=(p_data->>'page')::int; ps jsonb; src jsonb; r jsonb; row_data jsonb; n bigint; rows jsonb;
 doc bigint:=(p_data->>'documentId')::bigint; ver bigint:=(p_data->>'versionId')::bigint; rid bigint:=(p_data->>'ruleId')::bigint; target bigint:=(p_data->>'requestId')::bigint;
 assignee bigint:=(p_data->>'assigneeId')::bigint; op uuid:=(p_data->>'operationId')::uuid; act text:=p_data->>'action'; msg text:=p_data->>'notes'; due date:=(p_data->>'dueDate')::date; officer boolean; allow_submit boolean; proof text; m erp_private.mobile_dms_missing_requests; c erp_private.mobile_dms_renewal_context; renewal public.dms_renewal_requests;
BEGIN
 IF p_action IN ('options','create') THEN
  IF kind IS NULL OR kind NOT IN('missing','renewal') THEN RAISE EXCEPTION 'Invalid kind' USING ERRCODE='22023'; END IF;
  IF p_action='create' THEN PERFORM erp_private.mobile_dms_lock_parent(p); END IF;
  ps:=erp_private.mobile_dms_parent(p);officer:=(ps->>'canManage')::boolean;allow_submit:=(ps->>'canSubmit')::boolean;
  IF kind='renewal' THEN
   IF p_action='create' THEN PERFORM erp_private.mobile_dms_lock(doc); END IF;
   src:=erp_private.mobile_dms_source(jsonb_strip_nulls(jsonb_build_object('documentId',doc,'sourceHash',p_data->>'sourceHash')),ARRAY['dms.documents.view']);
   IF NOT EXISTS(SELECT 1 FROM public.dms_document_links l JOIN public.dms_documents d ON d.id=l.document_id JOIN public.dms_document_types t ON t.id=d.document_type_id WHERE d.id=doc AND NOT d.is_archived AND d.superseded_by_document_id IS NULL AND t.is_renewable AND l.entity_type=p->>'entityType' AND l.entity_id=(p->>'entityId')::bigint AND l.deleted_at IS NULL) THEN RAISE EXCEPTION 'Unavailable renewal source' USING ERRCODE='PT409'; END IF;
   officer:=officer AND erp_private.mobile_dms_can(doc,'dms.renewals.manage');allow_submit:=officer OR (p->>'entityType'='employee' AND erp_private.mobile_hr_self((p->>'entityId')::bigint) AND allow_submit);
  END IF;
  IF NOT allow_submit THEN RAISE EXCEPTION 'Submission unavailable' USING ERRCODE='42501'; END IF;
 END IF;
 IF p_action='options' THEN
  PERFORM erp_private.mobile_dms_keys(p_data,ARRAY['kind','parent','page','search']||CASE WHEN kind='renewal' THEN ARRAY['documentId'] ELSE '{}'::text[] END);
  IF pg IS NULL OR pg NOT BETWEEN 1 AND 100000 OR length(p_data->>'search')>100 THEN RAISE EXCEPTION 'Invalid options' USING ERRCODE='22023'; END IF;
  WITH choices AS MATERIALIZED(SELECT * FROM erp_private.mobile_dms_officers(p,kind,doc) x WHERE x.id<>who AND strpos(lower(x.label),lower(p_data->>'search'))>0), selected AS(SELECT * FROM choices ORDER BY label,id LIMIT 25 OFFSET (pg-1)*25)
  SELECT (SELECT count(*) FROM choices),coalesce(jsonb_agg(to_jsonb(s) ORDER BY label,id),'[]') INTO n,rows FROM selected s;
  RETURN jsonb_build_object('totalCount',n,'rows',rows,'canSubmit',allow_submit,'canManage',officer);
 ELSIF p_action='list' THEN
  PERFORM erp_private.mobile_dms_keys(p_data,ARRAY['audience','page'],ARRAY['status','parent']);
  IF pg IS NULL OR pg NOT BETWEEN 1 AND 100000 OR coalesce(p_data->>'audience','') NOT IN('mine','assigned','parent') OR (p_data->>'audience'='parent')<>(p IS NOT NULL) THEN RAISE EXCEPTION 'Invalid requests' USING ERRCODE='22023'; END IF;
  IF p IS NOT NULL THEN PERFORM erp_private.mobile_dms_parent(p); END IF;
  WITH candidates AS(SELECT 'missing' k,mr.id FROM erp_private.mobile_dms_missing_requests mr WHERE CASE p_data->>'audience' WHEN 'mine' THEN mr.requester=who WHEN 'assigned' THEN mr.assignee=who ELSE mr.parent_type=p->>'entityType' AND mr.parent_id=(p->>'entityId')::bigint END
   UNION ALL SELECT 'renewal',rr.id FROM public.dms_renewal_requests rr WHERE rr.deleted_at IS NULL AND CASE p_data->>'audience' WHEN 'mine' THEN rr.requested_by=who WHEN 'assigned' THEN rr.assigned_to=who ELSE EXISTS(SELECT 1 FROM public.dms_document_links l WHERE l.document_id=rr.document_id AND l.entity_type=p->>'entityType' AND l.entity_id=(p->>'entityId')::bigint AND l.deleted_at IS NULL) END),
  projected AS MATERIALIZED(SELECT erp_private.mobile_dms_request_row(k,id,p) v FROM candidates),filtered AS MATERIALIZED(SELECT v FROM projected WHERE v IS NOT NULL AND (NOT p_data?'status' OR v->>'status'=p_data->>'status')),selected AS(SELECT v FROM filtered ORDER BY v->>'createdAt' DESC,v->>'kind',(v->>'id')::bigint DESC LIMIT 25 OFFSET (pg-1)*25)
  SELECT (SELECT count(*) FROM filtered),coalesce(jsonb_agg(v ORDER BY v->>'createdAt' DESC,v->>'kind',(v->>'id')::bigint DESC),'[]') INTO n,rows FROM selected;
  RETURN jsonb_build_object('rows',rows,'totalCount',n);
 ELSIF p_action='create' THEN
  PERFORM erp_private.mobile_dms_keys(p_data,ARRAY['kind','parent','assigneeId','dueDate','notes','operationId']||CASE WHEN kind='missing' THEN ARRAY['ruleId','checklistHash'] ELSE ARRAY['documentId','priority','sourceHash'] END);
  IF msg IS NULL OR length(msg)>2000 THEN RAISE EXCEPTION 'Invalid notes' USING ERRCODE='22023'; END IF;
  r:=erp_private.mobile_dms_reserve('request/create/'||kind,p_data);
  IF r IS NOT NULL THEN row_data:=erp_private.mobile_dms_request_row(kind,(r->'request'->>'id')::bigint,p); IF row_data IS NULL THEN RAISE EXCEPTION 'Request unavailable' USING ERRCODE='42501'; END IF; RETURN jsonb_set(r,'{request}',row_data); END IF;
  IF assignee IS NOT NULL AND (assignee=who OR NOT EXISTS(SELECT 1 FROM erp_private.mobile_dms_officers(p,kind,doc) x WHERE x.id=assignee)) THEN RAISE EXCEPTION 'Officer unavailable' USING ERRCODE='42501'; END IF;
  IF kind='missing' THEN
   PERFORM 1 FROM public.dms_required_document_rules WHERE id=rid FOR SHARE;
   SELECT v.row_data INTO row_data FROM erp_private.mobile_dms_rule_rows(p,rid) v;
   IF row_data IS NULL OR NOT (row_data->>'canRequest')::boolean OR row_data->>'checklistHash' IS DISTINCT FROM p_data->>'checklistHash' THEN RAISE EXCEPTION 'Checklist changed' USING ERRCODE='PT409'; END IF;
   INSERT INTO erp_private.mobile_dms_missing_requests(parent_type,parent_id,rule_id,document_type_id,requester,assignee,due_date,notes) VALUES(p->>'entityType',(p->>'entityId')::bigint,rid,(row_data->>'documentTypeId')::bigint,who,assignee,due,msg) RETURNING id INTO target;
  ELSE
   INSERT INTO public.dms_renewal_requests(document_id,renewal_no,status,priority,requested_by,assigned_to,old_expiry_date,target_renewal_date,notes,created_by,updated_by)
   SELECT d.id,'RNW-'||replace(d.document_no,'DMSD-','')||'-'||op::text,'requested',p_data->>'priority',who,assignee,d.expiry_date,due,msg,who,who FROM public.dms_documents d WHERE d.id=doc RETURNING id INTO target;
   INSERT INTO erp_private.mobile_dms_renewal_context(request_id,parent_type,parent_id,source_version,source_hash) VALUES(target,p->>'entityType',(p->>'entityId')::bigint,(src->>'documentVersionId')::bigint,src->>'sourceHash');
  END IF;
 ELSIF p_action='act' THEN
  PERFORM erp_private.mobile_dms_keys(p_data,ARRAY['kind','requestId','operationId','expectedRevision','action','notes']||CASE WHEN act='submit_document' THEN ARRAY['documentId','versionId'] ELSE '{}'::text[] END);
  IF coalesce(kind,'') NOT IN ('missing','renewal') OR coalesce(act,'') NOT IN ('start','submit_document','fulfil','reject','cancel') OR msg IS NULL OR length(msg)>2000 THEN RAISE EXCEPTION 'Invalid action' USING ERRCODE='22023'; END IF;
  row_data:=erp_private.mobile_dms_request_row(kind,target);IF row_data IS NULL THEN RAISE EXCEPTION 'Request unavailable' USING ERRCODE='PT404'; END IF;
  p:=row_data->'parent';PERFORM erp_private.mobile_dms_lock_parent(p);
  IF kind='missing' THEN SELECT * INTO m FROM erp_private.mobile_dms_missing_requests WHERE id=target FOR UPDATE;
  ELSE SELECT * INTO renewal FROM public.dms_renewal_requests WHERE id=target FOR UPDATE;SELECT * INTO c FROM erp_private.mobile_dms_renewal_context WHERE request_id=target FOR UPDATE;END IF;
  row_data:=erp_private.mobile_dms_request_row(kind,target,p);IF row_data IS NULL THEN RAISE EXCEPTION 'Request unavailable' USING ERRCODE='PT404'; END IF;
  r:=erp_private.mobile_dms_reserve('request/act/'||kind,p_data); IF r IS NOT NULL THEN RETURN jsonb_set(r,'{request}',row_data); END IF;
  IF (row_data->>'revision')::bigint IS DISTINCT FROM (p_data->>'expectedRevision')::bigint THEN RAISE EXCEPTION 'Request changed' USING ERRCODE='PT409'; END IF;
  IF NOT(row_data->'actions' ? act) THEN RAISE EXCEPTION 'Action unavailable' USING ERRCODE='42501'; END IF;
  IF kind='renewal' THEN
   PERFORM erp_private.mobile_dms_lock(renewal.document_id);
   src:=erp_private.mobile_dms_source(jsonb_strip_nulls(jsonb_build_object('documentId',renewal.document_id,'versionId',c.source_version,'sourceHash',c.source_hash)),ARRAY['dms.documents.view']);
   IF c.request_id IS NULL THEN INSERT INTO erp_private.mobile_dms_renewal_context(request_id,parent_type,parent_id,source_version,source_hash) VALUES(target,p->>'entityType',(p->>'entityId')::bigint,(src->>'documentVersionId')::bigint,src->>'sourceHash') RETURNING * INTO c; END IF;
  END IF;
  IF act IN ('fulfil','submit_document') THEN
   IF act='fulfil' AND (coalesce(m.evidence_submitter,c.evidence_submitter) IS NULL OR who=coalesce(m.evidence_submitter,c.evidence_submitter)) THEN RAISE EXCEPTION 'Independent evidence reviewer required' USING ERRCODE='42501';END IF;
   IF act='fulfil' THEN doc:=coalesce(m.submitted_doc,c.submitted_doc);ver:=coalesce(m.submitted_version,c.submitted_version); END IF;
   IF doc IS NULL OR ver IS NULL THEN RAISE EXCEPTION 'Current evidence required' USING ERRCODE='PT409'; END IF;
   proof:=erp_private.mobile_dms_evidence(p,(row_data->>'documentTypeId')::bigint,doc,ver);
   IF act='fulfil' AND proof IS DISTINCT FROM coalesce(m.submitted_hash,c.submitted_hash) THEN RAISE EXCEPTION 'Evidence changed' USING ERRCODE='PT409'; END IF;
  END IF;
  IF kind='missing' THEN
   UPDATE erp_private.mobile_dms_missing_requests AS dest SET status=CASE act WHEN 'start' THEN 'in_progress' WHEN 'submit_document' THEN 'submitted' WHEN 'fulfil' THEN 'fulfilled' WHEN 'cancel' THEN 'cancelled' ELSE 'rejected' END,revision=revision+1,updated_at=clock_timestamp(),notes=CASE WHEN msg<>'' THEN msg ELSE notes END,
    assignee=CASE WHEN act='submit_document' AND dest.assignee=who THEN NULL WHEN act='fulfil' AND dest.assignee IS NULL THEN who ELSE dest.assignee END,evidence_submitter=CASE WHEN act='submit_document' THEN who ELSE evidence_submitter END,
    submitted_doc=CASE WHEN act='submit_document' THEN doc ELSE submitted_doc END,submitted_version=CASE WHEN act='submit_document' THEN ver ELSE submitted_version END,submitted_hash=CASE WHEN act='submit_document' THEN proof ELSE submitted_hash END WHERE id=target;
  ELSIF act='fulfil' THEN IF renewal.assigned_to IS NULL THEN UPDATE public.dms_renewal_requests SET assigned_to=who WHERE id=target; END IF; PERFORM public.f07_complete_document_renewal(target,doc,ver,(SELECT expiry_date FROM public.dms_documents WHERE id=doc),msg);
  ELSE
   IF act='submit_document' THEN
    IF doc=renewal.document_id THEN RAISE EXCEPTION 'Replacement required' USING ERRCODE='PT409'; END IF;
    UPDATE erp_private.mobile_dms_renewal_context SET submitted_doc=doc,submitted_version=ver,submitted_hash=proof,evidence_submitter=who WHERE request_id=target;
   END IF;
   UPDATE public.dms_renewal_requests SET status=CASE act WHEN 'start' THEN 'in_progress' WHEN 'submit_document' THEN 'waiting_for_document' WHEN 'cancel' THEN 'cancelled' ELSE 'rejected' END,
   assigned_to=CASE WHEN act='submit_document' AND assigned_to=who THEN NULL ELSE assigned_to END,notes=CASE WHEN msg<>'' THEN msg ELSE notes END,cancelled_at=CASE WHEN act='cancel' THEN clock_timestamp() ELSE cancelled_at END,updated_by=who,updated_at=clock_timestamp() WHERE id=target;
  END IF;
 ELSE RAISE EXCEPTION 'Invalid request action' USING ERRCODE='22023'; END IF;
 PERFORM erp_private.mobile_dms_audit(CASE WHEN kind='renewal' THEN coalesce(renewal.document_id,doc) ELSE NULL END,CASE WHEN kind='missing' THEN 'mobile_dms_missing_requests' ELSE 'dms_renewal_requests' END,target,CASE WHEN p_action='create' THEN 'create' ELSE 'update' END,CASE WHEN p_action='create' THEN 'renewal_request_created' ELSE 'document_request_'||act END);
 row_data:=erp_private.mobile_dms_request_row(kind,target,p);IF row_data IS NULL THEN RAISE EXCEPTION 'Request unavailable' USING ERRCODE='42501';END IF;
 RETURN erp_private.mobile_dms_settle(op,jsonb_build_object('request',row_data,'operationId',op,'replayed',false));
END $$;
CREATE FUNCTION public.mobile_dms_requests(p_action text,p_data jsonb) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT erp_private.mobile_dms_requests(p_action,p_data)$$;
CREATE FUNCTION public.mobile_dms_renewal_request(p_data jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$BEGIN IF p_data->>'kind' IS DISTINCT FROM 'renewal' THEN RAISE EXCEPTION 'Renewal required' USING ERRCODE='22023'; END IF; RETURN erp_private.mobile_dms_requests('create',p_data);END$$;

-- ECMAScript trim whitespace used by the canonical AI source readers.
CREATE FUNCTION erp_private.mobile_dms_has_text(v text) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path='' AS $$SELECT coalesce(btrim(v,E' \t\n\r\f' || chr(11) || U&'\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')<>'',false)$$;
REVOKE ALL ON FUNCTION erp_private.mobile_dms_has_text(text) FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE erp_private.mobile_dms_retries(actor bigint NOT NULL,operation uuid NOT NULL,job_id bigint NOT NULL REFERENCES public.dms_ai_job_queue,session_id bigint NOT NULL REFERENCES public.dms_upload_sessions,document_id bigint NOT NULL REFERENCES public.dms_documents,source_hash text NOT NULL,step text NOT NULL,prior_steps jsonb NOT NULL,claims jsonb NOT NULL,settled boolean NOT NULL DEFAULT false,PRIMARY KEY(actor,operation),FOREIGN KEY(actor,operation) REFERENCES erp_private.mobile_dms_receipts);
CREATE UNIQUE INDEX mobile_dms_one_pending_step ON erp_private.mobile_dms_retries(session_id,step) WHERE NOT settled;
ALTER TABLE erp_private.mobile_dms_retries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON erp_private.mobile_dms_retries FROM PUBLIC,anon,authenticated,service_role;
-- A canonical web retry and a mobile retry may refer to the same paid step.
CREATE TABLE erp_private.mobile_dms_web_retries(session_id bigint NOT NULL REFERENCES public.dms_upload_sessions,step text NOT NULL,lease uuid NOT NULL,prior_step jsonb,PRIMARY KEY(session_id,step));
ALTER TABLE erp_private.mobile_dms_web_retries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON erp_private.mobile_dms_web_retries FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION erp_private.mobile_dms_merge_step(p_session bigint,p_step text,prior jsonb,result jsonb) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE rows jsonb; current_step jsonb; matched int; safe jsonb; overall text;
BEGIN
 SELECT coalesce(orchestration_steps_json,'[]') INTO STRICT rows FROM public.dms_upload_sessions WHERE id=p_session AND deleted_at IS NULL FOR UPDATE;
 SELECT count(*),jsonb_agg(x)->0 INTO matched,current_step FROM jsonb_array_elements(rows)x WHERE x->>'step'=p_step;
 IF matched<>1 OR prior IS NULL OR current_step IS DISTINCT FROM prior OR result->>'step' IS DISTINCT FROM p_step OR coalesce(result->>'status','') NOT IN('completed','failed','skipped') THEN RAISE EXCEPTION 'Retry step changed' USING ERRCODE='PT409'; END IF;
 safe:=jsonb_strip_nulls(jsonb_build_object('safeErrorMessage',result->'safeErrorMessage','step',p_step,'status',result->'status','startedAt',result->'startedAt','completedAt',result->'completedAt','durationMs',result->'durationMs','errorCode',CASE WHEN (result->>'errorCode')~'^[a-z0-9_]{1,80}$' THEN result->>'errorCode' END));
 SELECT jsonb_agg(CASE WHEN x->>'step'=p_step THEN safe ELSE x END ORDER BY ord) INTO rows FROM jsonb_array_elements(rows) WITH ORDINALITY e(x,ord);
 SELECT CASE WHEN bool_and(x->>'status' IN ('completed','skipped')) THEN 'complete' WHEN bool_or(x->>'status'='failed') AND NOT bool_or(x->>'status'='completed') THEN 'failed' ELSE 'complete_with_warnings' END INTO overall FROM jsonb_array_elements(rows)x;
 UPDATE public.dms_upload_sessions SET orchestration_steps_json=rows,orchestration_status=overall,updated_at=clock_timestamp() WHERE id=p_session;
END $$;
REVOKE ALL ON FUNCTION erp_private.mobile_dms_merge_step(bigint,text,jsonb,jsonb) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION erp_private.mobile_dms_web_retry(p_session bigint,p_step text,p_lease uuid,p_result jsonb) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE doc bigint; code text; saved_steps jsonb; prior jsonb;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' OR p_step NOT IN ('content_sync','ai_summary','intelligence','embedding','tag_suggestions','link_suggestions') OR p_lease IS NULL THEN RAISE EXCEPTION 'Trusted retry required' USING ERRCODE='42501'; END IF;
 SELECT document_id,session_code,orchestration_steps_json INTO STRICT doc,code,saved_steps FROM public.dms_upload_sessions WHERE id=p_session AND deleted_at IS NULL FOR UPDATE;
 IF p_result IS NULL THEN
  SELECT CASE WHEN count(*)=1 THEN jsonb_agg(x)->0 END INTO prior FROM jsonb_array_elements(saved_steps)x WHERE x->>'step'=p_step;
  IF coalesce(prior->>'status','') NOT IN ('failed','skipped') THEN RAISE EXCEPTION 'Retry step unavailable' USING ERRCODE='PT409'; END IF;
  IF EXISTS(SELECT 1 FROM erp_private.mobile_dms_retries t WHERE t.session_id=p_session AND t.step=p_step AND NOT t.settled) THEN RAISE EXCEPTION 'Original retry awaits confirmation' USING ERRCODE='55000'; END IF;
  INSERT INTO erp_private.mobile_dms_web_retries(session_id,step,lease,prior_step) VALUES(p_session,p_step,p_lease,prior);
  RETURN true;
 END IF;
 SELECT w.prior_step INTO prior FROM erp_private.mobile_dms_web_retries w WHERE w.session_id=p_session AND w.step=p_step AND w.lease=p_lease FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown retry' USING ERRCODE='PT409'; END IF;
 IF p_result->>'step' IS DISTINCT FROM p_step OR (p_step IN ('ai_summary','embedding','tag_suggestions','link_suggestions') AND p_result->>'status' IS DISTINCT FROM 'completed' AND p_result->>'providerEffect' IS DISTINCT FROM 'never_started') THEN RAISE EXCEPTION 'Original retry awaits confirmation' USING ERRCODE='55000'; END IF;
 -- Store only a fixed diagnostic derived from canonical status/code.
 IF p_result->>'status'='failed' THEN
  p_result:=p_result||jsonb_build_object('safeErrorMessage',CASE p_result->>'errorCode'
   WHEN 'permission_denied' THEN 'Permission denied for this step.' WHEN 'flag_disabled' THEN 'This step is currently disabled.'
   WHEN 'not_found' THEN 'Required data not found.' WHEN 'provider_not_configured' THEN 'AI provider is not configured.'
   WHEN 'timeout' THEN 'Step timed out. You can retry it manually.' WHEN 'confidential_restricted' THEN 'Access to this document is restricted.'
   ELSE 'Step failed. You can retry it manually.' END);
 ELSE p_result:=p_result-'safeErrorMessage'; END IF;
 PERFORM erp_private.mobile_dms_merge_step(p_session,p_step,prior,p_result);
 DELETE FROM erp_private.mobile_dms_web_retries WHERE session_id=p_session AND step=p_step AND lease=p_lease;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown retry' USING ERRCODE='PT409'; END IF;
 RETURN true;
END $$;
CREATE FUNCTION public.mobile_dms_web_retry(p_session bigint,p_step text,p_lease uuid,p_result jsonb) RETURNS boolean LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT erp_private.mobile_dms_web_retry(p_session,p_step,p_lease,p_result)$$;
REVOKE ALL ON FUNCTION public.mobile_dms_web_retry(bigint,text,uuid,jsonb),erp_private.mobile_dms_web_retry(bigint,text,uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.mobile_dms_web_retry(bigint,text,uuid,jsonb),erp_private.mobile_dms_web_retry(bigint,text,uuid,jsonb) TO service_role;
CREATE FUNCTION erp_private.mobile_dms_progress(p_data jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE who bigint:=erp_private.mobile_dms_actor();doc bigint:=(p_data->>'documentId')::bigint;job bigint:=(p_data->>'jobId')::bigint;src jsonb; j public.dms_ai_job_queue;u public.dms_upload_sessions;c erp_private.f07_job_claims;
 prep jsonb; choices jsonb; snap jsonb; result jsonb; progress jsonb; steps jsonb:='[]';actions jsonb:='[]';stage text:='unavailable';hold text; queue text;req uuid;healthy boolean;created timestamptz;started timestamptz;updated timestamptz:=now();err text;item jsonb; flag text;allowed boolean;
BEGIN
 PERFORM erp_private.mobile_dms_keys(p_data,ARRAY['documentId'],ARRAY['jobId']);
 src:=erp_private.mobile_dms_source(jsonb_build_object('documentId',doc),ARRAY['dms.documents.view','dms.documents.preview']);
 IF erp_private.dms_file_pipeline_manager(doc) AND (public.f03_has_document_permission(doc,'dms.documents.ai.run') OR erp_private.mobile_dms_can(doc,'dms.documents.review_ai') OR erp_private.mobile_dms_can(doc,'dms.admin')) THEN
  BEGIN
   snap:=public.ai_mod04_preparation('snapshot',jsonb_build_object('documentId',doc));
   SELECT coalesce(jsonb_agg(jsonb_build_object('id',f->'id','versionId',f->'versionId','name',f->'name','size',f->'size','mime',lower(btrim(split_part(f->>'mime',';',1))),'sha256',f->'sha256') ORDER BY (f->>'id')::bigint),'[]') INTO choices FROM jsonb_array_elements(snap->'files') f WHERE (f->>'versionId')::bigint=(src->>'documentVersionId')::bigint AND f->>'sha256'~'^[a-f0-9]{64}$' AND coalesce((f->>'size')::bigint,0) BETWEEN 1 AND 52428800 AND length(f->>'name') BETWEEN 1 AND 1000 AND lower(btrim(split_part(f->>'mime',';',1))) IN ('application/pdf','image/jpeg','image/jpg','image/png','image/webp','image/gif','image/tiff','image/tif','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/msword','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.ms-excel');
   IF jsonb_array_length(choices) BETWEEN 1 AND 100 AND coalesce(snap->>'typeCode','') NOT IN ('EMPLOYEE_PHOTO','DEPENDENT_PHOTO') AND snap->>'profileState' IN ('active','not_configured') AND erp_private.dms_file_pipeline_manager(doc) AND coalesce(erp_private.ai_mod04_profile((snap->>'documentTypeId')::bigint,true)->>'applicability','document') NOT IN ('mixed_bundle','portrait') AND erp_private.ai_mod05_work_open((SELECT owning_company_id FROM public.dms_documents WHERE id=doc),true) AND erp_private.ai_mod05_job_allowed((SELECT owning_company_id FROM public.dms_documents WHERE id=doc)) THEN prep:=jsonb_build_object('snapshot',snap->'snapshot','files',choices); END IF;
  EXCEPTION WHEN insufficient_privilege OR SQLSTATE 'PT409' THEN prep:=NULL; END;
 END IF;
 SELECT q.* INTO j FROM public.dms_ai_job_queue q WHERE q.related_document_id=doc AND (job IS NULL OR q.id=job) AND (
  (q.job_type='ai_re_extraction' AND q.created_by=who AND EXISTS(SELECT 1 FROM erp_private.f07_job_claims fc WHERE fc.job_id=q.id AND fc.preparation_context IS NOT NULL)) OR
  (q.job_type='post_approve_orchestration' AND EXISTS(SELECT 1 FROM public.dms_upload_sessions us WHERE us.id=q.related_upload_session_id AND us.document_id=doc AND us.deleted_at IS NULL AND us.session_code=q.payload_json->>'sessionCode' AND (us.uploaded_by=who OR erp_private.mobile_dms_can(doc,'dms.admin')))))
 ORDER BY q.id DESC LIMIT 1;
 IF job IS NOT NULL AND j.id IS NULL THEN RAISE EXCEPTION 'Job unavailable' USING ERRCODE='PT404'; END IF;
 IF j.id IS NOT NULL THEN
  created:=j.created_at;started:=j.started_at;updated:=j.updated_at;queue:=j.job_status;
  IF j.last_error_code ~ '^[a-z0-9_]{1,80}$' THEN err:=j.last_error_code; END IF;
  IF j.job_type='ai_re_extraction' THEN
   SELECT * INTO STRICT c FROM erp_private.f07_job_claims WHERE job_id=j.id;
   result:=public.dms_preparation_progress(doc,j.id,false);progress:=result->'progress';stage:=progress->>'stage';hold:=progress->>'holdReason';healthy:=(progress->>'workerHealthy')::boolean;req:=(c.preparation_context->>'requestId')::uuid;
   IF result->>'sourceCurrent' IS DISTINCT FROM 'true' THEN hold:='source_changed';stage:='held'; END IF;
   IF (queue='failed' OR j.last_error_code IN ('preparation_outcome_unconfirmed','quality_evaluation_held')) AND EXISTS(SELECT 1 FROM jsonb_each(c.preparation_stages)e WHERE e.value->>'state'='started') THEN hold:='reconciliation_required';stage:='held';END IF;
   IF hold IS NULL AND c.preparation_context->>'state'='queued' AND queue IN ('queued','retry_scheduled') AND erp_private.dms_file_pipeline_manager(doc) THEN actions:=actions||jsonb_build_array(jsonb_build_object('action','resume'));END IF;
   IF (hold IS NULL OR hold='source_changed') AND c.preparation_context->>'state' NOT IN ('cancelled','applied') AND queue<>'running' AND NOT EXISTS(SELECT 1 FROM jsonb_each(c.preparation_stages)e WHERE e.value->>'state'='started') THEN actions:=actions||jsonb_build_array(jsonb_build_object('action','cancel')); END IF;
   IF c.preparation_context->>'state' NOT IN ('applied','cancelled') THEN prep:=NULL; END IF;
  ELSE
   SELECT * INTO STRICT u FROM public.dms_upload_sessions WHERE id=j.related_upload_session_id AND document_id=doc;
   IF coalesce(jsonb_typeof(u.orchestration_steps_json),'array')<>'array' OR jsonb_array_length(u.orchestration_steps_json)>12 THEN RAISE EXCEPTION 'Incomplete stages' USING ERRCODE='54000'; END IF;
   stage:=CASE queue WHEN 'running' THEN 'analysing' WHEN 'completed' THEN 'ready' WHEN 'queued' THEN 'waiting' WHEN 'retry_scheduled' THEN 'retry_wait' WHEN 'cancelled' THEN 'cancelled' ELSE 'held' END;
   IF NOT erp_private.ai_mod05_work_open((SELECT owning_company_id FROM public.dms_documents WHERE id=doc),true) THEN hold:='paused'; ELSIF NOT erp_private.ai_mod05_job_allowed((SELECT owning_company_id FROM public.dms_documents WHERE id=doc)) THEN hold:='daily_limit';END IF;

   IF hold IS NOT NULL THEN stage:='held'; END IF;
   allowed:=hold IS NULL AND queue IN ('completed','failed') AND EXISTS(SELECT 1 FROM public.erp_ai_feature_flags WHERE feature_code='DMS_AI_ORCHESTRATION' AND is_enabled)
   AND (public.f03_has_document_permission(doc,'dms.documents.ai.run') OR public.f03_has_document_permission(doc,'dms.documents.upload') OR erp_private.mobile_dms_can(doc,'dms.admin'));
   FOR item IN SELECT value FROM jsonb_array_elements(coalesce(u.orchestration_steps_json,'[]')) LOOP
    IF item->>'step' NOT IN('upload_received','ocr_and_extraction','draft_ready','content_sync','ai_summary','intelligence','embedding','tag_suggestions','link_suggestions','ready_for_review') OR item->>'status' NOT IN ('completed','pending','running','skipped','failed') THEN RAISE EXCEPTION 'Unavailable stage' USING ERRCODE='22023'; END IF;
    steps:=steps||jsonb_build_array(jsonb_build_object('code',item->'step','label',replace(item->>'step','_',' '),'state',CASE WHEN item->>'status'='completed' THEN 'complete' ELSE item->>'status' END,'message',NULL));
    flag:=CASE item->>'step' WHEN 'content_sync' THEN 'DMS_CONTENT_TEXT_SYNC' WHEN 'ai_summary' THEN 'DMS_AI_SUMMARY' WHEN 'intelligence' THEN 'DMS_COMPLETENESS' WHEN 'embedding' THEN 'DMS_SEMANTIC_SEARCH' WHEN 'tag_suggestions' THEN 'DMS_AUTO_TAGS' WHEN 'link_suggestions' THEN 'DMS_SMART_LINKS' END;
    IF allowed AND (SELECT count(*) FROM jsonb_array_elements(u.orchestration_steps_json) x WHERE x->>'step'=item->>'step')=1 AND NOT EXISTS(SELECT 1 FROM erp_private.mobile_dms_retries t WHERE t.session_id=u.id AND t.step=item->>'step' AND NOT t.settled) AND NOT EXISTS(SELECT 1 FROM erp_private.mobile_dms_web_retries w WHERE w.session_id=u.id AND w.step=item->>'step') AND item->>'status' IN ('failed','skipped') AND (EXISTS(SELECT 1 FROM public.erp_ai_feature_flags WHERE feature_code=flag AND is_enabled) OR (item->>'step'='intelligence' AND EXISTS(SELECT 1 FROM public.erp_ai_feature_flags WHERE feature_code='DMS_RISK_SCORE' AND is_enabled)))
     AND (item->>'step' NOT IN('ai_summary','embedding') OR public.f03_has_document_permission(doc,'dms.documents.ai.run') OR erp_private.mobile_dms_can(doc,'dms.admin'))
     AND (item->>'step' NOT IN('intelligence','tag_suggestions','link_suggestions') OR erp_private.mobile_dms_can(doc,'dms.documents.edit') OR erp_private.mobile_dms_can(doc,'dms.admin'))
     AND (item->>'step'<>'ai_summary' OR EXISTS(SELECT 1 FROM public.dms_document_content dc WHERE dc.document_id=doc AND erp_private.mobile_dms_has_text(dc.content_text)))
     AND (item->>'step' NOT IN ('ai_summary','link_suggestions','tag_suggestions') OR EXISTS(SELECT 1 FROM public.erp_ai_provider_configs cfg WHERE cfg.config_code IN ('DEFAULT_DMS_CLASSIFIER','DEFAULT_DMS_EXTRACTOR','DEFAULT_CHAT') AND cfg.is_active AND cfg.is_enabled AND cfg.deleted_at IS NULL))
     AND (item->>'step'<>'embedding' OR EXISTS(SELECT 1 FROM public.dms_documents source WHERE source.id=doc AND source.deleted_at IS NULL
       AND source.summary_embedding_status IS DISTINCT FROM 'complete'
       AND (source.confidentiality_level NOT IN ('hr','legal','executive') OR erp_private.mobile_dms_can(doc,'dms.admin'))
       AND ((source.ai_summary_status='complete' AND erp_private.mobile_dms_has_text(source.ai_summary))
         OR EXISTS(SELECT 1 FROM public.dms_document_content dc WHERE dc.document_id=doc AND erp_private.mobile_dms_has_text(dc.content_text)))))
     AND (item->>'step'<>'embedding' OR EXISTS(SELECT 1 FROM public.erp_ai_provider_configs cfg WHERE cfg.config_code IN ('DEFAULT_EMBEDDING','DEFAULT_CHAT') AND cfg.is_active AND cfg.is_enabled AND cfg.deleted_at IS NULL))
     AND (item->>'step'<>'ai_summary' OR NOT EXISTS(SELECT 1 FROM public.dms_documents d WHERE d.id=doc AND (d.ai_summary_status='complete' OR (d.confidentiality_level IN('hr','legal','executive') AND NOT erp_private.mobile_dms_can(doc,'dms.admin'))))) THEN actions:=actions||jsonb_build_array(jsonb_build_object('action','retry_step','step',item->>'step')); END IF;
   END LOOP;
   IF EXISTS(SELECT 1 FROM erp_private.mobile_dms_retries t WHERE t.session_id=u.id AND NOT t.settled) OR EXISTS(SELECT 1 FROM erp_private.mobile_dms_web_retries w WHERE w.session_id=u.id) THEN IF jsonb_array_length(actions)=0 AND hold IS NULL THEN stage:='held';hold:='reconciliation_required'; END IF; END IF;
  END IF;
 END IF;
 RETURN jsonb_build_object('documentId',doc,'sourceHash',src->'sourceHash','jobId',j.id,'requestId',req,'stage',stage,'queueStatus',queue,'workerHealthy',healthy,'createdAt',created,'startedAt',started,'updatedAt',updated,'errorCode',err,'holdReason',hold,'steps',steps,'actions',actions,'preparation',prep);
END $$;
CREATE FUNCTION public.mobile_dms_progress(p_data jsonb) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT erp_private.mobile_dms_progress(p_data) $$;
CREATE FUNCTION erp_private.mobile_dms_operation(p_action text,p_data jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE who bigint:=erp_private.mobile_dms_actor();op uuid:=(p_data->>'operationId')::uuid;doc bigint:=(p_data->>'documentId')::bigint;job bigint:=(p_data->>'jobId')::bigint;step text:=p_data->>'step';act text:=p_data->>'action'; status jsonb;r jsonb;q public.dms_ai_job_queue;u public.dms_upload_sessions;
BEGIN
 IF p_action<>'admit' OR act IS NULL OR act NOT IN ('prepare_source','resume','cancel','retry_step') THEN RAISE EXCEPTION 'Invalid operation' USING ERRCODE='22023';END IF;
 PERFORM erp_private.mobile_dms_keys(p_data,ARRAY['documentId','sourceHash','operationId','action']||CASE act WHEN 'prepare_source' THEN ARRAY['snapshot','fileIds'] WHEN 'retry_step' THEN ARRAY['jobId','step'] ELSE ARRAY['jobId'] END);
 PERFORM erp_private.mobile_dms_lock(doc);
 PERFORM erp_private.mobile_dms_source(jsonb_build_object('documentId',doc,'sourceHash',p_data->>'sourceHash'),ARRAY['dms.documents.preview']);
 r:=erp_private.mobile_dms_reserve('processing/'||act,p_data); IF r IS NOT NULL THEN RETURN r; END IF;
 IF job IS NOT NULL THEN SELECT * INTO q FROM public.dms_ai_job_queue WHERE id=job AND related_document_id=doc FOR UPDATE; END IF;
 IF act='retry_step' THEN SELECT * INTO u FROM public.dms_upload_sessions WHERE id=q.related_upload_session_id AND document_id=doc AND deleted_at IS NULL FOR UPDATE; END IF;
 IF act='retry_step' AND step IN ('embedding','ai_summary') THEN PERFORM 1 FROM public.dms_document_content WHERE document_id=doc FOR SHARE; END IF;
 status:=erp_private.mobile_dms_progress(jsonb_strip_nulls(jsonb_build_object('documentId',doc,'jobId',job)));
 IF act='prepare_source' THEN
  IF status->'preparation'->>'snapshot' IS DISTINCT FROM p_data->>'snapshot' OR status->'preparation'->>'snapshot' IS NULL THEN RAISE EXCEPTION 'Source selection changed' USING ERRCODE='PT409'; END IF;
  IF jsonb_typeof(p_data->'fileIds') IS DISTINCT FROM 'array' OR jsonb_array_length(p_data->'fileIds') NOT BETWEEN 1 AND 10 OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_data->'fileIds') x WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(status->'preparation'->'files') f WHERE f->'id'=x)) THEN RAISE EXCEPTION 'File selection changed' USING ERRCODE='PT409'; END IF;
  r:=public.ai_mod04_preparation('start',jsonb_build_object('documentId',doc,'snapshot',p_data->'snapshot','fileIds',p_data->'fileIds','mode','reread_files','requestId',op));job:=(r->>'jobId')::bigint;
 ELSIF NOT (status->'actions' @> jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('action',act,'step',step)))) THEN RAISE EXCEPTION 'Action unavailable' USING ERRCODE='PT409';
 ELSIF act='cancel' THEN r:=public.ai_mod04_preparation('cancel',jsonb_build_object('documentId',doc,'jobId',job));
 ELSIF act='resume' THEN r:=public.dms_preparation_progress(doc,job,true);
 ELSE
  IF u.id IS NULL OR q.job_type<>'post_approve_orchestration' OR q.payload_json->>'sessionCode' IS DISTINCT FROM u.session_code OR (q.payload_json->>'uploadSessionId')::bigint IS DISTINCT FROM u.id THEN RAISE EXCEPTION 'Job binding changed' USING ERRCODE='PT409'; END IF;
  INSERT INTO erp_private.mobile_dms_retries(actor,operation,job_id,session_id,document_id,source_hash,step,prior_steps,claims) VALUES(who,op,job,u.id,doc,p_data->>'sourceHash',step,u.orchestration_steps_json,jsonb_build_object('sub',auth.uid(),'session_id',auth.jwt()->>'session_id','role','authenticated'));
  RETURN jsonb_build_object('admitted',true,'sessionCode',u.session_code,'actor',who);
 END IF;
 RETURN erp_private.mobile_dms_settle(op,jsonb_build_object('documentId',doc,'jobId',job,'operationId',op,'state',coalesce(r->>'status',r->>'state'),'replayed',false));
END $$;
CREATE FUNCTION public.mobile_dms_operation(p_action text,p_data jsonb) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT erp_private.mobile_dms_operation(p_action,p_data)$$;
CREATE FUNCTION erp_private.mobile_dms_finish_retry(p_actor bigint,p_operation uuid,p_result jsonb,p_status text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE t erp_private.mobile_dms_retries;u public.dms_upload_sessions;original text:=current_setting('request.jwt.claims',true); receipt jsonb;safe jsonb;rows jsonb;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Canonical writer required' USING ERRCODE='42501'; END IF;
 SELECT * INTO STRICT t FROM erp_private.mobile_dms_retries WHERE actor=p_actor AND operation=p_operation AND NOT settled FOR UPDATE;
 -- A trusted pre-invocation failure releases only this reservation. Leave business state untouched even if the caller lost access.
 IF p_result->>'step'=t.step AND p_result->>'status'='failed' AND p_result->'abandoned'='true'::jsonb AND p_result->>'providerEffect'='never_started' THEN
  receipt:=jsonb_build_object('documentId',t.document_id,'jobId',t.job_id,'operationId',p_operation,'state',p_result->'status','replayed',false);
  UPDATE erp_private.mobile_dms_receipts SET result=receipt,state='settled' WHERE actor=t.actor AND operation=t.operation AND state='admitted';
  IF NOT FOUND THEN RAISE EXCEPTION 'Retry receipt changed' USING ERRCODE='PT409'; END IF;
  UPDATE erp_private.mobile_dms_retries SET settled=true WHERE actor=t.actor AND operation=t.operation;
  RETURN receipt;
 END IF;
 PERFORM set_config('request.jwt.claims',t.claims::text,true);
 IF erp_private.mobile_dms_actor()<>t.actor THEN RAISE EXCEPTION 'Session changed' USING ERRCODE='42501'; END IF;
 PERFORM erp_private.mobile_dms_lock(t.document_id);PERFORM erp_private.mobile_dms_source(jsonb_build_object('documentId',t.document_id,'sourceHash',t.source_hash),ARRAY['dms.documents.preview']);
 SELECT * INTO STRICT u FROM public.dms_upload_sessions WHERE id=t.session_id AND document_id=t.document_id AND deleted_at IS NULL FOR UPDATE;
 IF NOT(public.f03_has_document_permission(t.document_id,'dms.documents.ai.run') OR public.f03_has_document_permission(t.document_id,'dms.documents.upload') OR erp_private.mobile_dms_can(t.document_id,'dms.admin')) OR (t.step IN('ai_summary','embedding','tag_suggestions','link_suggestions') AND p_result->>'status'<>'completed' AND p_result->>'providerEffect' IS DISTINCT FROM 'never_started') OR (u.uploaded_by IS DISTINCT FROM t.actor AND NOT erp_private.mobile_dms_can(t.document_id,'dms.admin')) OR p_result->>'step' IS DISTINCT FROM t.step OR coalesce(p_result->>'status','') NOT IN('failed','skipped','completed') OR p_status NOT IN ('complete','complete_with_warnings','failed','running','pending','queued','skipped_feature_disabled') OR NOT EXISTS(SELECT 1 FROM public.dms_ai_job_queue q WHERE q.id=t.job_id AND q.related_document_id=t.document_id AND q.related_upload_session_id=u.id) THEN RAISE EXCEPTION 'Retry receipt changed' USING ERRCODE='PT409'; END IF;
 PERFORM erp_private.mobile_dms_merge_step(t.session_id,t.step,(SELECT x FROM jsonb_array_elements(t.prior_steps)x WHERE x->>'step'=t.step),p_result-'safeErrorMessage');
 UPDATE erp_private.mobile_dms_retries SET settled=true WHERE actor=p_actor AND operation=p_operation;
 receipt:=erp_private.mobile_dms_settle(p_operation,jsonb_build_object('documentId',t.document_id,'jobId',t.job_id,'operationId',p_operation,'state',p_result->'status','replayed',false));
 PERFORM set_config('request.jwt.claims',original,true);RETURN receipt;
END $$;
CREATE FUNCTION public.mobile_dms_finish_retry(p_actor bigint,p_operation uuid,p_result jsonb,p_status text) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT erp_private.mobile_dms_finish_retry(p_actor,p_operation,p_result,p_status)$$;
REVOKE ALL ON FUNCTION erp_private.mobile_dms_hash(jsonb) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION erp_private.mobile_dms_keys(jsonb,text[],text[]) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION erp_private.mobile_dms_actor() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION erp_private.mobile_dms_can(bigint,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION erp_private.mobile_dms_lock(bigint) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION erp_private.mobile_dms_reserve(text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION erp_private.mobile_dms_settle(uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION erp_private.mobile_dms_audit(bigint,text,bigint,text,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION erp_private.mobile_dms_increment_revision() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION erp_private.mobile_dms_source(jsonb,text[]) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION erp_private.mobile_dms_comment(text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.mobile_dms_source(jsonb,text[]) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.mobile_dms_comment(text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION erp_private.mobile_dms_source(jsonb,text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION erp_private.mobile_dms_comment(text,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mobile_dms_source(jsonb,text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mobile_dms_comment(text,jsonb) TO authenticated;
REVOKE ALL ON FUNCTION erp_private.mobile_dms_document(text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.mobile_dms_document(text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION erp_private.mobile_dms_document(text,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mobile_dms_document(text,jsonb) TO authenticated;
REVOKE ALL ON FUNCTION erp_private.mobile_dms_parent(jsonb) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION erp_private.mobile_dms_parent_key(text,bigint) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION erp_private.mobile_dms_link_fence() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION erp_private.mobile_dms_lock_parent(jsonb) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION erp_private.mobile_dms_rule_rows(jsonb,bigint) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION erp_private.mobile_dms_checklist(jsonb) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.mobile_dms_checklist(jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION erp_private.mobile_dms_checklist(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mobile_dms_checklist(jsonb) TO authenticated;
REVOKE ALL ON FUNCTION erp_private.mobile_dms_officers(jsonb,text,bigint) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION erp_private.mobile_dms_evidence(jsonb,bigint,bigint,bigint) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION erp_private.mobile_dms_request_row(text,bigint,jsonb) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION erp_private.mobile_dms_requests(text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.mobile_dms_requests(text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.mobile_dms_renewal_request(jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION erp_private.mobile_dms_requests(text,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mobile_dms_requests(text,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mobile_dms_renewal_request(jsonb) TO authenticated;
REVOKE ALL ON FUNCTION erp_private.mobile_dms_progress(jsonb) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION erp_private.mobile_dms_operation(text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.mobile_dms_progress(jsonb) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.mobile_dms_operation(text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION erp_private.mobile_dms_finish_retry(bigint,uuid,jsonb,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.mobile_dms_finish_retry(bigint,uuid,jsonb,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION erp_private.mobile_dms_progress(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION erp_private.mobile_dms_operation(text,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mobile_dms_progress(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mobile_dms_operation(text,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION erp_private.mobile_dms_finish_retry(bigint,uuid,jsonb,text),public.mobile_dms_finish_retry(bigint,uuid,jsonb,text) TO service_role;
COMMIT;
