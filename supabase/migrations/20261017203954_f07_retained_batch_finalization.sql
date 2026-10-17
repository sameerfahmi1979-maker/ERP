BEGIN;
SET LOCAL lock_timeout='5s';SET LOCAL statement_timeout='60s';
-- One original request per already-numbered draft. No historical backfill,
-- allocation, copied-object deletion, worker, or provider activation.
CREATE TABLE erp_private.f07_batch_finalizations(
 upload_session_id bigint PRIMARY KEY REFERENCES public.dms_upload_sessions(id),
 operation_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),actor_id bigint NOT NULL,
 request jsonb NOT NULL,payload jsonb NOT NULL,source jsonb NOT NULL,
 context_hash text NOT NULL,targets_hash text NOT NULL,analysis_hash text,review_fingerprint text NOT NULL,review_override boolean NOT NULL,
 approve_run_id bigint NOT NULL REFERENCES public.dms_approve_runs(id),
 object_id uuid,object_version text,object_updated_at timestamptz,content_sha256 text,
 receipt jsonb,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),completed_at timestamptz
);
ALTER TABLE erp_private.f07_batch_finalizations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON erp_private.f07_batch_finalizations FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION erp_private.f07_batch_finalization_authority(p_session bigint) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s public.dms_upload_sessions;d public.dms_documents;edit_witnesses jsonb;
BEGIN
 SELECT * INTO s FROM public.dms_upload_sessions WHERE id=p_session AND deleted_at IS NULL;
 SELECT * INTO d FROM public.dms_documents WHERE id=s.document_id AND deleted_at IS NULL;
 IF d.id IS NULL OR NOT public.f03_has_document_permission(d.id,'dms.documents.edit') THEN RAISE EXCEPTION 'Batch edit unavailable' USING ERRCODE='42501';END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(w)),'[]') INTO edit_witnesses FROM (
  SELECT ur.id assignment,r.id role,rp.id pair,p.id permission,ur.owner_company_id company,ur.branch_id branch,
   r.role_code IN ('system_admin','group_admin') AND ur.owner_company_id IS NULL AND ur.branch_id IS NULL global_admin
  FROM public.user_roles ur JOIN public.roles r ON r.id=ur.role_id AND r.is_active
  LEFT JOIN public.role_permissions rp ON rp.role_id=r.id LEFT JOIN public.permissions p ON p.id=rp.permission_id AND p.is_active
  WHERE ur.user_profile_id=public.current_user_profile_id() AND ur.is_active AND
   (r.role_code IN ('system_admin','group_admin') AND ur.owner_company_id IS NULL AND ur.branch_id IS NULL OR
    p.permission_code IN ('dms.documents.edit','dms.admin') AND
    (ur.owner_company_id IS NULL AND ur.branch_id IS NULL OR ur.owner_company_id=d.owning_company_id AND (ur.branch_id IS NULL OR ur.branch_id=d.owning_branch_id)))
 ) w;
 PERFORM erp_private.f07_lock_intake_review_authority(p_session);
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(edit_witnesses) w
  JOIN public.user_roles ur ON ur.id=(w->>'assignment')::bigint AND ur.user_profile_id=public.current_user_profile_id() AND ur.is_active
  JOIN public.roles r ON r.id=(w->>'role')::bigint AND ur.role_id=r.id AND r.is_active
  LEFT JOIN public.role_permissions rp ON rp.id=(w->>'pair')::bigint AND rp.role_id=r.id
  LEFT JOIN public.permissions p ON p.id=(w->>'permission')::bigint AND rp.permission_id=p.id AND p.is_active
  WHERE ur.owner_company_id IS NOT DISTINCT FROM (w->>'company')::bigint AND ur.branch_id IS NOT DISTINCT FROM (w->>'branch')::bigint AND
   ((w->>'global_admin')::boolean AND r.role_code IN ('system_admin','group_admin') OR p.permission_code IN ('dms.documents.edit','dms.admin'))) THEN
  RAISE EXCEPTION 'Original edit authority changed' USING ERRCODE='42501';END IF;
 SELECT * INTO s FROM public.dms_upload_sessions WHERE id=p_session AND deleted_at IS NULL;
 SELECT * INTO d FROM public.dms_documents WHERE id=s.document_id AND deleted_at IS NULL;
 IF s.id IS NULL OR d.id IS NULL OR NOT erp_private.f07_upload_subject_allowed(s.id) OR
  ROW(s.owning_company_id,s.owning_branch_id) IS DISTINCT FROM ROW(d.owning_company_id,d.owning_branch_id) OR
  d.is_archived OR NOT public.f03_has_document_permission(d.id,'dms.documents.upload') OR
  NOT public.f03_has_document_permission(d.id,'dms.documents.edit') OR
  NOT public.f03_has_document_permission(d.id,'dms.documents.preview') OR
  NOT public.f03_has_document_permission(d.id,'dms.documents.review_ai') THEN
  RAISE EXCEPTION 'Batch finalization unavailable' USING ERRCODE='42501';END IF;
 RETURN d.id;
END $$;

