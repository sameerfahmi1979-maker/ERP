BEGIN;
SET LOCAL search_path = pg_catalog;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $preimage$
DECLARE
  expected record;
  actual record;
BEGIN
  IF current_user <> 'postgres' OR NOT EXISTS (
    SELECT 1 FROM pg_class
    WHERE oid = 'public.dms_upload_sessions'::regclass AND relrowsecurity AND relowner = 'postgres'::regrole
  ) THEN RAISE EXCEPTION 'Reviewed Inbox RLS owner required'; END IF;

  -- The bound upload action is a disjunct of the checked point gate. Verify
  -- both action lookups and the global-admin qualification used by the prefilter.
  FOR expected IN SELECT * FROM (VALUES
    ('erp_private.upload_row_allowed(bigint,bigint,bigint,bigint)', '5effa05af90b2e11331c41762bb12ca9'),
    ('erp_private.document_permission(bigint,text)', '1234c9bc566ace5131d264798e27728b'),
    ('public.current_user_has_permission_any_scope(text)', '4e7bd1d214481464f237f8e57cdf09c3'),
    ('public.current_user_is_global_admin()', '5375091be37487c37872452fa3837466')
  ) AS v(signature, body_hash)
  LOOP
    SELECT * INTO STRICT actual FROM pg_proc WHERE oid = to_regprocedure(expected.signature);
    IF actual.proowner <> 'postgres'::regrole OR NOT actual.prosecdef OR actual.provolatile <> 's'
      OR actual.proretset OR actual.prorettype <> 'boolean'::regtype
      OR md5(replace(actual.prosrc, E'\r\n', E'\n')) IS DISTINCT FROM expected.body_hash
      OR NOT has_function_privilege('authenticated', actual.oid, 'EXECUTE')
    THEN RAISE EXCEPTION 'Reviewed Inbox authority helper drift: %', expected.signature; END IF;
  END LOOP;

  FOR expected IN SELECT * FROM (VALUES
    ('f03_principal', '*', '7f2345bb3c7af80f4c0290b3ef9c491c'),
    ('f03_upload_subject_select', 'r', '2f25cbb722b9a83b40ed4d4f40228843'),
    ('f07_original_upload_subject_read', 'r', '5a01480bafd25329d10ab4e424de2c3a')
  ) AS v(policy_name, command, predicate_hash)
  LOOP
    SELECT * INTO STRICT actual FROM pg_policy
    WHERE polrelid = 'public.dms_upload_sessions'::regclass AND polname = expected.policy_name;
    IF actual.polpermissive OR actual.polcmd::text <> expected.command
      OR actual.polroles IS DISTINCT FROM ARRAY['authenticated'::regrole::oid]
      OR md5(pg_get_expr(actual.polqual, actual.polrelid)) IS DISTINCT FROM expected.predicate_hash
    THEN RAISE EXCEPTION 'Reviewed Inbox SELECT policy drift: %', expected.policy_name; END IF;
  END LOOP;
END $preimage$;

-- An actor without review or admin authority anywhere cannot pass those two
-- action checks for a bound upload. For an ordinary uploader, check the same
-- document permission only on their own rows. Any-scope grants are necessary
-- conditions. The existing document check still decides scope and sensitivity.
ALTER POLICY f03_upload_subject_select ON public.dms_upload_sessions
USING (CASE
  WHEN origin_entity_type IS NOT NULL OR batch_id IS NOT NULL THEN true
  WHEN document_id IS NULL THEN id IN (SELECT erp_private.readable_unbound_upload_session_ids())
  WHEN (SELECT public.current_user_has_permission_any_scope('dms.documents.review_ai'))
    OR (SELECT public.current_user_has_permission_any_scope('dms.admin'))
  THEN erp_private.upload_row_allowed(uploaded_by, owning_company_id, owning_branch_id, document_id)
  WHEN uploaded_by = (SELECT public.current_user_profile_id())
    AND (SELECT public.current_user_has_permission_any_scope('dms.documents.upload'))
  THEN erp_private.document_permission(document_id, 'dms.documents.upload')
  ELSE false
END);

COMMIT;
