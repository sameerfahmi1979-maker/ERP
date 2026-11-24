BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- An empty manifest leaves both the continuous and company-wide proof lanes
-- unchanged. Each enrolled connection accepts one exact BR1 source version.
CREATE TABLE erp_private.dms_sharepoint_br1_review_scope (
  connection_id uuid PRIMARY KEY REFERENCES erp_private.agent_connections(id),
  company_id bigint NOT NULL REFERENCES public.owner_companies(id),
  branch_id bigint NOT NULL REFERENCES public.branches(id),
  actor_id bigint NOT NULL REFERENCES public.user_profiles(id),
  officer_id bigint NOT NULL REFERENCES public.user_profiles(id),
  item_id text NOT NULL CHECK (length(item_id) BETWEEN 1 AND 1024),
  source_version text NOT NULL CHECK (length(source_version) BETWEEN 1 AND 1024),
  sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz NOT NULL,
  CHECK (actor_id <> officer_id)
);

CREATE TABLE erp_private.dms_sharepoint_br1_review_state (
  operation_id uuid PRIMARY KEY REFERENCES erp_private.dms_sharepoint_intake_origins(operation_id),
  upload_session_id bigint NOT NULL UNIQUE REFERENCES public.dms_upload_sessions(id),
  officer_id bigint NOT NULL REFERENCES public.user_profiles(id),
  object_id uuid NOT NULL,
  object_version text NOT NULL,
  object_updated_at timestamptz NOT NULL,
  attempt_id uuid UNIQUE,
  lease_token uuid,
  processing_revision timestamptz,
  result_id bigint UNIQUE REFERENCES public.dms_ai_extraction_results(id),
  review_id bigint UNIQUE REFERENCES public.dms_review_queue(id),
  notification_event_id bigint UNIQUE REFERENCES erp_private.notification_events(id),
  output_sha256 text CHECK (output_sha256 ~ '^[a-f0-9]{64}$'),
  CHECK (num_nonnulls(attempt_id, lease_token, processing_revision) IN (0, 3)),
  CHECK (num_nonnulls(result_id, review_id, notification_event_id, output_sha256) IN (0, 4))
);

-- Only fenced native transactions can insert a permit. Its backend and
-- transaction identifiers cannot authorize another transaction.
CREATE TABLE erp_private.dms_sharepoint_br1_write_permits (
  backend_pid integer NOT NULL,
  transaction_id xid8 NOT NULL,
  upload_session_id bigint NOT NULL,
  PRIMARY KEY (backend_pid, transaction_id, upload_session_id)
);
ALTER TABLE erp_private.dms_sharepoint_br1_review_scope ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_private.dms_sharepoint_br1_review_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_private.dms_sharepoint_br1_write_permits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON erp_private.dms_sharepoint_br1_review_scope, erp_private.dms_sharepoint_br1_review_state,
  erp_private.dms_sharepoint_br1_write_permits FROM PUBLIC, anon, authenticated, service_role, erp_agent_discovery_runtime;

CREATE FUNCTION erp_private.dms_sharepoint_br1_intake_allowed(p_connection uuid, p_company bigint)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $function$
DECLARE scope erp_private.dms_sharepoint_br1_review_scope%ROWTYPE;
BEGIN
  SELECT * INTO scope FROM erp_private.dms_sharepoint_br1_review_scope WHERE connection_id = p_connection FOR SHARE;
  IF NOT FOUND THEN
    RETURN erp_private.dms_agent_center_sharepoint_intake_allowed(p_company);
  END IF;
  RETURN scope.company_id = p_company AND scope.expires_at > clock_timestamp()
    AND erp_private.dms_agent_center_lock_for_write(scope.company_id, scope.branch_id, 'dms.intake');
END;
$function$;
REVOKE ALL ON FUNCTION erp_private.dms_sharepoint_br1_intake_allowed(uuid,bigint)
  FROM PUBLIC, anon, authenticated, service_role, erp_agent_discovery_runtime;

CREATE OR REPLACE FUNCTION erp_private.dms_agent_center_check_sharepoint_admission(
  p_actor bigint, p_operation uuid, p_company bigint, p_branch bigint, p_request jsonb, p_lease uuid
) RETURNS void LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = '' AS $function$
DECLARE
  work erp_private.agent_pdf_work%ROWTYPE;
  scope erp_private.dms_sharepoint_br1_review_scope%ROWTYPE;
  metadata jsonb := p_request->'metadata';