CREATE FUNCTION erp_private.f07_batch_finalization_context(p_document bigint,p_type bigint) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT encode(sha256(convert_to(jsonb_build_object('document',to_jsonb(d),
  'type',(SELECT to_jsonb(t) FROM public.dms_document_types t WHERE t.id=p_type),
  'definitions',(SELECT coalesce(jsonb_agg(to_jsonb(m) ORDER BY m.id),'[]') FROM public.dms_metadata_definitions m WHERE m.document_type_id=p_type),
  'metadata',(SELECT coalesce(jsonb_agg(to_jsonb(m) ORDER BY m.id),'[]') FROM public.dms_document_metadata_values m WHERE m.document_id=d.id),
  'links',(SELECT coalesce(jsonb_agg(to_jsonb(l) ORDER BY l.id),'[]') FROM public.dms_document_links l WHERE l.document_id=d.id),
  'tags',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.tag_id),'[]') FROM public.dms_document_tags t WHERE t.document_id=d.id),
  'versions',(SELECT coalesce(jsonb_agg(to_jsonb(v) ORDER BY v.id),'[]') FROM public.dms_document_versions v WHERE v.document_id=d.id),
  'files',(SELECT coalesce(jsonb_agg(to_jsonb(f) ORDER BY f.id),'[]') FROM public.dms_document_files f WHERE f.document_id=d.id)
 )::text,'UTF8')),'hex') FROM public.dms_documents d WHERE d.id=p_document
$$;

CREATE FUNCTION erp_private.f07_batch_finalization_targets(p_request jsonb) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE x record;target_table text;target_value jsonb;values_json jsonb:='[]';
BEGIN
 -- Stable master-data order, matching the numbered consumer's organization →
 -- HR → Party order. These private locks grant no caller read/write access.
 FOR x IN SELECT * FROM (SELECT DISTINCT kind,id FROM (
  SELECT value->>'entityType' kind,(value->>'entityId')::bigint id FROM jsonb_array_elements(p_request->'links')
  UNION ALL SELECT 'company',(p_request->>'owningCompanyId')::bigint
  UNION ALL SELECT 'branch',(p_request->>'owningBranchId')::bigint
  UNION ALL SELECT 'party',(p_request->>'partyId')::bigint
 ) q WHERE id IS NOT NULL) targets ORDER BY CASE WHEN kind='company' THEN 0 WHEN kind='branch' THEN 1
  WHEN kind IN ('employee','employee_compliance','employee_contract','employee_leave_request') THEN 2
  WHEN kind='employee_dependent' THEN 3 WHEN kind='party' THEN 4 ELSE 5 END,kind,id LOOP
  SELECT t INTO target_table FROM (VALUES('company','owner_companies'),('branch','branches'),('party','parties'),('party_license','party_licenses'),
   ('party_tax_registration','party_tax_registrations'),('bank','banks'),('site','work_sites'),('employee','employees'),('employee_compliance','employees'),
   ('employee_contract','employees'),('employee_leave_request','employees'),('employee_dependent','employee_dependents'),('employee_identity_document','employee_identity_documents')) a(k,t) WHERE k=x.kind;
  IF target_table IS NULL THEN RAISE EXCEPTION 'Unreviewed linked target mapping' USING ERRCODE='22023';END IF;
  EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE id=$1 FOR SHARE',target_table) INTO target_value USING x.id;
  IF target_value IS NULL THEN RAISE EXCEPTION 'Original linked target unavailable' USING ERRCODE='23503';END IF;
  values_json:=values_json||jsonb_build_array(jsonb_build_object('type',x.kind,'id',x.id,'value',target_value));
 END LOOP;
 PERFORM id FROM public.dms_document_types WHERE id=(p_request->>'documentTypeId')::bigint FOR SHARE;
 PERFORM id FROM public.dms_metadata_definitions WHERE document_type_id=(p_request->>'documentTypeId')::bigint ORDER BY id FOR SHARE;
 PERFORM t.id FROM public.dms_tags t JOIN jsonb_array_elements(p_request->'tagIds') v ON t.id=v::text::bigint ORDER BY t.id FOR SHARE OF t;
 RETURN encode(sha256(convert_to(values_json::text,'UTF8')),'hex');
END $$;

