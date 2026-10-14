BEGIN;
SET LOCAL search_path=pg_catalog;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='8s';
DO $guard$
DECLARE p record;
BEGIN
 IF current_user<>'postgres' OR to_regclass('public.perf_hr_candidate_document_reads') IS NOT NULL THEN
  RAISE EXCEPTION 'Reviewed owner and absent candidate document projection required';
 END IF;
 SELECT * INTO STRICT p FROM pg_proc WHERE oid='erp_private.read_documents_filtered_v2(bigint[],text[],text[])'::regprocedure;
 IF md5(p.prosrc)<>'0c4be0e6b69b7fa8bb2ba0c446d3aae5' OR NOT p.prosecdef OR NOT p.proretset
  OR p.prorettype<>'public.dms_documents'::regtype OR pg_get_userbyid(p.proowner)<>'postgres'
  OR p.proconfig IS DISTINCT FROM ARRAY['search_path=""']::text[]
  OR NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='hr_candidate_documents'
   AND policyname='hr_candidate_documents_select' AND cmd='SELECT' AND permissive='PERMISSIVE'
   AND roles=ARRAY['authenticated']::name[] AND md5(qual)='283b1c18b03113eba8630bba7de22140' AND with_check IS NULL)
  OR (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='hr_candidate_documents')<>5
  OR NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='hr_candidate_documents' AND policyname='f03_principal'
   AND permissive='RESTRICTIVE' AND cmd='ALL' AND roles=ARRAY['authenticated']::name[]
   AND qual='( SELECT erp_private.business_principal_is_active() AS business_principal_is_active)' AND with_check=qual)
  OR NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='public.hr_candidate_documents'::regclass AND relrowsecurity)
 THEN RAISE EXCEPTION 'Reviewed candidate document visibility prerequisite drift'; END IF;
END $guard$;
-- Invoker view: child rows keep their live RLS intersection. Metadata comes
-- only from the existing protected document projection, materialized once,
-- rather than evaluating the original table policy per joined search row.
-- No file paths, OCR, document content, new authority or write grant is added.
CREATE VIEW public.perf_hr_candidate_document_reads WITH (security_invoker=true) AS
 WITH documents AS MATERIALIZED (
  SELECT id,document_no,title FROM erp_private.read_documents()
 )
 SELECT c.id,c.candidate_id,c.dms_document_id,c.document_purpose,c.verification_status,c.created_at,c.deleted_at,c.notes,
  d.id AS document_visible_id,d.document_no AS document_number,d.title AS document_title
 FROM public.hr_candidate_documents c LEFT JOIN documents d ON d.id=c.dms_document_id;
REVOKE ALL ON public.perf_hr_candidate_document_reads FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.perf_hr_candidate_document_reads TO authenticated;
COMMIT;
