BEGIN;
SET LOCAL search_path = pg_catalog;
SET LOCAL lock_timeout = '5s';

-- The general allocator still requires a global grant. These two consumers
-- use the existing DMS sequence, operation lock, and allocation hash.
CREATE FUNCTION erp_private.consume_dms_intake_reference(p_operation uuid, p_reason text, p_document bigint)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  actor bigint := public.current_user_profile_id();
  reference public.global_numbering_generated_references;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('f06-numbering:'||actor||':'||p_operation,0));
  SELECT g.* INTO reference
  FROM erp_private.numbering_requests n
  JOIN public.global_numbering_generated_references g ON g.id=n.reference_id
  JOIN public.global_numbering_rules r ON r.id=g.numbering_rule_id
  JOIN public.dms_documents d ON d.id=p_document AND d.document_no=g.generated_reference_number
  WHERE n.actor_id=actor AND n.operation_id=p_operation AND g.generated_by=actor
    AND g.target_table_name='dms_documents' AND g.generation_reason=p_reason
    AND r.rule_code='MASTER_DMS_DOCUMENT' AND d.created_by=actor AND d.deleted_at IS NULL
    AND n.request_hash=md5(jsonb_build_array(NULL::bigint,'MASTER_DMS_DOCUMENT'::text,NULL::text,
      'reserved'::text,'dms_documents'::text,NULL::bigint,p_reason)::text)
  FOR UPDATE OF g;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Intake reference unavailable' USING ERRCODE = '42501';
  END IF;
  IF reference.generation_status='consumed' AND reference.target_record_id=p_document THEN
    RETURN;
  END IF;
  IF reference.generation_status IS DISTINCT FROM 'reserved' OR reference.target_record_id IS NOT NULL THEN
    RAISE EXCEPTION 'Intake reference was already settled' USING ERRCODE = 'PT409';
  END IF;
  UPDATE public.global_numbering_generated_references
  SET generation_status='consumed',target_record_id=p_document,consumed_at=now(),updated_by=actor
  WHERE id=reference.id;
  INSERT INTO public.audit_logs(actor_user_profile_id,module_code,entity_name,entity_id,entity_reference,action,new_values)
  VALUES(actor,'numbering','global_numbering_generated_references',reference.id,reference.generated_reference_number,'update',
    jsonb_build_object('status','consumed','operation_id',p_operation,'target_table','dms_documents','target_record',p_document));
