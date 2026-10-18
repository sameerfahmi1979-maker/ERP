-- The independent notification-admission tick never dispatches an email.
-- Installation is paused; only the separately reviewed release can enable it.
BEGIN;
SET LOCAL lock_timeout='5s';SET LOCAL statement_timeout='60s';
CREATE TABLE erp_private.notification_dispatch_control(
 id smallint PRIMARY KEY CHECK(id=1),enabled boolean NOT NULL DEFAULT false
);
INSERT INTO erp_private.notification_dispatch_control(id) VALUES(1);
CREATE TABLE erp_private.notification_dispatch_requests(
 request_id bigint PRIMARY KEY,requested_at timestamptz NOT NULL DEFAULT statement_timestamp()
);
CREATE INDEX f10_dispatch_requested ON erp_private.notification_dispatch_requests(requested_at DESC);
ALTER TABLE erp_private.notification_dispatch_control ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_private.notification_dispatch_control FORCE ROW LEVEL SECURITY;
ALTER TABLE erp_private.notification_dispatch_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_private.notification_dispatch_requests FORCE ROW LEVEL SECURITY;
REVOKE ALL ON erp_private.notification_dispatch_control,erp_private.notification_dispatch_requests FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION erp_private.f10_dispatch_notification_tick() RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE key text;matching bigint;request bigint;
BEGIN
 -- Concurrent scheduler submissions serialize without holding a lock while
 -- waiting for HTTP. Admission itself has separate SKIP LOCKED event leases.
 IF NOT pg_catalog.pg_try_advisory_xact_lock(187710,10) THEN RETURN NULL;END IF;
 IF NOT EXISTS(SELECT 1 FROM erp_private.notification_dispatch_control c WHERE c.id=1 AND c.enabled) THEN RETURN NULL;END IF;
 -- A minute tick must not stack another request behind a still-pending one.
 IF EXISTS(SELECT 1 FROM erp_private.notification_dispatch_requests r WHERE r.requested_at>statement_timestamp()-interval '45 seconds') THEN RETURN NULL;END IF;
 SELECT count(*),min(s.decrypted_secret) INTO matching,key FROM vault.decrypted_secrets s WHERE s.name='algt_internal_api_secret';
 IF matching<>1 OR key IS NULL OR length(key)<32 THEN RAISE EXCEPTION 'Notification machine credential unavailable' USING ERRCODE='55000';END IF;
 SELECT net.http_post(
  url:='https://erp.algt.net/api/internal/process-notification-events',
  headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||key),
  body:='{}'::jsonb,timeout_milliseconds:=30000
 ) INTO request;
 IF request IS NULL THEN RAISE EXCEPTION 'Notification tick not queued' USING ERRCODE='55000';END IF;
 INSERT INTO erp_private.notification_dispatch_requests(request_id) VALUES(request);
 RETURN request;
END $$;
REVOKE ALL ON FUNCTION erp_private.f10_dispatch_notification_tick() FROM PUBLIC,anon,authenticated,service_role;

-- Operational observations contain no URLs, headers, credentials, response
-- bodies, source snapshots or employee fields. HTTP 200 is not event completion.
CREATE FUNCTION public.f10_inspect_notification_dispatch() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 IF NOT erp_private.business_principal_is_active() OR NOT(public.current_user_has_permission_globally('notifications.admin') OR public.current_user_has_permission_globally('notifications.manage')) THEN
  RAISE EXCEPTION 'Global notification operations access required' USING ERRCODE='42501';END IF;
 SELECT jsonb_build_object('enabled',coalesce((SELECT enabled FROM erp_private.notification_dispatch_control WHERE id=1),false),
  'delivery_confirmed',false,'requests',coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.requested_at DESC),'[]'::jsonb)) INTO result FROM (
   SELECT r.request_id,r.requested_at,h.status_code,
    CASE WHEN h.id IS NULL THEN 'queued_outcome_unconfirmed' WHEN h.timed_out OR h.error_msg IS NOT NULL THEN 'http_outcome_unconfirmed'
     WHEN h.status_code=200 THEN 'http_accepted_event_outcomes_separate' ELSE 'http_failed' END outcome
   FROM erp_private.notification_dispatch_requests r LEFT JOIN net._http_response h ON h.id=r.request_id ORDER BY r.requested_at DESC LIMIT 20
 ) s;RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.f10_inspect_notification_dispatch() FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.f10_inspect_notification_dispatch() TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
