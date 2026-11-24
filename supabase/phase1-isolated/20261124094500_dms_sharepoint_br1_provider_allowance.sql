BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- Keep the BR1 worker paused and DMS_AGENT_CENTER_SHAREPOINT_FLOW off during rollout.
-- Drain older app binaries before verifying the paired route and migration, then enable the reviewed scope.
-- An explicit allowance applies to one immutable intake origin. No allowance is seeded.
CREATE TABLE erp_private.dms_sharepoint_br1_provider_allowances (
  operation_id uuid PRIMARY KEY REFERENCES erp_private.dms_sharepoint_intake_origins(operation_id),
  provider_config_id bigint NOT NULL REFERENCES public.erp_ai_provider_configs(id),
  provider_config_updated_at timestamptz NOT NULL CHECK (isfinite(provider_config_updated_at)),
  model text NOT NULL CHECK (length(model) BETWEEN 1 AND 120),
  prompt_version text NOT NULL CHECK (length(prompt_version) BETWEEN 1 AND 120),
  max_attempts integer NOT NULL CHECK (max_attempts > 0),
  expires_at timestamptz NOT NULL CHECK (isfinite(expires_at))
);

-- A committed reservation is consumed even when dispatch or the reply is uncertain.
-- Lease renewal and allowance replacement neither delete the proof nor restore an attempt.
CREATE TABLE erp_private.dms_sharepoint_br1_provider_attempts (
  attempt_id uuid PRIMARY KEY,
  operation_id uuid NOT NULL REFERENCES erp_private.dms_sharepoint_intake_origins(operation_id),
  lease_token uuid NOT NULL,
  auth_session_id uuid NOT NULL,
  processing_revision timestamptz NOT NULL,
  provider_config_id bigint NOT NULL,
  provider_config_updated_at timestamptz NOT NULL,
  model text NOT NULL,
  prompt_version text NOT NULL,
  reserved_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  UNIQUE (operation_id, lease_token),
  CHECK (processing_revision <= reserved_at AND reserved_at < expires_at)
);
ALTER TABLE erp_private.dms_sharepoint_br1_provider_allowances ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_private.dms_sharepoint_br1_provider_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON erp_private.dms_sharepoint_br1_provider_allowances, erp_private.dms_sharepoint_br1_provider_attempts
  FROM PUBLIC, anon, authenticated, service_role, erp_agent_discovery_runtime;

