-- F07-T04: extend the canonical F05 stage engine; do not introduce another workflow.
BEGIN;
SET LOCAL lock_timeout='5s';SET LOCAL statement_timeout='60s';
ALTER TABLE public.dms_document_approvals
 ADD COLUMN responds_to_approval_id bigint REFERENCES public.dms_document_approvals(id),
 ADD COLUMN reviewed_fingerprint text,
 ADD COLUMN workflow_fingerprint text;
CREATE INDEX f07_approval_response ON public.dms_document_approvals(responds_to_approval_id) WHERE responds_to_approval_id IS NOT NULL;
CREATE FUNCTION erp_private.f07_review_fingerprint(p_document bigint) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT encode(sha256(convert_to(jsonb_build_object(
  'document',jsonb_build_object('title',d.title,'description',d.description,'type',d.document_type_id,'category',d.category_id,
   'confidentiality',d.confidentiality_level,'company',d.owning_company_id,'branch',d.owning_branch_id,'party',d.party_id,'owner',d.owner_user_id,
   'issue',d.issue_date,'expiry',d.expiry_date,'version',d.current_version_id),
  'versions',coalesce((SELECT jsonb_agg(jsonb_build_object('id',v.id,'number',v.version_number,'unlinked',v.unlinked_at) ORDER BY v.id) FROM public.dms_document_versions v WHERE v.id=d.current_version_id AND v.unlinked_at IS NULL),'[]'::jsonb),
  'files',coalesce((SELECT jsonb_agg(jsonb_build_object('id',f.id,'version',f.version_id,'role',f.file_role,'bucket',f.storage_bucket,
   'path',f.storage_path,'name',f.file_name,'mime',f.mime_type,'size',f.file_size_bytes,'sha256',f.sha256_hash) ORDER BY f.id) FROM public.dms_document_files f WHERE f.document_id=d.id AND f.version_id=d.current_version_id AND f.deleted_at IS NULL),'[]'::jsonb),
  'metadata',coalesce((SELECT jsonb_agg(to_jsonb(m) ORDER BY m.id) FROM public.dms_document_metadata_values m WHERE m.document_id=d.id),'[]'::jsonb),
  'links',coalesce((SELECT jsonb_agg(to_jsonb(l) ORDER BY l.id) FROM public.dms_document_links l WHERE l.document_id=d.id AND l.deleted_at IS NULL),'[]'::jsonb)
 )::text,'UTF8')),'hex') FROM public.dms_documents d WHERE d.id=p_document AND d.deleted_at IS NULL;
$$;
REVOKE ALL ON FUNCTION erp_private.f07_review_fingerprint(bigint) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION erp_private.f07_workflow_fingerprint(p_workflow bigint,p_document bigint) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT encode(sha256(convert_to(jsonb_build_object('workflow',(SELECT to_jsonb(w) FROM public.dms_document_workflows w WHERE w.id=p_workflow),
  'steps',coalesce((SELECT jsonb_agg(to_jsonb(s) ORDER BY s.sort_order,s.id) FROM public.dms_document_workflow_steps s WHERE s.workflow_id=p_workflow),'[]'::jsonb),
  'mappings',coalesce((SELECT jsonb_agg(to_jsonb(m) ORDER BY m.workflow_id,m.document_type_id) FROM public.dms_workflow_document_types m JOIN public.dms_documents d ON d.document_type_id=m.document_type_id WHERE d.id=p_document),'[]'::jsonb))::text,'UTF8')),'hex');
