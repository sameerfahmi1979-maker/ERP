BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SET LOCAL search_path = '';

-- A reviewed exact-branch control opts into independent extraction fencing.
-- Keep the shared review locker as the single source of authority. The gate
-- sits after Intake and before work, keeping Storage and terminal replay intact.
DO $migration$
DECLARE
  body text;
  predecessor record;
  old_gate constant text := '  PERFORM 1 FROM erp_private.agent_pdf_work w';
  old_call constant text := 'erp_private.dms_lock_sharepoint_br1_review(p_operation,p_session,p_lease,p_actor,p_auth_session)';
BEGIN
  SELECT replace(pg_get_functiondef(
    'erp_private.dms_lock_sharepoint_br1_review(uuid,bigint,uuid,bigint,uuid)'::regprocedure), E'\r\n', E'\n')
  INTO STRICT body;
  IF encode(sha256(convert_to(body,'UTF8')),'hex') <> '4a563dd63ea3d44f02a14e292951cc7de158090d9642218d0dd0638cfd0ab675' THEN
    RAISE EXCEPTION 'Unexpected BR1 review authorization predecessor';
  END IF;
  body := replace(body, 'p_auth_session uuid)', 'p_auth_session uuid, p_guard_extraction boolean)');
  body := replace(body, E'  receipt erp_private.dms_sharepoint_br1_review_state%ROWTYPE;\n',
    E'  receipt erp_private.dms_sharepoint_br1_review_state%ROWTYPE;\n  extraction_allowed boolean;\n');
  body := replace(body, old_gate, $gate$  IF p_guard_extraction THEN
    SELECT NOT c.worker_bound OR (c.enabled AND NOT c.paused AND c.mode='execute')
    INTO extraction_allowed
    FROM erp_private.dms_agent_center_controls c
    WHERE c.company_id=origin.company_id AND c.branch_id=origin.branch_id AND c.agent_key='dms.extraction'
    FOR SHARE;
    IF FOUND AND extraction_allowed IS NOT TRUE THEN
      RAISE EXCEPTION 'SharePoint extraction paused or off' USING ERRCODE='55000';
    END IF;
  END IF;

$gate$ || old_gate);
  EXECUTE body;

  -- Require the exact reviewed service entry points. Abort atomically if
  -- another release has changed one or shifted its worker fence.
  FOR predecessor IN SELECT * FROM (VALUES
    ('public.f07_claim_sharepoint_worker_review(uuid,bigint,uuid,bigint,uuid)'::regprocedure,
     '8ab35d987657b1497b1b341bcd1bbd019b2120d92005515a61259551980c45ce'),
    ('public.f07_reserve_sharepoint_worker_provider_attempt(uuid,bigint,uuid,bigint,uuid,uuid,timestamptz,text,bigint,timestamptz,text,text)'::regprocedure,
     '0a888599b5e51d5aae3cf0a9c683791b02ebc7b1bb144d71948a6495fcf96e05'),
    ('public.f07_publish_sharepoint_worker_review(uuid,bigint,uuid,bigint,uuid,uuid,timestamptz,jsonb)'::regprocedure,
     'e514346c28ec55a5815669690d19ca11052c907b4ac310428275404c293ac9df')
  ) AS signatures(routine, expected_hash)
  LOOP
    body := replace(pg_get_functiondef(predecessor.routine), E'\r\n', E'\n');
    IF encode(sha256(convert_to(body,'UTF8')),'hex') <> predecessor.expected_hash THEN
      RAISE EXCEPTION 'Unexpected BR1 extraction predecessor: %', predecessor.routine;
    END IF;
    EXECUTE replace(body, old_call,
      'erp_private.dms_lock_sharepoint_br1_review(p_operation,p_session,p_lease,p_actor,p_auth_session,true)');
  END LOOP;
END;
$migration$;

CREATE OR REPLACE FUNCTION erp_private.dms_lock_sharepoint_br1_review(
  p_operation uuid, p_session bigint, p_lease uuid, p_actor bigint, p_auth_session uuid
) RETURNS erp_private.dms_sharepoint_intake_origins
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = '' AS $function$
  SELECT erp_private.dms_lock_sharepoint_br1_review(p_operation,p_session,p_lease,p_actor,p_auth_session,false)
$function$;
REVOKE ALL ON FUNCTION erp_private.dms_lock_sharepoint_br1_review(uuid,bigint,uuid,bigint,uuid,boolean)
  FROM PUBLIC, anon, authenticated, service_role, erp_agent_discovery_runtime;

-- Only retire generations which already crossed the extraction claim. A
-- newer lease still staging its original stays intact under Intake control.
CREATE FUNCTION erp_private.dms_sharepoint_br1_retire_extraction_lease() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE
  company bigint := coalesce(NEW.company_id,OLD.company_id);
  branch bigint := coalesce(NEW.branch_id,OLD.branch_id);
  agent text := coalesce(NEW.agent_key,OLD.agent_key);
BEGIN
  IF branch IS NULL OR agent <> 'dms.extraction' OR NOT (coalesce(NEW.worker_bound,false) OR coalesce(OLD.worker_bound,false)) THEN
    RETURN NULL;
  END IF;
  IF TG_OP='UPDATE' AND ROW(NEW.revision,NEW.enabled,NEW.paused,NEW.mode,NEW.worker_bound)
    IS NOT DISTINCT FROM ROW(OLD.revision,OLD.enabled,OLD.paused,OLD.mode,OLD.worker_bound) THEN
    RETURN NULL;
  END IF;

  UPDATE erp_private.agent_pdf_work w
  SET lease_token=NULL, lease_until=NULL, next_attempt_at=clock_timestamp()
  FROM erp_private.dms_sharepoint_intake_origins o
  JOIN erp_private.dms_sharepoint_br1_review_scope m
    ON (m.connection_id,m.item_id,m.source_version,m.company_id,m.branch_id,m.actor_id,m.sha256)
      =(o.connection_id,o.item_id,o.source_version,o.company_id,o.branch_id,o.owner_id,o.sha256)
  JOIN erp_private.dms_sharepoint_br1_review_state s USING (operation_id)
  WHERE o.company_id=company AND o.branch_id=branch AND w.operation_id=o.operation_id
    AND (w.connection_id,w.item_id,w.version,w.company_id,w.actor_id,w.sha256)
      =(o.connection_id,o.item_id,o.source_version,o.company_id,o.owner_id,o.sha256)
    AND w.status='retry' AND s.result_id IS NULL AND s.lease_token=w.lease_token;
  RETURN NULL;
END;
$function$;
REVOKE ALL ON FUNCTION erp_private.dms_sharepoint_br1_retire_extraction_lease()
  FROM PUBLIC, anon, authenticated, service_role, erp_agent_discovery_runtime;

CREATE TRIGGER dms_sharepoint_br1_retire_extraction_lease
  AFTER INSERT OR DELETE OR UPDATE OF revision,enabled,paused,mode,worker_bound
  ON erp_private.dms_agent_center_controls FOR EACH ROW
  EXECUTE FUNCTION erp_private.dms_sharepoint_br1_retire_extraction_lease();

NOTIFY pgrst, 'reload schema';
COMMIT;
