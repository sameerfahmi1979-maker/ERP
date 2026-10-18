-- Discovery and authority qualification are independent of delivery. A worker
-- can yield before creating notices without losing completed qualification.
BEGIN;
SET LOCAL lock_timeout='5s';SET LOCAL statement_timeout='60s';
ALTER TABLE erp_private.notification_events ADD COLUMN routing_started_at timestamptz;
CREATE TABLE erp_private.notification_routing_candidates(
 event_id bigint NOT NULL REFERENCES erp_private.notification_events(id),
 profile_id bigint NOT NULL REFERENCES public.user_profiles(id),eligible boolean,
 qualified_at timestamptz,PRIMARY KEY(event_id,profile_id),
 CHECK((eligible IS NULL)=(qualified_at IS NULL))
);
CREATE INDEX f10_unqualified_recipient ON erp_private.notification_routing_candidates(event_id,profile_id) WHERE eligible IS NULL;
ALTER TABLE erp_private.notification_routing_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_private.notification_routing_candidates FORCE ROW LEVEL SECURITY;
REVOKE ALL ON erp_private.notification_routing_candidates FROM PUBLIC,anon,authenticated,service_role;

-- A single bounded indexed inventory replaces offset paging over every role
-- assignment. This is discovery only, never an authorization decision.
CREATE FUNCTION public.f10_notification_role_candidates() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE ids bigint[];
BEGIN
 SELECT coalesce(array_agg(s.user_profile_id ORDER BY s.user_profile_id),'{}'::bigint[]) INTO ids FROM (
  SELECT DISTINCT r.user_profile_id FROM public.user_roles r JOIN public.user_profiles p ON p.id=r.user_profile_id
  WHERE r.is_active AND p.status='active' AND NOT p.must_change_password ORDER BY r.user_profile_id LIMIT 20001
 ) s;
 IF cardinality(ids)>20000 THEN RAISE EXCEPTION 'Recipient cohort exceeds reviewed capacity' USING ERRCODE='54000';END IF;
 RETURN to_jsonb(ids);
END $$;
REVOKE ALL ON FUNCTION public.f10_notification_role_candidates() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.f10_notification_role_candidates() TO service_role;