$$;
REVOKE ALL ON FUNCTION erp_private.f07_workflow_fingerprint(bigint,bigint) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION erp_private.f07_approval_history_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF TG_OP='DELETE' THEN
  IF EXISTS(SELECT 1 FROM public.dms_documents WHERE id=OLD.document_id) THEN RAISE EXCEPTION 'Approval history is retained until authorized document purge' USING ERRCODE='42501';END IF;
  RETURN OLD;
 END IF;
 IF TG_OP='UPDATE' THEN
  IF (to_jsonb(NEW)-ARRAY['is_current','updated_by','updated_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['is_current','updated_by','updated_at']) THEN
   RAISE EXCEPTION 'Approval business history is append-only' USING ERRCODE='42501';END IF;
  RETURN NEW;
 END IF;
 IF NEW.action='submitted' THEN
  NEW.reviewed_fingerprint:=erp_private.f07_review_fingerprint(NEW.document_id);
  NEW.workflow_fingerprint:=erp_private.f07_workflow_fingerprint(NEW.workflow_id,NEW.document_id);
 ELSIF NEW.responds_to_approval_id IS NOT NULL THEN
  SELECT reviewed_fingerprint,workflow_fingerprint INTO NEW.reviewed_fingerprint,NEW.workflow_fingerprint FROM public.dms_document_approvals
   WHERE id=NEW.responds_to_approval_id AND document_id=NEW.document_id AND action='submitted';
  IF NOT FOUND THEN RAISE EXCEPTION 'Approval response has no original submission' USING ERRCODE='23503';END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION erp_private.f07_approval_history_guard() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER f07_approval_history_guard BEFORE INSERT OR UPDATE OR DELETE ON public.dms_document_approvals FOR EACH ROW EXECUTE FUNCTION erp_private.f07_approval_history_guard();

CREATE FUNCTION erp_private.f07_guard_reviewed_document() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF ROW(NEW.title,NEW.description,NEW.document_type_id,NEW.category_id,NEW.confidentiality_level,NEW.owning_company_id,NEW.owning_branch_id,NEW.party_id,NEW.owner_user_id,NEW.issue_date,NEW.expiry_date,NEW.current_version_id)
  IS DISTINCT FROM ROW(OLD.title,OLD.description,OLD.document_type_id,OLD.category_id,OLD.confidentiality_level,OLD.owning_company_id,OLD.owning_branch_id,OLD.party_id,OLD.owner_user_id,OLD.issue_date,OLD.expiry_date,OLD.current_version_id) THEN
  IF OLD.approval_status='pending_approval' THEN RAISE EXCEPTION 'Withdraw the active review before modifying reviewed content' USING ERRCODE='PT409';END IF;
  IF OLD.approval_status='approved' THEN NEW.approval_status:=NULL;IF NEW.status='approved' THEN NEW.status:='draft';END IF;END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION erp_private.f07_guard_reviewed_document() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER f07_guard_reviewed_document BEFORE UPDATE ON public.dms_documents FOR EACH ROW EXECUTE FUNCTION erp_private.f07_guard_reviewed_document();
CREATE FUNCTION erp_private.f07_guard_reviewed_child() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE parent bigint; approval text; identity_changed boolean:=true;
BEGIN
 IF TG_TABLE_NAME='dms_document_files' AND TG_OP='UPDATE' THEN
  identity_changed:=ROW(NEW.document_id,NEW.version_id,NEW.file_role,NEW.storage_bucket,NEW.storage_path,NEW.file_name,NEW.mime_type,NEW.file_size_bytes,NEW.sha256_hash,NEW.deleted_at)
   IS DISTINCT FROM ROW(OLD.document_id,OLD.version_id,OLD.file_role,OLD.storage_bucket,OLD.storage_path,OLD.file_name,OLD.mime_type,OLD.file_size_bytes,OLD.sha256_hash,OLD.deleted_at);
 END IF;
 -- Parent-before-child order also serializes edits against approval snapshots.
 FOR parent IN SELECT DISTINCT id FROM unnest(ARRAY[CASE WHEN TG_OP<>'INSERT' THEN OLD.document_id END,CASE WHEN TG_OP<>'DELETE' THEN NEW.document_id END]) id WHERE id IS NOT NULL ORDER BY id LOOP
  SELECT approval_status INTO approval FROM public.dms_documents WHERE id=parent FOR UPDATE;
  IF approval='pending_approval' AND identity_changed THEN
   RAISE EXCEPTION 'Withdraw active approval before changing reviewed child content' USING ERRCODE='PT409';
  ELSIF approval='approved' AND identity_changed THEN
   UPDATE public.dms_documents SET approval_status=NULL,status=CASE WHEN status='approved' THEN 'draft' ELSE status END,updated_at=clock_timestamp(),updated_by=public.current_user_profile_id() WHERE id=parent;
  END IF;
 END LOOP;
 IF TG_OP='DELETE' THEN RETURN OLD;END IF;RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION erp_private.f07_guard_reviewed_child() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER f07_guard_reviewed_child BEFORE INSERT OR UPDATE OR DELETE ON public.dms_document_metadata_values FOR EACH ROW EXECUTE FUNCTION erp_private.f07_guard_reviewed_child();
CREATE TRIGGER f07_guard_reviewed_child BEFORE INSERT OR UPDATE OR DELETE ON public.dms_document_links FOR EACH ROW EXECUTE FUNCTION erp_private.f07_guard_reviewed_child();
CREATE TRIGGER f07_guard_reviewed_child BEFORE INSERT OR UPDATE OR DELETE ON public.dms_document_files FOR EACH ROW EXECUTE FUNCTION erp_private.f07_guard_reviewed_child();
CREATE TRIGGER f07_guard_reviewed_child BEFORE INSERT OR UPDATE OR DELETE ON public.dms_document_versions FOR EACH ROW EXECUTE FUNCTION erp_private.f07_guard_reviewed_child();

CREATE FUNCTION erp_private.f07_audit_approval_history() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE d public.dms_documents;
BEGIN
 SELECT * INTO d FROM public.dms_documents WHERE id=NEW.document_id;
 INSERT INTO public.audit_logs(actor_user_profile_id,owner_company_id,branch_id,module_code,entity_name,entity_id,entity_reference,action,new_values)
  VALUES(NEW.actioned_by,d.owning_company_id,d.owning_branch_id,'DMS','dms_document_approvals',NEW.id,d.document_no,'update',
   jsonb_build_object('action',NEW.action,'submission_id',NEW.responds_to_approval_id,'reviewed_fingerprint',NEW.reviewed_fingerprint,'workflow_fingerprint',NEW.workflow_fingerprint));
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION erp_private.f07_audit_approval_history() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER f07_audit_approval_history AFTER INSERT ON public.dms_document_approvals FOR EACH ROW EXECUTE FUNCTION erp_private.f07_audit_approval_history();

CREATE OR REPLACE FUNCTION erp_private.f05_transition_approval(document_id bigint,approval_id bigint,operation text,comment_text text,reason_text text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE d public.dms_documents; a public.dms_document_approvals; s public.dms_document_workflow_steps;
 next_step public.dms_document_workflow_steps; wf public.dms_document_workflows;
 actor bigint; next_id bigint; candidates integer; now_at timestamptz:=clock_timestamp(); state text; event text;
BEGIN
 IF auth.uid() IS NULL OR NOT erp_private.document_permission($1,'dms.documents.view') THEN RAISE EXCEPTION 'Permission denied' USING ERRCODE='42501'; END IF;
 IF $3 IS NULL OR $3 NOT IN ('submit','approve','reject','withdraw') OR length(coalesce($4,''))>2000 OR length(coalesce($5,''))>2000 THEN RAISE EXCEPTION 'Invalid action' USING ERRCODE='22023'; END IF;
 actor:=public.current_user_profile_id();
 SELECT * INTO d FROM public.dms_documents WHERE id=$1 AND deleted_at IS NULL FOR UPDATE;
 IF NOT FOUND OR (d.is_archived OR d.status IN ('archived','superseded','deleted')) THEN RAISE EXCEPTION 'Document unavailable' USING ERRCODE='42501'; END IF;
 IF NOT erp_private.document_permission($1,'dms.documents.view') THEN RAISE EXCEPTION 'Permission denied' USING ERRCODE='42501'; END IF;
 IF $3<>'withdraw' AND d.current_version_id IS NOT NULL AND NOT erp_private.document_permission(d.id,'dms.documents.preview') THEN
  RAISE EXCEPTION 'Reviewed original requires scoped preview permission' USING ERRCODE='42501';END IF;
 IF $3='submit' THEN
  IF NOT (erp_private.document_permission($1,'dms.approvals.submit') OR erp_private.document_permission($1,'dms.documents.edit') OR erp_private.document_permission($1,'dms.admin')) THEN RAISE EXCEPTION 'Permission denied' USING ERRCODE='42501'; END IF;
  IF coalesce(d.approval_status,'draft') NOT IN ('draft','rejected','withdrawn') OR EXISTS(SELECT 1 FROM public.dms_document_approvals approval WHERE approval.document_id=$1 AND approval.is_current) THEN RAISE EXCEPTION 'Approval state changed; refresh' USING ERRCODE='PT409'; END IF;
  IF d.document_type_id IS NOT NULL THEN
   SELECT count(*) INTO candidates FROM public.dms_workflow_document_types m JOIN public.dms_document_workflows w ON w.id=m.workflow_id WHERE m.document_type_id=d.document_type_id AND w.is_active AND w.deleted_at IS NULL;
   IF candidates>1 THEN RAISE EXCEPTION 'Document type has conflicting workflows' USING ERRCODE='55000'; END IF;
   IF candidates=1 THEN
    SELECT w.* INTO wf FROM public.dms_document_workflows w JOIN public.dms_workflow_document_types m ON m.workflow_id=w.id WHERE m.document_type_id=d.document_type_id AND w.is_active AND w.deleted_at IS NULL FOR SHARE OF w;
    SELECT * INTO s FROM public.dms_document_workflow_steps WHERE workflow_id=wf.id AND is_active ORDER BY sort_order,id LIMIT 1;
    IF s.id IS NULL OR NOT s.is_initial OR (SELECT count(*) FROM public.dms_document_workflow_steps WHERE workflow_id=wf.id AND is_active AND is_initial)<>1
      OR (SELECT count(*) FROM public.dms_document_workflow_steps WHERE workflow_id=wf.id AND is_active AND is_final)<>1
      OR NOT (SELECT is_final FROM public.dms_document_workflow_steps WHERE workflow_id=wf.id AND is_active ORDER BY sort_order DESC,id DESC LIMIT 1) THEN RAISE EXCEPTION 'Workflow needs valid initial and final steps' USING ERRCODE='55000'; END IF;
   END IF;
  END IF;
  INSERT INTO public.dms_document_approvals(document_id,workflow_id,step_id,action,submitted_by,submitted_at,actioned_by,actioned_at,comments,is_current,updated_by)
   VALUES(d.id,wf.id,s.id,'submitted',actor,now_at,actor,now_at,nullif($4,''),true,actor) RETURNING id INTO next_id;
  state:='pending_approval'; event:='approval_submitted';
  UPDATE public.dms_documents SET approval_status=state,status='pending_review',submitted_by=actor,submitted_at=now_at,updated_by=actor,updated_at=now_at WHERE id=d.id;
 ELSE
  SELECT * INTO a FROM public.dms_document_approvals approval WHERE approval.id=$2 AND approval.document_id=d.id AND approval.is_current AND approval.action='submitted' FOR UPDATE;
  IF NOT FOUND OR d.approval_status IS DISTINCT FROM 'pending_approval' THEN RAISE EXCEPTION 'Approval state changed; refresh' USING ERRCODE='PT409'; END IF;
  IF $3<>'withdraw' AND (a.reviewed_fingerprint IS NULL OR a.reviewed_fingerprint IS DISTINCT FROM erp_private.f07_review_fingerprint(d.id) OR a.workflow_fingerprint IS DISTINCT FROM erp_private.f07_workflow_fingerprint(a.workflow_id,d.id)) THEN RAISE EXCEPTION 'Reviewed content or workflow changed; withdraw and resubmit' USING ERRCODE='PT409';END IF;
  IF $3='withdraw' THEN
   IF d.submitted_by IS DISTINCT FROM actor AND NOT (erp_private.document_permission($1,'dms.approvals.withdraw') OR erp_private.document_permission($1,'dms.admin')) THEN RAISE EXCEPTION 'Permission denied' USING ERRCODE='42501'; END IF;
  ELSIF NOT erp_private.f05_approval_actor(d.id,a.step_id) THEN RAISE EXCEPTION 'Not eligible for this approval step' USING ERRCODE='42501'; END IF;
  IF $3='reject' AND length(btrim(coalesce($5,'')))<5 THEN RAISE EXCEPTION 'A rejection reason is required' USING ERRCODE='22023'; END IF;
  IF a.workflow_id IS NULL AND $3<>'withdraw' AND EXISTS(SELECT 1 FROM public.dms_workflow_document_types m JOIN public.dms_document_workflows w ON w.id=m.workflow_id WHERE m.document_type_id=d.document_type_id AND w.is_active AND w.deleted_at IS NULL) THEN
   RAISE EXCEPTION 'Legacy request has no workflow; withdraw and resubmit' USING ERRCODE='55000';
  END IF;
  IF a.workflow_id IS NOT NULL THEN
   SELECT * INTO wf FROM public.dms_document_workflows WHERE id=a.workflow_id AND is_active AND deleted_at IS NULL FOR SHARE;
   SELECT * INTO s FROM public.dms_document_workflow_steps WHERE id=a.step_id AND workflow_id=a.workflow_id AND is_active;
   IF (wf.id IS NULL OR s.id IS NULL) AND $3<>'withdraw' THEN RAISE EXCEPTION 'Workflow unavailable; request withdrawal or administrator review' USING ERRCODE='55000'; END IF;
  END IF;
  state:=CASE $3 WHEN 'approve' THEN 'approved' WHEN 'reject' THEN 'rejected' ELSE 'withdrawn' END;
  IF $3='approve' AND a.workflow_id IS NOT NULL AND NOT s.is_final THEN
   SELECT * INTO next_step FROM public.dms_document_workflow_steps WHERE workflow_id=a.workflow_id AND is_active AND (sort_order,id)>(s.sort_order,s.id) ORDER BY sort_order,id LIMIT 1;
   IF next_step.id IS NULL THEN RAISE EXCEPTION 'Workflow has no next step' USING ERRCODE='55000'; END IF;
   state:='pending_approval';
  END IF;
  UPDATE public.dms_document_approvals SET is_current=false,updated_by=actor,updated_at=now_at WHERE id=a.id;
  INSERT INTO public.dms_document_approvals(document_id,workflow_id,step_id,action,submitted_by,submitted_at,actioned_by,actioned_at,comments,reason,is_current,updated_by,responds_to_approval_id)
   VALUES(d.id,a.workflow_id,a.step_id,CASE $3 WHEN 'approve' THEN 'approved' WHEN 'reject' THEN 'rejected' ELSE 'withdrawn' END,a.submitted_by,a.submitted_at,actor,now_at,nullif($4,''),nullif($5,''),false,actor,a.id) RETURNING id INTO next_id;
  IF next_step.id IS NOT NULL THEN
   INSERT INTO public.dms_document_approvals(document_id,workflow_id,step_id,action,submitted_by,submitted_at,actioned_by,actioned_at,is_current,updated_by)
    VALUES(d.id,a.workflow_id,next_step.id,'submitted',a.submitted_by,a.submitted_at,actor,now_at,true,actor) RETURNING id INTO next_id;
  END IF;
  UPDATE public.dms_documents SET approval_status=state,status=CASE state WHEN 'pending_approval' THEN 'pending_review' WHEN 'withdrawn' THEN 'draft' ELSE state END,updated_by=actor,updated_at=now_at WHERE id=d.id;
  event:=CASE $3 WHEN 'approve' THEN 'approval_approved' WHEN 'reject' THEN 'approval_rejected' ELSE 'approval_withdrawn' END;
 END IF;
 INSERT INTO public.dms_document_events(document_id,event_type,description,performed_by,metadata_json)
 VALUES(d.id,event,CASE WHEN state='pending_approval' AND $3='approve' THEN 'Approval step completed; awaiting the next step' ELSE 'Document approval '||$3 END,actor,
  jsonb_build_object('approval_id',next_id,'previous_approval_id',a.id,'workflow_id',coalesce(a.workflow_id,wf.id),'step_id',coalesce(next_step.id,s.id),'approval_status',state));
 RETURN jsonb_build_object('approvalId',next_id,'approvalStatus',state,'pending',state='pending_approval','requiresRole',coalesce(next_step.requires_role,s.requires_role));
END $$;

NOTIFY pgrst,'reload schema';
COMMIT;
