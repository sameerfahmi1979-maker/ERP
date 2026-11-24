BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE OR REPLACE FUNCTION erp_private.dms_lock_intake_retry_session() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  user_deleted_at timestamptz;
  user_banned_until timestamptz;
  session_expires_at timestamptz;
  checked_at timestamptz;
BEGIN
  SELECT u.deleted_at, u.banned_until INTO user_deleted_at, user_banned_until
  FROM auth.users u WHERE u.id = auth.uid() FOR SHARE;
  IF NOT FOUND OR user_deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Active ERP session required' USING ERRCODE = '42501';
  END IF;

  SELECT s.not_after INTO session_expires_at FROM auth.sessions s
  WHERE s.user_id = auth.uid() AND s.id::text = auth.jwt()->>'session_id'
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active ERP session required' USING ERRCODE = '42501';
  END IF;

  checked_at := clock_timestamp();
  IF user_banned_until >= checked_at OR session_expires_at <= checked_at
    OR NOT erp_private.business_principal_is_active() THEN
    RAISE EXCEPTION 'Active ERP session required' USING ERRCODE = '42501';
  END IF;
END;
$$;

-- A locked session row can still expire while the request waits on the source.
-- Repeat the wall-clock check after proof waits and before acknowledging writes.
DO $patch$
DECLARE
  definition text;
  auth_lock text := '  PERFORM erp_private.dms_lock_intake_retry_session();';
  publish_proof text := '  PERFORM erp_private.dms_check_intake_publication_proof(p_session,p_claim_at,p_job,p_result);';
  publish_result text := '  RETURN jsonb_build_object(''id'',p_session,''session_code'',p_code';
  reset_source text := '  source := public.f07_prepare_intake_source(p_session)->''source'';';
  reset_result text := '  RETURN jsonb_build_object(''id'', p_session, ''session_code'', upload.session_code';
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO STRICT definition FROM pg_proc p
  WHERE p.oid = 'erp_private.dms_publish_intake_classification(bigint,text,timestamptz,bigint,bigint)'::regprocedure
    AND p.proowner = 'erp_transaction_audit_writer'::regrole AND p.prosecdef
    AND md5(replace(p.prosrc, E'\r\n', E'\n')) = 'c6b63c0be50b5cddc254dc8e5b985fd9';
  IF position(publish_proof IN definition) = 0 OR position(publish_result IN definition) = 0 THEN
    RAISE EXCEPTION 'Expected intake publication checks are missing';
  END IF;
  definition := replace(definition, publish_proof, publish_proof || E'\n' || auth_lock);
  EXECUTE replace(definition, publish_result, auth_lock || E'\n' || publish_result);

  SELECT pg_get_functiondef(p.oid) INTO STRICT definition FROM pg_proc p
  WHERE p.oid = 'erp_private.dms_reset_intake_retry(bigint,uuid,timestamptz,jsonb,jsonb)'::regprocedure
    AND p.proowner = 'erp_transaction_audit_writer'::regrole AND p.prosecdef
    AND md5(replace(p.prosrc, E'\r\n', E'\n')) = '16c6284aedb8fc48438a95c3bf3c765e';
  IF position(reset_source IN definition) = 0 OR position(reset_result IN definition) = 0 THEN
    RAISE EXCEPTION 'Expected intake retry checks are missing';
  END IF;
  definition := replace(definition, reset_source, reset_source || E'\n' || auth_lock);
  EXECUTE replace(definition, reset_result, auth_lock || E'\n' || reset_result);
END;
$patch$;

ALTER FUNCTION erp_private.dms_publish_intake_classification(bigint,text,timestamptz,bigint,bigint)
  SET lock_timeout TO '5s';

COMMIT;
