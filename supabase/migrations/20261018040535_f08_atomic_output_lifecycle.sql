BEGIN;
SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='60s';

-- Service-attested original-byte identity. No public/client writes or reads.
CREATE TABLE erp_private.f08_pdf_proofs(
 issuance_id bigint PRIMARY KEY REFERENCES public.erp_generated_pdf_documents(id) ON DELETE RESTRICT,
 actor_id bigint NOT NULL REFERENCES public.user_profiles(id), auth_session_id uuid NOT NULL,
 object_id uuid NOT NULL, object_version text NOT NULL, object_updated_at timestamptz NOT NULL,
 sha256 text NOT NULL CHECK(sha256~'^[a-f0-9]{64}$'), size_bytes bigint NOT NULL CHECK(size_bytes BETWEEN 1 AND 33554432),
 renderer_version text NOT NULL, verified_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE erp_private.f08_pdf_proofs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON erp_private.f08_pdf_proofs FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION erp_private.f08_require_issuer(p_id bigint) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE d public.erp_generated_pdf_documents; e public.employees; r public.erp_report_registry; cap text; actor bigint; current_approval boolean;
BEGIN
 IF NOT erp_private.business_principal_is_active() THEN RAISE EXCEPTION 'Active issuer session required' USING ERRCODE='42501'; END IF;
 actor:=public.current_user_profile_id();
 SELECT * INTO d FROM public.erp_generated_pdf_documents WHERE id=p_id;
 IF NOT FOUND OR d.generated_by IS DISTINCT FROM actor OR d.source_record_type IS DISTINCT FROM 'employee' THEN RAISE EXCEPTION 'Issuance unavailable' USING ERRCODE='42501'; END IF;
 SELECT * INTO e FROM public.employees WHERE id=d.source_record_id AND deleted_at IS NULL;
 IF NOT FOUND OR e.owner_company_id IS DISTINCT FROM d.owner_company_id OR NOT public.current_user_can_view_employee(e.id)
   OR NOT erp_private.employee_permission(e.id,'reports.pdf.generate') OR NOT erp_private.employee_permission(e.id,'reports.run') THEN
   RAISE EXCEPTION 'Issuance subject access unavailable' USING ERRCODE='42501'; END IF;
 SELECT * INTO r FROM public.erp_report_registry WHERE report_code=d.output_code AND is_active AND deleted_at IS NULL;
 IF NOT FOUND OR r.document_class IS DISTINCT FROM d.document_class THEN RAISE EXCEPTION 'Output policy changed' USING ERRCODE='PT409'; END IF;
 FOREACH cap IN ARRAY COALESCE(r.required_permissions,ARRAY[]::text[]) LOOP
   IF NOT erp_private.employee_permission(e.id,cap) THEN RAISE EXCEPTION 'Required output access unavailable' USING ERRCODE='42501'; END IF;
 END LOOP;
 IF d.output_code='HR_SALARY_CERT_WITH_AMOUNT' AND NOT erp_private.employee_permission(e.id,'hr.payroll.view') THEN RAISE EXCEPTION 'Sensitive output denied' USING ERRCODE='42501'; END IF;
 IF d.output_code='HR_WARNING_LETTER' AND NOT erp_private.employee_permission(e.id,'hr.confidential.view') THEN RAISE EXCEPTION 'Confidential output denied' USING ERRCODE='42501'; END IF;
 SELECT approval_required INTO current_approval FROM public.erp_output_class_policies WHERE document_class=d.document_class;
 IF NOT FOUND THEN RAISE EXCEPTION 'Output class unavailable' USING ERRCODE='PT409'; END IF;
 IF (current_approval OR COALESCE((d.policy_snapshot_json->>'approvalRequired')::boolean,false))
   AND NOT erp_private.employee_permission(e.id,'reports.pdf.approve') THEN
   RAISE EXCEPTION 'Current output approval access required' USING ERRCODE='42501'; END IF;
 IF d.supersedes_issuance_id IS NOT NULL AND NOT (erp_private.employee_permission(e.id,'reports.pdf.approve') OR erp_private.employee_permission(e.id,'outputs.ops.retry'))
  THEN RAISE EXCEPTION 'Current reissue access required' USING ERRCODE='42501'; END IF;
 RETURN actor;
END $$;
REVOKE ALL ON FUNCTION erp_private.f08_require_issuer(bigint) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION erp_private.f08_require_issuer(bigint) TO authenticated;

CREATE FUNCTION public.f08_output_actor(p_id bigint) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 SELECT jsonb_build_object('actorId',erp_private.f08_require_issuer($1),'authSessionId',auth.jwt()->>'session_id');
$$;
REVOKE ALL ON FUNCTION public.f08_output_actor(bigint) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.f08_output_actor(bigint) TO authenticated;

-- Only the server may attest bytes, after info/download/info identity agreement.
CREATE FUNCTION public.f08_attest_pdf(p_id bigint,p_actor bigint,p_session uuid,p_object uuid,p_version text,p_updated timestamptz,p_sha text,p_size bigint,p_renderer text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE d public.erp_generated_pdf_documents; o storage.objects; prior erp_private.f08_pdf_proofs;
BEGIN
 IF NOT erp_private.provider_actor_session_valid(p_actor,p_session) OR NOT EXISTS(SELECT 1 FROM public.user_profiles WHERE id=p_actor AND status='active' AND NOT must_change_password)
  THEN RAISE EXCEPTION 'Verification session unavailable' USING ERRCODE='42501'; END IF;
 SELECT * INTO d FROM public.erp_generated_pdf_documents WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR d.generated_by IS DISTINCT FROM p_actor OR d.lifecycle_state IS NULL OR d.lifecycle_state NOT IN ('rendering','uploaded','reconciliation_required') OR d.revoked_at IS NOT NULL OR d.archived_at IS NOT NULL
  OR p_sha IS NULL OR p_sha!~'^[a-f0-9]{64}$' OR p_size IS NULL OR p_size NOT BETWEEN 1 AND 33554432 OR nullif(btrim(p_renderer),'') IS NULL THEN
  RAISE EXCEPTION 'Verified original unavailable' USING ERRCODE='PT409'; END IF;
 SELECT * INTO o FROM storage.objects WHERE bucket_id='erp-generated-pdfs' AND name=d.storage_path FOR SHARE;
 IF NOT FOUND OR ROW(o.id,o.version,date_trunc('milliseconds',o.updated_at)) IS DISTINCT FROM ROW(p_object,p_version,p_updated)
  OR o.version IS NULL OR (o.metadata->>'size')::bigint IS DISTINCT FROM p_size OR o.metadata->>'mimetype' IS DISTINCT FROM 'application/pdf' THEN
  RAISE EXCEPTION 'Stored original identity changed' USING ERRCODE='PT409'; END IF;
 SELECT * INTO prior FROM erp_private.f08_pdf_proofs WHERE issuance_id=p_id;
 IF FOUND THEN
  IF ROW(prior.actor_id,prior.object_id,prior.object_version,prior.object_updated_at,prior.sha256,prior.size_bytes)
    IS DISTINCT FROM ROW(p_actor,o.id,o.version,o.updated_at,p_sha,p_size) THEN RAISE EXCEPTION 'Original proof is immutable' USING ERRCODE='PT409'; END IF;
  UPDATE erp_private.f08_pdf_proofs SET auth_session_id=p_session,verified_at=clock_timestamp() WHERE issuance_id=p_id;
 ELSE
  INSERT INTO erp_private.f08_pdf_proofs VALUES(p_id,p_actor,p_session,o.id,o.version,o.updated_at,p_sha,p_size,p_renderer,clock_timestamp());
 END IF;
END $$;
REVOKE ALL ON FUNCTION public.f08_attest_pdf(bigint,bigint,uuid,uuid,text,timestamptz,text,bigint,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.f08_attest_pdf(bigint,bigint,uuid,uuid,text,timestamptz,text,bigint,text) TO service_role;

CREATE FUNCTION erp_private.f08_finalize_output(p_id bigint,p_sha text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE d public.erp_generated_pdf_documents; predecessor public.erp_generated_pdf_documents; proof erp_private.f08_pdf_proofs;
 o storage.objects; actor bigint; old_id bigint; required_serial boolean; reason text; cursor_id bigint; visited bigint[];
BEGIN
 SELECT supersedes_issuance_id INTO old_id FROM public.erp_generated_pdf_documents WHERE id=p_id;
 -- Stable graph lock order, then reread the current row/pointer.
 PERFORM id FROM public.erp_generated_pdf_documents WHERE id=p_id OR id=old_id ORDER BY id FOR UPDATE;
 actor:=erp_private.f08_require_issuer(p_id);
 SELECT * INTO d FROM public.erp_generated_pdf_documents WHERE id=p_id;
 IF d.supersedes_issuance_id IS DISTINCT FROM old_id OR d.id=old_id THEN RAISE EXCEPTION 'Predecessor changed or self-reference' USING ERRCODE='PT409'; END IF;
 IF d.revoked_at IS NOT NULL OR d.archived_at IS NOT NULL OR d.superseded_by_id IS NOT NULL OR d.expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'Original no longer valid' USING ERRCODE='PT409'; END IF;
 IF d.lifecycle_state='issued' AND d.checksum=p_sha THEN RETURN jsonb_build_object('id',d.id,'replayed',true); END IF;
 IF d.lifecycle_state NOT IN ('uploaded','reconciliation_required') THEN RAISE EXCEPTION 'Issuance changed or cancelled' USING ERRCODE='PT409'; END IF;
 SELECT * INTO proof FROM erp_private.f08_pdf_proofs WHERE issuance_id=p_id;
 IF NOT FOUND OR proof.actor_id<>actor OR proof.auth_session_id IS DISTINCT FROM (auth.jwt()->>'session_id')::uuid OR proof.sha256 IS DISTINCT FROM p_sha THEN
   RAISE EXCEPTION 'Trusted original-byte proof required' USING ERRCODE='42501'; END IF;
 SELECT * INTO o FROM storage.objects WHERE bucket_id='erp-generated-pdfs' AND name=d.storage_path FOR SHARE;
 IF NOT FOUND OR ROW(o.id,o.version,o.updated_at) IS DISTINCT FROM ROW(proof.object_id,proof.object_version,proof.object_updated_at)
   OR (o.metadata->>'size')::bigint IS DISTINCT FROM proof.size_bytes OR o.metadata->>'mimetype' IS DISTINCT FROM 'application/pdf' THEN
   RAISE EXCEPTION 'Original object changed before finalization' USING ERRCODE='PT409'; END IF;
 SELECT requires_serial INTO required_serial FROM public.erp_output_class_policies WHERE document_class=d.document_class;
 IF NOT FOUND THEN RAISE EXCEPTION 'Output class unavailable' USING ERRCODE='PT409'; END IF;
 IF (required_serial OR COALESCE((d.policy_snapshot_json->>'requiresSerial')::boolean,false)) AND
   (nullif(btrim(d.serial_no),'') IS NULL OR d.serial_status IS DISTINCT FROM 'reserved') THEN RAISE EXCEPTION 'Reserved serial required' USING ERRCODE='PT409'; END IF;
 IF old_id IS NOT NULL THEN
  -- Published predecessor edges are immutable. Reject a corrupt/cyclic ancestry
  -- rather than extending it or silently repairing historical provenance.
  cursor_id:=old_id; visited:=ARRAY[p_id];
  WHILE cursor_id IS NOT NULL LOOP
   IF cursor_id=ANY(visited) OR cardinality(visited)>1000 THEN RAISE EXCEPTION 'Invalid predecessor ancestry' USING ERRCODE='PT409'; END IF;
   visited:=array_append(visited,cursor_id);
   SELECT supersedes_issuance_id INTO cursor_id FROM public.erp_generated_pdf_documents WHERE id=cursor_id;
   IF NOT FOUND THEN RAISE EXCEPTION 'Missing predecessor ancestry' USING ERRCODE='PT409'; END IF;
  END LOOP;
  SELECT * INTO predecessor FROM public.erp_generated_pdf_documents WHERE id=old_id;
  reason:=btrim(d.data_snapshot_json->>'reissue_reason');
  IF NOT FOUND OR predecessor.lifecycle_state<>'issued' OR predecessor.revoked_at IS NOT NULL OR predecessor.archived_at IS NOT NULL
   OR predecessor.expires_at<=clock_timestamp() OR predecessor.superseded_by_id IS NOT NULL
   OR ROW(predecessor.source_record_type,predecessor.source_record_id,predecessor.owner_company_id,predecessor.output_code)
      IS DISTINCT FROM ROW(d.source_record_type,d.source_record_id,d.owner_company_id,d.output_code)
   OR reason IS NULL OR length(reason) NOT BETWEEN 5 AND 1000 THEN RAISE EXCEPTION 'Predecessor unavailable or incompatible' USING ERRCODE='PT409'; END IF;
  UPDATE public.erp_generated_pdf_documents SET superseded_by_id=p_id WHERE id=old_id;
  UPDATE public.erp_output_public_links SET status='superseded',updated_at=clock_timestamp(),updated_by=actor
   WHERE generated_pdf_document_id=old_id AND status IN ('valid','pending_activation','expired');
 END IF;
 UPDATE public.erp_generated_pdf_documents SET lifecycle_state='issued',checksum=proof.sha256,file_size_bytes=proof.size_bytes,
  checksum_verified_at=clock_timestamp(),renderer_version=proof.renderer_version,issued_at=clock_timestamp(),
  serial_status=CASE WHEN serial_no IS NOT NULL THEN 'issued' ELSE serial_status END WHERE id=p_id;
 INSERT INTO public.audit_logs(actor_user_profile_id,owner_company_id,module_code,entity_name,entity_id,action,new_values)
 VALUES(actor,d.owner_company_id,'reports','erp_generated_pdf_documents',p_id,'update',jsonb_build_object('event','f08_output_finalized','predecessor',old_id,'reason',reason));
 RETURN jsonb_build_object('id',p_id,'replayed',false);
END $$;
REVOKE ALL ON FUNCTION erp_private.f08_finalize_output(bigint,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION erp_private.f08_finalize_output(bigint,text) TO authenticated;
CREATE FUNCTION public.f08_finalize_output(p_id bigint,p_sha text) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT erp_private.f08_finalize_output($1,$2); $$;
REVOKE ALL ON FUNCTION public.f08_finalize_output(bigint,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.f08_finalize_output(bigint,text) TO authenticated;

CREATE FUNCTION erp_private.f08_revoke_output(p_id bigint,p_reason text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE d public.erp_generated_pdf_documents; actor bigint;
BEGIN
 IF NOT erp_private.business_principal_is_active() OR NOT (erp_private.generated_pdf_permission(p_id,'outputs.ops.revoke') OR erp_private.generated_pdf_permission(p_id,'reports.pdf.approve')) THEN RAISE EXCEPTION 'Revocation denied' USING ERRCODE='42501'; END IF;
 IF p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 5 AND 1000 THEN RAISE EXCEPTION 'A meaningful revoke reason is required' USING ERRCODE='22023'; END IF;
 SELECT * INTO d FROM public.erp_generated_pdf_documents WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR d.lifecycle_state<>'issued' THEN RAISE EXCEPTION 'Issued original unavailable' USING ERRCODE='PT409'; END IF;
 -- Recheck authority after a potentially blocking row lock.
 IF NOT erp_private.business_principal_is_active() OR NOT (erp_private.generated_pdf_permission(p_id,'outputs.ops.revoke') OR erp_private.generated_pdf_permission(p_id,'reports.pdf.approve')) THEN RAISE EXCEPTION 'Revocation denied' USING ERRCODE='42501'; END IF;
 actor:=public.current_user_profile_id();
 IF d.revoked_at IS NOT NULL THEN
  IF d.revoke_reason IS DISTINCT FROM btrim(p_reason) THEN RAISE EXCEPTION 'Original already revoked with another reason' USING ERRCODE='PT409'; END IF;
  RETURN jsonb_build_object('id',p_id,'replayed',true);
 END IF;
 UPDATE public.erp_generated_pdf_documents SET revoked_at=clock_timestamp(),revoked_by=actor,revoke_reason=btrim(p_reason) WHERE id=p_id;
 UPDATE public.erp_output_public_links SET status='cancelled',cancelled_at=clock_timestamp(),cancelled_by_user_profile_id=actor,
  cancel_reason=btrim(p_reason),updated_at=clock_timestamp(),updated_by=actor WHERE generated_pdf_document_id=p_id AND status IN ('valid','pending_activation','expired','superseded');
 INSERT INTO public.audit_logs(actor_user_profile_id,owner_company_id,module_code,entity_name,entity_id,action,new_values)
 VALUES(actor,d.owner_company_id,'reports','erp_generated_pdf_documents',p_id,'update',jsonb_build_object('event','f08_output_revoked','reason',btrim(p_reason)));
 RETURN jsonb_build_object('id',p_id,'replayed',false);
END $$;
REVOKE ALL ON FUNCTION erp_private.f08_revoke_output(bigint,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION erp_private.f08_revoke_output(bigint,text) TO authenticated;
CREATE FUNCTION public.f08_revoke_output(p_id bigint,p_reason text) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT erp_private.f08_revoke_output($1,$2); $$;
REVOKE ALL ON FUNCTION public.f08_revoke_output(bigint,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.f08_revoke_output(bigint,text) TO authenticated;

CREATE FUNCTION erp_private.f08_activate_output(p_link bigint) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE link public.erp_output_public_links; d public.erp_generated_pdf_documents;
BEGIN
 SELECT * INTO link FROM public.erp_output_public_links WHERE id=p_link;
 IF NOT FOUND OR link.generated_pdf_document_id IS NULL THEN RAISE EXCEPTION 'Link unavailable' USING ERRCODE='PT409'; END IF;
 PERFORM erp_private.f08_require_issuer(link.generated_pdf_document_id);
 SELECT * INTO d FROM public.erp_generated_pdf_documents WHERE id=link.generated_pdf_document_id FOR UPDATE;
 SELECT * INTO link FROM public.erp_output_public_links WHERE id=p_link FOR UPDATE;
 PERFORM erp_private.f08_require_issuer(d.id);
 IF link.generated_pdf_document_id IS DISTINCT FROM d.id OR d.lifecycle_state IS DISTINCT FROM 'issued' OR d.revoked_at IS NOT NULL OR d.superseded_by_id IS NOT NULL OR d.archived_at IS NOT NULL OR d.expires_at<=clock_timestamp()
  OR link.deleted_at IS NOT NULL OR link.expires_at<=clock_timestamp() OR link.status NOT IN ('pending_activation','valid')
  OR ROW(link.owner_company_id,link.source_entity_type,link.source_entity_id) IS DISTINCT FROM ROW(d.owner_company_id,d.source_record_type,d.source_record_id) THEN
  RAISE EXCEPTION 'Current issued link unavailable' USING ERRCODE='PT409'; END IF;
 IF link.status='valid' THEN RETURN jsonb_build_object('id',p_link,'replayed',true); END IF;
 UPDATE public.erp_output_public_links SET status='valid',updated_at=clock_timestamp(),updated_by=public.current_user_profile_id(),
  verification_summary_json=erp_private.f08_public_fields(verification_summary_json,output_type),
  public_payload_json=erp_private.f08_public_fields(public_payload_json,output_type) WHERE id=p_link;
 RETURN jsonb_build_object('id',p_link,'replayed',false);
END $$;
REVOKE ALL ON FUNCTION erp_private.f08_activate_output(bigint) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION erp_private.f08_activate_output(bigint) TO authenticated;
CREATE FUNCTION public.f08_activate_output(p_link bigint) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT erp_private.f08_activate_output($1); $$;
REVOKE ALL ON FUNCTION public.f08_activate_output(bigint) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.f08_activate_output(bigint) TO authenticated;
COMMIT;
