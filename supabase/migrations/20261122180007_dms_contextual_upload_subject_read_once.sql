BEGIN;
SET LOCAL search_path = pg_catalog;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $change$
DECLARE
  expected record;
  actual record;
  definition text;
  original_acl aclitem[];
  original_gate constant text := ' OR NOT erp_private.upload_session_allowed(p_session)';
  original_row constant text := ' IF NOT FOUND THEN RETURN false;END IF;';
  checked_row constant text := ' IF NOT FOUND OR erp_private.upload_row_allowed(s.uploaded_by,s.owning_company_id,s.owning_branch_id,s.document_id) IS NOT TRUE THEN RETURN false;END IF;';
BEGIN
  IF current_user <> 'postgres' THEN RAISE EXCEPTION 'Reviewed upload helper owner required'; END IF;
  FOR expected IN SELECT * FROM (VALUES
    ('erp_private.f07_upload_subject_allowed(bigint)', '1f235eb26fecc1fe29a163aee593c575'),
    ('erp_private.upload_session_allowed(bigint)', 'a887d0557456f91e9e46998221251b6f'),
    ('erp_private.upload_row_allowed(bigint,bigint,bigint,bigint)', '5effa05af90b2e11331c41762bb12ca9')
  ) AS v(signature, body_hash)
  LOOP
    SELECT * INTO STRICT actual FROM pg_proc WHERE oid = to_regprocedure(expected.signature);
    IF actual.proowner <> 'postgres'::regrole OR NOT actual.prosecdef OR actual.provolatile <> 's'
      OR actual.proretset OR actual.prorettype <> 'boolean'::regtype
      OR actual.proconfig IS DISTINCT FROM ARRAY['search_path=""']
      OR md5(replace(actual.prosrc, E'\r', '')) IS DISTINCT FROM expected.body_hash
      OR ARRAY(SELECT acl::text FROM unnest(actual.proacl) AS acl ORDER BY acl::text)
        IS DISTINCT FROM ARRAY['authenticated=X/postgres','postgres=X/postgres']
    THEN RAISE EXCEPTION 'Reviewed upload authority helper drift: %', expected.signature; END IF;
  END LOOP;

  FOR expected IN SELECT * FROM (VALUES
    ('f03_upload_subject_select', '2f25cbb722b9a83b40ed4d4f40228843'),
    ('f07_original_upload_subject_read', '5a01480bafd25329d10ab4e424de2c3a')
  ) AS v(policy, predicate_hash)
  LOOP
    SELECT * INTO STRICT actual FROM pg_policy
      WHERE polrelid = 'public.dms_upload_sessions'::regclass AND polname = expected.policy;
    IF actual.polpermissive OR actual.polcmd <> 'r'
      OR actual.polroles IS DISTINCT FROM ARRAY['authenticated'::regrole::oid]
      OR md5(pg_get_expr(actual.polqual, actual.polrelid)) IS DISTINCT FROM expected.predicate_hash
    THEN RAISE EXCEPTION 'Reviewed upload subject policy drift: %', expected.policy; END IF;
  END LOOP;

  SELECT replace(pg_get_functiondef(oid), E'\r', ''), proacl INTO STRICT definition, original_acl
    FROM pg_proc WHERE oid = 'erp_private.f07_upload_subject_allowed(bigint)'::regprocedure;
  IF length(definition) - length(replace(definition, original_gate, '')) <> length(original_gate)
    OR length(definition) - length(replace(definition, original_row, '')) <> length(original_row)
  THEN RAISE EXCEPTION 'Upload subject authority fence changed'; END IF;

  -- upload_session_allowed requires an undeleted session and upload_row_allowed
  -- to be true. Reuse that exact check on the single session read already used
  -- for the original subject. A null result remains a denial.
  EXECUTE replace(replace(definition, original_gate, ''), original_row, checked_row);
  IF (SELECT proacl FROM pg_proc WHERE oid = 'erp_private.f07_upload_subject_allowed(bigint)'::regprocedure)
    IS DISTINCT FROM original_acl
  THEN RAISE EXCEPTION 'Upload subject helper grants changed'; END IF;
END $change$;

COMMIT;