CREATE FUNCTION public.f10_prepare_notification_routing(event_id bigint,lease uuid,candidates bigint[]) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE e erp_private.notification_events;
BEGIN
 IF $3 IS NULL OR cardinality($3)>20000 OR array_position($3,NULL) IS NOT NULL
  OR EXISTS(SELECT 1 FROM unnest($3) p WHERE p<1) THEN RAISE EXCEPTION 'Invalid candidate cohort' USING ERRCODE='22023';END IF;
 SELECT * INTO e FROM erp_private.notification_events WHERE id=$1 AND state='processing' AND lease_token=$2 AND lease_expires_at>statement_timestamp() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Lease unavailable' USING ERRCODE='PT409';END IF;
 -- A lost response or later source/role change cannot enlarge this cohort.
 IF e.resolved_at IS NOT NULL OR e.routing_started_at IS NOT NULL THEN RETURN true;END IF;
 INSERT INTO erp_private.notification_routing_candidates(event_id,profile_id) SELECT $1,p FROM unnest($3) p GROUP BY p;
 UPDATE erp_private.notification_events SET routing_started_at=statement_timestamp() WHERE id=$1;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.f10_prepare_notification_routing(bigint,uuid,bigint[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.f10_prepare_notification_routing(bigint,uuid,bigint[]) TO service_role;

CREATE FUNCTION public.f10_qualify_notification_candidate(event_id bigint,lease uuid,profile_id bigint,eligible boolean) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE prior boolean;
BEGIN
 IF $4 IS NULL THEN RAISE EXCEPTION 'Qualification required' USING ERRCODE='22023';END IF;
 PERFORM 1 FROM erp_private.notification_events WHERE id=$1 AND state='processing' AND lease_token=$2 AND lease_expires_at>statement_timestamp()
  AND routing_started_at IS NOT NULL AND resolved_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unresolved routing lease unavailable' USING ERRCODE='PT409';END IF;
 SELECT r.eligible INTO prior FROM erp_private.notification_routing_candidates r WHERE r.event_id=$1 AND r.profile_id=$3 FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Candidate not discovered' USING ERRCODE='22023';END IF;
 IF prior IS NOT NULL THEN
  IF prior IS DISTINCT FROM $4 THEN RAISE EXCEPTION 'Qualification identity changed' USING ERRCODE='PT409';END IF;
  RETURN true;
 END IF;
 UPDATE erp_private.notification_routing_candidates r SET eligible=$4,qualified_at=statement_timestamp() WHERE r.event_id=$1 AND r.profile_id=$3;
 INSERT INTO erp_private.notification_resolution_decisions(event_id,lease,profile_id,eligible,reason)
 VALUES($1,$2,$3,$4,CASE WHEN $4 THEN 'current_authority_verified' ELSE 'not_currently_eligible' END);
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.f10_qualify_notification_candidate(bigint,uuid,bigint,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.f10_qualify_notification_candidate(bigint,uuid,bigint,boolean) TO service_role;

-- Guard even a direct machine call against skipping unfinished qualification.
DO $$DECLARE body text;needle text:='IF e.resolved_at IS NULL THEN';BEGIN
 SELECT pg_get_functiondef('public.f10_plan_notification_recipients(bigint,uuid,bigint[])'::regprocedure) INTO body;
 IF (length(body)-length(replace(body,needle,'')))/length(needle)<>1 THEN RAISE EXCEPTION 'Recipient plan contract changed';END IF;
 EXECUTE replace(body,needle,$patch$IF e.resolved_at IS NULL THEN
  IF e.routing_started_at IS NOT NULL AND (
   EXISTS(SELECT 1 FROM erp_private.notification_routing_candidates c WHERE c.event_id=e.id AND c.eligible IS NULL)
   OR EXISTS((SELECT c.profile_id FROM erp_private.notification_routing_candidates c WHERE c.event_id=e.id AND c.eligible)
    EXCEPT SELECT unnest($3))
   OR EXISTS((SELECT unnest($3)) EXCEPT SELECT c.profile_id FROM erp_private.notification_routing_candidates c WHERE c.event_id=e.id AND c.eligible)
  ) THEN RAISE EXCEPTION 'Qualification incomplete or recipient cohort changed' USING ERRCODE='PT409';END IF;$patch$);
END $$;

CREATE FUNCTION public.f10_notification_routing_work(event_id bigint,lease uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE e erp_private.notification_events;candidate bigint;ids bigint[];recipients jsonb;
BEGIN
 SELECT * INTO e FROM erp_private.notification_events WHERE id=$1 AND state='processing' AND lease_token=$2 AND lease_expires_at>statement_timestamp() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Lease unavailable' USING ERRCODE='PT409';END IF;
 IF e.resolved_at IS NOT NULL THEN
  recipients:=public.f10_plan_notification_recipients($1,$2,'{}'::bigint[]);
  RETURN jsonb_build_object('phase','ready','recipients',recipients);
 END IF;
 IF e.routing_started_at IS NULL THEN RETURN jsonb_build_object('phase','discover');END IF;
 SELECT c.profile_id INTO candidate FROM erp_private.notification_routing_candidates c WHERE c.event_id=$1 AND c.eligible IS NULL ORDER BY c.profile_id LIMIT 1;
 IF FOUND THEN RETURN jsonb_build_object('phase','qualify','profile_id',candidate);END IF;
 SELECT coalesce(array_agg(c.profile_id ORDER BY c.profile_id),'{}'::bigint[]) INTO ids FROM (
  SELECT r.profile_id FROM erp_private.notification_routing_candidates r WHERE r.event_id=$1 AND r.eligible ORDER BY r.profile_id LIMIT 5001
 ) c;
 IF cardinality(ids)>5000 THEN RAISE EXCEPTION 'Eligible roster exceeds reviewed capacity' USING ERRCODE='54000';END IF;
 recipients:=public.f10_plan_notification_recipients($1,$2,ids);
 RETURN jsonb_build_object('phase','ready','recipients',recipients);
END $$;
REVOKE ALL ON FUNCTION public.f10_notification_routing_work(bigint,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.f10_notification_routing_work(bigint,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.f10_finish_notification_event(event_id bigint,lease uuid,outcome text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE e erp_private.notification_events;
BEGIN
 IF $3 NOT IN ('complete','retry','held','pending') OR $3 IS NULL THEN RAISE EXCEPTION 'Invalid outcome' USING ERRCODE='22023'; END IF;
 SELECT * INTO e FROM erp_private.notification_events WHERE id=$1 AND state='processing' AND lease_token=$2
 AND lease_expires_at>statement_timestamp() FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 IF $3='complete' AND (e.resolved_at IS NULL OR NOT EXISTS(SELECT 1 FROM erp_private.notification_event_recipients r WHERE r.event_id=e.id)
  OR EXISTS(SELECT 1 FROM erp_private.notification_event_recipients r WHERE r.event_id=e.id AND (r.state<>'created' OR r.outcome LIKE '%_held_%'))) THEN
  RAISE EXCEPTION 'Recipient outcomes incomplete' USING ERRCODE='PT409'; END IF;
 IF $3='pending' AND NOT (
  (e.resolved_at IS NULL AND e.routing_started_at IS NOT NULL) OR
  (e.resolved_at IS NOT NULL AND EXISTS(SELECT 1 FROM erp_private.notification_event_recipients r WHERE r.event_id=e.id AND
   (r.state='pending' OR (r.state='created' AND r.outcome IN ('in_app_created_email_held_no_verified_mailbox','email_only_held_no_verified_mailbox')))))
 ) THEN RAISE EXCEPTION 'No pending work to yield' USING ERRCODE='PT409'; END IF;
 UPDATE erp_private.notification_events SET state=CASE WHEN $3='retry' AND attempt_count>=5 THEN 'held' ELSE $3 END,
  attempt_count=CASE WHEN $3='pending' THEN greatest(0,attempt_count-1) ELSE attempt_count END,
  lease_token=NULL,lease_expires_at=NULL,last_outcome=CASE WHEN $3='pending' THEN CASE WHEN e.resolved_at IS NULL THEN 'bounded_routing_yield' ELSE 'bounded_fanout_yield' END ELSE $3 END,
  next_attempt_at=statement_timestamp()+interval '1 minute',completed_at=CASE WHEN $3='complete' THEN statement_timestamp() ELSE NULL END WHERE id=e.id;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.f10_finish_notification_event(bigint,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.f10_finish_notification_event(bigint,uuid,text) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
