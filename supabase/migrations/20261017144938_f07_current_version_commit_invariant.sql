-- Validate at COMMIT, so canonical transactions may change flags/pointer/files
-- in their internal order, but separate HTTP writes cannot publish split state.
BEGIN;
SET LOCAL lock_timeout='5s';SET LOCAL statement_timeout='60s';
CREATE FUNCTION erp_private.f07_assert_current_version(p_document bigint) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE d public.dms_documents; current_count integer;
BEGIN
 SELECT * INTO d FROM public.dms_documents WHERE id=p_document AND deleted_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RETURN;END IF;
 SELECT count(*) INTO current_count FROM public.dms_document_versions WHERE document_id=d.id AND is_current AND unlinked_at IS NULL;
 IF d.current_version_id IS NULL THEN
  IF current_count<>0 THEN RAISE EXCEPTION 'A current version must match the document pointer' USING ERRCODE='23514';END IF;
 ELSE
  IF current_count<>1 OR NOT EXISTS(SELECT 1 FROM public.dms_document_versions v WHERE v.id=d.current_version_id AND v.document_id=d.id AND v.is_current AND v.unlinked_at IS NULL)
   OR NOT EXISTS(SELECT 1 FROM public.dms_document_files f WHERE f.document_id=d.id AND f.version_id=d.current_version_id AND f.deleted_at IS NULL AND f.file_role='original') THEN
   RAISE EXCEPTION 'The current pointer requires exactly one live version and available original metadata' USING ERRCODE='23514';END IF;
 END IF;
END $$;
REVOKE ALL ON FUNCTION erp_private.f07_assert_current_version(bigint) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION erp_private.f07_current_version_commit_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE parent bigint;
BEGIN
 IF TG_TABLE_NAME='dms_documents' THEN
  IF TG_OP<>'DELETE' THEN PERFORM erp_private.f07_assert_current_version(NEW.id);END IF;
 ELSE
  FOR parent IN SELECT DISTINCT id FROM unnest(ARRAY[CASE WHEN TG_OP<>'INSERT' THEN OLD.document_id END,CASE WHEN TG_OP<>'DELETE' THEN NEW.document_id END]) id WHERE id IS NOT NULL ORDER BY id LOOP
   PERFORM erp_private.f07_assert_current_version(parent);
  END LOOP;
 END IF;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION erp_private.f07_current_version_commit_guard() FROM PUBLIC,anon,authenticated,service_role;
CREATE CONSTRAINT TRIGGER f07_current_version_commit_guard AFTER INSERT OR UPDATE ON public.dms_documents DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION erp_private.f07_current_version_commit_guard();
CREATE CONSTRAINT TRIGGER f07_current_version_commit_guard AFTER INSERT OR UPDATE OR DELETE ON public.dms_document_versions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION erp_private.f07_current_version_commit_guard();
CREATE CONSTRAINT TRIGGER f07_current_version_commit_guard AFTER INSERT OR UPDATE OR DELETE ON public.dms_document_files DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION erp_private.f07_current_version_commit_guard();
NOTIFY pgrst,'reload schema';
COMMIT;