CREATE FUNCTION erp_private.f07_retain_batch_finalization(p_request jsonb,p_name text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE sid bigint:=(p_request->>'uploadSessionId')::bigint;actor bigint:=public.current_user_profile_id();
 s public.dms_upload_sessions;d public.dms_documents;t public.dms_document_types;f public.dms_document_files;
 proof erp_private.f07_intake_sources;plan erp_private.f07_batch_finalizations;
 run_id bigint;op uuid:=gen_random_uuid();payload jsonb;path text;make_version boolean;ext text;review jsonb;analysis_hash text;targets_hash text;
BEGIN
 PERFORM erp_private.validate_ai_approval_request(p_request,false);
 IF p_request ? 'prepared' THEN RAISE EXCEPTION 'Batch finalization cannot allocate a new document' USING ERRCODE='22023';END IF;
 PERFORM erp_private.f07_batch_finalization_authority(sid);
 PERFORM 1 FROM public.dms_upload_sessions WHERE id=sid FOR UPDATE;
 SELECT * INTO s FROM public.dms_upload_sessions WHERE id=sid;
 PERFORM 1 FROM public.dms_documents WHERE id=s.document_id FOR UPDATE;
 SELECT * INTO d FROM public.dms_documents WHERE id=s.document_id;
 SELECT * INTO plan FROM erp_private.f07_batch_finalizations WHERE upload_session_id=sid FOR UPDATE;
 IF FOUND THEN
  IF plan.actor_id IS DISTINCT FROM actor THEN RAISE EXCEPTION 'Original finalization belongs to another reviewer' USING ERRCODE='42501';END IF;
  IF plan.request IS DISTINCT FROM p_request THEN RAISE EXCEPTION 'Retry the original retained finalization request' USING ERRCODE='PT409';END IF;
  IF plan.receipt IS NOT NULL THEN RETURN jsonb_build_object('operationId',plan.operation_id,'actorId',actor,'authSessionId',auth.jwt()->>'session_id','request',plan.request,'source',plan.source,'payload',plan.payload,'receipt',plan.receipt);END IF;
  IF plan.targets_hash IS DISTINCT FROM erp_private.f07_batch_finalization_targets(p_request) THEN RAISE EXCEPTION 'Original linked targets changed' USING ERRCODE='PT409';END IF;
  IF d.status IS DISTINCT FROM 'pending_ai_review' OR plan.context_hash IS DISTINCT FROM erp_private.f07_batch_finalization_context(d.id,(plan.payload->>'document_type_id')::bigint) OR
   plan.source IS DISTINCT FROM erp_private.f07_intake_source(sid) THEN RAISE EXCEPTION 'Original draft or source changed; retain for reconciliation' USING ERRCODE='PT409';END IF;
  PERFORM erp_private.f07_assert_intake_review(sid,(plan.payload->>'document_type_id')::bigint,(plan.payload->>'expiry_date')::date);
  RETURN jsonb_build_object('operationId',plan.operation_id,'actorId',actor,'authSessionId',auth.jwt()->>'session_id','request',plan.request,'source',plan.source,'payload',plan.payload,'receipt',NULL);
 END IF;
 -- Only a genuine consumed F06 batch-draft reference is eligible. Older,
 -- unproven bindings are not guessed or upgraded by a save attempt.
 IF s.batch_id IS NULL OR s.batch_draft_operation_id IS NULL OR d.status IS DISTINCT FROM 'pending_ai_review' OR
  NOT EXISTS(SELECT 1 FROM public.global_numbering_generated_references r JOIN erp_private.numbering_requests n ON n.reference_id=r.id
   WHERE n.operation_id=s.batch_draft_operation_id AND n.actor_id=s.uploaded_by
   AND r.target_table_name='dms_documents' AND r.target_record_id=d.id AND r.generated_reference_number=d.document_no
   AND r.generation_status='consumed' AND r.generation_reason LIKE 'F06 batch draft creation %') THEN
  RAISE EXCEPTION 'Draft provenance requires reconciliation before finalization' USING ERRCODE='PT409';END IF;
 IF ROW((p_request->>'owningCompanyId')::bigint,(p_request->>'owningBranchId')::bigint) IS DISTINCT FROM ROW(d.owning_company_id,d.owning_branch_id) THEN
  RAISE EXCEPTION 'Finalization cannot rebase the original draft scope' USING ERRCODE='PT409';END IF;
 SELECT * INTO t FROM public.dms_document_types WHERE id=(p_request->>'documentTypeId')::bigint AND is_active FOR SHARE;
 IF NOT FOUND OR (t.requires_expiry_tracking AND nullif(p_request->>'expiryDate','') IS NULL) OR
  coalesce(length(btrim(p_name)),0) NOT BETWEEN 1 AND 200 OR p_name ~ E'[\\/\r\n]' THEN RAISE EXCEPTION 'Complete the document type, expiry and file name' USING ERRCODE='22023';END IF;
 PERFORM erp_private.f07_assert_intake_review(sid,t.id,nullif(p_request->>'expiryDate','')::date);
 targets_hash:=erp_private.f07_batch_finalization_targets(p_request);
 review:=erp_private.f07_intake_review_snapshot(sid,t.id,nullif(p_request->>'expiryDate','')::date);
 SELECT erp_private.f07_intake_analysis_digest(a) INTO analysis_hash FROM public.dms_ai_extraction_results a WHERE a.id=s.ai_result_id;
 SELECT * INTO proof FROM erp_private.f07_intake_sources WHERE upload_session_id=sid;
 IF NOT FOUND THEN RAISE EXCEPTION 'Verified original bytes required' USING ERRCODE='PT409';END IF;
 IF (p_request->>'aiResultId')::bigint IS DISTINCT FROM s.ai_result_id THEN RAISE EXCEPTION 'Analysis identity changed' USING ERRCODE='PT409';END IF;
 IF s.is_duplicate AND NOT coalesce((p_request->>'allowDuplicate')::boolean,false) THEN RAISE EXCEPTION 'Review the duplicate before finalization' USING ERRCODE='PT409';END IF;
 make_version:=d.current_version_id IS NULL;
 IF make_version THEN
  IF EXISTS(SELECT 1 FROM public.dms_document_files WHERE document_id=d.id AND deleted_at IS NULL) OR
   EXISTS(SELECT 1 FROM public.dms_document_versions WHERE document_id=d.id) THEN RAISE EXCEPTION 'Existing file history requires reconciliation' USING ERRCODE='PT409';END IF;
  ext:=lower(substring(s.original_filename FROM '\.([A-Za-z0-9]+)$'));
  IF ext IS NULL OR t.type_code !~ '^[A-Za-z0-9_-]+$' THEN RAISE EXCEPTION 'Invalid final storage identity' USING ERRCODE='22023';END IF;
  path:=coalesce(d.owning_company_id,0)||'/'||extract(year FROM clock_timestamp() AT TIME ZONE 'UTC')::int||'/'||t.type_code||'/'||d.id||'/v1/original.'||ext;
 ELSE
  SELECT x.* INTO f FROM public.dms_document_files x JOIN public.dms_document_versions v ON v.id=x.version_id
   WHERE x.document_id=d.id AND v.document_id=d.id AND v.id=d.current_version_id AND v.is_current AND x.file_role='original' AND x.deleted_at IS NULL;
  IF NOT FOUND OR f.storage_bucket IS DISTINCT FROM 'dms-documents' OR f.sha256_hash IS DISTINCT FROM proof.sha256 OR
   f.file_size_bytes IS DISTINCT FROM s.file_size_bytes OR f.mime_type IS DISTINCT FROM s.mime_type THEN
   RAISE EXCEPTION 'Existing original is not the verified intake file' USING ERRCODE='PT409';END IF;
  path:=f.storage_path;
 END IF;
 INSERT INTO public.dms_approve_runs(upload_session_id,document_id,ai_result_id,run_key,status,stage,started_by)
 VALUES(sid,d.id,s.ai_result_id,'f07-batch:'||op,'started','retained_original_request',actor) RETURNING id INTO run_id;
 payload:=jsonb_build_object('mode','existing_batch_draft','upload_session_id',sid,'approve_run_id',run_id,'ai_result_id',s.ai_result_id,
  'document_id',d.id,'document_no',d.document_no,'title',p_request->>'title','description',p_request->'description',
  'document_type_id',t.id,'category_id',t.category_id,'confidentiality_level',coalesce(p_request->>'confidentialityLevel',t.default_confidentiality,'internal'),
  'owning_company_id',d.owning_company_id,'owning_branch_id',d.owning_branch_id,'party_id',p_request->'partyId',
  'issue_date',nullif(p_request->>'issueDate',''),'expiry_date',nullif(p_request->>'expiryDate',''),
  'create_file_version',make_version,'file_id',f.id,'final_storage_bucket','dms-documents','final_storage_path',path,
  'file_name',p_name,'mime_type',s.mime_type,'file_size_bytes',s.file_size_bytes,'sha256_hash',proof.sha256,
  'version_number',1,'version_label','v1','change_notes','Created from AI batch intake',
  'metadata_values',erp_private.ai_approval_metadata(p_request),'tag_ids',p_request->'tagIds',
  'links',(SELECT coalesce(jsonb_agg(jsonb_build_object('entity_type',x->>'entityType','entity_id',(x->>'entityId')::bigint,
   'link_role',coalesce(x->>'linkRole','related'),'is_primary',coalesce((x->>'isPrimary')::boolean,false))),'[]') FROM jsonb_array_elements(p_request->'links') x),
  'reminders','[]'::jsonb);
 INSERT INTO erp_private.f07_batch_finalizations(upload_session_id,operation_id,actor_id,request,payload,source,context_hash,targets_hash,analysis_hash,review_fingerprint,review_override,approve_run_id)
 VALUES(sid,op,actor,p_request,payload,erp_private.f07_intake_source(sid),erp_private.f07_batch_finalization_context(d.id,t.id),targets_hash,analysis_hash,review->>'fingerprint',(review->>'requiresOverride')::boolean,run_id);
 RETURN jsonb_build_object('operationId',op,'actorId',actor,'authSessionId',auth.jwt()->>'session_id','request',p_request,'source',erp_private.f07_intake_source(sid),'payload',payload,'receipt',NULL);
END $$;

-- Caller-RLS checks are deliberately outside every DEFINER boundary. A
-- retained request is identity, never a substitute for current target access.
CREATE FUNCTION erp_private.f07_validate_batch_request(p_request jsonb) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE x jsonb;
BEGIN
 PERFORM erp_private.validate_ai_approval_request(p_request,false);
 PERFORM erp_private.ai_approval_metadata(p_request);
 FOR x IN SELECT value FROM jsonb_array_elements(p_request->'links') LOOP
  PERFORM erp_private.ai_approval_link_target(x->>'entityType',(x->>'entityId')::bigint);
 END LOOP;
 IF p_request->>'partyId' IS NOT NULL THEN PERFORM erp_private.ai_approval_link_target('party',(p_request->>'partyId')::bigint);END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_request->'tagIds') child(value) WHERE NOT EXISTS(
  SELECT 1 FROM public.dms_tags t WHERE t.id=child.value::text::bigint AND t.is_active AND t.deleted_at IS NULL)) THEN RAISE EXCEPTION 'Selected tag unavailable' USING ERRCODE='23503';END IF;
