
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';

CREATE TABLE erp_private.t17_payslip_deliveries (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slip_id bigint NOT NULL REFERENCES erp_private.t17_slips(id),
  kind text NOT NULL CHECK(kind IN ('initial','resend','print')),
  channel text NOT NULL CHECK(channel IN ('email','print')),
  recipient text CHECK(recipient=lower(btrim(recipient)) AND length(recipient)<=254),
  actor_id bigint NOT NULL REFERENCES public.user_profiles(id),
  reason text CHECK(length(reason) BETWEEN 3 AND 250),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK((channel='email')=(recipient IS NOT NULL)),
  CHECK((kind='initial' AND reason IS NULL) OR (kind<>'initial' AND reason IS NOT NULL)),
  CHECK(kind<>'resend' OR channel='email'),
  CHECK(kind<>'print' OR channel='print')
);
CREATE UNIQUE INDEX t17_one_initial_delivery ON erp_private.t17_payslip_deliveries(slip_id) WHERE kind='initial';
CREATE INDEX t17_deliveries_slip ON erp_private.t17_payslip_deliveries(slip_id,id DESC);

CREATE TABLE erp_private.t17_payslip_delivery_events (
  delivery_id bigint NOT NULL REFERENCES erp_private.t17_payslip_deliveries(id),
  kind text NOT NULL CHECK(kind IN ('handed_over','bounced','provider_accepted_confirmed','provider_not_accepted_confirmed')),
  actor_id bigint NOT NULL REFERENCES public.user_profiles(id),
  reason text NOT NULL CHECK(length(reason) BETWEEN 3 AND 250),
  reference text CHECK(reference ~ '^[A-Za-z0-9][A-Za-z0-9 ._:/#-]{2,119}$'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(delivery_id,kind),
  CHECK((kind<>'handed_over')=(reference IS NOT NULL))
);
CREATE UNIQUE INDEX t17_delivery_one_confirmed_outcome
 ON erp_private.t17_payslip_delivery_events(delivery_id)
 WHERE kind IN ('provider_accepted_confirmed','provider_not_accepted_confirmed');
ALTER TABLE erp_private.t17_payslip_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_private.t17_payslip_delivery_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON erp_private.t17_payslip_deliveries,erp_private.t17_payslip_delivery_events FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER t17_keep_delivery BEFORE UPDATE OR DELETE ON erp_private.t17_payslip_deliveries
 FOR EACH ROW EXECUTE FUNCTION erp_private.t15_keep_history();
CREATE TRIGGER t17_keep_delivery_event BEFORE UPDATE OR DELETE ON erp_private.t17_payslip_delivery_events
 FOR EACH ROW EXECUTE FUNCTION erp_private.t15_keep_history();

-- This worker marker partitions the source from generic email tools. Only the
-- protected delivery record owns a real destination; generic queue rows do not.
CREATE UNIQUE INDEX t17_email_queue_delivery
  ON public.erp_email_queue(source_entity_id) WHERE source_module='HR_PAYSLIP';
CREATE POLICY t17_private_payslip_queue ON public.erp_email_queue AS RESTRICTIVE FOR SELECT TO authenticated
 USING(source_module<>'HR_PAYSLIP');

CREATE FUNCTION erp_private.t17_mailbox(p_employee bigint)
RETURNS text LANGUAGE sql VOLATILE SET search_path='' AS $$
 SELECT lower(btrim(u.email))
 FROM public.employees e
 JOIN public.erp_user_employee_links l ON l.employee_id=e.id
 JOIN public.user_profiles p ON p.id=l.user_profile_id
 JOIN auth.users u ON u.id=p.auth_user_id
 WHERE e.id=p_employee AND e.deleted_at IS NULL AND e.personal_email IS NOT NULL
   AND lower(btrim(e.personal_email))=lower(btrim(u.email))
   AND length(btrim(u.email)) BETWEEN 3 AND 254
   AND btrim(u.email) ~ '^[^@[:space:],;]+@[^@[:space:],;]+\.[^@[:space:],;]+$'
   AND p.status='active' AND NOT p.must_change_password AND u.deleted_at IS NULL
   AND u.email_confirmed_at<=clock_timestamp()
   AND (u.banned_until IS NULL OR u.banned_until<=clock_timestamp())
 FOR SHARE OF e,l,p,u;
$$;

-- Deferred worker sessions have machine credentials; reacquire the initiating
-- human's current ordinary profile and assignments at the exact employer scope.
CREATE FUNCTION erp_private.t17_delivery_actor_current(p_actor bigint,p_company bigint,p_branch bigint)
RETURNS boolean LANGUAGE plpgsql VOLATILE SET search_path='' AS $$
DECLARE required_code text; found_assignment bigint;
BEGIN
 IF p_company IS NULL OR p_branch IS NULL THEN RETURN false; END IF;
 PERFORM 1 FROM public.user_profiles p
 JOIN auth.users u ON u.id=p.auth_user_id
 JOIN public.owner_companies c ON c.id=p_company
 JOIN public.branches b ON b.id=p_branch AND b.owner_company_id=c.id
 WHERE p.id=p_actor AND p.status='active' AND NOT p.must_change_password AND u.deleted_at IS NULL
   AND (u.banned_until IS NULL OR u.banned_until<=clock_timestamp())
   AND c.status='active' AND b.status='active' AND b.operating_status='active'
 FOR SHARE OF p,u,c,b;
 IF NOT FOUND THEN RETURN false; END IF;
 FOREACH required_code IN ARRAY ARRAY['hr.payroll.view','hr.payroll.payslip.view','hr.payroll.payslip.deliver'] LOOP
   SELECT a.id INTO found_assignment FROM public.user_roles a
   JOIN public.roles r ON r.id=a.role_id AND r.is_active
     AND r.role_code NOT IN ('system_admin','group_admin','company_admin','branch_admin')
   JOIN public.role_permissions rp ON rp.role_id=r.id
   JOIN public.permissions c ON c.id=rp.permission_id AND c.permission_code=required_code AND c.is_active
   WHERE a.user_profile_id=p_actor AND a.owner_company_id=p_company
     AND (a.branch_id IS NULL OR a.branch_id=p_branch) AND a.is_active
     AND NOT EXISTS (SELECT 1 FROM erp_private.t02_role_validity v
       WHERE v.assignment_id=a.id AND v.valid_until<=clock_timestamp())
   ORDER BY a.id LIMIT 1 FOR SHARE OF a,r,rp,c;
   IF found_assignment IS NULL THEN RETURN false; END IF;
   IF EXISTS (SELECT 1 FROM erp_private.t02_role_validity v
      WHERE v.assignment_id=found_assignment AND v.valid_until<=clock_timestamp()) THEN RETURN false; END IF;
 END LOOP;
 RETURN true;
END;
$$;

CREATE FUNCTION erp_private.t17_delivery_rows(p_slip bigint)
RETURNS TABLE(id bigint,kind text,channel text,state text,at timestamptz,completed_at timestamptz)
LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT d.id,d.kind,d.channel,
   CASE WHEN v.kind IS NOT NULL THEN v.kind
        WHEN d.channel='print' THEN 'print_ready'
        WHEN q.id IS NULL OR q.deleted_at IS NOT NULL THEN 'cancelled'
        WHEN q.status='sent' AND q.delivery_state='provider_accepted' THEN 'provider_accepted'
        WHEN q.status='delivery_unknown' THEN 'delivery_unknown'
        WHEN q.status='failed' THEN 'failed'
        WHEN q.status='cancelled' THEN 'cancelled'
        WHEN q.paused_at IS NOT NULL THEN 'paused'
        WHEN q.status='processing' THEN 'processing'
        WHEN q.next_retry_at IS NOT NULL THEN 'retry_scheduled'
        ELSE 'queued' END,
   d.created_at,coalesce(v.created_at,q.sent_at,q.cancelled_at,CASE WHEN q.status='failed' THEN q.updated_at END)
 FROM erp_private.t17_payslip_deliveries d
 LEFT JOIN LATERAL (
   SELECT event.kind,event.created_at FROM erp_private.t17_payslip_delivery_events event
   WHERE event.delivery_id=d.id
   ORDER BY event.created_at DESC,(event.kind='bounced') DESC LIMIT 1
 ) v ON true
 LEFT JOIN public.erp_email_queue q ON q.source_module='HR_PAYSLIP' AND q.source_entity_id=d.id
 WHERE d.slip_id=p_slip;
$$;

CREATE FUNCTION erp_private.t17_delivery_history(p_slip bigint)
RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id DESC),'[]'::jsonb)
 FROM (SELECT * FROM erp_private.t17_delivery_rows(p_slip) ORDER BY id DESC LIMIT 100) x;
