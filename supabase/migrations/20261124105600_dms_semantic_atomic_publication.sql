BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- Null identifies historical inline writes. A queued publication always binds a version.
ALTER TABLE public.dms_document_content_chunks ADD COLUMN f07_source_version_id bigint;

CREATE TABLE erp_private.f07_semantic_index_receipts (
 job_id bigint NOT NULL REFERENCES public.dms_ai_job_queue(id) ON DELETE CASCADE,
 claim_token uuid NOT NULL,
 document_id bigint NOT NULL,
 active_set_hash text NOT NULL,
 request_hash text,
 result jsonb NOT NULL,
 PRIMARY KEY (job_id, claim_token)
);
CREATE INDEX f07_semantic_index_receipts_set ON erp_private.f07_semantic_index_receipts (document_id, active_set_hash);
ALTER TABLE erp_private.f07_semantic_index_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON erp_private.f07_semantic_index_receipts FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION erp_private.f07_semantic_active_set(p_document bigint, p_version bigint, p_content bigint, p_hash text, p_proof text)
RETURNS TABLE(active_set_hash text, chunk_count integer, vector_count integer, pending_count integer)
LANGUAGE sql STABLE SET search_path = '' AS $$
 SELECT CASE WHEN bool_and(coalesce(c.f07_source_version_id = p_version AND c.content_id = p_content
       AND c.content_hash = p_hash AND c.chunk_hash = erp_private.dms_question_text_hash(c.chunk_text)
       AND a.proof_hash IS NOT NULL, false)) THEN
    erp_private.mobile_dms_hash(jsonb_agg(jsonb_build_array(c.id, c.chunk_index, a.proof_hash, c.embedding_status,
      erp_private.dms_question_text_hash(c.embedding::text), c.embedding_provider, c.embedding_model) ORDER BY c.chunk_index, c.id)) END,
  count(*)::integer, count(*) FILTER (WHERE c.embedding_status = 'complete' AND c.embedding IS NOT NULL)::integer,
  count(*) FILTER (WHERE c.embedding_status = 'pending')::integer
 FROM public.dms_document_content_chunks c
 LEFT JOIN erp_private.dms_question_artifacts a ON a.document_id = p_document AND a.version_id = p_version
  AND a.kind = 'chunk_text' AND a.artifact_key = c.id::text AND a.is_latest AND a.content_hash = c.chunk_hash
  AND a.parents = jsonb_build_array(p_proof)
 WHERE c.document_id = p_document AND c.is_active AND c.deleted_at IS NULL;
$$;

