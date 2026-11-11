BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';

-- Only the trusted stage publisher / migration owner can reconcile evidence.
-- Never infer provenance from a status label, file name or OCR text alone.
CREATE OR REPLACE FUNCTION erp_private.reconcile_intake_type_analysis(p_result bigint)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s public.dms_upload_sessions; a public.dms_ai_extraction_results;
 parent public.dms_ai_extraction_results; j public.dms_ai_extraction_jobs;
 stage erp_private.ai_mod04_intake_stages; proof erp_private.f07_intake_sources;
 ancestor erp_private.f07_intake_analyses; existing erp_private.f07_intake_analyses;
 obj storage.objects; source_id bigint;
BEGIN
 SELECT upload_session_id INTO source_id FROM public.dms_ai_extraction_results WHERE id=p_result;
 SELECT * INTO s FROM public.dms_upload_sessions WHERE id=source_id FOR UPDATE;
 IF NOT FOUND OR s.deleted_at IS NOT NULL OR s.document_id IS NOT NULL OR s.temp_cleaned_at IS NOT NULL
 OR s.expires_at<=clock_timestamp() OR s.status IN ('completed','cancelled','expired','discarded')
 OR s.intake_status IN ('approved','discarded','cancelled','expired') THEN RETURN 'held_closed_source'; END IF;
 SELECT * INTO a FROM public.dms_ai_extraction_results WHERE id=p_result FOR UPDATE;
 SELECT * INTO proof FROM erp_private.f07_intake_sources WHERE upload_session_id=s.id FOR SHARE;
 IF NOT FOUND OR proof.source IS DISTINCT FROM erp_private.f07_intake_source_row(s)
 OR proof.sha256 IS DISTINCT FROM lower(s.sha256_hash) THEN RETURN 'held_file_proof'; END IF;
 SELECT * INTO obj FROM storage.objects WHERE bucket_id='dms-temp' AND name=s.temp_storage_path FOR SHARE;
 IF NOT FOUND OR ROW(obj.id,obj.version,obj.updated_at) IS DISTINCT FROM ROW(proof.object_id,proof.object_version,proof.object_updated_at)
 OR obj.metadata->>'size' IS DISTINCT FROM s.file_size_bytes::text
 OR obj.metadata->>'mimetype' IS DISTINCT FROM s.mime_type THEN RETURN 'held_object_changed'; END IF;
 SELECT * INTO j FROM public.dms_ai_extraction_jobs WHERE id=a.job_id FOR UPDATE;
 IF NOT FOUND OR j.upload_session_id IS DISTINCT FROM s.id OR j.document_id IS NOT NULL
 OR j.status NOT IN ('complete','completed') OR a.ai_status IS DISTINCT FROM 'pending_review'
 OR a.document_id IS NOT NULL THEN RETURN 'held_analysis_state'; END IF;
 SELECT * INTO existing FROM erp_private.f07_intake_analyses WHERE result_id=a.id;
 IF FOUND THEN
  IF ROW(existing.upload_session_id,existing.job_id,existing.analysis_digest,existing.source_sha256,existing.object_id,existing.object_version,existing.object_updated_at)
   IS DISTINCT FROM ROW(s.id,j.id,erp_private.f07_intake_analysis_digest(a),proof.sha256,proof.object_id,proof.object_version,proof.object_updated_at)
   THEN RETURN 'held_existing_proof_changed'; END IF;
  RETURN 'already_verified';
 END IF;
 IF a.raw_response_json->>'retainedTypeReview' IS DISTINCT FROM 'true'
 OR coalesce(a.raw_response_json->>'supersedesResultId','') !~ '^[0-9]{1,18}$' THEN RETURN 'held_no_type_receipt'; END IF;
 SELECT * INTO stage FROM erp_private.ai_mod04_intake_stages
 WHERE upload_session_id=s.id AND state='completed' AND receipt->>'resultId'=a.id::text ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
 IF NOT FOUND OR stage.source->'file' IS DISTINCT FROM proof.source
 OR stage.source_hash IS DISTINCT FROM encode(sha256(convert_to(stage.source::text,'UTF8')),'hex')
 OR stage.source->>'schemaHash' IS DISTINCT FROM stage.schema_hash
 OR stage.source->>'targetType' IS DISTINCT FROM stage.document_type_id::text
 OR stage.source->>'mergeMode' IS DISTINCT FROM stage.merge_mode
 OR stage.source->>'analysisId' IS DISTINCT FROM a.raw_response_json->>'supersedesResultId'
 OR stage.document_type_id IS DISTINCT FROM a.suggested_document_type_id
 OR stage.actor IS DISTINCT FROM j.created_by OR j.input_text_hash IS DISTINCT FROM stage.source_hash
 OR j.run_source IS DISTINCT FROM 'ai_intake'
 OR stage.receipt->'extractedFieldsJson' IS DISTINCT FROM a.extracted_fields_json
 OR stage.receipt->'fieldConfidenceJson' IS DISTINCT FROM a.field_confidence_json
 OR stage.receipt->'preparation' IS DISTINCT FROM a.raw_response_json->'preparation'
 THEN RETURN 'held_receipt_mismatch'; END IF;
 SELECT * INTO parent FROM public.dms_ai_extraction_results WHERE id=(a.raw_response_json->>'supersedesResultId')::bigint FOR SHARE;
 IF NOT FOUND OR parent.id>=a.id OR parent.upload_session_id IS DISTINCT FROM s.id
 OR stage.source->>'analysisHash' IS DISTINCT FROM encode(sha256(convert_to(to_jsonb(parent)::text,'UTF8')),'hex')
 OR ROW(a.raw_ocr_text,a.suggested_title,a.suggested_description,a.issue_date_suggestion,a.expiry_date_suggestion)
 IS DISTINCT FROM ROW(parent.raw_ocr_text,parent.suggested_title,parent.suggested_description,parent.issue_date_suggestion,parent.expiry_date_suggestion)
 OR (a.raw_response_json-ARRAY['preparation','processing','supersedesResultId','retainedTypeReview'])
 IS DISTINCT FROM (parent.raw_response_json-ARRAY['preparation','processing','supersedesResultId','retainedTypeReview'])
 THEN RETURN 'held_parent_changed'; END IF;
 SELECT * INTO ancestor FROM erp_private.f07_intake_analyses WHERE result_id=parent.id;
 IF NOT FOUND OR ROW(ancestor.upload_session_id,ancestor.job_id,ancestor.analysis_digest,ancestor.source_sha256,ancestor.object_id,ancestor.object_version,ancestor.object_updated_at)
 IS DISTINCT FROM ROW(s.id,parent.job_id,erp_private.f07_intake_analysis_digest(parent),proof.sha256,proof.object_id,proof.object_version,proof.object_updated_at)
 THEN RETURN 'held_parent_unverified'; END IF;
 -- Append evidence, never replace an existing attestation or accept a document.
 INSERT INTO erp_private.f07_intake_analyses(result_id,upload_session_id,job_id,analysis_digest,source_sha256,object_id,object_version,object_updated_at,actor_id)
 VALUES(a.id,s.id,j.id,erp_private.f07_intake_analysis_digest(a),proof.sha256,proof.object_id,proof.object_version,proof.object_updated_at,stage.actor);
 UPDATE public.dms_ai_extraction_jobs SET status='complete' WHERE id=j.id AND status='completed';
 RETURN 'recovered';
