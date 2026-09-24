BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';

-- Inbox files exist before a DMS document. Pin their organization to the uploader
-- at intake; later profile transfers must not reinterpret an old file's scope.
ALTER TABLE public.dms_upload_sessions
 ADD COLUMN owning_company_id bigint REFERENCES public.owner_companies(id),
 ADD COLUMN owning_branch_id bigint REFERENCES public.branches(id);
UPDATE public.dms_upload_sessions s SET owning_company_id=p.owner_company_id,owning_branch_id=p.branch_id
 FROM public.user_profiles p WHERE p.id=s.uploaded_by;
CREATE INDEX f03_upload_intake_scope ON public.dms_upload_sessions(owning_company_id,owning_branch_id,uploaded_by) WHERE deleted_at IS NULL;

CREATE FUNCTION erp_private.upload_row_allowed(uploader bigint,company bigint,branch bigint,document bigint)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT (SELECT erp_private.business_principal_is_active()) AND (
  CASE WHEN $4 IS NOT NULL THEN
   erp_private.document_permission($4,'dms.documents.review_ai') OR erp_private.document_permission($4,'dms.admin')
    OR ($1=public.current_user_profile_id() AND erp_private.document_permission($4,'dms.documents.upload'))
  ELSE
   erp_private.permission_in_scope('dms.documents.review_ai',$2,$3) OR erp_private.permission_in_scope('dms.admin',$2,$3)
    OR ($1=public.current_user_profile_id() AND erp_private.permission_in_scope('dms.documents.upload',$2,$3))
  END);
$$;
CREATE FUNCTION erp_private.upload_session_allowed(session_id bigint)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.dms_upload_sessions s WHERE s.id=$1 AND s.deleted_at IS NULL
  AND erp_private.upload_row_allowed(s.uploaded_by,s.owning_company_id,s.owning_branch_id,s.document_id));
$$;
REVOKE ALL ON FUNCTION erp_private.upload_row_allowed(bigint,bigint,bigint,bigint),erp_private.upload_session_allowed(bigint) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION erp_private.upload_row_allowed(bigint,bigint,bigint,bigint),erp_private.upload_session_allowed(bigint) TO authenticated;

CREATE FUNCTION erp_private.protect_upload_intake_scope()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor bigint:=public.current_user_profile_id();
BEGIN
 IF TG_OP='INSERT' THEN
  IF auth.uid() IS NOT NULL AND NEW.uploaded_by IS DISTINCT FROM actor THEN
   RAISE EXCEPTION 'Upload identity must match current actor' USING ERRCODE='42501';
  END IF;
  SELECT owner_company_id,branch_id INTO NEW.owning_company_id,NEW.owning_branch_id FROM public.user_profiles WHERE id=NEW.uploaded_by;
 ELSIF auth.uid() IS NOT NULL THEN
  IF ROW(NEW.uploaded_by,NEW.owning_company_id,NEW.owning_branch_id,NEW.session_code,NEW.temp_storage_path)
   IS DISTINCT FROM ROW(OLD.uploaded_by,OLD.owning_company_id,OLD.owning_branch_id,OLD.session_code,OLD.temp_storage_path) THEN
   RAISE EXCEPTION 'Upload identity, scope and storage binding are immutable' USING ERRCODE='42501';
  END IF;
  IF OLD.document_id IS NOT NULL AND NEW.document_id IS DISTINCT FROM OLD.document_id THEN
   RAISE EXCEPTION 'Completed upload document binding is immutable' USING ERRCODE='42501';
  END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION erp_private.protect_upload_intake_scope() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER f03_upload_intake_scope BEFORE INSERT OR UPDATE ON public.dms_upload_sessions
 FOR EACH ROW EXECUTE FUNCTION erp_private.protect_upload_intake_scope();

DROP POLICY f03_document_subject ON public.dms_upload_sessions;
DROP POLICY f01_upload_session_select ON public.dms_upload_sessions;
DROP POLICY f01_upload_session_insert ON public.dms_upload_sessions;
DROP POLICY f01_upload_session_update ON public.dms_upload_sessions;
CREATE POLICY f03_upload_subject ON public.dms_upload_sessions AS RESTRICTIVE FOR ALL TO authenticated
 USING (erp_private.upload_row_allowed(uploaded_by,owning_company_id,owning_branch_id,document_id))
 WITH CHECK (erp_private.upload_row_allowed(uploaded_by,owning_company_id,owning_branch_id,document_id));
CREATE POLICY f03_upload_select ON public.dms_upload_sessions FOR SELECT TO authenticated USING (true);
CREATE POLICY f03_upload_insert ON public.dms_upload_sessions FOR INSERT TO authenticated WITH CHECK (uploaded_by=public.current_user_profile_id());
CREATE POLICY f03_upload_update ON public.dms_upload_sessions FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
-- No new DELETE grant; soft-delete/recovery lifecycle remains unchanged.

-- Reviewed nullable-parent intake children follow their actual upload session.
-- A forged session ID must never grant access to an existing confidential document.
DO $$ DECLARE t text; p record; u text; c text; BEGIN
 FOREACH t IN ARRAY ARRAY['dms_ai_entity_match_candidates','dms_ai_extraction_jobs','dms_ai_extraction_results','dms_ai_validation_findings','dms_approve_runs','dms_review_queue'] LOOP
  EXECUTE format('ALTER POLICY f03_document_subject ON public.%I USING (CASE WHEN document_id IS NULL THEN erp_private.upload_session_allowed(upload_session_id) ELSE erp_private.document_permission(document_id,%L) END) WITH CHECK (CASE WHEN document_id IS NULL THEN erp_private.upload_session_allowed(upload_session_id) ELSE erp_private.document_permission(document_id,%L) END)',t,
   CASE WHEN t='dms_ai_extraction_results' THEN 'dms.documents.preview' ELSE 'dms.documents.view' END,
   CASE WHEN t='dms_ai_extraction_results' THEN 'dms.documents.preview' ELSE 'dms.documents.view' END);
  FOR p IN SELECT * FROM pg_policies WHERE schemaname='public' AND tablename=t AND permissive='PERMISSIVE' LOOP
   u:=regexp_replace(p.qual,'erp_private.document_permission\(document_id, ''([^'']+)''::text\)', '(CASE WHEN document_id IS NULL THEN erp_private.upload_session_allowed(upload_session_id) AND public.current_user_has_permission(''\1'') ELSE erp_private.document_permission(document_id,''\1'') END)','g');
   c:=regexp_replace(p.with_check,'erp_private.document_permission\(document_id, ''([^'']+)''::text\)', '(CASE WHEN document_id IS NULL THEN erp_private.upload_session_allowed(upload_session_id) AND public.current_user_has_permission(''\1'') ELSE erp_private.document_permission(document_id,''\1'') END)','g');
   EXECUTE format('ALTER POLICY %I ON public.%I%s%s',p.policyname,t,
    CASE WHEN u IS NULL THEN '' ELSE ' USING ('||u||')' END,
    CASE WHEN c IS NULL THEN '' ELSE ' WITH CHECK ('||c||')' END);
  END LOOP;
 END LOOP;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