CREATE FUNCTION erp_private.f07_semantic_index(p_action text, p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' SET lock_timeout = '5s' AS $$
DECLARE
 headers jsonb := nullif(current_setting('request.headers', true), '')::jsonb;
 old_capability text := current_setting('algt.semantic_index_publisher', true);
 v_job bigint;
 v_token uuid;
 v_document bigint;
 job public.dms_ai_job_queue;
 live_token uuid;
 live_expiry timestamptz;
 v_version bigint;
 content public.dms_document_content;
 source_hash text;
 parent erp_private.dms_question_artifacts;
 chunking_enabled boolean;
 embeddings_enabled boolean;
 identity_data jsonb;
 v_force boolean;
 active_set record;
 receipt erp_private.f07_semantic_index_receipts;
 v_request_hash text;
 chunk_json jsonb;
 chunk public.dms_document_content_chunks;
 staged public.dms_document_content_chunks[] := '{}';
 chunk_number integer := 0;
 chunk_id bigint;
 result jsonb;
 published_at timestamptz;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN
  RAISE EXCEPTION 'Trusted semantic worker required' USING ERRCODE = '42501';
 END IF;
 CASE p_action
 WHEN 'inspect' THEN
  PERFORM erp_private.mobile_dms_keys(p_data, ARRAY['jobId','token','documentId'], ARRAY['forceRebuild']);
 WHEN 'publish' THEN
  PERFORM erp_private.mobile_dms_keys(p_data,
   ARRAY['jobId','token','documentId','versionId','contentId','sourceHash','sourceProof','isTruncated','embeddingsEnabled','chunks'], ARRAY['forceRebuild']);
 WHEN 'receipt' THEN
  PERFORM erp_private.mobile_dms_keys(p_data, ARRAY['jobId','token','documentId'], ARRAY['versionId','contentId','sourceHash','sourceProof','isTruncated','embeddingsEnabled']);
 ELSE
  RAISE EXCEPTION 'Unknown semantic publication action' USING ERRCODE = '22023';
 END CASE;
 v_job := (p_data->>'jobId')::bigint;
 v_token := (p_data->>'token')::uuid;
 v_document := (p_data->>'documentId')::bigint;
 IF v_job IS NULL OR v_job < 1 OR v_token IS NULL OR v_document IS NULL OR v_document < 1
    OR (p_data ? 'forceRebuild' AND jsonb_typeof(p_data->'forceRebuild') IS DISTINCT FROM 'boolean') THEN
  RAISE EXCEPTION 'Invalid semantic publication identity' USING ERRCODE = '22023';
 END IF;
 IF (p_action <> 'receipt' OR headers ?| ARRAY['x-algt-ai-job','x-algt-ai-claim'])
    AND ((headers->>'x-algt-ai-job') IS DISTINCT FROM v_job::text OR (headers->>'x-algt-ai-claim') IS DISTINCT FROM v_token::text) THEN
  RAISE EXCEPTION 'Semantic request does not match the scoped claim' USING ERRCODE = '42501';
 END IF;
 IF p_action = 'receipt' THEN
  -- Serialize with a publication that reached the database before this read.
  -- A missing receipt for a live claim still cannot rule out delayed delivery.
  SELECT q.* INTO job FROM public.dms_ai_job_queue q WHERE q.id = v_job
   AND q.job_type = 'semantic_document_index' AND q.related_document_id = v_document FOR UPDATE;
  IF job.id IS NULL THEN
   RETURN jsonb_build_object('success', true, 'status', 'missing');
  END IF;
  SELECT c.token, c.expires_at INTO live_token, live_expiry FROM erp_private.f07_job_claims c WHERE c.job_id = v_job FOR UPDATE;
  SELECT r.* INTO receipt FROM erp_private.f07_semantic_index_receipts r
  WHERE r.job_id = v_job AND r.claim_token = v_token AND r.document_id = v_document
    AND r.result @> (p_data - ARRAY['jobId','token','documentId']);
  RETURN coalesce(receipt.result, jsonb_build_object('success', true, 'status',
   CASE WHEN job.job_status = 'running' AND live_token = v_token AND live_expiry > clock_timestamp() THEN 'pending' ELSE 'missing' END));
 END IF;

 -- Queue, claim, document, then content and version/evidence. No provider calls hold these locks.
 job := erp_private.f07_assert_job(v_job, v_token);
 IF job.job_type IS DISTINCT FROM 'semantic_document_index' OR job.related_document_id IS DISTINCT FROM v_document THEN
  RAISE EXCEPTION 'Claim is for another semantic operation' USING ERRCODE = '42501';
 END IF;
 SELECT d.current_version_id INTO v_version FROM public.dms_documents d WHERE d.id = v_document AND d.deleted_at IS NULL;
 SELECT c.* INTO content FROM public.dms_document_content c WHERE c.document_id = v_document FOR SHARE;
 IF content.id IS NULL OR content.content_text IS NULL OR content.content_text !~ '[^[:space:]]' THEN
  RETURN jsonb_build_object('success', false, 'status', 'held', 'reason', 'no_content');
 END IF;
 PERFORM 1 FROM public.dms_document_versions v WHERE v.id = v_version AND v.document_id = v_document
   AND v.is_current AND v.unlinked_at IS NULL FOR SHARE;
 IF NOT FOUND THEN
  RETURN jsonb_build_object('success', false, 'status', 'held', 'reason', 'source_unproven');
 END IF;
 source_hash := erp_private.dms_question_text_hash(content.content_text);
 SELECT a.* INTO parent FROM erp_private.dms_question_artifacts a
 WHERE a.document_id = v_document AND a.version_id = v_version AND a.kind = 'content_text'
   AND a.artifact_key = v_document::text AND a.is_latest AND a.content_hash = source_hash FOR SHARE;
 IF (parent.proof_hash IS NULL OR NOT erp_private.dms_question_current(parent))
    AND erp_private.f07_semantic_refresh_content_proof(v_document, v_version, content.id, source_hash) THEN
  SELECT a.* INTO parent FROM erp_private.dms_question_artifacts a
  WHERE a.document_id = v_document AND a.version_id = v_version AND a.kind = 'content_text'
    AND a.artifact_key = v_document::text AND a.is_latest AND a.content_hash = source_hash FOR SHARE;
 END IF;
 IF parent.proof_hash IS NULL THEN
  RETURN jsonb_build_object('success', false, 'status', 'held', 'reason', 'source_unproven');
 END IF;
 PERFORM 1 FROM public.dms_document_files f WHERE f.document_id = v_document AND f.version_id = v_version
   AND EXISTS (SELECT 1 FROM jsonb_array_elements(parent.bindings) b WHERE (b->>'fileId')::bigint = f.id)
   ORDER BY f.id FOR SHARE;
 IF NOT erp_private.dms_question_current(parent) THEN
  RETURN jsonb_build_object('success', false, 'status', 'held', 'reason', 'source_unproven');
 END IF;

 PERFORM 1 FROM public.erp_ai_feature_flags f WHERE f.feature_code IN ('DMS_SEMANTIC_CHUNKING','DMS_SEMANTIC_EMBEDDINGS')
  ORDER BY f.feature_code FOR SHARE;
 SELECT coalesce(bool_or(f.is_enabled) FILTER (WHERE f.feature_code = 'DMS_SEMANTIC_CHUNKING'), false),
        coalesce(bool_or(f.is_enabled) FILTER (WHERE f.feature_code = 'DMS_SEMANTIC_EMBEDDINGS'), false)
 INTO chunking_enabled, embeddings_enabled FROM public.erp_ai_feature_flags f
 WHERE f.feature_code IN ('DMS_SEMANTIC_CHUNKING','DMS_SEMANTIC_EMBEDDINGS');
 IF NOT chunking_enabled THEN
  RETURN jsonb_build_object('success', false, 'status', 'held', 'reason', 'chunking_disabled');
 END IF;
 identity_data := jsonb_build_object('versionId', v_version, 'contentId', content.id, 'sourceHash', source_hash,
   'sourceProof', parent.proof_hash, 'isTruncated', coalesce(content.is_truncated, false), 'embeddingsEnabled', embeddings_enabled);
 v_force := coalesce((p_data->>'forceRebuild')::boolean, false);
 IF v_force AND (job.attempt_count <> 1 OR job.payload_json->'forceRebuild' IS DISTINCT FROM 'true'::jsonb) THEN
  RAISE EXCEPTION 'Claim does not authorize a forced semantic rebuild' USING ERRCODE = '42501';
 END IF;

 IF p_action = 'publish' THEN
  IF (p_data - ARRAY['jobId','token','documentId','forceRebuild','chunks','embeddingsEnabled']) IS DISTINCT FROM (identity_data - 'embeddingsEnabled') THEN
   RETURN jsonb_build_object('success', false, 'status', 'held', 'reason', 'source_changed');
  END IF;
  IF p_data->'embeddingsEnabled' IS DISTINCT FROM identity_data->'embeddingsEnabled' THEN
   RETURN jsonb_build_object('success', false, 'status', 'held', 'reason', 'embedding_policy_changed');
  END IF;
  IF jsonb_typeof(p_data->'chunks') IS DISTINCT FROM 'array' OR octet_length(p_data::text) > 8388608 THEN
   RAISE EXCEPTION 'Invalid semantic chunk batch' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_data->'chunks') NOT BETWEEN 1 AND (CASE WHEN embeddings_enabled THEN 50 ELSE 200 END) THEN
   RAISE EXCEPTION 'Invalid semantic chunk count' USING ERRCODE = '22023';
  END IF;
  v_request_hash := erp_private.mobile_dms_hash(p_data);
 END IF;

 SELECT r.* INTO receipt FROM erp_private.f07_semantic_index_receipts r WHERE r.job_id = v_job AND r.claim_token = v_token;
 IF receipt.result IS NOT NULL THEN
  IF NOT receipt.result @> identity_data OR (p_action = 'publish' AND receipt.request_hash IS DISTINCT FROM v_request_hash) THEN
   RETURN jsonb_build_object('success', false, 'status', 'held', 'reason', 'source_changed');
  END IF;
  RETURN receipt.result;
 END IF;

 PERFORM 1 FROM public.dms_document_content_chunks c WHERE c.document_id = v_document AND c.is_active AND c.deleted_at IS NULL
   ORDER BY c.id FOR UPDATE;
 IF NOT v_force THEN
  SELECT s.* INTO active_set FROM erp_private.f07_semantic_active_set(v_document, v_version, content.id, source_hash, parent.proof_hash) s;
  IF active_set.active_set_hash IS NOT NULL AND (NOT embeddings_enabled OR active_set.vector_count = active_set.chunk_count)
     AND EXISTS (SELECT 1 FROM erp_private.f07_semantic_index_receipts r
      WHERE r.document_id = v_document AND r.active_set_hash = active_set.active_set_hash) THEN
   result := identity_data || jsonb_build_object('success', true, 'status', 'unchanged', 'chunksCreated', 0, 'chunksEmbedded', 0,
      'pendingRemaining', active_set.pending_count);
   PERFORM erp_private.f07_assert_job(v_job, v_token);
   INSERT INTO erp_private.f07_semantic_index_receipts(job_id, claim_token, document_id, active_set_hash, request_hash, result)
   VALUES (v_job, v_token, v_document, active_set.active_set_hash, v_request_hash, result);
   RETURN result;
  END IF;
 END IF;
 IF NOT embeddings_enabled AND EXISTS (
   SELECT 1 FROM public.dms_document_content_chunks c
   WHERE c.document_id = v_document AND c.is_active AND c.deleted_at IS NULL AND c.embedding_status = 'complete' AND c.embedding IS NOT NULL
    AND (c.f07_source_version_id IS NULL OR c.f07_source_version_id = v_version)
 ) THEN
  RETURN jsonb_build_object('success', false, 'status', 'held', 'reason', 'search_index_preserved');
 END IF;
 IF p_action = 'inspect' THEN
  RETURN identity_data || jsonb_build_object('success', true, 'status', 'ready');
 END IF;

 -- Validate the complete staged replacement before mutating any existing active rows.
 FOR chunk_json IN SELECT value FROM jsonb_array_elements(p_data->'chunks') LOOP
  PERFORM erp_private.mobile_dms_keys(chunk_json, ARRAY['chunkIndex','chunkText','chunkHash','sourceKind','tokenEstimate','charCount'],
    ARRAY['embedding','embeddingProvider','embeddingModel']);
  IF chunk_json->'chunkIndex' IS DISTINCT FROM to_jsonb(chunk_number)
    OR jsonb_typeof(chunk_json->'chunkText') IS DISTINCT FROM 'string'
    OR jsonb_typeof(chunk_json->'charCount') IS DISTINCT FROM 'number'
    OR jsonb_typeof(chunk_json->'tokenEstimate') IS DISTINCT FROM 'number'
    OR chunk_json->>'sourceKind' IS NULL
    OR chunk_json->>'sourceKind' NOT IN ('short_document', CASE WHEN content.is_truncated THEN 'truncated_content' ELSE 'document_content' END) THEN
   RAISE EXCEPTION 'Invalid semantic chunk fields' USING ERRCODE = '22023';
  END IF;
  chunk.chunk_index := chunk_number;
  chunk.chunk_text := chunk_json->>'chunkText';
  chunk.chunk_hash := erp_private.dms_question_text_hash(chunk.chunk_text);
  chunk.source_kind := chunk_json->>'sourceKind';
  -- The existing builder measures JavaScript UTF-16 code units.
  chunk.char_count := char_length(chunk.chunk_text) + regexp_count(chunk.chunk_text COLLATE "C", U&'[\+010000-\+10FFFF]');
  chunk.token_estimate := (chunk.char_count + 3) / 4;
  IF chunk.char_count < 1 OR position(chunk.chunk_text IN content.content_text) = 0
     OR chunk.chunk_hash IS DISTINCT FROM chunk_json->>'chunkHash'
     OR chunk_json->'charCount' IS DISTINCT FROM to_jsonb(chunk.char_count)
     OR chunk_json->'tokenEstimate' IS DISTINCT FROM to_jsonb(chunk.token_estimate) THEN
   RAISE EXCEPTION 'Invalid semantic chunk integrity fields' USING ERRCODE = '22023';
  END IF;
  IF embeddings_enabled THEN
   IF jsonb_typeof(chunk_json->'embedding') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Complete semantic embeddings required' USING ERRCODE = '22023';
   END IF;
   IF jsonb_array_length(chunk_json->'embedding') <> 1536
     OR EXISTS (SELECT 1 FROM jsonb_array_elements(chunk_json->'embedding') v WHERE jsonb_typeof(v) <> 'number')
     OR length(coalesce(chunk_json->>'embeddingProvider', '')) > 128
     OR length(coalesce(chunk_json->>'embeddingModel', '')) NOT BETWEEN 1 AND 128 THEN
    RAISE EXCEPTION 'Invalid semantic embedding' USING ERRCODE = '22023';
   END IF;
   BEGIN
    chunk.embedding := (chunk_json->>'embedding')::public.vector(1536);
    IF NOT ((chunk.embedding OPERATOR(public.<=>) chunk.embedding) BETWEEN 0 AND 0.001) THEN
     RAISE EXCEPTION 'Invalid semantic embedding' USING ERRCODE = '22023';
    END IF;
   EXCEPTION WHEN data_exception THEN
    RAISE EXCEPTION 'Invalid semantic embedding' USING ERRCODE = '22023';
   END;
   chunk.embedding_provider := chunk_json->>'embeddingProvider';
   chunk.embedding_model := chunk_json->>'embeddingModel';
  ELSIF coalesce(chunk_json->'embedding', 'null'::jsonb) <> 'null'::jsonb
    OR chunk_json->>'embeddingProvider' IS NOT NULL OR chunk_json->>'embeddingModel' IS NOT NULL THEN
   RAISE EXCEPTION 'Semantic embeddings disabled' USING ERRCODE = '22023';
  END IF;
  staged := array_append(staged, chunk);
  chunk_number := chunk_number + 1;
 END LOOP;

 PERFORM erp_private.f07_assert_job(v_job, v_token);
 published_at := clock_timestamp();
 PERFORM set_config('algt.semantic_index_publisher', v_job::text || '/' || v_token::text, true);
 WITH retired AS (
  UPDATE public.dms_document_content_chunks c SET is_active = false, updated_at = published_at, updated_by = job.created_by
  WHERE c.document_id = v_document AND c.is_active AND c.deleted_at IS NULL RETURNING c.id
 )
 UPDATE erp_private.dms_question_artifacts a SET is_latest = false
 FROM retired WHERE a.document_id = v_document AND a.kind = 'chunk_text' AND a.artifact_key = retired.id::text AND a.is_latest;

 FOREACH chunk IN ARRAY staged LOOP
  INSERT INTO public.dms_document_content_chunks(document_id, content_id, chunk_index, chunk_text, chunk_hash, content_hash,
   source_kind, char_count, token_estimate, embedding, embedding_status, embedding_provider, embedding_model, embedded_at,
   f07_source_version_id, created_at, updated_at, created_by, updated_by)
  VALUES (v_document, content.id, chunk.chunk_index, chunk.chunk_text, chunk.chunk_hash, source_hash,
   chunk.source_kind, chunk.char_count, chunk.token_estimate, chunk.embedding,
   CASE WHEN embeddings_enabled THEN 'complete' ELSE 'pending' END, chunk.embedding_provider, chunk.embedding_model,
   CASE WHEN embeddings_enabled THEN published_at END, v_version, published_at, published_at, job.created_by, job.created_by)
  RETURNING id INTO chunk_id;
  IF NOT erp_private.dms_question_record('chunk_text', chunk_id::text, v_document, v_version, chunk.chunk_hash,
       parent.bindings, jsonb_build_array(parent.proof_hash)) THEN
   RAISE EXCEPTION 'Verified semantic source changed' USING ERRCODE = 'PT409';
  END IF;
 END LOOP;
 PERFORM set_config('algt.semantic_index_publisher', coalesce(old_capability, ''), true);
 SELECT s.* INTO active_set FROM erp_private.f07_semantic_active_set(v_document, v_version, content.id, source_hash, parent.proof_hash) s;
 IF active_set.active_set_hash IS NULL OR active_set.chunk_count <> chunk_number OR
    (embeddings_enabled AND active_set.vector_count <> chunk_number) THEN
  RAISE EXCEPTION 'Semantic index did not match the staged replacement' USING ERRCODE = 'PT409';
 END IF;
 result := identity_data || jsonb_build_object('success', true, 'status', 'published', 'chunksCreated', chunk_number,
   'chunksEmbedded', active_set.vector_count, 'pendingRemaining', active_set.pending_count);
 PERFORM erp_private.f07_assert_job(v_job, v_token);
 INSERT INTO erp_private.f07_semantic_index_receipts(job_id, claim_token, document_id, active_set_hash, request_hash, result)
 VALUES (v_job, v_token, v_document, active_set.active_set_hash, v_request_hash, result);
 RETURN result;
