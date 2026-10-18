-- Durable post-transaction fan-out foundation. Captures future events only;
-- historical notifications/approvals and existing email backlog are not replayed.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
CREATE TABLE erp_private.notification_events(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 event_key text NOT NULL UNIQUE,
 source_table text NOT NULL,
 source_id bigint NOT NULL,
 event_type text NOT NULL,
 actor_id bigint,
 source_snapshot jsonb NOT NULL,
 state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','processing','retry','held','complete')),
 attempt_count integer NOT NULL DEFAULT 0,
 next_attempt_at timestamptz NOT NULL DEFAULT statement_timestamp(),
 lease_token uuid,
 lease_expires_at timestamptz,
 resolved_at timestamptz,
 last_outcome text,
 created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
 completed_at timestamptz
);
CREATE TABLE erp_private.notification_event_recipients(
 event_id bigint NOT NULL REFERENCES erp_private.notification_events(id),
 profile_id bigint NOT NULL REFERENCES public.user_profiles(id),
 state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','created','held')),
 notification_id bigint REFERENCES public.erp_notifications(id),
 email_queue_id bigint REFERENCES public.erp_email_queue(id),
 outcome text,
 PRIMARY KEY(event_id,profile_id)
);
ALTER TABLE erp_private.notification_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_private.notification_events FORCE ROW LEVEL SECURITY;
ALTER TABLE erp_private.notification_event_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_private.notification_event_recipients FORCE ROW LEVEL SECURITY;
REVOKE ALL ON erp_private.notification_events,erp_private.notification_event_recipients FROM PUBLIC,anon,authenticated,service_role;
CREATE INDEX f10_due_event ON erp_private.notification_events(next_attempt_at,id) WHERE state IN ('pending','retry');

CREATE FUNCTION erp_private.f10_capture_business_event() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE row_data jsonb:=to_jsonb(NEW); kind text; key text; actor bigint;
BEGIN
 IF TG_TABLE_NAME='dms_document_events' THEN
  IF NEW.event_type NOT IN ('approval_submitted','approval_approved','approval_rejected','approval_withdrawn') THEN RETURN NEW; END IF;
  kind:=NEW.event_type;key:='dms-approval-event:'||NEW.id;actor:=NEW.performed_by;
  row_data:=jsonb_build_object('document_id',NEW.document_id,'metadata_json',jsonb_build_object(
   'approval_id',NEW.metadata_json->'approval_id','previous_approval_id',NEW.metadata_json->'previous_approval_id',
   'workflow_id',NEW.metadata_json->'workflow_id','step_id',NEW.metadata_json->'step_id','approval_status',NEW.metadata_json->'approval_status'));
 ELSIF TG_TABLE_NAME='erp_report_template_events' THEN
  IF NEW.event_type<>'template_submitted_for_review' THEN RETURN NEW; END IF;
  kind:=NEW.event_type;key:='report-template-event:'||NEW.id;actor:=NEW.actor_user_profile_id;
  row_data:=jsonb_build_object('template_id',NEW.template_id);
 ELSIF TG_TABLE_NAME='dms_review_queue' THEN
  IF TG_OP='UPDATE' AND NEW.assigned_to IS NOT DISTINCT FROM OLD.assigned_to THEN RETURN NEW; END IF;
  IF NEW.deleted_at IS NOT NULL OR NEW.status IN ('resolved','dismissed','cancelled','completed') THEN RETURN NEW; END IF;
  IF NEW.assigned_to IS NULL AND NEW.priority NOT IN ('urgent','high') THEN RETURN NEW; END IF;
  kind:=CASE WHEN NEW.assigned_to IS NOT NULL THEN 'dms_review_queue_assigned' ELSE 'dms_review_queue_critical_item' END;
  key:='dms-review:'||NEW.id||':'||md5(coalesce(NEW.assigned_at,NEW.updated_at,NEW.created_at)::text||':'||coalesce(NEW.assigned_to::text,''));
  actor:=coalesce(NEW.updated_by,NEW.created_by);
  row_data:=jsonb_build_object('document_id',NEW.document_id,'assigned_to',NEW.assigned_to,'priority',NEW.priority);
 ELSE RAISE EXCEPTION 'Unsupported event capture' USING ERRCODE='22023';
 END IF;
 INSERT INTO erp_private.notification_events(event_key,source_table,source_id,event_type,actor_id,source_snapshot)
 VALUES(key,TG_TABLE_NAME,NEW.id,kind,actor,row_data) ON CONFLICT(event_key) DO NOTHING;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION erp_private.f10_capture_business_event() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER f10_approval_event AFTER INSERT ON public.dms_document_events FOR EACH ROW EXECUTE FUNCTION erp_private.f10_capture_business_event();
