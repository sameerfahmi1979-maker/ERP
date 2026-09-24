BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';

-- Column grants prevent direct REST/GraphQL reads or predicates from revealing
-- extracted content to a metadata-only user. Narrow private projections below
-- explicitly enforce both row scope and content permission before returning it.
DO $$ DECLARE t text; cols text; sensitive text[]; c text; BEGIN
 FOREACH t IN ARRAY ARRAY['dms_documents','dms_document_files'] LOOP
  sensitive:=CASE WHEN t='dms_documents' THEN ARRAY['ai_summary','content_tsv','summary_embedding','ai_summary_error','summary_embedding_error','ai_warnings_json','ai_risk_reasons_json']
    ELSE ARRAY['ocr_text','ocr_error_message','integrity_error_message'] END;
  EXECUTE format('REVOKE SELECT ON public.%I FROM PUBLIC,anon,authenticated',t);
  FOREACH c IN ARRAY sensitive LOOP EXECUTE format('REVOKE SELECT (%I) ON public.%I FROM PUBLIC,anon,authenticated',c,t); END LOOP;
  SELECT string_agg(quote_ident(column_name),',' ORDER BY ordinal_position) INTO cols FROM information_schema.columns
    WHERE table_schema='public' AND table_name=t AND NOT column_name=ANY(sensitive);
  EXECUTE format('GRANT SELECT (%s) ON public.%I TO authenticated',cols,t);
 END LOOP;
END $$;

CREATE OR REPLACE FUNCTION erp_private.read_documents()
RETURNS SETOF public.dms_documents LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT (jsonb_populate_record(NULL::public.dms_documents,
   CASE WHEN erp_private.document_permission(d.id,'dms.documents.preview') THEN to_jsonb(d)
   ELSE (to_jsonb(d)-ARRAY['ai_summary','content_tsv','summary_embedding','ai_summary_error','summary_embedding_error','ai_warnings_json','ai_risk_reasons_json'])
     || jsonb_build_object('content_tsv',to_tsvector('simple',concat_ws(' ',d.document_no,d.title,d.description,d.legacy_document_code))) END)).*
 FROM public.dms_documents d
 WHERE (SELECT auth.uid()) IS NOT NULL AND (SELECT erp_private.business_principal_is_active())
   AND d.deleted_at IS NULL AND erp_private.document_permission(d.id,'dms.documents.view');
$$;
CREATE OR REPLACE FUNCTION erp_private.read_document_files()
RETURNS SETOF public.dms_document_files LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT (jsonb_populate_record(NULL::public.dms_document_files,
   CASE WHEN erp_private.document_permission(f.document_id,'dms.documents.preview') THEN to_jsonb(f)
   ELSE to_jsonb(f)-ARRAY['ocr_text','ocr_error_message','integrity_error_message'] END)).*
 FROM public.dms_document_files f
 WHERE (SELECT auth.uid()) IS NOT NULL AND (SELECT erp_private.business_principal_is_active())
   AND f.deleted_at IS NULL AND erp_private.document_permission(f.document_id,'dms.documents.view');
$$;
REVOKE ALL ON FUNCTION erp_private.read_documents(),erp_private.read_document_files() FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION erp_private.read_documents(),erp_private.read_document_files() TO authenticated;
CREATE OR REPLACE FUNCTION public.f03_read_documents()
RETURNS SETOF public.dms_documents LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$ SELECT * FROM erp_private.read_documents(); $$;
CREATE OR REPLACE FUNCTION public.f03_read_document_files()
RETURNS SETOF public.dms_document_files LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$ SELECT * FROM erp_private.read_document_files(); $$;
REVOKE ALL ON FUNCTION public.f03_read_documents(),public.f03_read_document_files() FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.f03_read_documents(),public.f03_read_document_files() TO authenticated;
-- Shared non-business taxonomy labels must remain usable by scoped DMS readers;
-- they contain no document content. Administrative writes remain unchanged.
DROP POLICY IF EXISTS f03_scoped_document_taxonomy_read ON public.dms_document_types;
CREATE POLICY f03_scoped_document_taxonomy_read ON public.dms_document_types FOR SELECT TO authenticated
 USING ((SELECT public.current_user_has_permission_any_scope('dms.documents.view')) OR (SELECT public.current_user_has_permission_any_scope('dms.admin')));
DROP POLICY IF EXISTS f03_scoped_document_taxonomy_read ON public.dms_document_categories;
CREATE POLICY f03_scoped_document_taxonomy_read ON public.dms_document_categories FOR SELECT TO authenticated
 USING ((SELECT public.current_user_has_permission_any_scope('dms.documents.view')) OR (SELECT public.current_user_has_permission_any_scope('dms.admin')));
DROP POLICY IF EXISTS f03_scoped_document_taxonomy_read ON public.dms_tags;
CREATE POLICY f03_scoped_document_taxonomy_read ON public.dms_tags FOR SELECT TO authenticated
 USING ((SELECT public.current_user_has_permission_any_scope('dms.documents.view')) OR (SELECT public.current_user_has_permission_any_scope('dms.admin')));
NOTIFY pgrst,'reload schema';
COMMIT;
