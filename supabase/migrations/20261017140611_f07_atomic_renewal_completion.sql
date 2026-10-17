-- F07-T05: authenticated same-subject renewal with durable semantic replay.
-- No provider/worker execution and no historical document repair.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';

CREATE TABLE erp_private.f07_renewal_receipts (
 request_id bigint PRIMARY KEY REFERENCES public.dms_renewal_requests(id),
 actor_id bigint NOT NULL REFERENCES public.user_profiles(id),
 payload jsonb NOT NULL, receipt jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
REVOKE ALL ON erp_private.f07_renewal_receipts FROM PUBLIC,anon,authenticated,service_role;

-- Freeze parent identity while a completion checks its entire subject set.
-- Existing link RLS/authority still controls the original statement.
CREATE FUNCTION erp_private.f07_lock_link_parents() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE old_id bigint; new_id bigint;
BEGIN
 IF TG_OP<>'INSERT' THEN old_id:=OLD.document_id; END IF;
 IF TG_OP<>'DELETE' THEN new_id:=NEW.document_id; END IF;
 PERFORM d.id FROM public.dms_documents d WHERE d.id IN (old_id,new_id) ORDER BY d.id FOR UPDATE;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION erp_private.f07_lock_link_parents() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER f07_lock_link_parents BEFORE INSERT OR UPDATE OR DELETE ON public.dms_document_links
 FOR EACH ROW EXECUTE FUNCTION erp_private.f07_lock_link_parents();

CREATE FUNCTION erp_private.f07_guard_renewal_completion() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF current_user IN ('postgres','supabase_admin') THEN RETURN NEW; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.status='renewed' OR NEW.replacement_document_id IS NOT NULL OR NEW.replacement_version_id IS NOT NULL OR NEW.completed_at IS NOT NULL THEN
   RAISE EXCEPTION 'Use the checked renewal completion operation' USING ERRCODE='42501';
  END IF;
 ELSIF NEW.status='renewed' OR OLD.status='renewed' OR
  NEW.replacement_document_id IS DISTINCT FROM OLD.replacement_document_id OR
  NEW.replacement_version_id IS DISTINCT FROM OLD.replacement_version_id OR NEW.completed_at IS DISTINCT FROM OLD.completed_at THEN
  RAISE EXCEPTION 'Use the checked renewal completion operation' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION erp_private.f07_guard_renewal_completion() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER f07_guard_renewal_completion BEFORE INSERT OR UPDATE ON public.dms_renewal_requests
 FOR EACH ROW EXECUTE FUNCTION erp_private.f07_guard_renewal_completion();

CREATE OR REPLACE FUNCTION erp_private.f07_complete_renewal(p_request bigint,p_replacement bigint,p_version bigint,p_expiry date,p_notes text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.dms_renewal_requests; original public.dms_documents; replacement public.dms_documents;
 saved erp_private.f07_renewal_receipts; payload jsonb; receipt jsonb; actor bigint;
 at_time timestamptz:=clock_timestamp(); original_links jsonb; replacement_links jsonb;
 intent text:='not_required'; days integer; expiry date; track_expiry boolean;
BEGIN
 IF auth.uid() IS NULL OR NOT erp_private.business_principal_is_active() THEN RAISE EXCEPTION 'Permission denied' USING ERRCODE='42501'; END IF;
 IF p_request IS NULL OR p_request<=0 OR p_replacement IS NULL OR p_replacement<=0 OR (p_version IS NOT NULL AND p_version<=0) OR length(coalesce(p_notes,''))>4000 THEN
  RAISE EXCEPTION 'Invalid renewal request' USING ERRCODE='22023';
 END IF;
 actor:=public.current_user_profile_id();
 SELECT * INTO r FROM public.dms_renewal_requests WHERE id=p_request AND deleted_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Renewal unavailable' USING ERRCODE='42501'; END IF;
 -- Every participant obtains document locks in the same order. Shared
 -- replacement locking serializes competing claims without a broad table lock.
 PERFORM d.id FROM public.dms_documents d WHERE d.id IN (r.document_id,p_replacement) ORDER BY d.id FOR UPDATE;
 SELECT * INTO original FROM public.dms_documents WHERE id=r.document_id AND deleted_at IS NULL;
 SELECT * INTO replacement FROM public.dms_documents WHERE id=p_replacement AND deleted_at IS NULL;
 IF original.id IS NULL OR replacement.id IS NULL OR original.id=replacement.id OR
  NOT (erp_private.document_permission(original.id,'dms.renewals.manage') OR erp_private.document_permission(original.id,'dms.admin')) OR
  NOT (erp_private.document_permission(original.id,'dms.documents.edit') OR erp_private.document_permission(original.id,'dms.admin')) OR
  NOT (erp_private.document_permission(replacement.id,'dms.renewals.manage') OR erp_private.document_permission(replacement.id,'dms.admin')) THEN
  RAISE EXCEPTION 'Replacement access denied' USING ERRCODE='42501';
 END IF;
 payload:=jsonb_build_object('replacement_document_id',p_replacement,'replacement_version_id',p_version,'new_expiry_date',p_expiry,'notes',p_notes);
 SELECT * INTO saved FROM erp_private.f07_renewal_receipts WHERE request_id=r.id;
 IF saved.request_id IS NOT NULL THEN
  IF saved.payload IS DISTINCT FROM payload OR r.status<>'renewed' OR r.replacement_document_id IS DISTINCT FROM p_replacement THEN
   RAISE EXCEPTION 'Renewal completion changed' USING ERRCODE='PT409';
  END IF;
  RETURN saved.receipt||jsonb_build_object('replayed',true);
 END IF;
 -- A legacy completion without a receipt is not silently replayed/repaired.
 IF r.status NOT IN ('requested','in_progress','waiting_for_document') OR original.is_archived OR original.status IN ('archived','superseded','deleted') THEN
  RAISE EXCEPTION 'Renewal state changed' USING ERRCODE='PT409';
 END IF;
 IF original.owning_company_id IS NULL OR original.owning_company_id IS DISTINCT FROM replacement.owning_company_id OR
  original.owning_branch_id IS DISTINCT FROM replacement.owning_branch_id OR original.document_type_id IS DISTINCT FROM replacement.document_type_id OR
  replacement.is_archived OR replacement.status NOT IN ('active','approved') THEN
  RAISE EXCEPTION 'Replacement is not eligible for this renewal' USING ERRCODE='22023';
 END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(subject) ORDER BY subject.entity_type,subject.entity_id),'[]'::jsonb) INTO original_links
  FROM (SELECT DISTINCT entity_type,entity_id FROM public.dms_document_links WHERE document_id=original.id AND deleted_at IS NULL) subject;
 SELECT coalesce(jsonb_agg(to_jsonb(subject) ORDER BY subject.entity_type,subject.entity_id),'[]'::jsonb) INTO replacement_links
  FROM (SELECT DISTINCT entity_type,entity_id FROM public.dms_document_links WHERE document_id=replacement.id AND deleted_at IS NULL) subject;
 -- Company-wide originals with no subject links accept only another unlinked
 -- document in the exact same company/branch/type. No type-only cross-entity fallback.
 IF original_links IS DISTINCT FROM replacement_links THEN RAISE EXCEPTION 'Replacement subject does not match' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM public.dms_renewal_requests claim WHERE claim.id<>r.id AND claim.status='renewed' AND claim.deleted_at IS NULL AND claim.replacement_document_id=replacement.id) THEN
  RAISE EXCEPTION 'Replacement already used' USING ERRCODE='PT409';
 END IF;
 IF p_version IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.dms_document_versions v WHERE v.id=p_version AND v.document_id=replacement.id) THEN
  RAISE EXCEPTION 'Replacement version does not belong to the replacement' USING ERRCODE='22023';
 END IF;
 IF EXISTS(SELECT 1 FROM public.dms_workflow_document_types m JOIN public.dms_document_workflows w ON w.id=m.workflow_id
  WHERE m.document_type_id=replacement.document_type_id AND w.is_active AND w.deleted_at IS NULL) AND replacement.approval_status IS DISTINCT FROM 'approved' THEN
  RAISE EXCEPTION 'Replacement approval is required' USING ERRCODE='22023';
 END IF;
 SELECT requires_expiry_tracking INTO track_expiry FROM public.dms_document_types WHERE id=replacement.document_type_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Replacement type is unavailable' USING ERRCODE='22023'; END IF;
 expiry:=replacement.expiry_date;
 IF p_expiry IS NOT NULL AND p_expiry IS DISTINCT FROM expiry THEN RAISE EXCEPTION 'Replacement expiry changed; review its metadata first' USING ERRCODE='PT409'; END IF;
 IF track_expiry AND expiry IS NULL THEN RAISE EXCEPTION 'Replacement expiry is required' USING ERRCODE='22023'; END IF;
 UPDATE public.dms_renewal_requests SET status='renewed',replacement_document_id=replacement.id,replacement_version_id=p_version,
  new_expiry_date=expiry,notes=coalesce(p_notes,r.notes),completed_at=at_time,updated_at=at_time,updated_by=actor WHERE id=r.id;
 UPDATE public.dms_documents SET status='superseded',superseded_by_document_id=replacement.id,is_archived=true,archived_at=at_time,
  updated_by=actor,updated_at=at_time WHERE id=original.id;
 UPDATE public.dms_expiry_reminders SET status='dismissed',dismissed_by=actor,dismissed_at=at_time,
  dismissal_reason='Renewal completed',updated_at=at_time WHERE document_id=original.id AND status='pending';
 IF track_expiry AND expiry IS NOT NULL THEN
  IF EXISTS(SELECT 1 FROM public.dms_expiry_reminders WHERE document_id=replacement.id AND status='pending') THEN intent:='schedule_retained';
  ELSE
   -- Reuse the deployed F06 automatic defaults; retain an existing schedule.
   FOREACH days IN ARRAY ARRAY[90,60,30,14,7,1] LOOP
    INSERT INTO public.dms_expiry_reminders(document_id,reminder_days_before,reminder_date,status) VALUES(replacement.id,days,expiry-days,'pending');
   END LOOP;
   intent:='schedule_created';
  END IF;
 END IF;
 receipt:=jsonb_build_object('renewalId',r.id,'documentId',original.id,'replacementDocumentId',replacement.id,'status','renewed','replayed',false,'reminderIntent',intent);
 INSERT INTO public.dms_document_events(document_id,event_type,description,performed_by,metadata_json)
  VALUES(original.id,'document_renewed','Document renewed and superseded by its reviewed replacement',actor,
   receipt||jsonb_build_object('old_expiry_date',original.expiry_date,'new_expiry_date',expiry,'replacement_version_id',p_version));
 INSERT INTO public.audit_logs(actor_user_profile_id,owner_company_id,branch_id,module_code,entity_name,entity_id,entity_reference,action,old_values,new_values)
  VALUES(actor,original.owning_company_id,original.owning_branch_id,'DMS','dms_renewal_requests',r.id,coalesce(r.renewal_no,r.id::text),'update',
   jsonb_build_object('status',r.status),receipt);
 INSERT INTO erp_private.f07_renewal_receipts(request_id,actor_id,payload,receipt) VALUES(r.id,actor,payload,receipt);
 RETURN receipt;
END $$;
REVOKE ALL ON FUNCTION erp_private.f07_complete_renewal(bigint,bigint,bigint,date,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION erp_private.f07_complete_renewal(bigint,bigint,bigint,date,text) TO authenticated;
CREATE FUNCTION public.f07_complete_document_renewal(p_request bigint,p_replacement bigint,p_version bigint DEFAULT NULL,p_expiry date DEFAULT NULL,p_notes text DEFAULT NULL)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT erp_private.f07_complete_renewal($1,$2,$3,$4,$5); $$;
REVOKE ALL ON FUNCTION public.f07_complete_document_renewal(bigint,bigint,bigint,date,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.f07_complete_document_renewal(bigint,bigint,bigint,date,text) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
