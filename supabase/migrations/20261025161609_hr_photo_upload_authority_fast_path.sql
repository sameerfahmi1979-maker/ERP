-- Equivalent upload authority without repeated historical-document checks for
-- an active global administrator. No policy, write gate, role or data changes.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
DO $preimage$
DECLARE expected record;
BEGIN
  IF current_user <> 'postgres'
    OR has_schema_privilege('authenticated','erp_private','CREATE')
    OR has_schema_privilege('anon','erp_private','CREATE') THEN
    RAISE EXCEPTION 'Upload authority owner/schema prerequisite changed';
  END IF;
  FOR expected IN SELECT * FROM (VALUES
    ('erp_private.readable_upload_session_ids()','75e8412b96d83adbde8e856dd6e1d6a1'),
    ('erp_private.upload_row_allowed(bigint,bigint,bigint,bigint)','5effa05af90b2e11331c41762bb12ca9'),
    ('erp_private.document_permission(bigint,text)','1c6c7a6c40749c9bea0e28cc99e03595'),
    ('erp_private.permission_in_scope(text,bigint,bigint)','ce520fb29b4a68564fcbf9285a4a741e'),
    ('public.current_user_is_global_admin()','5375091be37487c37872452fa3837466')
  ) v(signature,body_hash) LOOP
    IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure(expected.signature)
      AND md5(p.prosrc)=expected.body_hash AND p.prosecdef AND p.provolatile='s'
      AND p.proowner='postgres'::regrole) THEN
      RAISE EXCEPTION 'Upload authority prerequisite changed: %',expected.signature;
    END IF;
  END LOOP;
  IF (SELECT proacl::text FROM pg_proc WHERE oid='erp_private.readable_upload_session_ids()'::regprocedure)
    IS DISTINCT FROM '{postgres=X/postgres,authenticated=X/postgres}'
    OR NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='public.dms_upload_sessions'::regclass
      AND relrowsecurity AND relowner='postgres'::regrole)
    OR NOT EXISTS(SELECT 1 FROM pg_policy WHERE polrelid='public.dms_upload_sessions'::regclass
      AND polname='f03_upload_subject_select' AND NOT polpermissive AND polcmd='r'
      AND polroles=ARRAY['authenticated'::regrole::oid]) THEN
    RAISE EXCEPTION 'Upload authority ACL/RLS prerequisite changed';
  END IF;
END;
$preimage$;
CREATE OR REPLACE FUNCTION erp_private.readable_upload_session_ids()
RETURNS SETOF bigint
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT coalesce(erp_private.business_principal_is_active(),false) THEN
    RETURN;
  END IF;
  IF public.current_user_is_global_admin() THEN
    -- Exact reduction of upload_row_allowed for this principal:
    -- permission_in_scope accepts unbound uploads; document_permission accepts
    -- bound uploads only after finding an existing, non-deleted document.
    -- The separate F07 subject SELECT policy still applies to the caller.
    RETURN QUERY SELECT s.id FROM public.dms_upload_sessions s
      WHERE s.document_id IS NULL OR EXISTS (
        SELECT 1 FROM public.dms_documents d WHERE d.id=s.document_id AND d.deleted_at IS NULL
      );
    RETURN;
  END IF;
  -- Scoped users retain the complete nullable tuple and original point gate,
  -- including employee, dependent, clinical and reviewer controls.
  RETURN QUERY
  WITH scope_keys AS MATERIALIZED (
    SELECT DISTINCT s.uploaded_by,s.owning_company_id,s.owning_branch_id,s.document_id
    FROM public.dms_upload_sessions s
  ), allowed_keys AS MATERIALIZED (
    SELECT k.* FROM scope_keys k
    WHERE erp_private.upload_row_allowed(k.uploaded_by,k.owning_company_id,k.owning_branch_id,k.document_id)
  )
  SELECT s.id FROM public.dms_upload_sessions s JOIN allowed_keys k
    ON s.uploaded_by IS NOT DISTINCT FROM k.uploaded_by
    AND s.owning_company_id IS NOT DISTINCT FROM k.owning_company_id
    AND s.owning_branch_id IS NOT DISTINCT FROM k.owning_branch_id
    AND s.document_id IS NOT DISTINCT FROM k.document_id;
END;
$function$;
COMMENT ON FUNCTION erp_private.readable_upload_session_ids() IS
  'Statement-local upload authority: equivalent active-global-admin set; unchanged scoped point authority. No persistent cache or file metadata.';
COMMIT;
