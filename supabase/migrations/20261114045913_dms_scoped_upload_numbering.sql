BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';

CREATE TABLE erp_private.dms_scoped_upload_reference_checks (
 reference_id bigint PRIMARY KEY REFERENCES public.global_numbering_generated_references(id)
);
ALTER TABLE erp_private.dms_scoped_upload_reference_checks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON erp_private.dms_scoped_upload_reference_checks FROM PUBLIC,anon,authenticated,service_role;

-- Direct calls to the scoped allocator cannot commit an unattached reservation.
CREATE FUNCTION erp_private.require_consumed_upload_reference()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.global_numbering_generated_references g WHERE g.id=NEW.reference_id
   AND g.target_table_name='dms_documents' AND g.target_record_id IS NOT NULL AND g.generation_status='consumed') THEN
  RAISE EXCEPTION 'DMS upload reference must be consumed with its document' USING ERRCODE='23514';
 END IF;
 RETURN NULL;
END $$;

REVOKE ALL ON FUNCTION erp_private.require_consumed_upload_reference() FROM PUBLIC,anon,authenticated,service_role;

DO $$
DECLARE body text;
BEGIN
 SELECT pg_get_functiondef(oid) INTO body FROM pg_proc
 WHERE oid='erp_private.lock_dms_creation_taxonomy(bigint,bigint,bigint,bigint,text)'::regprocedure
   AND md5(prosrc)='eb54b34280e0df8c3a84ffa4fd8158d3';
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown document taxonomy predecessor'; END IF;
 body:=replace(body,'erp_private.lock_dms_creation_taxonomy(','erp_private.lock_scoped_upload_taxonomy(');
 body:=replace(body,'or not public.current_user_has_permission(''numbering.rules.generate'')','');
 EXECUTE body;