BEGIN
  SELECT * INTO work FROM erp_private.agent_pdf_work WHERE operation_id = p_operation;
  IF p_lease IS NULL THEN
    IF work.operation_id IS NOT NULL AND (
      EXISTS (SELECT 1 FROM erp_private.dms_sharepoint_br1_review_scope WHERE connection_id = work.connection_id)
      OR EXISTS (SELECT 1 FROM erp_private.dms_agent_center_controls c
        WHERE c.company_id = work.company_id AND c.branch_id IS NULL AND c.agent_key = 'dms.intake' AND c.worker_bound)
    ) THEN
      RAISE EXCEPTION 'SharePoint admission binding unavailable' USING ERRCODE = '42501';
    END IF;
    RETURN;
  END IF;
  IF work.operation_id IS NULL OR p_actor IS DISTINCT FROM work.actor_id OR p_company IS DISTINCT FROM work.company_id
    OR NOT (p_request ? 'scope') OR p_request->'context' IS DISTINCT FROM 'null'::jsonb THEN
    RAISE EXCEPTION 'SharePoint admission binding unavailable' USING ERRCODE = '42501';
  END IF;
  PERFORM 1 FROM erp_private.agent_pdf_policy p
  JOIN erp_private.agent_sync_checkpoints s USING (connection_id)
  WHERE p.connection_id = work.connection_id AND p.company_id = work.company_id AND p.actor_id = work.actor_id
    AND p.enabled AND NOT s.paused FOR SHARE OF p, s;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SharePoint intake policy unavailable' USING ERRCODE = '55000';
  END IF;
  SELECT * INTO scope FROM erp_private.dms_sharepoint_br1_review_scope WHERE connection_id = work.connection_id FOR SHARE;
  IF FOUND THEN
    IF ROW(p_company, p_branch, p_actor, work.item_id, work.version, work.sha256)
      IS DISTINCT FROM ROW(scope.company_id, scope.branch_id, scope.actor_id, scope.item_id, scope.source_version, scope.sha256)
      OR scope.expires_at <= clock_timestamp()
      OR NOT EXISTS (
        SELECT 1 FROM public.owner_companies c JOIN public.branches b ON b.owner_company_id = c.id
        JOIN erp_private.agent_pdf_policy p ON p.connection_id = scope.connection_id AND p.officer_id = scope.officer_id
        WHERE c.id = scope.company_id AND c.company_code = 'ALGT' AND c.status = 'active'
          AND b.id = scope.branch_id AND b.branch_code = 'BR1' AND b.status = 'active'
      ) THEN
      RAISE EXCEPTION 'Exact BR1 admission unavailable' USING ERRCODE = '42501';
    END IF;
  ELSIF p_branch IS NOT NULL OR NOT EXISTS (
    SELECT 1 FROM erp_private.dms_agent_center_controls c WHERE c.company_id = p_company AND c.branch_id IS NULL
      AND c.agent_key = 'dms.intake' AND c.worker_bound
  ) THEN
    RAISE EXCEPTION 'SharePoint admission binding unavailable' USING ERRCODE = '42501';
  END IF;
  IF erp_private.dms_agent_center_lock_for_write(p_company, p_branch, 'dms.intake') IS NOT TRUE THEN
    RAISE EXCEPTION 'SharePoint intake is paused or off' USING ERRCODE = '55000';
  END IF;
  PERFORM 1 FROM erp_private.agent_pdf_work w
  JOIN erp_private.agent_source_items i USING (connection_id, item_id, version)
  JOIN erp_private.agent_source_versions v USING (connection_id, item_id, version)
  WHERE w.operation_id = p_operation AND w.connection_id = work.connection_id AND w.company_id = p_company
    AND w.actor_id = p_actor AND w.status = 'retry' AND w.lease_token = p_lease AND w.lease_until > clock_timestamp()
    AND w.sha256 = metadata->>'sha256_hash' AND i.available AND i.filename = metadata->>'original_filename'
    AND v.mime = 'application/pdf' AND v.mime = metadata->>'mime_type'
    AND v.size_bytes BETWEEN 1 AND 3145728 AND v.size_bytes = (metadata->>'file_size_bytes')::bigint
  FOR SHARE OF w, i, v;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SharePoint admission source unavailable' USING ERRCODE = '42501';
  END IF;
  PERFORM erp_private.dms_lock_sharepoint_operator(p_actor,p_company,p_branch,(auth.jwt()->>'session_id')::uuid);
END;
$function$;

