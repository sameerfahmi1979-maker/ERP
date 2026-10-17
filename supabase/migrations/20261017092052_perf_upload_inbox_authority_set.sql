-- Evaluate the unchanged F03 upload authority once per distinct scope tuple,
-- rather than once per member of a counted Inbox page. No authorization cache
-- survives a statement. INSERT/UPDATE/DELETE keep the original point gate.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SET LOCAL search_path = public, pg_catalog;

DO $preimage$
BEGIN
  IF current_user <> 'postgres'
    OR to_regprocedure('erp_private.readable_upload_session_ids()') IS NOT NULL
    OR NOT EXISTS (SELECT 1 FROM pg_class WHERE oid='public.dms_upload_sessions'::regclass
      AND relrowsecurity AND relowner='postgres'::regrole)
    OR (SELECT md5(prosrc) FROM pg_proc
      WHERE oid='erp_private.upload_row_allowed(bigint,bigint,bigint,bigint)'::regprocedure)
      IS DISTINCT FROM '5effa05af90b2e11331c41762bb12ca9'
    OR NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid='public.dms_upload_sessions'::regclass
      AND polname='f03_upload_subject' AND polcmd='*' AND NOT polpermissive
      AND polroles=ARRAY['authenticated'::regrole::oid]
      AND pg_get_expr(polqual,polrelid)='erp_private.upload_row_allowed(uploaded_by, owning_company_id, owning_branch_id, document_id)'
      AND pg_get_expr(polwithcheck,polrelid)=pg_get_expr(polqual,polrelid))
    OR NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid='public.dms_upload_sessions'::regclass
      AND polname='f03_principal' AND NOT polpermissive AND polcmd='*')
    OR has_schema_privilege('authenticated','erp_private','CREATE')
    OR has_schema_privilege('anon','erp_private','CREATE') THEN
    RAISE EXCEPTION 'Inbox authority preimage changed; reconcile before applying';
  END IF;
END;
$preimage$;

CREATE FUNCTION erp_private.readable_upload_session_ids()
RETURNS SETOF bigint
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $function$
  WITH scope_keys AS MATERIALIZED (
    SELECT DISTINCT s.uploaded_by,s.owning_company_id,s.owning_branch_id,s.document_id
    FROM public.dms_upload_sessions s
    WHERE (SELECT auth.uid()) IS NOT NULL
      AND (SELECT erp_private.business_principal_is_active())
  ), allowed_keys AS MATERIALIZED (
    SELECT k.* FROM scope_keys k
    WHERE erp_private.upload_row_allowed(k.uploaded_by,k.owning_company_id,k.owning_branch_id,k.document_id)
  )
  SELECT s.id FROM public.dms_upload_sessions s JOIN allowed_keys k
    ON s.uploaded_by IS NOT DISTINCT FROM k.uploaded_by
    AND s.owning_company_id IS NOT DISTINCT FROM k.owning_company_id
    AND s.owning_branch_id IS NOT DISTINCT FROM k.owning_branch_id
    AND s.document_id IS NOT DISTINCT FROM k.document_id;
$function$;
ALTER FUNCTION erp_private.readable_upload_session_ids() OWNER TO postgres;
REVOKE ALL ON FUNCTION erp_private.readable_upload_session_ids() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION erp_private.readable_upload_session_ids() TO authenticated;
COMMENT ON FUNCTION erp_private.readable_upload_session_ids() IS
  'Statement-local upload IDs using unchanged F03 point authority per full nullable scope tuple; no persistent cache or file metadata.';

DROP POLICY f03_upload_subject ON public.dms_upload_sessions;
CREATE POLICY f03_upload_subject_select ON public.dms_upload_sessions
AS RESTRICTIVE FOR SELECT TO authenticated
USING (id IN (SELECT erp_private.readable_upload_session_ids()));
CREATE POLICY f03_upload_subject_insert ON public.dms_upload_sessions
AS RESTRICTIVE FOR INSERT TO authenticated
WITH CHECK (erp_private.upload_row_allowed(uploaded_by,owning_company_id,owning_branch_id,document_id));
CREATE POLICY f03_upload_subject_update ON public.dms_upload_sessions
AS RESTRICTIVE FOR UPDATE TO authenticated
USING (erp_private.upload_row_allowed(uploaded_by,owning_company_id,owning_branch_id,document_id))
WITH CHECK (erp_private.upload_row_allowed(uploaded_by,owning_company_id,owning_branch_id,document_id));
CREATE POLICY f03_upload_subject_delete ON public.dms_upload_sessions
AS RESTRICTIVE FOR DELETE TO authenticated
USING (erp_private.upload_row_allowed(uploaded_by,owning_company_id,owning_branch_id,document_id));
COMMIT;