END $$;

CREATE FUNCTION public.f07_semantic_index(p_action text, p_data jsonb) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$ SELECT erp_private.f07_semantic_index(p_action, p_data) $$;

CREATE FUNCTION erp_private.f07_recover_semantic_publication(p_job public.dms_ai_job_queue) RETURNS boolean
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
 v_token uuid;
 v_expiry timestamptz;
 finished_at timestamptz := clock_timestamp();
BEGIN
 IF p_job.job_type IS DISTINCT FROM 'semantic_document_index' OR p_job.job_status IS DISTINCT FROM 'running' THEN
  RETURN false;
 END IF;
 -- The canonical recovery loop owns the queue-row lock before invoking this helper.
 SELECT c.token, c.expires_at INTO v_token, v_expiry FROM erp_private.f07_job_claims c WHERE c.job_id = p_job.id FOR UPDATE;
 IF v_token IS NULL OR v_expiry IS NULL OR v_expiry > finished_at OR NOT EXISTS (
   SELECT 1 FROM erp_private.f07_semantic_index_receipts r WHERE r.job_id = p_job.id AND r.claim_token = v_token
    AND r.document_id = p_job.related_document_id AND r.result->'success' = 'true'::jsonb
    AND r.result->>'status' IN ('published', 'unchanged')
 ) THEN RETURN false; END IF;

 UPDATE public.dms_ai_job_attempts a SET status = 'completed', completed_at = finished_at,
  duration_ms = least(2147483647, greatest(0, extract(epoch FROM finished_at - a.started_at) * 1000))::integer,
  error_code = NULL, safe_error_message = NULL
 WHERE a.job_id = p_job.id AND a.attempt_number = p_job.attempt_count AND a.status = 'running';
 UPDATE public.dms_ai_job_queue SET job_status = 'completed', completed_at = finished_at, failed_at = NULL,
  locked_at = NULL, locked_by = NULL, last_error_code = NULL, last_error_message = NULL, updated_at = finished_at
 WHERE id = p_job.id;
 UPDATE erp_private.f07_job_claims SET token = NULL, expires_at = NULL, settled_token = v_token,
  receipt = jsonb_build_object('success', true, 'jobId', p_job.id, 'status', 'completed', 'attemptNumber', p_job.attempt_count)
 WHERE job_id = p_job.id;
 RETURN true;
