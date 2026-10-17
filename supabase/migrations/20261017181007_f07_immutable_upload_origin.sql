-- F07-T01: pin current implemented single-upload subjects; no guessed future tables.
BEGIN;
SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='60s';
ALTER TABLE public.dms_upload_sessions ADD COLUMN origin_entity_type text, ADD COLUMN origin_entity_id bigint;
ALTER TABLE public.dms_upload_sessions ADD CONSTRAINT f07_upload_origin_pair CHECK (
 (origin_entity_type IS NULL AND origin_entity_id IS NULL) OR
 (origin_entity_type IS NOT NULL AND origin_entity_id IS NOT NULL AND origin_entity_type IN ('employee','employee_dependent','company','branch','party') AND origin_entity_id BETWEEN 1 AND 9007199254740991));

CREATE FUNCTION erp_private.f07_upload_origin_scope(p_type text,p_id bigint)
RETURNS TABLE(company bigint,branch bigint) LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE employee bigint; original_employee bigint;
BEGIN
 IF auth.uid() IS NULL OR NOT erp_private.business_principal_is_active() OR p_id IS NULL OR p_id<1 THEN
  RAISE EXCEPTION 'Upload subject unavailable' USING ERRCODE='42501'; END IF;
 CASE p_type
 WHEN 'employee' THEN employee:=p_id;
 WHEN 'employee_dependent' THEN
  SELECT employee_id INTO employee FROM public.employee_dependents WHERE id=p_id AND deleted_at IS NULL AND is_active;
  original_employee:=employee;
 WHEN 'company' THEN SELECT id,NULL::bigint INTO company,branch FROM public.owner_companies WHERE id=p_id AND status='active' FOR SHARE NOWAIT;
 WHEN 'branch' THEN SELECT owner_company_id,id INTO company,branch FROM public.branches WHERE id=p_id AND status='active' FOR SHARE NOWAIT;
 WHEN 'party' THEN
  IF NOT (public.current_user_has_permission('master_data.parties.view') OR public.current_user_has_permission('master_data.party_master.view') OR public.current_user_has_role('system_admin')) THEN
   RAISE EXCEPTION 'Upload subject unavailable' USING ERRCODE='42501'; END IF;
  PERFORM id FROM public.parties WHERE id=p_id AND is_active AND NOT is_locked FOR SHARE NOWAIT;
  IF NOT FOUND THEN RAISE EXCEPTION 'Upload subject unavailable' USING ERRCODE='42501'; END IF;
  SELECT owner_company_id,branch_id INTO company,branch FROM public.user_profiles WHERE id=public.current_user_profile_id();
 ELSE RAISE EXCEPTION 'This upload subject is not implemented; no generic upload was substituted' USING ERRCODE='22023';
 END CASE;
 IF p_type IN ('employee','employee_dependent') THEN
  IF employee IS NULL OR NOT public.current_user_can_manage_employee(employee) THEN RAISE EXCEPTION 'Upload subject unavailable' USING ERRCODE='42501'; END IF;
  SELECT owner_company_id,branch_id INTO company,branch FROM public.employees WHERE id=employee AND deleted_at IS NULL FOR SHARE NOWAIT;
  IF p_type='employee_dependent' THEN
   PERFORM id FROM public.employee_dependents WHERE id=p_id AND employee_id=original_employee AND deleted_at IS NULL AND is_active FOR SHARE NOWAIT;
   IF NOT FOUND THEN RAISE EXCEPTION 'Upload subject changed' USING ERRCODE='PT409'; END IF;
  END IF;
 END IF;
 IF company IS NULL OR NOT (erp_private.permission_in_scope('dms.documents.upload',company,branch) OR erp_private.permission_in_scope('dms.admin',company,branch)) THEN
  RAISE EXCEPTION 'Upload subject scope unavailable' USING ERRCODE='42501'; END IF;
 RETURN NEXT;
