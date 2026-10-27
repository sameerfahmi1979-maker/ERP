-- H14: use the already governed document set once, not one full authority
-- evaluation per file. Preserve private projections, ACLs and preview masking.
BEGIN;
SET LOCAL lock_timeout='5s';SET LOCAL statement_timeout='30s';
DO $preimage$
DECLARE expected record;
BEGIN
 IF current_user<>'postgres' OR has_schema_privilege('authenticated','erp_private','CREATE') OR has_schema_privilege('anon','erp_private','CREATE')THEN
  RAISE EXCEPTION 'H14 file owner/schema prerequisite changed';END IF;
 FOR expected IN SELECT * FROM(VALUES
 ('erp_private.read_document_files()','b159e55aa20a8a0adfd735da21b87bb1'),
 ('erp_private.read_documents()','6bc7814a408d77990df6e20bb2c58033'),
 ('erp_private.read_documents_filtered(bigint[],text[])','c95a1a5ba0facbcb902b429be8a29a12'),
 ('erp_private.read_documents_filtered_v2(bigint[],text[],text[])','0c4be0e6b69b7fa8bb2ba0c446d3aae5'),
 ('erp_private.document_permission(bigint,text)','1c6c7a6c40749c9bea0e28cc99e03595')
 )v(signature,body_hash)LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure(expected.signature)AND md5(p.prosrc)=expected.body_hash AND p.prosecdef AND p.provolatile='s'AND p.proowner='postgres'::regrole AND p.proacl::text='{postgres=X/postgres,authenticated=X/postgres}')THEN
   RAISE EXCEPTION 'H14 file authority preimage changed: %',expected.signature;END IF;
 END LOOP;
END;$preimage$;

CREATE OR REPLACE FUNCTION erp_private.read_document_files()
RETURNS SETOF public.dms_document_files LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $function$
 WITH principal AS MATERIALIZED(
  SELECT auth.uid()uid,erp_private.business_principal_is_active()active,public.current_user_is_global_admin()global_admin,public.current_user_profile_id()profile_id
 ),preview_scopes AS MATERIALIZED(
  SELECT DISTINCT ur.owner_company_id,ur.branch_id FROM principal actor
  JOIN public.user_roles ur ON ur.user_profile_id=actor.profile_id JOIN public.roles r ON r.id=ur.role_id
  JOIN public.role_permissions rp ON rp.role_id=r.id JOIN public.permissions p ON p.id=rp.permission_id
  WHERE actor.uid IS NOT NULL AND actor.active AND ur.is_active AND r.is_active AND p.is_active AND p.permission_code='dms.documents.preview'
 ),authorized_documents AS MATERIALIZED(
  -- This is the current F03/PERF reader, including HR, recruitment, clinical,
  -- sensitivity, linked employee/dependent, deleted-row and scope fences.
  SELECT d.id,d.owning_company_id,d.owning_branch_id FROM erp_private.read_documents()d
 )
 SELECT projected.* FROM principal actor CROSS JOIN public.dms_document_files f
 JOIN authorized_documents d ON d.id=f.document_id
 CROSS JOIN LATERAL jsonb_populate_record(NULL::public.dms_document_files,
  CASE WHEN actor.global_admin OR EXISTS(SELECT 1 FROM preview_scopes s WHERE(s.owner_company_id IS NULL AND s.branch_id IS NULL)OR(s.owner_company_id=d.owning_company_id AND(s.branch_id IS NULL OR s.branch_id=d.owning_branch_id)))
  THEN to_jsonb(f)ELSE to_jsonb(f)-ARRAY['ocr_text','ocr_error_message','integrity_error_message']END)AS projected
 WHERE actor.uid IS NOT NULL AND actor.active AND f.deleted_at IS NULL;
$function$;
COMMENT ON FUNCTION erp_private.read_document_files()IS 'F03 protected file projection using one statement-local governed document set; original preview-field masking, no cross-request authority cache or write-policy change.';
COMMIT;
