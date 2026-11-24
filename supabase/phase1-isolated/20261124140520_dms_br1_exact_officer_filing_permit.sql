BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '45s';

-- Separate from the worker's review enrollment. A release seeds no approvals.
CREATE TABLE erp_private.dms_sharepoint_br1_filing_scope (
  source_operation_id uuid PRIMARY KEY REFERENCES erp_private.dms_sharepoint_intake_origins(operation_id),
  filing_operation_id uuid UNIQUE NOT NULL,
  officer_id bigint NOT NULL REFERENCES public.user_profiles(id),
  request_sha256 text NOT NULL CHECK (request_sha256 ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz NOT NULL,
  CHECK (source_operation_id <> filing_operation_id)
);

CREATE TABLE erp_private.dms_sharepoint_br1_filing_permits (
  backend_pid integer NOT NULL,
  transaction_id xid8 NOT NULL,
  upload_session_id bigint NOT NULL,
  filing_operation_id uuid NOT NULL,
  officer_id bigint NOT NULL,
  auth_session_id uuid NOT NULL,
  phase text NOT NULL CHECK (phase IN ('reserve','finish')),
  PRIMARY KEY (backend_pid,transaction_id,upload_session_id)
);
ALTER TABLE erp_private.dms_sharepoint_br1_filing_scope ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_private.dms_sharepoint_br1_filing_permits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON erp_private.dms_sharepoint_br1_filing_scope,erp_private.dms_sharepoint_br1_filing_permits
  FROM PUBLIC, anon, authenticated, service_role, erp_agent_discovery_runtime;

-- A proof-only call cannot commit with a live permit. Both phases must be
-- consumed by the exact source transition and reconcile to the native plan
-- at commit. This also prevents an isolated acceptance of the AI result.
CREATE FUNCTION erp_private.dms_br1_filing_permit_settled() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
BEGIN
  IF EXISTS (
    SELECT 1 FROM erp_private.dms_sharepoint_br1_filing_permits p
    WHERE (p.backend_pid,p.transaction_id,p.upload_session_id)
      =(NEW.backend_pid,NEW.transaction_id,NEW.upload_session_id)
  ) OR NOT EXISTS (
    SELECT 1 FROM erp_private.ai_approval_plans a
    JOIN public.dms_upload_sessions u ON u.id=a.upload_session_id
    JOIN erp_private.dms_sharepoint_br1_filing_scope f ON f.filing_operation_id=a.operation_id
    JOIN erp_private.dms_sharepoint_intake_origins o ON o.operation_id=f.source_operation_id AND o.upload_session_id=u.id
    JOIN erp_private.dms_sharepoint_br1_review_scope e ON e.connection_id=o.connection_id AND e.officer_id=a.actor_id
    JOIN public.user_profiles officer ON officer.id=a.actor_id
      AND officer.status='active' AND NOT officer.must_change_password
    JOIN auth.users account ON account.id=officer.auth_user_id AND account.deleted_at IS NULL
      AND (account.banned_until IS NULL OR account.banned_until<=clock_timestamp())
    JOIN auth.sessions session ON session.id=NEW.auth_session_id AND session.user_id=account.id
      AND (session.not_after IS NULL OR session.not_after>clock_timestamp())
    WHERE (a.actor_id,a.operation_id,a.upload_session_id)=(NEW.officer_id,NEW.filing_operation_id,NEW.upload_session_id)
      AND a.approve_run_id=u.approve_run_id AND f.request_sha256=a.request_hash
      AND f.expires_at>clock_timestamp() AND e.expires_at>clock_timestamp()
      AND (
        (NEW.phase='reserve' AND a.result IS NULL AND u.document_id IS NULL AND u.approve_status='processing')
        OR
        (a.result IS NOT NULL AND a.completed_at IS NOT NULL
          AND u.document_id=a.document_id AND u.approve_status='completed')
      )
  ) THEN
    RAISE EXCEPTION 'BR1 filing permit requires its native transaction receipt' USING ERRCODE='23514';
  END IF;
  RETURN NULL;
END $function$;

CREATE CONSTRAINT TRIGGER dms_br1_filing_permit_settled
  AFTER INSERT ON erp_private.dms_sharepoint_br1_filing_permits DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION erp_private.dms_br1_filing_permit_settled();

CREATE FUNCTION erp_private.dms_br1_mint_filing_permit(
  plan erp_private.ai_approval_plans, p_phase text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE
  origin erp_private.dms_sharepoint_intake_origins;
  publication erp_private.dms_sharepoint_br1_review_state;
  session_id uuid := (auth.jwt()->>'session_id')::uuid;
BEGIN
  SELECT i.* INTO origin FROM erp_private.dms_sharepoint_intake_origins i
  JOIN erp_private.dms_sharepoint_br1_review_scope e USING (connection_id)
  WHERE i.upload_session_id = plan.upload_session_id;
  IF NOT FOUND THEN RETURN; END IF;

  PERFORM 1 FROM erp_private.dms_sharepoint_br1_filing_scope f
  JOIN erp_private.dms_sharepoint_br1_review_scope e ON e.connection_id=origin.connection_id
  JOIN erp_private.dms_sharepoint_br1_review_state s ON s.operation_id=origin.operation_id
  JOIN erp_private.agent_source_items i
    ON (i.connection_id,i.item_id,i.version)=(origin.connection_id,origin.item_id,origin.source_version)
  JOIN public.dms_upload_sessions u ON u.id=origin.upload_session_id
  JOIN public.dms_document_types t ON t.id=(plan.request_json->>'documentTypeId')::bigint
  WHERE f.source_operation_id=origin.operation_id AND f.filing_operation_id=plan.operation_id
    AND f.officer_id=plan.actor_id AND e.officer_id=plan.actor_id AND s.officer_id=plan.actor_id
    AND f.request_sha256=plan.request_hash AND f.expires_at>clock_timestamp() AND e.expires_at>clock_timestamp()
    AND ROW(e.company_id,e.branch_id,e.actor_id,e.item_id,e.source_version,e.sha256)
      = ROW(origin.company_id,origin.branch_id,origin.owner_id,origin.item_id,origin.source_version,origin.sha256)
    AND plan.actor_id<>origin.owner_id AND i.available AND s.upload_session_id=u.id AND s.result_id=u.ai_result_id
    AND plan.actor_id=public.current_user_profile_id() AND auth.jwt()->>'role'='authenticated'
    AND session_id IS NOT NULL AND erp_private.business_principal_is_active()
    AND t.type_code='LABOUR_CARD' AND t.is_active AND t.deleted_at IS NULL
    AND plan.request_json @> jsonb_build_object(
      'uploadSessionId',origin.upload_session_id,'owningCompanyId',origin.company_id,
      'owningBranchId',origin.branch_id,'allowDuplicate',false,'links','[]'::jsonb)
    AND plan.request_json#>>'{prepared,content_sha256}'=origin.sha256
    AND plan.request_json#>>'{prepared,analysis_result_id}'=s.result_id::text
    AND erp_private.dms_br1_pending_run_visible(u.id,s.result_id,plan.actor_id,
      'f06-ai:'||plan.actor_id||':'||plan.operation_id)
    AND u.document_id IS NULL AND NOT u.is_duplicate AND u.expires_at>clock_timestamp()
    AND p_phase IN ('reserve','finish')
  FOR SHARE OF f,e,s,i,t NOWAIT;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Exact supervised BR1 filing authorization unavailable' USING ERRCODE='42501';
  END IF;
  SELECT * INTO STRICT publication FROM erp_private.dms_sharepoint_br1_review_state
  WHERE operation_id=origin.operation_id;
  PERFORM erp_private.ai_mod04_lock_profile_authority(plan.actor_id);
  PERFORM erp_private.dms_sharepoint_br1_check_object(origin,publication);
  PERFORM erp_private.f07_assert_intake_review(plan.upload_session_id,
    (plan.request_json->>'documentTypeId')::bigint,nullif(plan.request_json->>'expiryDate','')::date);

  INSERT INTO erp_private.dms_sharepoint_br1_filing_permits
  VALUES (pg_backend_pid(),pg_current_xact_id(),plan.upload_session_id,plan.operation_id,plan.actor_id,session_id,p_phase);
END $function$;

CREATE FUNCTION erp_private.dms_br1_check_reserved_plan() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
BEGIN
  PERFORM erp_private.dms_br1_mint_filing_permit(NEW,'reserve');
  RETURN NEW;
END $function$;
CREATE TRIGGER dms_br1_check_reserved_plan BEFORE INSERT ON erp_private.ai_approval_plans
  FOR EACH ROW EXECUTE FUNCTION erp_private.dms_br1_check_reserved_plan();

-- F06 performs this private proof check inside the existing caller-scoped
-- numbered transaction. Do not mint a permit on committed receipt replay.
DO $migration$
DECLARE
  body text;
  anchor constant text := E' perform erp_private.assert_ai_approval_authority(p_request);\nend $function$';
BEGIN
  SELECT replace(pg_get_functiondef('erp_private.assert_ai_approval_copy(uuid,jsonb,text)'::regprocedure),E'\r\n',E'\n')
    INTO STRICT body;
  IF array_length(string_to_array(body,anchor),1) <> 2 THEN
    RAISE EXCEPTION 'Unexpected numbered original-copy verifier';
  END IF;
  EXECUTE replace(body,anchor,$injection$
 IF plan.result IS NULL AND EXISTS (
   SELECT 1 FROM public.dms_upload_sessions WHERE id=plan.upload_session_id AND document_id IS NULL
 ) THEN
   PERFORM erp_private.dms_br1_mint_filing_permit(plan,'finish');
 END IF;
$injection$ || anchor);
END $migration$;

CREATE FUNCTION erp_private.dms_br1_filing_plan(p_session bigint,p_phase text)
RETURNS erp_private.ai_approval_plans
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $function$
  SELECT a.* FROM erp_private.dms_sharepoint_br1_filing_permits p
  JOIN erp_private.ai_approval_plans a ON (a.actor_id,a.operation_id,a.upload_session_id)
    = (p.officer_id,p.filing_operation_id,p.upload_session_id)
  JOIN erp_private.dms_sharepoint_br1_filing_scope f ON f.filing_operation_id = a.operation_id
  WHERE p.backend_pid = pg_backend_pid() AND p.transaction_id = pg_current_xact_id_if_assigned()
    AND p.upload_session_id=p_session AND p.phase=p_phase AND p.officer_id=public.current_user_profile_id()
    AND p.auth_session_id=(auth.jwt()->>'session_id')::uuid AND a.result IS NULL
    AND f.officer_id=p.officer_id AND f.request_sha256=a.request_hash AND f.expires_at>clock_timestamp();
$function$;

CREATE OR REPLACE FUNCTION erp_private.dms_guard_sharepoint_session() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE plan erp_private.ai_approval_plans;
BEGIN
  IF tg_op = 'UPDATE' AND old.expires_at <= clock_timestamp()
    AND new.status IN (old.status,'expired') AND new.intake_status IN (old.intake_status,'expired')
    AND (old.temp_cleaned_at IS NULL OR new.temp_cleaned_at IS NOT DISTINCT FROM old.temp_cleaned_at)
    AND (old.deleted_at IS NULL OR new.deleted_at IS NOT DISTINCT FROM old.deleted_at)
    AND (to_jsonb(old)-array['status','intake_status','temp_cleaned_at','deleted_at','updated_at'])
      = (to_jsonb(new)-array['status','intake_status','temp_cleaned_at','deleted_at','updated_at']) THEN
    RETURN new;
  END IF;
  IF tg_op = 'UPDATE' AND new.approve_status IN ('processing','completed') THEN
    plan := erp_private.dms_br1_filing_plan(old.id,CASE new.approve_status WHEN 'processing' THEN 'reserve' ELSE 'finish' END);
    IF plan.operation_id IS NOT NULL AND new.approve_run_id=plan.approve_run_id
      AND old.document_id IS NULL AND new.approve_error IS NULL
      AND (
        (new.approve_status='processing' AND new.document_id IS NULL
          AND to_jsonb(old)-array['approve_run_id','approve_status','approve_error','updated_at']
            = to_jsonb(new)-array['approve_run_id','approve_status','approve_error','updated_at'])
        OR
        (new.approve_status='completed' AND old.approve_run_id=plan.approve_run_id AND old.approve_status='processing'
          AND new.document_id=plan.document_id AND new.reviewed_by=plan.actor_id AND new.status='completed'
          AND new.intake_status='approved' AND new.review_status='approved'
          AND new.approved_at IS NOT NULL AND new.review_completed_at IS NOT NULL AND new.completed_at IS NOT NULL
          AND EXISTS (SELECT 1 FROM public.dms_ai_extraction_results a WHERE a.id=old.ai_result_id
            AND a.document_id=plan.document_id AND a.ai_status='accepted' AND a.reviewed_by=plan.actor_id)
          AND to_jsonb(old)-array['status','intake_status','review_status','document_id','approve_run_id','approve_status',
            'approve_error','approved_at','review_completed_at','reviewed_by','completed_at','updated_at']
            = to_jsonb(new)-array['status','intake_status','review_status','document_id','approve_run_id','approve_status',
            'approve_error','approved_at','review_completed_at','reviewed_by','completed_at','updated_at'])
      ) THEN
      DELETE FROM erp_private.dms_sharepoint_br1_filing_permits
      WHERE backend_pid=pg_backend_pid() AND transaction_id=pg_current_xact_id()
        AND upload_session_id=old.id AND filing_operation_id=plan.operation_id;
      RETURN new;
    END IF;
  END IF;
  PERFORM erp_private.dms_reject_ordinary_sharepoint_intake(old.id);
  IF tg_op = 'DELETE' THEN RETURN old; END IF;
  RETURN new;
END $function$;

CREATE FUNCTION erp_private.dms_guard_sharepoint_filing_result() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE plan erp_private.ai_approval_plans;
BEGIN
  IF tg_op='UPDATE' AND new.ai_status='accepted' AND old.ai_status='pending_review' THEN
    plan:=erp_private.dms_br1_filing_plan(old.upload_session_id,'finish');
    IF plan.operation_id IS NOT NULL AND old.id::text=plan.request_json#>>'{prepared,analysis_result_id}'
      AND old.document_id IS NULL AND new.document_id=plan.document_id AND new.reviewed_by=plan.actor_id
      AND old.review_action IS NULL AND new.review_action='accepted' AND new.reviewed_at IS NOT NULL
      AND to_jsonb(old)-array['ai_status','review_action','reviewed_by','reviewed_at','document_id','updated_at']
        = to_jsonb(new)-array['ai_status','review_action','reviewed_by','reviewed_at','document_id','updated_at'] THEN
      RETURN new;
    END IF;
  END IF;
  IF tg_op <> 'INSERT' THEN
    PERFORM erp_private.dms_reject_ordinary_sharepoint_intake(old.upload_session_id);
  END IF;
  IF tg_op = 'DELETE' THEN RETURN old; END IF;
  IF tg_op = 'INSERT' OR new.upload_session_id IS DISTINCT FROM old.upload_session_id THEN
    PERFORM erp_private.dms_reject_ordinary_sharepoint_intake(new.upload_session_id);
  END IF;
  RETURN new;
END $function$;

DROP TRIGGER dms_guard_sharepoint_evidence ON public.dms_ai_extraction_results;
CREATE TRIGGER dms_guard_sharepoint_evidence
  BEFORE INSERT OR UPDATE OR DELETE ON public.dms_ai_extraction_results
  FOR EACH ROW EXECUTE FUNCTION erp_private.dms_guard_sharepoint_filing_result();

REVOKE ALL ON FUNCTION
  erp_private.dms_br1_filing_permit_settled(),
  erp_private.dms_br1_mint_filing_permit(erp_private.ai_approval_plans,text),
  erp_private.dms_br1_check_reserved_plan(),
  erp_private.dms_br1_filing_plan(bigint,text),
  erp_private.dms_guard_sharepoint_filing_result()
  FROM PUBLIC, anon, authenticated, service_role, erp_agent_discovery_runtime;

NOTIFY pgrst, 'reload schema';
COMMIT;
