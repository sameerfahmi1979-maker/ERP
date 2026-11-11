-- Same intake editor, existing document: original bytes and numbering are never recreated.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
CREATE TABLE erp_private.dms_full_intake_receipts(
 actor bigint NOT NULL REFERENCES public.user_profiles(id),request_id uuid NOT NULL,
 job_id bigint NOT NULL REFERENCES public.dms_ai_job_queue(id),payload_hash text NOT NULL,
 receipt jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(actor,request_id));
CREATE TABLE erp_private.dms_full_intake_drafts(
 job_id bigint PRIMARY KEY REFERENCES public.dms_ai_job_queue(id),actor bigint NOT NULL REFERENCES public.user_profiles(id),
 revision integer NOT NULL,payload jsonb NOT NULL,updated_at timestamptz NOT NULL DEFAULT clock_timestamp());
ALTER TABLE erp_private.dms_full_intake_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_private.dms_full_intake_drafts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON erp_private.dms_full_intake_receipts,erp_private.dms_full_intake_drafts FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION erp_private.dms_full_intake_schema(p_document bigint,p_type bigint) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE d public.dms_documents; t public.dms_document_types; target jsonb;
BEGIN
 d:=erp_private.f07_metadata_authority(p_document,false);
 IF NOT coalesce(erp_private.dms_file_pipeline_manager(d.id),false) THEN RAISE EXCEPTION 'Review access denied' USING ERRCODE='42501'; END IF;
 SELECT * INTO t FROM public.dms_document_types WHERE id=p_type AND is_active AND deleted_at IS NULL FOR SHARE;
 IF t.id IS NULL THEN RAISE EXCEPTION 'Select an active document type' USING ERRCODE='22023'; END IF;
 PERFORM m.id FROM public.dms_metadata_definitions m WHERE m.document_type_id=t.id AND m.deleted_at IS NULL AND m.is_active FOR SHARE;
 target:=erp_private.ai_mod04_target_type(d.id,t.type_code);
 IF t.id<>d.document_type_id AND target->'canApply' IS DISTINCT FROM 'true'::jsonb THEN RAISE EXCEPTION 'Type belongs to a protected owning workflow' USING ERRCODE='55000'; END IF;
 RETURN encode(sha256(convert_to(jsonb_build_object('type',to_jsonb(t),'target',target,
 'definitions',(SELECT coalesce(jsonb_agg(to_jsonb(m) ORDER BY m.id),'[]'::jsonb) FROM public.dms_metadata_definitions m WHERE m.document_type_id=t.id AND m.deleted_at IS NULL AND m.is_active),
 'tags',(SELECT coalesce(jsonb_agg(tag_id ORDER BY tag_id),'[]'::jsonb) FROM public.dms_document_tags WHERE document_id=d.id))::text,'UTF8')),'hex');
END $$;
REVOKE ALL ON FUNCTION erp_private.dms_full_intake_schema(bigint,bigint) FROM PUBLIC,anon,authenticated,service_role;

-- Reuse the verified stored-byte/derived-data writer, with the user's reviewed
-- registered tag selection. Never rewrite the immutable AI candidate to do this.
DO $$DECLARE body text; needle text:=' candidate:=a.raw_response_json->''preparation'';'; BEGIN
 body:=pg_get_functiondef('erp_private.ai_mod04_refresh_derived(bigint)'::regprocedure);
 IF position(needle IN body)=0 THEN RAISE EXCEPTION 'Derived writer prerequisite differs'; END IF;
 body:=replace(body,'erp_private.ai_mod04_refresh_derived(p_job bigint)','erp_private.dms_full_intake_refresh(p_job bigint,p_tags jsonb)');
 body:=replace(body,needle,needle||E'\n candidate:=jsonb_set(candidate,\'{tagIds}\',p_tags);');
 body:=replace(body,'ocr_error_message=NULL,updated_at=clock_timestamp()','ocr_error_message=NULL');
 EXECUTE body;