END $$;
REVOKE ALL ON FUNCTION erp_private.lock_scoped_upload_taxonomy(bigint,bigint,bigint,bigint,text) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION erp_private.scoped_upload_reference(p_operation uuid,p_request jsonb,p_document bigint DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor bigint:=public.current_user_profile_id(); source public.dms_upload_sessions; target public.dms_documents;
 g public.global_numbering_generated_references; reason text; session_id bigint; type_id bigint; snapshot jsonb; allocation jsonb;
BEGIN
 IF auth.uid() IS NULL OR actor IS NULL OR NOT erp_private.business_principal_is_active() OR p_operation IS NULL THEN
  RAISE EXCEPTION 'Upload numbering unavailable' USING ERRCODE='42501'; END IF;
 PERFORM erp_private.validate_upload_creation_request(p_request);
 session_id:=(p_request->>'uploadSessionId')::bigint; type_id:=(p_request->>'document_type_id')::bigint;
 IF NOT erp_private.f07_upload_subject_allowed(session_id) THEN RAISE EXCEPTION 'Upload unavailable' USING ERRCODE='42501'; END IF;
 SELECT * INTO source FROM public.dms_upload_sessions WHERE id=session_id AND deleted_at IS NULL FOR UPDATE;
 IF NOT FOUND OR NOT erp_private.f07_upload_subject_allowed(session_id)
  OR NOT erp_private.upload_session_permission(session_id,'dms.documents.upload')
  OR source.status IN ('cancelled','expired') OR source.intake_status IN ('discarded','cancelled','expired') THEN
  RAISE EXCEPTION 'Upload unavailable' USING ERRCODE='42501'; END IF;
 IF source.sha256_hash IS NOT NULL AND lower(source.sha256_hash) IS DISTINCT FROM p_request#>>'{prepared,content_sha256}' THEN
  RAISE EXCEPTION 'Prepared upload context changed' USING ERRCODE='PT409'; END IF;
 reason:='F06 upload creation '||encode(sha256(convert_to(p_request::text,'UTF8')),'hex');
 IF p_document IS NULL THEN
  IF source.document_id IS NULL THEN
   snapshot:=erp_private.upload_creation_snapshot(session_id,type_id,true);
   IF ((p_request->'prepared')-ARRAY['content_sha256','storage_year']) IS DISTINCT FROM snapshot-'storage_year' THEN
    RAISE EXCEPTION 'Prepared upload context changed' USING ERRCODE='PT409'; END IF;
   allocation:=erp_private.numbering_allocate(NULL,'MASTER_DMS_DOCUMENT',NULL,p_operation,
    actor,'reserved','dms_documents',NULL,reason,now());
   PERFORM erp_private.lock_scoped_upload_taxonomy(type_id,(snapshot#>>'{type,category_id}')::bigint,
     source.owning_company_id,source.owning_branch_id,snapshot#>>'{type,default_confidentiality}');
   IF allocation->>'generation_status'='reserved' THEN
    INSERT INTO erp_private.dms_scoped_upload_reference_checks(reference_id) VALUES((allocation->>'id')::bigint) ON CONFLICT DO NOTHING;
   END IF;
   RETURN allocation;
  END IF;
  p_document:=source.document_id;
 END IF;
 SELECT * INTO target FROM public.dms_documents WHERE id=p_document AND created_by=actor AND deleted_at IS NULL;
 IF NOT FOUND OR source.document_id IS DISTINCT FROM target.id
  OR ROW(source.owning_company_id,source.owning_branch_id) IS DISTINCT FROM ROW(target.owning_company_id,target.owning_branch_id)
  OR NOT public.f03_has_document_permission(target.id,'dms.documents.upload')
  OR NOT public.f03_has_document_permission(target.id,'dms.documents.edit')
  OR NOT public.f03_has_document_permission(target.id,'dms.documents.preview') THEN
  RAISE EXCEPTION 'Upload document unavailable' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('f06-numbering:'||actor||':'||p_operation,0));
 SELECT g_row.* INTO g FROM erp_private.numbering_requests n
  JOIN public.global_numbering_generated_references g_row ON g_row.id=n.reference_id
  JOIN public.global_numbering_rules rule ON rule.id=g_row.numbering_rule_id
  WHERE n.actor_id=actor AND n.operation_id=p_operation AND rule.rule_code='MASTER_DMS_DOCUMENT'
    AND g_row.generation_reason=reason AND g_row.generated_reference_number=target.document_no
    AND g_row.target_table_name='dms_documents' AND g_row.generated_by=actor FOR UPDATE OF g_row;
 IF NOT FOUND THEN RAISE EXCEPTION 'Upload reference unavailable' USING ERRCODE='PT409'; END IF;
 IF g.generation_status='consumed' AND g.target_record_id=target.id THEN RETURN erp_private.numbering_result(g,true); END IF;
 IF g.generation_status IS DISTINCT FROM 'reserved' OR g.target_record_id IS NOT NULL THEN
  RAISE EXCEPTION 'Upload reference was already settled' USING ERRCODE='PT409'; END IF;
 UPDATE public.global_numbering_generated_references SET generation_status='consumed',target_record_id=target.id,
  consumed_at=now(),updated_by=actor WHERE id=g.id RETURNING * INTO g;
 INSERT INTO public.audit_logs(actor_user_profile_id,module_code,entity_name,entity_id,entity_reference,action,new_values)
 VALUES(actor,'numbering','global_numbering_generated_references',g.id,g.generated_reference_number,'update',
   jsonb_build_object('status','consumed','operation_id',p_operation,'target_table','dms_documents','target_record',target.id));
 RETURN erp_private.numbering_result(g,false);
END $$;
REVOKE ALL ON FUNCTION erp_private.scoped_upload_reference(uuid,jsonb,bigint) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION erp_private.scoped_upload_reference(uuid,jsonb,bigint) TO authenticated;

CREATE CONSTRAINT TRIGGER dms_scoped_upload_reference_consumed AFTER INSERT ON erp_private.dms_scoped_upload_reference_checks
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION erp_private.require_consumed_upload_reference();

-- Preserve the caller-RLS business writes and the existing receipt and copy checks.
DO $$
DECLARE routine record; body text;
BEGIN
 FOR routine IN SELECT * FROM (VALUES
  ('erp_private.upload_creation_snapshot(bigint,bigint,boolean)','72725788e2db2c1778c83b5907675d33'),
  ('erp_private.numbered_upload_plan(uuid,jsonb,boolean)','3b98139eab4d368479f6e4b655d8c366'),
  ('erp_private.assert_verified_upload_copy(uuid,jsonb,bigint,text,text)','4626c4a6f972da6c29895ec3abc1d6d3'),
  ('erp_private.upload_completion_receipt(uuid,jsonb,bigint,boolean)','2495c4fd9a0f372a3dc6a9aafd37d68a'),
  ('public.finish_numbered_dms_upload(uuid,jsonb,text)','7c1865a5b02630c68415056ffd24b915')
 ) AS v(signature,body_hash) LOOP
  SELECT pg_get_functiondef(oid) INTO body FROM pg_proc WHERE oid=to_regprocedure(routine.signature) AND md5(prosrc)=routine.body_hash;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown numbered upload predecessor %',routine.signature; END IF;
  body:=replace(body,'or not public.current_user_has_permission(''numbering.rules.generate'')','');
  IF routine.signature LIKE 'erp_private.numbered_upload_plan%' THEN
   body:=replace(body,$old$public.allocate_numbering_reference(p_operation,null,'MASTER_DMS_DOCUMENT',null,'reserved','dms_documents',null,
  'F06 upload creation '||encode(sha256(convert_to(p_request::text,'UTF8')),'hex'))$old$,
    'erp_private.scoped_upload_reference(p_operation,p_request)');
   body:=replace(body,$old$public.finish_numbering_reservation(p_operation,'consumed','dms_documents',target,null)$old$,
    'erp_private.scoped_upload_reference(p_operation,p_request,target)');
   body:=replace(body,$old$  perform erp_private.lock_dms_creation_taxonomy((prepared#>>'{type,id}')::bigint,(prepared#>>'{type,category_id}')::bigint,
   s.owning_company_id,s.owning_branch_id,prepared#>>'{type,default_confidentiality}');$old$,'');
   IF body NOT LIKE '%scoped_upload_reference(p_operation,p_request,target)%' OR body NOT LIKE '%scoped_upload_reference(p_operation,p_request)%' THEN
    RAISE EXCEPTION 'Unknown numbering call sites'; END IF;
  END IF;
  EXECUTE body;
 END LOOP;
END $$;
COMMIT;
