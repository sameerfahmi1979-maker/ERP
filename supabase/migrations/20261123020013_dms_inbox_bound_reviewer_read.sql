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

  -- All three document actions share the earlier principal, classification and
  -- subject gates. Assert the reviewed action lookup and legacy admin rules.
  FOR expected IN SELECT * FROM (VALUES
    ('erp_private.upload_row_allowed(bigint,bigint,bigint,bigint)', '5effa05af90b2e11331c41762bb12ca9'),
    ('erp_private.document_permission(bigint,text)', '1234c9bc566ace5131d264798e27728b'),
    ('public.current_user_is_global_admin()', '5375091be37487c37872452fa3837466'),
    ('public.current_user_has_permission_any_scope(text)', '4e7bd1d214481464f237f8e57cdf09c3'),
    ('public.current_user_profile_id()', '3ae97eed6dcb16e61291a1b8a5998b21')
  ) AS v(signature, body_hash)
  LOOP
    SELECT * INTO STRICT actual FROM pg_proc WHERE oid = to_regprocedure(expected.signature);
    IF actual.proowner <> 'postgres'::regrole OR NOT actual.prosecdef OR actual.provolatile <> 's'
      OR actual.proretset OR md5(replace(actual.prosrc, E'\r\n', E'\n')) IS DISTINCT FROM expected.body_hash
      OR NOT has_function_privilege('authenticated', actual.oid, 'EXECUTE')
    THEN RAISE EXCEPTION 'Reviewed bound Inbox authority helper drift: %', expected.signature; END IF;
  END LOOP;

  FOR expected IN SELECT * FROM (VALUES
    ('f03_principal', '*', '7f2345bb3c7af80f4c0290b3ef9c491c'),
    ('f03_upload_subject_select', 'r', 'cb54e625a6117bbfde1ca1a77801573b'),
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

-- Choose one scoped action before the expensive exact document checks. The
-- source, classification and subject gates in document_permission are common
-- to each action admitted here. It still makes the complete read decision.
CREATE FUNCTION erp_private.inbox_generic_bound_read_allowed(p_session_id bigint)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  WITH bound AS MATERIALIZED (
    SELECT d.id, d.owning_company_id, d.owning_branch_id, s.uploaded_by
    FROM public.dms_upload_sessions s
    JOIN public.dms_documents d ON d.id = s.document_id
    WHERE s.id = p_session_id AND s.deleted_at IS NULL AND d.deleted_at IS NULL
      AND s.origin_entity_type IS NULL AND s.batch_id IS NULL
  )
  SELECT COALESCE((
    SELECT CASE
      WHEN (SELECT public.current_user_is_global_admin())
        THEN erp_private.document_permission(b.id, 'dms.documents.review_ai')
      ELSE COALESCE((
        SELECT erp_private.document_permission(b.id, action.permission_code)
        FROM (
          SELECT p.permission_code
          FROM public.user_profiles up
          JOIN public.user_roles ur ON ur.user_profile_id = up.id
          JOIN public.roles r ON r.id = ur.role_id
          JOIN public.role_permissions rp ON rp.role_id = r.id
          JOIN public.permissions p ON p.id = rp.permission_id
          WHERE up.auth_user_id = (SELECT auth.uid())
            AND ur.is_active AND r.is_active AND p.is_active
            AND ((ur.owner_company_id IS NULL AND ur.branch_id IS NULL)
              OR (ur.owner_company_id = b.owning_company_id
                AND (ur.branch_id IS NULL OR ur.branch_id = b.owning_branch_id)))
            AND (p.permission_code IN ('dms.documents.review_ai', 'dms.admin')
              OR (p.permission_code = 'dms.documents.upload' AND up.id = b.uploaded_by))
          LIMIT 1
        ) action
      ),false)
    END
    FROM bound b
  ),false);
$$;

REVOKE ALL ON FUNCTION erp_private.inbox_generic_bound_read_allowed(bigint) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION erp_private.inbox_generic_bound_read_allowed(bigint) TO authenticated;

ALTER POLICY f03_upload_subject_select ON public.dms_upload_sessions
USING (CASE
  WHEN origin_entity_type IS NOT NULL OR batch_id IS NOT NULL THEN true
  WHEN document_id IS NULL THEN id IN (SELECT erp_private.readable_unbound_upload_session_ids())
  WHEN (SELECT public.current_user_has_permission_any_scope('dms.documents.review_ai'))
    OR (SELECT public.current_user_has_permission_any_scope('dms.admin'))
  THEN erp_private.inbox_generic_bound_read_allowed(id)
  WHEN uploaded_by = (SELECT public.current_user_profile_id())
    AND (SELECT public.current_user_has_permission_any_scope('dms.documents.upload'))
  THEN erp_private.document_permission(document_id, 'dms.documents.upload')
  ELSE false
END);

COMMIT;
