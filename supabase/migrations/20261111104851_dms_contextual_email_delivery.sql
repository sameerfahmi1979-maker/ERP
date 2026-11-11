BEGIN;
SET LOCAL lock_timeout = '5s';

-- New worker preflight only. Existing producers, queues and workers keep their contracts.
CREATE FUNCTION public.dms_contextual_email_event(p_notification bigint)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  n public.erp_notifications;
  d public.dms_documents;
  e erp_private.notification_events;
  a public.dms_document_approvals;
  today date := (statement_timestamp() AT TIME ZONE 'Asia/Dubai')::date;
  kind text;
  employee_id bigint;
  masked boolean;
  routing jsonb;
BEGIN
  IF auth.jwt()->>'role' IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Internal delivery only' USING ERRCODE='42501';
  END IF;
  SELECT * INTO n FROM public.erp_notifications
  WHERE id=p_notification AND deleted_at IS NULL AND source_module='DMS' AND source_entity_type='dms_documents'
    AND recipient_user_id IS NOT NULL AND channel_email IS TRUE AND scheduled_for<=statement_timestamp()
    AND status IN ('unread','read');
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO d FROM public.dms_documents WHERE id=n.source_entity_id AND deleted_at IS NULL AND NOT is_archived
    AND status NOT IN ('archived','superseded','deleted');
  IF NOT FOUND THEN RETURN NULL; END IF;

  IF n.notification_type IN ('expiry_reminder','document_expired','expired_document') THEN
    IF d.expiry_date IS NULL OR d.expiry_tracking_override='ignored'
      OR NOT EXISTS(SELECT 1 FROM public.erp_email_feature_flags WHERE feature_code='DMS_EXPIRY_EMAILS' AND is_enabled)
      OR NOT public.f10_dms_notification_delivery_eligible(n.id)
      OR NOT EXISTS(SELECT 1 FROM public.dms_notification_queue q
        JOIN public.dms_expiry_reminders r ON r.id=q.reminder_id AND r.document_id=q.document_id
        WHERE q.global_notification_id=n.id AND q.document_id=d.id AND q.recipient_user_id=n.recipient_user_id
          AND (q.notification_type=n.notification_type OR q.notification_type IN ('document_expired','expired_document')
            AND n.notification_type IN ('document_expired','expired_document'))
          AND r.status='pending' AND r.reminder_date<=today AND r.reminder_date+r.reminder_days_before=d.expiry_date) THEN
      RETURN NULL;
    END IF;
    kind := CASE WHEN n.notification_type='expiry_reminder' THEN 'expiry' ELSE 'overdue' END;
    IF (kind='expiry' AND d.expiry_date<today) OR (kind='overdue' AND d.expiry_date>=today) THEN RETURN NULL; END IF;
  ELSIF n.notification_type IN ('approval_submitted','approval_approved','approval_rejected') THEN
    IF coalesce(n.metadata_json->>'f10_event_id','') !~ '^[1-9][0-9]{0,17}$' THEN RETURN NULL; END IF;
    SELECT * INTO e FROM erp_private.notification_events WHERE id=(n.metadata_json->>'f10_event_id')::bigint
      AND source_table='dms_document_events' AND event_type=n.notification_type AND source_snapshot->>'document_id'=d.id::text;
    IF NOT FOUND OR e.actor_id=n.recipient_user_id
      OR NOT EXISTS(SELECT 1 FROM public.dms_document_events x WHERE x.id=e.source_id AND x.document_id=d.id AND x.event_type=e.event_type)
      OR coalesce(e.source_snapshot->'metadata_json'->>'approval_id','') !~ '^[1-9][0-9]{0,17}$' THEN RETURN NULL; END IF;
    SELECT * INTO a FROM public.dms_document_approvals
    WHERE id=(e.source_snapshot->'metadata_json'->>'approval_id')::bigint AND document_id=d.id;
    IF NOT FOUND THEN RETURN NULL; END IF;
    IF e.event_type='approval_submitted' OR e.source_snapshot->'metadata_json'->>'approval_status'='pending_approval' THEN
      IF d.approval_status IS DISTINCT FROM 'pending_approval' OR a.action<>'submitted' OR NOT a.is_current
        OR a.submitted_by=n.recipient_user_id THEN RETURN NULL; END IF;
      routing := public.ai_mod04_approval_recipients(a.id,d.id);
      IF routing->>'state' IS DISTINCT FROM 'assigned' OR NOT coalesce(routing->'profileIds' @> jsonb_build_array(n.recipient_user_id),false) THEN RETURN NULL; END IF;
      kind := 'approval-request';
    ELSE
      kind := CASE e.event_type WHEN 'approval_approved' THEN 'approved' WHEN 'approval_rejected' THEN 'rejected' END;
      IF kind IS NULL OR a.action IS DISTINCT FROM kind OR d.approval_status IS DISTINCT FROM kind
        OR NOT coalesce(n.recipient_user_id IN (a.submitted_by,d.owner_user_id,d.created_by),false)
        OR EXISTS(SELECT 1 FROM public.dms_document_events x WHERE x.document_id=d.id AND x.id>e.source_id
          AND x.event_type IN ('approval_submitted','approval_approved','approval_rejected','approval_withdrawn')) THEN RETURN NULL; END IF;
    END IF;
  ELSE
    RETURN NULL;
  END IF;

  -- Raw file names, notes, document titles and OCR text do not enter the mail payload.
  -- Some legacy documents are labelled internal even though they support sensitive HR records.
  masked := d.confidentiality_level NOT IN ('internal','company')
    OR EXISTS(SELECT 1 FROM public.employee_medical_records WHERE dms_document_id=d.id AND deleted_at IS NULL)
    OR EXISTS(SELECT 1 FROM public.employee_medical_insurances WHERE dms_document_id=d.id AND deleted_at IS NULL)
    OR EXISTS(SELECT 1 FROM public.employee_leave_requests WHERE sick_cert_dms_id=d.id AND deleted_at IS NULL)
    OR EXISTS(SELECT 1 FROM public.employee_disciplinary_records WHERE dms_document_id=d.id AND deleted_at IS NULL)
    OR EXISTS(SELECT 1 FROM public.employee_document_links WHERE dms_document_id=d.id AND deleted_at IS NULL
      AND related_record_type IN ('medical_record','medical_insurance','disciplinary_record'));
  IF NOT masked THEN
    SELECT min(l.entity_id) INTO employee_id FROM public.dms_document_links l
    WHERE l.document_id=d.id AND l.deleted_at IS NULL AND l.entity_type IN ('employee','employee_dependent')
    HAVING count(*)=1 AND bool_and(l.entity_type='employee');
  END IF;
  RETURN jsonb_build_object('event',kind,'documentId',d.id,'recipientId',n.recipient_user_id,'documentNo',d.document_no,'documentUpdatedAt',d.updated_at,
    'typeCode',CASE WHEN NOT masked THEN (SELECT t.type_code FROM public.dms_document_types t WHERE t.id=d.document_type_id AND t.deleted_at IS NULL) END,
    'expiry',CASE WHEN kind IN ('expiry','overdue') AND NOT masked THEN d.expiry_date END,'employeeId',employee_id);
