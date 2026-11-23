BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SET LOCAL search_path = pg_catalog;

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc p
    WHERE p.oid = to_regprocedure('public.f12_subject_photo(bigint,bigint,bigint,text,bigint)')
      AND md5(replace(p.prosrc, E'\r\n', E'\n')) = '8ce693a76db80ebed295c80220e4bbe4'
      AND NOT p.prosecdef AND p.provolatile = 's' AND p.prorettype = 'jsonb'::regtype
      AND p.proconfig = ARRAY['search_path=""']::text[]
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc p
    WHERE p.oid = to_regprocedure('public.hr_subject_photo_state(bigint,bigint)')
      AND md5(replace(p.prosrc, E'\r\n', E'\n')) = 'a725c3833d9284778193d4a23bb3aaca'
      AND NOT p.prosecdef AND p.provolatile = 's' AND p.prorettype = 'jsonb'::regtype
      AND p.proconfig = ARRAY['search_path=""']::text[]
  ) THEN
    RAISE EXCEPTION 'HR photo reader predecessor requires review';
  END IF;
END
$guard$;

CREATE OR REPLACE FUNCTION public.f12_subject_photo(
  p_employee bigint, p_dependent bigint DEFAULT NULL, p_document bigint DEFAULT NULL,
  p_search text DEFAULT '', p_after bigint DEFAULT 0
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $function$
DECLARE result jsonb;
BEGIN
  IF NOT erp_private.business_principal_is_active() OR NOT public.current_user_can_view_employee(p_employee)
    OR p_dependent IS NOT NULL AND (
      NOT erp_private.employee_permission(p_employee,'hr.compliance.view') OR NOT EXISTS (
        SELECT 1 FROM public.employee_dependents x
        WHERE x.id=p_dependent AND x.employee_id=p_employee AND x.deleted_at IS NULL
      )
    ) THEN
    RAISE EXCEPTION 'Current exact subject access required' USING ERRCODE='42501';
  END IF;
  IF p_search IS NULL OR length(p_search)>100 OR p_after IS NULL OR p_after<0 THEN
    RAISE EXCEPTION 'Invalid photo cursor' USING ERRCODE='22023';
  END IF;

  -- The existing d.id > p_after predicate makes this exact window empty.
  IF p_document IS NOT NULL AND p_document <= p_after THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY document_id),'[]') INTO result FROM (
    SELECT d.id document_id,d.document_no label,d.current_version_id version_id,min(f.id) file_id
    FROM public.dms_documents d JOIN public.employees e ON e.id=p_employee
    JOIN public.dms_document_versions v ON v.id=d.current_version_id AND v.document_id=d.id AND v.unlinked_at IS NULL
    JOIN public.dms_document_files f ON f.document_id=d.id AND f.version_id=v.id AND f.deleted_at IS NULL AND f.file_role='original'
    WHERE d.deleted_at IS NULL AND NOT d.is_archived AND d.id>p_after AND (p_document IS NULL OR d.id=p_document)
      AND d.owning_company_id=e.owner_company_id AND (d.owning_branch_id IS NULL OR d.owning_branch_id=e.branch_id)
      AND erp_private.document_permission(d.id,'dms.documents.view') AND erp_private.document_permission(d.id,'dms.documents.preview')
      AND EXISTS (
        SELECT 1 FROM public.dms_document_links l WHERE l.document_id=d.id AND l.deleted_at IS NULL
          AND CASE WHEN p_dependent IS NULL THEN l.entity_type='employee' AND l.entity_id=p_employee
            ELSE l.entity_type='employee_dependent' AND l.entity_id=p_dependent END
      )
      AND position(lower(p_search) IN lower(d.document_no))>0
    GROUP BY d.id,d.document_no,d.current_version_id
    HAVING count(*)=1 AND bool_and(f.mime_type IN ('image/jpeg','image/png','image/webp')
      AND f.integrity_status='verified' AND f.file_size_bytes>0 AND f.sha256_hash~'^[0-9a-f]{64}$')
    ORDER BY d.id LIMIT 26
  ) x;
  RETURN result;
END
$function$;

CREATE OR REPLACE FUNCTION public.hr_subject_photo_state(p_employee bigint, p_dependent bigint DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $function$
DECLARE doc bigint; frame jsonb; matches jsonb; subject_found boolean;
BEGIN
  IF p_dependent IS NULL THEN
    SELECT photo_dms_document_id,photo_framing INTO doc,frame
    FROM public.employees WHERE id=p_employee AND deleted_at IS NULL;
  ELSE
    SELECT photo_dms_document_id,photo_framing INTO doc,frame
    FROM public.employee_dependents WHERE id=p_dependent AND employee_id=p_employee AND deleted_at IS NULL;
  END IF;
  subject_found := FOUND;

  -- The pointer is read under the caller's RLS. Always use the picker to check
  -- current exact subject authority before returning anything. For a missing
  -- pointer the impossible exact window performs that check without DMS reads.
  matches := public.f12_subject_photo(p_employee,p_dependent,coalesce(doc,0));
  IF NOT subject_found THEN
    RAISE EXCEPTION 'Person unavailable' USING ERRCODE='42501';
  END IF;
  RETURN jsonb_build_object('documentId',doc,'framing',frame,'photo',matches->0,
    'canDownload',doc IS NOT NULL AND jsonb_array_length(matches)=1 AND
      (erp_private.document_permission(doc,'dms.documents.download') OR erp_private.document_permission(doc,'dms.admin')));
END
$function$;

COMMIT;
