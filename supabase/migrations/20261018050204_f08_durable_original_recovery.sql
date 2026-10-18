BEGIN;
SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='60s';

-- Private, bounded transient recovery payload. Canonical issued files remain in
-- immutable Storage; the redundant staging payload retires only in the same
-- transaction that proves and issues that canonical original.
CREATE TABLE erp_private.f08_output_operations (
 issuance_id bigint PRIMARY KEY REFERENCES public.erp_generated_pdf_documents(id) ON DELETE RESTRICT,
 binding text NOT NULL, actor_id bigint NOT NULL REFERENCES public.user_profiles(id), serial_no text,
 lease_id uuid, session_id uuid NOT NULL, lease_until timestamptz NOT NULL,
 render_plan jsonb, plan_hash text, pdf_bytes bytea, pdf_sha text, pdf_size bigint, renderer_version text,
 link_id bigint REFERENCES public.erp_output_public_links(id) ON DELETE RESTRICT,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK(render_plan IS NULL OR octet_length(render_plan::text)<=16777216),
 CHECK(pdf_bytes IS NULL OR octet_length(pdf_bytes) BETWEEN 1 AND 33554432),
 CHECK(pdf_sha IS NULL OR pdf_sha~'^[a-f0-9]{64}$')
);
ALTER TABLE erp_private.f08_output_operations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON erp_private.f08_output_operations FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION erp_private.f08_operation_binding(d public.erp_generated_pdf_documents) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT encode(sha256(convert_to(jsonb_build_array(d.id,d.generated_by,d.owner_company_id,d.source_record_type,d.source_record_id,
 d.output_code,d.document_class,d.template_id,d.request_key,d.storage_path,d.file_name,d.content_fingerprint,d.supersedes_issuance_id,
 d.data_snapshot_json,d.branding_snapshot_json,d.policy_snapshot_json,d.generated_at)::text,'UTF8')),'hex');
$$;
REVOKE ALL ON FUNCTION erp_private.f08_operation_binding(public.erp_generated_pdf_documents) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION erp_private.f08_recovery_issuer(p_id bigint) RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor bigint; d public.erp_generated_pdf_documents; company bigint;
BEGIN
 actor:=erp_private.f08_require_issuer(p_id);
 SELECT * INTO d FROM public.erp_generated_pdf_documents WHERE id=p_id;
 IF d.branding_snapshot_json IS NOT NULL AND d.branding_snapshot_json<>'null'::jsonb THEN
  company:=(d.branding_snapshot_json->>'ownerCompanyId')::bigint;
  IF NOT (erp_private.permission_in_scope('reports.view',company,NULL) OR erp_private.permission_in_scope('reports.manage',company,NULL)) THEN RAISE EXCEPTION 'Branding access revoked' USING ERRCODE='42501'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(d.branding_snapshot_json->'assets') a WHERE a->>'type' IN('stamp','signature'))
    AND NOT erp_private.permission_in_scope('reports.sign',company,NULL) THEN RAISE EXCEPTION 'Signing access revoked' USING ERRCODE='42501'; END IF;
 END IF;
 IF EXISTS(SELECT 1 FROM public.erp_report_registry WHERE report_code=d.output_code AND approval_required_override)
  AND NOT erp_private.employee_permission(d.source_record_id,'reports.pdf.approve') THEN RAISE EXCEPTION 'Current registry approval required' USING ERRCODE='42501'; END IF;
 RETURN actor;
END $$;
REVOKE ALL ON FUNCTION erp_private.f08_recovery_issuer(bigint) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION erp_private.f08_recovery_issuer(bigint) TO authenticated;

