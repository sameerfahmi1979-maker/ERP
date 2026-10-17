-- Original upload subjects stay authoritative before a document link exists.
-- These are restrictive fences, not replacements for F03's DMS/company rules.
BEGIN;
SET LOCAL lock_timeout='5s';SET LOCAL statement_timeout='60s';
CREATE FUNCTION erp_private.f07_upload_subject_allowed(p_session bigint) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE s public.dms_upload_sessions;b public.dms_upload_batches;kind text;subject bigint;employee bigint;company bigint;branch bigint;
BEGIN
 IF auth.uid() IS NULL OR NOT erp_private.business_principal_is_active() OR NOT erp_private.upload_session_allowed(p_session) THEN RETURN false;END IF;
 SELECT * INTO s FROM public.dms_upload_sessions WHERE id=p_session AND deleted_at IS NULL;
 IF NOT FOUND THEN RETURN false;END IF;
 IF public.current_user_is_global_admin() THEN RETURN true;END IF;
 kind:=s.origin_entity_type;subject:=s.origin_entity_id;
 IF kind IS NULL AND s.batch_id IS NOT NULL THEN
  SELECT * INTO b FROM public.dms_upload_batches WHERE id=s.batch_id AND deleted_at IS NULL;
  IF NOT FOUND OR ROW(b.owning_company_id,b.owning_branch_id) IS DISTINCT FROM ROW(s.owning_company_id,s.owning_branch_id) THEN RETURN false;END IF;
  kind:=b.entity_type;subject:=b.entity_id;
 END IF;
 IF kind IS NULL THEN RETURN true;END IF; -- explicit original generic intake only
 CASE kind
  WHEN 'employee' THEN employee:=subject;
  WHEN 'employee_dependent' THEN
   SELECT employee_id INTO employee FROM public.employee_dependents WHERE id=subject AND is_active AND deleted_at IS NULL;
   IF employee IS NULL OR NOT erp_private.employee_permission(employee,'hr.compliance.view') THEN RETURN false;END IF;
  WHEN 'company' THEN SELECT id,NULL::bigint INTO company,branch FROM public.owner_companies WHERE id=subject AND status='active';
  WHEN 'branch' THEN SELECT owner_company_id,id INTO company,branch FROM public.branches WHERE id=subject AND status='active';
  WHEN 'site' THEN
   IF NOT (public.current_user_has_permission('common_md.view') OR public.current_user_has_permission('common_md.work_sites.view')) THEN RETURN false;END IF;
   SELECT owner_company_id,branch_id INTO company,branch FROM public.work_sites WHERE id=subject AND status='active' AND deleted_at IS NULL;
  WHEN 'party' THEN RETURN (public.current_user_has_permission('master_data.parties.view') OR public.current_user_has_permission('master_data.party_master.view'))
   AND EXISTS(SELECT 1 FROM public.parties WHERE id=subject AND is_active AND NOT is_locked);
  ELSE RETURN false;
 END CASE;
 IF employee IS NOT NULL THEN
  IF NOT public.current_user_can_view_employee(employee) THEN RETURN false;END IF;
  SELECT owner_company_id,branch_id INTO company,branch FROM public.employees WHERE id=employee AND deleted_at IS NULL;
 END IF;
 RETURN company IS NOT NULL AND ROW(company,branch) IS NOT DISTINCT FROM ROW(s.owning_company_id,s.owning_branch_id);
END $$;
REVOKE ALL ON FUNCTION erp_private.f07_upload_subject_allowed(bigint) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION erp_private.f07_upload_subject_allowed(bigint) TO authenticated;
-- Trusted source preparation is itself a definer boundary. Apply the same
-- original-subject read fence there, not only to ordinary table reads.
DO $$DECLARE body text;needle text:=' RETURN erp_private.f07_intake_source_row(s);';BEGIN
 SELECT pg_get_functiondef('erp_private.f07_intake_source(bigint)'::regprocedure) INTO body;
 IF (length(body)-length(replace(body,needle,'')))/length(needle)<>1 THEN RAISE EXCEPTION 'Original-subject preparation requires source reconciliation';END IF;
 EXECUTE replace(body,needle,' IF NOT erp_private.f07_upload_subject_allowed(p_session) THEN RAISE EXCEPTION ''Original upload subject read access denied'' USING ERRCODE=''42501'';END IF;'||E'\n'||needle);
END $$;
CREATE POLICY f07_original_upload_subject_read ON public.dms_upload_sessions AS RESTRICTIVE FOR SELECT TO authenticated
 USING(erp_private.f07_upload_subject_allowed(id));
CREATE POLICY f07_original_upload_subject_update ON public.dms_upload_sessions AS RESTRICTIVE FOR UPDATE TO authenticated
 USING(erp_private.f07_upload_subject_allowed(id)) WITH CHECK(erp_private.f07_upload_subject_allowed(id));
CREATE POLICY f07_original_upload_subject_delete ON public.dms_upload_sessions AS RESTRICTIVE FOR DELETE TO authenticated
 USING(erp_private.f07_upload_subject_allowed(id));
-- Fence every existing DMS child with this original foreign key, including AI
-- text/results/review fields. Otherwise a definer subject helper could bypass
-- the parent table's new policy. No other application's tables are touched.
DO $$DECLARE t record;BEGIN
 FOR t IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  JOIN pg_attribute a ON a.attrelid=c.oid AND a.attname='upload_session_id' AND NOT a.attisdropped
  WHERE n.nspname='public' AND c.relkind='r' AND c.relrowsecurity AND c.relname LIKE 'dms\_%' ESCAPE '\' AND c.relname<>'dms_upload_sessions' ORDER BY c.relname LOOP
  EXECUTE format('CREATE POLICY f07_original_upload_subject ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING(upload_session_id IS NULL OR erp_private.f07_upload_subject_allowed(upload_session_id)) WITH CHECK(upload_session_id IS NULL OR erp_private.f07_upload_subject_allowed(upload_session_id))',t.relname);
 END LOOP;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
