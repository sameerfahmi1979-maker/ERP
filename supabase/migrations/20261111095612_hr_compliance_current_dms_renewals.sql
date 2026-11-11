BEGIN;
SET LOCAL lock_timeout = '5s';

-- A completed, traceable DMS renewal is the current document for display.
-- No HR data is written and no evidence, clinical or readiness decision is made.
CREATE FUNCTION public.hr_compliance_current_dms_renewals(p_employee bigint)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  WITH RECURSIVE scope AS MATERIALIZED (
    SELECT e.id, e.owner_company_id, e.branch_id,
      erp_private.f12_review_visible('access-card', e.id) AS compliance,
      erp_private.f12_review_visible('medical-record', e.id) AS medical
    FROM public.employees e
    WHERE e.id = p_employee AND e.deleted_at IS NULL AND auth.uid() IS NOT NULL
  ), sources(kind, source_id, document_id, subject_type, subject_id, category) AS MATERIALIZED (
    SELECT 'identity-document', c.id, c.dms_document_id, 'employee', s.id, 'identity-document'
    FROM scope s JOIN public.employee_identity_documents c ON c.employee_id = s.id
    WHERE s.compliance AND c.deleted_at IS NULL AND c.dms_document_id IS NOT NULL
    UNION ALL
    SELECT 'access-card', c.id, c.dms_document_id, 'employee', s.id, 'access-card'
    FROM scope s JOIN public.employee_access_cards c ON c.employee_id = s.id
    WHERE s.compliance AND c.deleted_at IS NULL AND c.dms_document_id IS NOT NULL
    UNION ALL
    SELECT 'training-certificate', c.id, c.dms_document_id, 'employee', s.id, 'training-certificate'
    FROM scope s JOIN public.employee_training_certificates c ON c.employee_id = s.id
    WHERE s.compliance AND c.deleted_at IS NULL AND c.dms_document_id IS NOT NULL
    UNION ALL
    SELECT 'medical-insurance', c.id, c.dms_document_id, 'employee', s.id, 'medical-insurance'
    FROM scope s JOIN public.employee_medical_insurances c ON c.employee_id = s.id
    WHERE s.medical AND c.deleted_at IS NULL AND c.dms_document_id IS NOT NULL
    UNION ALL
    SELECT 'medical-record', c.id, c.dms_document_id, 'employee', s.id, 'medical-record'
    FROM scope s JOIN public.employee_medical_records c ON c.employee_id = s.id
    WHERE s.medical AND c.deleted_at IS NULL AND c.dms_document_id IS NOT NULL
    UNION ALL
    SELECT DISTINCT 'dependent', c.id, o.id, 'employee_dependent', c.id, typ.category
    FROM scope s JOIN public.employee_dependents c ON c.employee_id = s.id
    JOIN public.dms_document_links l ON l.entity_type = 'employee_dependent' AND l.entity_id = c.id AND l.deleted_at IS NULL
    JOIN public.dms_documents o ON o.id = l.document_id AND o.status = 'superseded' AND o.is_archived AND o.deleted_at IS NULL
    JOIN public.dms_document_types t ON t.id = o.document_type_id
    CROSS JOIN LATERAL (SELECT erp_private.hr_compliance_renewal_dependent_category(t.type_code) AS category) typ
    WHERE s.compliance AND c.deleted_at IS NULL AND c.is_active
      AND typ.category <> 'dependent' AND (typ.category <> 'dependent-insurance' OR s.medical)
      AND (c.dms_document_id = o.id OR o.expiry_date IS NOT NULL)
      AND o.expiry_date IS NOT DISTINCT FROM CASE typ.category
        WHEN 'dependent-passport' THEN c.passport_expiry
        WHEN 'dependent-eid' THEN c.emirates_id_expiry
        WHEN 'dependent-visa' THEN c.residence_visa_expiry
        WHEN 'dependent-insurance' THEN CASE WHEN s.medical THEN
          (public.f11_dependent_medical(s.id, c.id, c.workspace_revision)->>'medical_insurance_expiry')::date END
      END
  ), chain AS (
    SELECT s.kind, s.source_id, s.subject_type, s.subject_id, s.category, o.document_no AS original_no,
      o.id, o.document_type_id, o.owning_company_id, o.owning_branch_id, o.document_no, o.title, o.expiry_date,
      o.current_version_id, o.status, o.is_archived, o.superseded_by_document_id, ARRAY[o.id] AS path
    FROM sources s CROSS JOIN scope e
    JOIN public.dms_documents o ON o.id = s.document_id AND o.deleted_at IS NULL AND o.status = 'superseded' AND o.is_archived
    WHERE o.owning_company_id = e.owner_company_id AND (o.owning_branch_id IS NULL OR o.owning_branch_id = e.branch_id)
      AND erp_private.document_permission(o.id, 'dms.documents.view')
      AND EXISTS (SELECT 1 FROM public.dms_document_links l WHERE l.document_id = o.id
        AND l.entity_type = s.subject_type AND l.entity_id = s.subject_id AND l.deleted_at IS NULL)
    UNION ALL
    SELECT c.kind, c.source_id, c.subject_type, c.subject_id, c.category, c.original_no,
      n.id, n.document_type_id, n.owning_company_id, n.owning_branch_id, n.document_no, n.title, n.expiry_date,
      n.current_version_id, n.status, n.is_archived, n.superseded_by_document_id, c.path || n.id
    FROM chain c
    JOIN public.dms_documents n ON n.id = c.superseded_by_document_id AND n.deleted_at IS NULL
      AND n.document_type_id = c.document_type_id AND n.owning_company_id = c.owning_company_id
      AND n.owning_branch_id IS NOT DISTINCT FROM c.owning_branch_id
    WHERE c.status = 'superseded' AND c.is_archived AND NOT n.id = ANY(c.path) AND cardinality(c.path) < 100
      AND erp_private.document_permission(n.id, 'dms.documents.view')
      AND EXISTS (SELECT 1 FROM public.dms_document_links l WHERE l.document_id = n.id
        AND l.entity_type = c.subject_type AND l.entity_id = c.subject_id AND l.deleted_at IS NULL)
      AND EXISTS (SELECT 1 FROM public.dms_renewal_requests r WHERE r.document_id = c.id AND r.replacement_document_id = n.id
        AND r.status = 'renewed' AND r.completed_at IS NOT NULL AND r.deleted_at IS NULL
        AND r.new_expiry_date IS NOT DISTINCT FROM n.expiry_date
        AND (r.replacement_version_id IS NULL OR r.replacement_version_id = n.current_version_id))
  ), eligible AS (
    SELECT c.*, count(*) OVER (PARTITION BY c.kind, c.source_id, c.category) AS source_count,
      count(*) OVER (PARTITION BY c.kind, c.id) AS replacement_count
    FROM chain c
    WHERE cardinality(c.path) > 1 AND c.status IN ('active', 'approved') AND NOT c.is_archived
      AND erp_private.document_permission(c.id, 'dms.documents.preview')
      AND EXISTS (SELECT 1 FROM public.dms_document_versions v
        JOIN public.dms_document_files f ON f.version_id = v.id AND f.document_id = v.document_id
        WHERE v.id = c.current_version_id AND v.document_id = c.id AND v.unlinked_at IS NULL
          AND f.deleted_at IS NULL AND f.file_role = 'original' AND f.file_size_bytes > 0)
      AND NOT EXISTS (SELECT 1 FROM sources s WHERE s.kind = c.kind AND s.source_id <> c.source_id AND s.document_id = c.id)
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'kind', kind, 'category', category, 'sourceId', source_id, 'originalNo', original_no,
    'replacementId', id, 'replacementNo', document_no, 'replacementTitle', title, 'replacementExpiry', expiry_date
  ) ORDER BY kind, source_id, category), '[]'::jsonb)
  FROM eligible WHERE source_count = 1 AND replacement_count = 1;
$$;

REVOKE ALL ON FUNCTION public.hr_compliance_current_dms_renewals(bigint) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.hr_compliance_current_dms_renewals(bigint) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
