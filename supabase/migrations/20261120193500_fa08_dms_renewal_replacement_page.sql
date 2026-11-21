-- ERP-FA-08: one replacement eligibility check for discovery and completion.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE OR REPLACE FUNCTION erp_private.f07_renewal_subjects(p_document bigint)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = '' AS $$
 SELECT coalesce(jsonb_agg(to_jsonb(subject) ORDER BY subject.entity_type, subject.entity_id), '[]'::jsonb)
 FROM (
  SELECT DISTINCT entity_type, entity_id
  FROM public.dms_document_links
  WHERE document_id = p_document AND deleted_at IS NULL
 ) subject;
$$;
REVOKE ALL ON FUNCTION erp_private.f07_renewal_subjects(bigint) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION erp_private.f07_renewal_replacement_eligibility(
 p_request bigint, p_original public.dms_documents, p_replacement public.dms_documents,
 p_original_subjects jsonb, p_version bigint, p_expiry date
)
RETURNS TABLE (issue text, track_expiry boolean)
LANGUAGE plpgsql STABLE SET search_path = '' AS $$
BEGIN
 -- Completion calls this under the original document, replacement and request locks.
 -- Compare every live subject. An unlinked original requires an unlinked replacement.
 issue := CASE
  WHEN p_original.owning_company_id IS NULL
   OR p_original.owning_company_id IS DISTINCT FROM p_replacement.owning_company_id
   OR p_original.owning_branch_id IS DISTINCT FROM p_replacement.owning_branch_id
   OR p_original.document_type_id IS DISTINCT FROM p_replacement.document_type_id
   OR p_replacement.is_archived OR p_replacement.status NOT IN ('active', 'approved') THEN 'scope_or_status'
  WHEN p_original_subjects IS DISTINCT FROM erp_private.f07_renewal_subjects(p_replacement.id) THEN 'subject'
  WHEN EXISTS (
   SELECT 1 FROM public.dms_renewal_requests claim
   WHERE claim.id <> p_request AND claim.status = 'renewed' AND claim.deleted_at IS NULL
     AND claim.replacement_document_id = p_replacement.id
  ) THEN 'claimed'
  WHEN p_version IS NOT NULL AND NOT EXISTS (
   SELECT 1 FROM public.dms_document_versions v WHERE v.id = p_version AND v.document_id = p_replacement.id
  ) THEN 'version'
  WHEN p_replacement.approval_status IS DISTINCT FROM 'approved' AND EXISTS (
   SELECT 1 FROM public.dms_workflow_document_types m
   JOIN public.dms_document_workflows w ON w.id = m.workflow_id
   WHERE m.document_type_id = p_replacement.document_type_id AND w.is_active AND w.deleted_at IS NULL
  ) THEN 'approval'
 END;
 IF issue IS NULL THEN
  SELECT requires_expiry_tracking INTO track_expiry FROM public.dms_document_types WHERE id = p_replacement.document_type_id;
  issue := CASE
   WHEN NOT FOUND THEN 'type'
   WHEN p_expiry IS NOT NULL AND p_expiry IS DISTINCT FROM p_replacement.expiry_date THEN 'expiry_changed'
   WHEN track_expiry AND p_replacement.expiry_date IS NULL THEN 'expiry_required'
  END;
 END IF;
 RETURN NEXT;
