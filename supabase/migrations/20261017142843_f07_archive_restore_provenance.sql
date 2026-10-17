-- F07-T05: archive is a reversible visibility transition, not deletion or renewal.
BEGIN;
SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='60s';
CREATE TABLE erp_private.f07_archive_provenance(
 document_id bigint PRIMARY KEY REFERENCES public.dms_documents(id) ON DELETE CASCADE,
 previous_status text NOT NULL, previous_approval text, version_id bigint,
 archived_at timestamptz NOT NULL, archived_by bigint NOT NULL, restored_at timestamptz
);
ALTER TABLE erp_private.f07_archive_provenance ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON erp_private.f07_archive_provenance FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION erp_private.f07_archive_document(p_document bigint,p_archive boolean,p_expected timestamptz)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE d public.dms_documents; provenance erp_private.f07_archive_provenance;
 actor bigint; at_time timestamptz:=clock_timestamp(); receipt jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT erp_private.business_principal_is_active() OR
  NOT (erp_private.document_permission(p_document,'dms.documents.archive') OR erp_private.document_permission(p_document,'dms.admin')) OR
  NOT (erp_private.document_permission(p_document,'dms.documents.edit') OR erp_private.document_permission(p_document,'dms.admin')) THEN
  RAISE EXCEPTION 'Archive access denied' USING ERRCODE='42501';END IF;
 IF p_archive IS NULL OR p_expected IS NULL THEN RAISE EXCEPTION 'Archive request is incomplete' USING ERRCODE='22023';END IF;
 SELECT * INTO d FROM public.dms_documents WHERE id=p_document AND deleted_at IS NULL FOR UPDATE;
 IF NOT FOUND OR NOT (erp_private.document_permission(d.id,'dms.documents.archive') OR erp_private.document_permission(d.id,'dms.admin')) THEN
  RAISE EXCEPTION 'Document unavailable' USING ERRCODE='42501';END IF;
 IF d.status IN ('superseded','deleted') OR d.superseded_by_document_id IS NOT NULL THEN
  RAISE EXCEPTION 'A superseded document is historical; it cannot be restored as current' USING ERRCODE='PT409';END IF;
 IF EXISTS(SELECT 1 FROM public.dms_renewal_requests r WHERE r.document_id=d.id AND r.deleted_at IS NULL AND r.status='renewed') THEN
  RAISE EXCEPTION 'Completed renewal history cannot be restored as current' USING ERRCODE='PT409';END IF;
 SELECT * INTO provenance FROM erp_private.f07_archive_provenance WHERE document_id=d.id;
 IF (p_archive AND d.is_archived AND d.status='archived') OR (NOT p_archive AND NOT d.is_archived AND provenance.restored_at IS NOT NULL) THEN
  RETURN jsonb_build_object('documentId',d.id,'archived',d.is_archived,'status',d.status,'replayed',true);
 END IF;
 IF d.updated_at IS DISTINCT FROM p_expected THEN RAISE EXCEPTION 'Document changed before archive action' USING ERRCODE='PT409';END IF;
 IF d.approval_status='pending_approval' THEN RAISE EXCEPTION 'Withdraw the active approval before archiving' USING ERRCODE='PT409';END IF;
 actor:=public.current_user_profile_id();
 IF p_archive THEN
  IF d.is_archived OR d.status='archived' THEN RAISE EXCEPTION 'Archive state requires reconciliation' USING ERRCODE='PT409';END IF;
  INSERT INTO erp_private.f07_archive_provenance(document_id,previous_status,previous_approval,version_id,archived_at,archived_by)
   VALUES(d.id,d.status,d.approval_status,d.current_version_id,at_time,actor)
   ON CONFLICT(document_id) DO UPDATE SET previous_status=excluded.previous_status,previous_approval=excluded.previous_approval,
    version_id=excluded.version_id,archived_at=excluded.archived_at,archived_by=excluded.archived_by,restored_at=NULL;
  UPDATE public.dms_documents SET is_archived=true,status='archived',archived_at=at_time,updated_at=at_time,updated_by=actor WHERE id=d.id;
 ELSE
  IF NOT d.is_archived OR d.status<>'archived' OR provenance.document_id IS NULL OR provenance.restored_at IS NOT NULL THEN
   RAISE EXCEPTION 'Original archive state is not verified; review historical provenance before restoring' USING ERRCODE='PT409';END IF;
  IF ROW(d.approval_status,d.current_version_id) IS DISTINCT FROM ROW(provenance.previous_approval,provenance.version_id) THEN
   RAISE EXCEPTION 'Archived content or approval changed; review before restoring' USING ERRCODE='PT409';END IF;
  UPDATE public.dms_documents SET is_archived=false,status=provenance.previous_status,archived_at=NULL,updated_at=at_time,updated_by=actor WHERE id=d.id;
  UPDATE erp_private.f07_archive_provenance SET restored_at=at_time WHERE document_id=d.id;
 END IF;
 SELECT * INTO d FROM public.dms_documents WHERE id=d.id;
 receipt:=jsonb_build_object('documentId',d.id,'archived',d.is_archived,'status',d.status,'replayed',false);
 INSERT INTO public.dms_document_events(document_id,event_type,description,performed_by,metadata_json)
  VALUES(d.id,CASE WHEN p_archive THEN 'archived' ELSE 'unarchived' END,
   CASE WHEN p_archive THEN 'Document archived; content and approval retained' ELSE 'Document restored to its verified pre-archive state' END,actor,receipt);
 INSERT INTO public.audit_logs(actor_user_profile_id,owner_company_id,branch_id,module_code,entity_name,entity_id,entity_reference,action,new_values)
  VALUES(actor,d.owning_company_id,d.owning_branch_id,'DMS','dms_documents',d.id,d.document_no,CASE WHEN p_archive THEN 'archive' ELSE 'unarchive' END,receipt);
 RETURN receipt;
END $$;
REVOKE ALL ON FUNCTION erp_private.f07_archive_document(bigint,boolean,timestamptz) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION erp_private.f07_archive_document(bigint,boolean,timestamptz) TO authenticated;
CREATE FUNCTION public.f07_archive_document(p_document bigint,p_archive boolean,p_expected timestamptz)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT erp_private.f07_archive_document($1,$2,$3); $$;
REVOKE ALL ON FUNCTION public.f07_archive_document(bigint,boolean,timestamptz) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.f07_archive_document(bigint,boolean,timestamptz) TO authenticated;
CREATE FUNCTION erp_private.f07_guard_archive_fields() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF current_user IN ('authenticated','anon','service_role') AND
  ROW(NEW.is_archived,NEW.archived_at,NEW.superseded_by_document_id) IS DISTINCT FROM ROW(OLD.is_archived,OLD.archived_at,OLD.superseded_by_document_id) THEN
  RAISE EXCEPTION 'Use the checked archive or renewal action' USING ERRCODE='42501';END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION erp_private.f07_guard_archive_fields() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER f07_guard_archive_fields BEFORE UPDATE ON public.dms_documents FOR EACH ROW EXECUTE FUNCTION erp_private.f07_guard_archive_fields();
NOTIFY pgrst,'reload schema';
COMMIT;