END $$;
REVOKE ALL ON FUNCTION erp_private.consume_dms_intake_reference(uuid,text,bigint) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION erp_private.scoped_batch_draft_reference(p_operation uuid, p_request jsonb, p_document bigint DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  actor bigint := public.current_user_profile_id();
  session_id bigint := (p_request->>'uploadSessionId')::bigint;
  source public.dms_upload_sessions;
  batch public.dms_upload_batches;
  reason text := 'F06 batch draft creation '||encode(sha256(convert_to(p_request::text,'UTF8')),'hex');
  allocation jsonb;
BEGIN
  IF auth.uid() IS NULL OR actor IS NULL OR p_operation IS NULL OR NOT erp_private.business_principal_is_active()
    OR NOT erp_private.f07_upload_subject_allowed(session_id)
    OR NOT erp_private.upload_session_permission(session_id,'dms.documents.upload') THEN
    RAISE EXCEPTION 'Batch draft numbering unavailable' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO source FROM public.dms_upload_sessions WHERE id=session_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND OR NOT erp_private.f07_upload_subject_allowed(session_id)
    OR NOT erp_private.upload_session_permission(session_id,'dms.documents.upload') THEN
    RAISE EXCEPTION 'Batch draft numbering unavailable' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO batch FROM public.dms_upload_batches WHERE id=source.batch_id;
  IF NOT FOUND OR NOT erp_private.batch_scope_allowed(batch.created_by,source.owning_company_id,source.owning_branch_id) THEN
    RAISE EXCEPTION 'Batch draft numbering unavailable' USING ERRCODE = '42501';
  END IF;
  IF source.batch_draft_operation_id IS NOT NULL AND (
    source.batch_draft_operation_id IS DISTINCT FROM p_operation OR NOT EXISTS (
      SELECT 1 FROM erp_private.dms_batch_draft_preparations seal
      WHERE seal.upload_session_id=source.id AND seal.draft_operation_id=p_operation
        AND seal.profile_id=actor AND seal.auth_user_id=auth.uid()
        AND seal.batch_id=batch.id AND seal.admission_operation_id=batch.admission_operation_id
        AND seal.admission_fingerprint=batch.admission_fingerprint AND seal.admission_position=source.admission_position
        AND seal.request_json=p_request)) THEN
    RAISE EXCEPTION 'Original sealed draft request required' USING ERRCODE = 'PT409';
  END IF;

  IF p_document IS NULL THEN
    IF source.batch_draft_operation_id IS NULL AND source.document_id IS NULL THEN
      -- Historical requests have no seal. Require the original server
      -- projection and fresh relationship before using the sequence.
      PERFORM erp_private.batch_draft_relationship(source.id,true);
      IF p_request - ARRAY['uploadSessionId','allowDuplicate','prepared'] <> '{}'::jsonb
        OR jsonb_typeof(p_request->'allowDuplicate') IS DISTINCT FROM 'boolean'
        OR p_request->'prepared' IS DISTINCT FROM erp_private.batch_draft_snapshot(source.id,false)->'snapshot' THEN
        RAISE EXCEPTION 'Historical draft preparation changed' USING ERRCODE = 'PT409';
      END IF;
    END IF;
    -- The consumer repeats its invoker reads after any allocator wait. The
    -- existing deferred constraint also covers direct calls to this helper.
    allocation := erp_private.numbering_allocate(NULL,'MASTER_DMS_DOCUMENT',NULL,p_operation,
      actor,'reserved','dms_documents',NULL,reason,now());
    IF allocation->>'generation_status'='reserved' THEN
      INSERT INTO erp_private.dms_scoped_upload_reference_checks(reference_id)
      VALUES((allocation->>'id')::bigint) ON CONFLICT DO NOTHING;
    END IF;
    RETURN allocation;
  END IF;

  IF source.document_id IS DISTINCT FROM p_document
    OR NOT public.f03_has_document_permission(p_document,'dms.documents.upload')
    OR NOT public.f03_has_document_permission(p_document,'dms.documents.preview')
    OR NOT public.f03_has_document_permission(p_document,'dms.documents.review_ai')
    OR NOT EXISTS (
      SELECT 1 FROM public.dms_documents d
      JOIN public.dms_ai_extraction_results a ON a.document_id=d.id AND a.upload_session_id=source.id AND a.id=source.ai_result_id
      JOIN public.dms_document_events e ON e.document_id=d.id AND e.event_type='batch_draft_created'
        AND e.performed_by=actor AND e.metadata_json->'upload_session_id'=to_jsonb(source.id)
      WHERE d.id=p_document AND ROW(d.owning_company_id,d.owning_branch_id)
        IS NOT DISTINCT FROM ROW(source.owning_company_id,source.owning_branch_id)) THEN
    RAISE EXCEPTION 'Batch draft reference target unavailable' USING ERRCODE = '42501';
  END IF;
  PERFORM erp_private.consume_dms_intake_reference(p_operation,reason,p_document);
  IF NOT erp_private.f07_upload_subject_allowed(source.id)
    OR NOT erp_private.upload_session_permission(source.id,'dms.documents.upload')
    OR NOT public.f03_has_document_permission(p_document,'dms.documents.preview')
    OR NOT public.f03_has_document_permission(p_document,'dms.documents.review_ai') THEN
    RAISE EXCEPTION 'Batch draft reference target unavailable' USING ERRCODE = '42501';
  END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION erp_private.scoped_batch_draft_reference(uuid,jsonb,bigint) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION erp_private.scoped_batch_draft_reference(uuid,jsonb,bigint) TO authenticated;

-- AI must retain its reservation across the Storage copy. At commit the
-- reservation must be tied to its exact immutable plan, started run and source.
CREATE TABLE erp_private.dms_ai_numbering_reservation_checks (
  reference_id bigint PRIMARY KEY REFERENCES public.global_numbering_generated_references(id),
  actor_id bigint NOT NULL,
  operation_id uuid NOT NULL,
  upload_session_id bigint NOT NULL,
  must_complete boolean NOT NULL DEFAULT false
);
ALTER TABLE erp_private.dms_ai_numbering_reservation_checks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON erp_private.dms_ai_numbering_reservation_checks FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION erp_private.require_dms_ai_numbering_plan()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM erp_private.ai_approval_plans p
    JOIN public.global_numbering_generated_references g ON g.id=p.reference_id AND g.generated_by=p.actor_id
      AND g.generated_reference_number=p.document_no AND g.generation_reason='F06 AI approval '||p.request_hash
    JOIN public.dms_approve_runs r ON r.id=p.approve_run_id AND r.upload_session_id=p.upload_session_id AND r.started_by=p.actor_id
      AND r.run_key='f06-ai:'||p.actor_id||':'||p.operation_id
    JOIN public.dms_upload_sessions s ON s.id=p.upload_session_id AND s.approve_run_id=r.id AND s.deleted_at IS NULL
    WHERE p.reference_id=NEW.reference_id AND p.actor_id=NEW.actor_id AND p.operation_id=NEW.operation_id
      AND p.upload_session_id=NEW.upload_session_id AND g.target_table_name='dms_documents'
      AND ((NOT NEW.must_complete AND g.generation_status='reserved' AND r.status='started' AND p.result IS NULL
          AND s.approve_status='processing' AND s.document_id IS NULL AND g.target_record_id IS NULL)
        OR (g.generation_status='consumed' AND r.status='completed' AND p.result IS NOT NULL
          AND s.document_id=p.document_id AND g.target_record_id=p.document_id))) THEN
    RAISE EXCEPTION 'AI reference requires its retained approval plan' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION erp_private.require_dms_ai_numbering_plan() FROM PUBLIC,anon,authenticated,service_role;