CREATE TRIGGER f10_template_event AFTER INSERT ON public.erp_report_template_events FOR EACH ROW EXECUTE FUNCTION erp_private.f10_capture_business_event();
CREATE TRIGGER f10_review_event AFTER INSERT OR UPDATE OF assigned_to ON public.dms_review_queue FOR EACH ROW EXECUTE FUNCTION erp_private.f10_capture_business_event();

CREATE FUNCTION public.f10_claim_notification_events(batch_limit integer DEFAULT 20) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 IF $1 IS NULL OR $1<1 OR $1>100 THEN RAISE EXCEPTION 'Invalid batch limit' USING ERRCODE='22023'; END IF;
 -- A retry retains original event/recipient identities; no reset of sent mail.
 UPDATE erp_private.notification_events SET state=CASE WHEN attempt_count>=5 THEN 'held' ELSE 'retry' END,
  lease_token=NULL,lease_expires_at=NULL,last_outcome='expired_lease',next_attempt_at=statement_timestamp()+interval '1 minute'
 WHERE state='processing' AND lease_expires_at<statement_timestamp();
 WITH candidates AS (
  SELECT id FROM erp_private.notification_events WHERE state IN ('pending','retry') AND attempt_count<5
   AND next_attempt_at<=statement_timestamp() ORDER BY next_attempt_at,id FOR UPDATE SKIP LOCKED LIMIT $1
 ), claimed AS (
  UPDATE erp_private.notification_events e SET state='processing',attempt_count=attempt_count+1,
   lease_token=gen_random_uuid(),lease_expires_at=statement_timestamp()+interval '2 minutes'
  FROM candidates c WHERE e.id=c.id RETURNING e.*
 ) SELECT coalesce(jsonb_agg(to_jsonb(c)),'[]') INTO result FROM claimed c;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.f10_claim_notification_events(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.f10_claim_notification_events(integer) TO service_role;

CREATE FUNCTION public.f10_plan_notification_recipients(event_id bigint,lease uuid,recipients bigint[]) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE e erp_private.notification_events; planned jsonb;
BEGIN
 IF $3 IS NULL OR cardinality($3)>5000 OR array_position($3,NULL) IS NOT NULL
  OR EXISTS(SELECT 1 FROM unnest($3) r WHERE r<1) THEN RAISE EXCEPTION 'Invalid recipients' USING ERRCODE='22023'; END IF;
 SELECT * INTO e FROM erp_private.notification_events WHERE id=$1 AND state='processing' AND lease_token=$2
 AND lease_expires_at>statement_timestamp() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Lease unavailable' USING ERRCODE='PT409'; END IF;
 IF e.resolved_at IS NULL THEN
  INSERT INTO erp_private.notification_event_recipients(event_id,profile_id) SELECT e.id,r FROM unnest($3) r GROUP BY r;
  UPDATE erp_private.notification_events SET resolved_at=statement_timestamp() WHERE id=e.id;
 END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]') INTO planned FROM erp_private.notification_event_recipients r WHERE r.event_id=e.id;
 RETURN planned;
