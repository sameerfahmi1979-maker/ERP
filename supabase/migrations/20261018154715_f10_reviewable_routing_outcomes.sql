BEGIN;
SET LOCAL lock_timeout='5s';SET LOCAL statement_timeout='60s';
ALTER TABLE erp_private.notification_events ADD COLUMN routing_hold_reason text
 CHECK(routing_hold_reason IN ('employee_account_link_unresolved','candidate_employee_link_ambiguous','routing_capacity_review_required',
 'no_currently_eligible_recipient','recipient_or_channel_requires_review','authority_or_storage_unconfirmed'));
CREATE FUNCTION public.f10_note_notification_routing_outcome(event_id bigint,lease uuid,reason text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF $3 IS NOT NULL AND $3 NOT IN ('employee_account_link_unresolved','candidate_employee_link_ambiguous','routing_capacity_review_required',
  'no_currently_eligible_recipient','recipient_or_channel_requires_review','authority_or_storage_unconfirmed') THEN
  RAISE EXCEPTION 'Unknown routing outcome' USING ERRCODE='22023';END IF;
 UPDATE erp_private.notification_events SET routing_hold_reason=$3 WHERE id=$1 AND state='processing' AND lease_token=$2 AND lease_expires_at>statement_timestamp();
 RETURN FOUND;
END $$;
REVOKE ALL ON FUNCTION public.f10_note_notification_routing_outcome(bigint,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.f10_note_notification_routing_outcome(bigint,uuid,text) TO service_role;
DO $$DECLARE body text;needle text:='e.last_outcome,';BEGIN
 SELECT pg_get_functiondef('public.f10_inspect_notification_recovery(bigint)'::regprocedure) INTO body;
 IF (length(body)-length(replace(body,needle,'')))/length(needle)<>1 THEN RAISE EXCEPTION 'Recovery inspection contract changed';END IF;
 EXECUTE replace(body,needle,'coalesce(e.routing_hold_reason,e.last_outcome) AS last_outcome,');
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
