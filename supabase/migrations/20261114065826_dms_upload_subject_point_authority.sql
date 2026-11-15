BEGIN;

-- Unbound rows share scope tuples. Evaluate them once per statement so a broad
-- Inbox read does not repeat the same checks for every retained reservation.
CREATE FUNCTION erp_private.readable_unbound_upload_session_ids()
RETURNS SETOF bigint
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  WITH scope_keys AS MATERIALIZED (
    SELECT DISTINCT uploaded_by, owning_company_id, owning_branch_id
    FROM public.dms_upload_sessions
    WHERE document_id IS NULL
      AND (SELECT auth.uid()) IS NOT NULL
      AND (SELECT erp_private.business_principal_is_active())
  ), allowed_keys AS MATERIALIZED (
    SELECT * FROM scope_keys
    WHERE erp_private.upload_row_allowed(uploaded_by, owning_company_id, owning_branch_id, NULL)
  )
  SELECT s.id FROM public.dms_upload_sessions s
  JOIN allowed_keys k
    ON s.uploaded_by IS NOT DISTINCT FROM k.uploaded_by
    AND s.owning_company_id IS NOT DISTINCT FROM k.owning_company_id
    AND s.owning_branch_id IS NOT DISTINCT FROM k.owning_branch_id
  WHERE s.document_id IS NULL;
$$;

REVOKE ALL ON FUNCTION erp_private.readable_unbound_upload_session_ids() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION erp_private.readable_unbound_upload_session_ids() TO authenticated;

-- F07 already calls the complete F03 row authority for contextual/batch
-- sessions before checking their subject. Evaluate that check once.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polrelid = 'public.dms_upload_sessions'::regclass
      AND polname = 'f07_original_upload_subject_read'
      AND NOT polpermissive AND polcmd = 'r' AND polroles = ARRAY['authenticated'::regrole::oid]
      AND pg_get_expr(polqual, polrelid) LIKE '%ELSE erp_private.f07_upload_subject_allowed(id)%'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE oid = 'erp_private.f07_upload_subject_allowed(bigint)'::regprocedure
      AND prosrc LIKE '%NOT erp_private.upload_session_allowed(p_session) THEN RETURN false%'
  ) THEN
    RAISE EXCEPTION 'Unexpected upload subject policy';
  END IF;
END $$;

ALTER POLICY f03_upload_subject_select ON public.dms_upload_sessions
  USING (CASE
    WHEN origin_entity_type IS NOT NULL OR batch_id IS NOT NULL THEN true
    WHEN document_id IS NULL THEN id IN (SELECT erp_private.readable_unbound_upload_session_ids())
    ELSE erp_private.upload_row_allowed(uploaded_by, owning_company_id, owning_branch_id, document_id) END);

COMMIT;