END $$;

-- Keep the existing bounded lock selection and ordinary no-receipt timeout path.
DO $recover$
DECLARE
 body text := pg_get_functiondef('erp_private.f07_ai_worker(text,jsonb)'::regprocedure);
 timeout_line constant text := $line$   UPDATE public.dms_ai_job_attempts SET status='timed_out',completed_at=clock_timestamp(),error_code='stale_lock',safe_error_message='Worker lease expired.' WHERE job_id=j.id AND status='running';$line$;
BEGIN
 IF length(body) - length(replace(body, timeout_line, '')) <> length(timeout_line) THEN
  RAISE EXCEPTION 'Unverified F07 semantic recovery predecessor';
 END IF;
 EXECUTE replace(body, timeout_line, '   IF erp_private.f07_recover_semantic_publication(j) THEN CONTINUE; END IF;' || chr(10) || timeout_line);
END $recover$;

-- Claimed raw writes use the atomic publisher only. Unscoped inline writers retain their existing path.
CREATE FUNCTION erp_private.f07_semantic_chunk_write_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
 headers jsonb := nullif(current_setting('request.headers', true), '')::jsonb;
 publisher_required boolean;
BEGIN
 IF TG_LEVEL = 'ROW' THEN
  IF TG_OP = 'INSERT' THEN
   publisher_required := NEW.f07_source_version_id IS NOT NULL;
  ELSIF TG_OP = 'DELETE' THEN
   -- Preserve the parent document's foreign-key cascade during authorized disposal.
   IF OLD.f07_source_version_id IS NOT NULL AND pg_trigger_depth() > 1 AND NOT EXISTS (
      SELECT 1 FROM public.dms_documents d WHERE d.id = OLD.document_id
   ) THEN RETURN OLD; END IF;
   publisher_required := OLD.f07_source_version_id IS NOT NULL;
  ELSE
   IF NEW.f07_source_version_id IS DISTINCT FROM OLD.f07_source_version_id THEN
    RAISE EXCEPTION 'Queued semantic source versions are immutable' USING ERRCODE = '42501';
   END IF;
   -- The existing content FK can clear its reference during document disposal.
   IF OLD.f07_source_version_id IS NOT NULL AND pg_trigger_depth() > 1 AND NEW.content_id IS NULL AND OLD.content_id IS NOT NULL
      AND (to_jsonb(NEW) - 'content_id') = (to_jsonb(OLD) - 'content_id')
      AND NOT EXISTS (SELECT 1 FROM public.dms_document_content c WHERE c.id = OLD.content_id) THEN RETURN NEW; END IF;
   publisher_required := OLD.f07_source_version_id IS NOT NULL;
  END IF;
 ELSE
  publisher_required := TG_OP = 'TRUNCATE' OR headers ?| ARRAY['x-algt-ai-job','x-algt-ai-claim'];
 END IF;
 IF publisher_required AND (
   current_user IS DISTINCT FROM (SELECT pg_get_userbyid(p.proowner) FROM pg_proc p
      WHERE p.oid = 'erp_private.f07_semantic_index(text,jsonb)'::regprocedure)
   OR current_setting('algt.semantic_index_publisher', true) IS DISTINCT FROM ((headers->>'x-algt-ai-job') || '/' || (headers->>'x-algt-ai-claim'))
   OR (headers->>'x-algt-ai-job') IS NULL OR (headers->>'x-algt-ai-claim') IS NULL
  ) THEN
  RAISE EXCEPTION 'Use exact-claim semantic publication for queued chunk writes' USING ERRCODE = '42501';
 END IF;
 IF TG_LEVEL = 'ROW' THEN
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
 END IF;
 RETURN NULL;