END $$;
CREATE FUNCTION public.f07_prepare_batch_finalization(p_request jsonb,p_name text) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 PERFORM erp_private.f07_validate_batch_request(p_request);
 result:=erp_private.f07_retain_batch_finalization(p_request,p_name);
 PERFORM erp_private.f07_validate_batch_request(p_request);
 RETURN result;
END $$;

CREATE FUNCTION public.f07_attest_batch_finalization(p_session bigint,p_operation uuid,p_actor bigint,p_auth_session uuid,
 p_object uuid,p_version text,p_updated timestamptz,p_sha256 text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE plan erp_private.f07_batch_finalizations;o storage.objects;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Trusted byte verifier required' USING ERRCODE='42501';END IF;
 IF NOT erp_private.provider_actor_session_valid(p_actor,p_auth_session) OR NOT EXISTS(
  SELECT 1 FROM public.user_profiles WHERE id=p_actor AND status='active' AND NOT must_change_password) THEN
  RAISE EXCEPTION 'Byte verification principal expired' USING ERRCODE='42501';END IF;
 SELECT * INTO plan FROM erp_private.f07_batch_finalizations WHERE upload_session_id=p_session AND operation_id=p_operation AND actor_id=p_actor FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Retained finalization unavailable' USING ERRCODE='PT409';END IF;
 IF plan.receipt IS NOT NULL THEN RETURN;END IF;
 SELECT * INTO o FROM storage.objects WHERE bucket_id='dms-documents' AND name=plan.payload->>'final_storage_path' FOR SHARE;
 IF o.id IS DISTINCT FROM p_object OR o.version IS DISTINCT FROM p_version OR date_trunc('milliseconds',o.updated_at) IS DISTINCT FROM p_updated OR
  p_sha256 IS DISTINCT FROM plan.payload->>'sha256_hash' OR (o.metadata->>'size')::bigint IS DISTINCT FROM (plan.payload->>'file_size_bytes')::bigint OR
  o.metadata->>'mimetype' IS DISTINCT FROM plan.payload->>'mime_type' THEN RAISE EXCEPTION 'Final file identity changed' USING ERRCODE='PT409';END IF;
 IF plan.object_id IS NOT NULL AND ROW(plan.object_id,plan.object_version,plan.object_updated_at,plan.content_sha256) IS DISTINCT FROM ROW(p_object,p_version,o.updated_at,p_sha256) THEN
  RAISE EXCEPTION 'Retained copy cannot be rebound' USING ERRCODE='PT409';END IF;
 UPDATE erp_private.f07_batch_finalizations SET object_id=p_object,object_version=p_version,object_updated_at=o.updated_at,content_sha256=p_sha256 WHERE upload_session_id=p_session;
END $$;

CREATE FUNCTION erp_private.f07_batch_finalization_guard(p_payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE sid bigint:=(p_payload->>'upload_session_id')::bigint;did bigint;plan erp_private.f07_batch_finalizations;o storage.objects;
BEGIN
 did:=erp_private.f07_batch_finalization_authority(sid);
 PERFORM 1 FROM public.dms_upload_sessions WHERE id=sid FOR UPDATE;
 PERFORM 1 FROM public.dms_documents WHERE id=did FOR UPDATE;
 SELECT * INTO plan FROM erp_private.f07_batch_finalizations WHERE upload_session_id=sid FOR UPDATE;
 IF NOT FOUND OR plan.actor_id IS DISTINCT FROM public.current_user_profile_id() THEN RAISE EXCEPTION 'Original finalization unavailable' USING ERRCODE='42501';END IF;
 IF plan.payload IS DISTINCT FROM p_payload THEN RAISE EXCEPTION 'Finalization payload differs from the retained request' USING ERRCODE='PT409';END IF;
 IF plan.receipt IS NOT NULL THEN RETURN plan.receipt;END IF;
 IF plan.targets_hash IS DISTINCT FROM erp_private.f07_batch_finalization_targets(plan.request) THEN RAISE EXCEPTION 'Original linked targets changed' USING ERRCODE='PT409';END IF;
 IF plan.source IS DISTINCT FROM erp_private.f07_intake_source(sid) OR
  plan.context_hash IS DISTINCT FROM erp_private.f07_batch_finalization_context(did,(plan.payload->>'document_type_id')::bigint) THEN
  RAISE EXCEPTION 'Original finalization context changed' USING ERRCODE='PT409';END IF;
 PERFORM erp_private.f07_assert_intake_review(sid,(plan.payload->>'document_type_id')::bigint,(plan.payload->>'expiry_date')::date);
 SELECT * INTO o FROM storage.objects WHERE bucket_id='dms-documents' AND name=plan.payload->>'final_storage_path' FOR SHARE;
 IF plan.object_id IS NULL OR ROW(o.id,o.version,o.updated_at) IS DISTINCT FROM ROW(plan.object_id,plan.object_version,plan.object_updated_at) OR
  (o.metadata->>'size')::bigint IS DISTINCT FROM (plan.payload->>'file_size_bytes')::bigint OR o.metadata->>'mimetype' IS DISTINCT FROM plan.payload->>'mime_type' THEN
  RAISE EXCEPTION 'Verified final copy required' USING ERRCODE='PT409';END IF;
 RETURN NULL;
END $$;

CREATE FUNCTION erp_private.f07_batch_finalization_request(p_session bigint) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE plan erp_private.f07_batch_finalizations;
BEGIN
 PERFORM erp_private.f07_batch_finalization_authority(p_session);
 SELECT * INTO plan FROM erp_private.f07_batch_finalizations WHERE upload_session_id=p_session AND actor_id=public.current_user_profile_id();
 IF NOT FOUND THEN RETURN NULL;END IF;
 RETURN plan.request;
END $$;
CREATE FUNCTION public.f07_recover_batch_finalization(p_session bigint) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT erp_private.f07_batch_finalization_request(p_session) $$;

CREATE FUNCTION erp_private.f07_complete_batch_finalization(p_payload jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE plan erp_private.f07_batch_finalizations;d public.dms_documents;f public.dms_document_files;v_receipt jsonb;
 s public.dms_upload_sessions;proof erp_private.f07_intake_sources;original storage.objects;final_object storage.objects;current_analysis_hash text;x jsonb;
BEGIN
 SELECT * INTO plan FROM erp_private.f07_batch_finalizations WHERE upload_session_id=(p_payload->>'upload_session_id')::bigint FOR UPDATE;
 IF NOT FOUND OR plan.actor_id IS DISTINCT FROM public.current_user_profile_id() OR plan.payload IS DISTINCT FROM p_payload OR plan.receipt IS NOT NULL THEN
  RAISE EXCEPTION 'Completion identity unavailable' USING ERRCODE='PT409';END IF;
 PERFORM erp_private.f07_batch_finalization_authority(plan.upload_session_id);
 SELECT * INTO d FROM public.dms_documents WHERE id=(p_payload->>'document_id')::bigint;
 SELECT * INTO s FROM public.dms_upload_sessions WHERE id=plan.upload_session_id;
 SELECT * INTO proof FROM erp_private.f07_intake_sources WHERE upload_session_id=s.id;
 SELECT * INTO original FROM storage.objects WHERE bucket_id='dms-temp' AND name=s.temp_storage_path FOR SHARE;
 SELECT * INTO final_object FROM storage.objects WHERE bucket_id='dms-documents' AND name=p_payload->>'final_storage_path' FOR SHARE;
 SELECT erp_private.f07_intake_analysis_digest(a) INTO current_analysis_hash FROM public.dms_ai_extraction_results a WHERE a.id=s.ai_result_id;
 IF erp_private.f07_intake_source_row(s) IS DISTINCT FROM plan.source OR proof.upload_session_id IS NULL OR
  ROW(original.id,original.version,original.updated_at) IS DISTINCT FROM ROW(proof.object_id,proof.object_version,proof.object_updated_at) OR
  plan.object_id IS NULL OR ROW(final_object.id,final_object.version,final_object.updated_at) IS DISTINCT FROM ROW(plan.object_id,plan.object_version,plan.object_updated_at) OR
  plan.content_sha256 IS DISTINCT FROM proof.sha256 OR current_analysis_hash IS DISTINCT FROM plan.analysis_hash OR
  NOT EXISTS(SELECT 1 FROM erp_private.f07_intake_reviews r WHERE r.upload_session_id=s.id AND r.actor_id=plan.actor_id
   AND r.fingerprint=plan.review_fingerprint AND r.document_type_id=(p_payload->>'document_type_id')::bigint
   AND r.expiry_date IS NOT DISTINCT FROM (p_payload->>'expiry_date')::date AND
   (NOT plan.review_override OR r.review_mode='manual_override' AND erp_private.permission_in_scope('dms.admin',s.owning_company_id,s.owning_branch_id))) THEN
  RAISE EXCEPTION 'Exact reviewed source or trusted completion proof changed' USING ERRCODE='PT409';END IF;
 SELECT x.* INTO f FROM public.dms_document_files x JOIN public.dms_document_versions v ON v.id=x.version_id
  WHERE x.document_id=d.id AND v.document_id=d.id AND v.id=d.current_version_id AND v.is_current AND x.file_role='original' AND x.deleted_at IS NULL;
 IF d.status IS DISTINCT FROM 'active' OR d.document_no IS DISTINCT FROM p_payload->>'document_no' OR d.title IS DISTINCT FROM p_payload->>'title' OR
  d.description IS DISTINCT FROM nullif(p_payload->>'description','') OR d.document_type_id IS DISTINCT FROM (p_payload->>'document_type_id')::bigint OR
  d.category_id IS DISTINCT FROM (p_payload->>'category_id')::bigint OR d.confidentiality_level IS DISTINCT FROM p_payload->>'confidentiality_level' OR
  ROW(d.owning_company_id,d.owning_branch_id,d.party_id,d.issue_date,d.expiry_date) IS DISTINCT FROM ROW((p_payload->>'owning_company_id')::bigint,(p_payload->>'owning_branch_id')::bigint,(p_payload->>'party_id')::bigint,(p_payload->>'issue_date')::date,(p_payload->>'expiry_date')::date) OR
  f.id IS NULL OR f.storage_bucket IS DISTINCT FROM 'dms-documents' OR f.storage_path IS DISTINCT FROM p_payload->>'final_storage_path' OR
  f.sha256_hash IS DISTINCT FROM p_payload->>'sha256_hash' OR f.mime_type IS DISTINCT FROM p_payload->>'mime_type' OR f.file_size_bytes IS DISTINCT FROM (p_payload->>'file_size_bytes')::bigint OR
  NOT EXISTS(SELECT 1 FROM public.dms_upload_sessions WHERE id=plan.upload_session_id AND document_id=d.id AND intake_status='approved' AND status='completed' AND approve_run_id=plan.approve_run_id AND reviewed_by=plan.actor_id) OR
  NOT EXISTS(SELECT 1 FROM public.dms_approve_runs WHERE id=plan.approve_run_id AND started_by=plan.actor_id AND document_id=d.id AND status='db_committed') OR
  NOT EXISTS(SELECT 1 FROM public.dms_document_events WHERE document_id=d.id AND performed_by=plan.actor_id AND event_type='approve_save_db_transaction_completed' AND (metadata_json->>'approve_run_id')::bigint=plan.approve_run_id) THEN
  RAISE EXCEPTION 'Atomic finalization facts incomplete' USING ERRCODE='PT409';END IF;
 IF s.ai_result_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.dms_ai_extraction_results a WHERE a.id=s.ai_result_id AND a.upload_session_id=s.id
  AND a.document_id=d.id AND a.ai_status='accepted' AND a.review_action='accepted' AND a.reviewed_by=plan.actor_id) THEN
  RAISE EXCEPTION 'Analysis completion facts incomplete' USING ERRCODE='PT409';END IF;
 FOR x IN SELECT value FROM jsonb_array_elements(p_payload->'metadata_values') LOOP
  IF NOT EXISTS(SELECT 1 FROM public.dms_document_metadata_values m WHERE m.document_id=d.id AND m.definition_id=(x->>'definition_id')::bigint AND m.deleted_at IS NULL
   AND jsonb_build_object('definition_id',m.definition_id,'value_text',m.value_text,'value_number',m.value_number,'value_date',m.value_date,'value_datetime',m.value_datetime,'value_boolean',m.value_boolean,'value_json',m.value_json)=x) THEN
   RAISE EXCEPTION 'Metadata completion facts incomplete' USING ERRCODE='PT409';END IF;
 END LOOP;
 FOR x IN SELECT value FROM jsonb_array_elements(p_payload->'tag_ids') LOOP
  IF NOT EXISTS(SELECT 1 FROM public.dms_document_tags WHERE document_id=d.id AND tag_id=x::text::bigint) THEN RAISE EXCEPTION 'Tag completion facts incomplete' USING ERRCODE='PT409';END IF;
 END LOOP;
 FOR x IN SELECT value FROM jsonb_array_elements(p_payload->'links') LOOP
  IF NOT EXISTS(SELECT 1 FROM public.dms_document_links l WHERE l.document_id=d.id AND l.entity_type=x->>'entity_type' AND l.entity_id=(x->>'entity_id')::bigint
   AND l.deleted_at IS NULL AND l.link_role=x->>'link_role' AND l.is_primary=(x->>'is_primary')::boolean) THEN RAISE EXCEPTION 'Link completion facts incomplete' USING ERRCODE='PT409';END IF;
 END LOOP;
 -- Existing schedules are not authority to rewrite or adopt custom reminders.
 IF EXISTS(SELECT 1 FROM public.dms_expiry_reminders WHERE document_id=d.id) THEN RAISE EXCEPTION 'Existing reminder schedule requires reconciliation' USING ERRCODE='PT409';END IF;
 IF d.expiry_date IS NOT NULL THEN
  INSERT INTO public.dms_expiry_reminders(document_id,reminder_days_before,reminder_date,status)
  SELECT d.id,n,d.expiry_date-n,'pending' FROM unnest(ARRAY[90,60,30,14,7,1]) n;
 END IF;
 v_receipt:=jsonb_build_object('documentId',d.id,'documentNo',d.document_no,'operationId',plan.operation_id,'approveRunId',plan.approve_run_id,'fileId',f.id,'completed',true);
 INSERT INTO public.audit_logs(actor_user_profile_id,module_code,entity_name,entity_id,entity_reference,action,new_values)
 VALUES(plan.actor_id,'DMS','dms_documents',d.id,d.document_no,'update',jsonb_build_object('event','retained_batch_finalization_completed','operation_id',plan.operation_id,'upload_session_id',plan.upload_session_id,'approve_run_id',plan.approve_run_id));
 UPDATE public.dms_approve_runs SET status='completed',stage='approve_save_completed',completed_at=clock_timestamp(),updated_at=clock_timestamp() WHERE id=plan.approve_run_id;
 UPDATE erp_private.f07_batch_finalizations SET receipt=v_receipt,completed_at=clock_timestamp() WHERE upload_session_id=plan.upload_session_id;
END $$;

-- Retrofit the existing atomic writer, rather than adding a second engine or
-- exposing an unwrapped core. Every direct call must have the retained plan,
-- caller-RLS validation, actual copy proof and same-transaction receipt.
DO $patch$
DECLARE original text;needle text;replacement text;start_at int;end_at int;
BEGIN
 SELECT pg_get_functiondef('public.approve_dms_ai_intake(jsonb)'::regprocedure) INTO original;
 original:=replace(original,' SECURITY DEFINER',' SECURITY INVOKER');
 needle:='  v_item JSONB;';replacement:=needle||E'\n  v_retained_receipt jsonb;\n  v_original_request jsonb;';
 IF (length(original)-length(replace(original,needle,'')))/length(needle)<>1 THEN RAISE EXCEPTION 'Batch writer declaration drift';END IF;
 original:=replace(original,needle,replacement);
 needle:=E'BEGIN\n  -- F06: only the retained batch-draft path';
 replacement:=E'BEGIN\n  v_original_request:=erp_private.f07_batch_finalization_request(v_upload_session_id);\n  IF v_original_request IS NULL THEN RAISE EXCEPTION ''Retained finalization required'' USING ERRCODE=''PT409'';END IF;\n  PERFORM erp_private.f07_validate_batch_request(v_original_request);\n  v_retained_receipt:=erp_private.f07_batch_finalization_guard(p_payload);\n  PERFORM erp_private.f07_validate_batch_request(v_original_request);\n  IF v_retained_receipt IS NOT NULL THEN\n   RETURN QUERY SELECT (v_retained_receipt->>''documentId'')::bigint,v_retained_receipt->>''documentNo'',''db_committed''::text;RETURN;\n  END IF;\n  -- F06: only the retained batch-draft path';
 IF (length(original)-length(replace(original,needle,'')))/length(needle)<>1 THEN RAISE EXCEPTION 'Batch writer admission drift';END IF;
 original:=replace(original,needle,replacement);
 -- The old OR/global authorization is superseded by independent scoped grants.
 start_at:=strpos(original,E'  IF NOT (\n    current_user_has_permission(''dms.documents.upload'')');
 end_at:=strpos(original,E'  IF v_upload_session_id IS NULL THEN');
 IF start_at=0 OR end_at<=start_at THEN RAISE EXCEPTION 'Batch writer authority drift';END IF;
 needle:=substring(original FROM start_at FOR end_at-start_at);
 original:=replace(original,needle,'  PERFORM erp_private.f07_batch_finalization_authority(v_upload_session_id);'||E'\n\n');
 start_at:=strpos(original,E'  FOR v_item IN\n    SELECT value FROM jsonb_array_elements(COALESCE(p_payload->''reminders''');
 end_at:=strpos(original,'  IF v_ai_result_id IS NOT NULL THEN');
 IF start_at=0 OR end_at<=start_at THEN RAISE EXCEPTION 'Batch reminder writer drift';END IF;
 needle:=substring(original FROM start_at FOR end_at-start_at);
 original:=replace(original,needle,'  -- Fixed automatic reminders are admitted only by atomic completion.'||E'\n\n');
 needle:='  RETURN QUERY SELECT v_document_id, v_document_no, ''db_committed''::TEXT;';
 IF (length(original)-length(replace(original,needle,'')))/length(needle)<>1 THEN RAISE EXCEPTION 'Batch completion boundary drift';END IF;
 original:=replace(original,needle,'  PERFORM erp_private.f07_complete_batch_finalization(p_payload);'||E'\n'||needle);
 EXECUTE original;
END $patch$;

REVOKE ALL ON FUNCTION erp_private.f07_batch_finalization_context(bigint,bigint) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION erp_private.f07_batch_finalization_targets(jsonb) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION erp_private.f07_batch_finalization_authority(bigint),erp_private.f07_retain_batch_finalization(jsonb,text),
 erp_private.f07_validate_batch_request(jsonb),erp_private.f07_batch_finalization_guard(jsonb),erp_private.f07_batch_finalization_request(bigint),
 erp_private.f07_complete_batch_finalization(jsonb),public.f07_prepare_batch_finalization(jsonb,text),public.f07_recover_batch_finalization(bigint)
 FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION erp_private.f07_batch_finalization_authority(bigint),erp_private.f07_retain_batch_finalization(jsonb,text),
 erp_private.f07_validate_batch_request(jsonb),erp_private.f07_batch_finalization_guard(jsonb),erp_private.f07_batch_finalization_request(bigint),
 erp_private.f07_complete_batch_finalization(jsonb),public.f07_prepare_batch_finalization(jsonb,text),public.f07_recover_batch_finalization(bigint) TO authenticated;
REVOKE ALL ON FUNCTION public.f07_attest_batch_finalization(bigint,uuid,bigint,uuid,uuid,text,timestamptz,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.f07_attest_batch_finalization(bigint,uuid,bigint,uuid,uuid,text,timestamptz,text) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
