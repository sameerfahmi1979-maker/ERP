BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- Match retry lock order: auth user and session, scoped grants, then upload.
-- Keep the vetted publisher's body, identity, owner and grants otherwise intact.
DO $patch$
DECLARE
  definition text;
  scope_lock text := '  PERFORM erp_private.f07_lock_intake_review_authority(p_session);';
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO STRICT definition
  FROM pg_proc p
  WHERE p.oid = 'erp_private.dms_publish_intake_classification(bigint,text,timestamptz,bigint,bigint)'::regprocedure
    AND p.proowner = 'erp_transaction_audit_writer'::regrole
    AND p.prosecdef
    AND md5(replace(p.prosrc, E'\r\n', E'\n')) = 'bbdfe267ec9d0d38b420f2373079952b';

  IF position(scope_lock IN definition) = 0 THEN
    RAISE EXCEPTION 'Expected intake publication authority lock is missing';
  END IF;
  EXECUTE replace(definition, scope_lock,
    '  PERFORM erp_private.dms_lock_intake_retry_session();' || E'\n' || scope_lock);
END;
$patch$;

COMMIT;