-- Preserve the reviewed runtime function signatures while pinning the branch,
-- selected discovery item and exact fingerprint to the new manifest lane.
DO $patch$
DECLARE body text; prior text; after_gate text;
BEGIN
  SELECT replace(pg_get_functiondef(oid), E'\r\n', E'\n') INTO STRICT body FROM pg_proc
    WHERE oid = 'erp_private.claim_agent_pdf(uuid)'::regprocedure;
  prior := body;
  after_gate := replace(body, 'erp_private.dms_agent_center_sharepoint_intake_allowed(policy.company_id)',
    'erp_private.dms_sharepoint_br1_intake_allowed(p_connection,policy.company_id)');
  body := replace(after_gate,
    $old$where connection_id=p_connection and status='retry' and next_attempt_at<=now()$old$,
    $new$where connection_id=p_connection and status='retry' and next_attempt_at<=now()
      and not exists (select 1 from erp_private.dms_sharepoint_br1_review_scope m where m.connection_id=p_connection
        and (m.item_id,m.source_version) is distinct from (agent_pdf_work.item_id,agent_pdf_work.version))$new$);
  body := replace(body, 'and i.available and not exists (',
    $new$and i.available and not exists (select 1 from erp_private.dms_sharepoint_br1_review_scope m
      where m.connection_id=p_connection and (m.item_id,m.source_version) is distinct from (v.item_id,v.version))
        and not exists ($new$);
  IF prior = after_gate OR strpos(body,'agent_pdf_work.item_id') = 0 OR strpos(body,'(v.item_id,v.version)') = 0 THEN
    RAISE EXCEPTION 'Unexpected SharePoint claim prerequisite';
  END IF;
  EXECUTE body;

  SELECT replace(pg_get_functiondef(oid), E'\r\n', E'\n') INTO STRICT body FROM pg_proc
    WHERE oid = 'erp_private.advance_agent_pdf(uuid,uuid,uuid,text,text)'::regprocedure;
  prior := body;
  after_gate := replace(body, 'erp_private.dms_agent_center_sharepoint_intake_allowed(policy.company_id)',
    'erp_private.dms_sharepoint_br1_intake_allowed(p_connection,policy.company_id)');
  body := replace(after_gate, 'or intake.owning_branch_id is not null or',
    $new$or intake.owning_branch_id is distinct from
      (select m.branch_id from erp_private.dms_sharepoint_br1_review_scope m where m.connection_id=p_connection) or$new$);
  body := replace(body, $old$or (work.sha256 is not null and work.sha256<>p_hash) then$old$,
    $new$or (work.sha256 is not null and work.sha256<>p_hash)
      or exists (select 1 from erp_private.dms_sharepoint_br1_review_scope m where m.connection_id=p_connection
        and (m.item_id,m.source_version,m.sha256) is distinct from (work.item_id,work.version,p_hash)) then$new$);
  body := replace(body, $old$elsif intake.intake_status in ('ocr_processing','ai_processing') then$old$,
    $new$elsif intake.intake_status in ('ocr_processing','ai_processing')
     and not exists (select 1 from erp_private.dms_sharepoint_br1_review_scope m
       join erp_private.dms_sharepoint_intake_origins o on o.operation_id=work.operation_id
       where m.connection_id=p_connection and m.item_id=work.item_id and m.source_version=work.version
         and m.sha256=work.sha256 and o.upload_session_id=intake.id and o.branch_id=m.branch_id) then$new$);
  IF prior = after_gate OR strpos(body,'select m.branch_id') = 0 OR strpos(body,'m.source_version,m.sha256') = 0
    OR strpos(body,'o.upload_session_id=intake.id') = 0 THEN
    RAISE EXCEPTION 'Unexpected SharePoint advance prerequisite';
  END IF;
  EXECUTE body;
END;
$patch$;

-- A completed pause/off or resume advances the control revision and retires
-- outstanding leases. On resume the worker keeps the original operation
-- while reclaiming a fresh generation, even if the old lease has not timed out.
CREATE FUNCTION erp_private.dms_sharepoint_br1_retire_control_lease() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
BEGIN
  UPDATE erp_private.agent_pdf_work w
  SET lease_token=NULL, lease_until=NULL, next_attempt_at=clock_timestamp()
  FROM erp_private.dms_sharepoint_br1_review_scope m
  WHERE m.company_id=NEW.company_id AND m.branch_id=NEW.branch_id
    AND (m.connection_id,m.item_id,m.source_version)=(w.connection_id,w.item_id,w.version)
    AND w.status='retry';
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION erp_private.dms_sharepoint_br1_retire_control_lease()
  FROM PUBLIC, anon, authenticated, service_role, erp_agent_discovery_runtime;
CREATE TRIGGER dms_sharepoint_br1_retire_control_lease
  AFTER UPDATE OF revision ON erp_private.dms_agent_center_controls FOR EACH ROW
  WHEN (OLD.revision IS DISTINCT FROM NEW.revision AND NEW.branch_id IS NOT NULL AND NEW.agent_key='dms.intake')
  EXECUTE FUNCTION erp_private.dms_sharepoint_br1_retire_control_lease();

CREATE FUNCTION erp_private.dms_sharepoint_br1_permitted(p_session bigint) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $function$
  SELECT EXISTS (
    SELECT 1 FROM erp_private.dms_sharepoint_br1_write_permits
    WHERE backend_pid = pg_backend_pid() AND transaction_id = pg_current_xact_id()
      AND upload_session_id = p_session
  );
$function$;
REVOKE ALL ON FUNCTION erp_private.dms_sharepoint_br1_permitted(bigint)
  FROM PUBLIC, anon, authenticated, service_role, erp_agent_discovery_runtime;

CREATE OR REPLACE FUNCTION erp_private.dms_reject_ordinary_sharepoint_intake(p_session bigint) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
BEGIN
  IF NOT erp_private.dms_sharepoint_br1_permitted(p_session)
    AND EXISTS (SELECT 1 FROM erp_private.dms_sharepoint_intake_origins WHERE upload_session_id = p_session) THEN
    RAISE EXCEPTION 'SharePoint upload requires its worker operation' USING ERRCODE = '42501';
  END IF;
END;
$function$;

-- Shared authority bound to the actual live source and current generation.
-- Transactions acquire locks in the order used by the existing worker.
CREATE FUNCTION erp_private.dms_lock_sharepoint_br1_review(
  p_operation uuid, p_session bigint, p_lease uuid, p_actor bigint, p_auth_session uuid
) RETURNS erp_private.dms_sharepoint_intake_origins
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE
  origin erp_private.dms_sharepoint_intake_origins%ROWTYPE;
  scope erp_private.dms_sharepoint_br1_review_scope%ROWTYPE;
  receipt erp_private.dms_sharepoint_br1_review_state%ROWTYPE;
BEGIN
  SELECT * INTO origin FROM erp_private.dms_sharepoint_intake_origins
  WHERE operation_id=p_operation AND upload_session_id=p_session AND owner_id=p_actor AND branch_id IS NOT NULL;
  IF NOT FOUND OR p_auth_session IS NULL OR p_lease IS NULL THEN
    RAISE EXCEPTION 'SharePoint original unavailable' USING ERRCODE='42501';
  END IF;

  -- After a terminal commit, the consumed lease only reads its own receipt.
  SELECT * INTO receipt FROM erp_private.dms_sharepoint_br1_review_state WHERE operation_id=p_operation;
  IF receipt.result_id IS NOT NULL AND receipt.lease_token = p_lease THEN
    PERFORM 1 FROM erp_private.dms_sharepoint_intake_authority a WHERE a.operation_id=p_operation
      AND a.lease_token=p_lease AND a.auth_session_id=p_auth_session FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Original SharePoint receipt belongs to another session' USING ERRCODE='42501';
    END IF;
    PERFORM erp_private.dms_lock_sharepoint_operator(p_actor,origin.company_id,origin.branch_id,p_auth_session);
    RETURN origin;
  END IF;

  PERFORM 1 FROM erp_private.agent_pdf_policy p JOIN erp_private.agent_sync_checkpoints k USING (connection_id)
  WHERE p.connection_id=origin.connection_id AND p.company_id=origin.company_id AND p.actor_id=origin.owner_id
    AND p.enabled AND NOT k.paused FOR SHARE OF p,k;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SharePoint intake paused or off' USING ERRCODE='55000';
  END IF;
  SELECT m.* INTO scope FROM erp_private.dms_sharepoint_br1_review_scope m
  JOIN erp_private.agent_pdf_policy p ON p.connection_id=m.connection_id AND p.officer_id=m.officer_id
  JOIN public.owner_companies c ON c.id=m.company_id AND c.company_code='ALGT' AND c.status='active'
  JOIN public.branches b ON b.id=m.branch_id AND b.owner_company_id=c.id AND b.branch_code='BR1' AND b.status='active'
  WHERE m.connection_id=origin.connection_id AND m.expires_at > clock_timestamp()
    AND ROW(m.company_id,m.branch_id,m.actor_id,m.item_id,m.source_version,m.sha256)
      = ROW(origin.company_id,origin.branch_id,origin.owner_id,origin.item_id,origin.source_version,origin.sha256)
  FOR SHARE OF m,c,b;
  IF NOT FOUND OR (receipt.operation_id IS NOT NULL AND receipt.officer_id IS DISTINCT FROM scope.officer_id) THEN
    RAISE EXCEPTION 'Exact BR1 review scope unavailable' USING ERRCODE='42501';
  END IF;
  IF erp_private.dms_agent_center_lock_for_write(origin.company_id,origin.branch_id,'dms.intake') IS NOT TRUE THEN
    RAISE EXCEPTION 'SharePoint intake paused or off' USING ERRCODE='55000';
  END IF;
  PERFORM 1 FROM erp_private.agent_pdf_work w
  JOIN erp_private.agent_source_items i USING(connection_id,item_id,version)
  JOIN erp_private.agent_source_versions v USING(connection_id,item_id,version)
  WHERE w.operation_id=p_operation AND w.status='retry' AND w.lease_token=p_lease AND w.lease_until>clock_timestamp()
    AND ROW(w.connection_id,w.item_id,w.version,w.actor_id,w.company_id,w.sha256)
      = ROW(origin.connection_id,origin.item_id,origin.source_version,origin.owner_id,origin.company_id,origin.sha256)
    AND i.available AND i.filename=origin.filename AND v.mime='application/pdf' AND v.size_bytes=origin.file_size_bytes
  FOR UPDATE OF w FOR SHARE OF i,v;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SharePoint source or generation changed' USING ERRCODE='42501';
  END IF;
  PERFORM 1 FROM public.dms_upload_sessions s WHERE s.id=p_session
    AND ROW(s.owning_company_id,s.owning_branch_id,s.uploaded_by,s.file_size_bytes,s.sha256_hash,s.temp_storage_path,s.original_filename)
      = ROW(origin.company_id,origin.branch_id,origin.owner_id,origin.file_size_bytes,origin.sha256,origin.temp_storage_path,origin.filename)
    AND s.batch_id IS NULL AND s.origin_entity_type IS NULL AND s.origin_entity_id IS NULL
    AND s.document_id IS NULL AND s.ai_result_id IS NULL AND s.approve_run_id IS NULL AND s.deleted_at IS NULL
    AND s.temp_cleaned_at IS NULL AND s.discarded_at IS NULL AND s.expires_at>clock_timestamp() AND s.mime_type='application/pdf'
    AND (s.status='uploading' AND s.intake_status IN ('uploaded','uploading')
      OR s.status='uploaded' AND s.intake_status IN ('uploaded','ai_processing'))
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SharePoint intake state changed' USING ERRCODE='42501';
  END IF;
  PERFORM 1 FROM erp_private.dms_sharepoint_intake_authority a WHERE a.operation_id=p_operation
    AND a.lease_token=p_lease AND a.auth_session_id=p_auth_session FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SharePoint authenticated generation changed' USING ERRCODE='42501';
  END IF;
  PERFORM erp_private.dms_lock_sharepoint_operator(p_actor,origin.company_id,origin.branch_id,p_auth_session);
  PERFORM erp_private.dms_assert_sharepoint_current(p_operation,p_session,p_lease);
  RETURN origin;
END;
$function$;
REVOKE ALL ON FUNCTION erp_private.dms_lock_sharepoint_br1_review(uuid,bigint,uuid,bigint,uuid)
  FROM PUBLIC, anon, authenticated, service_role, erp_agent_discovery_runtime;

CREATE FUNCTION erp_private.dms_sharepoint_br1_review_receipt(
  origin erp_private.dms_sharepoint_intake_origins, p_auth_session uuid
) RETURNS jsonb LANGUAGE sql STABLE SET search_path = '' AS $function$
  SELECT jsonb_strip_nulls(jsonb_build_object(
    'operationId',origin.operation_id,'sessionId',origin.upload_session_id,
    'state',CASE WHEN s.result_id IS NOT NULL THEN 'review_pending'
      WHEN s.attempt_id IS NOT NULL THEN 'processing' WHEN s.operation_id IS NOT NULL THEN 'staged' ELSE 'uploading' END,
    'path',origin.temp_storage_path,'filename',origin.filename,'sha256',origin.sha256,'byteCount',origin.file_size_bytes,
    'actorId',origin.owner_id,'authSessionId',p_auth_session,'companyId',origin.company_id,'branchId',origin.branch_id,
    'attemptId',s.attempt_id,'processingRevision',s.processing_revision,'resultId',s.result_id,
    'reviewId',s.review_id,'notificationEventId',s.notification_event_id))
  FROM (SELECT 1) seed LEFT JOIN erp_private.dms_sharepoint_br1_review_state s ON s.operation_id=origin.operation_id;
$function$;
REVOKE ALL ON FUNCTION erp_private.dms_sharepoint_br1_review_receipt(erp_private.dms_sharepoint_intake_origins,uuid)
  FROM PUBLIC, anon, authenticated, service_role, erp_agent_discovery_runtime;

CREATE FUNCTION public.f07_prepare_sharepoint_worker_pdf(p_operation uuid,p_session bigint,p_lease uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE origin erp_private.dms_sharepoint_intake_origins; actor bigint:=public.current_user_profile_id();
  auth_session uuid:=(auth.jwt()->>'session_id')::uuid;
BEGIN
  IF auth.uid() IS NULL OR auth.jwt()->>'role' IS DISTINCT FROM 'authenticated' OR actor IS NULL THEN
    RAISE EXCEPTION 'SharePoint worker identity required' USING ERRCODE='42501';
  END IF;
  origin:=erp_private.dms_lock_sharepoint_br1_review(p_operation,p_session,p_lease,actor,auth_session);
  RETURN erp_private.dms_sharepoint_br1_review_receipt(origin,auth_session);
END;
$function$;
REVOKE ALL ON FUNCTION public.f07_prepare_sharepoint_worker_pdf(uuid,bigint,uuid)
  FROM PUBLIC, anon, authenticated, service_role, erp_agent_discovery_runtime;
GRANT EXECUTE ON FUNCTION public.f07_prepare_sharepoint_worker_pdf(uuid,bigint,uuid) TO authenticated;

CREATE FUNCTION public.f07_accept_sharepoint_worker_pdf(
  p_operation uuid,p_session bigint,p_lease uuid,p_actor bigint,p_auth_session uuid,
  p_object uuid,p_version text,p_updated timestamptz
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE origin erp_private.dms_sharepoint_intake_origins; intake public.dms_upload_sessions;
  state erp_private.dms_sharepoint_br1_review_state; object storage.objects; source jsonb; officer bigint;
BEGIN
  IF auth.jwt()->>'role' IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'SharePoint verification service required' USING ERRCODE='42501';
  END IF;
  origin:=erp_private.dms_lock_sharepoint_br1_review(p_operation,p_session,p_lease,p_actor,p_auth_session);
  SELECT * INTO state FROM erp_private.dms_sharepoint_br1_review_state WHERE operation_id=p_operation FOR UPDATE;
  IF state.result_id IS NOT NULL THEN RETURN erp_private.dms_sharepoint_br1_review_receipt(origin,p_auth_session); END IF;
  SELECT * INTO STRICT intake FROM public.dms_upload_sessions WHERE id=p_session;
  SELECT * INTO object FROM storage.objects WHERE bucket_id='dms-temp' AND name=origin.temp_storage_path FOR SHARE;
  IF NOT FOUND OR p_object IS NULL OR p_version IS NULL OR p_updated IS NULL
    OR ROW(object.id,object.version,date_trunc('milliseconds',object.updated_at)) IS DISTINCT FROM ROW(p_object,p_version,p_updated)
    OR object.metadata->>'size' IS DISTINCT FROM origin.file_size_bytes::text
    OR object.metadata->>'mimetype' IS DISTINCT FROM 'application/pdf' THEN
    RAISE EXCEPTION 'Verified SharePoint object identity changed' USING ERRCODE='PT409';
  END IF;
  IF state.operation_id IS NOT NULL THEN
    IF ROW(state.object_id,state.object_version,state.object_updated_at) IS DISTINCT FROM ROW(object.id,object.version,object.updated_at) THEN
      RAISE EXCEPTION 'Original SharePoint storage proof differs' USING ERRCODE='PT409';
    END IF;
    RETURN erp_private.dms_sharepoint_br1_review_receipt(origin,p_auth_session);
  END IF;
  SELECT m.officer_id INTO STRICT officer FROM erp_private.dms_sharepoint_br1_review_scope m WHERE m.connection_id=origin.connection_id;
  source:=erp_private.f07_intake_source_row(intake);
  INSERT INTO erp_private.dms_sharepoint_br1_write_permits VALUES(pg_backend_pid(),pg_current_xact_id(),p_session);
  PERFORM public.f07_attest_temp_upload(p_session,p_actor,p_auth_session,source,p_object,p_version,p_updated,origin.sha256);
  PERFORM public.f07_attest_intake_source(p_session,p_actor,p_auth_session,source,p_object,p_version,p_updated,origin.sha256);
  UPDATE erp_private.f07_single_upload_admissions SET acknowledged_at=clock_timestamp()
    WHERE operation_id=p_operation AND upload_session_id=p_session AND actor_id=p_actor AND acknowledged_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'SharePoint admission changed' USING ERRCODE='PT409'; END IF;
  UPDATE public.dms_upload_sessions SET status='uploaded',intake_status='uploaded',updated_at=clock_timestamp() WHERE id=p_session;
  INSERT INTO erp_private.dms_sharepoint_br1_review_state(operation_id,upload_session_id,officer_id,object_id,object_version,object_updated_at)
    VALUES(p_operation,p_session,officer,object.id,object.version,object.updated_at);
  PERFORM erp_private.dms_assert_sharepoint_current(p_operation,p_session,p_lease);
  DELETE FROM erp_private.dms_sharepoint_br1_write_permits WHERE backend_pid=pg_backend_pid()
    AND transaction_id=pg_current_xact_id() AND upload_session_id=p_session;
  RETURN erp_private.dms_sharepoint_br1_review_receipt(origin,p_auth_session);
END;
$function$;
REVOKE ALL ON FUNCTION public.f07_accept_sharepoint_worker_pdf(uuid,bigint,uuid,bigint,uuid,uuid,text,timestamptz)
  FROM PUBLIC, anon, authenticated, service_role, erp_agent_discovery_runtime;
GRANT EXECUTE ON FUNCTION public.f07_accept_sharepoint_worker_pdf(uuid,bigint,uuid,bigint,uuid,uuid,text,timestamptz) TO service_role;

CREATE FUNCTION erp_private.dms_sharepoint_br1_check_object(
  origin erp_private.dms_sharepoint_intake_origins, state erp_private.dms_sharepoint_br1_review_state
) RETURNS void LANGUAGE plpgsql SET search_path = '' AS $function$
BEGIN
  PERFORM 1 FROM storage.objects o JOIN erp_private.f07_intake_sources proof ON proof.upload_session_id=origin.upload_session_id
  JOIN public.dms_upload_sessions intake ON intake.id=proof.upload_session_id
  WHERE o.id=state.object_id AND o.bucket_id='dms-temp' AND o.name=origin.temp_storage_path
    AND o.version=state.object_version AND o.updated_at=state.object_updated_at
    AND o.metadata->>'size'=origin.file_size_bytes::text AND o.metadata->>'mimetype'='application/pdf'
    AND ROW(proof.object_id,proof.object_version,proof.object_updated_at,proof.sha256)
      = ROW(o.id,o.version,o.updated_at,origin.sha256) AND proof.source=erp_private.f07_intake_source_row(intake)
  FOR SHARE OF o,proof;
  IF NOT FOUND THEN RAISE EXCEPTION 'SharePoint original storage proof changed' USING ERRCODE='PT409'; END IF;
END;
$function$;
REVOKE ALL ON FUNCTION erp_private.dms_sharepoint_br1_check_object(erp_private.dms_sharepoint_intake_origins,erp_private.dms_sharepoint_br1_review_state)
  FROM PUBLIC, anon, authenticated, service_role, erp_agent_discovery_runtime;

CREATE FUNCTION public.f07_claim_sharepoint_worker_review(
  p_operation uuid,p_session bigint,p_lease uuid,p_actor bigint,p_auth_session uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE origin erp_private.dms_sharepoint_intake_origins; state erp_private.dms_sharepoint_br1_review_state; claim_at timestamptz;
BEGIN
  IF auth.jwt()->>'role' IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'SharePoint review service required' USING ERRCODE='42501';
  END IF;
  origin:=erp_private.dms_lock_sharepoint_br1_review(p_operation,p_session,p_lease,p_actor,p_auth_session);
  SELECT * INTO state FROM erp_private.dms_sharepoint_br1_review_state WHERE operation_id=p_operation FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Verify the original SharePoint PDF first' USING ERRCODE='PT409'; END IF;
  IF state.result_id IS NOT NULL OR state.lease_token=p_lease THEN
    RETURN erp_private.dms_sharepoint_br1_review_receipt(origin,p_auth_session)||jsonb_build_object('started',false);
  END IF;
  PERFORM erp_private.dms_sharepoint_br1_check_object(origin,state);
  INSERT INTO erp_private.dms_sharepoint_br1_write_permits VALUES(pg_backend_pid(),pg_current_xact_id(),p_session);
  UPDATE public.dms_upload_sessions SET intake_status='ai_processing',
    updated_at=greatest(clock_timestamp(), updated_at+interval '1 microsecond')
    WHERE id=p_session RETURNING updated_at INTO claim_at;
  UPDATE erp_private.dms_sharepoint_br1_review_state SET attempt_id=gen_random_uuid(),lease_token=p_lease,processing_revision=claim_at
    WHERE operation_id=p_operation;
  PERFORM erp_private.dms_assert_sharepoint_current(p_operation,p_session,p_lease);
  DELETE FROM erp_private.dms_sharepoint_br1_write_permits WHERE backend_pid=pg_backend_pid()
    AND transaction_id=pg_current_xact_id() AND upload_session_id=p_session;
  RETURN erp_private.dms_sharepoint_br1_review_receipt(origin,p_auth_session)||jsonb_build_object('started',true);
END;
$function$;
REVOKE ALL ON FUNCTION public.f07_claim_sharepoint_worker_review(uuid,bigint,uuid,bigint,uuid)
  FROM PUBLIC, anon, authenticated, service_role, erp_agent_discovery_runtime;
GRANT EXECUTE ON FUNCTION public.f07_claim_sharepoint_worker_review(uuid,bigint,uuid,bigint,uuid) TO service_role;


CREATE FUNCTION public.f07_publish_sharepoint_worker_review(
  p_operation uuid,p_session bigint,p_lease uuid,p_actor bigint,p_auth_session uuid,
  p_attempt uuid,p_claim_at timestamptz,p_output jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE
  origin erp_private.dms_sharepoint_intake_origins;
  state erp_private.dms_sharepoint_br1_review_state;
  intake public.dms_upload_sessions;
  result public.dms_ai_extraction_results;
  job_id bigint;
  v_review_id bigint;
  event_id bigint;
  type_id bigint;
  job jsonb := p_output->'job';
  evidence jsonb := p_output->'result';
  classification jsonb;
  output_hash text;
  deadline timestamptz;
BEGIN
  IF auth.jwt()->>'role' IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'SharePoint review service required' USING ERRCODE='42501';
  END IF;
  IF p_attempt IS NULL OR p_claim_at IS NULL OR jsonb_typeof(p_output) IS DISTINCT FROM 'object'
    OR octet_length(p_output::text)>262144 OR jsonb_typeof(job) IS DISTINCT FROM 'object'
    OR jsonb_typeof(evidence) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Invalid SharePoint review output' USING ERRCODE='22023';
  END IF;
  origin:=erp_private.dms_lock_sharepoint_br1_review(p_operation,p_session,p_lease,p_actor,p_auth_session);
  SELECT * INTO state FROM erp_private.dms_sharepoint_br1_review_state WHERE operation_id=p_operation FOR UPDATE;
  IF NOT FOUND OR ROW(state.attempt_id,state.lease_token,state.processing_revision) IS DISTINCT FROM ROW(p_attempt,p_lease,p_claim_at) THEN
    RAISE EXCEPTION 'SharePoint processing claim changed' USING ERRCODE='PT409';
  END IF;
  output_hash:=encode(sha256(convert_to(p_output::text,'UTF8')),'hex');
  IF state.result_id IS NOT NULL THEN
    IF state.output_sha256 IS DISTINCT FROM output_hash THEN
      RAISE EXCEPTION 'Retained SharePoint review output differs' USING ERRCODE='PT409';
    END IF;
    RETURN erp_private.dms_sharepoint_br1_review_receipt(origin,p_auth_session);
  END IF;
  SELECT * INTO STRICT intake FROM public.dms_upload_sessions WHERE id=p_session;
  IF intake.intake_status <> 'ai_processing' OR intake.updated_at IS DISTINCT FROM p_claim_at THEN
    RAISE EXCEPTION 'SharePoint processing revision changed' USING ERRCODE='PT409';
  END IF;
  PERFORM erp_private.dms_sharepoint_br1_check_object(origin,state);
  PERFORM 1 FROM public.erp_ai_feature_flags f WHERE f.feature_code='DMS_AI_REVIEW' AND f.is_enabled FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SharePoint officer review unavailable' USING ERRCODE='42501'; END IF;

  PERFORM erp_private.ai_mod04_lock_profile_authority(state.officer_id);
  IF state.officer_id=origin.owner_id OR EXISTS (
    SELECT 1 FROM unnest(ARRAY['dms.documents.preview','dms.documents.review_ai','notifications.view']) c(code)
    WHERE erp_private.ai_mod04_profile_grant(state.officer_id,c.code,origin.company_id,origin.branch_id) IS NOT TRUE
  ) THEN
    RAISE EXCEPTION 'Current scoped SharePoint officer authority required' USING ERRCODE='42501';
  END IF;
  SELECT t.id INTO STRICT type_id FROM public.dms_document_types t
  WHERE t.type_code='LABOUR_CARD' AND t.is_active AND t.deleted_at IS NULL FOR SHARE;

  IF coalesce(job->>'inputTextHash','') !~ '^[a-f0-9]{64}$'
    OR coalesce(length(job->>'provider'),0) NOT BETWEEN 1 AND 80
    OR coalesce(length(job->>'model'),0) NOT BETWEEN 1 AND 120
    OR coalesce(length(job->>'promptVersion'),0) NOT BETWEEN 1 AND 120
    OR coalesce(job->>'providerConfigId','') !~ '^[1-9][0-9]{0,17}$'
    OR coalesce(job->>'durationMs','') !~ '^[0-9]{1,8}$'
    OR coalesce(evidence->>'classificationConfidence','') NOT IN ('high','medium','low','needs_manual_review')
    OR jsonb_typeof(evidence->'classificationScore') IS DISTINCT FROM 'number'
    OR (evidence->>'classificationScore')::numeric NOT BETWEEN 0 AND 1
    OR coalesce(length(evidence->>'title'),0) NOT BETWEEN 1 AND 300
    OR coalesce(length(evidence->>'classificationReason'),0)>500
    OR coalesce(length(evidence->>'description'),0)>2000
    OR coalesce(length(evidence->>'rawOcrText'),0)>100000
    OR jsonb_typeof(evidence->'extractedFields') IS DISTINCT FROM 'object'
    OR jsonb_typeof(evidence->'fieldConfidence') IS DISTINCT FROM 'object'
    OR NOT coalesce(evidence->'rawResponse'->'preparation' @> jsonb_build_object(
      'bundle','single','split','not_requested','sourceHash',origin.sha256,'typeCode','LABOUR_CARD'),false) THEN
    RAISE EXCEPTION 'SharePoint verified Work Permit preparation required' USING ERRCODE='22023';
  END IF;
  classification:=evidence->'rawResponse'->'classification';

  SELECT least(w.lease_until,s.expires_at,m.expires_at,a.not_after)
    INTO STRICT deadline
  FROM erp_private.agent_pdf_work w
  JOIN erp_private.dms_sharepoint_br1_review_scope m ON m.connection_id=w.connection_id
  JOIN auth.sessions a ON a.id=p_auth_session
  JOIN public.dms_upload_sessions s ON s.id=p_session
  WHERE w.operation_id=p_operation;
  IF deadline <= clock_timestamp() THEN
    RAISE EXCEPTION 'SharePoint review authority expired' USING ERRCODE='42501';
  END IF;

  INSERT INTO erp_private.dms_sharepoint_br1_write_permits VALUES(pg_backend_pid(),pg_current_xact_id(),p_session);
  INSERT INTO public.dms_ai_extraction_jobs (
    upload_session_id,job_type,provider,model,status,run_source,input_text_hash,prompt_version,
    provider_config_id,created_by,started_at,completed_at,duration_ms)
  VALUES (p_session,'classify_extract',job->>'provider',job->>'model','complete','ai_intake',
    job->>'inputTextHash',job->>'promptVersion',(job->>'providerConfigId')::bigint,p_actor,
    p_claim_at,clock_timestamp(),(job->>'durationMs')::integer) RETURNING id INTO job_id;

  INSERT INTO public.dms_ai_extraction_results (
    job_id,upload_session_id,result_type,ai_status,suggested_document_type_id,classification_confidence,
    classification_score,classification_reason,extracted_fields_json,field_confidence_json,suggested_links_json,
    issue_date_suggestion,expiry_date_suggestion,suggested_title,suggested_description,raw_response_json,raw_ocr_text)
  VALUES (job_id,p_session,'combined','pending_review',type_id,evidence->>'classificationConfidence',
    (evidence->>'classificationScore')::numeric,evidence->>'classificationReason',evidence->'extractedFields',
    evidence->'fieldConfidence','[]'::jsonb,(evidence->>'issueDate')::date,(evidence->>'expiryDate')::date,
    evidence->>'title',evidence->>'description',evidence->'rawResponse',evidence->>'rawOcrText')
  RETURNING * INTO result;

  PERFORM public.f07_attest_intake_analysis(p_session,p_actor,p_auth_session,result.id,
    to_jsonb(result)-ARRAY['id','created_at','updated_at'],p_claim_at);
  UPDATE public.dms_upload_sessions SET intake_status='review_pending',review_status='pending',
    ai_job_id=job_id,ai_result_id=result.id,updated_at=clock_timestamp() WHERE id=p_session;

  INSERT INTO public.audit_logs (actor_user_profile_id,owner_company_id,branch_id,module_code,
    entity_name,entity_id,entity_reference,action,new_values)
  VALUES (p_actor,origin.company_id,origin.branch_id,'DMS','dms_upload_sessions',p_session,intake.session_code,
    'update',jsonb_build_object('event','classification_completed','job_id',job_id,'result_id',result.id,
      'duration_ms',(job->>'durationMs')::integer,'suggested_type_code','LABOUR_CARD','classification_score',result.classification_score,
      'needs_human_review',true,'prompt_version',job->>'promptVersion'));
  IF result.classification_score<0.6 OR classification->>'needs_human_review'='true' THEN
    INSERT INTO public.audit_logs (actor_user_profile_id,owner_company_id,branch_id,module_code,
      entity_name,entity_id,entity_reference,action,new_values)
    VALUES (p_actor,origin.company_id,origin.branch_id,'DMS','dms_upload_sessions',p_session,intake.session_code,
      'update',jsonb_build_object('event','classification_low_confidence','result_id',result.id,
      'classification_score',result.classification_score,'review_reason',classification->>'review_reason'));
  END IF;
  INSERT INTO erp_private.dms_intake_publication_receipts(result_id,upload_session_id,job_id,actor_id,claim_at)
    VALUES(result.id,p_session,job_id,p_actor,p_claim_at);

  INSERT INTO public.dms_review_queue (upload_session_id,ai_result_id,assigned_to,assigned_at,status,priority,review_type,
    source_type,source_id,idempotency_key,reason_code,reason_message,created_by)
  VALUES (p_session,result.id,state.officer_id,clock_timestamp(),'assigned','normal','intake_metadata_review','intake',
    p_session::text,'sharepoint-br1:'||p_operation,'sharepoint_intake_ready',
    'A SharePoint PDF completed AI Fill and is ready for officer review.',p_actor) RETURNING id INTO v_review_id;
  SELECT e.id INTO STRICT event_id FROM erp_private.notification_events e
  WHERE e.source_table='dms_review_queue' AND e.source_id=v_review_id AND e.event_type='dms_review_queue_assigned'
    AND e.actor_id=p_actor AND e.source_snapshot->>'assigned_to'=state.officer_id::text;
  UPDATE erp_private.dms_sharepoint_br1_review_state SET result_id=result.id,review_id=v_review_id,
    notification_event_id=event_id,output_sha256=output_hash WHERE operation_id=p_operation;
  PERFORM erp_private.dms_assert_sharepoint_current(p_operation,p_session,p_lease);
  UPDATE erp_private.agent_pdf_work SET status='review_pending',session_id=p_session,review_id=v_review_id,
    lease_token=NULL,lease_until=NULL,reason=NULL WHERE operation_id=p_operation;
  IF deadline <= clock_timestamp() THEN
    RAISE EXCEPTION 'SharePoint review authority expired' USING ERRCODE='42501';
  END IF;
  DELETE FROM erp_private.dms_sharepoint_br1_write_permits WHERE backend_pid=pg_backend_pid()
    AND transaction_id=pg_current_xact_id() AND upload_session_id=p_session;
  RETURN erp_private.dms_sharepoint_br1_review_receipt(origin,p_auth_session);
END;
$function$;
REVOKE ALL ON FUNCTION public.f07_publish_sharepoint_worker_review(uuid,bigint,uuid,bigint,uuid,uuid,timestamptz,jsonb)
  FROM PUBLIC, anon, authenticated, service_role, erp_agent_discovery_runtime;
GRANT EXECUTE ON FUNCTION public.f07_publish_sharepoint_worker_review(uuid,bigint,uuid,bigint,uuid,uuid,timestamptz,jsonb) TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
