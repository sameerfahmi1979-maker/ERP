BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
-- Invoker computed field: sorting sees only the tags allowed by existing RLS.
CREATE FUNCTION public.perf_document_tag_count(doc public.dms_documents)
RETURNS bigint LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
  SELECT count(*) FROM public.dms_document_tags t WHERE t.document_id=doc.id;
$$;
REVOKE ALL ON FUNCTION public.perf_document_tag_count(public.dms_documents) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.perf_document_tag_count(public.dms_documents) TO authenticated;
-- Existence predicates remain caller-RLS scoped; no content or file URL is returned.
CREATE FUNCTION public.perf_document_has_files(doc public.dms_documents)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
  SELECT EXISTS(SELECT 1 FROM public.dms_document_files f WHERE f.document_id=doc.id AND f.deleted_at IS NULL);
$$;
CREATE FUNCTION public.perf_document_has_extracted_text(doc public.dms_documents)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
  SELECT EXISTS(SELECT 1 FROM public.dms_document_content c WHERE c.document_id=doc.id AND c.content_text IS NOT NULL);
$$;
REVOKE ALL ON FUNCTION public.perf_document_has_files(public.dms_documents),public.perf_document_has_extracted_text(public.dms_documents) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.perf_document_has_files(public.dms_documents),public.perf_document_has_extracted_text(public.dms_documents) TO authenticated;
CREATE FUNCTION public.perf_search_documents_content(search_text text)
RETURNS SETOF public.dms_documents LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
  SELECT d.* FROM public.f03_read_documents() d
  WHERE char_length(btrim(search_text)) BETWEEN 1 AND 200
    AND EXISTS(SELECT 1 FROM public.dms_document_content c
      WHERE c.document_id=d.id AND to_tsvector('simple',coalesce(c.content_text,'')) @@ plainto_tsquery('simple',search_text));
$$;
REVOKE ALL ON FUNCTION public.perf_search_documents_content(text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.perf_search_documents_content(text) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