END;
$$;

REVOKE ALL ON FUNCTION public.dms_contextual_email_event(bigint) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.dms_contextual_email_event(bigint) TO service_role;

-- Email-only notifications are intentionally hidden by in-app list RLS.
-- Resolve only this caller's exact due email link, without changing its state.
CREATE FUNCTION erp_private.dms_email_link_type(p_notification bigint,p_document bigint)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT n.notification_type FROM public.erp_notifications n JOIN public.dms_documents d ON d.id=n.source_entity_id
  WHERE n.id=p_notification AND n.source_module='DMS' AND n.source_entity_type='dms_documents'
    AND n.source_entity_id=p_document AND n.channel_email IS TRUE AND n.deleted_at IS NULL
    AND n.scheduled_for<=statement_timestamp() AND n.recipient_user_id=(SELECT public.current_user_profile_id())
    AND n.notification_type IN ('expiry_reminder','document_expired','expired_document','approval_submitted','approval_approved','approval_rejected')
    AND (SELECT erp_private.business_principal_is_active())
    AND erp_private.permission_in_scope('notifications.view',d.owning_company_id,d.owning_branch_id)
    AND erp_private.document_permission(p_document,'dms.documents.view');
$$;
CREATE FUNCTION public.dms_email_link_type(p_notification bigint,p_document bigint)
RETURNS text LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT CASE WHEN public.f10_notification_target('dms_documents',p_document)='/dms/documents/record/'||p_document
    THEN erp_private.dms_email_link_type(p_notification,p_document) END;
$$;
REVOKE ALL ON FUNCTION erp_private.dms_email_link_type(bigint,bigint),public.dms_email_link_type(bigint,bigint)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION erp_private.dms_email_link_type(bigint,bigint),public.dms_email_link_type(bigint,bigint) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
