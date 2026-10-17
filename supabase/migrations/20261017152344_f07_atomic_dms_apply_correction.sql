-- F07 T06: full server-resolved DMS values and atomic apply/correction history.
-- F06 Party transactions are intentionally not replaced or altered.
BEGIN;
SET LOCAL lock_timeout='5s';SET LOCAL statement_timeout='60s';
CREATE TABLE erp_private.f07_dms_reviews (
 run_id bigint PRIMARY KEY REFERENCES public.dms_ai_erp_apply_runs(id), actor bigint NOT NULL REFERENCES public.user_profiles(id),
 request_id uuid NOT NULL, payload_hash text NOT NULL, document_id bigint NOT NULL REFERENCES public.dms_documents(id),
 snapshot text NOT NULL, prepared jsonb NOT NULL, confirmation jsonb, receipt jsonb,
 UNIQUE(actor,request_id)
);
CREATE TABLE erp_private.f07_dms_item_values (
 item_id bigint PRIMARY KEY REFERENCES public.dms_ai_erp_apply_items(id), before_value jsonb,
 proposed_value jsonb NOT NULL, applied_value jsonb, source_fingerprint text NOT NULL
);
CREATE TABLE erp_private.f07_dms_corrections (
 proposal_id bigint PRIMARY KEY REFERENCES public.dms_ai_erp_apply_correction_proposals(id), actor bigint NOT NULL REFERENCES public.user_profiles(id),
 request_id uuid NOT NULL, payload_hash text NOT NULL, document_id bigint NOT NULL REFERENCES public.dms_documents(id),
 snapshot text NOT NULL, before_value jsonb, value jsonb NOT NULL, confirmation jsonb, receipt jsonb,
 UNIQUE(actor,request_id)
);
ALTER TABLE erp_private.f07_dms_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_private.f07_dms_item_values ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_private.f07_dms_corrections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON erp_private.f07_dms_reviews,erp_private.f07_dms_item_values,erp_private.f07_dms_corrections FROM PUBLIC,anon,authenticated,service_role;

-- Existing F06 restrictive parent/Party policies remain in force. Scoped DMS
-- reviewers must not require an unrelated global permission to read their items.
CREATE POLICY f07_scoped_review_items ON public.dms_ai_erp_apply_items FOR SELECT TO authenticated
 USING(EXISTS(SELECT 1 FROM public.dms_ai_erp_apply_runs r WHERE r.id=apply_run_id AND erp_private.document_permission(r.document_id,'dms.documents.view')));
CREATE FUNCTION erp_private.f07_guard_apply_history() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF current_user NOT IN ('postgres','supabase_admin') THEN RAISE EXCEPTION 'Use the atomic reviewed operation; history cannot be edited directly' USING ERRCODE='42501'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;RETURN NEW;
END $$;
CREATE TRIGGER f07_guard_apply_history BEFORE INSERT OR UPDATE OR DELETE ON public.dms_ai_erp_apply_runs FOR EACH ROW EXECUTE FUNCTION erp_private.f07_guard_apply_history();
CREATE TRIGGER f07_guard_apply_history BEFORE INSERT OR UPDATE OR DELETE ON public.dms_ai_erp_apply_items FOR EACH ROW EXECUTE FUNCTION erp_private.f07_guard_apply_history();
CREATE TRIGGER f07_guard_apply_history BEFORE INSERT OR UPDATE OR DELETE ON public.dms_ai_erp_apply_correction_proposals FOR EACH ROW EXECUTE FUNCTION erp_private.f07_guard_apply_history();
REVOKE ALL ON FUNCTION erp_private.f07_guard_apply_history() FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION erp_private.f07_apply_authority(p_document bigint,p_correction boolean DEFAULT false) RETURNS public.dms_documents
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE d public.dms_documents;
BEGIN
 d:=erp_private.f07_metadata_authority(p_document,false);
 IF NOT (erp_private.document_permission(d.id,'dms.apply_to_erp.run') OR erp_private.document_permission(d.id,'dms.apply_to_erp.admin') OR erp_private.document_permission(d.id,'dms.admin')) OR
  NOT (erp_private.document_permission(d.id,'dms.documents.edit') OR erp_private.document_permission(d.id,'dms.admin')) OR
  NOT EXISTS(SELECT 1 FROM public.erp_ai_feature_flags WHERE feature_code='DMS_AI_APPLY_TO_ERP' AND is_enabled) THEN RAISE EXCEPTION 'Reviewed apply access denied or feature disabled' USING ERRCODE='42501'; END IF;
 IF p_correction AND (NOT (erp_private.document_permission(d.id,'dms.apply_correction.run') OR erp_private.document_permission(d.id,'dms.apply_correction.create') OR erp_private.document_permission(d.id,'dms.admin')) OR
   NOT EXISTS(SELECT 1 FROM public.erp_ai_feature_flags WHERE feature_code='DMS_AI_APPLY_CORRECTION_PROPOSALS' AND is_enabled)) THEN RAISE EXCEPTION 'Correction access denied or feature disabled' USING ERRCODE='42501'; END IF;
 RETURN d;
