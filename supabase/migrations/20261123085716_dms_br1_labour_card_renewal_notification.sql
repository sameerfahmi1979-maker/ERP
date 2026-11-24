BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- The exact predecessor's deferred guard owns source evidence, independent
-- approval and reminder rollover. Keep capture in that same transaction.
DO $prerequisite$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_trigger
     WHERE tgrelid = 'public.dms_renewal_requests'::regclass
       AND tgname = 'dms_br1_labour_card_renewal_guard' AND tgdeferrable AND tginitdeferred
       AND tgenabled IN ('O','A')
       AND tgfoid = to_regprocedure('erp_private.dms_br1_labour_card_renewal_guard()')
  ) THEN
    RAISE EXCEPTION 'The exact BR1 renewal guard must be installed and enabled first';
  END IF;
END $prerequisite$;

CREATE FUNCTION erp_private.br1_renewal_notification_binding(p_actor bigint, p_operation uuid, p_capture boolean)
RETURNS TABLE(source_event_id bigint, snapshot jsonb)
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT audit.id, jsonb_build_object(
    'operation_id', mobile.operation, 'document_id', successor.id,
    'renewal_request_id', renewal.id, 'recipient_profile_id', policy.officer_id
  )
  FROM erp_private.mobile_dms_receipts AS mobile
  JOIN public.dms_renewal_requests AS renewal
    ON renewal.document_id = 127 AND to_jsonb(renewal.id) = mobile.result->'request'->'id'
    AND renewal.status = 'renewed' AND renewal.deleted_at IS NULL AND renewal.completed_at IS NOT NULL
    AND renewal.assigned_to = mobile.actor AND renewal.updated_by = mobile.actor
  JOIN public.dms_documents AS predecessor ON predecessor.id = renewal.document_id
    AND predecessor.document_no = 'DMS-2026-000127' AND predecessor.owning_company_id = 1
    AND predecessor.owning_branch_id = 1 AND predecessor.document_type_id = 16
    AND predecessor.status = 'superseded' AND predecessor.is_archived AND predecessor.deleted_at IS NULL
    AND predecessor.superseded_by_document_id = renewal.replacement_document_id
  JOIN public.dms_documents AS successor ON successor.id = renewal.replacement_document_id
    AND successor.id <> predecessor.id AND successor.owning_company_id = 1
    AND successor.owning_branch_id = 1 AND successor.document_type_id = 16
    AND successor.status IN ('active','approved') AND successor.approval_status = 'approved'
    AND NOT successor.is_archived AND successor.deleted_at IS NULL
    AND successor.current_version_id = renewal.replacement_version_id AND successor.expiry_date = renewal.new_expiry_date
  JOIN public.dms_document_types AS type ON type.id = successor.document_type_id
    AND type.type_code = 'LABOUR_CARD' AND type.is_active AND type.deleted_at IS NULL
  JOIN erp_private.mobile_dms_renewal_context AS evidence ON evidence.request_id = renewal.id
    AND evidence.parent_type = 'employee' AND evidence.source_version = predecessor.current_version_id
    AND evidence.submitted_doc = successor.id AND evidence.submitted_version = successor.current_version_id
  JOIN erp_private.f07_renewal_receipts AS f07 ON f07.request_id = renewal.id AND f07.actor_id = mobile.actor
    AND (NOT p_capture OR f07.xmin = mobile.xmin)
    AND f07.payload @> jsonb_build_object(
      'replacement_document_id', successor.id, 'replacement_version_id', successor.current_version_id,
      'new_expiry_date', renewal.new_expiry_date
    )
    AND f07.receipt @> jsonb_build_object('renewalId', renewal.id, 'documentId', predecessor.id,
      'replacementDocumentId', successor.id, 'status', 'renewed', 'replayed', false)
    AND f07.receipt->>'reminderIntent' IN ('schedule_created','schedule_retained')
  JOIN LATERAL (
    SELECT min(event.id) AS id FROM public.dms_document_events AS event
     WHERE event.document_id = predecessor.id AND event.event_type = 'document_renewed'
       AND event.performed_by = mobile.actor AND (NOT p_capture OR event.xmin = f07.xmin)
       AND event.metadata_json @> (f07.receipt || jsonb_build_object(
         'replacement_version_id', successor.current_version_id, 'new_expiry_date', renewal.new_expiry_date))
    HAVING count(*) = 1
  ) AS audit ON true
  JOIN erp_private.agent_pdf_policy AS policy
    ON policy.connection_id = 'e73782e5-8595-4fe4-b77d-f2751645f9a8'::uuid
    AND policy.company_id = 1 AND policy.actor_id <> policy.officer_id
  WHERE mobile.actor = p_actor AND mobile.operation = p_operation
    AND mobile.command = 'request/act/renewal' AND mobile.state = 'settled'
    AND mobile.result @> jsonb_build_object('operationId', mobile.operation, 'replayed', false,
      'request', jsonb_build_object('kind', 'renewal', 'status', 'fulfilled', 'canonicalStatus', 'renewed',
        'parent', jsonb_build_object('entityType',evidence.parent_type,'entityId',evidence.parent_id),
        'revision', renewal.workspace_revision, 'assigneeId', mobile.actor,
        'sourceDocumentId', predecessor.id, 'sourceVersionId', predecessor.current_version_id,
        'documentTypeId', 16, 'submittedDocumentId', successor.id, 'submittedVersionId', successor.current_version_id))
    AND EXISTS (SELECT 1 FROM public.dms_document_links AS link WHERE link.document_id = predecessor.id
      AND link.entity_type = evidence.parent_type AND link.entity_id = evidence.parent_id AND link.deleted_at IS NULL)
    AND NOT EXISTS (SELECT 1 FROM public.dms_document_links AS link
      WHERE link.document_id IN (predecessor.id, successor.id) AND link.deleted_at IS NULL
      GROUP BY link.entity_type, link.entity_id HAVING count(DISTINCT link.document_id) <> 2);