END $$;
REVOKE ALL ON FUNCTION erp_private.dms_full_intake_refresh(bigint,jsonb) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION erp_private.dms_saved_intake_review(p_action text,p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
<<op>>
DECLARE actor bigint:=public.current_user_profile_id(); doc bigint; fileid bigint; job bigint; key uuid; hash text; s jsonb; c jsonb;
 d public.dms_documents; f public.dms_document_files; t public.dms_document_types; vals jsonb; links jsonb; item jsonb; md jsonb:='[]'; col text; val jsonb;
 def public.dms_metadata_definitions; olddraft erp_private.dms_full_intake_drafts; prior erp_private.dms_full_intake_receipts;
 review jsonb; receipt jsonb; derived jsonb; revision integer; expected integer; sourcehash text; target jsonb;
BEGIN
 IF auth.uid() IS NULL OR actor IS NULL OR NOT erp_private.business_principal_is_active() THEN RAISE EXCEPTION 'Active account required' USING ERRCODE='42501'; END IF;
 IF p_action IS NULL OR p_action NOT IN ('open','schema','draft','apply') OR jsonb_typeof(p_data) IS DISTINCT FROM 'object' OR octet_length(p_data::text)>1048576 THEN RAISE EXCEPTION 'Invalid review request' USING ERRCODE='22023'; END IF;
 doc:=(p_data->>'documentId')::bigint; fileid:=(p_data->>'fileId')::bigint;
 IF NOT coalesce(erp_private.dms_file_pipeline_manager(doc),false) THEN RAISE EXCEPTION 'DMS manager or scoped administrator required' USING ERRCODE='42501'; END IF;
 IF p_action='schema' THEN RETURN jsonb_build_object('schemaHash',erp_private.dms_full_intake_schema(doc,(p_data->>'documentTypeId')::bigint),
  'fields',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',m.id,'code',m.field_code,'label',m.field_label_en,'type',m.field_type,'current',NULL,'required',m.is_required,'aiExtractable',m.is_ai_extractable) ORDER BY m.id),'[]') FROM public.dms_metadata_definitions m WHERE m.document_type_id=(p_data->>'documentTypeId')::bigint AND m.is_active AND m.deleted_at IS NULL)); END IF;
 IF p_action='open' THEN
  review:=erp_private.dms_saved_document_review('open',jsonb_build_object('documentId',doc));
  SELECT * INTO d FROM public.dms_documents WHERE id=doc;
  SELECT * INTO f FROM public.dms_document_files WHERE id=fileid AND document_id=doc AND version_id=d.current_version_id AND deleted_at IS NULL AND file_role='original';
  IF f.id IS NULL THEN RAISE EXCEPTION 'Current original file unavailable' USING ERRCODE='42501'; END IF;
  SELECT coalesce(jsonb_object_agg(m.id,jsonb_build_object('fieldType',m.field_type,'rawValue',coalesce(v.value_text,v.value_number::text,v.value_date::text,v.value_datetime::text,v.value_boolean::text,v.value_json::text,''))),'{}') INTO md
   FROM public.dms_metadata_definitions m LEFT JOIN public.dms_document_metadata_values v ON v.definition_id=m.id AND v.document_id=doc AND v.deleted_at IS NULL WHERE m.document_type_id=d.document_type_id AND m.deleted_at IS NULL AND m.is_active;
  SELECT * INTO olddraft FROM erp_private.dms_full_intake_drafts r WHERE r.job_id=(review->'recovery'->>'jobId')::bigint AND r.actor=op.actor;
  RETURN jsonb_build_object('review',review,'values',jsonb_build_object('title',d.title,'standardFileName',f.file_name,'documentTypeId',d.document_type_id,'categoryId',d.category_id,
   'description',coalesce(d.description,''),'issueDate',coalesce(d.issue_date::text,''),'expiryDate',coalesce(d.expiry_date::text,''),'confidentialityLevel',d.confidentiality_level,
   'owningCompanyId',d.owning_company_id,'owningBranchId',d.owning_branch_id,'metadataValues',md,'tagIds',(SELECT coalesce(jsonb_agg(tag_id ORDER BY tag_id),'[]') FROM public.dms_document_tags WHERE document_id=doc)),
   'links',(SELECT coalesce(jsonb_agg(jsonb_build_object('entityType',l.entity_type,'entityId',l.entity_id,'entityName',l.entity_type||' #'||l.entity_id) ORDER BY l.id),'[]') FROM public.dms_document_links l WHERE l.document_id=doc AND l.deleted_at IS NULL),
   'schemaHash',erp_private.dms_full_intake_schema(doc,d.document_type_id),'draft',CASE WHEN olddraft.job_id IS NULL THEN NULL ELSE jsonb_build_object('revision',olddraft.revision,'payload',olddraft.payload,'current',olddraft.payload->>'snapshot'=review->'source'->>'snapshot') END);
 END IF;
 IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_data) k WHERE k NOT IN('documentId','fileId','jobId','requestId','snapshot','schemaHash','expectedRevision','confirmed','values','links')) THEN RAISE EXCEPTION 'Unknown property' USING ERRCODE='22023'; END IF;
 job:=(p_data->>'jobId')::bigint;key:=(p_data->>'requestId')::uuid;expected:=(p_data->>'expectedRevision')::integer;vals:=p_data->'values';links:=p_data->'links';
 IF key IS NULL OR expected IS NULL OR expected<0 OR p_data->'confirmed' IS DISTINCT FROM 'true'::jsonb OR jsonb_typeof(vals) IS DISTINCT FROM 'object' OR jsonb_typeof(links) IS DISTINCT FROM 'array' OR jsonb_array_length(links)>50 THEN RAISE EXCEPTION 'Confirmed review required' USING ERRCODE='22023'; END IF;
 PERFORM q.id FROM public.dms_ai_job_queue q WHERE q.id=job AND q.related_document_id=doc AND q.created_by=actor FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Review belongs to another actor' USING ERRCODE='42501'; END IF;
 SELECT preparation_context INTO c FROM erp_private.f07_job_claims WHERE job_id=job FOR UPDATE;
 PERFORM erp_private.ai_mod04_lock_profile_authority(actor);
 IF NOT coalesce(erp_private.dms_file_pipeline_manager(doc),false) THEN RAISE EXCEPTION 'Review authority changed' USING ERRCODE='42501'; END IF;
 d:=erp_private.f07_metadata_authority(doc,false);
 PERFORM pg_advisory_xact_lock(hashtextextended('dms-full-intake:'||actor||':'||key,0));
 hash:=encode(sha256(convert_to(p_action||p_data::text,'UTF8')),'hex');
 SELECT * INTO prior FROM erp_private.dms_full_intake_receipts r WHERE r.actor=op.actor AND r.request_id=key;
 IF FOUND THEN
  IF prior.job_id<>job OR prior.payload_hash<>hash THEN RAISE EXCEPTION 'Retained request differs' USING ERRCODE='PT409'; END IF;
  RETURN prior.receipt||'{"replayed":true}'::jsonb;
 END IF;
 IF c->>'state' IS DISTINCT FROM 'review_required' OR c->>'snapshot' IS DISTINCT FROM p_data->>'snapshot'
  OR NOT (c->'fileIds' @> jsonb_build_array(fileid)) OR jsonb_array_length(c->'fileIds')<>1 THEN RAISE EXCEPTION 'Current selected-file review required' USING ERRCODE='PT409'; END IF;
 s:=erp_private.ai_mod04_source(doc);
 IF s->>'snapshot' IS DISTINCT FROM p_data->>'snapshot' THEN RAISE EXCEPTION 'Document changed since review' USING ERRCODE='PT409'; END IF;
 SELECT * INTO f FROM public.dms_document_files WHERE id=fileid AND document_id=doc AND version_id=d.current_version_id AND deleted_at IS NULL AND file_role='original' FOR UPDATE;
 IF f.id IS NULL THEN RAISE EXCEPTION 'Current stored original unavailable' USING ERRCODE='PT409'; END IF;
 IF erp_private.dms_full_intake_schema(doc,(vals->>'documentTypeId')::bigint) IS DISTINCT FROM p_data->>'schemaHash' THEN RAISE EXCEPTION 'Definitions or tags changed' USING ERRCODE='PT409'; END IF;
 SELECT * INTO olddraft FROM erp_private.dms_full_intake_drafts WHERE job_id=job FOR UPDATE;
 IF olddraft.job_id IS NOT NULL AND olddraft.actor<>actor THEN RAISE EXCEPTION 'Draft unavailable' USING ERRCODE='42501'; END IF;
 IF coalesce(olddraft.revision,0)<>expected THEN RAISE EXCEPTION 'Review draft changed in another session' USING ERRCODE='PT409'; END IF;
 revision:=expected;
 IF p_action='draft' THEN
  revision:=expected+1;
  INSERT INTO erp_private.dms_full_intake_drafts(job_id,actor,revision,payload) VALUES(job,actor,revision,p_data)
   ON CONFLICT(job_id) DO UPDATE SET revision=EXCLUDED.revision,payload=EXCLUDED.payload,updated_at=clock_timestamp();
 ELSE
  d:=erp_private.f07_metadata_authority(doc,true);
  IF NOT erp_private.document_permission(doc,'dms.documents.edit') THEN RAISE EXCEPTION 'Document edit access denied' USING ERRCODE='42501'; END IF;
  SELECT * INTO t FROM public.dms_document_types WHERE id=(vals->>'documentTypeId')::bigint;
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(vals) k WHERE k NOT IN('title','standardFileName','documentTypeId','categoryId','description','issueDate','expiryDate','confidentialityLevel','owningCompanyId','owningBranchId','metadataValues','tagIds'))
   OR nullif(btrim(vals->>'title'),'') IS NULL OR length(vals->>'title')>500 OR length(vals->>'description')>16000
   OR (vals->>'categoryId')::bigint IS DISTINCT FROM t.category_id OR vals->>'confidentialityLevel' NOT IN('internal','company','hr','finance','legal','executive')
   OR jsonb_typeof(vals->'metadataValues') IS DISTINCT FROM 'object' OR jsonb_typeof(vals->'tagIds') IS DISTINCT FROM 'array' OR jsonb_array_length(vals->'tagIds')>30
   OR nullif(vals->>'standardFileName','') IS NULL OR length(vals->>'standardFileName')>240 OR vals->>'standardFileName' ~ '[\\/:*?"<>|[:cntrl:]]'
   OR lower(substring(vals->>'standardFileName' from '\.[^.]+$')) IS DISTINCT FROM lower(substring(f.file_name from '\.[^.]+$')) THEN RAISE EXCEPTION 'Invalid intake fields or file extension' USING ERRCODE='22023'; END IF;
  IF nullif(vals->>'expiryDate','')::date<nullif(vals->>'issueDate','')::date THEN RAISE EXCEPTION 'Expiry precedes issue date' USING ERRCODE='22023'; END IF;
  IF (vals->>'owningCompanyId')::bigint IS DISTINCT FROM d.owning_company_id OR (vals->>'owningBranchId')::bigint IS DISTINCT FROM d.owning_branch_id THEN
   IF NOT EXISTS(SELECT 1 FROM public.owner_companies WHERE id=(vals->>'owningCompanyId')::bigint AND status='active') OR ((vals->>'owningBranchId') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.branches WHERE id=(vals->>'owningBranchId')::bigint AND owner_company_id=(vals->>'owningCompanyId')::bigint AND status='active')) THEN RAISE EXCEPTION 'Invalid ownership' USING ERRCODE='22023'; END IF;
  END IF;
  IF NOT erp_private.permission_in_scope('dms.documents.edit',(vals->>'owningCompanyId')::bigint,(vals->>'owningBranchId')::bigint)
   OR (vals->>'confidentialityLevel' NOT IN('internal','company') AND NOT erp_private.permission_in_scope('dms.documents.view.'||(vals->>'confidentialityLevel'),(vals->>'owningCompanyId')::bigint,(vals->>'owningBranchId')::bigint)) THEN RAISE EXCEPTION 'Destination access denied' USING ERRCODE='42501'; END IF;
  -- Enforce target access for every added or removed link; unchanged historical
  -- links remain intact. Existing origin/HR binding triggers still run.
  IF (SELECT count(*) FROM jsonb_array_elements(links))<>(SELECT count(DISTINCT (x->>'entityType',x->>'entityId')) FROM jsonb_array_elements(links) x) THEN RAISE EXCEPTION 'Repeated link' USING ERRCODE='22023'; END IF;
  FOR item IN
   SELECT jsonb_build_object('entityType',l.entity_type,'entityId',l.entity_id) FROM public.dms_document_links l WHERE l.document_id=doc AND l.deleted_at IS NULL AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(links) x WHERE x->>'entityType'=l.entity_type AND (x->>'entityId')::bigint=l.entity_id)
   UNION SELECT x FROM jsonb_array_elements(links) x WHERE NOT EXISTS(SELECT 1 FROM public.dms_document_links l WHERE l.document_id=doc AND l.deleted_at IS NULL AND l.entity_type=x->>'entityType' AND l.entity_id=(x->>'entityId')::bigint)
  LOOP
   IF NOT coalesce(CASE WHEN item->>'entityType'='employee' THEN public.current_user_can_manage_employee((item->>'entityId')::bigint)
    WHEN item->>'entityType'='employee_dependent' THEN (SELECT public.current_user_can_manage_employee(e.employee_id) FROM public.employee_dependents e WHERE e.id=(item->>'entityId')::bigint AND e.deleted_at IS NULL)
    ELSE public.current_user_can_view_ai_entity(item->>'entityType',(item->>'entityId')::bigint) END,false) THEN RAISE EXCEPTION 'Linked record access denied' USING ERRCODE='42501'; END IF;
  END LOOP;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(vals->'tagIds') x WHERE NOT EXISTS(SELECT 1 FROM public.dms_tags WHERE id=x::bigint AND is_active AND deleted_at IS NULL)) THEN RAISE EXCEPTION 'Tag unavailable' USING ERRCODE='22023'; END IF;
  -- Derived writer checks original scopes and exact selected-file OCR receipts.
  derived:=erp_private.dms_full_intake_refresh(job,vals->'tagIds');
  UPDATE public.dms_documents SET title=btrim(vals->>'title'),description=vals->>'description',document_type_id=t.id,category_id=t.category_id,
   issue_date=nullif(vals->>'issueDate','')::date,expiry_date=nullif(vals->>'expiryDate','')::date,confidentiality_level=vals->>'confidentialityLevel',owning_company_id=(vals->>'owningCompanyId')::bigint,owning_branch_id=(vals->>'owningBranchId')::bigint,updated_by=actor,updated_at=clock_timestamp() WHERE id=doc;
  md:='[]';
  FOR item IN SELECT jsonb_build_object('id',e.key,'value',e.value) FROM jsonb_each(vals->'metadataValues') e LOOP
   SELECT * INTO def FROM public.dms_metadata_definitions WHERE id=(item->>'id')::bigint AND document_type_id=t.id AND is_active AND deleted_at IS NULL;
   IF def.id IS NULL OR def.field_type IS DISTINCT FROM item->'value'->>'fieldType' THEN RAISE EXCEPTION 'Metadata definition mismatch' USING ERRCODE='22023'; END IF;
   col:=erp_private.f07_metadata_column(def.field_type);
   val:=to_jsonb(nullif(item->'value'->>'rawValue',''));
   IF val IS NOT NULL THEN
    IF col='value_number' THEN val:=to_jsonb((val#>>'{}')::numeric);
    ELSIF col='value_boolean' THEN val:=to_jsonb((val#>>'{}')::boolean);
    ELSIF col='value_json' THEN val:=(val#>>'{}')::jsonb; END IF;
   END IF;
   md:=md||jsonb_build_array(jsonb_build_object('definition_id',def.id,col,val));
  END LOOP;
  PERFORM erp_private.f07_write_metadata(doc,md,actor);
  target:=erp_private.ai_mod04_target_type(doc,t.type_code);
  FOR item IN SELECT value FROM jsonb_array_elements(coalesce(target->'profile'->'requiredFields','[]')) LOOP
   IF NOT EXISTS(SELECT 1 FROM public.dms_document_metadata_values v JOIN public.dms_metadata_definitions m ON m.id=v.definition_id WHERE v.document_id=doc AND v.deleted_at IS NULL AND m.document_type_id=t.id AND m.field_code=item#>>'{}' AND nullif(btrim(coalesce(v.value_text,v.value_number::text,v.value_date::text,v.value_datetime::text,v.value_boolean::text,v.value_json::text)),'') IS NOT NULL) THEN RAISE EXCEPTION 'Required profile metadata missing' USING ERRCODE='22023'; END IF;
  END LOOP;
  UPDATE public.dms_document_files SET file_name=vals->>'standardFileName' WHERE id=fileid;
  UPDATE public.dms_document_links l SET deleted_at=clock_timestamp() WHERE l.document_id=doc AND l.deleted_at IS NULL AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(links) x WHERE x->>'entityType'=l.entity_type AND (x->>'entityId')::bigint=l.entity_id);
  INSERT INTO public.dms_document_links(document_id,entity_type,entity_id,linked_by)
   SELECT doc,x->>'entityType',(x->>'entityId')::bigint,actor FROM jsonb_array_elements(links) x WHERE NOT EXISTS(SELECT 1 FROM public.dms_document_links l WHERE l.document_id=doc AND l.deleted_at IS NULL AND l.entity_type=x->>'entityType' AND l.entity_id=(x->>'entityId')::bigint);
  -- Tags are additive; historical accepted tags are not removed by AI reruns.
  PERFORM erp_private.f07_assert_document_completion(doc);
  IF NOT coalesce(erp_private.ai_mod04_subjects_allowed(doc),false) THEN RAISE EXCEPTION 'Updated subject access denied' USING ERRCODE='42501'; END IF;
  INSERT INTO public.dms_document_events(document_id,event_type,description,performed_by) VALUES(doc,'document_updated','Full saved-file intake reviewed and updated',actor);
  INSERT INTO public.audit_logs(actor_user_profile_id,module_code,entity_name,entity_id,action,old_values,new_values)
   VALUES(actor,'DMS','dms_documents',doc,'update',jsonb_build_object('document',to_jsonb(d),'derived',derived->'priorDerived'),jsonb_build_object('review',p_data,'jobId',job));
  UPDATE erp_private.f07_job_claims SET preparation_context=preparation_context||jsonb_build_object('state','applied','fullIntakeRequestId',key) WHERE job_id=job;
  UPDATE public.dms_ai_extraction_results SET ai_status='accepted',review_action='accepted',reviewed_by=actor,reviewed_at=clock_timestamp() WHERE id=(c->>'resultId')::bigint AND document_id=doc;
 END IF;
 receipt:=jsonb_build_object('documentId',doc,'jobId',job,'requestId',key,'state',CASE WHEN p_action='draft' THEN 'draft_saved' ELSE 'applied' END,'revision',revision,'replayed',false);
 INSERT INTO erp_private.dms_full_intake_receipts(actor,request_id,job_id,payload_hash,receipt) VALUES(actor,key,job,hash,receipt);
 RETURN receipt;
END $$;
CREATE FUNCTION public.dms_saved_intake_review(p_action text,p_data jsonb) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT erp_private.dms_saved_intake_review(p_action,p_data)$$;
REVOKE ALL ON FUNCTION erp_private.dms_saved_intake_review(text,jsonb),public.dms_saved_intake_review(text,jsonb) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION erp_private.dms_saved_intake_review(text,jsonb),public.dms_saved_intake_review(text,jsonb) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;