END $$;
REVOKE ALL ON FUNCTION erp_private.f07_renewal_replacement_eligibility(bigint, public.dms_documents, public.dms_documents, jsonb, bigint, date)
 FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.fa08_renewal_replacement_page(
 p_request bigint, p_query text DEFAULT '', p_before bigint DEFAULT NULL, p_limit integer DEFAULT 25
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
 original public.dms_documents;
 original_subjects jsonb;
 term text := lower(btrim(coalesce(p_query, '')));
 result jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT erp_private.business_principal_is_active() THEN
  RAISE EXCEPTION 'Permission denied' USING ERRCODE = '42501';
 END IF;
 IF p_request IS NULL OR p_request <= 0 OR p_before <= 0
   OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50 OR length(term) > 100 THEN
  RAISE EXCEPTION 'Invalid renewal replacement criteria' USING ERRCODE = '22023';
 END IF;

 SELECT d.* INTO original
 FROM public.dms_renewal_requests r JOIN public.dms_documents d ON d.id = r.document_id
 WHERE r.id = p_request AND r.deleted_at IS NULL
  AND r.status IN ('requested', 'in_progress', 'waiting_for_document')
  AND d.deleted_at IS NULL AND NOT d.is_archived AND d.status NOT IN ('archived', 'superseded', 'deleted')
  AND public.current_user_can_view_dms_document(d.id)
  AND (erp_private.document_permission(d.id, 'dms.renewals.manage') OR erp_private.document_permission(d.id, 'dms.admin'))
  AND (erp_private.document_permission(d.id, 'dms.documents.edit') OR erp_private.document_permission(d.id, 'dms.admin'));
 IF NOT FOUND THEN RAISE EXCEPTION 'Renewal unavailable' USING ERRCODE = '42501'; END IF;
 original_subjects := erp_private.f07_renewal_subjects(original.id);

 WITH candidates AS MATERIALIZED (
  SELECT d.id, d.document_no, d.title, d.expiry_date, d.status
  FROM public.dms_documents d
  WHERE d.owning_company_id = original.owning_company_id
   AND d.owning_branch_id IS NOT DISTINCT FROM original.owning_branch_id
   AND d.document_type_id = original.document_type_id
   AND d.id <> original.id AND d.deleted_at IS NULL AND NOT d.is_archived
   AND d.status IN ('active', 'approved') AND (p_before IS NULL OR d.id < p_before)
   AND (term = '' OR strpos(lower(d.document_no), term) > 0 OR strpos(lower(d.title), term) > 0)
   AND public.current_user_can_view_dms_document(d.id)
   AND (erp_private.document_permission(d.id, 'dms.renewals.manage') OR erp_private.document_permission(d.id, 'dms.admin'))
   AND (SELECT eligibility.issue IS NULL
    FROM erp_private.f07_renewal_replacement_eligibility(p_request, original, d, original_subjects, NULL, NULL) eligibility)
  ORDER BY d.id DESC
  LIMIT p_limit + 1
 ), visible AS (
  SELECT * FROM candidates ORDER BY id DESC LIMIT p_limit
 )
 SELECT jsonb_build_object(
  'rows', coalesce(jsonb_agg(to_jsonb(visible) ORDER BY visible.id DESC), '[]'::jsonb),
  'nextBefore', CASE WHEN (SELECT count(*) FROM candidates) > p_limit THEN min(visible.id) END
 ) INTO result FROM visible;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.fa08_renewal_replacement_page(bigint, text, bigint, integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fa08_renewal_replacement_page(bigint, text, bigint, integer) TO authenticated;

CREATE OR REPLACE FUNCTION erp_private.f07_complete_renewal(p_request bigint,p_replacement bigint,p_version bigint,p_expiry date,p_notes text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.dms_renewal_requests; original public.dms_documents; replacement public.dms_documents;
 saved erp_private.f07_renewal_receipts; payload jsonb; receipt jsonb; actor bigint;
 at_time timestamptz:=clock_timestamp(); eligibility_issue text;
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
 SELECT eligibility.issue, eligibility.track_expiry INTO eligibility_issue, track_expiry
 FROM erp_private.f07_renewal_replacement_eligibility(
  r.id, original, replacement, erp_private.f07_renewal_subjects(original.id), p_version, p_expiry
 ) eligibility;
 CASE eligibility_issue
  WHEN 'scope_or_status' THEN RAISE EXCEPTION 'Replacement is not eligible for this renewal' USING ERRCODE='22023';
  WHEN 'subject' THEN RAISE EXCEPTION 'Replacement subject does not match' USING ERRCODE='42501';
  WHEN 'claimed' THEN RAISE EXCEPTION 'Replacement already used' USING ERRCODE='PT409';
  WHEN 'version' THEN RAISE EXCEPTION 'Replacement version does not belong to the replacement' USING ERRCODE='22023';
  WHEN 'approval' THEN RAISE EXCEPTION 'Replacement approval is required' USING ERRCODE='22023';
  WHEN 'type' THEN RAISE EXCEPTION 'Replacement type is unavailable' USING ERRCODE='22023';
  WHEN 'expiry_changed' THEN RAISE EXCEPTION 'Replacement expiry changed; review its metadata first' USING ERRCODE='PT409';
  WHEN 'expiry_required' THEN RAISE EXCEPTION 'Replacement expiry is required' USING ERRCODE='22023';
  ELSE NULL;
 END CASE;
 expiry:=replacement.expiry_date;
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

NOTIFY pgrst, 'reload schema';
COMMIT;