$$;

-- Projection for caller-authorized workspaces. Command and final dispatch
-- still recheck the immutable issue, current payment and current privileges.
CREATE FUNCTION erp_private.t17_delivery_actions(p_slip bigint)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SET search_path='' AS $$
DECLARE s erp_private.t17_slips; a erp_private.t17_artifacts; eligible boolean; has_initial boolean;
BEGIN
 SELECT * INTO s FROM erp_private.t17_slips WHERE id=p_slip;
 SELECT * INTO a FROM erp_private.t17_artifacts WHERE slip_id=p_slip;
 IF s.id IS NULL OR a.slip_id IS NULL OR NOT erp_private.t17_can(s.company_id,s.branch_id,'deliver')
    OR erp_private.t12_is_subject(public.current_user_profile_id(),s.employee_id) THEN
   RETURN jsonb_build_object('initial',false,'resend',false,'print',false,'handover',false,'bounce',false,'reconcile_email',false);
 END IF;
 eligible:=erp_private.t17_eligible(s.batch_id,s.employee_id) AND erp_private.t17_original_present(s.id);
 SELECT exists(SELECT 1 FROM erp_private.t17_payslip_deliveries WHERE slip_id=p_slip AND kind='initial') INTO has_initial;
 RETURN jsonb_build_object(
   'initial',eligible AND NOT has_initial,
   'resend',eligible AND has_initial AND a.size_bytes<=3000000 AND erp_private.t17_mailbox(s.employee_id) IS NOT NULL
     AND NOT EXISTS(SELECT 1 FROM erp_private.t17_delivery_rows(p_slip)
       WHERE channel='email' AND state IN ('queued','processing','retry_scheduled','paused','delivery_unknown')),
   'print',eligible AND NOT EXISTS(SELECT 1 FROM erp_private.t17_delivery_rows(p_slip) WHERE state='print_ready'),
   'handover',eligible AND EXISTS(SELECT 1 FROM erp_private.t17_delivery_rows(p_slip) WHERE state='print_ready'),
   'bounce',EXISTS(SELECT 1 FROM erp_private.t17_delivery_rows(p_slip) WHERE state IN ('provider_accepted','provider_accepted_confirmed')),
   'reconcile_email',EXISTS(SELECT 1 FROM erp_private.t17_delivery_rows(p_slip) WHERE state='delivery_unknown')
 );
