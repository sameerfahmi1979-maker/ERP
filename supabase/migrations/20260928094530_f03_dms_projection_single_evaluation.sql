BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- Keep F03 row/content boundaries, signatures, owners and grants. A composite
-- expanded in SELECT repeats per column; a FROM function evaluates it once.
-- Resolve statement-stable principal/preview grants once. The existing
-- document_permission predicate still admits scoped rows; preview adds the
-- same assignment-local permission check. No cross-company role borrowing.
-- https://www.postgresql.org/docs/current/rowtypes.html#ROWTYPES-USAGE

CREATE OR REPLACE FUNCTION erp_private.read_documents()
RETURNS SETOF public.dms_documents LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 WITH principal AS MATERIALIZED (
   SELECT auth.uid() uid, erp_private.business_principal_is_active() active,
     public.current_user_is_global_admin() global_admin, public.current_user_profile_id() profile_id
 ), preview_scopes AS MATERIALIZED (
   SELECT DISTINCT ur.owner_company_id, ur.branch_id
   FROM principal actor JOIN public.user_roles ur ON ur.user_profile_id=actor.profile_id
   JOIN public.roles r ON r.id=ur.role_id JOIN public.role_permissions rp ON rp.role_id=r.id
   JOIN public.permissions p ON p.id=rp.permission_id
   WHERE actor.uid IS NOT NULL AND actor.active AND ur.is_active AND r.is_active AND p.is_active
     AND p.permission_code='dms.documents.preview'
 )
 SELECT projected.*
 FROM principal actor CROSS JOIN public.dms_documents d
 CROSS JOIN LATERAL jsonb_populate_record(NULL::public.dms_documents,
   CASE WHEN actor.global_admin OR EXISTS (SELECT 1 FROM preview_scopes s
     WHERE (s.owner_company_id IS NULL AND s.branch_id IS NULL)
       OR (s.owner_company_id=d.owning_company_id AND (s.branch_id IS NULL OR s.branch_id=d.owning_branch_id)))
   THEN to_jsonb(d) ELSE (to_jsonb(d)-ARRAY['ai_summary','content_tsv','summary_embedding','ai_summary_error','summary_embedding_error','ai_warnings_json','ai_risk_reasons_json']) || jsonb_build_object('content_tsv',to_tsvector('simple',concat_ws(' ',d.document_no,d.title,d.description,d.legacy_document_code))) END) AS projected
 WHERE actor.uid IS NOT NULL AND actor.active AND d.deleted_at IS NULL
   AND (actor.global_admin OR erp_private.document_permission(d.id,'dms.documents.view'));
$$;

CREATE OR REPLACE FUNCTION erp_private.read_document_files()
RETURNS SETOF public.dms_document_files LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 WITH principal AS MATERIALIZED (
   SELECT auth.uid() uid, erp_private.business_principal_is_active() active,
     public.current_user_is_global_admin() global_admin, public.current_user_profile_id() profile_id
 ), preview_scopes AS MATERIALIZED (
   SELECT DISTINCT ur.owner_company_id, ur.branch_id
   FROM principal actor JOIN public.user_roles ur ON ur.user_profile_id=actor.profile_id
   JOIN public.roles r ON r.id=ur.role_id JOIN public.role_permissions rp ON rp.role_id=r.id
   JOIN public.permissions p ON p.id=rp.permission_id
   WHERE actor.uid IS NOT NULL AND actor.active AND ur.is_active AND r.is_active AND p.is_active
     AND p.permission_code='dms.documents.preview'
 )
 SELECT projected.*
 FROM principal actor CROSS JOIN public.dms_document_files f JOIN public.dms_documents d ON d.id=f.document_id AND d.deleted_at IS NULL
 CROSS JOIN LATERAL jsonb_populate_record(NULL::public.dms_document_files,
   CASE WHEN actor.global_admin OR EXISTS (SELECT 1 FROM preview_scopes s
     WHERE (s.owner_company_id IS NULL AND s.branch_id IS NULL)
       OR (s.owner_company_id=d.owning_company_id AND (s.branch_id IS NULL OR s.branch_id=d.owning_branch_id)))
   THEN to_jsonb(f) ELSE to_jsonb(f)-ARRAY['ocr_text','ocr_error_message','integrity_error_message'] END) AS projected
 WHERE actor.uid IS NOT NULL AND actor.active AND f.deleted_at IS NULL
   AND (actor.global_admin OR erp_private.document_permission(f.document_id,'dms.documents.view'));
$$;

CREATE OR REPLACE FUNCTION erp_private.read_document_files_for_admin()
RETURNS SETOF public.dms_document_files LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 WITH principal AS MATERIALIZED (
   SELECT auth.uid() uid, erp_private.business_principal_is_active() active,
     public.current_user_is_global_admin() global_admin, public.current_user_profile_id() profile_id
 ), preview_scopes AS MATERIALIZED (
   SELECT DISTINCT ur.owner_company_id, ur.branch_id
   FROM principal actor JOIN public.user_roles ur ON ur.user_profile_id=actor.profile_id
   JOIN public.roles r ON r.id=ur.role_id JOIN public.role_permissions rp ON rp.role_id=r.id
   JOIN public.permissions p ON p.id=rp.permission_id
   WHERE actor.uid IS NOT NULL AND actor.active AND ur.is_active AND r.is_active AND p.is_active
     AND p.permission_code='dms.documents.preview'
 )
 SELECT projected.*
 FROM principal actor CROSS JOIN public.dms_document_files f JOIN public.dms_documents d ON d.id=f.document_id AND d.deleted_at IS NULL
 CROSS JOIN LATERAL jsonb_populate_record(NULL::public.dms_document_files,
   CASE WHEN actor.global_admin OR EXISTS (SELECT 1 FROM preview_scopes s
     WHERE (s.owner_company_id IS NULL AND s.branch_id IS NULL)
       OR (s.owner_company_id=d.owning_company_id AND (s.branch_id IS NULL OR s.branch_id=d.owning_branch_id)))
   THEN to_jsonb(f) ELSE to_jsonb(f)-ARRAY['ocr_text','ocr_error_message','integrity_error_message'] END) AS projected
 WHERE actor.uid IS NOT NULL AND actor.active
   AND (actor.global_admin OR erp_private.document_permission(f.document_id,'dms.admin'));
$$;

NOTIFY pgrst, 'reload schema';
COMMIT;