$$;

CREATE FUNCTION erp_private.capture_br1_renewal_notification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  bound record;
  event_id bigint;
  recipient_id bigint;
  capture_key text := 'dms-br1-renewal:' || NEW.operation;
BEGIN
  SELECT * INTO bound FROM erp_private.br1_renewal_notification_binding(NEW.actor, NEW.operation, true);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The committed BR1 renewal notification could not be bound' USING ERRCODE = 'PT409';
  END IF;

  recipient_id := (bound.snapshot->>'recipient_profile_id')::bigint;
  -- The configured identity is the entire roster. Freeze it as pending so an
  -- unavailable officer can be retried without reopening recipient discovery.
  -- The worker and locked recorder still decide current delivery authority.
  INSERT INTO erp_private.notification_events(event_key,source_table,source_id,event_type,actor_id,source_snapshot,resolved_at)
  VALUES(capture_key,'dms_document_events',bound.source_event_id,'dms_br1_renewal_committed',NEW.actor,bound.snapshot,statement_timestamp())
  ON CONFLICT(event_key) DO NOTHING RETURNING id INTO event_id;
  IF FOUND THEN
    INSERT INTO erp_private.notification_event_recipients(event_id,profile_id) VALUES(event_id,recipient_id);
  ELSIF NOT EXISTS (
    SELECT 1 FROM erp_private.notification_events AS event WHERE event.event_key = capture_key
      AND event.source_table = 'dms_document_events' AND event.source_id = bound.source_event_id
      AND event.event_type = 'dms_br1_renewal_committed' AND event.actor_id = NEW.actor
      AND event.source_snapshot = bound.snapshot AND event.resolved_at IS NOT NULL
      AND (SELECT array_agg(recipient.profile_id) FROM erp_private.notification_event_recipients AS recipient
        WHERE recipient.event_id = event.id) = ARRAY[recipient_id]
  ) THEN
    RAISE EXCEPTION 'BR1 renewal notification identity conflict' USING ERRCODE = 'PT409';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER f10_capture_br1_renewal_completion