END $$;
REVOKE ALL ON FUNCTION erp_private.f07_upload_origin_scope(text,bigint) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION erp_private.protect_upload_intake_scope()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor bigint:=public.current_user_profile_id();
BEGIN
 IF TG_OP='INSERT' THEN
  IF auth.uid() IS NOT NULL AND NEW.uploaded_by IS DISTINCT FROM actor THEN RAISE EXCEPTION 'Upload identity must match current actor' USING ERRCODE='42501'; END IF;
  IF NEW.origin_entity_type IS NOT NULL OR NEW.origin_entity_id IS NOT NULL THEN
   IF NEW.batch_id IS NOT NULL THEN RAISE EXCEPTION 'Batch context uses its existing admission contract' USING ERRCODE='22023'; END IF;
   SELECT company,branch INTO NEW.owning_company_id,NEW.owning_branch_id FROM erp_private.f07_upload_origin_scope(NEW.origin_entity_type,NEW.origin_entity_id);
  ELSE SELECT owner_company_id,branch_id INTO NEW.owning_company_id,NEW.owning_branch_id FROM public.user_profiles WHERE id=NEW.uploaded_by;
  END IF;
 ELSE
  IF ROW(NEW.origin_entity_type,NEW.origin_entity_id) IS DISTINCT FROM ROW(OLD.origin_entity_type,OLD.origin_entity_id) THEN
   RAISE EXCEPTION 'Upload origin is immutable; no historical origin is inferred' USING ERRCODE='42501'; END IF;
  IF auth.uid() IS NOT NULL THEN
   IF ROW(NEW.uploaded_by,NEW.owning_company_id,NEW.owning_branch_id,NEW.session_code,NEW.temp_storage_path)
    IS DISTINCT FROM ROW(OLD.uploaded_by,OLD.owning_company_id,OLD.owning_branch_id,OLD.session_code,OLD.temp_storage_path) THEN
    RAISE EXCEPTION 'Upload identity, scope and storage binding are immutable' USING ERRCODE='42501'; END IF;
   IF OLD.document_id IS NOT NULL AND NEW.document_id IS DISTINCT FROM OLD.document_id THEN RAISE EXCEPTION 'Completed upload document binding is immutable' USING ERRCODE='42501'; END IF;
  END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION erp_private.protect_upload_intake_scope() FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION erp_private.f07_link_upload_origin() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s public.dms_upload_sessions; d public.dms_documents; scope record;
BEGIN
 IF NEW.origin_entity_type IS NULL OR NEW.document_id IS NULL OR OLD.document_id IS NOT NULL THEN RETURN NEW; END IF;
 SELECT * INTO s FROM public.dms_upload_sessions WHERE id=NEW.id;
 IF s.document_id IS DISTINCT FROM NEW.document_id OR s.origin_entity_type IS DISTINCT FROM NEW.origin_entity_type OR s.origin_entity_id IS DISTINCT FROM NEW.origin_entity_id THEN
  RAISE EXCEPTION 'Upload binding changed' USING ERRCODE='PT409'; END IF;
 SELECT * INTO scope FROM erp_private.f07_upload_origin_scope(s.origin_entity_type,s.origin_entity_id);
 SELECT * INTO d FROM public.dms_documents WHERE id=s.document_id AND deleted_at IS NULL;
 IF d.id IS NULL OR ROW(d.owning_company_id,d.owning_branch_id) IS DISTINCT FROM ROW(scope.company,scope.branch) OR
  ROW(s.owning_company_id,s.owning_branch_id) IS DISTINCT FROM ROW(scope.company,scope.branch) OR
  NOT (erp_private.document_permission(d.id,'dms.documents.edit') OR erp_private.document_permission(d.id,'dms.admin')) THEN
  RAISE EXCEPTION 'Upload destination no longer matches its subject' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.dms_document_links WHERE document_id=d.id AND entity_type=s.origin_entity_type AND entity_id=s.origin_entity_id AND deleted_at IS NULL) THEN
  IF EXISTS(SELECT 1 FROM erp_private.f07_attachment_intents WHERE upload_session_id=s.id) THEN
   RAISE EXCEPTION 'An existing-document attachment must already match the original upload subject' USING ERRCODE='42501'; END IF;
  INSERT INTO public.dms_document_links(document_id,entity_type,entity_id,is_primary,linked_by) VALUES(d.id,s.origin_entity_type,s.origin_entity_id,true,public.current_user_profile_id());
  INSERT INTO public.dms_document_events(document_id,event_type,description,performed_by,metadata_json)
   VALUES(d.id,'upload_origin_linked','Original upload subject retained',public.current_user_profile_id(),jsonb_build_object('upload_session_id',s.id,'entity_type',s.origin_entity_type,'entity_id',s.origin_entity_id));
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION erp_private.f07_link_upload_origin() FROM PUBLIC,anon,authenticated,service_role;
CREATE CONSTRAINT TRIGGER f07_link_upload_origin AFTER UPDATE ON public.dms_upload_sessions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION erp_private.f07_link_upload_origin();
NOTIFY pgrst,'reload schema';
COMMIT;
