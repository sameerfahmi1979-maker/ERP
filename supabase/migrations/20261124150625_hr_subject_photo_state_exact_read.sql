BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

DO $$
BEGIN
  IF (SELECT md5(prosrc) FROM pg_catalog.pg_proc
      WHERE oid = 'public.hr_subject_photo_state(bigint,bigint)'::regprocedure)
      IS DISTINCT FROM 'a725c3833d9284778193d4a23bb3aaca'
    OR (SELECT md5(prosrc) FROM pg_catalog.pg_proc
        WHERE oid = 'public.f12_subject_photo(bigint,bigint,bigint,text,bigint)'::regprocedure)
      IS DISTINCT FROM '8ce693a76db80ebed295c80220e4bbe4' THEN
    RAISE EXCEPTION 'Unexpected HR photo reader definitions';
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.hr_subject_photo_state(p_employee bigint, p_dependent bigint DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  doc bigint;
  frame jsonb;
  result jsonb;
BEGIN
  -- Enforce the chooser's exact subject gate without enumerating photo options.
  IF NOT erp_private.business_principal_is_active()
    OR NOT public.current_user_can_view_employee(p_employee)
    OR (p_dependent IS NOT NULL AND (
      NOT erp_private.employee_permission(p_employee, 'hr.compliance.view')
      OR NOT EXISTS (
        SELECT 1 FROM public.employee_dependents x
        WHERE x.id = p_dependent AND x.employee_id = p_employee AND x.deleted_at IS NULL
      )
    )) THEN
    RAISE EXCEPTION 'Current exact subject access required' USING ERRCODE = '42501';
  END IF;

  IF p_dependent IS NULL THEN
    SELECT photo_dms_document_id, photo_framing INTO doc, frame
    FROM public.employees WHERE id = p_employee AND deleted_at IS NULL;
  ELSE
    SELECT photo_dms_document_id, photo_framing INTO doc, frame
    FROM public.employee_dependents
    WHERE id = p_dependent AND employee_id = p_employee AND deleted_at IS NULL;
  END IF;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Person unavailable' USING ERRCODE = '42501';
  END IF;

  result := CASE WHEN doc IS NULL THEN '[]'::jsonb
    ELSE public.f12_subject_photo(p_employee, p_dependent, doc) END;
  RETURN jsonb_build_object(
    'documentId', doc,
    'framing', frame,
    'photo', result->0,
    'canDownload', doc IS NOT NULL AND jsonb_array_length(result) = 1 AND (
      erp_private.document_permission(doc, 'dms.documents.download')
      OR erp_private.document_permission(doc, 'dms.admin')
    )
  );
END
$$;

COMMIT;
