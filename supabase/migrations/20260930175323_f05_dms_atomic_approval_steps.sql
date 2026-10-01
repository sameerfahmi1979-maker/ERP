-- F05 UI02-N-B02/B03/B04, shared with F07-T04. Existing tables, one state machine.
-- Only the checked transition may mutate approval history. No service key is used
-- by the browser/action; the private owner executes after full F03 subject checks.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';

CREATE OR REPLACE FUNCTION erp_private.f05_approval_actor(document_id bigint, step_id bigint)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE d public.dms_documents; required_role text;
BEGIN
 IF NOT erp_private.document_permission($1,'dms.documents.view') THEN RETURN false; END IF;
 SELECT * INTO d FROM public.dms_documents WHERE id=$1 AND deleted_at IS NULL;
 IF erp_private.document_permission($1,'dms.admin') OR erp_private.document_permission($1,'dms.approvals.admin') THEN RETURN true; END IF;
 IF d.submitted_by=public.current_user_profile_id() THEN RETURN false; END IF;
 IF NOT (erp_private.document_permission($1,'dms.approvals.act') OR erp_private.document_permission($1,'dms.documents.approve')) THEN RETURN false; END IF;
 IF $2 IS NULL THEN RETURN true; END IF;
 SELECT requires_role INTO required_role FROM public.dms_document_workflow_steps WHERE id=$2 AND is_active;
 IF NOT FOUND THEN RETURN false; END IF;
 RETURN required_role IS NULL OR EXISTS(
  SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id=ur.role_id
  WHERE ur.user_profile_id=public.current_user_profile_id() AND ur.is_active AND r.is_active AND r.role_code=required_role
    AND ((ur.owner_company_id IS NULL AND ur.branch_id IS NULL) OR (ur.owner_company_id=d.owning_company_id AND (ur.branch_id IS NULL OR ur.branch_id=d.owning_branch_id))));
END $$;
REVOKE ALL ON FUNCTION erp_private.f05_approval_actor(bigint,bigint) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION erp_private.f05_approval_actor(bigint,bigint) TO authenticated;
CREATE OR REPLACE FUNCTION public.f05_can_act_document_approval(document_id bigint,step_id bigint)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$ SELECT erp_private.f05_approval_actor($1,$2); $$;
REVOKE ALL ON FUNCTION public.f05_can_act_document_approval(bigint,bigint) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.f05_can_act_document_approval(bigint,bigint) TO authenticated;

CREATE OR REPLACE FUNCTION public.f05_document_approval_capabilities(document_ids bigint[])
RETURNS TABLE(document_id bigint,can_act boolean,can_withdraw boolean) LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT d.id,
  a.id IS NOT NULL AND d.approval_status='pending_approval' AND erp_private.f05_approval_actor(d.id,a.step_id),
  a.id IS NOT NULL AND d.approval_status='pending_approval' AND (d.submitted_by=public.current_user_profile_id() OR erp_private.document_permission(d.id,'dms.approvals.withdraw') OR erp_private.document_permission(d.id,'dms.admin'))
 FROM public.dms_documents d LEFT JOIN public.dms_document_approvals a ON a.document_id=d.id AND a.is_current AND a.action='submitted'
 WHERE cardinality($1)<=100 AND d.id=ANY($1) AND d.deleted_at IS NULL AND erp_private.document_permission(d.id,'dms.documents.view');
$$;
REVOKE ALL ON FUNCTION public.f05_document_approval_capabilities(bigint[]) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.f05_document_approval_capabilities(bigint[]) TO authenticated;

-- An act-only reviewer must be able to read the current request they can act on;
-- the existing restrictive document/principal policies remain in force.
DROP POLICY IF EXISTS f05_current_approval_actor ON public.dms_document_approvals;
CREATE POLICY f05_current_approval_actor ON public.dms_document_approvals FOR SELECT TO authenticated
 USING(is_current AND erp_private.f05_approval_actor(document_id,step_id));

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
 IF NOT FOUND OR d.status IN ('archived','deleted') THEN RAISE EXCEPTION 'Document unavailable' USING ERRCODE='42501'; END IF;
 IF NOT erp_private.document_permission($1,'dms.documents.view') THEN RAISE EXCEPTION 'Permission denied' USING ERRCODE='42501'; END IF;
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
  UPDATE public.dms_document_approvals SET action=CASE $3 WHEN 'approve' THEN 'approved' WHEN 'reject' THEN 'rejected' ELSE 'withdrawn' END,actioned_by=actor,actioned_at=now_at,comments=nullif($4,''),reason=nullif($5,''),is_current=false,updated_by=actor,updated_at=now_at WHERE id=a.id;
  next_id:=a.id;
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
REVOKE ALL ON FUNCTION erp_private.f05_transition_approval(bigint,bigint,text,text,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION erp_private.f05_transition_approval(bigint,bigint,text,text,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.f05_transition_document_approval(document_id bigint,approval_id bigint,operation text,comment_text text DEFAULT NULL,reason_text text DEFAULT NULL)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT erp_private.f05_transition_approval($1,$2,$3,$4,$5); $$;
REVOKE ALL ON FUNCTION public.f05_transition_document_approval(bigint,bigint,text,text,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.f05_transition_document_approval(bigint,bigint,text,text,text) TO authenticated;

-- Prevent the public table API from bypassing the checked workflow transition.
REVOKE INSERT,UPDATE,DELETE,TRUNCATE ON public.dms_document_approvals FROM authenticated,anon;
CREATE OR REPLACE FUNCTION erp_private.f05_guard_approval_fields() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  IF current_user IN ('authenticated','anon') AND (coalesce(NEW.approval_status,'draft')<>'draft' OR NEW.submitted_by IS NOT NULL OR NEW.submitted_at IS NOT NULL) THEN
   RAISE EXCEPTION 'Create a draft before requesting approval' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
 END IF;
 IF current_user IN ('authenticated','anon') AND (
  NEW.approval_status IS DISTINCT FROM OLD.approval_status OR NEW.submitted_by IS DISTINCT FROM OLD.submitted_by OR NEW.submitted_at IS DISTINCT FROM OLD.submitted_at
  OR (OLD.approval_status='pending_approval' AND NEW.status IS DISTINCT FROM OLD.status)
  OR (OLD.approval_status='approved' AND NEW.status NOT IN ('approved','archived','deleted'))) THEN
  RAISE EXCEPTION 'Use the document approval action' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION erp_private.f05_guard_approval_fields() FROM PUBLIC,anon,authenticated,service_role;
DROP TRIGGER IF EXISTS f05_guard_approval_fields ON public.dms_documents;
CREATE TRIGGER f05_guard_approval_fields BEFORE INSERT OR UPDATE ON public.dms_documents FOR EACH ROW EXECUTE FUNCTION erp_private.f05_guard_approval_fields();
NOTIFY pgrst,'reload schema';
COMMIT;
