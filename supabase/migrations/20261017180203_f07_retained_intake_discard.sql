-- F07-T03: discard is a retained, reversible lifecycle action, not disposal.
BEGIN;
SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='60s';
CREATE TABLE erp_private.f07_intake_discard_receipts (
 upload_session_id bigint PRIMARY KEY REFERENCES public.dms_upload_sessions(id),
 actor_id bigint NOT NULL REFERENCES public.user_profiles(id),
 document_id bigint REFERENCES public.dms_documents(id),
 reason text, receipt jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE erp_private.f07_intake_discard_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON erp_private.f07_intake_discard_receipts FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION erp_private.f07_discard_intake(p_session bigint,p_document bigint,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s public.dms_upload_sessions; d public.dms_documents;
 old erp_private.f07_intake_discard_receipts; actor bigint:=public.current_user_profile_id();
 reason text:=nullif(btrim(p_reason),''); result jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT erp_private.business_principal_is_active() OR
  NOT (erp_private.upload_session_permission(p_session,'dms.documents.upload') OR erp_private.upload_session_permission(p_session,'dms.admin')) THEN
  RAISE EXCEPTION 'Intake unavailable' USING ERRCODE='42501'; END IF;
 IF p_session IS NULL OR p_session<1 OR length(coalesce(p_reason,''))>500 THEN
  RAISE EXCEPTION 'Invalid discard request' USING ERRCODE='22023'; END IF;
 SELECT * INTO s FROM public.dms_upload_sessions WHERE id=p_session AND deleted_at IS NULL;
 IF NOT FOUND OR s.document_id IS DISTINCT FROM p_document THEN RAISE EXCEPTION 'Intake changed' USING ERRCODE='PT409'; END IF;
 -- Never wait while holding one parent: older creation paths can lock the
 -- source first. NOWAIT makes cross-path contention a safe retry, not a cycle.
 IF p_document IS NOT NULL THEN
  SELECT * INTO d FROM public.dms_documents WHERE id=p_document AND deleted_at IS NULL FOR UPDATE NOWAIT;
  IF NOT FOUND OR NOT (erp_private.document_permission(d.id,'dms.documents.archive') OR erp_private.document_permission(d.id,'dms.admin')) OR
   NOT (erp_private.document_permission(d.id,'dms.documents.edit') OR erp_private.document_permission(d.id,'dms.admin')) THEN
   RAISE EXCEPTION 'Draft archive permission required' USING ERRCODE='42501'; END IF;
 END IF;
 SELECT * INTO s FROM public.dms_upload_sessions WHERE id=p_session AND deleted_at IS NULL FOR UPDATE NOWAIT;
 IF NOT FOUND OR s.document_id IS DISTINCT FROM p_document OR
  NOT (erp_private.upload_session_permission(s.id,'dms.documents.upload') OR erp_private.upload_session_permission(s.id,'dms.admin')) THEN
  RAISE EXCEPTION 'Intake changed or access revoked' USING ERRCODE='42501'; END IF;
 SELECT * INTO old FROM erp_private.f07_intake_discard_receipts WHERE upload_session_id=s.id;
 IF FOUND THEN
  IF old.actor_id IS DISTINCT FROM actor OR old.document_id IS DISTINCT FROM p_document OR old.reason IS DISTINCT FROM reason THEN
   RAISE EXCEPTION 'Retained discard request differs' USING ERRCODE='PT409'; END IF;
  RETURN old.receipt || jsonb_build_object('replayed',true);
 END IF;
 IF s.status='completed' OR s.intake_status IN ('approved','discarded','ocr_processing','ai_processing') OR
  s.approve_run_id IS NOT NULL OR
  s.approve_status IN ('processing','storage_copied','db_committed','completed') OR
  EXISTS(SELECT 1 FROM public.dms_approve_runs r WHERE r.upload_session_id=s.id) OR
  EXISTS(SELECT 1 FROM erp_private.ai_approval_plans a WHERE a.upload_session_id=s.id) OR
  EXISTS(SELECT 1 FROM public.dms_document_events e WHERE e.document_id=s.document_id AND e.event_type='document_created' AND e.metadata_json->>'attachment_complete'='false') OR
  EXISTS(SELECT 1 FROM erp_private.f07_attachment_intents a WHERE a.upload_session_id=s.id) THEN
  RAISE EXCEPTION 'Reconcile the retained creation or approval before discard' USING ERRCODE='PT409'; END IF;
 IF p_document IS NOT NULL THEN
  IF d.approval_status IN ('pending_approval','approved') OR d.status IN ('approved','active','published','superseded','deleted') OR d.is_archived THEN
   RAISE EXCEPTION 'Published or reviewed content is not an abandoned draft' USING ERRCODE='PT409'; END IF;
  PERFORM erp_private.f07_archive_document(d.id,true,d.updated_at);
 END IF;
 UPDATE public.dms_upload_sessions SET status='cancelled',intake_status='discarded',review_status='discarded',discarded_at=clock_timestamp(),
  discard_reason=reason,updated_at=clock_timestamp() WHERE id=s.id;
 result:=jsonb_build_object('uploadSessionId',s.id,'documentId',s.document_id,'batchId',s.batch_id,'retained',true,'replayed',false);
 INSERT INTO erp_private.f07_intake_discard_receipts(upload_session_id,actor_id,document_id,reason,receipt) VALUES(s.id,actor,s.document_id,reason,result);
 INSERT INTO public.audit_logs(actor_user_profile_id,owner_company_id,branch_id,module_code,entity_name,entity_id,entity_reference,action,new_values)
  VALUES(actor,s.owning_company_id,s.owning_branch_id,'DMS','dms_upload_sessions',s.id,s.session_code,'update',result);
 IF NOT erp_private.business_principal_is_active() OR public.current_user_profile_id() IS DISTINCT FROM actor OR
  NOT (erp_private.upload_session_permission(s.id,'dms.documents.upload') OR erp_private.upload_session_permission(s.id,'dms.admin')) OR
  (p_document IS NOT NULL AND (NOT (erp_private.document_permission(p_document,'dms.documents.archive') OR erp_private.document_permission(p_document,'dms.admin')) OR
   NOT (erp_private.document_permission(p_document,'dms.documents.edit') OR erp_private.document_permission(p_document,'dms.admin')))) THEN
  RAISE EXCEPTION 'Discard authority changed' USING ERRCODE='42501'; END IF;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION erp_private.f07_discard_intake(bigint,bigint,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION erp_private.f07_discard_intake(bigint,bigint,text) TO authenticated;
CREATE FUNCTION public.f07_discard_intake(p_session bigint,p_document bigint,p_reason text)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT erp_private.f07_discard_intake($1,$2,$3); $$;
REVOKE ALL ON FUNCTION public.f07_discard_intake(bigint,bigint,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.f07_discard_intake(bigint,bigint,text) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