END $$;
ALTER FUNCTION erp_private.reconcile_intake_type_analysis(bigint) OWNER TO postgres;
REVOKE ALL ON FUNCTION erp_private.reconcile_intake_type_analysis(bigint) FROM PUBLIC,anon,authenticated,service_role;

-- Guarded exact edits retain the current authority, source/schema, and retry checks.
DO $patch$
DECLARE body text; old text; replacement text;
BEGIN
 body:=pg_get_functiondef('erp_private.ai_mod04_intake_stage(text,jsonb)'::regprocedure);
 IF position('intake_type_verification_v1' IN body)=0 THEN
  old:=$old$VALUES(s.id,s.document_id,'classify_extract','completed',source_hash$old$;
  replacement:=$new$VALUES(s.id,s.document_id,'classify_extract','complete',source_hash$new$;
  IF position(old IN body)=0 THEN RAISE EXCEPTION 'Unexpected intake publisher status; review before applying'; END IF;
  body:=replace(body,old,replacement);
  old:=$old$ UPDATE erp_private.ai_mod04_intake_stages SET state='completed',receipt=result WHERE token=bound.token;$old$;
  replacement:=old||$new$
 -- intake_type_verification_v1: same transaction as the durable result receipt.
 IF erp_private.reconcile_intake_type_analysis(new_result) NOT IN ('recovered','already_verified') THEN
  RAISE EXCEPTION 'Type analysis could not be bound to its verified original; retain the request' USING ERRCODE='PT409';
 END IF;$new$;
  IF position(old IN body)=0 THEN RAISE EXCEPTION 'Unexpected intake receipt publisher'; END IF;
  body:=replace(body,old,replacement);
  -- Stop before any paid call when its original analysis lacks evidence.
  old:=$old$ IF p_action='read' THEN RETURN jsonb_build_object('state','ready'$old$;
  replacement:=$new$ IF erp_private.reconcile_intake_type_analysis(a.id) NOT IN ('recovered','already_verified') THEN
   RAISE EXCEPTION 'Original analysis verification requires reconciliation; no new extraction admitted' USING ERRCODE='PT409';
  END IF;
  IF p_action='read' THEN RETURN jsonb_build_object('state','ready'$new$;
  IF position(old IN body)=0 THEN RAISE EXCEPTION 'Unexpected intake admission'; END IF;
  body:=replace(body,old,replacement);
  EXECUTE body;
 END IF;
END $patch$;

-- Recover retained type-review chains in creation order. Closed sources, missing
-- root proofs and tampered evidence remain held; no AI call or approval occurs.
DO $recover$
DECLARE r record; outcome text; recovered integer:=0; held integer:=0;
BEGIN
 FOR r IN SELECT a.id FROM public.dms_ai_extraction_results a
  JOIN public.dms_upload_sessions s ON s.id=a.upload_session_id
  WHERE a.raw_response_json->>'retainedTypeReview'='true' AND a.ai_status='pending_review'
  AND s.document_id IS NULL AND s.deleted_at IS NULL
  AND NOT EXISTS(SELECT 1 FROM erp_private.f07_intake_analyses e WHERE e.result_id=a.id)
  ORDER BY a.id
 LOOP
  outcome:=erp_private.reconcile_intake_type_analysis(r.id);
  IF outcome='recovered' THEN recovered:=recovered+1; ELSE held:=held+1; END IF;
 END LOOP;
 RAISE NOTICE 'Intake verification: % recovered, % held; no documents approved',recovered,held;
END $recover$;
COMMIT;
