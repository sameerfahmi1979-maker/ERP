-- Permit the actual scoped intake producer, not administration of arbitrary jobs.
BEGIN;
SET LOCAL lock_timeout='5s';SET LOCAL statement_timeout='60s';
CREATE FUNCTION erp_private.f07_may_manage_inline_job(p_session bigint,p_actor bigint) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE s public.dms_upload_sessions;proof erp_private.f07_intake_sources;
BEGIN
 IF p_actor IS DISTINCT FROM public.current_user_profile_id() OR NOT erp_private.business_principal_is_active() OR
  NOT erp_private.upload_session_permission(p_session,'dms.documents.upload') THEN RETURN false;END IF;
 SELECT * INTO s FROM public.dms_upload_sessions WHERE id=p_session AND deleted_at IS NULL;
 IF NOT FOUND OR s.status IN ('completed','cancelled','expired') OR s.intake_status IN ('approved','discarded','cancelled','expired') OR
  s.expires_at<=clock_timestamp() OR s.temp_cleaned_at IS NOT NULL OR
  NOT (erp_private.permission_in_scope('dms.documents.review_ai',s.owning_company_id,s.owning_branch_id) OR erp_private.permission_in_scope('dms.admin',s.owning_company_id,s.owning_branch_id)) OR
  NOT (erp_private.permission_in_scope('dms.documents.preview',s.owning_company_id,s.owning_branch_id) OR erp_private.permission_in_scope('dms.admin',s.owning_company_id,s.owning_branch_id)) THEN RETURN false;END IF;
 SELECT * INTO proof FROM erp_private.f07_intake_sources WHERE upload_session_id=s.id;
 RETURN proof.upload_session_id IS NOT NULL AND proof.source=erp_private.f07_intake_source_row(s) AND EXISTS(
  SELECT 1 FROM storage.objects o WHERE o.bucket_id='dms-temp' AND o.name=s.temp_storage_path AND
   ROW(o.id,o.version,o.updated_at) IS NOT DISTINCT FROM ROW(proof.object_id,proof.object_version,proof.object_updated_at));
END $$;
REVOKE ALL ON FUNCTION erp_private.f07_may_manage_inline_job(bigint,bigint) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION erp_private.f07_may_manage_inline_job(bigint,bigint) TO authenticated;
CREATE POLICY f07_inline_intake_job_insert ON public.dms_ai_extraction_jobs FOR INSERT TO authenticated
 WITH CHECK(job_type='classify_extract' AND document_id IS NULL AND file_id IS NULL AND status='pending'
  AND erp_private.f07_may_manage_inline_job(upload_session_id,created_by));
CREATE POLICY f07_inline_intake_job_update ON public.dms_ai_extraction_jobs FOR UPDATE TO authenticated
 USING(job_type='classify_extract' AND document_id IS NULL AND file_id IS NULL AND erp_private.f07_may_manage_inline_job(upload_session_id,created_by))
 WITH CHECK(job_type='classify_extract' AND document_id IS NULL AND file_id IS NULL AND erp_private.f07_may_manage_inline_job(upload_session_id,created_by));
CREATE FUNCTION erp_private.f07_inline_job_identity_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF current_user<>'authenticated' THEN RETURN NEW;END IF;
 IF TG_OP='UPDATE' AND OLD.job_type='classify_extract' AND OLD.document_id IS NULL THEN
  IF (to_jsonb(OLD)-ARRAY['status','started_at','completed_at','duration_ms','error_message','retry_count','updated_at']) IS DISTINCT FROM
   (to_jsonb(NEW)-ARRAY['status','started_at','completed_at','duration_ms','error_message','retry_count','updated_at']) THEN
   RAISE EXCEPTION 'Intake job identity, source and provider are immutable' USING ERRCODE='22023';END IF;
 ELSIF TG_OP='INSERT' AND NEW.job_type='classify_extract' AND NEW.document_id IS NULL AND NEW.status<>'pending' THEN
  RAISE EXCEPTION 'A new ordinary intake job must start pending, not as successful evidence' USING ERRCODE='22023';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION erp_private.f07_inline_job_identity_guard() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER f07_inline_job_identity_guard BEFORE INSERT OR UPDATE ON public.dms_ai_extraction_jobs FOR EACH ROW EXECUTE FUNCTION erp_private.f07_inline_job_identity_guard();
NOTIFY pgrst,'reload schema';
COMMIT;