CREATE FUNCTION erp_private.f08_claim_operation(p_id bigint,p_lease uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE d public.erp_generated_pdf_documents; op erp_private.f08_output_operations; actor bigint; sid uuid; serial text; token text; link bigint; cp public.erp_output_class_policies; expires timestamptz; current_qr text;
BEGIN
 SELECT * INTO d FROM public.erp_generated_pdf_documents WHERE id=p_id FOR UPDATE;
 actor:=erp_private.f08_recovery_issuer(p_id); sid:=(auth.jwt()->>'session_id')::uuid;
 IF p_lease IS NULL OR d.revoked_at IS NOT NULL OR d.archived_at IS NOT NULL OR d.superseded_by_id IS NOT NULL OR d.expires_at<=clock_timestamp()
  OR d.lifecycle_state IN('cancelled','failed_terminal') THEN RAISE EXCEPTION 'Original unavailable for recovery' USING ERRCODE='PT409'; END IF;
 SELECT * INTO op FROM erp_private.f08_output_operations WHERE issuance_id=p_id FOR UPDATE;
 IF NOT FOUND THEN
  IF d.lifecycle_state<>'pending' THEN RAISE EXCEPTION 'Legacy attempt requires explicit reconciliation; no recovery snapshot exists' USING ERRCODE='PT409'; END IF;
  IF nullif(d.request_key,'') IS NULL THEN RAISE EXCEPTION 'Original request identity required' USING ERRCODE='22023'; END IF;
  SELECT * INTO cp FROM public.erp_output_class_policies WHERE document_class=d.document_class;
  IF NOT FOUND THEN RAISE EXCEPTION 'Output class unavailable' USING ERRCODE='PT409'; END IF;
  IF cp.requires_serial OR COALESCE((d.policy_snapshot_json->>'requiresSerial')::boolean,false) THEN
   serial:=d.output_code||'-C'||d.owner_company_id||'-'||to_char(d.generated_at AT TIME ZONE 'UTC','YYYY')||'-'||lpad(d.id::text,greatest(6,length(d.id::text)),'0');
   IF d.serial_no IS NOT NULL AND d.serial_no<>serial THEN RAISE EXCEPTION 'Original serial changed' USING ERRCODE='PT409'; END IF;
   UPDATE public.erp_generated_pdf_documents SET serial_no=serial,serial_status='reserved' WHERE id=p_id;
   d.serial_no:=serial;
  END IF;
  SELECT coalesce(qr_policy_override,cp.qr_policy) INTO current_qr FROM public.erp_report_registry WHERE report_code=d.output_code;
  IF COALESCE((d.data_snapshot_json->'operation'->>'issueQr')::boolean,false) AND COALESCE(d.policy_snapshot_json->>'qrPolicy','none')<>'none' THEN
   IF current_qr IS NULL OR current_qr='none' THEN RAISE EXCEPTION 'Current verification policy requires reconciliation' USING ERRCODE='PT409'; END IF;
   token:=replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');
   IF d.policy_snapshot_json->>'qrPolicy'='days' THEN
    expires:=d.generated_at+make_interval(days=>(d.policy_snapshot_json->>'qrValidityDays')::integer);
    IF expires IS NULL OR expires<=clock_timestamp() THEN RAISE EXCEPTION 'Verification window expired' USING ERRCODE='PT409'; END IF;
   END IF;
   INSERT INTO public.erp_output_public_links(public_token,public_url_path,output_type,source_module,source_entity_type,source_entity_id,owner_company_id,
    document_title,document_ref,access_level,generated_pdf_document_id,status,issued_by_user_profile_id,expires_at,verification_summary_json,public_payload_json,download_enabled)
   VALUES(token,'/verify/'||token,CASE WHEN d.output_code LIKE '%CERT%' THEN 'certificate' ELSE 'letter' END,'HR','employee',d.source_record_id,d.owner_company_id,
    d.file_name,COALESCE(serial,d.file_name),'summary',d.id,'pending_activation',actor,expires,
    jsonb_build_object('document_title',d.file_name,'document_ref',COALESCE(serial,d.file_name)),'{}',false) RETURNING id INTO link;
  END IF;
  INSERT INTO erp_private.f08_output_operations(issuance_id,binding,actor_id,serial_no,lease_id,session_id,lease_until,link_id)
   VALUES(p_id,erp_private.f08_operation_binding(d),actor,d.serial_no,p_lease,sid,clock_timestamp()+interval '180 seconds',link) RETURNING * INTO op;
 ELSE
  IF op.binding IS DISTINCT FROM erp_private.f08_operation_binding(d) OR op.actor_id<>actor OR op.serial_no IS DISTINCT FROM d.serial_no THEN RAISE EXCEPTION 'Original command or snapshot changed' USING ERRCODE='PT409'; END IF;
  IF op.lease_id IS DISTINCT FROM p_lease AND op.lease_until>clock_timestamp() THEN RAISE EXCEPTION 'Original request is already being processed' USING ERRCODE='PT409'; END IF;
  UPDATE erp_private.f08_output_operations SET lease_id=p_lease,session_id=sid,lease_until=clock_timestamp()+interval '180 seconds',updated_at=clock_timestamp() WHERE issuance_id=p_id RETURNING * INTO op;
 END IF;
 IF d.lifecycle_state<>'issued' THEN UPDATE public.erp_generated_pdf_documents SET lifecycle_state=CASE WHEN op.pdf_sha IS NULL THEN 'rendering' ELSE 'reconciliation_required' END WHERE id=p_id; END IF;
 RETURN jsonb_build_object('id',p_id,'actorId',actor,'sessionId',sid,'leaseId',p_lease);
END $$;
REVOKE ALL ON FUNCTION erp_private.f08_claim_operation(bigint,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION erp_private.f08_claim_operation(bigint,uuid) TO authenticated;
CREATE FUNCTION public.f08_claim_operation(p_id bigint,p_lease uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT erp_private.f08_claim_operation($1,$2); $$;
REVOKE ALL ON FUNCTION public.f08_claim_operation(bigint,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.f08_claim_operation(bigint,uuid) TO authenticated;

CREATE FUNCTION erp_private.f08_service_operation(p_id bigint,p_lease uuid,p_actor bigint,p_session uuid) RETURNS erp_private.f08_output_operations
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE d public.erp_generated_pdf_documents; op erp_private.f08_output_operations;
BEGIN
 SELECT * INTO d FROM public.erp_generated_pdf_documents WHERE id=p_id FOR UPDATE;
 SELECT * INTO op FROM erp_private.f08_output_operations WHERE issuance_id=p_id FOR UPDATE;
 IF NOT FOUND OR op.lease_id IS DISTINCT FROM p_lease OR op.actor_id IS DISTINCT FROM p_actor OR op.session_id IS DISTINCT FROM p_session
  OR op.lease_until<=clock_timestamp() OR NOT erp_private.provider_actor_session_valid(p_actor,p_session)
  OR NOT EXISTS(SELECT 1 FROM public.user_profiles WHERE id=p_actor AND status='active' AND NOT must_change_password)
  OR d.generated_by IS DISTINCT FROM p_actor OR op.binding IS DISTINCT FROM erp_private.f08_operation_binding(d) OR op.serial_no IS DISTINCT FROM d.serial_no
  OR d.lifecycle_state IN('cancelled','failed_terminal') OR d.revoked_at IS NOT NULL OR d.archived_at IS NOT NULL OR d.superseded_by_id IS NOT NULL OR d.expires_at<=clock_timestamp() THEN
  RAISE EXCEPTION 'Recovery lease or original identity unavailable' USING ERRCODE='PT409'; END IF;
 RETURN op;
END $$;
REVOKE ALL ON FUNCTION erp_private.f08_service_operation(bigint,uuid,bigint,uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.f08_read_operation(p_id bigint,p_lease uuid,p_actor bigint,p_session uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE op erp_private.f08_output_operations; d public.erp_generated_pdf_documents; link public.erp_output_public_links;
BEGIN
 op:=erp_private.f08_service_operation(p_id,p_lease,p_actor,p_session);
 SELECT * INTO d FROM public.erp_generated_pdf_documents WHERE id=p_id;
 SELECT * INTO link FROM public.erp_output_public_links WHERE id=op.link_id;
 RETURN jsonb_build_object('document',jsonb_build_object('id',d.id,'lifecycle_state',d.lifecycle_state,'storage_path',d.storage_path,'file_name',d.file_name,
  'checksum',d.checksum,'file_size_bytes',d.file_size_bytes,'serial_no',d.serial_no,'output_code',d.output_code,'source_record_id',d.source_record_id,'supersedes_issuance_id',d.supersedes_issuance_id,
  'data_snapshot_json',d.data_snapshot_json,'policy_snapshot_json',d.policy_snapshot_json,'template_id',d.template_id,'branding_snapshot_json',d.branding_snapshot_json,'generated_at',d.generated_at),'plan',op.render_plan,
  'pdf',CASE WHEN op.pdf_bytes IS NOT NULL THEN encode(op.pdf_bytes,'base64') END,'sha',op.pdf_sha,'size',op.pdf_size,'renderer',op.renderer_version,
  'link',CASE WHEN link.id IS NOT NULL THEN jsonb_build_object('id',link.id,'token',link.public_token,'status',link.status) END);
END $$;
REVOKE ALL ON FUNCTION public.f08_read_operation(bigint,uuid,bigint,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.f08_read_operation(bigint,uuid,bigint,uuid) TO service_role;

CREATE FUNCTION public.f08_checkpoint_operation(p_id bigint,p_lease uuid,p_actor bigint,p_session uuid,p_plan jsonb DEFAULT NULL,p_pdf text DEFAULT NULL,p_renderer text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE op erp_private.f08_output_operations; bytes bytea; digest text;
BEGIN
 op:=erp_private.f08_service_operation(p_id,p_lease,p_actor,p_session);
 IF EXISTS(SELECT 1 FROM public.erp_generated_pdf_documents WHERE id=p_id AND lifecycle_state='issued') THEN RAISE EXCEPTION 'Issued checkpoints are immutable' USING ERRCODE='PT409'; END IF;
 IF p_plan IS NOT NULL THEN
  IF octet_length(p_plan::text)>16777216 OR jsonb_typeof(p_plan)<>'object' OR nullif(p_plan->>'html','') IS NULL THEN RAISE EXCEPTION 'Invalid bounded render plan' USING ERRCODE='22023'; END IF;
  IF op.render_plan IS NOT NULL AND op.render_plan IS DISTINCT FROM p_plan THEN RAISE EXCEPTION 'Render plan is immutable' USING ERRCODE='PT409'; END IF;
  UPDATE erp_private.f08_output_operations SET render_plan=p_plan,plan_hash=encode(sha256(convert_to(p_plan::text,'UTF8')),'hex'),updated_at=clock_timestamp() WHERE issuance_id=p_id;
 END IF;
 IF p_pdf IS NOT NULL THEN
  IF op.render_plan IS NULL AND p_plan IS NULL THEN RAISE EXCEPTION 'Frozen render plan required' USING ERRCODE='PT409'; END IF;
  IF length(p_pdf)>44739244 THEN RAISE EXCEPTION 'Rendered checkpoint exceeds bounds' USING ERRCODE='22023'; END IF;
  bytes:=decode(p_pdf,'base64'); digest:=encode(sha256(bytes),'hex');
  IF octet_length(bytes) NOT BETWEEN 1 AND 33554432 OR substring(bytes FROM 1 FOR 5)<>convert_to('%PDF-','UTF8') OR nullif(btrim(p_renderer),'') IS NULL THEN RAISE EXCEPTION 'Invalid PDF checkpoint' USING ERRCODE='22023'; END IF;
  IF op.pdf_sha IS NOT NULL AND ROW(op.pdf_sha,op.pdf_size,op.renderer_version) IS DISTINCT FROM ROW(digest,octet_length(bytes)::bigint,p_renderer) THEN RAISE EXCEPTION 'Rendered bytes are immutable' USING ERRCODE='PT409'; END IF;
  UPDATE erp_private.f08_output_operations SET pdf_bytes=bytes,pdf_sha=digest,pdf_size=octet_length(bytes),renderer_version=p_renderer,updated_at=clock_timestamp() WHERE issuance_id=p_id;
 END IF;
 RETURN jsonb_build_object('id',p_id);
END $$;
REVOKE ALL ON FUNCTION public.f08_checkpoint_operation(bigint,uuid,bigint,uuid,jsonb,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.f08_checkpoint_operation(bigint,uuid,bigint,uuid,jsonb,text,text) TO service_role;

-- Retain the already-tested implementation privately. Managed operations cannot
-- bypass lease fencing through the old public finalization entry point.
ALTER FUNCTION erp_private.f08_finalize_output(bigint,text) RENAME TO f08_finalize_original;
REVOKE ALL ON FUNCTION erp_private.f08_finalize_original(bigint,text) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION erp_private.f08_finalize_output(p_id bigint,p_sha text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM erp_private.f08_output_operations WHERE issuance_id=p_id) THEN RAISE EXCEPTION 'Managed operation requires fenced finalization' USING ERRCODE='42501'; END IF;
 RETURN erp_private.f08_finalize_original(p_id,p_sha);
END $$;
REVOKE ALL ON FUNCTION erp_private.f08_finalize_output(bigint,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION erp_private.f08_finalize_output(bigint,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.f08_finalize_output(p_id bigint,p_sha text) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT erp_private.f08_finalize_output($1,$2); $$;

CREATE FUNCTION erp_private.f08_finish_operation(p_id bigint,p_lease uuid,p_sha text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE op erp_private.f08_output_operations; actor bigint; old_id bigint; result jsonb;
BEGIN
 SELECT supersedes_issuance_id INTO old_id FROM public.erp_generated_pdf_documents WHERE id=p_id;
 PERFORM id FROM public.erp_generated_pdf_documents WHERE id=p_id OR id=old_id ORDER BY id FOR UPDATE;
 actor:=erp_private.f08_recovery_issuer(p_id);
 op:=erp_private.f08_service_operation(p_id,p_lease,actor,(auth.jwt()->>'session_id')::uuid);
 IF op.pdf_sha IS DISTINCT FROM p_sha OR op.pdf_sha IS NULL THEN RAISE EXCEPTION 'Original rendered checkpoint required' USING ERRCODE='PT409'; END IF;
 UPDATE public.erp_generated_pdf_documents SET lifecycle_state='reconciliation_required' WHERE id=p_id AND lifecycle_state IN('rendering','failed_retryable');
 result:=erp_private.f08_finalize_original(p_id,p_sha);
 -- Canonical original has been proved and committed. Retire only redundant
 -- transient payload, retaining hashes, source/brand snapshots and operation.
 UPDATE erp_private.f08_output_operations SET render_plan=NULL,pdf_bytes=NULL,updated_at=clock_timestamp() WHERE issuance_id=p_id;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION erp_private.f08_finish_operation(bigint,uuid,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION erp_private.f08_finish_operation(bigint,uuid,text) TO authenticated;
CREATE FUNCTION public.f08_finish_operation(p_id bigint,p_lease uuid,p_sha text) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT erp_private.f08_finish_operation($1,$2,$3); $$;
REVOKE ALL ON FUNCTION public.f08_finish_operation(bigint,uuid,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.f08_finish_operation(bigint,uuid,text) TO authenticated;

CREATE FUNCTION erp_private.f08_end_operation(p_id bigint,p_lease uuid,p_cancel boolean,p_reason text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE d public.erp_generated_pdf_documents; op erp_private.f08_output_operations; actor bigint;
BEGIN
 SELECT * INTO d FROM public.erp_generated_pdf_documents WHERE id=p_id FOR UPDATE;
 actor:=erp_private.f08_recovery_issuer(p_id);
 SELECT * INTO op FROM erp_private.f08_output_operations WHERE issuance_id=p_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Original recovery operation unavailable' USING ERRCODE='PT409'; END IF;
 IF p_cancel THEN
  IF NOT erp_private.generated_pdf_permission(p_id,'outputs.ops.retry') THEN RAISE EXCEPTION 'Cancellation denied' USING ERRCODE='42501'; END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 5 AND 1000 THEN RAISE EXCEPTION 'Meaningful cancellation reason required' USING ERRCODE='22023'; END IF;
  IF d.lifecycle_state='cancelled' THEN RETURN jsonb_build_object('id',p_id,'replayed',true); END IF;
  IF d.lifecycle_state='issued' THEN RAISE EXCEPTION 'Issued documents require revocation' USING ERRCODE='PT409'; END IF;
  UPDATE public.erp_generated_pdf_documents SET lifecycle_state='cancelled',cancelled_at=clock_timestamp(),serial_status=CASE WHEN serial_no IS NOT NULL THEN 'voided' ELSE serial_status END,
   serial_void_reason=CASE WHEN serial_no IS NOT NULL THEN btrim(p_reason) ELSE serial_void_reason END WHERE id=p_id;
  UPDATE public.erp_output_public_links SET status='cancelled',updated_at=clock_timestamp(),updated_by=actor WHERE generated_pdf_document_id=p_id AND status='pending_activation';
  INSERT INTO public.audit_logs(actor_user_profile_id,owner_company_id,module_code,entity_name,entity_id,action,new_values)
   VALUES(actor,d.owner_company_id,'reports','erp_generated_pdf_documents',p_id,'update',jsonb_build_object('event','f08_operation_cancelled','reason',btrim(p_reason)));
 ELSE
  IF op.lease_id IS DISTINCT FROM p_lease OR op.session_id IS DISTINCT FROM (auth.jwt()->>'session_id')::uuid THEN RAISE EXCEPTION 'Stale recovery lease' USING ERRCODE='PT409'; END IF;
  UPDATE public.erp_generated_pdf_documents SET lifecycle_state=CASE WHEN op.pdf_sha IS NULL THEN 'failed_retryable' ELSE 'reconciliation_required' END,
   failure_reason='Original request retained for recovery',failed_at=clock_timestamp() WHERE id=p_id AND lifecycle_state NOT IN('issued','cancelled','failed_terminal');
 END IF;
 UPDATE erp_private.f08_output_operations SET lease_id=NULL,lease_until=clock_timestamp(),updated_at=clock_timestamp() WHERE issuance_id=p_id;
 RETURN jsonb_build_object('id',p_id);
END $$;
REVOKE ALL ON FUNCTION erp_private.f08_end_operation(bigint,uuid,boolean,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION erp_private.f08_end_operation(bigint,uuid,boolean,text) TO authenticated;
CREATE FUNCTION public.f08_end_operation(p_id bigint,p_lease uuid,p_cancel boolean DEFAULT false,p_reason text DEFAULT NULL) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT erp_private.f08_end_operation($1,$2,$3,$4); $$;
REVOKE ALL ON FUNCTION public.f08_end_operation(bigint,uuid,boolean,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.f08_end_operation(bigint,uuid,boolean,text) TO authenticated;
COMMIT;
