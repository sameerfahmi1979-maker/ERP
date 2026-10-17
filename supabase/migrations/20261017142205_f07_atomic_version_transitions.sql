-- F07-T02: one version transition; preserve detached version/history and bytes.
-- Release requires the attachment writer to join this transaction boundary.
BEGIN;
SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='60s';
ALTER TABLE public.dms_document_versions ADD COLUMN unlinked_at timestamptz;
CREATE UNIQUE INDEX f07_one_current_live_version ON public.dms_document_versions(document_id)
 WHERE is_current AND unlinked_at IS NULL;

CREATE FUNCTION erp_private.f07_change_version(p_document bigint,p_version bigint,p_operation text,p_expected_current bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE d public.dms_documents; v public.dms_document_versions; next_version public.dms_document_versions;
 actor bigint; removed integer:=0; changed boolean; at_time timestamptz:=clock_timestamp(); receipt jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT erp_private.business_principal_is_active() OR
  NOT (erp_private.document_permission(p_document,'dms.documents.edit') OR erp_private.document_permission(p_document,'dms.admin')) THEN
  RAISE EXCEPTION 'Version access denied' USING ERRCODE='42501';
 END IF;
 IF p_operation IS NULL OR p_operation NOT IN ('promote','unlink') OR p_document IS NULL OR p_document<=0 OR p_version IS NULL OR p_version<=0 THEN RAISE EXCEPTION 'Invalid version action' USING ERRCODE='22023';END IF;
 SELECT * INTO d FROM public.dms_documents WHERE id=p_document AND deleted_at IS NULL FOR UPDATE;
 IF NOT FOUND OR d.is_archived OR d.status IN ('archived','superseded','deleted') THEN RAISE EXCEPTION 'Document content is not editable' USING ERRCODE='42501';END IF;
 IF NOT (erp_private.document_permission(d.id,'dms.documents.edit') OR erp_private.document_permission(d.id,'dms.admin')) THEN RAISE EXCEPTION 'Version access changed' USING ERRCODE='42501';END IF;
 SELECT * INTO v FROM public.dms_document_versions WHERE id=p_version AND document_id=d.id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Version unavailable' USING ERRCODE='42501';END IF;
 actor:=public.current_user_profile_id();
 IF (p_operation='promote' AND d.current_version_id=v.id AND v.is_current AND v.unlinked_at IS NULL) OR (p_operation='unlink' AND v.unlinked_at IS NOT NULL) THEN
  RETURN jsonb_build_object('documentId',d.id,'versionId',v.id,'operation',p_operation,'filesRemoved',0,'promotedVersionNumber',NULL,'documentHasNoVersion',d.current_version_id IS NULL,'replayed',true);
 END IF;
 IF d.current_version_id IS DISTINCT FROM p_expected_current THEN RAISE EXCEPTION 'Current version changed' USING ERRCODE='PT409';END IF;
 IF d.approval_status='pending_approval' THEN RAISE EXCEPTION 'Withdraw the active approval before changing file versions' USING ERRCODE='PT409';END IF;
 IF p_operation='promote' THEN
  IF v.unlinked_at IS NOT NULL OR NOT EXISTS(SELECT 1 FROM public.dms_document_files f WHERE f.document_id=d.id AND f.version_id=v.id AND f.deleted_at IS NULL AND f.file_role='original') THEN RAISE EXCEPTION 'Version has no available original file' USING ERRCODE='22023';END IF;
  UPDATE public.dms_document_versions SET is_current=false WHERE document_id=d.id AND is_current;
  UPDATE public.dms_document_versions SET is_current=true WHERE id=v.id;
  next_version:=v;
 ELSE
  IF EXISTS(SELECT 1 FROM public.dms_renewal_requests WHERE replacement_version_id=v.id AND deleted_at IS NULL) THEN RAISE EXCEPTION 'Version is referenced by a renewal' USING ERRCODE='PT409';END IF;
  UPDATE public.dms_document_files SET deleted_at=at_time WHERE document_id=d.id AND version_id=v.id AND deleted_at IS NULL;
  GET DIAGNOSTICS removed=ROW_COUNT;
  UPDATE public.dms_document_versions SET is_current=false,unlinked_at=at_time WHERE id=v.id;
  IF d.current_version_id=v.id THEN
   SELECT candidate.* INTO next_version FROM public.dms_document_versions candidate WHERE candidate.document_id=d.id AND candidate.id<>v.id AND candidate.unlinked_at IS NULL
    AND EXISTS(SELECT 1 FROM public.dms_document_files f WHERE f.document_id=d.id AND f.version_id=candidate.id AND f.deleted_at IS NULL AND f.file_role='original')
    ORDER BY candidate.version_number DESC,candidate.id DESC LIMIT 1 FOR UPDATE;
   UPDATE public.dms_document_versions SET is_current=false WHERE document_id=d.id AND is_current;
   IF next_version.id IS NOT NULL THEN UPDATE public.dms_document_versions SET is_current=true WHERE id=next_version.id;END IF;
  ELSE SELECT * INTO next_version FROM public.dms_document_versions WHERE id=d.current_version_id AND document_id=d.id AND unlinked_at IS NULL;
  END IF;
 END IF;
 changed:=d.current_version_id IS DISTINCT FROM next_version.id;
 UPDATE public.dms_documents SET current_version_id=next_version.id,
  approval_status=CASE WHEN changed THEN NULL ELSE approval_status END,
  status=CASE WHEN changed AND approval_status='approved' THEN 'draft' ELSE status END,
  updated_by=actor,updated_at=at_time WHERE id=d.id;
 receipt:=jsonb_build_object('documentId',d.id,'versionId',v.id,'operation',p_operation,'filesRemoved',removed,
  'promotedVersionNumber',CASE WHEN p_operation='unlink' AND d.current_version_id=v.id THEN next_version.version_number ELSE NULL END,
  'documentHasNoVersion',next_version.id IS NULL,'replayed',false);
 INSERT INTO public.dms_document_events(document_id,event_type,description,performed_by,metadata_json)
  VALUES(d.id,CASE p_operation WHEN 'promote' THEN 'current_version_changed' ELSE 'version_unlinked' END,
   CASE p_operation WHEN 'promote' THEN 'Current file version changed' ELSE 'Version unlinked; original metadata and storage retained' END,actor,
   receipt||jsonb_build_object('previous_current_version_id',d.current_version_id,'current_version_id',next_version.id,'approval_invalidated',changed AND d.approval_status='approved'));
 INSERT INTO public.audit_logs(actor_user_profile_id,owner_company_id,branch_id,module_code,entity_name,entity_id,entity_reference,action,new_values)
  VALUES(actor,d.owning_company_id,d.owning_branch_id,'DMS','dms_document_versions',v.id,d.document_no,'update',receipt);
 RETURN receipt;
END $$;
REVOKE ALL ON FUNCTION erp_private.f07_change_version(bigint,bigint,text,bigint) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION erp_private.f07_change_version(bigint,bigint,text,bigint) TO authenticated;
CREATE FUNCTION public.f07_change_document_version(p_document bigint,p_version bigint,p_operation text,p_expected_current bigint)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT erp_private.f07_change_version($1,$2,$3,$4); $$;
REVOKE ALL ON FUNCTION public.f07_change_document_version(bigint,bigint,text,bigint) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.f07_change_document_version(bigint,bigint,text,bigint) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
