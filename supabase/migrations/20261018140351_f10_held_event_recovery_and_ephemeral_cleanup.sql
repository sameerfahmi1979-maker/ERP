BEGIN;
SET LOCAL lock_timeout='5s';SET LOCAL statement_timeout='60s';
ALTER TABLE erp_private.notification_events ADD COLUMN recovery_revision bigint NOT NULL DEFAULT 0;
CREATE TABLE erp_private.notification_recovery_operations(
 operation_id uuid PRIMARY KEY,event_id bigint NOT NULL REFERENCES erp_private.notification_events(id),
 actor_id bigint NOT NULL REFERENCES public.user_profiles(id),expected_revision bigint NOT NULL,
 result_revision bigint NOT NULL,created_at timestamptz NOT NULL DEFAULT statement_timestamp()
);
CREATE TABLE erp_private.notification_resolution_decisions(
 event_id bigint NOT NULL REFERENCES erp_private.notification_events(id),lease uuid NOT NULL,
 profile_id bigint NOT NULL REFERENCES public.user_profiles(id),eligible boolean NOT NULL,
 reason text NOT NULL CHECK(reason IN ('current_authority_verified','not_currently_eligible')),
 created_at timestamptz NOT NULL DEFAULT statement_timestamp(),PRIMARY KEY(event_id,lease,profile_id)
);
ALTER TABLE erp_private.notification_recovery_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_private.notification_recovery_operations FORCE ROW LEVEL SECURITY;
ALTER TABLE erp_private.notification_resolution_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_private.notification_resolution_decisions FORCE ROW LEVEL SECURITY;
REVOKE ALL ON erp_private.notification_recovery_operations,erp_private.notification_resolution_decisions FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.f10_record_resolution_decisions(event_id bigint,lease uuid,considered bigint[],eligible bigint[]) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF $3 IS NULL OR $4 IS NULL OR cardinality($3)>20000 OR cardinality($4)>5000
  OR array_position($3,NULL) IS NOT NULL OR array_position($4,NULL) IS NOT NULL
  OR EXISTS(SELECT 1 FROM unnest($3||$4) p WHERE p<1)
  OR NOT $4<@$3 THEN RAISE EXCEPTION 'Invalid routing audit' USING ERRCODE='22023'; END IF;
 PERFORM 1 FROM erp_private.notification_events e WHERE e.id=$1 AND e.state='processing' AND e.lease_token=$2 AND e.lease_expires_at>statement_timestamp() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Lease unavailable' USING ERRCODE='PT409'; END IF;
 INSERT INTO erp_private.notification_resolution_decisions(event_id,lease,profile_id,eligible,reason)
 SELECT $1,$2,p,p=ANY($4),CASE WHEN p=ANY($4) THEN 'current_authority_verified' ELSE 'not_currently_eligible' END
 FROM unnest($3) p GROUP BY p ON CONFLICT DO NOTHING;
 IF EXISTS(SELECT 1 FROM erp_private.notification_resolution_decisions d WHERE d.event_id=$1 AND d.lease=$2 AND d.eligible IS DISTINCT FROM (d.profile_id=ANY($4))) THEN
  RAISE EXCEPTION 'Routing audit changed within lease' USING ERRCODE='PT409'; END IF;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.f10_record_resolution_decisions(bigint,uuid,bigint[],bigint[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.f10_record_resolution_decisions(bigint,uuid,bigint[],bigint[]) TO service_role;

-- Only an unqueued, previously held channel may be prepared. Never reset an
-- existing F09 delivery, including provider-accepted or uncertain outcomes.
CREATE FUNCTION public.f10_resume_notification_channel(event_id bigint,lease uuid,profile_id bigint,recipient_allowed boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE e erp_private.notification_events;r erp_private.notification_event_recipients;n public.erp_notifications;mailbox text;qid bigint;doc bigint;
BEGIN
 SELECT * INTO e FROM erp_private.notification_events x WHERE x.id=$1 AND x.state='processing' AND x.lease_token=$2 AND x.lease_expires_at>statement_timestamp() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Lease unavailable' USING ERRCODE='PT409'; END IF;
 SELECT * INTO r FROM erp_private.notification_event_recipients x WHERE x.event_id=$1 AND x.profile_id=$3 FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Recipient not planned' USING ERRCODE='22023'; END IF;
 IF r.state<>'created' OR r.outcome NOT IN ('in_app_created_email_held_no_verified_mailbox','email_only_held_no_verified_mailbox') OR r.email_queue_id IS NOT NULL THEN
  RETURN jsonb_build_object('state',r.state,'outcome',r.outcome);END IF;
 SELECT * INTO n FROM public.erp_notifications WHERE id=r.notification_id FOR UPDATE;
 IF $4 IS DISTINCT FROM true OR n.id IS NULL OR n.deleted_at IS NOT NULL OR n.recipient_user_id IS DISTINCT FROM $3 OR NOT n.channel_email
  OR n.source_entity_type<>'dms_documents' OR n.metadata_json->>'f10_event_id' IS DISTINCT FROM $1::text THEN
  RETURN jsonb_build_object('state','held','outcome','original_channel_not_currently_authorized');END IF;
 IF e.source_table NOT IN ('dms_document_events','dms_notification_queue') THEN RAISE EXCEPTION 'Unsupported email source' USING ERRCODE='22023';END IF;
 doc:=(e.source_snapshot->>'document_id')::bigint;
 IF n.source_entity_id IS DISTINCT FROM doc OR NOT public.f10_dms_notification_delivery_eligible(n.id)
  OR NOT EXISTS(SELECT 1 FROM public.dms_documents d WHERE d.id=doc AND d.deleted_at IS NULL AND NOT d.is_archived AND d.status NOT IN ('archived','superseded','deleted')) THEN
  RETURN jsonb_build_object('state','held','outcome','original_source_not_currently_eligible');END IF;
 -- A matching existing intent is reconciled, never requeued or altered.
 SELECT id INTO qid FROM public.erp_email_queue q WHERE q.notification_id=n.id;
 IF qid IS NOT NULL THEN RETURN jsonb_build_object('state','held','outcome','existing_email_requires_reconciliation');END IF;
 SELECT u.email INTO mailbox FROM public.user_profiles p JOIN auth.users u ON u.id=p.auth_user_id WHERE p.id=$3
  AND p.status='active' AND NOT p.must_change_password AND u.deleted_at IS NULL AND u.email_confirmed_at IS NOT NULL
  AND (u.banned_until IS NULL OR u.banned_until<=statement_timestamp()) AND nullif(btrim(u.email),'') IS NOT NULL;
 IF mailbox IS NULL THEN RETURN jsonb_build_object('state',r.state,'outcome',r.outcome);END IF;
 INSERT INTO public.erp_email_queue(notification_id,source_module,source_entity_type,source_entity_id,to_emails,subject,text_body,created_by)
 VALUES(n.id,'DMS','dms_documents',doc,ARRAY[mailbox],'ALGT ERP notification',
 'Your ERP notifications are available. Sign in to ALGT ERP to review your notifications. Access to each record is checked in the application.',NULL) RETURNING id INTO qid;
 UPDATE erp_private.notification_event_recipients x SET email_queue_id=qid,outcome=CASE WHEN n.channel_in_app THEN 'in_app_created_email_queued_not_delivered' ELSE 'email_only_queued_not_delivered' END WHERE x.event_id=$1 AND x.profile_id=$3;
 IF e.source_table='dms_notification_queue' THEN
  UPDATE public.dms_notification_queue SET global_email_queue_id=qid,bridge_status='email_queued',email_delivery_status='queued',updated_at=statement_timestamp()
   WHERE id=e.source_id AND global_notification_id=n.id AND global_email_queue_id IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Original reminder channel changed' USING ERRCODE='PT409';END IF;
 END IF;
 RETURN jsonb_build_object('state','created','outcome',CASE WHEN n.channel_in_app THEN 'in_app_created_email_queued_not_delivered' ELSE 'email_only_queued_not_delivered' END);
END $$;
REVOKE ALL ON FUNCTION public.f10_resume_notification_channel(bigint,uuid,bigint,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.f10_resume_notification_channel(bigint,uuid,bigint,boolean) TO service_role;

-- A bounded yield may also have an unfinished held channel on a created notice.
DO $$DECLARE body text;needle text:='r.state=''pending''';BEGIN
 SELECT pg_get_functiondef('public.f10_finish_notification_event(bigint,uuid,text)'::regprocedure) INTO body;
 IF (length(body)-length(replace(body,needle,'')))/length(needle)<>1 THEN RAISE EXCEPTION 'Finish contract changed; review before migration';END IF;
 body:=replace(body,needle,'(r.state=''pending'' OR (r.state=''created'' AND r.outcome IN (''in_app_created_email_held_no_verified_mailbox'',''email_only_held_no_verified_mailbox'')))');
 needle:='r.state<>''created''';
 IF (length(body)-length(replace(body,needle,'')))/length(needle)<>1 THEN RAISE EXCEPTION 'Complete contract changed; review before migration';END IF;
 EXECUTE replace(body,needle,'(r.state<>''created'' OR r.outcome LIKE ''%_held_%'')');
END $$;

CREATE FUNCTION public.f10_inspect_notification_recovery(before_id bigint DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 IF NOT erp_private.business_principal_is_active() OR NOT(public.current_user_has_permission_globally('notifications.admin') OR public.current_user_has_permission_globally('notifications.manage')) THEN
  RAISE EXCEPTION 'Global notification recovery access required' USING ERRCODE='42501';END IF;
 IF $1 IS NOT NULL AND $1<1 THEN RAISE EXCEPTION 'Invalid cursor' USING ERRCODE='22023';END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.id DESC),'[]') INTO result FROM (
  SELECT e.id,e.source_table,e.event_type,e.state,e.attempt_count,e.recovery_revision,e.created_at,e.last_outcome,
   (SELECT count(*) FROM erp_private.notification_event_recipients r WHERE r.event_id=e.id AND r.state='pending') pending_recipients,
   (SELECT count(*) FROM erp_private.notification_event_recipients r WHERE r.event_id=e.id AND (r.state='held' OR r.outcome LIKE '%_held_%')) held_recipients,
   (SELECT count(*) FROM erp_private.notification_resolution_decisions d WHERE d.event_id=e.id AND NOT d.eligible) omitted_decisions
  FROM erp_private.notification_events e WHERE e.state IN ('held','retry','processing','pending') AND ($1 IS NULL OR e.id<$1) ORDER BY e.id DESC LIMIT 50
 ) s;RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.f10_inspect_notification_recovery(bigint) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.f10_inspect_notification_recovery(bigint) TO authenticated;

CREATE FUNCTION public.f10_retry_held_notification_event(event_id bigint,expected_revision bigint,operation_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE e erp_private.notification_events;prior erp_private.notification_recovery_operations;actor bigint:=public.current_user_profile_id();
BEGIN
 IF NOT erp_private.business_principal_is_active() OR NOT(public.current_user_has_permission_globally('notifications.admin') OR public.current_user_has_permission_globally('notifications.manage')) THEN
  RAISE EXCEPTION 'Global notification recovery access required' USING ERRCODE='42501';END IF;
 IF $1 IS NULL OR $1<1 OR $2 IS NULL OR $2<0 OR $3 IS NULL THEN RAISE EXCEPTION 'Invalid recovery identity' USING ERRCODE='22023';END IF;
 SELECT * INTO e FROM erp_private.notification_events WHERE id=$1 FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Event unavailable' USING ERRCODE='P0002';END IF;
 SELECT * INTO prior FROM erp_private.notification_recovery_operations WHERE notification_recovery_operations.operation_id=$3;
 IF FOUND THEN
  IF ROW(prior.event_id,prior.actor_id,prior.expected_revision) IS DISTINCT FROM ROW($1,actor,$2) THEN RAISE EXCEPTION 'Recovery identity conflict' USING ERRCODE='PT409';END IF;
  RETURN jsonb_build_object('id',$1,'revision',prior.result_revision,'status','pending');END IF;
 IF e.state<>'held' OR e.recovery_revision<>$2 THEN RAISE EXCEPTION 'Refresh changed recovery state' USING ERRCODE='PT409';END IF;
 -- Never enlarge a frozen roster or reset created notification/email receipts.
 UPDATE erp_private.notification_event_recipients r SET state='pending',outcome=NULL WHERE r.event_id=$1 AND r.state='held' AND r.notification_id IS NULL AND r.email_queue_id IS NULL;
 UPDATE erp_private.notification_events SET state='pending',attempt_count=0,next_attempt_at=statement_timestamp(),lease_token=NULL,lease_expires_at=NULL,
  recovery_revision=recovery_revision+1,last_outcome='operator_requested_current_authority_recheck' WHERE id=$1;
 INSERT INTO erp_private.notification_recovery_operations VALUES($3,$1,actor,$2,$2+1,statement_timestamp());
 RETURN jsonb_build_object('id',$1,'revision',$2+1,'status','pending');
END $$;
REVOKE ALL ON FUNCTION public.f10_retry_held_notification_event(bigint,bigint,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.f10_retry_held_notification_event(bigint,bigint,uuid) TO authenticated;

-- Ephemeral capability tickets only; no notification or business history purged.
CREATE FUNCTION public.f10_cleanup_expired_open_intents(batch_limit integer DEFAULT 500) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE removed bigint;
BEGIN
 IF $1 IS NULL OR $1<1 OR $1>1000 THEN RAISE EXCEPTION 'Invalid cleanup limit' USING ERRCODE='22023';END IF;
 WITH expired AS (SELECT token FROM erp_private.notification_open_intents WHERE expires_at<statement_timestamp() ORDER BY expires_at,token FOR UPDATE SKIP LOCKED LIMIT $1),
 gone AS (DELETE FROM erp_private.notification_open_intents n USING expired x WHERE n.token=x.token RETURNING 1) SELECT count(*) INTO removed FROM gone;RETURN removed;
END $$;
REVOKE ALL ON FUNCTION public.f10_cleanup_expired_open_intents(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.f10_cleanup_expired_open_intents(integer) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
