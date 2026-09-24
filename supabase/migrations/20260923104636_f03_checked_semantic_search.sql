BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';

-- Keep the legacy RPC signature, but never treat its caller-supplied admin flag
-- as authority. The checked projection supplies only currently permitted content.
CREATE OR REPLACE FUNCTION public.search_dms_documents_by_embedding(
 p_query_embedding public.vector(1536),p_match_count integer DEFAULT 25,
 p_match_threshold double precision DEFAULT 0.2,p_is_admin boolean DEFAULT false,
 p_exclude_document_id bigint DEFAULT NULL
) RETURNS TABLE(document_id bigint,document_no text,title text,ai_summary text,
 ai_risk_level text,completeness_score numeric,expiry_date date,confidentiality_level text,similarity double precision)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT d.id,d.document_no,d.title,d.ai_summary,d.ai_risk_level,d.completeness_score,d.expiry_date,d.confidentiality_level,
  1-(d.summary_embedding OPERATOR(public.<=>) p_query_embedding)
 FROM public.f03_read_documents() d
 WHERE d.summary_embedding IS NOT NULL AND (p_exclude_document_id IS NULL OR d.id<>p_exclude_document_id)
  AND 1-(d.summary_embedding OPERATOR(public.<=>) p_query_embedding)>=p_match_threshold
 ORDER BY d.summary_embedding OPERATOR(public.<=>) p_query_embedding
 LIMIT greatest(1,least(p_match_count,50));
$$;
REVOKE ALL ON FUNCTION public.search_dms_documents_by_embedding(public.vector,integer,double precision,boolean,bigint) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.search_dms_documents_by_embedding(public.vector,integer,double precision,boolean,bigint) TO authenticated;

-- Chunk RLS already requires document preview and classification/subject scope.
-- A false client admin flag must not prevent a legitimate scoped HR reader.
CREATE OR REPLACE FUNCTION public.search_dms_document_chunks_by_embedding(
 p_query_embedding public.vector(1536),p_match_count integer DEFAULT 50,
 p_match_threshold double precision DEFAULT 0.2,p_is_admin boolean DEFAULT false,
 p_document_type_id bigint DEFAULT NULL
) RETURNS TABLE(chunk_id bigint,document_id bigint,document_no text,title text,chunk_index integer,
 snippet text,similarity double precision,confidentiality_level text)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT c.id,d.id,d.document_no,d.title,c.chunk_index,left(c.chunk_text,250),
  1-(c.embedding OPERATOR(public.<=>) p_query_embedding),d.confidentiality_level
 FROM public.dms_document_content_chunks c JOIN public.dms_documents d ON d.id=c.document_id
 WHERE c.is_active AND c.deleted_at IS NULL AND c.embedding_status='complete' AND c.embedding IS NOT NULL
  AND d.deleted_at IS NULL AND erp_private.document_permission(d.id,'dms.documents.preview')
  AND (p_document_type_id IS NULL OR d.document_type_id=p_document_type_id)
  AND 1-(c.embedding OPERATOR(public.<=>) p_query_embedding)>=p_match_threshold
 ORDER BY c.embedding OPERATOR(public.<=>) p_query_embedding
 LIMIT greatest(1,least(p_match_count,100));
$$;
REVOKE ALL ON FUNCTION public.search_dms_document_chunks_by_embedding(public.vector,integer,double precision,boolean,bigint) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.search_dms_document_chunks_by_embedding(public.vector,integer,double precision,boolean,bigint) TO authenticated;

-- A separate, explicitly scoped administration projection retains soft-deleted
-- files. Ordinary document readers continue excluding those rows. Deleted parent
-- documents remain denied; this is not a new recycle-bin/purge workflow.
CREATE OR REPLACE FUNCTION erp_private.read_document_files_for_admin()
RETURNS SETOF public.dms_document_files LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT (jsonb_populate_record(NULL::public.dms_document_files,
  CASE WHEN erp_private.document_permission(f.document_id,'dms.documents.preview') THEN to_jsonb(f)
  ELSE to_jsonb(f)-ARRAY['ocr_text','ocr_error_message','integrity_error_message'] END)).*
 FROM public.dms_document_files f
 WHERE (SELECT auth.uid()) IS NOT NULL AND (SELECT erp_private.business_principal_is_active())
  AND erp_private.document_permission(f.document_id,'dms.admin');
$$;
REVOKE ALL ON FUNCTION erp_private.read_document_files_for_admin() FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION erp_private.read_document_files_for_admin() TO authenticated;
CREATE OR REPLACE FUNCTION public.f03_read_document_files_for_admin()
RETURNS SETOF public.dms_document_files LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT * FROM erp_private.read_document_files_for_admin();
$$;
REVOKE ALL ON FUNCTION public.f03_read_document_files_for_admin() FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.f03_read_document_files_for_admin() TO authenticated;

-- An authorized document row must not become a pointer to another document's
-- bytes. Existing legacy paths remain untouched; only new human bindings follow
-- the server upload convention. Changing an existing binding needs a dedicated
-- reviewed server workflow, not a raw metadata update.
CREATE OR REPLACE FUNCTION erp_private.protect_file_storage_binding()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE company bigint; parts text[]; version_document bigint;
BEGIN
 IF auth.uid() IS NULL THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' THEN
  IF ROW(NEW.document_id,NEW.version_id,NEW.storage_bucket,NEW.storage_path)
   IS DISTINCT FROM ROW(OLD.document_id,OLD.version_id,OLD.storage_bucket,OLD.storage_path) THEN
   RAISE EXCEPTION 'File storage bindings cannot be changed by metadata edits' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
 END IF;
 SELECT d.owning_company_id INTO company FROM public.dms_documents d WHERE d.id=NEW.document_id AND d.deleted_at IS NULL;
 parts:=string_to_array(NEW.storage_path,'/');
 IF NEW.document_id IS NULL OR company IS NULL OR NEW.storage_bucket IS DISTINCT FROM 'dms-documents'
  OR NEW.storage_path IS NULL OR NEW.storage_path !~ '^[0-9]+/[0-9]{4}/[^/]+/[0-9]+/v[0-9]+/[^/]+$'
  OR parts[1] IS DISTINCT FROM company::text OR parts[4] IS DISTINCT FROM NEW.document_id::text
  OR '..'=ANY(parts) OR '.'=ANY(parts) THEN
  RAISE EXCEPTION 'File storage path does not belong to the selected document' USING ERRCODE='42501';
 END IF;
 IF NEW.version_id IS NOT NULL THEN
  SELECT v.document_id INTO version_document FROM public.dms_document_versions v WHERE v.id=NEW.version_id;
  IF version_document IS DISTINCT FROM NEW.document_id THEN
   RAISE EXCEPTION 'File version does not belong to the selected document' USING ERRCODE='42501';
  END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION erp_private.protect_file_storage_binding() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER f03_file_storage_binding BEFORE INSERT OR UPDATE ON public.dms_document_files
 FOR EACH ROW EXECUTE FUNCTION erp_private.protect_file_storage_binding();
NOTIFY pgrst,'reload schema';
COMMIT;