END $$;
REVOKE ALL ON FUNCTION public.f10_plan_notification_recipients(bigint,uuid,bigint[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.f10_plan_notification_recipients(bigint,uuid,bigint[]) TO service_role;

CREATE FUNCTION public.f10_finish_notification_event(event_id bigint,lease uuid,outcome text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE e erp_private.notification_events;
BEGIN
 IF $3 NOT IN ('complete','retry','held','pending') OR $3 IS NULL THEN RAISE EXCEPTION 'Invalid outcome' USING ERRCODE='22023'; END IF;
 SELECT * INTO e FROM erp_private.notification_events WHERE id=$1 AND state='processing' AND lease_token=$2
 AND lease_expires_at>statement_timestamp() FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 IF $3='complete' AND (e.resolved_at IS NULL OR NOT EXISTS(SELECT 1 FROM erp_private.notification_event_recipients r WHERE r.event_id=e.id)
  OR EXISTS(SELECT 1 FROM erp_private.notification_event_recipients r WHERE r.event_id=e.id AND r.state<>'created')) THEN
  RAISE EXCEPTION 'Recipient outcomes incomplete' USING ERRCODE='PT409'; END IF;
 IF $3='pending' AND (e.resolved_at IS NULL OR NOT EXISTS(SELECT 1 FROM erp_private.notification_event_recipients r WHERE r.event_id=e.id AND r.state='pending')) THEN
  RAISE EXCEPTION 'No pending work to yield' USING ERRCODE='PT409'; END IF;
 UPDATE erp_private.notification_events SET state=CASE WHEN $3='retry' AND attempt_count>=5 THEN 'held' ELSE $3 END,
  attempt_count=CASE WHEN $3='pending' THEN greatest(0,attempt_count-1) ELSE attempt_count END,
  lease_token=NULL,lease_expires_at=NULL,last_outcome=CASE WHEN $3='pending' THEN 'bounded_fanout_yield' ELSE $3 END,next_attempt_at=statement_timestamp()+interval '1 minute',
  completed_at=CASE WHEN $3='complete' THEN statement_timestamp() ELSE NULL END WHERE id=e.id;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.f10_finish_notification_event(bigint,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.f10_finish_notification_event(bigint,uuid,text) TO service_role;
CREATE FUNCTION public.f10_record_notification_recipient(event_id bigint,lease uuid,profile_id bigint,recipient_allowed boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE e erp_private.notification_events; r erp_private.notification_event_recipients; nid bigint; qid bigint;
 doc_id bigint; source_type text; source_id bigint; module text; path text; wants_email boolean:=false; email text;
 in_app boolean:=true; code text; reminder_source public.dms_notification_queue; settings public.dms_notification_settings;
BEGIN
 SELECT * INTO e FROM erp_private.notification_events WHERE id=$1 AND state='processing' AND lease_token=$2
 AND lease_expires_at>statement_timestamp() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Lease unavailable' USING ERRCODE='PT409'; END IF;
 SELECT * INTO r FROM erp_private.notification_event_recipients planned WHERE planned.event_id=e.id AND planned.profile_id=$3 FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Recipient not planned' USING ERRCODE='22023'; END IF;
 IF r.state='created' THEN RETURN jsonb_build_object('state',r.state,'notificationId',r.notification_id,'emailQueueId',r.email_queue_id,'outcome',r.outcome); END IF;
 IF $4 IS DISTINCT FROM true OR NOT EXISTS(SELECT 1 FROM public.user_profiles p JOIN auth.users u ON u.id=p.auth_user_id
  WHERE p.id=$3 AND p.status='active' AND NOT p.must_change_password AND u.deleted_at IS NULL
   AND (u.banned_until IS NULL OR u.banned_until<=statement_timestamp())) THEN
  UPDATE erp_private.notification_event_recipients planned SET state='held',outcome='recipient_not_currently_authorized' WHERE planned.event_id=e.id AND planned.profile_id=$3;
  RETURN jsonb_build_object('state','held');
 END IF;
 IF e.source_table='dms_notification_queue' THEN
  SELECT * INTO reminder_source FROM public.dms_notification_queue WHERE id=e.source_id FOR UPDATE;
  SELECT * INTO settings FROM public.dms_notification_settings WHERE id=1;
  in_app:=coalesce((e.source_snapshot->>'channel_in_app')::boolean,false);
  wants_email:=coalesce((e.source_snapshot->>'channel_email')::boolean,false);
  IF reminder_source.id IS NULL OR reminder_source.recipient_user_id IS DISTINCT FROM $3
   OR reminder_source.document_id IS DISTINCT FROM (e.source_snapshot->>'document_id')::bigint
   OR reminder_source.status<>'pending' OR reminder_source.scheduled_for>statement_timestamp()
   OR NOT EXISTS(SELECT 1 FROM public.dms_expiry_reminders rem WHERE rem.id=reminder_source.reminder_id AND rem.document_id=reminder_source.document_id AND rem.status='pending' AND rem.reminder_date<=(statement_timestamp() AT TIME ZONE 'Asia/Dubai')::date)
   OR NOT coalesce((e.source_snapshot->>'channels_resolved')::boolean,false)
   OR NOT (in_app OR wants_email) OR NOT coalesce(settings.is_enabled,false)
   OR (in_app AND NOT coalesce(settings.in_app_enabled,false)) OR (wants_email AND NOT coalesce(settings.email_enabled,false)) THEN
   UPDATE erp_private.notification_event_recipients planned SET state='held',outcome='reminder_source_or_channel_not_currently_eligible' WHERE planned.event_id=e.id AND planned.profile_id=$3;
   RETURN jsonb_build_object('state','held');
  END IF;
  IF wants_email AND NOT EXISTS(SELECT 1 FROM public.erp_email_feature_flags f WHERE f.feature_code='DMS_EXPIRY_EMAILS' AND f.is_enabled) THEN
   UPDATE erp_private.notification_event_recipients planned SET state='held',outcome='email_channel_withdrawn_after_capture' WHERE planned.event_id=e.id AND planned.profile_id=$3;
   RETURN jsonb_build_object('state','held');
  END IF;
  code:='DMS_BRIDGE_'||e.source_id;
  -- Never reinterpret or resend a legacy intent during cutover. Review its
  -- original channel/recipient receipts instead of manufacturing a new code.
  IF EXISTS(SELECT 1 FROM public.erp_notifications n WHERE n.notification_code=code) THEN
   UPDATE erp_private.notification_event_recipients planned SET state='held',outcome='legacy_notification_requires_reconciliation' WHERE planned.event_id=e.id AND planned.profile_id=$3;
   RETURN jsonb_build_object('state','held');
  END IF;
  doc_id:=reminder_source.document_id;source_type:='dms_documents';source_id:=doc_id;module:='DMS';path:='/dms/documents/record/'||doc_id;
 ELSIF e.source_table='dms_document_events' THEN
  doc_id:=(e.source_snapshot->>'document_id')::bigint;
  source_type:='dms_documents';source_id:=doc_id;module:='DMS';path:='/dms/documents/record/'||doc_id;
  wants_email:=e.event_type<>'approval_withdrawn';
 ELSIF e.source_table='dms_review_queue' THEN
  source_type:='dms_review_queue';source_id:=e.source_id;module:='DMS';
  doc_id:=(e.source_snapshot->>'document_id')::bigint;
  path:=CASE WHEN doc_id IS NOT NULL THEN '/dms/documents/record/'||doc_id ELSE '/dms/review-queue' END;
 ELSIF e.source_table='erp_report_template_events' THEN
  source_type:='erp_report_templates';source_id:=(e.source_snapshot->>'template_id')::bigint;module:='REPORTS';
  path:='/admin/reports/templates/governance?template_id='||source_id;
 ELSIF e.source_table IN ('employee_leave_requests','employee_attendance_corrections','employee_salary_revisions',
  'employee_payroll_holds','employee_approval_requests','employee_identity_documents','employee_medical_insurances',
  'hr_interviews','hr_offers','hr_onboarding_tasks') THEN
  source_type:=e.source_table;source_id:=e.source_id;module:='HR';
  IF (e.source_snapshot->>'employee_id') IS NOT NULL THEN
   path:='/admin/hr/employees/record/'||(e.source_snapshot->>'employee_id');
  ELSIF (e.source_snapshot->>'candidate_id') IS NOT NULL THEN
   path:='/admin/hr/recruitment/candidates/record/'||(e.source_snapshot->>'candidate_id');
  ELSE RAISE EXCEPTION 'HR destination unresolved' USING ERRCODE='22023'; END IF;
 ELSE RAISE EXCEPTION 'Source adapter unavailable' USING ERRCODE='22023'; END IF;
 -- Never copy source titles, medical data, salary, reasons or raw metadata into
 -- previews. Current destination authorization remains mandatory.
 INSERT INTO public.erp_notifications(notification_code,source_module,source_entity_type,source_entity_id,notification_type,
  severity,title,message,recipient_user_id,channel_in_app,channel_email,action_url,action_label,metadata_json,created_by)
 VALUES(coalesce(code,'F10_EVENT_'||e.id||'_USER_'||$3),module,source_type,source_id,e.event_type,'info','ERP task updated',
  'A task may need your attention. Open the ERP to review its current state and permitted actions.',
  $3,in_app,wants_email,path,'Open task',jsonb_build_object('f10_event_id',e.id),e.actor_id) RETURNING id INTO nid;
 IF reminder_source.id IS NOT NULL THEN
  UPDATE public.dms_notification_queue SET global_notification_id=nid,bridge_status='bridged',bridged_at=statement_timestamp(),updated_at=statement_timestamp()
   WHERE id=reminder_source.id;
 END IF;
 IF wants_email THEN
  SELECT u.email INTO email FROM public.user_profiles p JOIN auth.users u ON u.id=p.auth_user_id
   WHERE p.id=$3 AND u.email_confirmed_at IS NOT NULL AND u.deleted_at IS NULL
    AND u.email IS NOT NULL AND length(btrim(u.email))>0
    AND (u.banned_until IS NULL OR u.banned_until<=statement_timestamp());
  -- Intent remains distinct from processing. Missing mailbox/configuration is
  -- recorded for review, not called sent or silently promoted to another user.
  IF email IS NOT NULL THEN
   INSERT INTO public.erp_email_queue(notification_id,source_module,source_entity_type,source_entity_id,to_emails,
    subject,text_body,created_by)
   VALUES(nid,'DMS','dms_documents',doc_id,ARRAY[email],'ALGT ERP notification',
    'Your ERP notifications are available. Sign in to ALGT ERP to review your notifications. Access to each record is checked in the application.',NULL)
   RETURNING id INTO qid;
   IF reminder_source.id IS NOT NULL THEN
    UPDATE public.dms_notification_queue SET global_email_queue_id=qid,bridge_status='email_queued',email_delivery_status='queued',updated_at=statement_timestamp() WHERE id=reminder_source.id;
   END IF;
  END IF;
 END IF;
 UPDATE erp_private.notification_event_recipients planned SET state='created',notification_id=nid,email_queue_id=qid,
  outcome=CASE WHEN wants_email AND qid IS NULL THEN CASE WHEN in_app THEN 'in_app_created_email_held_no_verified_mailbox' ELSE 'email_only_held_no_verified_mailbox' END
   WHEN qid IS NOT NULL THEN CASE WHEN in_app THEN 'in_app_created_email_queued_not_delivered' ELSE 'email_only_queued_not_delivered' END ELSE 'in_app_only' END
 WHERE planned.event_id=e.id AND planned.profile_id=$3;
 RETURN jsonb_build_object('state','created','notificationId',nid,'emailQueueId',qid,'outcome',
  CASE WHEN wants_email AND qid IS NULL THEN CASE WHEN in_app THEN 'in_app_created_email_held_no_verified_mailbox' ELSE 'email_only_held_no_verified_mailbox' END
   WHEN qid IS NOT NULL THEN CASE WHEN in_app THEN 'in_app_created_email_queued_not_delivered' ELSE 'email_only_queued_not_delivered' END ELSE 'in_app_only' END);
END $$;
REVOKE ALL ON FUNCTION public.f10_record_notification_recipient(bigint,uuid,bigint,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.f10_record_notification_recipient(bigint,uuid,bigint,boolean) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
