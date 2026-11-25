BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE public.dms_ai_extraction_jobs ADD COLUMN manual_operation_id uuid;
CREATE UNIQUE INDEX dms_ai_manual_operation_once ON public.dms_ai_extraction_jobs(created_by,manual_operation_id)
  WHERE manual_operation_id IS NOT NULL;

CREATE TABLE erp_private.dms_saved_classification_receipts (
  job_id bigint PRIMARY KEY,
  actor_id bigint NOT NULL,
  result_id bigint NOT NULL UNIQUE,
  request_hash text NOT NULL
);
ALTER TABLE erp_private.dms_saved_classification_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON erp_private.dms_saved_classification_receipts FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT ON erp_private.dms_saved_classification_receipts TO erp_transaction_audit_writer;
CREATE POLICY dms_saved_classification_receipt_actor ON erp_private.dms_saved_classification_receipts
  TO erp_transaction_audit_writer
  USING (actor_id = (SELECT public.current_user_profile_id()))
  WITH CHECK (actor_id = (SELECT public.current_user_profile_id()));

-- Preserve the operation and the source document once the ordinary job is created.
CREATE FUNCTION erp_private.dms_preserve_manual_classification_operation() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF OLD.manual_operation_id IS NOT NULL
    AND ROW(OLD.manual_operation_id,OLD.document_id,OLD.created_by,OLD.job_type,OLD.run_source)
      IS DISTINCT FROM ROW(NEW.manual_operation_id,NEW.document_id,NEW.created_by,NEW.job_type,NEW.run_source)
    OR OLD.manual_operation_id IS NULL AND NEW.manual_operation_id IS NOT NULL
  THEN
    RAISE EXCEPTION 'Saved classification operation identity is immutable' USING ERRCODE = 'PT409';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION erp_private.dms_preserve_manual_classification_operation() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER dms_preserve_manual_classification_operation BEFORE UPDATE ON public.dms_ai_extraction_jobs
  FOR EACH ROW EXECUTE FUNCTION erp_private.dms_preserve_manual_classification_operation();

CREATE FUNCTION erp_private.dms_assert_saved_classification_access(p_document bigint) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  confidentiality text;
BEGIN
  SELECT d.confidentiality_level INTO confidentiality
  FROM public.dms_documents d WHERE d.id = p_document AND d.deleted_at IS NULL;
  IF NOT FOUND OR NOT (erp_private.document_permission(p_document,'dms.documents.ai.run')
    OR confidentiality NOT IN ('hr','legal','executive') AND (
      erp_private.document_permission(p_document,'dms.documents.review_ai')
      OR erp_private.document_permission(p_document,'dms.admin')))
  THEN
    RAISE EXCEPTION 'Saved classification unavailable' USING ERRCODE = '42501';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION erp_private.dms_assert_saved_classification_access(bigint) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION erp_private.dms_assert_saved_classification_access(bigint) TO erp_transaction_audit_writer;