END $$;

CREATE FUNCTION erp_private.f07_target(p_document bigint,p_table text,p_field text,p_id bigint) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE d public.dms_documents; m public.dms_document_metadata_values; def public.dms_metadata_definitions;
BEGIN
 SELECT * INTO d FROM public.dms_documents WHERE id=p_document;
 IF p_table='dms_documents' AND p_id=d.id AND p_field IN ('owning_company_id','owning_branch_id','party_id','issue_date','expiry_date','title','description') THEN RETURN to_jsonb(d)->p_field;
 ELSIF p_table='dms_document_metadata_values' THEN
  SELECT * INTO m FROM public.dms_document_metadata_values WHERE id=p_id AND document_id=d.id AND deleted_at IS NULL;
  SELECT * INTO def FROM public.dms_metadata_definitions WHERE id=m.definition_id AND document_type_id=d.document_type_id AND is_active AND deleted_at IS NULL;
  IF def.id IS NOT NULL AND erp_private.f07_metadata_column(def.field_type)=p_field AND def.field_type NOT IN ('json','multiselect','multi_select') THEN RETURN to_jsonb(m)->p_field; END IF;
 END IF;
 RAISE EXCEPTION 'Target is not allowlisted for this document' USING ERRCODE='42501';
END $$;

CREATE FUNCTION erp_private.f07_source_value(p_document bigint,p_item jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE r public.dms_ai_extraction_results; c public.dms_ai_entity_match_candidates; f public.dms_ai_validation_findings;
 doc public.dms_documents; def public.dms_metadata_definitions; kind text:=p_item->>'sourceType'; sid bigint:=(p_item->>'sourceId')::bigint;
 field text:=p_item->>'targetField'; code text:=p_item->>'sourceFieldCode'; val jsonb; src jsonb; typ text;
BEGIN
 PERFORM erp_private.f07_target(p_document,p_item->>'targetTable',field,(p_item->>'targetRecordId')::bigint);
 IF kind='entity_match_candidate' AND p_item->>'targetTable'='dms_documents' THEN
  SELECT * INTO c FROM public.dms_ai_entity_match_candidates WHERE id=sid AND document_id=p_document AND status='accepted' AND deleted_at IS NULL FOR SHARE;
  IF NOT FOUND OR field IS DISTINCT FROM (CASE c.target_entity_type WHEN 'owner_company' THEN 'owning_company_id' WHEN 'owner_branch' THEN 'owning_branch_id' WHEN 'party' THEN 'party_id' END) THEN RAISE EXCEPTION 'Accepted entity source unavailable' USING ERRCODE='42501'; END IF;
  val:=to_jsonb(c.target_entity_id);src:=to_jsonb(c);typ:='bigint';
 ELSE
  IF kind='validation_finding' THEN
   SELECT * INTO f FROM public.dms_ai_validation_findings WHERE id=sid AND document_id=p_document AND status IN ('open','reviewed') AND deleted_at IS NULL FOR SHARE;
   IF NOT FOUND OR f.field_code IS DISTINCT FROM code OR f.ai_result_id IS NULL THEN RAISE EXCEPTION 'Finding has no authoritative source value' USING ERRCODE='42501'; END IF;
   sid:=f.ai_result_id;
  ELSIF kind<>'extraction_result' OR kind IS NULL THEN RAISE EXCEPTION 'Unsupported source; summaries are not write evidence' USING ERRCODE='22023'; END IF;
  SELECT * INTO r FROM public.dms_ai_extraction_results WHERE id=sid AND document_id=p_document AND ai_status IN ('pending_review','accepted','partially_accepted') AND coalesce(review_action,'') NOT IN ('rejected','dismissed') FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Source unavailable for this document' USING ERRCODE='42501'; END IF;
  PERFORM erp_private.f07_check_ai_source(r.id,p_document);
  -- A file-specific suggestion cannot follow a later replacement of the original.
  IF r.file_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.dms_document_files df JOIN public.dms_document_versions dv ON dv.id=df.version_id JOIN public.dms_documents dd ON dd.current_version_id=dv.id WHERE df.id=r.file_id AND df.document_id=p_document AND dd.id=p_document AND dv.is_current AND dv.unlinked_at IS NULL AND df.deleted_at IS NULL) THEN RAISE EXCEPTION 'Source file was replaced' USING ERRCODE='PT409'; END IF;
  IF p_item->>'targetTable'='dms_documents' THEN
   IF code IS DISTINCT FROM field OR field NOT IN ('title','description','issue_date','expiry_date') THEN RAISE EXCEPTION 'Source field is not mapped to target' USING ERRCODE='22023'; END IF;
   val:=CASE field WHEN 'title' THEN to_jsonb(r.suggested_title) WHEN 'description' THEN to_jsonb(r.suggested_description) WHEN 'issue_date' THEN to_jsonb(r.issue_date_suggestion) ELSE to_jsonb(r.expiry_date_suggestion) END;
   typ:=CASE WHEN field IN ('issue_date','expiry_date') THEN 'date' ELSE 'text' END;
  ELSE
   SELECT md.* INTO def FROM public.dms_document_metadata_values v JOIN public.dms_metadata_definitions md ON md.id=v.definition_id WHERE v.id=(p_item->>'targetRecordId')::bigint AND v.document_id=p_document;
   IF code IS DISTINCT FROM def.field_code OR NOT def.is_ai_extractable THEN RAISE EXCEPTION 'Metadata source field mismatch' USING ERRCODE='22023'; END IF;
   val:=r.extracted_fields_json->code;typ:=CASE def.field_type WHEN 'currency' THEN 'number' WHEN 'select' THEN 'text' WHEN 'textarea' THEN 'text' WHEN 'email' THEN 'text' WHEN 'url' THEN 'text' WHEN 'phone' THEN 'text' ELSE def.field_type END;
   PERFORM erp_private.f07_validate_metadata_value(def.id,jsonb_build_object(field,val));
  END IF;
  src:=to_jsonb(r)||jsonb_build_object('finding',to_jsonb(f));
 END IF;
 IF val IS NULL OR val='null'::jsonb OR jsonb_typeof(val) NOT IN ('string','number','boolean') OR length(val#>>'{}')>16000 OR btrim(val#>>'{}')='' THEN RAISE EXCEPTION 'Source has no complete scalar value' USING ERRCODE='22023'; END IF;
 RETURN jsonb_build_object('value',val,'valueType',typ,'fingerprint',encode(sha256(convert_to(src::text,'UTF8')),'hex'));
END $$;

CREATE FUNCTION erp_private.f07_write_target(p_document bigint,p_table text,p_field text,p_id bigint,p_value jsonb,p_actor bigint) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE old jsonb; v text:=p_value#>>'{}'; d public.dms_documents; nextrow public.dms_documents; def public.dms_metadata_definitions; m public.dms_document_metadata_values; col text;
BEGIN
 old:=erp_private.f07_target(p_document,p_table,p_field,p_id);
 IF p_value IS NULL OR p_value='null'::jsonb OR jsonb_typeof(p_value) NOT IN ('string','number','boolean') THEN RAISE EXCEPTION 'Invalid reviewed scalar' USING ERRCODE='22023'; END IF;
 IF p_table='dms_documents' THEN
  SELECT * INTO d FROM public.dms_documents WHERE id=p_document;
  IF p_field IN ('owning_company_id','owning_branch_id','party_id') THEN
   IF old IS DISTINCT FROM 'null'::jsonb AND old IS NOT NULL THEN RAISE EXCEPTION 'An existing subject cannot be reassigned by AI apply' USING ERRCODE='22023'; END IF;
   IF v !~ '^[1-9][0-9]*$' OR v::numeric>9007199254740991 THEN RAISE EXCEPTION 'Invalid subject identity' USING ERRCODE='22023'; END IF;
   IF NOT EXISTS(SELECT 1 FROM public.erp_ai_feature_flags WHERE feature_code='DMS_AI_APPLY_TO_ERP_ENTITY_LINKS' AND is_enabled) THEN RAISE EXCEPTION 'Subject apply disabled' USING ERRCODE='42501'; END IF;
   IF p_field='owning_company_id' AND NOT EXISTS(SELECT 1 FROM public.owner_companies c WHERE c.id=v::bigint AND c.deleted_at IS NULL AND erp_private.permission_in_scope('dms.documents.edit',c.id,NULL)) THEN RAISE EXCEPTION 'Destination company denied' USING ERRCODE='42501'; END IF;
   IF p_field='owning_branch_id' AND NOT EXISTS(SELECT 1 FROM public.branches b WHERE b.id=v::bigint AND b.owner_company_id=d.owning_company_id AND b.deleted_at IS NULL AND b.status='active' AND erp_private.permission_in_scope('dms.documents.edit',d.owning_company_id,b.id)) THEN RAISE EXCEPTION 'Destination branch denied' USING ERRCODE='42501'; END IF;
   IF p_field='party_id' AND (NOT public.current_user_has_permission('master_data.parties.view') OR NOT EXISTS(SELECT 1 FROM public.parties p WHERE p.id=v::bigint AND p.is_active AND NOT p.is_locked)) THEN RAISE EXCEPTION 'Destination party denied' USING ERRCODE='42501'; END IF;
  ELSIF p_field IN ('issue_date','expiry_date') THEN
   IF jsonb_typeof(p_value)<>'string' OR v !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR (v::date)::text<>v THEN RAISE EXCEPTION 'Invalid calendar date' USING ERRCODE='22023'; END IF;
  ELSIF jsonb_typeof(p_value)<>'string' OR btrim(v)='' OR length(v)>(CASE p_field WHEN 'title' THEN 200 ELSE 16000 END) THEN RAISE EXCEPTION 'Invalid document text' USING ERRCODE='22023'; END IF;
  SELECT * INTO nextrow FROM jsonb_populate_record(d,jsonb_build_object(p_field,p_value));
  IF nextrow.issue_date>nextrow.expiry_date THEN RAISE EXCEPTION 'Document dates are reversed' USING ERRCODE='22023'; END IF;
  -- populate_record performs typed conversion, identifier is already strictly allowlisted.
  EXECUTE format('UPDATE public.dms_documents SET %I=($1).%I,updated_by=$2,updated_at=clock_timestamp() WHERE id=$3',p_field,p_field) USING nextrow,p_actor,p_document;
 ELSE
  IF NOT EXISTS(SELECT 1 FROM public.erp_ai_feature_flags WHERE feature_code='DMS_AI_APPLY_TO_ERP_DMS_METADATA' AND is_enabled) THEN RAISE EXCEPTION 'Metadata ERP apply disabled' USING ERRCODE='42501'; END IF;
  SELECT * INTO m FROM public.dms_document_metadata_values WHERE id=p_id AND document_id=p_document;
  SELECT * INTO def FROM public.dms_metadata_definitions WHERE id=m.definition_id;
  PERFORM erp_private.f07_write_metadata(p_document,jsonb_build_array(jsonb_build_object('definition_id',def.id,p_field,p_value)),p_actor);
 END IF;
END $$;

CREATE FUNCTION erp_private.f07_dms_apply(p_action text,p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
<<op>>
DECLARE actor bigint:=public.current_user_profile_id(); d public.dms_documents; r public.dms_ai_erp_apply_runs;
 review erp_private.f07_dms_reviews; item public.dms_ai_erp_apply_items; evidence erp_private.f07_dms_item_values;
 correction erp_private.f07_dms_corrections; p public.dms_ai_erp_apply_correction_proposals;
 j jsonb; source jsonb; items jsonb:='[]'; value jsonb; old jsonb; snapshot text; key uuid; h text; runid bigint; itemid bigint; proposalid bigint;
 receipt jsonb; confirmed bigint[]; total integer; applied integer:=0; skipped integer:=0; mode text; source_args jsonb; col text;
BEGIN
 IF auth.uid() IS NULL OR NOT erp_private.business_principal_is_active() OR actor IS NULL THEN RAISE EXCEPTION 'Permission denied' USING ERRCODE='42501'; END IF;
 IF p_action IS NULL OR p_action NOT IN ('preview','prepare','apply','cancel','correction_source','correction_prepare','correction_apply','correction_cancel') OR jsonb_typeof(p_data) IS DISTINCT FROM 'object' OR octet_length(p_data::text)>1048576 THEN RAISE EXCEPTION 'Invalid reviewed operation' USING ERRCODE='22023'; END IF;
 IF p_action IN ('preview','prepare') THEN
  d:=erp_private.f07_apply_authority((p_data->>'documentId')::bigint);
  snapshot:=erp_private.f07_metadata_snapshot(d.id);
  IF jsonb_typeof(p_data->'items') IS DISTINCT FROM 'array' OR jsonb_array_length(p_data->'items') NOT BETWEEN 1 AND 50 OR
   (SELECT count(*) FROM jsonb_array_elements(p_data->'items'))<>(SELECT count(DISTINCT (x->>'targetTable',x->>'targetField',x->>'targetRecordId')) FROM jsonb_array_elements(p_data->'items') x) THEN RAISE EXCEPTION 'Invalid or duplicate target fields' USING ERRCODE='22023'; END IF;
  IF p_action='prepare' THEN
   key:=(p_data->>'requestId')::uuid;h:=encode(sha256(convert_to(p_data::text,'UTF8')),'hex');
   IF key IS NULL THEN RAISE EXCEPTION 'Retain request identity' USING ERRCODE='22023'; END IF;
   SELECT * INTO review FROM erp_private.f07_dms_reviews WHERE f07_dms_reviews.actor=op.actor AND request_id=key FOR UPDATE;
   IF FOUND THEN IF review.payload_hash<>h OR review.document_id<>d.id THEN RAISE EXCEPTION 'Request reused' USING ERRCODE='PT409'; END IF;RETURN review.prepared; END IF;
   d:=erp_private.f07_metadata_authority(d.id,true);
   IF p_data->>'snapshot' IS DISTINCT FROM snapshot THEN RAISE EXCEPTION 'Reviewed target or metadata schema changed' USING ERRCODE='PT409'; END IF;
   INSERT INTO public.dms_ai_erp_apply_runs(run_code,source_type,source_id,document_id,status,target_module,target_table,target_record_id,requested_by)
   VALUES('APPLY-'||key,(p_data->'items'->0->>'sourceType'),(p_data->'items'->0->>'sourceId')::bigint,d.id,'pending',CASE WHEN p_data->'items'->0->>'targetTable'='dms_documents' THEN 'dms_document' ELSE 'dms_metadata' END,p_data->'items'->0->>'targetTable',d.id,actor) RETURNING id INTO runid;
  END IF;
  FOR j IN SELECT x FROM jsonb_array_elements(p_data->'items') x LOOP
   source:=erp_private.f07_source_value(d.id,j);value:=source->'value';old:=erp_private.f07_target(d.id,j->>'targetTable',j->>'targetField',(j->>'targetRecordId')::bigint);
   IF p_action='prepare' THEN
    IF j->>'proposedValue' IS DISTINCT FROM (value#>>'{}') THEN RAISE EXCEPTION 'Reviewed full source value changed' USING ERRCODE='PT409'; END IF;
    INSERT INTO public.dms_ai_erp_apply_items(apply_run_id,source_type,source_id,source_field_code,target_table,target_field,target_record_id,target_display_label,current_value_summary,proposed_value_summary,value_type)
    VALUES(runid,j->>'sourceType',(j->>'sourceId')::bigint,j->>'sourceFieldCode',j->>'targetTable',j->>'targetField',(j->>'targetRecordId')::bigint,left(j->>'targetField',200),left(old#>>'{}',200),left(value#>>'{}',200),source->>'valueType') RETURNING id INTO itemid;
    INSERT INTO erp_private.f07_dms_item_values(item_id,before_value,proposed_value,source_fingerprint) VALUES(itemid,old,value,source->>'fingerprint');
   ELSE
    items:=items||jsonb_build_array(j||jsonb_build_object('proposedValue',value#>>'{}','valueType',source->>'valueType','currentValue',old#>>'{}','currentValueSummary',left(old#>>'{}',200),'proposedValueSummary',left(value#>>'{}',200),'conflictRisk',old IS NOT NULL AND old<>'null'::jsonb));
   END IF;
  END LOOP;
  IF p_action='preview' THEN RETURN jsonb_build_object('documentId',d.id,'snapshot',snapshot,'items',items); END IF;
  receipt:=jsonb_build_object('runId',runid,'runCode','APPLY-'||key);
  INSERT INTO erp_private.f07_dms_reviews(run_id,actor,request_id,payload_hash,document_id,snapshot,prepared) VALUES(runid,actor,key,h,d.id,snapshot,receipt);
  INSERT INTO public.audit_logs(actor_user_profile_id,module_code,entity_name,entity_id,action,new_values) VALUES(actor,'DMS','dms_ai_erp_apply_runs',runid,'dms_apply_to_erp_run_created',jsonb_build_object('documentId',d.id,'itemCount',jsonb_array_length(p_data->'items')));
  RETURN receipt;
 END IF;
 IF p_action IN ('apply','cancel') THEN
  SELECT * INTO r FROM public.dms_ai_erp_apply_runs WHERE id=(p_data->>'runId')::bigint AND deleted_at IS NULL;
  IF NOT FOUND OR r.target_module='party' THEN RAISE EXCEPTION 'DMS reviewed run unavailable' USING ERRCODE='42501'; END IF;
  d:=erp_private.f07_apply_authority(r.document_id);
  SELECT * INTO review FROM erp_private.f07_dms_reviews WHERE run_id=r.id FOR UPDATE;
  IF NOT FOUND OR review.actor<>actor THEN RAISE EXCEPTION 'Create your own complete reviewed run; historical summaries cannot execute' USING ERRCODE='42501'; END IF;
  SELECT * INTO r FROM public.dms_ai_erp_apply_runs WHERE id=r.id FOR UPDATE;
  IF p_action='cancel' THEN
   IF r.status NOT IN ('pending','cancelled') THEN RAISE EXCEPTION 'Review already committed' USING ERRCODE='PT409'; END IF;
   IF r.status='pending' THEN UPDATE public.dms_ai_erp_apply_runs SET status='cancelled',cancelled_at=clock_timestamp() WHERE id=r.id;
    INSERT INTO public.audit_logs(actor_user_profile_id,module_code,entity_name,entity_id,action) VALUES(actor,'DMS','dms_ai_erp_apply_runs',r.id,'dms_apply_to_erp_run_cancelled'); END IF;
   RETURN jsonb_build_object('cancelled',true);
  END IF;
  IF p_data->'humanReviewConfirmed' IS DISTINCT FROM 'true'::jsonb OR jsonb_typeof(p_data->'confirmedItemIds') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Human confirmation required' USING ERRCODE='22023'; END IF;
  SELECT array_agg(x::bigint ORDER BY x::bigint) INTO confirmed FROM jsonb_array_elements_text(p_data->'confirmedItemIds') x;
  IF coalesce(cardinality(confirmed),0)=0 OR cardinality(confirmed)<>(SELECT count(DISTINCT x) FROM unnest(confirmed) x) OR EXISTS(SELECT 1 FROM unnest(confirmed) x WHERE NOT EXISTS(SELECT 1 FROM public.dms_ai_erp_apply_items i WHERE i.id=x AND i.apply_run_id=r.id)) THEN RAISE EXCEPTION 'Invalid confirmed selection' USING ERRCODE='22023'; END IF;
  IF review.receipt IS NOT NULL THEN IF review.confirmation<>p_data THEN RAISE EXCEPTION 'Committed selection differs' USING ERRCODE='PT409'; END IF;RETURN review.receipt; END IF;
  d:=erp_private.f07_metadata_authority(d.id,true);
  IF r.status<>'pending' OR review.snapshot<>erp_private.f07_metadata_snapshot(d.id) THEN RAISE EXCEPTION 'Reviewed document changed' USING ERRCODE='PT409'; END IF;
  FOR item IN SELECT * FROM public.dms_ai_erp_apply_items WHERE apply_run_id=r.id ORDER BY id FOR UPDATE LOOP
   SELECT * INTO evidence FROM erp_private.f07_dms_item_values WHERE item_id=item.id;
   IF item.id=ANY(confirmed) THEN
    source_args:=jsonb_build_object('sourceType',item.source_type,'sourceId',item.source_id,'sourceFieldCode',item.source_field_code,'targetTable',item.target_table,'targetField',item.target_field,'targetRecordId',item.target_record_id);
    source:=erp_private.f07_source_value(d.id,source_args);
    IF source->>'fingerprint'<>evidence.source_fingerprint OR source->'value'<>evidence.proposed_value THEN RAISE EXCEPTION 'Reviewed source was changed or superseded' USING ERRCODE='PT409'; END IF;
    IF evidence.before_value IS NOT NULL AND evidence.before_value<>'null'::jsonb AND p_data->'replaceExistingConfirmed' IS DISTINCT FROM 'true'::jsonb THEN RAISE EXCEPTION 'Replacement confirmation required' USING ERRCODE='22023'; END IF;
    PERFORM erp_private.f07_write_target(d.id,item.target_table,item.target_field,item.target_record_id,evidence.proposed_value,actor);
    UPDATE public.dms_ai_erp_apply_items SET status='applied',applied_value_summary=left(evidence.proposed_value#>>'{}',200),applied_by=actor,applied_at=clock_timestamp(),confirmed=true WHERE id=item.id;
    UPDATE erp_private.f07_dms_item_values SET applied_value=evidence.proposed_value WHERE item_id=item.id;applied:=applied+1;
   ELSE UPDATE public.dms_ai_erp_apply_items SET status='skipped',skip_reason='Not selected by reviewer' WHERE id=item.id;skipped:=skipped+1; END IF;
   items:=items||jsonb_build_array(jsonb_build_object('itemId',item.id,'targetTable',item.target_table,'targetField',item.target_field,'targetRecordId',item.target_record_id,'status',CASE WHEN item.id=ANY(confirmed) THEN 'applied' ELSE 'skipped' END,'appliedValueSummary',CASE WHEN item.id=ANY(confirmed) THEN left(evidence.proposed_value#>>'{}',200) END,'skipReason',CASE WHEN NOT item.id=ANY(confirmed) THEN 'Not selected by reviewer' END,'failureReason',NULL));
  END LOOP;
  UPDATE public.dms_ai_erp_apply_runs SET status=CASE WHEN skipped=0 THEN 'completed' ELSE 'completed_with_warnings' END,confirmed_by=actor,started_at=clock_timestamp(),completed_at=clock_timestamp(),updated_at=clock_timestamp() WHERE id=r.id;
  receipt:=jsonb_build_object('runId',r.id,'runCode',r.run_code,'status',CASE WHEN skipped=0 THEN 'completed' ELSE 'completed_with_warnings' END,'appliedCount',applied,'skippedCount',skipped,'conflictCount',0,'failedCount',0,'items',items,'errorMessage',NULL);
  UPDATE erp_private.f07_dms_reviews SET confirmation=p_data,receipt=op.receipt WHERE run_id=r.id;
  INSERT INTO public.dms_document_events(document_id,event_type,description,performed_by) VALUES(d.id,'erp_apply_completed','Reviewed ERP update committed',actor);
  INSERT INTO public.audit_logs(actor_user_profile_id,module_code,entity_name,entity_id,action,new_values) VALUES(actor,'DMS','dms_ai_erp_apply_runs',r.id,'dms_apply_to_erp_run_completed',jsonb_build_object('appliedCount',applied,'skippedCount',skipped));
  RETURN receipt;
 END IF;
 IF p_action IN ('correction_source','correction_prepare') THEN
  SELECT * INTO item FROM public.dms_ai_erp_apply_items WHERE id=(p_data->>'originalApplyItemId')::bigint AND status='applied';
  IF NOT FOUND OR item.target_table NOT IN ('dms_documents','dms_document_metadata_values') THEN RAISE EXCEPTION 'Applied DMS item unavailable' USING ERRCODE='42501'; END IF;
  SELECT * INTO r FROM public.dms_ai_erp_apply_runs WHERE id=item.apply_run_id AND deleted_at IS NULL;
  d:=erp_private.f07_apply_authority(r.document_id,true);snapshot:=erp_private.f07_metadata_snapshot(d.id);
  old:=erp_private.f07_target(d.id,item.target_table,item.target_field,item.target_record_id);
  SELECT * INTO evidence FROM erp_private.f07_dms_item_values WHERE item_id=item.id;
  IF p_action='correction_source' THEN
   RETURN jsonb_build_object('originalApplyItemId',item.id,'originalApplyRunId',r.id,'documentId',d.id,'targetModule',r.target_module,'targetTable',item.target_table,'targetField',item.target_field,'targetRecordId',item.target_record_id,'targetDisplayLabel',item.target_display_label,'valueType',item.value_type,'originalBeforeSummary',item.current_value_summary,'originalAppliedSummary',item.applied_value_summary,'currentValue',old#>>'{}','currentValueSummary',left(old#>>'{}',200),'restorePreviousEnabled',evidence.item_id IS NOT NULL AND evidence.before_value IS NOT NULL AND evidence.before_value<>'null'::jsonb,'restorePreviousWarning',CASE WHEN evidence.item_id IS NULL THEN 'Historical summaries cannot reconstruct the original. Enter and review a manual correction.' END,'originalBeforeValue',evidence.before_value#>>'{}','originalAppliedValue',evidence.applied_value#>>'{}','reapplyAvailable',evidence.applied_value IS NOT NULL,'reviewedSnapshot',snapshot);
  END IF;
  IF NOT (erp_private.document_permission(d.id,'dms.apply_correction.create') OR erp_private.document_permission(d.id,'dms.admin')) THEN RAISE EXCEPTION 'Correction creation denied' USING ERRCODE='42501'; END IF;
  key:=(p_data->>'requestId')::uuid;h:=encode(sha256(convert_to(p_data::text,'UTF8')),'hex');
  IF key IS NULL THEN RAISE EXCEPTION 'Retain correction request identity' USING ERRCODE='22023'; END IF;
  SELECT * INTO correction FROM erp_private.f07_dms_corrections WHERE f07_dms_corrections.actor=op.actor AND request_id=key;
  IF FOUND THEN IF correction.payload_hash<>h THEN RAISE EXCEPTION 'Correction request reused' USING ERRCODE='PT409'; END IF; RETURN jsonb_build_object('proposalId',correction.proposal_id,'status','draft'); END IF;
  d:=erp_private.f07_metadata_authority(d.id,true);
  IF p_data->>'snapshot' IS DISTINCT FROM snapshot THEN RAISE EXCEPTION 'Correction review changed' USING ERRCODE='PT409'; END IF;
  mode:=p_data->>'mode';
  IF mode='restore_previous' THEN value:=evidence.before_value;
   IF NOT EXISTS(SELECT 1 FROM public.erp_ai_feature_flags WHERE feature_code='DMS_AI_APPLY_CORRECTION_RESTORE_PREVIOUS' AND is_enabled) THEN RAISE EXCEPTION 'Previous-value correction disabled' USING ERRCODE='42501'; END IF;
  ELSIF mode='reapply_ai_value' THEN value:=evidence.applied_value;
  ELSIF mode='manual' THEN value:=to_jsonb(p_data->>'value');
   IF item.value_type IN ('number','bigint') THEN IF p_data->>'value' !~ '^-?[0-9]+(\.[0-9]+)?$' THEN RAISE EXCEPTION 'Invalid numeric correction' USING ERRCODE='22023'; END IF; value:=to_jsonb((p_data->>'value')::numeric);
   ELSIF item.value_type='boolean' THEN IF p_data->>'value' NOT IN ('true','false') THEN RAISE EXCEPTION 'Invalid boolean correction' USING ERRCODE='22023'; END IF;value:=to_jsonb((p_data->>'value')::boolean); END IF;
  ELSE RAISE EXCEPTION 'Invalid correction mode' USING ERRCODE='22023'; END IF;
  IF value IS NULL OR value='null'::jsonb OR jsonb_typeof(value) NOT IN ('string','number','boolean') OR btrim(value#>>'{}')='' OR length(value#>>'{}')>16000 THEN RAISE EXCEPTION 'Full correction value unavailable' USING ERRCODE='22023'; END IF;
  INSERT INTO public.dms_ai_erp_apply_correction_proposals(proposal_code,original_apply_run_id,original_apply_item_id,document_id,target_module,target_table,target_field,target_record_id,value_type,original_before_summary,original_applied_summary,current_value_summary,proposed_correction_summary,correction_mode,status,requested_by)
   VALUES('CORR-'||key,r.id,item.id,d.id,r.target_module,item.target_table,item.target_field,item.target_record_id,item.value_type,item.current_value_summary,item.applied_value_summary,left(old#>>'{}',200),left(value#>>'{}',200),mode,'draft',actor) RETURNING id INTO proposalid;
  INSERT INTO erp_private.f07_dms_corrections(proposal_id,actor,request_id,payload_hash,document_id,snapshot,before_value,value) VALUES(proposalid,actor,key,h,d.id,snapshot,old,value);
  INSERT INTO public.audit_logs(actor_user_profile_id,module_code,entity_name,entity_id,action) VALUES(actor,'DMS','dms_ai_erp_apply_correction_proposals',proposalid,'dms_apply_correction_proposal_created');
  RETURN jsonb_build_object('proposalId',proposalid,'status','draft');
 END IF;
 SELECT * INTO p FROM public.dms_ai_erp_apply_correction_proposals WHERE id=(p_data->>'proposalId')::bigint;
 IF NOT FOUND OR p.target_table NOT IN ('dms_documents','dms_document_metadata_values') THEN RAISE EXCEPTION 'DMS correction unavailable' USING ERRCODE='42501'; END IF;
 d:=erp_private.f07_apply_authority(p.document_id,true);
 SELECT * INTO correction FROM erp_private.f07_dms_corrections WHERE proposal_id=p.id FOR UPDATE;
 IF NOT FOUND OR correction.actor<>actor THEN RAISE EXCEPTION 'Create your own complete correction review' USING ERRCODE='42501'; END IF;
 SELECT * INTO p FROM public.dms_ai_erp_apply_correction_proposals WHERE id=p.id FOR UPDATE;
 IF p_action='correction_cancel' THEN
  IF p.status NOT IN ('draft','cancelled') THEN RAISE EXCEPTION 'Correction already committed' USING ERRCODE='PT409'; END IF;
  IF p.status='draft' THEN UPDATE public.dms_ai_erp_apply_correction_proposals SET status='cancelled',cancelled_at=clock_timestamp() WHERE id=p.id;
   INSERT INTO public.audit_logs(actor_user_profile_id,module_code,entity_name,entity_id,action) VALUES(actor,'DMS','dms_ai_erp_apply_correction_proposals',p.id,'dms_apply_correction_cancelled'); END IF;
  RETURN jsonb_build_object('proposalId',p.id,'status','cancelled');
 END IF;
 IF NOT (erp_private.document_permission(d.id,'dms.apply_correction.run') OR erp_private.document_permission(d.id,'dms.admin')) THEN RAISE EXCEPTION 'Correction apply denied' USING ERRCODE='42501'; END IF;
 IF p_data->'humanReviewConfirmed' IS DISTINCT FROM 'true'::jsonb OR p_data->'replaceExistingConfirmed' IS DISTINCT FROM 'true'::jsonb THEN RAISE EXCEPTION 'Correction and replacement confirmation required' USING ERRCODE='22023'; END IF;
 IF correction.receipt IS NOT NULL THEN IF correction.confirmation<>p_data THEN RAISE EXCEPTION 'Committed correction differs' USING ERRCODE='PT409'; END IF; RETURN correction.receipt; END IF;
 d:=erp_private.f07_metadata_authority(d.id,true);
 IF p.status<>'draft' OR correction.snapshot<>erp_private.f07_metadata_snapshot(d.id) THEN RAISE EXCEPTION 'Correction target changed' USING ERRCODE='PT409'; END IF;
 PERFORM erp_private.f07_write_target(d.id,p.target_table,p.target_field,p.target_record_id,correction.value,actor);
 INSERT INTO public.dms_ai_erp_apply_runs(run_code,source_type,source_id,document_id,status,target_module,target_table,target_record_id,requested_by,confirmed_by,completed_at)
 VALUES('CORR-RUN-'||correction.request_id,'correction_proposal',p.id,d.id,'completed',p.target_module,p.target_table,p.target_record_id,actor,actor,clock_timestamp()) RETURNING id INTO runid;
 INSERT INTO public.dms_ai_erp_apply_items(apply_run_id,source_type,source_id,source_field_code,target_table,target_field,target_record_id,target_display_label,value_type,current_value_summary,proposed_value_summary,applied_value_summary,status,confirmed,applied_at,applied_by)
 VALUES(runid,'correction_proposal',p.id,p.target_field,p.target_table,p.target_field,p.target_record_id,'Reviewed correction',p.value_type,p.current_value_summary,p.proposed_correction_summary,p.proposed_correction_summary,'applied',true,clock_timestamp(),actor) RETURNING id INTO itemid;
 INSERT INTO erp_private.f07_dms_item_values(item_id,before_value,proposed_value,applied_value,source_fingerprint) VALUES(itemid,correction.before_value,correction.value,correction.value,correction.snapshot);
 UPDATE public.dms_ai_erp_apply_correction_proposals SET status='applied',correction_apply_run_id=runid,confirmed_by=actor,applied_by=actor,confirmed_at=clock_timestamp(),applied_at=clock_timestamp(),updated_at=clock_timestamp() WHERE id=p.id;
 receipt:=jsonb_build_object('proposalId',p.id,'status','applied');
 UPDATE erp_private.f07_dms_corrections SET confirmation=p_data,receipt=op.receipt WHERE proposal_id=p.id;
 INSERT INTO public.dms_document_events(document_id,event_type,description,performed_by) VALUES(d.id,'erp_correction_applied','Reviewed ERP correction committed',actor);
 INSERT INTO public.audit_logs(actor_user_profile_id,module_code,entity_name,entity_id,action,new_values) VALUES(actor,'DMS','dms_ai_erp_apply_correction_proposals',p.id,'dms_apply_correction_applied',jsonb_build_object('runId',runid));
 RETURN receipt;
END $$;

CREATE FUNCTION public.f07_dms_apply(p_action text,p_data jsonb) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT erp_private.f07_dms_apply(p_action,p_data) $$;
REVOKE ALL ON FUNCTION erp_private.f07_apply_authority(bigint,boolean),erp_private.f07_target(bigint,text,text,bigint),erp_private.f07_source_value(bigint,jsonb),erp_private.f07_write_target(bigint,text,text,bigint,jsonb,bigint),erp_private.f07_dms_apply(text,jsonb),public.f07_dms_apply(text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION erp_private.f07_dms_apply(text,jsonb),public.f07_dms_apply(text,jsonb) TO authenticated;
COMMIT;
