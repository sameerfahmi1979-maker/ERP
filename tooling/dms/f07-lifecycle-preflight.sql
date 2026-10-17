-- Read-only, post-schema release preflight. Never repairs historical provenance,
-- rewrites approved content, deletes Storage objects or replays AI backlogs.
-- Run only against an explicitly authorized ERP target with all F07 migrations.
BEGIN READ ONLY;
SET LOCAL statement_timeout='30s'; SET LOCAL lock_timeout='3s';
WITH issues AS (
 SELECT 'archive_provenance_missing'::text AS issue,d.id AS record_id
 FROM public.dms_documents d LEFT JOIN erp_private.f07_archive_provenance p ON p.document_id=d.id
 WHERE d.deleted_at IS NULL AND (d.is_archived OR d.status='archived') AND
  (p.document_id IS NULL OR p.restored_at IS NOT NULL OR p.version_id IS DISTINCT FROM d.current_version_id OR p.previous_approval IS DISTINCT FROM d.approval_status)
 UNION ALL
 SELECT 'current_version_inconsistent',d.id FROM public.dms_documents d
 WHERE d.deleted_at IS NULL AND (
  (SELECT count(*) FROM public.dms_document_versions v WHERE v.document_id=d.id AND v.is_current AND v.unlinked_at IS NULL)<>CASE WHEN d.current_version_id IS NULL THEN 0 ELSE 1 END OR
  (d.current_version_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.dms_document_versions v WHERE v.id=d.current_version_id AND v.document_id=d.id AND v.is_current AND v.unlinked_at IS NULL)))
 UNION ALL
 SELECT 'review_submission_unproven',a.id FROM public.dms_document_approvals a
 WHERE a.is_current AND a.action='submitted' AND (a.reviewed_fingerprint IS NULL OR a.workflow_fingerprint IS NULL)
 UNION ALL
 SELECT 'renewal_replacement_inconsistent',r.id FROM public.dms_renewal_requests r
 JOIN public.dms_documents d ON d.id=r.document_id LEFT JOIN public.dms_documents replacement ON replacement.id=r.replacement_document_id
 WHERE r.deleted_at IS NULL AND r.status='renewed' AND (replacement.id IS NULL OR d.superseded_by_document_id IS DISTINCT FROM replacement.id OR
  ROW(d.owning_company_id,d.owning_branch_id,d.document_type_id) IS DISTINCT FROM ROW(replacement.owning_company_id,replacement.owning_branch_id,replacement.document_type_id))
 UNION ALL
 SELECT 'temporary_upload_not_byte_verified',s.id FROM public.dms_upload_sessions s
 LEFT JOIN erp_private.f07_verified_temp_uploads p ON p.upload_session_id=s.id
 WHERE s.deleted_at IS NULL AND s.status='uploaded' AND p.upload_session_id IS NULL
)
SELECT issue,count(*) AS affected_count,(array_agg(record_id ORDER BY record_id))[1:100] AS first_100_record_ids
FROM issues GROUP BY issue ORDER BY issue;
ROLLBACK;