END;
$$;

CREATE FUNCTION public.t17_delivery_command(p_operation uuid,p_slip bigint,p_action text,p_data jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  s erp_private.t17_slips; a erp_private.t17_artifacts; d erp_private.t17_payslip_deliveries;
  actor bigint; request_hash text; receipt jsonb; destination text; wanted_channel text; action_keys text[];
  event_state text; reason_value text; reference_value text; disposition_value text; delivery_id_value bigint; current_state text;
BEGIN
 IF p_operation IS NULL OR p_slip IS NULL OR p_slip<=0 OR p_action IS NULL
  OR p_action NOT IN ('initial','resend','print','handover','bounce','reconcile-email') THEN
   RAISE EXCEPTION 'Invalid payslip delivery action' USING ERRCODE='22023';
 END IF;
 action_keys:=CASE p_action WHEN 'initial' THEN '{}'::text[]
  WHEN 'handover' THEN ARRAY['delivery','reason'] WHEN 'bounce' THEN ARRAY['delivery','reference','reason']
  WHEN 'reconcile-email' THEN ARRAY['delivery','disposition','reference','reason']
  ELSE ARRAY['reason'] END;
 IF jsonb_typeof(p_data) IS DISTINCT FROM 'object' OR (p_data-action_keys) IS DISTINCT FROM '{}'::jsonb
    OR NOT p_data ?& action_keys THEN
   RAISE EXCEPTION 'Invalid payslip delivery parameters' USING ERRCODE='22023';
 END IF;
 reason_value:=btrim(p_data->>'reason');
 reference_value:=btrim(p_data->>'reference');
 disposition_value:=p_data->>'disposition';
 IF (p_action<>'initial' AND (jsonb_typeof(p_data->'reason') IS DISTINCT FROM 'string'
     OR reason_value IS NULL OR length(reason_value) NOT BETWEEN 3 AND 250))
   OR (p_action IN ('bounce','reconcile-email') AND (jsonb_typeof(p_data->'reference') IS DISTINCT FROM 'string'
     OR NOT coalesce(reference_value~'^[A-Za-z0-9][A-Za-z0-9 ._:/#-]{2,119}$',false)))
   OR (p_action='reconcile-email' AND NOT coalesce(disposition_value IN ('accepted','not-accepted'),false)) THEN
   RAISE EXCEPTION 'Document the delivery action and its evidence where required' USING ERRCODE='22023';
 END IF;
 IF p_action IN ('handover','bounce','reconcile-email') THEN
   IF jsonb_typeof(p_data->'delivery') IS DISTINCT FROM 'number' OR NOT coalesce((p_data->>'delivery')~'^[1-9][0-9]{0,15}$',false) THEN
     RAISE EXCEPTION 'An exact delivery is required' USING ERRCODE='22023';
   END IF;
   delivery_id_value:=(p_data->>'delivery')::bigint;
 END IF;

 SELECT * INTO s FROM erp_private.t17_slips WHERE id=p_slip;
 SELECT * INTO a FROM erp_private.t17_artifacts WHERE slip_id=p_slip;
 actor:=public.current_user_profile_id();
 IF s.id IS NULL OR a.slip_id IS NULL OR actor IS NULL
   OR NOT erp_private.t17_can(s.company_id,s.branch_id,'deliver') OR erp_private.t12_is_subject(actor,s.employee_id) THEN
   RAISE EXCEPTION 'Payslip delivery unavailable for this scope' USING ERRCODE='42501';
 END IF;
 PERFORM erp_private.t16_lock_batch(s.batch_id,s.company_id,s.branch_id);
 PERFORM erp_private.t16_touch_batch(s.batch_id);
 -- Recording earlier provider evidence remains available after a reversal.
 -- Fresh delivery and handover need current eligibility and the sealed original.
 IF p_action NOT IN ('bounce','reconcile-email') THEN
   PERFORM erp_private.t17_assert_eligible(s.batch_id,s.employee_id);
   IF erp_private.t17_original_present(s.id) IS NOT TRUE THEN
     RAISE EXCEPTION 'The retained payslip original requires reconciliation' USING ERRCODE='PT409';
   END IF;
 END IF;
 IF NOT erp_private.t17_can(s.company_id,s.branch_id,'deliver') THEN
   RAISE EXCEPTION 'Payslip delivery unavailable for this scope' USING ERRCODE='42501';
 END IF;
 request_hash:=erp_private.t02_digest(jsonb_build_array(p_slip,p_action,p_data));
 receipt:=erp_private.t02_replay('t17-payslip-delivery',p_operation,request_hash);
 IF receipt IS NOT NULL THEN RETURN receipt; END IF;

 IF p_action='initial' THEN
   SELECT * INTO d FROM erp_private.t17_payslip_deliveries WHERE slip_id=p_slip AND kind='initial';
 END IF;
 IF p_action IN ('handover','bounce','reconcile-email') THEN
   SELECT * INTO d FROM erp_private.t17_payslip_deliveries WHERE id=delivery_id_value AND slip_id=p_slip;
   IF d.id IS NULL THEN RAISE EXCEPTION 'Payslip delivery unavailable for this scope' USING ERRCODE='42501'; END IF;
   SELECT x.state INTO current_state FROM erp_private.t17_delivery_rows(p_slip) x WHERE x.id=d.id;
   IF p_action='handover' AND d.channel='print' AND current_state='print_ready' THEN event_state:='handed_over';
   ELSIF p_action='bounce' AND d.channel='email' AND current_state IN ('provider_accepted','provider_accepted_confirmed') THEN event_state:='bounced';
   ELSIF p_action='reconcile-email' AND d.channel='email' AND current_state='delivery_unknown' THEN
     event_state:=CASE disposition_value WHEN 'accepted' THEN 'provider_accepted_confirmed' ELSE 'provider_not_accepted_confirmed' END;
   ELSE RAISE EXCEPTION 'Review the exact retained delivery before recording the outcome' USING ERRCODE='PT409'; END IF;
   INSERT INTO erp_private.t17_payslip_delivery_events(delivery_id,kind,actor_id,reason,reference)
    VALUES(d.id,event_state,actor,reason_value,reference_value);
   IF event_state IN ('bounced','provider_not_accepted_confirmed') AND erp_private.t17_eligible(s.batch_id,s.employee_id)
     AND erp_private.t17_original_present(s.id) AND NOT EXISTS(SELECT 1 FROM erp_private.t17_delivery_rows(p_slip) WHERE state='print_ready') THEN
     INSERT INTO erp_private.t17_payslip_deliveries(slip_id,kind,channel,actor_id,reason)
      VALUES(p_slip,'print','print',actor,CASE event_state WHEN 'bounced' THEN 'Confirmed email bounce'
        ELSE 'Prior email was confirmed not accepted' END);
   END IF;
 ELSIF d.id IS NULL THEN
   IF p_action='resend' AND (
     NOT EXISTS(SELECT 1 FROM erp_private.t17_payslip_deliveries WHERE slip_id=p_slip AND kind='initial')
     OR EXISTS(SELECT 1 FROM erp_private.t17_delivery_rows(p_slip) WHERE channel='email'
       AND state IN ('queued','processing','retry_scheduled','paused','delivery_unknown'))) THEN
     RAISE EXCEPTION 'Resolve the previous or uncertain delivery before sending again' USING ERRCODE='PT409';
   END IF;
   IF p_action IN ('initial','resend') AND a.size_bytes<=3000000 THEN
     destination:=erp_private.t17_mailbox(s.employee_id);
   END IF;
   IF p_action='resend' AND destination IS NULL THEN
     RAISE EXCEPTION 'This payslip requires authorised print handover' USING ERRCODE='PT409';
   END IF;
   wanted_channel:=CASE WHEN destination IS NULL THEN 'print' ELSE 'email' END;
   IF p_action='print' THEN
     SELECT dd.* INTO d FROM erp_private.t17_payslip_deliveries dd
     JOIN erp_private.t17_delivery_rows(p_slip) x ON x.id=dd.id AND x.state='print_ready'
     ORDER BY dd.id DESC LIMIT 1;
   END IF;
   IF d.id IS NULL THEN
     INSERT INTO erp_private.t17_payslip_deliveries(slip_id,kind,channel,recipient,actor_id,reason)
      VALUES(p_slip,p_action,wanted_channel,destination,actor,reason_value) RETURNING * INTO d;
     IF wanted_channel='email' THEN
       INSERT INTO public.erp_email_queue(source_module,source_entity_type,source_entity_id,intent_key,to_emails,subject,created_by)
       VALUES('HR_PAYSLIP','t17_payslip_deliveries',d.id,'t17-payslip:'||d.id,
        ARRAY['private-payslip@example.invalid'],'Your ERP payslip',actor);
     END IF;
   END IF;
 END IF;
 SELECT x.state INTO current_state FROM erp_private.t17_delivery_rows(p_slip) x WHERE x.id=d.id;
 RETURN erp_private.t02_save_receipt('t17-payslip-delivery',p_operation,request_hash,jsonb_build_object(
   'id',d.id,'slip',p_slip,'channel',d.channel,'state',current_state));
END;
$$;

-- Called by the worker before loading bytes and by the F09 admission fence
-- after provider preparation. No external calls occur while DB locks are held.
CREATE FUNCTION erp_private.t17_checked_mail_source(q public.erp_email_queue,p_for_dispatch boolean)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SET search_path='' AS $$
DECLARE d erp_private.t17_payslip_deliveries; s erp_private.t17_slips; a erp_private.t17_artifacts;
BEGIN
 IF q.id IS NULL OR q.source_module<>'HR_PAYSLIP' OR q.source_entity_type IS DISTINCT FROM 't17_payslip_deliveries'
   OR q.intent_key IS DISTINCT FROM 't17-payslip:'||q.source_entity_id OR q.status<>'processing'
   OR q.lease_token IS NULL OR q.lease_owner IS NULL OR q.lease_expires_at<=clock_timestamp()
   OR q.dispatch_started_at IS NOT NULL OR q.deleted_at IS NOT NULL OR q.cancelled_at IS NOT NULL OR q.paused_at IS NOT NULL
   OR q.to_emails IS DISTINCT FROM ARRAY['private-payslip@example.invalid'] OR q.cc_emails IS NOT NULL
   OR q.bcc_emails IS NOT NULL OR q.reply_to_email IS NOT NULL
   OR q.notification_id IS NOT NULL OR q.report_schedule_run_id IS NOT NULL THEN RETURN NULL; END IF;
 SELECT * INTO d FROM erp_private.t17_payslip_deliveries WHERE id=q.source_entity_id AND channel='email';
 SELECT * INTO s FROM erp_private.t17_slips WHERE id=d.slip_id;
 SELECT * INTO a FROM erp_private.t17_artifacts WHERE slip_id=d.slip_id;
 IF s.id IS NULL OR a.slip_id IS NULL OR a.size_bytes>3000000 OR d.actor_id IS DISTINCT FROM q.created_by THEN RETURN NULL; END IF;
 PERFORM erp_private.t16_lock_batch(s.batch_id,s.company_id,s.branch_id);
 IF p_for_dispatch THEN PERFORM erp_private.t16_touch_batch(s.batch_id); END IF;
 IF NOT erp_private.t17_delivery_actor_current(d.actor_id,s.company_id,s.branch_id)
   OR erp_private.t12_is_subject(d.actor_id,s.employee_id)
   OR d.recipient IS DISTINCT FROM erp_private.t17_mailbox(s.employee_id)
   OR erp_private.t17_original_present(s.id) IS NOT TRUE THEN RETURN NULL; END IF;
 PERFORM erp_private.t17_assert_eligible(s.batch_id,s.employee_id);
 IF p_for_dispatch AND NOT erp_private.t17_delivery_actor_current(d.actor_id,s.company_id,s.branch_id) THEN RETURN NULL; END IF;
 RETURN jsonb_build_object('recipient',d.recipient,'storage_path',s.storage_path,'file_name',s.file_name,
   'checksum',a.checksum,'size_bytes',a.size_bytes);
EXCEPTION WHEN SQLSTATE 'PT409' OR SQLSTATE '42501' THEN RETURN NULL;
END;
$$;

CREATE FUNCTION public.t17_email_delivery_source(p_queue bigint,p_owner uuid,p_token uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE q public.erp_email_queue;
BEGIN
 SELECT * INTO q FROM public.erp_email_queue
 WHERE id=p_queue AND lease_owner=p_owner AND lease_token=p_token AND source_module='HR_PAYSLIP';
 RETURN erp_private.t17_checked_mail_source(q,false);
END;
$$;

CREATE FUNCTION erp_private.t17_guard_payslip_queue()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF TG_OP='INSERT' THEN
   IF NEW.source_module='HR_PAYSLIP' AND (
     NEW.source_entity_type IS DISTINCT FROM 't17_payslip_deliveries'
     OR NEW.intent_key IS DISTINCT FROM 't17-payslip:'||NEW.source_entity_id
     OR NEW.to_emails IS DISTINCT FROM ARRAY['private-payslip@example.invalid']
     OR NOT EXISTS (SELECT 1 FROM erp_private.t17_payslip_deliveries d
        WHERE d.id=NEW.source_entity_id AND d.channel='email' AND d.actor_id=NEW.created_by)) THEN
     RAISE EXCEPTION 'Payslip mail requires its retained private delivery intent' USING ERRCODE='P1710';
   END IF;
   RETURN NEW;
 END IF;
 IF (OLD.source_module='HR_PAYSLIP' OR NEW.source_module='HR_PAYSLIP')
   AND ROW(NEW.source_module,NEW.source_entity_type,NEW.source_entity_id,NEW.intent_key,NEW.created_by,NEW.to_emails)
       IS DISTINCT FROM ROW(OLD.source_module,OLD.source_entity_type,OLD.source_entity_id,OLD.intent_key,OLD.created_by,OLD.to_emails) THEN
   RAISE EXCEPTION 'Payslip mail source is retained' USING ERRCODE='P1710';
 END IF;
 IF OLD.source_module='HR_PAYSLIP' AND OLD.dispatch_started_at IS NULL AND NEW.dispatch_started_at IS NOT NULL
   AND erp_private.t17_checked_mail_source(OLD,true) IS NULL THEN
   RAISE EXCEPTION 'Payslip mail no longer qualifies for dispatch' USING ERRCODE='P1710';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER t17_payslip_queue_source BEFORE INSERT OR UPDATE OF source_module,source_entity_type,source_entity_id,
  intent_key,created_by,to_emails,dispatch_started_at ON public.erp_email_queue
 FOR EACH ROW EXECUTE FUNCTION erp_private.t17_guard_payslip_queue();

-- Notification operators control generic intents. Protected payroll mail
-- can still cancel safely inside the leased F09 worker when its gate fails.
CREATE OR REPLACE FUNCTION public.f09_cancel_email(p_id bigint)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE changed bigint;
BEGIN
 UPDATE public.erp_email_queue SET status='cancelled',cancelled_at=clock_timestamp(),
   updated_at=clock_timestamp(),lease_owner=NULL,lease_token=NULL,lease_expires_at=NULL
 WHERE id=p_id AND source_module<>'HR_PAYSLIP' AND deleted_at IS NULL AND (
   (status IN ('pending','processing') AND dispatch_started_at IS NULL)
   OR (status='pending' AND last_error='F09:retry' AND delivery_state IS NULL
       AND lease_token IS NULL AND lease_owner IS NULL)
 ) RETURNING id INTO changed;
 RETURN changed IS NOT NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.f09_retry_email(p_id bigint)
RETURNS boolean LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 SELECT exists(SELECT 1 FROM public.erp_email_queue WHERE id=p_id
   AND source_module<>'HR_PAYSLIP' AND status='pending'
   AND last_error='F09:retry' AND deleted_at IS NULL AND cancelled_at IS NULL AND paused_at IS NULL
   AND attempt_count<max_attempts);
$$;

REVOKE ALL ON FUNCTION erp_private.t17_mailbox(bigint),erp_private.t17_delivery_actor_current(bigint,bigint,bigint),
 erp_private.t17_delivery_rows(bigint),erp_private.t17_delivery_history(bigint),erp_private.t17_delivery_actions(bigint),
 erp_private.t17_checked_mail_source(public.erp_email_queue,boolean),erp_private.t17_guard_payslip_queue(),
 public.t17_email_delivery_source(bigint,uuid,uuid),public.t17_delivery_command(uuid,bigint,text,jsonb)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.t17_email_delivery_source(bigint,uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.t17_delivery_command(uuid,bigint,text,jsonb) TO authenticated;

NOTIFY pgrst,'reload schema';
COMMIT;
