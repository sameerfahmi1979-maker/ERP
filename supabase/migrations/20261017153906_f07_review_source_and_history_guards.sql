-- Capture source version at job admission. Historical jobs without admission
-- provenance are not silently rebound to today's original during review.
BEGIN;
SET LOCAL lock_timeout='5s';SET LOCAL statement_timeout='60s';
CREATE TABLE erp_private.f07_ai_job_sources (
 job_id bigint PRIMARY KEY REFERENCES public.dms_ai_extraction_jobs(id),
 document_id bigint NOT NULL REFERENCES public.dms_documents(id),version_id bigint REFERENCES public.dms_document_versions(id),
 source_hash text,created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE erp_private.f07_ai_job_sources ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON erp_private.f07_ai_job_sources FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION erp_private.f07_capture_ai_job_source() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE d public.dms_documents;
BEGIN
 IF NEW.document_id IS NOT NULL THEN
  SELECT * INTO d FROM public.dms_documents WHERE id=NEW.document_id FOR SHARE;
  IF d.id IS NOT NULL THEN INSERT INTO erp_private.f07_ai_job_sources(job_id,document_id,version_id,source_hash) VALUES(NEW.id,d.id,d.current_version_id,NEW.input_text_hash); END IF;
 END IF;RETURN NEW;
END $$;
CREATE TRIGGER f07_capture_ai_job_source AFTER INSERT ON public.dms_ai_extraction_jobs FOR EACH ROW EXECUTE FUNCTION erp_private.f07_capture_ai_job_source();
CREATE FUNCTION erp_private.f07_check_ai_source(p_result bigint,p_document bigint) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.dms_ai_extraction_results a JOIN public.dms_ai_extraction_jobs j ON j.id=a.job_id JOIN erp_private.f07_ai_job_sources proof ON proof.job_id=j.id JOIN public.dms_documents d ON d.id=proof.document_id
  WHERE a.id=p_result AND a.document_id=p_document AND d.id=p_document AND j.document_id=p_document AND j.status='completed'
   AND proof.version_id IS NOT DISTINCT FROM d.current_version_id AND proof.source_hash IS NOT DISTINCT FROM j.input_text_hash) THEN
  RAISE EXCEPTION 'AI result has no verified current-version admission evidence; use manual metadata or a new reviewed analysis' USING ERRCODE='PT409';
 END IF;
END $$;
CREATE FUNCTION erp_private.f07_metadata_history_guard() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN IF current_user NOT IN ('postgres','supabase_admin') THEN RAISE EXCEPTION 'Apply history is immutable' USING ERRCODE='42501'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;RETURN NEW;END $$;
CREATE TRIGGER f07_metadata_history_guard BEFORE INSERT OR UPDATE OR DELETE ON public.dms_ai_metadata_apply_runs FOR EACH ROW EXECUTE FUNCTION erp_private.f07_metadata_history_guard();
CREATE TRIGGER f07_metadata_history_guard BEFORE INSERT OR UPDATE OR DELETE ON public.dms_ai_metadata_apply_items FOR EACH ROW EXECUTE FUNCTION erp_private.f07_metadata_history_guard();
REVOKE ALL ON FUNCTION erp_private.f07_capture_ai_job_source(),erp_private.f07_check_ai_source(bigint,bigint),erp_private.f07_metadata_history_guard() FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