AFTER UPDATE OF state ON erp_private.mobile_dms_receipts
FOR EACH ROW WHEN (
  OLD.state = 'admitted' AND NEW.state = 'settled' AND NEW.command = 'request/act/renewal'
  AND NEW.result @> '{"request":{"kind":"renewal","sourceDocumentId":127,"status":"fulfilled","canonicalStatus":"renewed"}}'::jsonb
)
EXECUTE FUNCTION erp_private.capture_br1_renewal_notification();

CREATE FUNCTION public.f10_br1_renewal_notification_recipient(p_event bigint, p_profile bigint)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM erp_private.notification_events AS event
    JOIN LATERAL erp_private.br1_renewal_notification_binding(
      event.actor_id, CASE WHEN event.source_snapshot->>'operation_id' ~
        '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
        THEN (event.source_snapshot->>'operation_id')::uuid END, false
    ) AS bound ON bound.source_event_id = event.source_id AND bound.snapshot = event.source_snapshot
    JOIN erp_private.agent_pdf_policy AS policy
      ON policy.connection_id = 'e73782e5-8595-4fe4-b77d-f2751645f9a8'::uuid
      AND policy.company_id = 1 AND policy.enabled AND policy.officer_id = p_profile
    JOIN erp_private.agent_sync_checkpoints AS checkpoint
      ON checkpoint.connection_id = policy.connection_id AND NOT checkpoint.paused
    WHERE event.id = p_event AND event.event_type = 'dms_br1_renewal_committed'
      AND event.source_table = 'dms_document_events'
      AND event.event_key = 'dms-br1-renewal:' || (bound.snapshot->>'operation_id')
      AND bound.snapshot->'recipient_profile_id' = to_jsonb(p_profile)
      AND erp_private.ai_mod04_reviewer_eligible(p_profile,(bound.snapshot->>'document_id')::bigint)
  );
$$;

CREATE FUNCTION erp_private.lock_br1_renewal_notification_recipient(p_event bigint, p_profile bigint)
RETURNS boolean LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  bound_document_id bigint;
  bound_request_id bigint;
BEGIN
  IF NOT public.f10_br1_renewal_notification_recipient(p_event, p_profile) THEN RETURN false; END IF;
  SELECT (event.source_snapshot->>'document_id')::bigint, (event.source_snapshot->>'renewal_request_id')::bigint
    INTO STRICT bound_document_id, bound_request_id FROM erp_private.notification_events AS event WHERE event.id = p_event;
  PERFORM 1 FROM erp_private.agent_pdf_policy AS policy
    JOIN erp_private.agent_sync_checkpoints AS checkpoint ON checkpoint.connection_id = policy.connection_id
   WHERE policy.connection_id = 'e73782e5-8595-4fe4-b77d-f2751645f9a8'::uuid
   FOR SHARE OF policy, checkpoint NOWAIT;
  PERFORM erp_private.ai_mod04_lock_profile_authority(p_profile);
  PERFORM 1 FROM public.dms_renewal_requests AS renewal WHERE renewal.id = bound_request_id FOR SHARE NOWAIT;
  PERFORM 1 FROM erp_private.mobile_dms_renewal_context AS evidence WHERE evidence.request_id = bound_request_id FOR SHARE NOWAIT;
  PERFORM 1 FROM public.dms_documents AS doc WHERE doc.id IN (127,bound_document_id) ORDER BY doc.id FOR SHARE NOWAIT;
  PERFORM erp_private.ai_mod04_lock_source(127);
  PERFORM erp_private.ai_mod04_lock_source(bound_document_id);
  RETURN public.f10_br1_renewal_notification_recipient(p_event, p_profile);
END $$;