END $$;
DROP TRIGGER f07_job_output_guard ON public.dms_document_content_chunks;
DROP TRIGGER f07_job_statement_guard ON public.dms_document_content_chunks;
CREATE TRIGGER f07_semantic_chunk_write_guard BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE
ON public.dms_document_content_chunks FOR EACH STATEMENT EXECUTE FUNCTION erp_private.f07_semantic_chunk_write_guard();
CREATE TRIGGER f07_semantic_chunk_version_guard BEFORE INSERT OR UPDATE OR DELETE
ON public.dms_document_content_chunks FOR EACH ROW EXECUTE FUNCTION erp_private.f07_semantic_chunk_write_guard();

REVOKE ALL ON FUNCTION erp_private.f07_semantic_active_set(bigint,bigint,bigint,text,text),
 erp_private.f07_recover_semantic_publication(public.dms_ai_job_queue), erp_private.f07_semantic_chunk_write_guard(),
 erp_private.f07_semantic_index(text,jsonb), public.f07_semantic_index(text,jsonb)
 FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION erp_private.f07_semantic_index(text,jsonb), public.f07_semantic_index(text,jsonb) TO service_role;

-- Preserve same-version last committed results and suppress superseded indexed versions.
CREATE OR REPLACE FUNCTION public.search_dms_document_chunks_by_embedding(
 p_query_embedding public.vector(1536), p_match_count integer DEFAULT 50,
 p_match_threshold double precision DEFAULT 0.2, p_is_admin boolean DEFAULT false,
 p_document_type_id bigint DEFAULT NULL
) RETURNS TABLE(chunk_id bigint,document_id bigint,document_no text,title text,chunk_index integer,
 snippet text,similarity double precision,confidentiality_level text)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
 SELECT c.id,d.id,d.document_no,d.title,c.chunk_index,left(c.chunk_text,250),
  1-(c.embedding OPERATOR(public.<=>) p_query_embedding),d.confidentiality_level
 FROM public.dms_document_content_chunks c JOIN public.dms_documents d ON d.id=c.document_id
 WHERE c.is_active AND c.deleted_at IS NULL AND c.embedding_status='complete' AND c.embedding IS NOT NULL
  AND (c.f07_source_version_id = d.current_version_id OR (c.f07_source_version_id IS NULL AND NOT EXISTS (
   SELECT 1 FROM public.dms_document_content_chunks governed
   WHERE governed.document_id = d.id AND governed.f07_source_version_id = d.current_version_id
    AND governed.is_active AND governed.deleted_at IS NULL AND governed.embedding_status = 'complete' AND governed.embedding IS NOT NULL
  )))
  AND d.deleted_at IS NULL AND erp_private.document_permission(d.id,'dms.documents.preview')
  AND (p_document_type_id IS NULL OR d.document_type_id=p_document_type_id)
  AND 1-(c.embedding OPERATOR(public.<=>) p_query_embedding)>=p_match_threshold
 ORDER BY c.embedding OPERATOR(public.<=>) p_query_embedding
 LIMIT greatest(1,least(p_match_count,100));
$$;
NOTIFY pgrst, 'reload schema';
COMMIT;