CREATE CONSTRAINT TRIGGER dms_ai_numbering_has_plan AFTER INSERT OR UPDATE OF must_complete ON erp_private.dms_ai_numbering_reservation_checks
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION erp_private.require_dms_ai_numbering_plan();

CREATE FUNCTION erp_private.scoped_ai_intake_reference(p_operation uuid, p_request jsonb, p_document bigint DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  actor bigint := public.current_user_profile_id();
  session_id bigint := (p_request->>'uploadSessionId')::bigint;
  reason text := 'F06 AI approval '||encode(sha256(convert_to(p_request::text,'UTF8')),'hex');
  source public.dms_upload_sessions;
  plan erp_private.ai_approval_plans;
  proof erp_private.ai_approval_verified_copies;
  snapshot jsonb;
  allocation jsonb;
BEGIN
  PERFORM erp_private.validate_ai_approval_request(p_request,true);
  PERFORM erp_private.assert_ai_approval_authority(p_request);
  IF actor IS NULL OR p_operation IS NULL THEN
    RAISE EXCEPTION 'Approval numbering unavailable' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO source FROM public.dms_upload_sessions WHERE id=session_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Approval numbering unavailable' USING ERRCODE = '42501';
  END IF;
  PERFORM erp_private.assert_ai_approval_authority(p_request);
  IF EXISTS (SELECT 1 FROM erp_private.f07_intake_discard_receipts WHERE upload_session_id=session_id) THEN
    RAISE EXCEPTION 'Approval was discarded' USING ERRCODE = 'PT409';
  END IF;

  IF p_document IS NULL THEN
    snapshot := erp_private.ai_approval_snapshot(p_request);
    IF (p_request->'prepared')-ARRAY['content_sha256','storage_year'] IS DISTINCT FROM snapshot-'storage_year'
      OR NOT EXISTS (SELECT 1 FROM erp_private.f07_intake_sources verified
        WHERE verified.upload_session_id=source.id AND verified.sha256=p_request#>>'{prepared,content_sha256}') THEN
      RAISE EXCEPTION 'Prepared approval changed' USING ERRCODE = 'PT409';
    END IF;
    allocation := erp_private.numbering_allocate(NULL,'MASTER_DMS_DOCUMENT',NULL,p_operation,
      actor,'reserved','dms_documents',NULL,reason,now());
    IF allocation->>'generation_status'='reserved' THEN
      INSERT INTO erp_private.dms_ai_numbering_reservation_checks(reference_id,actor_id,operation_id,upload_session_id)
      VALUES((allocation->>'id')::bigint,actor,p_operation,session_id) ON CONFLICT DO NOTHING;
    END IF;
    RETURN allocation;
  END IF;

  SELECT * INTO plan FROM erp_private.ai_approval_plans WHERE actor_id=actor AND operation_id=p_operation;
  IF NOT FOUND OR plan.upload_session_id IS DISTINCT FROM source.id OR plan.document_id IS DISTINCT FROM p_document
    OR plan.request_json IS DISTINCT FROM p_request OR source.document_id IS DISTINCT FROM p_document
    OR source.approve_run_id IS DISTINCT FROM plan.approve_run_id OR source.approve_status IS DISTINCT FROM 'completed'
    OR NOT EXISTS (SELECT 1 FROM public.dms_approve_runs r WHERE r.id=plan.approve_run_id
      AND r.upload_session_id=source.id AND r.document_id=p_document AND r.status='completed' AND r.started_by=actor)
    OR NOT EXISTS (SELECT 1 FROM erp_private.numbering_requests n WHERE n.actor_id=actor AND n.operation_id=p_operation
      AND n.reference_id=plan.reference_id) THEN
    RAISE EXCEPTION 'Approval reference target unavailable' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO proof FROM erp_private.ai_approval_verified_copies WHERE actor_id=actor AND operation_id=p_operation;
  PERFORM erp_private.assert_ai_approval_copy(p_operation,p_request,proof.file_name);
  IF NOT EXISTS (SELECT 1 FROM public.dms_document_files f WHERE f.document_id=p_document AND f.deleted_at IS NULL
    AND f.created_by=actor AND f.file_role='original' AND f.storage_bucket='dms-documents'
    AND f.storage_path=plan.storage_path AND f.sha256_hash=proof.content_sha256 AND f.file_name=proof.file_name) THEN
    RAISE EXCEPTION 'Approval file unavailable' USING ERRCODE = '42501';
  END IF;
  PERFORM erp_private.consume_dms_intake_reference(p_operation,reason,p_document);
  INSERT INTO erp_private.dms_ai_numbering_reservation_checks(reference_id,actor_id,operation_id,upload_session_id,must_complete)
  VALUES(plan.reference_id,actor,p_operation,session_id,true)
  ON CONFLICT (reference_id) DO UPDATE SET must_complete=true;
  PERFORM erp_private.assert_ai_approval_authority(p_request);
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION erp_private.scoped_ai_intake_reference(uuid,jsonb,bigint) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION erp_private.scoped_ai_intake_reference(uuid,jsonb,bigint) TO authenticated;

-- Preserve the exact predecessor bodies, including the point reads and caller
-- RLS on business writes. Match each reviewed definition before editing it.
DO $migration$
DECLARE
  routine record;
  definition text;
  global_gate constant text := 'not public.current_user_has_permission(''numbering.rules.generate'')';
  batch_allocation constant text := $old$public.allocate_numbering_reference(p_operation,null,'MASTER_DMS_DOCUMENT',null,'reserved','dms_documents',null,
  'F06 batch draft creation '||encode(sha256(convert_to(p_request::text,'UTF8')),'hex'))$old$;
  ai_allocation constant text := $old$public.allocate_numbering_reference(p_operation,null,'MASTER_DMS_DOCUMENT',null,'reserved','dms_documents',null,
   'F06 AI approval '||encode(sha256(convert_to(p_request::text,'UTF8')),'hex'))$old$;
BEGIN
  FOR routine IN SELECT * FROM (VALUES
    ('erp_private.batch_draft_enabled(bigint)','229cf75e047a31363fc721c6ac9c1910',true),
    ('erp_private.batch_draft_snapshot(bigint,boolean)','3c1de3563c46e218a80433feb0e79ae5',false),
    ('erp_private.batch_draft_preparation_exists(bigint)','af1463410875d78375bef0a33a68b212',true),
    ('erp_private.lock_batch_source_context_rows(bigint)','9105eb3190a561d4db620be90dc37eda',true),
    ('erp_private.lock_batch_draft_context(bigint)','34bd00ee1b8a6844936888913e11e4d6',false),
    ('erp_private.read_dms_batch_draft_member(uuid,bigint)','78981fafa45f16ae32f1dbf7e5a4c38c',false),
    ('public.read_dms_batch_draft_recovery(uuid)','9982bd07e2501e524fea4ee9ed06a6c3',false),
    ('public.prepare_recoverable_dms_batch_draft(bigint)','17166b61bfd7a7c7df0f91c64f531a5a',false),
    ('public.create_numbered_dms_batch_draft(uuid,jsonb)','04d6203d0eef0f2286cb5dffd9ebf6df',false),
    ('erp_private.assert_ai_approval_authority(jsonb)','66fffacc8e44af88d1daeadefc9bfd03',false),
    ('erp_private.lock_ai_approval_context(jsonb)','e41562f1cbe9877c5b246243ef5d0b79',true),
    ('public.reserve_numbered_ai_intake(uuid,jsonb)','7e703c3b705a4e58a19e2ae75bc32cfe',false),
    ('public.finish_numbered_ai_intake(uuid,jsonb,text)','876a71983722cdb41850e61486b99310',false)
  ) AS r(signature,body_hash,security_definer) LOOP
    SELECT replace(pg_get_functiondef(oid),E'\r\n',E'\n') INTO definition
    FROM pg_proc WHERE oid=to_regprocedure(routine.signature) AND md5(replace(prosrc,E'\r\n',E'\n'))=routine.body_hash
      AND prosecdef=routine.security_definer AND proowner='postgres'::regrole AND 'search_path=""'=ANY(proconfig);
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Unexpected scoped numbering predecessor %',routine.signature;
    END IF;

    IF routine.signature='erp_private.lock_batch_draft_context(bigint)' THEN
      definition := replace(definition,' if '||global_gate||' then raise exception ''Batch draft permission denied'' using errcode=''42501'';end if;'||E'\n','');
    ELSE
      definition := regexp_replace(definition,'[[:space:]]+or '||replace(replace(replace(global_gate,'.','\.'),'(','\('),')','\)'),'','gi');
    END IF;
    IF routine.signature='erp_private.assert_ai_approval_authority(jsonb)' THEN
      definition := replace(definition,'or not erp_private.upload_session_allowed(s.id)', 'or not erp_private.f07_upload_subject_allowed(s.id)');
    END IF;
    definition := replace(definition,'erp_private.lock_dms_creation_taxonomy(', 'erp_private.lock_scoped_upload_taxonomy(');
    definition := replace(definition,batch_allocation,'erp_private.scoped_batch_draft_reference(p_operation,p_request)');
    definition := replace(definition,'public.finish_numbering_reservation(p_operation,''consumed'',''dms_documents'',draft_id,null)',
      'erp_private.scoped_batch_draft_reference(p_operation,p_request,draft_id)');
    definition := replace(definition,ai_allocation,'erp_private.scoped_ai_intake_reference(p_operation,p_request)');
    definition := replace(definition,'public.finish_numbering_reservation(p_operation,''consumed'',''dms_documents'',target,null)',
      'erp_private.scoped_ai_intake_reference(p_operation,p_request,target)');
    definition := replace(definition,'review/preview/upload/numbering authority', 'review/preview/upload authority');
    IF lower(definition) LIKE '%numbering.rules.generate%' OR definition LIKE '%public.allocate_numbering_reference(%'
      OR definition LIKE '%public.finish_numbering_reservation(%' OR definition LIKE '%erp_private.lock_dms_creation_taxonomy(%' THEN
      RAISE EXCEPTION 'Unexpected scoped numbering call site in %',routine.signature;
    END IF;
    EXECUTE definition;
  END LOOP;
END;
$migration$;

-- Both policies already bind the exact actor, source, batch, upload permission,
-- visibility, confidentiality, and analysis. Retain every one of those terms.
DO $policy$
DECLARE
  name text;
  predicate text;
  gate constant text := ' AND public.current_user_has_permission(''numbering.rules.generate''::text)';
BEGIN
  FOREACH name IN ARRAY ARRAY['f06_batch_preparation_insert','f06_batch_preparation_select'] LOOP
    SELECT pg_get_expr(coalesce(polqual,polwithcheck),polrelid) INTO STRICT predicate
    FROM pg_policy WHERE polrelid='erp_private.dms_batch_draft_preparations'::regclass AND polname=name;
    IF (length(predicate)-length(replace(predicate,gate,''))) <> length(gate)
      OR predicate NOT LIKE '%erp_private.upload_session_permission(upload_session_id,%' THEN
      RAISE EXCEPTION 'Unexpected batch preparation policy %',name;
    END IF;
    EXECUTE format('ALTER POLICY %I ON erp_private.dms_batch_draft_preparations %s (%s)',name,
      CASE WHEN name='f06_batch_preparation_insert' THEN 'WITH CHECK' ELSE 'USING' END,replace(predicate,gate,''));
  END LOOP;
END;
$policy$;

-- Expose only a boolean for the existing completed receipt. The action also
-- checks the source ID before returning the server-only recovery payload.
CREATE FUNCTION public.verify_completed_numbered_ai_intake(p_operation uuid,p_request jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE plan jsonb;
BEGIN
  PERFORM erp_private.validate_ai_approval_request(p_request,true);
  PERFORM erp_private.assert_ai_approval_authority(p_request);
  plan := erp_private.ai_approval_plan(p_operation,p_request);
  IF plan->'completed' IS DISTINCT FROM 'true'::jsonb THEN
    RETURN false;
  END IF;
  RETURN EXISTS (SELECT 1 FROM public.dms_documents d
    JOIN public.dms_upload_sessions s ON s.document_id=d.id AND s.id=(plan->>'upload_session_id')::bigint
    WHERE d.id=(plan->>'documentId')::bigint AND d.document_no=plan->>'documentNo'
      AND d.deleted_at IS NULL AND s.deleted_at IS NULL);
END $$;
REVOKE ALL ON FUNCTION public.verify_completed_numbered_ai_intake(uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.verify_completed_numbered_ai_intake(uuid,jsonb) TO authenticated;

-- This existing lock helper is reached by checked invoker paths. Its own
-- scoped upload and confidentiality predicates also protect direct calls.
GRANT EXECUTE ON FUNCTION erp_private.lock_scoped_upload_taxonomy(bigint,bigint,bigint,bigint,text) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