REVOKE ALL ON FUNCTION erp_private.br1_renewal_notification_binding(bigint,uuid,boolean),
  erp_private.capture_br1_renewal_notification(), erp_private.lock_br1_renewal_notification_recipient(bigint,bigint),
  public.f10_br1_renewal_notification_recipient(bigint,bigint) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.f10_br1_renewal_notification_recipient(bigint,bigint) TO service_role;

-- Compose with the existing deployed recorder and filing event. Require
-- each anchor once so a changed recorder cannot silently bypass the fence.
DO $migration$
DECLARE
  body text := pg_get_functiondef('public.f10_record_notification_recipient(bigint,uuid,bigint,boolean)'::regprocedure);
  resume_body text := pg_get_functiondef('public.f10_resume_notification_channel(bigint,uuid,bigint,boolean)'::regprocedure);
  patch record;
BEGIN
  FOR patch IN SELECT * FROM (VALUES
    ($old$AND NOT erp_private.lock_numbered_filing_notification_recipient(e.id,$3)) THEN $4:=false; END IF;$old$,
      $new$AND NOT erp_private.lock_numbered_filing_notification_recipient(e.id,$3))
   OR (e.event_type='dms_br1_renewal_committed'
     AND NOT erp_private.lock_br1_renewal_notification_recipient(e.id,$3)) THEN $4:=false; END IF;$new$),
    ($old$wants_email:=e.event_type NOT IN ('approval_withdrawn','dms_numbered_filing_committed');$old$,
      $new$wants_email:=e.event_type NOT IN ('approval_withdrawn','dms_numbered_filing_committed','dms_br1_renewal_committed');$new$),
    ($old$ELSE 'ERP task updated' END,$old$,
      $new$WHEN e.event_type='dms_br1_renewal_committed' THEN 'Document renewed' ELSE 'ERP task updated' END,$new$),
    ($old$ELSE 'A task may need your attention. Open the ERP to review its current state and permitted actions.' END,$old$,
      $new$WHEN e.event_type='dms_br1_renewal_committed' THEN 'Open the ERP record to review the renewed document.'
    ELSE 'A task may need your attention. Open the ERP to review its current state and permitted actions.' END,$new$),
    ($old$CASE WHEN e.event_type='dms_numbered_filing_committed'
      THEN jsonb_build_object('operation_id',e.source_snapshot->'operation_id')$old$,
      $new$CASE WHEN e.event_type IN ('dms_numbered_filing_committed','dms_br1_renewal_committed')
      THEN jsonb_build_object('operation_id',e.source_snapshot->'operation_id')$new$)
  ) AS changes(before_text, after_text)
  LOOP
    IF length(body) - length(replace(body,patch.before_text,'')) <> length(patch.before_text) THEN
      RAISE EXCEPTION 'Current F10 recipient recorder does not match the BR1 renewal migration';
    END IF;
    body := replace(body,patch.before_text,patch.after_text);
  END LOOP;
  EXECUTE body;

  FOR patch IN SELECT * FROM (VALUES
    ($old$RETURN jsonb_build_object('state','held','outcome','filing_notification_is_in_app_only'); END IF;$old$,
      $new$RETURN jsonb_build_object('state','held','outcome','filing_notification_is_in_app_only'); END IF;
 IF e.event_type='dms_br1_renewal_committed' THEN
  RETURN jsonb_build_object('state','held','outcome','renewal_notification_is_in_app_only'); END IF;$new$)
  ) AS changes(before_text, after_text)
  LOOP
    IF length(resume_body) - length(replace(resume_body,patch.before_text,'')) <> length(patch.before_text) THEN
      RAISE EXCEPTION 'Current F10 email recovery does not match the BR1 renewal migration';
    END IF;
    resume_body := replace(resume_body,patch.before_text,patch.after_text);
  END LOOP;
  EXECUTE resume_body;
END $migration$;

NOTIFY pgrst, 'reload schema';
COMMIT;
