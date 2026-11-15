-- Use the existing document authority with a single ID, then project only
-- that document's files. Keep the original set reader for other callers.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE FUNCTION erp_private.read_document_files_for_document(p_document_id bigint)
RETURNS SETOF public.dms_document_files
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $function$
  WITH authorized_document AS MATERIALIZED (
    SELECT d.id, d.owning_company_id, d.owning_branch_id
    FROM erp_private.read_documents_filtered(ARRAY[p_document_id], NULL) d
    WHERE auth.uid() IS NOT NULL AND p_document_id > 0
  ), preview AS MATERIALIZED (
    SELECT d.id, (
      public.current_user_is_global_admin() OR EXISTS (
        SELECT 1
        FROM public.user_roles ur
        JOIN public.roles r ON r.id = ur.role_id
        JOIN public.role_permissions rp ON rp.role_id = r.id
        JOIN public.permissions p ON p.id = rp.permission_id
        WHERE ur.user_profile_id = public.current_user_profile_id()
          AND ur.is_active AND r.is_active AND p.is_active
          AND p.permission_code = 'dms.documents.preview'
          AND ((ur.owner_company_id IS NULL AND ur.branch_id IS NULL)
            OR (ur.owner_company_id = d.owning_company_id
              AND (ur.branch_id IS NULL OR ur.branch_id = d.owning_branch_id)))
      )
    ) AS allowed
    FROM authorized_document d
  )
  SELECT projected.*
  FROM preview
  JOIN public.dms_document_files f ON f.document_id = preview.id
  CROSS JOIN LATERAL jsonb_populate_record(NULL::public.dms_document_files,
    CASE WHEN preview.allowed THEN to_jsonb(f)
      ELSE to_jsonb(f) - ARRAY['ocr_text', 'ocr_error_message', 'integrity_error_message']
    END
  ) AS projected
  WHERE f.document_id = p_document_id AND f.deleted_at IS NULL;
$function$;

-- The table row type preserves the existing PostgREST version and creator embeds.
CREATE FUNCTION public.f03_read_document_files_for_document(p_document_id bigint)
RETURNS SETOF public.dms_document_files
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $function$
  SELECT * FROM erp_private.read_document_files_for_document(p_document_id);
$function$;

REVOKE ALL ON FUNCTION erp_private.read_document_files_for_document(bigint),
  public.f03_read_document_files_for_document(bigint) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION erp_private.read_document_files_for_document(bigint),
  public.f03_read_document_files_for_document(bigint) TO authenticated;

COMMIT;