-- Scope the lock to the same source the caller could read. Locking does not
-- require a new business edit grant for actors who may already run analysis.
CREATE FUNCTION erp_private.dms_lock_saved_classification_source(p_document bigint)
RETURNS TABLE (id bigint,current_version_id bigint,owning_company_id bigint,owning_branch_id bigint,files jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM erp_private.dms_assert_saved_classification_access(p_document);
  SELECT d.id,d.current_version_id,d.owning_company_id,d.owning_branch_id
  INTO id,current_version_id,owning_company_id,owning_branch_id
  FROM public.dms_documents d WHERE d.id = p_document AND d.deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND OR NOT public.current_user_can_view_dms_document(p_document) THEN
    RAISE EXCEPTION 'Saved classification source unavailable' USING ERRCODE = '42501';
  END IF;
  PERFORM erp_private.dms_assert_saved_classification_access(p_document);
  SELECT jsonb_agg(jsonb_build_array(f.id,f.version_id,f.storage_bucket,f.storage_path,f.mime_type,f.sha256_hash) ORDER BY f.id)
  INTO files FROM (
    SELECT f.id,f.version_id,f.storage_bucket,f.storage_path,f.mime_type,f.sha256_hash
    FROM public.dms_document_files f WHERE f.document_id = p_document AND f.deleted_at IS NULL
    ORDER BY f.id FOR SHARE
  ) f;
  RETURN NEXT;
END;
$$;
REVOKE ALL ON FUNCTION erp_private.dms_lock_saved_classification_source(bigint) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION erp_private.dms_lock_saved_classification_source(bigint) TO erp_transaction_audit_writer;

CREATE FUNCTION erp_private.dms_read_saved_classification(p_document bigint,p_operation uuid,p_job_type text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  job public.dms_ai_extraction_jobs%ROWTYPE;
  result_id bigint;
BEGIN
  PERFORM erp_private.dms_assert_saved_classification_access(p_document);
  SELECT * INTO job FROM public.dms_ai_extraction_jobs j
  WHERE j.manual_operation_id = p_operation AND j.created_by = public.current_user_profile_id();
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF job.document_id IS DISTINCT FROM p_document OR job.job_type IS DISTINCT FROM p_job_type
    OR job.run_source <> 'manual' OR job.upload_session_id IS NOT NULL THEN
    RAISE EXCEPTION 'Saved classification operation changed' USING ERRCODE = 'PT409';
  END IF;
  SELECT r.result_id INTO result_id FROM erp_private.dms_saved_classification_receipts r WHERE r.job_id = job.id;
  RETURN jsonb_build_object('job_id',job.id,'result_id',result_id,'status',job.status);
END;
$$;

CREATE FUNCTION erp_private.dms_publish_saved_classification(
  p_document bigint,p_job bigint,p_operation uuid,p_version bigint,p_files jsonb,p_result jsonb,p_duration integer,p_has_text boolean
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  actor bigint := public.current_user_profile_id();
  document record;
  job public.dms_ai_extraction_jobs%ROWTYPE;
  receipt erp_private.dms_saved_classification_receipts%ROWTYPE;
  data public.dms_ai_extraction_results%ROWTYPE;
  requested text;
  result_id bigint;
  completed timestamptz := clock_timestamp();
BEGIN
  SELECT * INTO STRICT document FROM erp_private.dms_lock_saved_classification_source(p_document);
  SELECT * INTO job FROM public.dms_ai_extraction_jobs j WHERE j.id = p_job AND j.document_id = p_document
    AND j.created_by = actor AND j.manual_operation_id = p_operation
    AND j.run_source = 'manual' AND j.upload_session_id IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Saved classification operation unavailable' USING ERRCODE = '42501'; END IF;

  requested := encode(sha256(convert_to(jsonb_build_array(p_version,p_files,p_result,p_duration,p_has_text)::text,'UTF8')),'hex');
  SELECT * INTO receipt FROM erp_private.dms_saved_classification_receipts WHERE job_id = p_job;
  IF FOUND THEN
    IF receipt.request_hash <> requested THEN
      RAISE EXCEPTION 'Saved classification completion changed' USING ERRCODE = 'PT409';
    END IF;
    RETURN jsonb_build_object('job_id',p_job,'result_id',receipt.result_id,'status','completed');
  END IF;
  IF job.status <> 'processing' OR document.current_version_id IS DISTINCT FROM p_version
    OR p_duration IS NULL OR p_duration < 0 OR p_has_text IS NULL
    OR jsonb_typeof(p_result) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Saved classification source or operation changed' USING ERRCODE = 'PT409';
  END IF;

  IF document.files IS NULL OR document.files IS DISTINCT FROM p_files THEN
    RAISE EXCEPTION 'Saved classification original files changed' USING ERRCODE = 'PT409';
  END IF;
  data := jsonb_populate_record(NULL::public.dms_ai_extraction_results,p_result);
  INSERT INTO public.dms_ai_extraction_results
    (job_id,document_id,result_type,ai_status,suggested_document_type_id,classification_confidence,classification_score,
     classification_reason,extracted_fields_json,field_confidence_json,suggested_links_json,issue_date_suggestion,
     expiry_date_suggestion,suggested_title,suggested_description,raw_response_json)
  VALUES (job.id,document.id,'combined','pending_review',data.suggested_document_type_id,data.classification_confidence,
    data.classification_score,data.classification_reason,data.extracted_fields_json,data.field_confidence_json,
    data.suggested_links_json,data.issue_date_suggestion,data.expiry_date_suggestion,data.suggested_title,
    data.suggested_description,data.raw_response_json)
  RETURNING id INTO result_id;

  UPDATE public.dms_ai_extraction_jobs
  SET status = 'completed',completed_at = completed,duration_ms = p_duration WHERE id = job.id;
  UPDATE public.dms_documents SET ai_status = 'completed',ocr_text_available = p_has_text,
    ocr_last_run_at = CASE WHEN p_has_text THEN completed ELSE ocr_last_run_at END WHERE id = document.id;
  INSERT INTO public.dms_document_events (document_id,event_type,description,performed_by,metadata_json)
  VALUES(document.id,'ai_classification_completed','AI event: ai_classification_completed',actor,
    jsonb_build_object('job_id',job.id,'result_id',result_id,'confidence',data.classification_confidence,
      'suggested_type_code',data.raw_response_json#>>'{classification,suggested_type_code}',
      'field_count',(SELECT count(*) FROM jsonb_object_keys(coalesce(data.extracted_fields_json,'{}'::jsonb))),
      'duration_ms',p_duration));
  INSERT INTO public.audit_logs (actor_user_profile_id,owner_company_id,branch_id,module_code,entity_name,entity_id,
    entity_reference,action,new_values)
  VALUES (actor,document.owning_company_id,document.owning_branch_id,'DMS','dms_ai_extraction_jobs',job.id,
    'JOB-'||job.id,'update',jsonb_build_object('event','ai_analysis_completed','document_id',document.id,
      'result_id',result_id,'provider',job.provider,'duration_ms',p_duration,'confidence_label',data.classification_confidence));
  INSERT INTO erp_private.dms_saved_classification_receipts(job_id,actor_id,result_id,request_hash)
  VALUES (job.id,actor,result_id,requested);
  RETURN jsonb_build_object('job_id',p_job,'result_id',result_id,'status','completed');
END;
$$;

GRANT CREATE ON SCHEMA erp_private TO erp_transaction_audit_writer;
ALTER FUNCTION erp_private.dms_read_saved_classification(bigint,uuid,text) OWNER TO erp_transaction_audit_writer;
ALTER FUNCTION erp_private.dms_publish_saved_classification(bigint,bigint,uuid,bigint,jsonb,jsonb,integer,boolean)
  OWNER TO erp_transaction_audit_writer;
REVOKE CREATE ON SCHEMA erp_private FROM erp_transaction_audit_writer;

CREATE FUNCTION public.dms_read_saved_classification(p_document bigint,p_operation uuid,p_job_type text)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT erp_private.dms_read_saved_classification($1,$2,$3);
$$;
CREATE FUNCTION public.dms_publish_saved_classification(
  p_document bigint,p_job bigint,p_operation uuid,p_version bigint,p_files jsonb,p_result jsonb,p_duration integer,p_has_text boolean
) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT erp_private.dms_publish_saved_classification($1,$2,$3,$4,$5,$6,$7,$8);
$$;
REVOKE ALL ON FUNCTION erp_private.dms_read_saved_classification(bigint,uuid,text),
  public.dms_read_saved_classification(bigint,uuid,text),
  erp_private.dms_publish_saved_classification(bigint,bigint,uuid,bigint,jsonb,jsonb,integer,boolean),
  public.dms_publish_saved_classification(bigint,bigint,uuid,bigint,jsonb,jsonb,integer,boolean)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION erp_private.dms_read_saved_classification(bigint,uuid,text),
  public.dms_read_saved_classification(bigint,uuid,text),
  erp_private.dms_publish_saved_classification(bigint,bigint,uuid,bigint,jsonb,jsonb,integer,boolean),
  public.dms_publish_saved_classification(bigint,bigint,uuid,bigint,jsonb,jsonb,integer,boolean) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
