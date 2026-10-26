BEGIN;
SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='60s';

-- Server-only discovery. The caller is a verified ERP server action, which
-- must revalidate the returned original request through the INVOKER preparation
-- RPC before returning any data. This RPC never reserves, approves or writes.
CREATE FUNCTION public.read_numbered_ai_intake_recovery(p_actor bigint,p_auth_session uuid,p_session bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE plan erp_private.ai_approval_plans;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' OR NOT erp_private.provider_actor_session_valid(p_actor,p_auth_session) THEN
  RAISE EXCEPTION 'Recovery identity unavailable' USING ERRCODE='42501'; END IF;
 SELECT * INTO plan FROM erp_private.ai_approval_plans WHERE upload_session_id=p_session;
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF plan.actor_id IS DISTINCT FROM p_actor OR EXISTS(SELECT 1 FROM erp_private.f07_intake_discard_receipts WHERE upload_session_id=p_session) THEN
  RAISE EXCEPTION 'Original approval unavailable' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('input',plan.request_json,'contract',jsonb_build_object('operationId',plan.operation_id,'revision',NULL),'receipt',plan.result);
END $$;
REVOKE ALL ON FUNCTION public.read_numbered_ai_intake_recovery(bigint,uuid,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.read_numbered_ai_intake_recovery(bigint,uuid,bigint) TO service_role;

-- Called only inside checked discard, while holding its original upload lock.
-- Keep the plan, number, run, copies and proof intact. Never reuse the number or
-- erase a possible commit. A successful discard receipt is the cancellation.
CREATE FUNCTION erp_private.f07_check_uncommitted_ai_discard(p_session bigint) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s public.dms_upload_sessions; plan erp_private.ai_approval_plans;
 r public.dms_approve_runs; n public.global_numbering_generated_references;
BEGIN
 SELECT * INTO s FROM public.dms_upload_sessions WHERE id=p_session FOR UPDATE NOWAIT;
 SELECT * INTO plan FROM erp_private.ai_approval_plans WHERE upload_session_id=p_session FOR UPDATE NOWAIT;
 IF NOT FOUND THEN RETURN false; END IF;
 IF auth.uid() IS NULL OR NOT erp_private.business_principal_is_active() OR
  plan.actor_id IS DISTINCT FROM public.current_user_profile_id() OR s.uploaded_by IS DISTINCT FROM plan.actor_id OR
  NOT erp_private.upload_session_permission(s.id,'dms.documents.upload') OR NOT erp_private.f07_upload_subject_allowed(s.id) THEN
  RAISE EXCEPTION 'Only the original authorized uploader may discard this approval' USING ERRCODE='42501'; END IF;
 SELECT * INTO r FROM public.dms_approve_runs WHERE id=plan.approve_run_id FOR UPDATE NOWAIT;
 IF NOT FOUND OR r.upload_session_id IS DISTINCT FROM s.id OR r.started_by IS DISTINCT FROM plan.actor_id OR
  r.run_key IS DISTINCT FROM 'f06-ai:'||plan.actor_id||':'||plan.operation_id OR r.document_id IS NOT NULL OR
  r.status NOT IN ('started','storage_copied','failed') THEN
  RAISE EXCEPTION 'Approval completion must be reconciled before discard' USING ERRCODE='PT409'; END IF;
 SELECT * INTO n FROM public.global_numbering_generated_references WHERE id=plan.reference_id FOR UPDATE NOWAIT;
 IF NOT FOUND OR n.generated_by IS DISTINCT FROM plan.actor_id OR n.generation_status IS DISTINCT FROM 'reserved' OR
  n.target_record_id IS NOT NULL OR n.generated_reference_number IS DISTINCT FROM plan.document_no OR
  n.generation_reason IS DISTINCT FROM 'F06 AI approval '||plan.request_hash THEN
  RAISE EXCEPTION 'Reserved reference must be reconciled before discard' USING ERRCODE='PT409'; END IF;
 IF s.document_id IS NOT NULL OR s.deleted_at IS NOT NULL OR s.status NOT IN ('uploaded','processing','failed') OR
  s.intake_status NOT IN ('review_pending','review_in_progress') OR s.approve_run_id IS DISTINCT FROM plan.approve_run_id OR
  s.approve_status NOT IN ('processing','storage_copied','failed') OR plan.result IS NOT NULL OR plan.completed_at IS NOT NULL OR
  plan.request_hash IS DISTINCT FROM encode(sha256(convert_to(plan.request_json::text,'UTF8')),'hex') OR
  EXISTS(SELECT 1 FROM public.dms_documents WHERE id=plan.document_id OR document_no=plan.document_no) OR
  EXISTS(SELECT 1 FROM public.dms_document_files WHERE document_id=plan.document_id OR storage_path=plan.storage_path) OR
  EXISTS(SELECT 1 FROM public.dms_approve_runs WHERE upload_session_id=s.id AND id<>plan.approve_run_id) OR
  EXISTS(SELECT 1 FROM erp_private.f07_attachment_intents WHERE upload_session_id=s.id) THEN
  RAISE EXCEPTION 'Approval completion must be reconciled before discard' USING ERRCODE='PT409'; END IF;
 IF (plan.request_json#>'{prepared,source}') IS DISTINCT FROM jsonb_build_object('id',s.id,'session_code',s.session_code,'uploaded_by',s.uploaded_by,
  'owning_company_id',s.owning_company_id,'owning_branch_id',s.owning_branch_id,'temp_storage_path',s.temp_storage_path,
  'original_filename',s.original_filename,'mime_type',s.mime_type,'file_size_bytes',s.file_size_bytes,'sha256_hash',s.sha256_hash,'ai_result_id',s.ai_result_id) THEN
  RAISE EXCEPTION 'Original approval source changed' USING ERRCODE='PT409'; END IF;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION erp_private.f07_check_uncommitted_ai_discard(bigint) FROM PUBLIC,anon,authenticated,service_role;

DO $patch$
DECLARE body text; needle text;
BEGIN
 SELECT pg_get_functiondef('erp_private.f07_discard_intake(bigint,bigint,text)'::regprocedure) INTO body;
 needle:='attachment erp_private.f07_attachment_intents;';
 IF (length(body)-length(replace(body,needle,'')))/length(needle)<>1 THEN RAISE EXCEPTION 'Discard declarations drift'; END IF;
 body:=replace(body,needle,needle||' cancel_approval boolean:=false;');
 needle:=' IF s.status=''completed'' OR s.intake_status IN (''approved'',''discarded'',''ocr_processing'',''ai_processing'') OR';
 IF (length(body)-length(replace(body,needle,'')))/length(needle)<>1 THEN RAISE EXCEPTION 'Discard admission drift'; END IF;
 body:=replace(body,needle,' cancel_approval:=erp_private.f07_check_uncommitted_ai_discard(s.id);'||E'\n'||needle);
 needle:=$old$  s.approve_run_id IS NOT NULL OR
  s.approve_status IN ('processing','storage_copied','db_committed','completed') OR
  EXISTS(SELECT 1 FROM public.dms_approve_runs r WHERE r.upload_session_id=s.id) OR
  EXISTS(SELECT 1 FROM erp_private.ai_approval_plans a WHERE a.upload_session_id=s.id) OR$old$;
 IF (length(body)-length(replace(body,needle,'')))/length(needle)<>1 THEN RAISE EXCEPTION 'Discard retained approval fence drift'; END IF;
 body:=replace(body,needle,$new$  (NOT cancel_approval AND (s.approve_run_id IS NOT NULL OR
  s.approve_status IN ('processing','storage_copied','db_committed','completed') OR
  EXISTS(SELECT 1 FROM public.dms_approve_runs r WHERE r.upload_session_id=s.id) OR
  EXISTS(SELECT 1 FROM erp_private.ai_approval_plans a WHERE a.upload_session_id=s.id))) OR$new$);
 needle:='''update'',result||CASE';
 IF (length(body)-length(replace(body,needle,'')))/length(needle)<>1 THEN RAISE EXCEPTION 'Discard audit drift'; END IF;
 body:=replace(body,needle,'''update'',result||jsonb_build_object(''uncommittedApprovalCancelled'',cancel_approval,''filePolicy'',''retained_no_deletion'')||CASE');
 EXECUTE body;

 -- Any direct or late retry must stop before it can reuse a cancelled plan.
 SELECT pg_get_functiondef('erp_private.ai_approval_plan(uuid,jsonb,bigint)'::regprocedure) INTO body;
 needle:=' if p_operation is null then raise exception ''Approval identity required'' using errcode=''22023'';end if;';
 IF (length(body)-length(replace(body,needle,'')))/length(needle)<>1 THEN RAISE EXCEPTION 'Approval reservation fence drift'; END IF;
 body:=replace(body,needle,needle||E'\n'||' if exists(select 1 from erp_private.f07_intake_discard_receipts where upload_session_id=(p_request->>''uploadSessionId'')::bigint) then raise exception ''This approval was discarded; its files and history remain retained'' using errcode=''PT409'';end if;');
 EXECUTE body;

 -- Serialize copy attestations with discard and finalization using the source
 -- lock. No external Storage request occurs inside this database transaction.
 SELECT pg_get_functiondef('public.attest_numbered_ai_intake(bigint,uuid,uuid,jsonb,uuid,text,timestamptz,text,bigint,text)'::regprocedure) INTO body;
 needle:='and approve_run_id=plan.approve_run_id and approve_status=''processing'' and intake_status in (''review_pending'',''review_in_progress'');';
 IF (length(body)-length(replace(body,needle,'')))/length(needle)<>1 THEN RAISE EXCEPTION 'Copy source fence drift'; END IF;
 EXECUTE replace(body,needle,replace(needle,');',') FOR SHARE NOWAIT;'));
END $patch$;
NOTIFY pgrst,'reload schema';
COMMIT;