CREATE FUNCTION public.f07_reserve_sharepoint_worker_provider_attempt(
  p_operation uuid,p_session bigint,p_lease uuid,p_actor bigint,p_auth_session uuid,
  p_attempt uuid,p_claim_at timestamptz,p_provider text,p_config bigint,p_config_updated_at timestamptz,
  p_model text,p_prompt text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE
  origin erp_private.dms_sharepoint_intake_origins;
  state erp_private.dms_sharepoint_br1_review_state;
  allowance erp_private.dms_sharepoint_br1_provider_allowances;
  deadline timestamptz;
  reserved_at timestamptz;
BEGIN
  IF auth.jwt()->>'role' IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'SharePoint review service required' USING ERRCODE='42501';
  END IF;
  origin:=erp_private.dms_lock_sharepoint_br1_review(p_operation,p_session,p_lease,p_actor,p_auth_session);
  SELECT * INTO state FROM erp_private.dms_sharepoint_br1_review_state WHERE operation_id=p_operation FOR UPDATE;
  IF NOT FOUND OR state.result_id IS NOT NULL OR p_attempt IS NULL OR p_claim_at IS NULL
    OR ROW(state.attempt_id,state.lease_token,state.processing_revision) IS DISTINCT FROM ROW(p_attempt,p_lease,p_claim_at)
    OR NOT EXISTS (SELECT 1 FROM public.dms_upload_sessions s WHERE s.id=p_session
      AND s.intake_status='ai_processing' AND s.updated_at=p_claim_at) THEN
    RAISE EXCEPTION 'SharePoint processing claim changed' USING ERRCODE='PT409';
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

  SELECT * INTO allowance FROM erp_private.dms_sharepoint_br1_provider_allowances WHERE operation_id=p_operation FOR UPDATE;
  IF NOT FOUND OR p_provider IS DISTINCT FROM 'openai'
    OR ROW(allowance.provider_config_id,allowance.provider_config_updated_at,allowance.model,allowance.prompt_version)
      IS DISTINCT FROM ROW(p_config,p_config_updated_at,p_model,p_prompt) THEN
    RAISE EXCEPTION 'Approved SharePoint provider configuration unavailable' USING ERRCODE='42501';
  END IF;
  PERFORM 1 FROM public.erp_ai_provider_configs c WHERE c.id=p_config AND c.config_code='DEFAULT_DMS_CLASSIFIER'
    AND c.provider_type='openai' AND c.model_id=p_model AND c.updated_at=p_config_updated_at
    AND c.is_enabled AND c.is_active AND c.deleted_at IS NULL FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Approved SharePoint provider configuration changed' USING ERRCODE='42501'; END IF;

  IF EXISTS (SELECT 1 FROM erp_private.dms_sharepoint_br1_provider_attempts a WHERE a.attempt_id=p_attempt
      OR (a.operation_id=p_operation AND a.lease_token=p_lease))
    OR (SELECT count(*) FROM erp_private.dms_sharepoint_br1_provider_attempts a WHERE a.operation_id=p_operation)
      >= allowance.max_attempts THEN
    RAISE EXCEPTION 'SharePoint provider attempt already consumed or exhausted' USING ERRCODE='PT409';
  END IF;

  SELECT least(w.lease_until,s.expires_at,m.expires_at,a.not_after,allowance.expires_at)
    INTO STRICT deadline
  FROM erp_private.agent_pdf_work w
  JOIN erp_private.dms_sharepoint_br1_review_scope m ON m.connection_id=w.connection_id
  JOIN auth.sessions a ON a.id=p_auth_session
  JOIN public.dms_upload_sessions s ON s.id=p_session
  WHERE w.operation_id=p_operation;
  PERFORM erp_private.dms_assert_sharepoint_current(p_operation,p_session,p_lease);
  reserved_at:=clock_timestamp();
  IF deadline <= reserved_at THEN RAISE EXCEPTION 'SharePoint provider allowance expired' USING ERRCODE='42501'; END IF;

  INSERT INTO erp_private.dms_sharepoint_br1_provider_attempts (
    attempt_id,operation_id,lease_token,auth_session_id,processing_revision,provider_config_id,
    provider_config_updated_at,model,prompt_version,reserved_at,expires_at
  ) VALUES (p_attempt,p_operation,p_lease,p_auth_session,p_claim_at,p_config,p_config_updated_at,
    p_model,p_prompt,reserved_at,deadline);
  RETURN jsonb_build_object('operationId',p_operation,'sessionId',p_session,'attemptId',p_attempt,
    'processingRevision',p_claim_at,'expiresAt',deadline);
END;
$function$;
REVOKE ALL ON FUNCTION public.f07_reserve_sharepoint_worker_provider_attempt(
  uuid,bigint,uuid,bigint,uuid,uuid,timestamptz,text,bigint,timestamptz,text,text)
  FROM PUBLIC, anon, authenticated, service_role, erp_agent_discovery_runtime;
GRANT EXECUTE ON FUNCTION public.f07_reserve_sharepoint_worker_provider_attempt(
  uuid,bigint,uuid,bigint,uuid,uuid,timestamptz,text,bigint,timestamptz,text,text) TO service_role;

-- Keep the reviewed publication transaction and its retained-receipt semantics.
ALTER FUNCTION public.f07_publish_sharepoint_worker_review(uuid,bigint,uuid,bigint,uuid,uuid,timestamptz,jsonb)
  SET SCHEMA erp_private;
REVOKE ALL ON FUNCTION erp_private.f07_publish_sharepoint_worker_review(uuid,bigint,uuid,bigint,uuid,uuid,timestamptz,jsonb)
  FROM PUBLIC, anon, authenticated, service_role, erp_agent_discovery_runtime;

CREATE FUNCTION public.f07_publish_sharepoint_worker_review(
  p_operation uuid,p_session bigint,p_lease uuid,p_actor bigint,p_auth_session uuid,
  p_attempt uuid,p_claim_at timestamptz,p_output jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
DECLARE
  state erp_private.dms_sharepoint_br1_review_state;
  deadline timestamptz;
  receipt jsonb;
BEGIN
  IF auth.jwt()->>'role' IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'SharePoint review service required' USING ERRCODE='42501';
  END IF;
  PERFORM erp_private.dms_lock_sharepoint_br1_review(p_operation,p_session,p_lease,p_actor,p_auth_session);
  SELECT * INTO state FROM erp_private.dms_sharepoint_br1_review_state WHERE operation_id=p_operation FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SharePoint processing claim changed' USING ERRCODE='PT409'; END IF;
  IF state.result_id IS NULL THEN
    SELECT least(a.expires_at,b.expires_at) INTO deadline FROM erp_private.dms_sharepoint_br1_provider_attempts a
    JOIN erp_private.dms_sharepoint_br1_provider_allowances b USING (operation_id)
    JOIN public.erp_ai_provider_configs c ON c.id=a.provider_config_id
    WHERE a.attempt_id=p_attempt AND a.operation_id=p_operation AND a.lease_token=p_lease
      AND a.auth_session_id=p_auth_session AND a.processing_revision=p_claim_at
      AND ROW(a.provider_config_id,a.provider_config_updated_at,a.model,a.prompt_version)
        = ROW(b.provider_config_id,b.provider_config_updated_at,b.model,b.prompt_version)
      AND c.config_code='DEFAULT_DMS_CLASSIFIER' AND c.provider_type='openai'
      AND c.model_id=a.model AND c.updated_at=a.provider_config_updated_at
      AND c.is_enabled AND c.is_active AND c.deleted_at IS NULL
      AND p_output->'job'->>'provider'='openai' AND p_output->'job'->>'providerConfigId'=a.provider_config_id::text
      AND p_output->'job'->>'model'=a.model AND p_output->'job'->>'promptVersion'=a.prompt_version
    FOR SHARE OF a,b,c;
    IF NOT FOUND OR deadline<=clock_timestamp() THEN
      RAISE EXCEPTION 'Matching current SharePoint provider reservation required' USING ERRCODE='PT409';
    END IF;
  END IF;
  receipt:=erp_private.f07_publish_sharepoint_worker_review(
    p_operation,p_session,p_lease,p_actor,p_auth_session,p_attempt,p_claim_at,p_output);
  IF deadline<=clock_timestamp() THEN
    RAISE EXCEPTION 'SharePoint provider reservation expired before publication' USING ERRCODE='PT409';
  END IF;
  RETURN receipt;
END;
$function$;
REVOKE ALL ON FUNCTION public.f07_publish_sharepoint_worker_review(uuid,bigint,uuid,bigint,uuid,uuid,timestamptz,jsonb)
  FROM PUBLIC, anon, authenticated, service_role, erp_agent_discovery_runtime;
GRANT EXECUTE ON FUNCTION public.f07_publish_sharepoint_worker_review(uuid,bigint,uuid,bigint,uuid,uuid,timestamptz,jsonb) TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
